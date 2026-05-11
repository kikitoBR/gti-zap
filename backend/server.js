require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Client, LocalAuth } = require('whatsapp-web.js');
const { GoogleGenAI } = require('@google/genai');
const qrcode = require('qrcode-terminal');
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
const multer = require('multer');

const app = express();
app.use(cors());
app.use(express.json());

// Garante que o diretório de uploads existe
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir);
}
app.use('/uploads', express.static(uploadsDir));

// Configuração do Multer para uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadsDir);
  },
  filename: function (req, file, cb) {
    const extension = path.extname(file.originalname);
    cb(null, `avatar_${Date.now()}${extension}`);
  }
});
const upload = multer({ 
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 } 
});

app.post('/upload-avatar', upload.single('avatar'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Nenhum arquivo enviado.' });
  }
  const fileUrl = `/uploads/${req.file.filename}`;
  res.json({ url: fileUrl });
});

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("ERRO: SUPABASE_URL e SUPABASE_ANON_KEY não estão definidos no .env do backend.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Cache para associar mensagens que a API está enviando ao AgentID que a enviou, 
// prevenindo duplicação e resolvendo condição de corrida.
const pendingAgentSends = new Map();

// Cache de contatos para evitar buscas pesadas repetitivas
let cachedContacts = null;
let lastContactsFetch = 0;
const CONTACTS_CACHE_TIME = 10 * 60 * 1000; // 10 minutos

// Inicializando Cliente WhatsApp com sessão persistente
const SESSION_ID = 'gtizap-main';

const client = new Client({
  authStrategy: new LocalAuth({ clientId: SESSION_ID }),
  puppeteer: {
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-extensions'
    ],
    protocolTimeout: 300000
  }
});

let isReady = false;

client.on('ready', () => {
  if (isReady) return;
  isReady = true;
  console.log('Cliente WhatsApp está pronto e conectado!');
});

// VIGIA VISUAL: Monitora se a página carregou os chats mesmo se o 'ready' não disparar
async function startVisualWatcher() {
  console.log('[Vigia] Iniciando monitoramento visual da página...');
  const check = async () => {
    if (isReady) return;

    try {
      if (client.pupPage) {
        const url = client.pupPage.url();

        // Verifica se estamos na tela de QR Code
        const isQRPage = await client.pupPage.evaluate(() => {
          return !!document.querySelector('canvas[aria-label="Scan me!"]') || !!document.querySelector('canvas');
        });

        // Verifica se já carregou os chats
        const hasChats = await client.pupPage.evaluate(() => {
          return !!document.querySelector('#pane-side') || !!document.querySelector('div[role="grid"]');
        });

        if (hasChats && !isReady) {
          console.log('[Vigia] ⚠️ Chats visíveis, mas sistema oficial dormindo. Tentando despertar...');
          
          // Se em 10 segundos a biblioteca oficial não acordar, damos um "kick" nela
          setTimeout(async () => {
            if (!isReady) {
              console.log('[Vigia] ⚡ Forçando reinicialização da sincronização...');
              try {
                // Tenta injetar um evento de clique ou scroll para acordar os listeners do WWebJS
                await client.pupPage.evaluate(() => {
                  window.scrollTo(0, 100);
                  setTimeout(() => window.scrollTo(0, 0), 100);
                });
                
                // Emite o ready oficialmente para liberar as rotas da API
                isReady = true;
                client.emit('ready');
                console.log('✅ [Vigia] Sistema DESPERTADO com sucesso.');
              } catch (e) {
                console.log('[Vigia] Erro ao tentar despertar. Tentando reload da página...');
                client.pupPage.reload();
              }
            }
          }, 8000); // 8 segundos de tolerância
        } else if (isQRPage) {
          console.log('[Vigia] 📱 Tela de QR Code detectada. Aguardando escaneamento...');
        } else if (url && url.includes('web.whatsapp.com')) {
          console.log(`[Vigia] ⏳ Aguardando carregamento... (Página atual: ${url.slice(0, 30)}...)`);
        }
      } else {
        console.log('[Vigia] ❌ Navegador ainda não foi criado...');
      }
    } catch (e) {
      // Silencioso se o contexto estiver mudando
    }

    if (!isReady) setTimeout(check, 5000);
  };
  check();
}

client.on('qr', (qr) => {
  console.log('Escaneie o QR Code abaixo com o seu WhatsApp:');
  qrcode.generate(qr, { small: true });
});

