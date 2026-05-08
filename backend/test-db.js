require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const { data: chats, error } = await supabase.from('chats').select('*');
  if (error) {
    console.error('Error fetching chats:', error);
  } else {
    console.log('Chats:', JSON.stringify(chats, null, 2));
  }
}
run();
