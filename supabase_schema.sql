-- ==========================================
-- SUPABASE SCHEMA - WHATSAPP MULTI-AGENT
-- ==========================================

-- 1. Criação da tabela de Atendentes (Users)
-- Esta tabela se relaciona com a auth.users do Supabase
CREATE TABLE public.users (
  id UUID REFERENCES auth.users(id) PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  status TEXT DEFAULT 'offline',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Gatilho para criar o usuário automaticamente ao se registrar via Supabase Auth
CREATE OR REPLACE FUNCTION public.handle_new_user() 
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, name, email)
  VALUES (new.id, COALESCE(new.raw_user_meta_data->>'name', new.email), new.email);
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- 2. Criação da tabela de Chats (Conversas)
CREATE TABLE public.chats (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  phone_number TEXT NOT NULL UNIQUE,
  contact_name TEXT,
  last_message TEXT,
  unread_count INTEGER DEFAULT 0,
  assigned_to UUID REFERENCES public.users(id),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. Criação da tabela de Mensagens
CREATE TABLE public.messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  chat_id UUID REFERENCES public.chats(id) ON DELETE CASCADE,
  sender_id TEXT NOT NULL, -- Pode ser 'client' ou o ID do agent
  text TEXT NOT NULL,
  status TEXT DEFAULT 'sent', -- pending, sent, delivered, read
  is_incoming BOOLEAN DEFAULT false,
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 4. Habilitar o Row Level Security (RLS)
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- 5. Políticas de Acesso (Para o MVP, permitiremos que atendentes logados leiam/escrevam tudo)
CREATE POLICY "Permitir leitura/escrita de usuarios" ON public.users FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Permitir leitura/escrita de chats" ON public.chats FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Permitir leitura/escrita de messages" ON public.messages FOR ALL USING (auth.role() = 'authenticated');

-- 6. Políticas de Acesso Público para o Backend Node (via anon key ou service_role)
-- Como o backend node usará a supabase-js, ele precisa conseguir escrever as mensagens que chegam do WhatsApp
CREATE POLICY "Permitir insercao anonima pelo backend" ON public.chats FOR ALL USING (true);
CREATE POLICY "Permitir insercao anonima pelo backend em messages" ON public.messages FOR ALL USING (true);

-- 7. Ativar Realtime para Chats e Messages
ALTER PUBLICATION supabase_realtime ADD TABLE public.chats;
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.users;
