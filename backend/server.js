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
  // Ignorar status e mensagens de grupo para este MVP
  if (msg.isStatus || (msg.author || msg.from.includes('@g.us'))) return;

  try {
    const contact = await msg.getContact();
    const chat = await msg.getChat();
    const phoneNumber = chat.id._serialized; // Usa o ID canônico do Chat (LID ou C.US), garantindo que seja o mesmo ID
    const contactName = contact.name || contact.pushname || chat.name || contact.number;
    
    let profilePicUrl = null;
    try {
      profilePicUrl = await contact.getProfilePicUrl();
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
        text: msg.body || '',
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
    try { profilePicUrl = await contact.getProfilePicUrl(); } catch(e) {}
    
    const about = await contact.getAbout();

    res.json({
      name: contact.name,
      pushname: contact.pushname,
      number: contact.number,
      isOnline: contact.isOnline || false,
      about: about || '',
      profilePicUrl: profilePicUrl
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
    
    // Pega o chat canônico do WhatsApp para garantir que usamos o ID correto (evita duplicar com @lid)
    const chat = await response.getChat();
    const canonicalId = chat.id._serialized;
    
    // 2. Salvar no Supabase
    let finalChatId = chatId;
    
    if (!finalChatId) {
      // Tenta encontrar o chat existente pelo ID canônico
      let { data: chatData } = await supabase
        .from('chats')
        .select('id')
        .eq('phone_number', canonicalId)
        .single();
        
      if (chatData) {
        finalChatId = chatData.id;
      } else {
        // Cria um novo chat se não existir
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

    if (finalChatId) {
      await supabase
        .from('messages')
        .insert([{
          chat_id: finalChatId,
          sender_id: agentId || 'agent',
          whatsapp_id: response.id.id,
          text: text,
          status: 'sent',
          is_incoming: false
        }]);
        
      await supabase
        .from('chats')
        .update({ last_message: text, updated_at: new Date() })
        .eq('id', finalChatId);
    }

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
