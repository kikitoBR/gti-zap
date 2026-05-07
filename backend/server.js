require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(cors());
app.use(express.json());

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
    const phoneNumber = contact.number;
    const contactName = contact.name || contact.pushname || phoneNumber;
    
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
          last_message: msg.body,
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
          last_message: msg.body, 
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
        text: msg.body,
        status: 'delivered',
        is_incoming: true
      }]);

    console.log(`Nova mensagem de ${contactName}: ${msg.body}`);
  } catch (err) {
    console.error('Erro ao processar mensagem recebida:', err);
  }
});

client.initialize();

// API Endpoints
app.post('/send', async (req, res) => {
  const { chatId, phoneNumber, text, agentId } = req.body;
  
  if (!phoneNumber || !text) {
    return res.status(400).json({ error: 'phoneNumber e text são obrigatórios.' });
  }

  try {
    // 1. Enviar pelo WhatsApp (Adiciona @c.us ao numero se nao tiver)
    const formattedNumber = phoneNumber.includes('@c.us') ? phoneNumber : `${phoneNumber}@c.us`;
    const response = await client.sendMessage(formattedNumber, text);
    
    // 2. Salvar no Supabase
    if (chatId) {
      await supabase
        .from('messages')
        .insert([{
          chat_id: chatId,
          sender_id: agentId || 'agent',
          text: text,
          status: 'sent',
          is_incoming: false
        }]);
        
      await supabase
        .from('chats')
        .update({ last_message: text, updated_at: new Date() })
        .eq('id', chatId);
    }

    res.json({ success: true, messageId: response.id.id });
  } catch (error) {
    console.error('Erro ao enviar mensagem:', error);
    res.status(500).json({ error: 'Erro ao enviar mensagem via WhatsApp' });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Backend rodando na porta ${PORT}`);
});
