require('dotenv').config();
const { Client, LocalAuth } = require('whatsapp-web.js');

const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: { headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] }
});

client.on('ready', async () => {
  console.log('Client is ready!');
  try {
    const number = '5522996131089@c.us';
    console.log('getNumberId for', number);
    const numberId = await client.getNumberId(number);
    console.log('numberId:', numberId);
    
    if (numberId) {
       const contact = await client.getContactById(numberId._serialized);
       console.log('contact.id:', contact.id);
       console.log('contact.number:', contact.number);
    }
    
    // Also try to get LID info directly
    const lid = '184705152467183@lid';
    const contactLid = await client.getContactById(lid);
    console.log('LID contact.id:', contactLid.id);
    console.log('LID contact.number:', contactLid.number);

  } catch (err) {
    console.error('Error:', err);
  }
  process.exit(0);
});

client.initialize();