client.on('message', async (msg) => {
  // Ignorar apenas status
  if (msg.isStatus) return;

  // LOG DE DEBUG PARA TODAS AS MENSAGENS QUE CHEGAM
  console.log(`[DEBUG] Mensagem recebida: tipo=${msg.type}, body=${msg.body?.slice(0, 50)}, hasMedia=${msg.hasMedia}, hasQuoted=${msg.hasQuotedMsg}`);

  // Ignorar apenas mensagens de sistema que realmente não têm conteúdo útil
  const ignoreTypes = ['notification_template', 'call_log', 'gp2', 'vcard', 'multi_vcard', 'ciphertext', 'revoked', 'protocol'];
  if (ignoreTypes.includes(msg.type) || (!msg.body && !msg.hasMedia && !msg.hasQuotedMsg)) {
    console.log('[Sistema] Mensagem ignorada por falta de conteúdo ou tipo de sistema:', msg.type);
    return;
  }

  try {
    const contact = await msg.getContact();
    const chat = await msg.getChat();
    const phoneNumber = chat.id._serialized; // Usa o ID canônico do Chat (LID, C.US ou G.US)

    // Se for grupo, o contactName deve ser o nome do grupo
    const contactName = chat.isGroup ? chat.name : (contact.name || contact.pushname || chat.name || contact.number);

    let profilePicUrl = null;
    try {
      profilePicUrl = await client.getProfilePicUrl(phoneNumber);
    } catch (err) {
      console.log('Sem foto de perfil para', phoneNumber);
    }

    let mediaUrl = null;
    let mediaType = null;
    let lastMessageText = msg.body || '📷 Mídia recebida';

    if (msg.hasMedia) {
      try {
        const media = await msg.downloadMedia();
        if (media) {
          const extension = media.mimetype.split('/')[1]?.split(';')[0] || 'bin';
          const filename = `${Date.now()}_${msg.id.id}.${extension}`;
          const uploadPath = path.join(__dirname, 'uploads', filename);
          fs.writeFileSync(uploadPath, media.data, 'base64');
          mediaUrl = `/uploads/${filename}`;
          mediaType = media.mimetype;
        }
      } catch (error) {
        console.error('Erro ao baixar mídia:', error);
      }
    }

    let textToSave = msg.body || '';

    // EXTRAÇÃO DE REPLY (MENSAGEM RESPONDIDA)
    let replyPart = '';
    if (msg.hasQuotedMsg) {
      try {
        const quoted = await msg.getQuotedMessage();
        const quotedSender = await quoted.getContact();
        const quotedName = quotedSender.name || quotedSender.pushname || quotedSender.number;
        let quotedBody = quoted.body || '';
        if (quoted.hasMedia && !quotedBody) {
          if (quoted.type === 'image') quotedBody = '📷 Foto';
          else if (quoted.type === 'video') quotedBody = '🎥 Vídeo';
          else if (quoted.type === 'audio' || quoted.type === 'ptt') quotedBody = '🎵 Áudio';
          else quotedBody = '📄 Arquivo';
        }

        let quotedMediaUrl = null;
        try {
          const media = await quoted.downloadMedia();
          if (media) {
            const extension = media.mimetype.split('/')[1]?.split(';')[0] || 'bin';
            const filename = `thumb_${Date.now()}_${quoted.id.id}.${extension}`;
            const uploadPath = path.join(__dirname, 'uploads', filename);
            fs.writeFileSync(uploadPath, media.data, 'base64');
            quotedMediaUrl = `/uploads/${filename}`;
          }
        } catch (e) { }

        const replyMeta = {
          author: quotedName,
          body: quotedBody || '...',
          isMe: quoted.fromMe,
          whatsappId: quoted.id.id,
          mediaUrl: quotedMediaUrl
        };
        replyPart = `[REPLY]${JSON.stringify(replyMeta)}[/REPLY]\n`;
      } catch (e) { }
    }

    // Preparar metadados do remetente
    let senderProfilePic = null;
    try { senderProfilePic = await contact.getProfilePicUrl(); } catch (e) { }
    const senderMeta = {
      name: contact.name,
      pushname: contact.pushname,
      number: contact.id ? contact.id._serialized : contact.number,
      pic: senderProfilePic
    };
    const metaStr = `[META]${JSON.stringify(senderMeta)}[/META]\n`;

    textToSave = msg.body || '';
    if (chat.isGroup) {
      const senderName = contact.name || contact.pushname || contact.number;
      if (msg.body) {
        textToSave = `${senderName}:\n${msg.body}`;
      } else if (msg.hasMedia) {
        let typeName = 'Mídia';
        if (mediaType?.startsWith('audio/')) typeName = 'Áudio';
        if (mediaType?.startsWith('image/')) typeName = 'Foto';
        if (mediaType?.startsWith('video/')) typeName = 'Vídeo';
        lastMessageText = `~${senderName}: 📷 ${typeName}`;
        textToSave = '';
      }
    }

    // MONTAGEM FINAL: REPLY + META + TEXTO
    textToSave = replyPart + metaStr + textToSave;
    console.log(`[DEBUG] Texto final para DB: ${textToSave.slice(0, 50)}...`);

    // 1. Verificar se o chat existe no Supabase
    let { data: chatData, error: chatError } = await supabase
      .from('chats')
      .select('*')
      .eq('phone_number', phoneNumber)
      .single();

    let chatId;

    if (!chatData) {
      // 2. Se não existe, cria um novo chat
      const { data: newChat, error: newChatError } = await supabase
        .from('chats')
        .insert([{
          phone_number: phoneNumber,
          contact_name: contactName,
          profile_pic_url: profilePicUrl,
          last_message: lastMessageText,
          unread_count: 1,
          updated_at: new Date()
        }])
        .select()
        .single();

      if (newChatError) throw newChatError;
      chatId = newChat.id;
    } else {
      // 3. Atualiza o chat existente
      chatId = chatData.id;
      await supabase
        .from('chats')
        .update({
          contact_name: contactName,
          profile_pic_url: profilePicUrl,
          last_message: lastMessageText,
          unread_count: (chatData.unread_count || 0) + 1,
          updated_at: new Date()
        })
        .eq('id', chatId);
    }

    // 4. Salvar a mensagem
    await supabase
      .from('messages')
      .insert([{
        chat_id: chatId,
        sender_id: 'client',
        whatsapp_id: msg.id.id,
        text: textToSave,
        media_url: mediaUrl,
        media_type: mediaType,
        status: 'delivered',
        is_incoming: true
      }]);

    console.log(`Nova mensagem de ${contactName}: ${lastMessageText}`);
  } catch (err) {
    console.error('Erro ao processar mensagem recebida:', err);
  }
});

