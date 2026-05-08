require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

// Garante que o diretório de uploads existe
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir);
}
app.use('/uploads', express.static(uploadsDir));

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

// Inicializando Cliente WhatsApp
const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: {
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  }
});

client.on('qr', (qr) => {
  console.log('Escaneie o QR Code abaixo com o seu WhatsApp:');
  qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
  console.log('Cliente WhatsApp está pronto e conectado!');
});

client.on('message', async (msg) => {
  // Ignorar apenas status
  if (msg.isStatus) return;

  // Ignorar mensagens de sistema invisíveis (sem corpo de texto e sem mídia)
  if (!msg.body && !msg.hasMedia) {
    console.log('Mensagem de sistema ignorada:', msg.type);
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
    } catch(err) {
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
    
    // Preparar metadados do remetente
    let senderProfilePic = null;
    try { senderProfilePic = await contact.getProfilePicUrl(); } catch(e) {}
    const senderMeta = {
      name: contact.name,
      pushname: contact.pushname,
      number: contact.id ? contact.id._serialized : contact.number,
      pic: senderProfilePic
    };
    const metaStr = `[META]${JSON.stringify(senderMeta)}[/META]\n`;

    if (chat.isGroup) {
      const senderName = contact.name || contact.pushname || contact.number;
      if (msg.body) {
        textToSave = `${metaStr}~${senderName}:\n${msg.body}`;
      } else if (msg.hasMedia) {
        let typeName = 'Mídia';
        if (mediaType?.startsWith('audio/')) typeName = 'Áudio';
        if (mediaType?.startsWith('image/')) typeName = 'Foto';
        if (mediaType?.startsWith('video/')) typeName = 'Vídeo';
        lastMessageText = `~${senderName}: 📷 ${typeName}`;
        textToSave = metaStr;
      }
    } else {
      if (msg.hasMedia) {
         if (textToSave) textToSave = metaStr + textToSave;
         else textToSave = metaStr;
      }
    }

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
          unread_count: 1
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
  if (msg.fromMe) {
    console.log(`[DEBUG] message_create disparado (fromMe=true): ${msg.body}`);
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
    } catch(err) {}
    
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

    let textToSave = msg.body || '';
    
    // Preparar metadados para message_create (somos nós enviando)
    const senderMeta = {
      name: 'Você',
      pushname: '',
      number: '',
      pic: '' // Deixar a UI do frontend lidar com o avatar do próprio usuário ou placeholder
    };
    const metaStr = `[META]${JSON.stringify(senderMeta)}[/META]\n`;

    if (msg.hasMedia) {
       if (textToSave) textToSave = metaStr + textToSave;
       else textToSave = metaStr;
    }

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
          unread_count: 0
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
      const tempKey = `${phoneNumber}:${textToSave}`;
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

client.initialize();

// API Endpoints

app.get('/contact/:phone', async (req, res) => {
  try {
    const phoneNumber = req.params.phone;
    const formattedNumber = phoneNumber.includes('@') ? phoneNumber : `${phoneNumber}@c.us`;
    const contact = await client.getContactById(formattedNumber);
    if (!contact) return res.status(404).json({ error: 'Contato não encontrado' });
    
    let profilePicUrl = null;
    try { profilePicUrl = await client.getProfilePicUrl(formattedNumber); } catch(e) {}
    
    let about = '';
    try { about = await contact.getAbout(); } catch(e) {}

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
                } catch(e) {}
              }
              
              participants.push({
                id: p.id._serialized,
                number: pNumber,
                name: pContact.name || pContact.pushname || pNumber,
                isAdmin: p.isAdmin,
                isSuperAdmin: p.isSuperAdmin
              });
            } catch(e) {}
          }
          groupData = {
            description: chat.description || '',
            owner: chat.owner?._serialized || '',
            participants: participants
          };
        }
      } catch(e) { console.error('Erro ao buscar dados do grupo:', e); }
    }

    res.json({
      name: contact.name,
      pushname: contact.pushname,
      number: resolvedNumber,
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
            assigned_to: agentId
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

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Backend rodando na porta ${PORT}`);
});
