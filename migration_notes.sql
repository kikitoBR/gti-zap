-- ==========================================
-- MIGRAÇÃO: Tabela de Anotações Internas
-- Execute este SQL no Editor SQL do Supabase
-- ==========================================

-- 1. Criar tabela chat_notes para anotações estruturadas
CREATE TABLE IF NOT EXISTS public.chat_notes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  chat_id UUID NOT NULL REFERENCES public.chats(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Índice para buscar anotações por chat
CREATE INDEX IF NOT EXISTS idx_chat_notes_chat_id ON public.chat_notes(chat_id);

-- 3. Habilitar RLS (Row Level Security) - opcional
ALTER TABLE public.chat_notes ENABLE ROW LEVEL SECURITY;

-- 4. Política para permitir leitura por qualquer usuário autenticado
CREATE POLICY "Usuários autenticados podem ler anotações" ON public.chat_notes
  FOR SELECT USING (auth.role() = 'authenticated');

-- 5. Política para permitir inserção por qualquer usuário autenticado
CREATE POLICY "Usuários autenticados podem inserir anotações" ON public.chat_notes
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- 6. Política para permitir exclusão da própria anotação OU se for admin
CREATE POLICY "Usuários podem apagar suas anotações ou admin apaga qualquer uma" ON public.chat_notes
  FOR DELETE USING (
    auth.uid() = user_id 
    OR 
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
  );

-- 7. Habilitar Realtime para a tabela (para receber novas anotações em tempo real)
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_notes;
