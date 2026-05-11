import React, { useState, useEffect, useRef } from 'react';
import { User, Camera, Lock, Save, ArrowLeft, Eye, EyeOff, CheckCircle, AlertCircle, Mail, Phone, FileText, Edit3, Type } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface SettingsProps {
  user: any;
  currentName: string;
  chatFontSize: number;
  onClose: () => void;
  onProfileUpdated: () => void;
  onFontSizeChange: (size: number) => void;
}

export default function Settings({ user, currentName, chatFontSize, onClose, onProfileUpdated, onFontSizeChange }: SettingsProps) {
  // Profile fields
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [signature, setSignature] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [email, setEmail] = useState('');

  // Password fields
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);

  // UI States
  const [activeSection, setActiveSection] = useState<'profile' | 'password' | 'signature' | 'appearance'>('profile');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load user data
  useEffect(() => {
    const loadProfile = async () => {
      const { data } = await supabase
        .from('users')
        .select('name, email, phone, avatar_url, signature')
        .eq('id', user.id)
        .single();

      if (data) {
        setName(data.name || '');
        setEmail(data.email || user.email || '');
        setPhone(data.phone || '');
        setSignature(data.signature || '');
        setAvatarUrl(data.avatar_url || '');
      }
    };
    loadProfile();
  }, [user]);

  const showMessage = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 4000);
  };

  const handleSaveProfile = async () => {
    if (!name.trim()) {
      showMessage('error', 'O nome é obrigatório.');
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase
        .from('users')
        .update({
          name: name.trim(),
          phone: phone.trim() || null,
          avatar_url: avatarUrl.trim() || null,
        })
        .eq('id', user.id);

      if (error) throw error;
      showMessage('success', 'Perfil atualizado com sucesso!');
      onProfileUpdated();
    } catch (err: any) {
      showMessage('error', `Erro ao salvar: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveSignature = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('users')
        .update({ signature: signature.trim() || null })
        .eq('id', user.id);

      if (error) throw error;
      showMessage('success', 'Assinatura atualizada! Suas próximas mensagens usarão este nome.');
      onProfileUpdated();
    } catch (err: any) {
      showMessage('error', `Erro ao salvar: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async () => {
    if (!currentPassword) {
      showMessage('error', 'Digite sua senha atual.');
      return;
    }
    if (newPassword.length < 6) {
      showMessage('error', 'A nova senha deve ter pelo menos 6 caracteres.');
      return;
    }
    if (newPassword !== confirmPassword) {
      showMessage('error', 'As senhas não coincidem.');
      return;
    }
    setSaving(true);
    try {
      // Verify current password by re-signing in
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: email,
        password: currentPassword,
      });

      if (signInError) {
        showMessage('error', 'Senha atual incorreta.');
        setSaving(false);
        return;
      }

      // Update password
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (error) throw error;

      showMessage('success', 'Senha alterada com sucesso!');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      showMessage('error', `Erro ao alterar senha: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validar tipo de arquivo
    if (!file.type.startsWith('image/')) {
      showMessage('error', 'Por favor, selecione uma imagem válida.');
      return;
    }

    // Validar tamanho (max 2MB)
    if (file.size > 2 * 1024 * 1024) {
      showMessage('error', 'A imagem deve ter no máximo 2MB.');
      return;
    }

    setUploading(true);
    const formData = new FormData();
    formData.append('avatar', file);

    try {
      const response = await fetch(`http://${window.location.hostname}:3001/upload-avatar`, {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();
      if (data.url) {
        const fullUrl = `http://${window.location.hostname}:3001${data.url}`;
        setAvatarUrl(fullUrl);
        showMessage('success', 'Foto carregada! Clique em "Salvar Perfil" para confirmar.');
      } else {
        throw new Error(data.error || 'Erro no upload');
      }
    } catch (err: any) {
      showMessage('error', `Erro ao carregar imagem: ${err.message}`);
    } finally {
      setUploading(false);
    }
  };

  const fontSizeLabels: Record<number, string> = { 12: 'Pequeno', 13: 'Médio', 14: 'Normal', 15: 'Grande', 16: 'Muito Grande', 18: 'Extra Grande' };
  const fontSizeValues = [12, 13, 14, 15, 16, 18];

  const menuItems = [
    { id: 'profile' as const, label: 'Meu Perfil', icon: User, description: 'Nome, telefone e foto' },
    { id: 'signature' as const, label: 'Assinatura', icon: FileText, description: 'Nome nas mensagens' },
    { id: 'appearance' as const, label: 'Aparência', icon: Type, description: 'Tamanho do texto' },
    { id: 'password' as const, label: 'Alterar Senha', icon: Lock, description: 'Segurança da conta' },
  ];

  return (
    <main className="flex-1 flex bg-[#f0f2f5] dark:bg-[#0b141a] overflow-hidden">
      {/* Settings Sidebar */}
      <div className="w-80 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex flex-col">
        <div className="h-16 bg-[#f0f2f5] dark:bg-gray-900 flex items-center px-4 border-b border-gray-200 dark:border-gray-700 shrink-0">
          <button
            onClick={onClose}
            className="mr-4 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
          >
            <ArrowLeft size={24} />
          </button>
          <h2 className="text-lg font-bold text-[#111b21] dark:text-gray-100">Configurações</h2>
        </div>

        {/* Avatar Area */}
        <div className="p-6 flex flex-col items-center border-b border-gray-200 dark:border-gray-700">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept="image/*"
            className="hidden"
          />
          <div 
            className="relative group cursor-pointer"
            onClick={() => fileInputRef.current?.click()}
          >
            <div className={`w-24 h-24 rounded-full overflow-hidden bg-gray-200 dark:bg-gray-700 flex items-center justify-center shadow-lg border-4 ${uploading ? 'border-[#00a884] animate-pulse' : 'border-white dark:border-gray-600'}`}>
              {avatarUrl ? (
                <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
              ) : (
                <User size={40} className="text-gray-400" />
              )}
            </div>
            <div className="absolute inset-0 bg-black/40 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
              <Camera size={20} className="text-white" />
            </div>
            {uploading && (
              <div className="absolute inset-0 bg-black/20 rounded-full flex items-center justify-center">
                <div className="w-5 h-5 border-2 border-[#00a884] border-t-transparent rounded-full animate-spin"></div>
              </div>
            )}
          </div>
          <h3 className="mt-3 text-base font-bold text-gray-900 dark:text-gray-100">{name || currentName}</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400">{email}</p>
          <button 
            onClick={() => fileInputRef.current?.click()}
            className="mt-2 text-[10px] text-[#00a884] font-bold uppercase hover:underline"
          >
            Alterar Foto
          </button>
        </div>

        {/* Menu */}
        <nav className="flex-1 p-2">
          {menuItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveSection(item.id)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg mb-1 transition-all ${
                activeSection === item.id
                  ? 'bg-[#00a884]/10 text-[#00a884]'
                  : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
              }`}
            >
              <item.icon size={20} />
              <div className="text-left">
                <span className="block text-sm font-medium">{item.label}</span>
                <span className={`block text-[11px] ${activeSection === item.id ? 'text-[#00a884]/70' : 'text-gray-400'}`}>
                  {item.description}
                </span>
              </div>
            </button>
          ))}
        </nav>
      </div>

      {/* Settings Content */}
      <div className="flex-1 overflow-y-auto p-8">
        <div className="max-w-lg mx-auto">

          {/* Feedback Message */}
          {message && (
            <div className={`mb-6 p-4 rounded-lg flex items-center gap-3 text-sm font-medium animate-pulse ${
              message.type === 'success'
                ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-800'
                : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800'
            }`}>
              {message.type === 'success' ? <CheckCircle size={18} /> : <AlertCircle size={18} />}
              {message.text}
            </div>
          )}

          {/* Profile Section */}
          {activeSection === 'profile' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-1">Meu Perfil</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">Atualize suas informações pessoais.</p>
              </div>

              <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-700">
                {/* Name */}
                <div className="p-5">
                  <label className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">
                    <User size={14} /> Nome
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Seu nome completo"
                    className="w-full bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white border border-gray-200 dark:border-gray-600 rounded-lg px-4 py-3 text-sm focus:ring-2 focus:ring-[#00a884] focus:border-transparent outline-none transition-all"
                  />
                </div>

                {/* Email (read-only) */}
                <div className="p-5">
                  <label className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">
                    <Mail size={14} /> E-mail
                  </label>
                  <input
                    type="email"
                    value={email}
                    disabled
                    className="w-full bg-gray-100 dark:bg-gray-700/50 text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-600 rounded-lg px-4 py-3 text-sm cursor-not-allowed"
                  />
                  <p className="text-[11px] text-gray-400 mt-1">O e-mail não pode ser alterado por aqui.</p>
                </div>

                {/* Phone */}
                <div className="p-5">
                  <label className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">
                    <Phone size={14} /> Telefone pessoal
                  </label>
                  <input
                    type="text"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="Ex: +55 11 99999-9999"
                    className="w-full bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white border border-gray-200 dark:border-gray-600 rounded-lg px-4 py-3 text-sm focus:ring-2 focus:ring-[#00a884] focus:border-transparent outline-none transition-all"
                  />
                </div>

                {/* Avatar URL (Removed and replaced by file upload above) */}
              </div>

              <button
                onClick={handleSaveProfile}
                disabled={saving}
                className="w-full flex items-center justify-center gap-2 bg-[#00a884] hover:bg-[#008f6f] text-white font-bold py-3 px-6 rounded-lg transition-colors disabled:opacity-50 shadow-sm"
              >
                <Save size={18} />
                {saving ? 'Salvando...' : 'Salvar Perfil'}
              </button>
            </div>
          )}

          {/* Signature Section */}
          {activeSection === 'signature' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-1">Assinatura de Mensagem</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Configure o nome que aparece em negrito no início de cada mensagem que você envia.
                </p>
              </div>

              <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-5">
                <label className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">
                  <Edit3 size={14} /> Nome na Assinatura
                </label>
                <input
                  type="text"
                  value={signature}
                  onChange={(e) => setSignature(e.target.value)}
                  placeholder={name || currentName || 'Seu nome'}
                  className="w-full bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white border border-gray-200 dark:border-gray-600 rounded-lg px-4 py-3 text-sm focus:ring-2 focus:ring-[#00a884] focus:border-transparent outline-none transition-all"
                />
                <p className="text-[11px] text-gray-400 mt-2">
                  Deixe em branco para usar seu nome do perfil ({name || currentName}).
                </p>
              </div>

              {/* Preview */}
              <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-5">
                <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-3">
                  Pré-visualização da mensagem
                </h3>
                <div className="bg-[#d9fdd3] dark:bg-[#005c4b] rounded-lg p-3 max-w-xs shadow-sm relative pb-5">
                  <p className="text-sm text-gray-800 dark:text-gray-100 leading-relaxed whitespace-pre-wrap">
                    <strong>{signature.trim() || name || currentName}</strong>
                    {'\n\n'}Olá! Como posso ajudar?
                  </p>
                  <span className="absolute bottom-1 right-2 text-[10px] text-gray-500 dark:text-white/50">12:00</span>
                </div>
              </div>

              <button
                onClick={handleSaveSignature}
                disabled={saving}
                className="w-full flex items-center justify-center gap-2 bg-[#00a884] hover:bg-[#008f6f] text-white font-bold py-3 px-6 rounded-lg transition-colors disabled:opacity-50 shadow-sm"
              >
                <Save size={18} />
                {saving ? 'Salvando...' : 'Salvar Assinatura'}
              </button>
            </div>
          )}

          {/* Appearance Section */}
          {activeSection === 'appearance' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-1">Aparência</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">Ajuste o tamanho do texto nas conversas.</p>
              </div>

              <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-5">
                <label className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-4">
                  <Type size={14} /> Tamanho da Fonte
                </label>
                <div className="flex items-center gap-3 mb-4">
                  <span className="text-[11px] text-gray-400">A</span>
                  <input
                    type="range"
                    min={0}
                    max={fontSizeValues.length - 1}
                    value={fontSizeValues.indexOf(chatFontSize) >= 0 ? fontSizeValues.indexOf(chatFontSize) : 2}
                    onChange={(e) => onFontSizeChange(fontSizeValues[parseInt(e.target.value)])}
                    className="flex-1 accent-[#00a884] h-2 cursor-pointer"
                  />
                  <span className="text-lg text-gray-400 font-bold">A</span>
                </div>
                <p className="text-center text-sm text-[#00a884] font-bold">{fontSizeLabels[chatFontSize] || `${chatFontSize}px`}</p>
              </div>

              {/* Preview */}
              <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-5">
                <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-3">
                  Pré-visualização
                </h3>
                <div className="space-y-2">
                  <div className="bg-white dark:bg-[#202c33] rounded-lg p-3 max-w-xs shadow-sm relative pb-5 border border-gray-100 dark:border-gray-700">
                    <p className="text-gray-800 dark:text-gray-100 leading-relaxed" style={{ fontSize: `${chatFontSize}px` }}>
                      Olá, bom dia! Gostaria de saber o prazo de entrega.
                    </p>
                    <span className="absolute bottom-1 right-2 text-[10px] text-gray-400">09:30</span>
                  </div>
                  <div className="bg-[#d9fdd3] dark:bg-[#005c4b] rounded-lg p-3 max-w-xs shadow-sm relative pb-5 ml-auto">
                    <p className="text-gray-800 dark:text-gray-100 leading-relaxed" style={{ fontSize: `${chatFontSize}px` }}>
                      <strong>{signature.trim() || name || currentName}</strong>{`\n\n`}Bom dia! O prazo é de 3 a 5 dias úteis.
                    </p>
                    <span className="absolute bottom-1 right-2 text-[10px] text-gray-500 dark:text-white/50">09:31</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Password Section */}
          {activeSection === 'password' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-1">Alterar Senha</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">Para sua segurança, insira a senha atual antes de definir a nova.</p>
              </div>

              <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-700">
                {/* Current Password */}
                <div className="p-5">
                  <label className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">
                    <Lock size={14} /> Senha Atual
                  </label>
                  <div className="relative">
                    <input
                      type={showCurrentPassword ? 'text' : 'password'}
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      placeholder="Digite sua senha atual"
                      className="w-full bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white border border-gray-200 dark:border-gray-600 rounded-lg px-4 py-3 pr-12 text-sm focus:ring-2 focus:ring-[#00a884] focus:border-transparent outline-none transition-all"
                    />
                    <button
                      type="button"
                      onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      {showCurrentPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>

                {/* New Password */}
                <div className="p-5">
                  <label className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">
                    <Lock size={14} /> Nova Senha
                  </label>
                  <div className="relative">
                    <input
                      type={showNewPassword ? 'text' : 'password'}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Mínimo 6 caracteres"
                      className="w-full bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white border border-gray-200 dark:border-gray-600 rounded-lg px-4 py-3 pr-12 text-sm focus:ring-2 focus:ring-[#00a884] focus:border-transparent outline-none transition-all"
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPassword(!showNewPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      {showNewPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>

                {/* Confirm Password */}
                <div className="p-5">
                  <label className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">
                    <Lock size={14} /> Confirmar Nova Senha
                  </label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Repita a nova senha"
                    className={`w-full bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white border rounded-lg px-4 py-3 text-sm focus:ring-2 focus:ring-[#00a884] focus:border-transparent outline-none transition-all ${
                      confirmPassword && confirmPassword !== newPassword
                        ? 'border-red-400 dark:border-red-500'
                        : confirmPassword && confirmPassword === newPassword
                        ? 'border-green-400 dark:border-green-500'
                        : 'border-gray-200 dark:border-gray-600'
                    }`}
                  />
                  {confirmPassword && confirmPassword !== newPassword && (
                    <p className="text-[11px] text-red-500 mt-1">As senhas não coincidem.</p>
                  )}
                  {confirmPassword && confirmPassword === newPassword && (
                    <p className="text-[11px] text-green-500 mt-1">✓ Senhas conferem.</p>
                  )}
                </div>
              </div>

              <button
                onClick={handleChangePassword}
                disabled={saving || !currentPassword || !newPassword || newPassword !== confirmPassword}
                className="w-full flex items-center justify-center gap-2 bg-[#00a884] hover:bg-[#008f6f] text-white font-bold py-3 px-6 rounded-lg transition-colors disabled:opacity-50 shadow-sm"
              >
                <Lock size={18} />
                {saving ? 'Alterando...' : 'Alterar Senha'}
              </button>
            </div>
          )}

        </div>
      </div>
    </main>
  );
}
