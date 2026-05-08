-- ==========================================
-- MIGRAÇÃO: Sistema de Permissões (Roles)
-- Execute este SQL no Editor SQL do Supabase
-- ==========================================

-- 1. Adicionar coluna 'role' na tabela users
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'atendente';

-- 2. Adicionar coluna 'last_seen_at' para controle de presença
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMP WITH TIME ZONE;

-- 3. Adicionar coluna 'notes' na tabela chats (se ainda não existir)
ALTER TABLE public.chats ADD COLUMN IF NOT EXISTS notes TEXT;

-- 4. Atualizar o trigger para incluir role default ao criar novo usuário
CREATE OR REPLACE FUNCTION public.handle_new_user() 
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, name, email, role)
  VALUES (new.id, COALESCE(new.raw_user_meta_data->>'name', new.email), new.email, 'atendente');
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. IMPORTANTE: Defina manualmente o primeiro admin
-- Substitua 'seu-email@exemplo.com' pelo seu email real:
-- UPDATE public.users SET role = 'admin' WHERE email = 'seu-email@exemplo.com';