client.on('message_create', async (msg) => {
  // Log puro para ver se o evento foi disparado
  // Log detalhado para mensagens enviadas por você (incluindo replies)
  if (msg.fromMe) {
    console.log(`[DEBUG] message_create disparado: tipo=${msg.type}, hasQuoted=${msg.hasQuotedMsg}, body=${msg.body?.slice(0, 50)}`);
  }

  // Ignorar mensagens que não foram enviadas pelo app oficial (recebidas já vão pro 'message')
  if (!msg.fromMe) return;

  // Ignorar status e mensagens invisíveis
  if (msg.isStatus) return;
  if (!msg.body && !msg.hasMedia) return;

  try {
    // 1. Verifica se já existe (não duplicar o que a nossa própria API de envio enviou)
    const { data: existingMsg } = await supabase
      .from('messages')
      .select('id')
      .eq('whatsapp_id', msg.id.id)
      .single();

    if (existingMsg) return;

    const chat = await msg.getChat();
    const phoneNumber = chat.id._serialized;

    // Como a mensagem fomos nós que enviamos (fromMe), msg.getContact() traria nosso próprio perfil.
    // Precisamos buscar o contato da pessoa com quem estamos conversando (o destinatário / chat).
    const recipientContact = await client.getContactById(phoneNumber);

    // Se for grupo, o contactName deve ser o nome do grupo
    const contactName = chat.isGroup ? chat.name : (recipientContact.name || recipientContact.pushname || chat.name || recipientContact.number);

    let profilePicUrl = null;
    try {
      profilePicUrl = await client.getProfilePicUrl(phoneNumber);
    } catch (err) { }

    let mediaUrl = null;
    let mediaType = null;
    let lastMessageText = msg.body || '📷 Mídia enviada';

    if (msg.hasMedia) {
      try {
        const media = await msg.downloadMedia();
        if (media) {
          const extension = media.mimetype.split('/')[1]?.split(';')[0] || 'bin';
          const filename = `${Date.now()}_${msg.id.id}.${extension}`;
          const uploadPath = path.join(__dirname, 'uploads', filename);
          fs.writeFileSync(uploadPath, media.data, 'base64');
          mediaUrl = `/uploads/${filename}`;
          mediaType = media.mimetype;
        }
      } catch (error) {
        console.error('Erro ao baixar mídia do message_create:', error);
      }
    }

    // EXTRAÇÃO DE REPLY PARA MENSAGENS ENVIADAS (CREATE)
    let replyPart = '';
    if (msg.hasQuotedMsg) {
      try {
        const quoted = await msg.getQuotedMessage();
        const quotedSender = await quoted.getContact();
        const quotedName = quotedSender.name || quotedSender.pushname || quotedSender.number;
        let quotedBody = quoted.body || '';
        if (quoted.hasMedia && !quotedBody) {
          if (quoted.type === 'image') quotedBody = '📷 Foto';
          else if (quoted.type === 'video') quotedBody = '🎥 Vídeo';
          else if (quoted.type === 'audio' || quoted.type === 'ptt') quotedBody = '🎵 Áudio';
          else quotedBody = '📄 Arquivo';
        }

        let quotedMediaUrl = null;
        try {
          const media = await quoted.downloadMedia();
          if (media) {
            const extension = media.mimetype.split('/')[1]?.split(';')[0] || 'bin';
            const filename = `thumb_${Date.now()}_${quoted.id.id}.${extension}`;
            const uploadPath = path.join(__dirname, 'uploads', filename);
            fs.writeFileSync(uploadPath, media.data, 'base64');
            quotedMediaUrl = `/uploads/${filename}`;
          }
        } catch (e) { }

        const replyMeta = {
          author: quotedName,
          body: quotedBody || '...',
          isMe: quoted.fromMe,
          whatsappId: quoted.id.id,
          mediaUrl: quotedMediaUrl
        };
        replyPart = `[REPLY]${JSON.stringify(replyMeta)}[/REPLY]\n`;
      } catch (e) { }
    }

    // Preparar metadados para message_create (somos nós enviando)
    const senderMeta = {
      name: 'Você',
      pushname: '',
      number: '',
      pic: ''
    };
    const metaStr = `[META]${JSON.stringify(senderMeta)}[/META]\n`;

    let textToSave = msg.body || '';
    
    // MONTAGEM FINAL
    textToSave = replyPart + metaStr + textToSave;
    console.log(`[DEBUG] message_create final text: ${textToSave.slice(0, 50)}...`);

    // 2. Verificar se o chat existe
    let { data: chatData } = await supabase
      .from('chats')
      .select('*')
      .eq('phone_number', phoneNumber)
      .single();

    let chatId;

    if (!chatData) {
      const { data: newChat } = await supabase
        .from('chats')
        .insert([{
          phone_number: phoneNumber,
          contact_name: contactName,
          profile_pic_url: profilePicUrl,
          last_message: lastMessageText,
          unread_count: 0,
          updated_at: new Date()
        }])
        .select()
        .single();

      if (newChat) chatId = newChat.id;
    } else {
      chatId = chatData.id;
      await supabase
        .from('chats')
        .update({
          contact_name: contactName,
          profile_pic_url: profilePicUrl,
          last_message: lastMessageText,
          updated_at: new Date()
        })
        .eq('id', chatId);
    }

    // 3. Salvar a mensagem
    if (chatId) {
      // Verifica se temos um agentId pendente para esta mensagem
      const tempKey = `${phoneNumber}:${msg.body || ''}`;
      let senderId = 'phone'; // Padrão: enviado fisicamente pelo celular
      if (pendingAgentSends.has(tempKey)) {
        senderId = pendingAgentSends.get(tempKey);
        pendingAgentSends.delete(tempKey); // Limpa do cache
      }

      await supabase
        .from('messages')
        .insert([{
          chat_id: chatId,
          sender_id: senderId,
          whatsapp_id: msg.id.id,
          text: textToSave,
          media_url: mediaUrl,
          media_type: mediaType,
          status: 'sent',
          is_incoming: false
        }]);
      console.log(`Nova mensagem síncrona enviada para ${contactName}`);
    }
  } catch (err) {
    console.error('Erro ao processar message_create:', err);
  }
});

