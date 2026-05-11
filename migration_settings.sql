-- ==========================================
-- MIGRAÇÃO: Campos de Perfil do Usuário
-- Execute este SQL no Editor SQL do Supabase
-- ==========================================

-- 1. Adicionar coluna 'phone' para o telefone pessoal do atendente
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS phone TEXT;

-- 2. Adicionar coluna 'avatar_url' para a foto de perfil do atendente
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- 3. Adicionar coluna 'signature' para a assinatura fixa nas mensagens
-- Quando preenchida, substitui o nome do atendente na mensagem enviada
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS signature TEXT;
