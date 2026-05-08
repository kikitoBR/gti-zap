import React, { useState } from 'react';
import { supabase } from './lib/supabase';
import { MessageSquare } from 'lucide-react';

export default function Login({ onLogin }: { onLogin: (user: any) => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [name, setName] = useState('');

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      let data, error;
      if (isSignUp) {
        ({ data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { name }
          }
        }));
        
        if (!error && !data.session) {
          setError('Conta criada com sucesso! Por favor, verifique seu e-mail para confirmar o cadastro antes de entrar. (Ou desative a "Confirmação de E-mail" no painel do Supabase).');
          setIsSignUp(false);
          return;
        }
      } else {
        ({ data, error } = await supabase.auth.signInWithPassword({
          email,
          password
        }));
      }

      if (error) throw error;
      if (data.user) onLogin(data.user);
    } catch (err: any) {
      setError(err.message || 'Erro de autenticação');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex h-screen w-full items-center justify-center bg-[#f0f2f5]">
      <div className="w-full max-w-md p-8 bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="flex flex-col items-center mb-8">
          <div className="bg-[#00a884] p-4 rounded-full text-white mb-4">
            <MessageSquare size={32} />
          </div>
          <h1 className="text-2xl font-light text-gray-800">WhatsApp Compartilhado</h1>
          <p className="text-gray-500 text-sm mt-2">{isSignUp ? 'Crie sua conta de atendente' : 'Faça login para atender'}</p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-100 text-red-700 rounded text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleAuth} className="space-y-4">
          {isSignUp && (
            <div>
              <label className="block text-sm text-gray-600 mb-1">Nome Completo</label>
              <input 
                type="text" 
                required
                value={name}
                onChange={e => setName(e.target.value)}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:border-[#00a884]"
              />
            </div>
          )}
          <div>
            <label className="block text-sm text-gray-600 mb-1">E-mail</label>
            <input 
              type="email" 
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:border-[#00a884]"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-600 mb-1">Senha (mínimo 6 chars)</label>
            <input 
              type="password" 
              required
              minLength={6}
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:border-[#00a884]"
            />
          </div>
          <button 
            type="submit" 
            disabled={loading}
            className="w-full bg-[#00a884] text-white rounded py-2 font-bold hover:bg-[#008f6f] transition-colors disabled:opacity-50"
          >
            {loading ? 'Aguarde...' : isSignUp ? 'Registrar' : 'Entrar'}
          </button>
        </form>

        <div className="mt-6 text-center">
          <button 
            onClick={() => setIsSignUp(!isSignUp)}
            className="text-sm text-blue-600 hover:underline"
          >
            {isSignUp ? 'Já tem uma conta? Entrar' : 'Não tem conta? Registrar'}
          </button>
        </div>
      </div>
    </div>
  );
}