client.on('message_ack', async (msg, ack) => {
  // ack values:
  // 0 = pending/error
  // 1 = sent
  // 2 = delivered
  // 3 = read
  // 4 = played

  let status = 'pending';
  if (ack === 1) status = 'sent';
  else if (ack === 2) status = 'delivered';
  else if (ack === 3 || ack === 4) status = 'read';

  if (msg.id && msg.id.id) {
    await supabase
      .from('messages')
      .update({ status })
      .eq('whatsapp_id', msg.id.id);
  }
});

// API Endpoints

app.get('/contact/:phone', async (req, res) => {
  try {
    const phoneNumber = req.params.phone;
    const formattedNumber = phoneNumber.includes('@') ? phoneNumber : `${phoneNumber}@c.us`;
    const contact = await client.getContactById(formattedNumber);
    if (!contact) return res.status(404).json({ error: 'Contato não encontrado' });

    let profilePicUrl = null;
    try { profilePicUrl = await client.getProfilePicUrl(formattedNumber); } catch (e) { }

    let about = '';
    try { about = await contact.getAbout(); } catch (e) { }

    let resolvedNumber = contact.number;
    console.log(`Buscando dados para: ${formattedNumber}. Número original: ${contact.number}`);

    if (formattedNumber.includes('@lid')) {
      try {
        const resolved = await client.getContactLidAndPhone([formattedNumber]);
        console.log(`Resultado getContactLidAndPhone para ${formattedNumber}:`, resolved);
        if (resolved && resolved.length > 0 && resolved[0].pn) {
          resolvedNumber = resolved[0].pn;
          console.log(`LID resolvido com sucesso para PN: ${resolvedNumber}`);
        } else {
          // Se não resolveu via API oficial, checa se o número do contato já não é o PN
          if (contact.number && !contact.number.includes('lid') && contact.number.length < 15) {
            resolvedNumber = contact.number;
          }
        }
      } catch (e) { console.error('Erro ao resolver LID:', e); }
    }

    let groupData = null;
    if (formattedNumber.includes('@g.us')) {
      try {
        const chat = await client.getChatById(formattedNumber);
        if (chat.isGroup) {
          const participants = [];
          for (let p of chat.participants) {
            try {
              const pContact = await client.getContactById(p.id._serialized);
              let pNumber = pContact.number;
              if (p.id._serialized.includes('@lid')) {
                try {
                  const pResolved = await client.getContactLidAndPhone([p.id._serialized]);
                  if (pResolved && pResolved.length > 0 && pResolved[0].pn) {
                    pNumber = pResolved[0].pn;
                  }
                } catch (e) { }
              }

              participants.push({
                id: p.id._serialized,
                number: pNumber,
                name: pContact.name || pContact.pushname || pNumber,
                isAdmin: p.isAdmin,
                isSuperAdmin: p.isSuperAdmin
              });
            } catch (e) { }
          }
          groupData = {
            description: chat.description || '',
            owner: chat.owner?._serialized || '',
            participants: participants
          };
        }
      } catch (e) { console.error('Erro ao buscar dados do grupo:', e); }
    }

    res.json({
      name: contact.name,
      pushname: contact.pushname,
      number: resolvedNumber ? resolvedNumber.replace(/@c\.us$/, '') : '',
      isOnline: contact.isOnline || false,
      about: about || '',
      profilePicUrl: profilePicUrl,
      groupData: groupData
    });
  } catch (err) {
    console.error('Erro ao buscar contato:', err);
    res.status(500).json({ error: 'Erro ao buscar contato' });
  }
});

