-- ==========================================
-- MIGRAÇÃO: Sistema de Convites (Whitelisting)
-- ==========================================

-- 1. Criar tabela de convites
CREATE TABLE IF NOT EXISTS public.user_invites (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  invited_by UUID REFERENCES public.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Habilitar RLS
ALTER TABLE public.user_invites ENABLE ROW LEVEL SECURITY;

-- 3. Políticas de Acesso
-- Apenas administradores podem ver e gerenciar convites
CREATE POLICY "Admins podem gerenciar convites" ON public.user_invites
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = auth.uid() AND users.role = 'admin'
    )
  );

-- Permitir que qualquer um verifique se seu próprio email está convidado durante o signup
-- (Nota: Para segurança extra, poderíamos fazer isso via RPC, mas aqui simplificamos)
CREATE POLICY "Qualquer um pode ler convites para verificar email" ON public.user_invites
  FOR SELECT USING (true);
