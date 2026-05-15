import React, { useState, useEffect } from 'react';
import { Mail, UserPlus, Trash2, Plus, ArrowLeft, Shield, CheckCircle, AlertCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface AdminPanelProps {
  user: any;
  onClose: () => void;
}

export default function AdminPanel({ user, onClose }: AdminPanelProps) {
  const [invites, setInvites] = useState<any[]>([]);
  const [newInviteEmail, setNewInviteEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const showMessage = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 4000);
  };

  const fetchInvites = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('user_invites')
      .select('*')
      .order('created_at', { ascending: false });
    if (data) setInvites(data);
    setLoading(false);
  };

  useEffect(() => {
    fetchInvites();
  }, []);

  const handleAddInvite = async () => {
    if (!newInviteEmail.trim()) return;
    
    if (!newInviteEmail.toLowerCase().endsWith('@edu.campos.rj.gov.br')) {
      showMessage('error', 'O e-mail deve pertencer ao domínio @edu.campos.rj.gov.br');
      return;
    }

    setSaving(true);
    try {
      // 1. Chamar o backend para enviar o e-mail de convite oficial
      const response = await fetch(`http://${window.location.hostname}:3001/invite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: newInviteEmail.toLowerCase().trim() })
      });

      const inviteResult = await response.json();
      if (!response.ok) throw new Error(inviteResult.error || 'Erro ao enviar convite por e-mail');

      // 2. Adicionar à nossa tabela de user_invites para whitelist
      const { error } = await supabase
        .from('user_invites')
        .insert([{ email: newInviteEmail.toLowerCase().trim(), invited_by: user.id }]);
      
      if (error) throw error;
      
      setNewInviteEmail('');
      fetchInvites();
      showMessage('success', 'Convite enviado por e-mail com sucesso!');
    } catch (err: any) {
      showMessage('error', `Erro ao convidar: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteInvite = async (id: string) => {
    try {
      const { error } = await supabase.from('user_invites').delete().eq('id', id);
      if (error) throw error;
      fetchInvites();
      showMessage('success', 'Convite removido.');
    } catch (err: any) {
      showMessage('error', 'Erro ao remover convite.');
    }
  };

  return (
    <main className="flex-1 flex flex-col bg-[#f0f2f5] dark:bg-[#0b141a] overflow-hidden">
      {/* Header */}
      <header className="h-16 bg-white dark:bg-gray-900 flex items-center px-6 border-b border-gray-200 dark:border-gray-700 shrink-0">
        <button
          onClick={onClose}
          className="mr-4 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
        >
          <ArrowLeft size={24} />
        </button>
        <div className="flex items-center gap-2">
          <Shield size={20} className="text-[#00a884]" />
          <h2 className="text-lg font-bold text-[#111b21] dark:text-gray-100">Painel Administrativo</h2>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-8">
        <div className="max-w-2xl mx-auto space-y-8">
          
          {/* Info Card */}
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 rounded-xl p-6 flex gap-4">
            <div className="w-12 h-12 rounded-full bg-blue-100 dark:bg-blue-800 flex items-center justify-center text-blue-600 dark:text-blue-400 shrink-0">
              <UserPlus size={24} />
            </div>
            <div>
              <h3 className="text-blue-900 dark:text-blue-300 font-bold">Gerenciar Acessos</h3>
              <p className="text-blue-700 dark:text-blue-400 text-sm mt-1">
                Adicione e-mails autorizados para criar conta no sistema. Apenas usuários com o domínio 
                <strong> @edu.campos.rj.gov.br</strong> podem ser convidados.
              </p>
            </div>
          </div>

          {/* Message Area */}
          {message && (
            <div className={`p-4 rounded-lg flex items-center gap-3 text-sm font-medium animate-in fade-in slide-in-from-top-2 ${
              message.type === 'success'
                ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-800'
                : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800'
            }`}>
              {message.type === 'success' ? <CheckCircle size={18} /> : <AlertCircle size={18} />}
              {message.text}
            </div>
          )}

          {/* Add Invite Form */}
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
            <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-3">
              Novo Convite
            </label>
            <div className="flex gap-3">
              <div className="relative flex-1">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                <input
                  type="email"
                  value={newInviteEmail}
                  onChange={(e) => setNewInviteEmail(e.target.value)}
                  placeholder="usuario@edu.campos.rj.gov.br"
                  className="w-full bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white border border-gray-200 dark:border-gray-600 rounded-lg pl-10 pr-4 py-3 text-sm focus:ring-2 focus:ring-[#00a884] focus:border-transparent outline-none transition-all"
                />
              </div>
              <button
                onClick={handleAddInvite}
                disabled={saving || !newInviteEmail.trim()}
                className="bg-[#00a884] hover:bg-[#008f6f] text-white font-bold py-3 px-8 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2 shadow-sm"
              >
                {saving ? '...' : <Plus size={20} />}
                Convidar
              </button>
            </div>
          </div>

          {/* Invites List */}
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/50 flex justify-between items-center">
              <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                Lista de Autorizados ({invites.length})
              </h3>
            </div>
            <div className="divide-y divide-gray-100 dark:divide-gray-700">
              {loading ? (
                <div className="p-12 text-center text-gray-400 flex flex-col items-center gap-2">
                  <div className="w-6 h-6 border-2 border-[#00a884] border-t-transparent rounded-full animate-spin"></div>
                  <span className="text-sm">Carregando convites...</span>
                </div>
              ) : invites.length === 0 ? (
                <div className="p-12 text-center text-gray-400">
                  <Mail size={40} className="mx-auto mb-3 opacity-20" />
                  <p className="text-sm">Nenhum convite ativo encontrado.</p>
                </div>
              ) : (
                invites.map((invite) => (
                  <div key={invite.id} className="px-6 py-4 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors group">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-full bg-[#00a884]/10 text-[#00a884] flex items-center justify-center">
                        <Mail size={20} />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{invite.email}</p>
                        <p className="text-[11px] text-gray-500 dark:text-gray-400">
                          Autorizado em {new Date(invite.created_at).toLocaleDateString('pt-BR')} às {new Date(invite.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => handleDeleteInvite(invite.id)}
                      className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                      title="Revogar acesso"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

        </div>
      </div>
    </main>
  );
}