// Rota para listar contatos do WhatsApp
app.get('/contacts', async (req, res) => {
  try {
    // Retorna cache se for recente (menos de 10 min)
    if (cachedContacts && (Date.now() - lastContactsFetch < CONTACTS_CACHE_TIME)) {
      console.log('Retornando contatos do cache backend');
      return res.json(cachedContacts);
    }

    console.log('Buscando lista de contatos do WhatsApp...');

    // Tenta pegar todos os contatos com um timeout de segurança interno
    let contactsList = [];
    try {
      if (!client.pupPage || client.pupPage.isClosed()) {
        throw new Error('Navegador do WhatsApp não está pronto');
      }

      contactsList = await Promise.race([
        client.getContacts(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout getContacts')), 45000))
      ]);
    } catch (e) {
      console.warn('Falha ao buscar contatos (Navegador pode estar ocupado), tentando via getChats...', e.message);
      try {
        const chats = await client.getChats();
        const contactPromises = chats
          .filter(chat => !chat.isGroup)
          .map(chat => chat.getContact().catch(() => null));
        const resolvedContacts = await Promise.all(contactPromises);
        contactsList = resolvedContacts.filter(c => c !== null);
      } catch (innerErr) {
        console.error('Erro total ao buscar contatos/chats:', innerErr);
        return res.status(503).json({ error: 'WhatsApp ocupado. Tente novamente em instantes.' });
      }
    }

    const filtered = contactsList
      .filter(c => {
        if (!c || !c.id || !c.id._serialized) return false;
        if (c.isGroup) return false;
        if (c.isMe) return false;
        if (!c.name && !c.pushname && !c.number) return false;
        return true;
      })
      .map(c => ({
        id: c.id._serialized,
        name: c.name || c.pushname || c.number || 'Sem nome',
        number: c.number || '',
        pushname: c.pushname || ''
      }))
      // Remove duplicados por ID e ordena
      .filter((v, i, a) => a.findIndex(t => t.id === v.id) === i)
      .sort((a, b) => a.name.localeCompare(b.name));

    // Salva no cache
    cachedContacts = filtered;
    lastContactsFetch = Date.now();

    console.log(`Contatos filtrados e prontos: ${filtered.length}`);
    res.json(filtered);
  } catch (err) {
    console.error('Erro crítico ao listar contatos:', err);
    res.status(500).json({ error: 'Erro ao listar contatos' });
  }
});

// Rota para enviar um contato (vCard) via WhatsApp
app.post('/send-contact', async (req, res) => {
  const { chatId, phoneNumber, agentId, contactId } = req.body;

  if (!phoneNumber || !contactId) {
    return res.status(400).json({ error: 'phoneNumber e contactId são obrigatórios.' });
  }

  try {
    const contact = await client.getContactById(contactId);

    let formattedNumber = phoneNumber;
    if (!formattedNumber.includes('@')) {
      formattedNumber = `${formattedNumber}@c.us`;
    }

    // Enviar o contato como vCard
    await client.sendMessage(formattedNumber, contact);

    res.json({ success: true });
  } catch (error) {
    console.error('Erro ao enviar contato:', error);
    res.status(500).json({ error: 'Erro ao enviar contato via WhatsApp' });
  }
});

// Rota para enviar mídia (documento, foto, vídeo, áudio)
app.post('/send-media', upload.single('media'), async (req, res) => {
  const { chatId, phoneNumber, agentId, caption } = req.body;

  if (!phoneNumber || !req.file) {
    return res.status(400).json({ error: 'phoneNumber e arquivo são obrigatórios.' });
  }

  try {
    const { MessageMedia } = require('whatsapp-web.js');

    // Ler o arquivo e criar um MessageMedia
    const filePath = path.join(uploadsDir, req.file.filename);
    const fileData = fs.readFileSync(filePath);
    const base64Data = fileData.toString('base64');
    const media = new MessageMedia(req.file.mimetype, base64Data, req.file.originalname);

    let formattedNumber = phoneNumber;
    if (!formattedNumber.includes('@')) {
      formattedNumber = `${formattedNumber}@c.us`;
    }

    const options = {};
    if (caption) options.caption = caption;

    // Enviar como documento se não for imagem/vídeo/áudio
    const isDocument = !req.file.mimetype.startsWith('image/') &&
      !req.file.mimetype.startsWith('video/') &&
      !req.file.mimetype.startsWith('audio/');
    if (isDocument) {
      options.sendMediaAsDocument = true;
    }

    const response = await client.sendMessage(formattedNumber, media, options);

    const chat = await response.getChat();
    const canonicalId = chat.id._serialized;

    // Adiciona ao cache
    const tempKey = `${canonicalId}:${caption || '📎 Arquivo'}`;
    pendingAgentSends.set(tempKey, agentId || 'agent');
    setTimeout(() => pendingAgentSends.delete(tempKey), 15000);

    let finalChatId = chatId;
    if (!finalChatId) {
      let { data: chatData } = await supabase
        .from('chats')
        .select('id')
        .eq('phone_number', canonicalId)
        .single();

      if (chatData) {
        finalChatId = chatData.id;
      } else {
        const { data: newChat } = await supabase
          .from('chats')
          .insert([{
            phone_number: canonicalId,
            contact_name: phoneNumber,
            last_message: caption || '📎 Arquivo',
            unread_count: 0,
            assigned_to: agentId,
            updated_at: new Date()
          }])
          .select()
          .single();

        if (newChat) finalChatId = newChat.id;
      }
    }

    res.json({ success: true, messageId: response.id.id, chatId: finalChatId });
  } catch (error) {
    console.error('Erro ao enviar mídia:', error);
    res.status(500).json({ error: 'Erro ao enviar mídia via WhatsApp' });
  }
});

app.post('/send', async (req, res) => {
  const { chatId, phoneNumber, text, agentId } = req.body;

  if (!phoneNumber || !text) {
    return res.status(400).json({ error: 'phoneNumber e text são obrigatórios.' });
  }

  try {
    // 1. Enviar pelo WhatsApp
    let formattedNumber = phoneNumber;
    if (!formattedNumber.includes('@')) {
      formattedNumber = `${formattedNumber}@c.us`;
    }

    const response = await client.sendMessage(formattedNumber, text);

    // Pega o chat canônico do WhatsApp para garantir que usamos o ID correto
    const chat = await response.getChat();
    const canonicalId = chat.id._serialized;

    // Adiciona ao cache para que o evento message_create pegue o agentId
    const tempKey = `${canonicalId}:${text}`;
    pendingAgentSends.set(tempKey, agentId || 'agent');
    // Limpa o cache após 15 segundos caso o message_create falhe
    setTimeout(() => pendingAgentSends.delete(tempKey), 15000);

    // 2. Criar ou buscar o chat no Supabase (apenas para retornar o ID pro front navegar caso seja novo chat)
    let finalChatId = chatId;
    if (!finalChatId) {
      let { data: chatData } = await supabase
        .from('chats')
        .select('id')
        .eq('phone_number', canonicalId)
        .single();

      if (chatData) {
        finalChatId = chatData.id;
      } else {
        const { data: newChat } = await supabase
          .from('chats')
          .insert([{
            phone_number: canonicalId,
            contact_name: phoneNumber,
            last_message: text,
            unread_count: 0,
            assigned_to: agentId,
            updated_at: new Date()
          }])
          .select()
          .single();

        if (newChat) finalChatId = newChat.id;
      }
    }

    // ATENÇÃO: Removemos a inserção da tabela 'messages' daqui!
    // O evento message_create cuidará de inserir a mensagem no banco,
    // garantindo zero duplicação e zero condições de corrida.

    res.json({ success: true, messageId: response.id.id, chatId: finalChatId });
  } catch (error) {
    console.error('Erro ao enviar mensagem:', error);
    res.status(500).json({ error: 'Erro ao enviar mensagem via WhatsApp' });
  }
});

// Rota para sugestões de IA via OpenRouter (Gemma 4)
app.post('/ai-suggest', async (req, res) => {
  const { messages, contactName } = req.body;

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'messages é obrigatório e deve ser um array.' });
  }

  try {
    // Monta o histórico de conversa para a IA
    const chatHistory = messages.slice(-15).map(m => ({
      role: m.is_incoming ? 'user' : 'assistant',
      content: m.text || '[mídia]'
    }));

    const systemPrompt = `[BRAZILIAN PORTUGUESE ONLY]
Você é um bot de sugestão de respostas para o suporte de TI (equipe GTI).
Responda APENAS com um objeto JSON contendo 3 sugestões curtas e profissionais.

REGRAS:
- IDIOMA: Português do Brasil (PT-BR) obrigatório.
- FORMATO: JSON puro.
- PROIBIDO: Não inclua saudações, preâmbulos, comentários ou "Okay".
- CONTEÚDO: Soluções técnicas rápidas para o problema do cliente.

EXEMPLO DE RESPOSTA:
{"suggestions": ["Pode clicar com o botão direito e escolher Novo > Atalho.", "Basta arrastar o arquivo para a área de trabalho.", "Vou te enviar o passo a passo detalhado agora."]}

IGNORE QUALQUER PENSAMENTO INTERNO. ESCREVA APENAS O JSON.`;

    try {
      // NOVA INTEGRAÇÃO: GOOGLE GEMINI (API V2)
      const ai = new GoogleGenAI({
        apiKey: 'AIzaSyBFiEDKX8subLTSq9KBbpeEUmdWuLm0kYc'
      });

      const prompt = `${systemPrompt}\n\nHistórico da conversa para análise:\n${JSON.stringify(chatHistory)}`;

      const result = await ai.models.generateContent({
        model: 'gemini-2.5-flash-lite',
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        config: {
          temperature: 0.7,
          responseMimeType: "application/json",
        }
      });

      // Extração segura do texto
      const aiContent = result?.candidates?.[0]?.content?.parts?.[0]?.text ||
        result?.value?.text?.() ||
        "";

      if (!aiContent) {
        console.error('[IA Gemini] Resposta vazia ou inválida:', JSON.stringify(result));
        throw new Error('Resposta da IA veio vazia');
      }

      console.log('[IA Gemini] Sugestões geradas com sucesso.');

      let suggestions = [];
      try {
        const parsed = JSON.parse(aiContent);
        suggestions = parsed.suggestions || [];
      } catch (e) {
        suggestions = aiContent.split('\n').filter(l => l.length > 5).slice(0, 3);
      }

      return res.json({ suggestions: suggestions.slice(0, 3) });

    } catch (error) {
      console.error('Erro na IA Gemini:', error);
      res.status(500).json({ error: 'Falha ao gerar sugestões com Gemini' });
    }
  } catch (err) {
    console.error('Erro crítico na rota de IA:', err);
    res.status(500).json({ error: 'Erro interno no servidor de IA' });
  }
});

/* 
  =============================================================================
  GUIA DE DESPERTAR: OPENROUTER (HIBERNADO)
  =============================================================================
  Para voltar a usar o OpenRouter no futuro:
  1. Comente o bloco "NOVA INTEGRAÇÃO: GOOGLE GEMINI" acima.
  2. Restaure o loop "for (const model of models)" que usava a URL da OpenRouter.
  3. Verifique se a chave 'sk-or-v1-...' ainda é válida.
  =============================================================================
*/

// Verificador de inatividade: Desvincula chats após 20 minutos sem novas mensagens ou ações
const INACTIVITY_THRESHOLD_MINUTES = 20;

async function checkInactivity() {
  try {
    const thresholdDate = new Date(Date.now() - INACTIVITY_THRESHOLD_MINUTES * 60 * 1000);

    // Busca chats que estão atribuídos e que não tiveram atualização recente
    const { data: inactiveChats, error } = await supabase
      .from('chats')
      .select('id, phone_number, assigned_to')
      .not('assigned_to', 'is', null)
      .lt('updated_at', thresholdDate.toISOString());

    if (error) throw error;

    if (inactiveChats && inactiveChats.length > 0) {
      console.log(`[INATIVIDADE] Encontrados ${inactiveChats.length} chats inativos. Desvinculando...`);

      for (const chat of inactiveChats) {
        await supabase
          .from('chats')
          .update({
            assigned_to: null,
            updated_at: new Date() // Atualiza o timestamp para não pegar em loop (embora assigned_to null já filtre)
          })
          .eq('id', chat.id);

        console.log(`[INATIVIDADE] Chat ${chat.phone_number} desvinculado por inatividade.`);
      }
    }
  } catch (err) {
    console.error('Erro ao verificar inatividade:', err);
  }
}

// Executa a cada 5 minutos
setInterval(checkInactivity, 5 * 60 * 1000);

// Gerenciador de erros para Multer e outros
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'O arquivo é muito grande. O limite é de 5MB.' });
    }
    return res.status(400).json({ error: `Erro no upload: ${err.message}` });
  }
  next(err);
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, async () => {
  console.log(`Backend rodando na porta ${PORT}`);

  // LIMPEZA INTELIGENTE: Tenta matar processos de Chrome órfãos do Puppeteer no Windows
  try {
    const { exec } = require('child_process');
    // Este comando mata apenas Chromes que foram abertos via linha de comando (comum no Puppeteer)
    exec('wmic process where "name=\'chrome.exe\' and CommandLine like \'%--user-data-dir%\'" delete', (err) => {
      if (!err) console.log('[Sistema] Processos antigos limpos com sucesso.');
    });
  } catch (e) {
    // Silencioso se falhar
  }

  console.log('Inicializando WhatsApp...');
  const init = async () => {
    try {
      console.log(`[Sistema] Tentando iniciar com ID: ${SESSION_ID}`);
      await client.initialize();
    } catch (err) {
      console.error('[Sistema] Erro na inicialização:', err.message);

      // Se o erro for de frame ou navegação, tentamos fechar o que sobrou
      try {
        if (client.pupBrowser) await client.pupBrowser.close();
      } catch (e) { }

      if (!isReady) {
        console.log('[Sistema] Reiniciando em 10 segundos...');
        setTimeout(init, 10000);
      }
    }
  };

  init();
  startVisualWatcher();
});
