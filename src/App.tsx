import React, { useState, useEffect, useRef } from 'react';
import { Search, MoreVertical, Paperclip, Send, User, Check, CheckCheck, MessageSquare, Users, Settings, LogOut, Lock, Unlock, Plus, Clock, Moon, Sun, Shield, ChevronDown } from 'lucide-react';
import { supabase } from './lib/supabase';
import Login from './Login';
import AudioPlayer from './components/AudioPlayer';

type Message = {
  id: string;
  chat_id: string;
  sender_id: string;
  text: string;
  timestamp: string;
  status: 'pending' | 'sent' | 'delivered' | 'read';
  is_incoming: boolean;
  media_url?: string;
  media_type?: string;
};

type Chat = {
  id: string;
  contact_name: string;
  phone_number: string;
  profile_pic_url?: string;
  last_message: string;
  unread_count: number;
  assigned_to?: string;
  updated_at: string;
  notes?: string;
};

type TeamMember = {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'atendente';
  status: string;
  last_seen_at: string | null;
};

export default function App() {
  const [user, setUser] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<'all' | 'mine' | 'groups' | 'team'>('all');
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [newMessage, setNewMessage] = useState('');

  const [isComposing, setIsComposing] = useState(false);
  const [composePhone, setComposePhone] = useState('');
  const [composeText, setComposeText] = useState('');

  const [isContactProfileOpen, setIsContactProfileOpen] = useState(false);
  const [contactDetails, setContactDetails] = useState<any>(null);

  const [fullscreenImage, setFullscreenImage] = useState<string | null>(null);
  const [isDarkMode, setIsDarkMode] = useState(() => localStorage.getItem('theme') === 'dark');
  const chatNotesSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [chatNotes, setChatNotes] = useState('');
  const [isSavingNotes, setIsSavingNotes] = useState(false);

  // Persistir tema
  useEffect(() => {
    localStorage.setItem('theme', isDarkMode ? 'dark' : 'light');
  }, [isDarkMode]);

  const [chats, setChats] = useState<Chat[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [agents, setAgents] = useState<Record<string, string>>({}); // id -> name mapping
  const [userRole, setUserRole] = useState<'admin' | 'atendente'>('atendente');
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [assignDropdownOpen, setAssignDropdownOpen] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Authentication
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Fetch Data and Setup Realtime when user logs in
  useEffect(() => {
    if (!user) return;

    fetchInitialData();

    // Heartbeat de presença (a cada 30s)
    const updatePresence = () => {
      supabase.from('users').update({ last_seen_at: new Date().toISOString(), status: 'online' }).eq('id', user.id).then();
    };
    updatePresence();
    const heartbeatInterval = setInterval(updatePresence, 30000);

    // Supabase Realtime Setup
    const channel = supabase.channel('whatsapp-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chats' }, payload => {
        handleChatChange(payload);
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, payload => {
        handleNewMessage(payload.new as Message);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'users' }, payload => {
        const updatedUser = payload.new as TeamMember;
        if (updatedUser && updatedUser.id && updatedUser.name) {
          setAgents(prev => ({ ...prev, [updatedUser.id]: updatedUser.name }));
          setTeamMembers(prev => prev.map(m => m.id === updatedUser.id ? { ...m, ...updatedUser } : m));
        }
      })
      .subscribe();

    return () => {
      clearInterval(heartbeatInterval);
      // Marca como offline ao desmontar
      supabase.from('users').update({ status: 'offline' }).eq('id', user.id).then();
      supabase.removeChannel(channel);
    };
  }, [user]);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, selectedChatId]);

  const fetchInitialData = async () => {
    // Busca Agentes completos (com role e presença)
    const { data: usersData } = await supabase.from('users').select('id, name, email, role, status, last_seen_at');
    if (usersData) {
      const agentsMap: Record<string, string> = {};
      usersData.forEach(u => agentsMap[u.id] = u.name);
      setAgents(agentsMap);
      setTeamMembers(usersData as TeamMember[]);

      // Define a role do usuário logado
      const currentUser = usersData.find(u => u.id === user.id);
      if (currentUser?.role) setUserRole(currentUser.role as 'admin' | 'atendente');
    }

    // Busca Chats
    const { data: chatsData } = await supabase.from('chats').select('*').order('updated_at', { ascending: false });
    if (chatsData) setChats(chatsData);
  };

  useEffect(() => {
    if (selectedChatId) {
      fetchMessages(selectedChatId);
      // Reset unread count se eu assumir ou clicar
      supabase.from('chats').update({ unread_count: 0 }).eq('id', selectedChatId).then();

      if (isContactProfileOpen) {
        const chat = chats.find(c => c.id === selectedChatId);
        if (chat) {
          fetchContactDetails(chat.phone_number);
          setChatNotes(chat.notes || '');
        }
      } else {
        const chat = chats.find(c => c.id === selectedChatId);
        if (chat) setChatNotes(chat.notes || '');
      }
    } else {
      setMessages([]);
      setIsContactProfileOpen(false);
      setChatNotes('');
    }
  }, [selectedChatId]);

  const saveNotes = async () => {
    if (!selectedChatId) return;
    setIsSavingNotes(true);
    try {
      const { error } = await supabase
        .from('chats')
        .update({ notes: chatNotes })
        .eq('id', selectedChatId);
      
      if (error) throw error;
      
      // Atualiza o estado local do chat
      setChats(prev => prev.map(c => c.id === selectedChatId ? { ...c, notes: chatNotes } : c));
    } catch (err) {
      console.error('Erro ao salvar anotações:', err);
      alert('Aviso: Certifique-se de que a coluna "notes" existe na tabela "chats" no seu banco de dados Supabase.');
    } finally {
      setIsSavingNotes(false);
    }
  };

  const fetchContactDetails = async (phone: string) => {
    try {
      const res = await fetch(`http://${window.location.hostname}:3001/contact/${encodeURIComponent(phone)}`);
      const data = await res.json();
      if (!data.error) {
        setContactDetails(data);

        // Sincroniza a foto de perfil com o banco de dados APENAS se o perfil for do próprio chat selecionado
        // Isso evita que ao ver perfil de um participante de grupo, a foto do grupo seja alterada
        if (selectedChatId) {
          const chatObj = chats.find(c => c.id === selectedChatId);
          if (chatObj && chatObj.phone_number === phone && chatObj.profile_pic_url !== data.profilePicUrl) {
            supabase.from('chats').update({ profile_pic_url: data.profilePicUrl }).eq('id', selectedChatId).then();
          }
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchMessages = async (chatId: string) => {
    const { data } = await supabase.from('messages').select('*').eq('chat_id', chatId).order('timestamp', { ascending: true });
    if (data) setMessages(data);
  };

  const handleChatChange = (payload: any) => {
    if (payload.eventType === 'INSERT') {
      setChats(prev => [payload.new as Chat, ...prev].sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()));
    } else if (payload.eventType === 'UPDATE') {
      setChats(prev => prev.map(c => c.id === payload.new.id ? payload.new as Chat : c).sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()));
    }
  };

  const handleNewMessage = (newMsg: Message) => {
    // If we are viewing this chat, add to messages array
    setMessages(prev => {
      if (prev.length > 0 && prev[0].chat_id !== newMsg.chat_id) return prev; // Not for this chat
      // Check if not already added (optimistic UI check could be done, but simple push here)
      if (prev.find(m => m.id === newMsg.id)) return prev;
      return [...prev, newMsg];
    });
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !selectedChat) return;

    const currentUserName = agents[user.id] || user.email.split('@')[0] || 'Atendente';
    const text = `*${currentUserName}*\n\n${newMessage.trim()}`;
    setNewMessage('');

    // Enviar via Backend API (que envia pelo WhatsApp Web JS)
    try {
      await fetch(`http://${window.location.hostname}:3001/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chatId: selectedChat.id,
          phoneNumber: selectedChat.phone_number,
          text: text,
          agentId: user.id
        })
      });
    } catch (err) {
      console.error('Erro ao enviar msg:', err);
    }
  };

  const handleSendNewMessage = async () => {
    if (!composePhone.trim() || !composeText.trim()) return;

    const currentUserName = agents[user.id] || user.email.split('@')[0] || 'Atendente';
    const text = `*${currentUserName}*\n\n${composeText.trim()}`;

    try {
      const res = await fetch(`http://${window.location.hostname}:3001/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phoneNumber: composePhone.trim(),
          text: text,
          agentId: user.id
        })
      });
      const data = await res.json();

      if (data.success) {
        setIsComposing(false);
        setComposePhone('');
        setComposeText('');
        if (data.chatId) {
          setSelectedChatId(data.chatId);
        }
      } else {
        alert('Erro ao enviar mensagem: ' + data.error);
      }
    } catch (err) {
      console.error('Erro ao iniciar conversa:', err);
      alert('Erro ao iniciar conversa.');
    }
  };

  const handleAssignToMe = async () => {
    if (!selectedChatId || !user) return;
    await supabase.from('chats').update({ assigned_to: user.id }).eq('id', selectedChatId);
  };

  const handleFreeAssignment = async () => {
    if (!selectedChatId) return;
    await supabase.from('chats').update({ assigned_to: null }).eq('id', selectedChatId);
  };

  const handleAssignToAgent = async (agentId: string) => {
    if (!selectedChatId) return;
    await supabase.from('chats').update({ assigned_to: agentId || null }).eq('id', selectedChatId);
    setAssignDropdownOpen(false);
  };

  const handleLogout = async () => {
    await supabase.from('users').update({ status: 'offline', last_seen_at: null }).eq('id', user.id);
    await supabase.auth.signOut();
  };

  const getTeamMemberStatus = (member: TeamMember): { label: string; color: string } => {
    const lastSeen = member.last_seen_at ? new Date(member.last_seen_at).getTime() : 0;
    const isActive = (Date.now() - lastSeen) < 60000; // 60 segundos

    if (!isActive) return { label: 'Ausente', color: 'bg-gray-400' };

    const hasAssignments = chats.some(c => c.assigned_to === member.id);
    if (hasAssignments) return { label: 'Ocupado', color: 'bg-yellow-500' };
    return { label: 'Disponível', color: 'bg-green-500' };
  };

  if (!user) {
    return <Login onLogin={setUser} />;
  }

  const selectedChat = chats.find(c => c.id === selectedChatId);

  const filteredChats = chats.filter(chat => {
    if (activeTab === 'mine') return chat.assigned_to === user.id;
    if (activeTab === 'groups') return chat.phone_number.includes('@g.us');
    if (activeTab === 'team') return false; // Na aba team não mostrar chats
    // Para a aba 'Todas', podemos opcionalmente ocultar os grupos ou mostrar tudo. 
    // Mostraremos tudo (contatos + grupos) para ser um histórico geral real.
    return true;
  });

  const getAgentName = (id: string | undefined | null) => {
    if (!id) return null;
    if (id === user.id) return 'Você';
    return agents[id] || 'Atendente';
  };

  const formatTime = (ts: string) => {
    const d = new Date(ts);
    return isNaN(d.getTime()) ? '' : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const formatPhoneNumber = (phone: string) => {
    if (!phone) return '';
    const numberOnly = phone.split('@')[0];
    return `+${numberOnly}`;
  };

  return (
    <div className={`flex h-screen w-full bg-[#f0f2f5] dark:bg-gray-900 font-sans overflow-hidden ${isDarkMode ? 'dark' : ''}`}>

      {/* Sidebar - Menu (Left) */}
      <div className="w-16 bg-[#111b21] flex flex-col items-center py-4 space-y-6">
        <div className="w-10 h-10 bg-[#00a884] rounded-full flex items-center justify-center text-white font-bold text-sm">
          WH
        </div>
        <nav className="flex-1 flex flex-col space-y-4 items-center w-full px-2">
          <button
            onClick={() => { if (activeTab === 'groups' || activeTab === 'team') setActiveTab('all'); }}
            className={`w-full p-2 flex justify-center rounded-lg relative transition-colors ${activeTab !== 'groups' && activeTab !== 'team' ? 'bg-[#2a3942] text-white' : 'text-gray-400 hover:bg-[#2a3942] hover:text-white'}`}
            title="Conversas"
          >
            <MessageSquare size={24} />
          </button>
          <button
            onClick={() => setActiveTab('groups')}
            className={`w-full p-2 flex justify-center rounded-lg relative transition-colors ${activeTab === 'groups' ? 'bg-[#2a3942] text-white' : 'text-gray-400 hover:bg-[#2a3942] hover:text-white'}`}
            title="Grupos"
          >
            <Users size={24} />
          </button>
          {userRole === 'admin' && (
            <button
              onClick={() => setActiveTab('team')}
              className={`w-full p-2 flex justify-center rounded-lg relative transition-colors ${activeTab === 'team' ? 'bg-[#2a3942] text-white' : 'text-gray-400 hover:bg-[#2a3942] hover:text-white'}`}
              title="Equipe"
            >
              <Shield size={24} />
            </button>
          )}
          <button className="w-full p-2 flex justify-center rounded-lg text-gray-400 hover:bg-[#2a3942] hover:text-white transition-colors" title="Configurações">
            <Settings size={24} />
          </button>
        </nav>
        <div className="mt-auto flex flex-col gap-4 items-center">
          <button onClick={() => setIsDarkMode(!isDarkMode)} className="p-2 text-gray-400 hover:text-white transition-colors" title="Alternar Tema">
            {isDarkMode ? <Sun size={24} /> : <Moon size={24} />}
          </button>
          <div className="w-8 h-8 rounded-full bg-gray-600 border border-gray-400 flex flex-col items-center justify-center text-white cursor-pointer group relative">
            <User size={18} />
            <div className="absolute left-10 bg-black text-white text-xs px-2 py-1 rounded hidden group-hover:block whitespace-nowrap z-50">
              {agents[user.id] || user.email}
            </div>
          </div>
          <button onClick={handleLogout} className="p-2 text-gray-400 hover:text-red-500 transition-colors" title="Sair">
            <LogOut size={20} />
          </button>
        </div>
      </div>

      {/* Chat List (Middle-Left) */}
      <div className="w-80 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex flex-col">
        <div className="p-4 border-b border-gray-200 dark:border-gray-700 bg-[#f0f2f5] dark:bg-gray-900">
          <div className="flex justify-between items-center">
            <h1 className="text-xl font-bold text-[#111b21] dark:text-gray-100">Caixa de Entrada</h1>
            <button
              onClick={() => { setIsComposing(true); setSelectedChatId(null); }}
              className="p-1.5 bg-[#00a884] text-white rounded hover:bg-[#008f6f]"
              title="Nova Conversa"
            >
              <Plus size={18} />
            </button>
          </div>
          <p className="text-[11px] text-gray-500 uppercase tracking-wider font-bold mt-1">
            Logado: <span className="text-[#00a884]">{agents[user.id] || user.email}</span>
            {userRole === 'admin' && <span className="ml-1.5 text-[9px] bg-[#00a884] text-white px-1 py-0.5 rounded">ADMIN</span>}
          </p>
          <div className="mt-3 relative">
            <input
              type="text"
              placeholder="Pesquisar conversas..."
              className="w-full bg-white dark:bg-gray-800 dark:text-white border-none rounded-md py-1.5 pl-8 pr-4 text-sm ring-1 ring-gray-300 dark:ring-gray-600 focus:ring-2 focus:ring-[#00a884] outline-none"
            />
            <Search className="absolute left-2.5 top-2 text-gray-400" size={16} />
          </div>
        </div>

        {activeTab === 'team' ? (
          /* Painel de Tabs da Equipe */
          <>
            <div className="p-2 bg-[#f0f2f5] dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 text-center">
              <span className="text-xs font-bold uppercase tracking-wider text-[#00a884]"><Shield size={12} className="inline mr-1" />Painel da Equipe</span>
            </div>
            <div className="flex-1 overflow-y-auto">
              {teamMembers.map(member => {
                const memberStatus = getTeamMemberStatus(member);
                const memberChats = chats.filter(c => c.assigned_to === member.id);
                return (
                  <div key={member.id} className="p-3 border-b border-gray-100 dark:border-gray-700">
                    <div className="flex items-center gap-3">
                      <div className="relative">
                        <div className="w-10 h-10 bg-gray-200 dark:bg-gray-700 rounded-full flex items-center justify-center text-gray-500">
                          <User size={20} />
                        </div>
                        <span className={`absolute bottom-0 right-0 w-3 h-3 ${memberStatus.color} rounded-full border-2 border-white dark:border-gray-800`}></span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">{member.name}</span>
                          {member.role === 'admin' && (
                            <span className="text-[9px] bg-[#00a884] text-white px-1.5 py-0.5 rounded uppercase font-bold">Admin</span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className={`w-1.5 h-1.5 rounded-full ${memberStatus.color}`}></span>
                          <span className={`text-[11px] ${
                            memberStatus.label === 'Disponível' ? 'text-green-600' :
                            memberStatus.label === 'Ocupado' ? 'text-yellow-600' : 'text-gray-400'
                          } font-medium`}>{memberStatus.label}</span>
                          {memberChats.length > 0 && (
                            <span className="text-[10px] text-gray-400">· {memberChats.length} chat{memberChats.length > 1 ? 's' : ''}</span>
                          )}
                        </div>
                      </div>
                      {member.id === user.id && (
                        <span className="text-[9px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-bold">VOCÊ</span>
                      )}
                    </div>
                    {/* Chats atribuídos ao membro */}
                    {memberChats.length > 0 && (
                      <div className="mt-2 ml-13 space-y-1">
                        {memberChats.map(c => (
                          <div
                            key={c.id}
                            onClick={() => { setActiveTab('all'); setSelectedChatId(c.id); }}
                            className="flex items-center gap-2 px-2 py-1.5 bg-gray-50 dark:bg-gray-700/50 rounded cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors ml-12"
                          >
                            <div className="w-6 h-6 bg-gray-200 dark:bg-gray-600 rounded-full flex items-center justify-center text-gray-500 overflow-hidden flex-shrink-0">
                              {c.profile_pic_url ? (
                                <img src={c.profile_pic_url} className="w-full h-full object-cover" />
                              ) : c.phone_number.includes('@g.us') ? (
                                <Users size={12} />
                              ) : (
                                <User size={12} />
                              )}
                            </div>
                            <span className="text-[11px] text-gray-700 dark:text-gray-300 truncate">{c.contact_name || formatPhoneNumber(c.phone_number)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
              {teamMembers.length === 0 && (
                <div className="p-4 text-center text-sm text-gray-500 mt-10">Nenhum membro encontrado.</div>
              )}
            </div>
          </>
        ) : (
          /* Lista de chats normal */
          <>
            {activeTab !== 'groups' ? (
              <div className="flex border-b border-gray-200 dark:border-gray-700 p-1 bg-[#f0f2f5] dark:bg-gray-900">
                <button
                  className={`flex-1 py-1.5 text-xs font-bold uppercase tracking-wider rounded ${activeTab === 'all' ? 'bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'}`}
                  onClick={() => setActiveTab('all')}
                >
                  Todas
                </button>
                <button
                  className={`flex-1 py-1.5 text-xs font-bold uppercase tracking-wider rounded ${activeTab === 'mine' ? 'bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'}`}
                  onClick={() => setActiveTab('mine')}
                >
                  Minhas
                </button>
              </div>
            ) : (
              <div className="p-2 bg-[#f0f2f5] dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 text-center">
                <span className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">Filtrando Grupos</span>
              </div>
            )}

            <div className="flex-1 overflow-y-auto">
              {filteredChats.map(chat => (
                <div
                  key={chat.id}
                  onClick={() => setSelectedChatId(chat.id)}
                  className={`flex items-center p-3 cursor-pointer border-b border-gray-100 dark:border-gray-700 ${selectedChatId === chat.id ? 'bg-[#f0f2f5] dark:bg-gray-700 border-l-4 border-l-[#00a884]' : 'hover:bg-gray-50 dark:hover:bg-gray-700/50 border-l-4 border-l-transparent'}`}
                >
                  <div className="w-12 h-12 bg-gray-200 dark:bg-gray-700 rounded-full flex-shrink-0 flex items-center justify-center text-gray-500 overflow-hidden">
                    {chat.profile_pic_url ? (
                      <img src={chat.profile_pic_url} alt="Profile" className="w-full h-full object-cover" />
                    ) : chat.phone_number.includes('@g.us') ? (
                      <Users size={24} />
                    ) : (
                      <User size={24} />
                    )}
                  </div>
                  <div className="ml-3 flex-1 overflow-hidden">
                    <div className="flex justify-between items-baseline">
                      <span className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate pr-2">{chat.contact_name || formatPhoneNumber(chat.phone_number)}</span>
                      <span className={`text-[10px] ${chat.unread_count > 0 ? 'text-[#00a884] font-bold' : 'text-gray-500 dark:text-gray-400'}`}>{formatTime(chat.updated_at)}</span>
                    </div>
                    <p className={`text-xs truncate ${chat.unread_count > 0 ? 'text-gray-800 dark:text-gray-200 font-medium' : 'text-gray-500 dark:text-gray-400'}`}>{chat.last_message || 'Nenhuma mensagem'}</p>
                    <div className="mt-1 flex justify-between items-center">
                      <div className="flex items-center space-x-1">
                        <span className="px-1.5 py-0.5 bg-blue-100 text-blue-700 text-[10px] rounded font-medium truncate max-w-[100px]">
                          {getAgentName(chat.assigned_to) || 'S/ RESP.'}
                        </span>
                      </div>
                      {chat.unread_count > 0 && chat.assigned_to !== user.id && (
                        <span className="bg-[#00a884] text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full inline-flex items-center justify-center min-w-[20px]">
                          {chat.unread_count}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              {filteredChats.length === 0 && (
                <div className="p-4 text-center text-sm text-gray-500 mt-10">Nenhuma conversa encontrada.</div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Main Chat Area (Right) */}
      {isComposing ? (
        <main className="flex-1 flex flex-col items-center justify-center bg-[#f0f2f5] px-10 border-b-8 border-[#00a884]">
          <div className="bg-white p-8 rounded-lg shadow-sm w-full max-w-md border-t-4 border-[#00a884]">
            <h2 className="text-xl font-bold text-gray-800 mb-4">Nova Conversa</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Número do WhatsApp</label>
                <input
                  type="text"
                  placeholder="Ex: 5511999999999"
                  value={composePhone}
                  onChange={e => setComposePhone(e.target.value)}
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-[#00a884] outline-none"
                />
                <p className="text-xs text-gray-500 mt-1">Digite apenas números, incluindo DDI e DDD (ex: 55 para Brasil).</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Mensagem Inicial</label>
                <textarea
                  rows={4}
                  placeholder="Olá! Como podemos ajudar?"
                  value={composeText}
                  onChange={e => setComposeText(e.target.value)}
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-[#00a884] outline-none resize-none"
                />
              </div>
              <div className="flex justify-end space-x-2 pt-2">
                <button
                  onClick={() => setIsComposing(false)}
                  className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSendNewMessage}
                  disabled={!composePhone.trim() || !composeText.trim()}
                  className="px-4 py-2 bg-[#00a884] text-white text-sm font-bold rounded hover:bg-[#008f6f] disabled:opacity-50"
                >
                  Enviar
                </button>
              </div>
            </div>
          </div>
        </main>
      ) : selectedChat ? (
        <main className="flex-1 flex flex-col bg-[#efeae2] dark:bg-[#0b141a] relative">
          {/* Chat Header */}
          <header className="h-16 bg-[#f0f2f5] dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 flex items-center px-6 justify-between">
            <div className="flex items-center">
              <div className="w-10 h-10 bg-gray-200 dark:bg-gray-700 rounded-full flex items-center justify-center text-gray-500 overflow-hidden">
                {contactDetails && contactDetails.number === selectedChat.phone_number.split('@')[0] ? (
                  contactDetails.profilePicUrl ? (
                    <img src={contactDetails.profilePicUrl} alt="Profile" className="w-full h-full object-cover" />
                  ) : selectedChat.phone_number.includes('@g.us') ? (
                    <Users size={20} />
                  ) : (
                    <User size={20} />
                  )
                ) : selectedChat.profile_pic_url ? (
                  <img src={selectedChat.profile_pic_url} alt="Profile" className="w-full h-full object-cover" />
                ) : selectedChat.phone_number.includes('@g.us') ? (
                  <Users size={20} />
                ) : (
                  <User size={20} />
                )}
              </div>
              <div
                className="ml-3 cursor-pointer hover:opacity-80"
                onClick={() => {
                  if (!isContactProfileOpen) fetchContactDetails(selectedChat.phone_number);
                  setIsContactProfileOpen(!isContactProfileOpen);
                }}
              >
                <h2 className="text-sm font-bold text-gray-800 dark:text-white">{selectedChat.contact_name || formatPhoneNumber(selectedChat.phone_number)}</h2>
                <span className="text-xs text-gray-500 flex items-center">
                  <span className={`w-2 h-2 rounded-full mr-1.5 ${contactDetails && contactDetails.isOnline ? 'bg-green-500' : 'bg-gray-300'}`}></span>
                  {contactDetails && contactDetails.isOnline ? 'Online' : 'Offline'} • {formatPhoneNumber(selectedChat.phone_number)}
                </span>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              {!selectedChat.phone_number.includes('@g.us') && (
                <div className="flex items-center space-x-4">
                  <div className="flex items-center space-x-2">
                    <span className="text-xs text-gray-500 mt-0.5">Resp:</span>
                    <span className="text-xs font-bold text-gray-700 bg-white px-2 py-1 rounded shadow-sm border border-gray-200">
                      {getAgentName(selectedChat.assigned_to) || 'Nenhum'}
                    </span>
                  </div>

                  {/* Admin: Dropdown para atribuir a qualquer membro */}
                  {userRole === 'admin' && (
                    <div className="relative">
                      <button
                        onClick={() => setAssignDropdownOpen(!assignDropdownOpen)}
                        className="px-3 py-1.5 bg-[#00a884] text-white text-xs font-bold rounded hover:bg-[#008f6f] shadow-sm ml-2 flex items-center gap-1"
                      >
                        Atribuir <ChevronDown size={12} />
                      </button>
                      {assignDropdownOpen && (
                        <div className="absolute right-0 top-full mt-1 w-52 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl z-50 overflow-hidden">
                          <div className="p-2 border-b border-gray-100 dark:border-gray-700">
                            <span className="text-[10px] text-gray-400 uppercase font-bold">Atribuir a...</span>
                          </div>
                          <div className="max-h-48 overflow-y-auto">
                            {/* Opção de liberar */}
                            {selectedChat.assigned_to && (
                              <button
                                onClick={() => handleAssignToAgent('')}
                                className="w-full flex items-center gap-2 px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-700 text-left border-b border-gray-100 dark:border-gray-700"
                              >
                                <Unlock size={14} className="text-gray-400" />
                                <span className="text-xs text-red-500 font-medium">Liberar Chat</span>
                              </button>
                            )}
                            {teamMembers.map(member => {
                              const memberStatus = getTeamMemberStatus(member);
                              const isCurrentAssignee = selectedChat.assigned_to === member.id;
                              return (
                                <button
                                  key={member.id}
                                  onClick={() => handleAssignToAgent(member.id)}
                                  disabled={isCurrentAssignee}
                                  className={`w-full flex items-center gap-2 px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-700 text-left ${isCurrentAssignee ? 'opacity-50 cursor-default bg-gray-50 dark:bg-gray-700' : ''}`}
                                >
                                  <div className="relative">
                                    <div className="w-6 h-6 bg-gray-200 dark:bg-gray-600 rounded-full flex items-center justify-center text-gray-500">
                                      <User size={12} />
                                    </div>
                                    <span className={`absolute -bottom-0.5 -right-0.5 w-2 h-2 ${memberStatus.color} rounded-full border border-white dark:border-gray-800`}></span>
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <span className="text-xs font-medium text-gray-800 dark:text-gray-200 truncate block">
                                      {member.name}{member.id === user.id ? ' (Você)' : ''}
                                    </span>
                                    <span className={`text-[10px] ${memberStatus.label === 'Disponível' ? 'text-green-500' : memberStatus.label === 'Ocupado' ? 'text-yellow-500' : 'text-gray-400'}`}>
                                      {memberStatus.label}
                                    </span>
                                  </div>
                                  {isCurrentAssignee && (
                                    <Check size={12} className="text-[#00a884]" />
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Atendente: Apenas Assumir/Soltar */}
                  {userRole === 'atendente' && (
                    <>
                      {selectedChat.assigned_to === user.id && (
                        <button
                          onClick={handleFreeAssignment}
                          className="px-3 py-1.5 bg-gray-200 text-gray-700 text-xs font-bold rounded hover:bg-gray-300 shadow-sm ml-2 flex items-center gap-1"
                        >
                          <Unlock size={14} /> Soltar
                        </button>
                      )}
                      {selectedChat.assigned_to !== user.id && selectedChat.assigned_to !== null && selectedChat.assigned_to !== undefined && (
                        <span className="px-3 py-1.5 bg-gray-100 text-gray-500 text-xs font-bold rounded border border-gray-200 shadow-sm ml-2 flex items-center gap-1">
                          {getAgentName(selectedChat.assigned_to)} atendendo
                        </span>
                      )}
                      {!selectedChat.assigned_to && (
                        <button
                          onClick={handleAssignToMe}
                          className="px-3 py-1.5 bg-[#00a884] text-white text-xs font-bold rounded hover:bg-[#008f6f] shadow-sm ml-2"
                        >
                          Assumir
                        </button>
                      )}
                    </>
                  )}
                </div>
              )}
              <button className="text-gray-500 hover:text-gray-700 ml-2">
                <MoreVertical size={20} />
              </button>
            </div>
          </header>

          {/* Chat Messages */}
          <div className="flex-1 p-6 overflow-y-auto flex flex-col space-y-4">
            <div className="self-center bg-[#d1f4ff] dark:bg-[#182229] text-[#111b21] dark:text-[#f8d05a] px-3 py-1 text-[11px] rounded uppercase tracking-wider font-semibold shadow-sm text-center">
              Protegido e criptografado de ponta a ponta
            </div>

            {messages.length === 0 && (
              <div className="flex-1 flex items-center justify-center text-gray-500 text-sm">
                Nenhuma mensagem carregada.
              </div>
            )}

            {messages.map(msg => {
              let textToRender = msg.text || '';
              let msgMeta: any = null;
              const metaMatch = textToRender.match(/^\[META\](.*?)\[\/META\]\n?(.*)/s);
              if (metaMatch) {
                try { msgMeta = JSON.parse(metaMatch[1]); } catch (e) { }
                textToRender = metaMatch[2];
              }

              return (
                <div key={msg.id} className={`flex max-w-[85%] gap-2 ${msg.is_incoming ? 'self-start items-start' : 'self-end'}`}>
                  {msg.is_incoming && selectedChat.phone_number.includes('@g.us') && (
                    <div 
                      className="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-700 flex-shrink-0 flex items-center justify-center overflow-hidden shadow-sm border border-gray-300 dark:border-gray-600 mt-1 cursor-pointer hover:opacity-80 transition-opacity"
                      onClick={() => {
                        if (msgMeta?.number) {
                          fetchContactDetails(msgMeta.number);
                          setIsContactProfileOpen(true);
                        }
                      }}
                    >
                      {msgMeta?.pic ? <img src={msgMeta.pic} className="w-full h-full object-cover" /> : <User size={16} className="text-gray-500" />}
                    </div>
                  )}
                <div className={`${(msg.media_type?.startsWith('audio/') || msg.media_type === 'video/ogg') ? 'pt-1.5 px-2 pb-1' : 'p-3'} rounded-lg shadow-sm relative ${msg.is_incoming ? 'bg-white dark:bg-[#202c33] rounded-tl-none' : 'bg-[#dcf8c6] dark:bg-[#005c4b] rounded-tr-none'}`}>
                    {/* Nome do Remetente em Grupos (Incoming) */}
                    {msg.is_incoming && selectedChat.phone_number.includes('@g.us') && msgMeta && (
                      <div 
                        className="text-[12px] font-bold mb-1 text-[#00a884] dark:text-[#06cf9c] truncate max-w-[240px] cursor-pointer hover:underline"
                        onClick={() => {
                          if (msgMeta?.number) {
                            fetchContactDetails(msgMeta.number);
                            setIsContactProfileOpen(true);
                          }
                        }}
                      >
                        {msgMeta.name || (msgMeta.pushname ? `${msgMeta.pushname} (${formatPhoneNumber(msgMeta.number)})` : formatPhoneNumber(msgMeta.number))}
                      </div>
                    )}
                    
                    {!msg.is_incoming && msg.sender_id !== 'client' && msg.sender_id !== 'agent' && (
                      <div className="text-[10px] text-gray-500 dark:text-gray-400 font-bold mb-1 uppercase">
                        {agents[msg.sender_id]?.split(' ')[0] || 'Atendente'}
                      </div>
                    )}
                    {msg.media_url && (
                      <div className="mb-2 max-w-[280px] rounded overflow-hidden">
                        {msg.media_type?.startsWith('image/') ? (
                          <img
                            src={`http://${window.location.hostname}:3001${msg.media_url}`}
                            alt="Mídia Recebida"
                            className="w-full h-auto object-cover rounded cursor-zoom-in hover:opacity-90 transition-opacity"
                            onClick={() => setFullscreenImage(`http://${window.location.hostname}:3001${msg.media_url}`)}
                          />
                        ) : msg.media_type?.startsWith('video/') ? (
                          <video src={`http://${window.location.hostname}:3001${msg.media_url}`} controls className="w-full h-auto rounded" />
                        ) : msg.media_type?.startsWith('audio/') || msg.media_type === 'video/ogg' ? (
                          <div className="min-w-[270px]">
                            <AudioPlayer
                              src={`http://${window.location.hostname}:3001${msg.media_url}`}
                              senderPic={msgMeta?.pic || null}
                              isIncoming={msg.is_incoming}
                              msgTimestamp={formatTime(msg.timestamp)}
                              msgStatus={msg.status}
                              onProfileClick={() => {
                                if (msgMeta?.number) {
                                  fetchContactDetails(msgMeta.number);
                                  setIsContactProfileOpen(true);
                                }
                              }}
                            />
                          </div>
                        ) : (
                          <a href={`http://${window.location.hostname}:3001${msg.media_url}`} target="_blank" rel="noreferrer" className="text-blue-500 underline text-sm flex items-center">
                            <Paperclip size={14} className="mr-1" /> Arquivo Anexo
                          </a>
                        )}
                      </div>
                    )}
                    {textToRender && (
                      <p className="text-sm text-gray-800 dark:text-gray-100 leading-relaxed break-words whitespace-pre-wrap">
                        {textToRender.replace(/^~.*:\n/, '')}
                        {!(msg.media_type?.startsWith('audio/') || msg.media_type === 'video/ogg') && (
                          <span className="float-right flex items-center gap-1 ml-2 mt-2 select-none">
                            <span className="text-xs text-gray-400">{formatTime(msg.timestamp)}</span>
                            {!msg.is_incoming && (
                              <span className="flex items-center">
                                {msg.status === 'read' ? <CheckCheck size={14} className="text-blue-500" /> : 
                                 msg.status === 'delivered' ? <CheckCheck size={14} className="text-gray-400" /> : 
                                 msg.status === 'sent' ? <Check size={14} className="text-gray-400" /> :
                                 <Clock size={12} className="text-gray-400" />}
                              </span>
                            )}
                          </span>
                        )}
                      </p>
                    )}

                    {!textToRender && !(msg.media_type?.startsWith('audio/') || msg.media_type === 'video/ogg') && (
                      <div className="flex items-center justify-end gap-1 mt-1">
                        <span className="text-xs text-gray-400 block text-right">{formatTime(msg.timestamp)}</span>
                        {!msg.is_incoming && (
                          <span className="flex items-center">
                            {msg.status === 'read' ? <CheckCheck size={14} className="text-blue-500" /> : 
                             msg.status === 'delivered' ? <CheckCheck size={14} className="text-gray-400" /> : 
                             msg.status === 'sent' ? <Check size={14} className="text-gray-400" /> :
                             <Clock size={12} className="text-gray-400" />}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Area */}
          {selectedChat.assigned_to && selectedChat.assigned_to !== user.id ? (
            <footer className="bg-[#f0f2f5] p-4 border-t border-gray-200 flex items-center justify-center text-gray-500 text-sm">
              <Lock size={16} className="mr-2" />
              Esta conversa está sendo atendida por {getAgentName(selectedChat.assigned_to)}. Apenas visualização.
            </footer>
          ) : (
            <footer className="bg-[#f0f2f5] dark:bg-gray-800 p-3 border-t border-gray-200 dark:border-gray-700">
              <div className="flex items-center space-x-3">
                <button className="text-gray-500 hover:text-gray-700">
                  <Paperclip size={24} />
                </button>
                <form onSubmit={handleSendMessage} className="flex-1 flex">
                  <input
                    type="text"
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    placeholder="Digite uma mensagem..."
                    className="flex-1 bg-white border-none rounded-lg px-4 py-2 text-sm ring-1 ring-gray-200 outline-none focus:ring-1 focus:ring-[#00a884]"
                  />
                </form>
                <button
                  onClick={handleSendMessage}
                  disabled={!newMessage.trim()}
                  className={`w-10 h-10 ${newMessage.trim() ? 'bg-[#00a884]' : 'bg-gray-300'} text-white rounded-full flex items-center justify-center transition-colors disabled:opacity-50`}
                >
                  <Send size={18} className="ml-1" />
                </button>
              </div>
            </footer>
          )}
        </main>
      ) : (
        <main className="flex-1 flex flex-col items-center justify-center bg-[#f0f2f5] dark:bg-[#0b141a] text-center px-10 border-b-8 border-[#00a884]">
          <div className="bg-white dark:bg-gray-800 p-6 rounded-full shadow-sm mb-6 text-[#00a884]">
            <MessageSquare size={64} />
          </div>
          <h2 className="text-2xl font-light text-gray-800 dark:text-gray-100 mb-4">WhatsApp Compartilhado</h2>
          <p className="text-gray-500 dark:text-gray-400 max-w-md text-sm">
            Selecione uma conversa para começar a atender. Todos os atendentes podem usar esta interface simultaneamente, atribuindo os chats a eles mesmos.
          </p>
        </main>
      )}

      {/* Profile Sidebar (Far-Right) */}
      {selectedChat && isContactProfileOpen && (
        <aside className="w-80 bg-[#f0f2f5] dark:bg-gray-900 border-l border-gray-200 dark:border-gray-700 flex flex-col shadow-xl z-20 overflow-y-auto">
          <div className="h-16 bg-[#f0f2f5] dark:bg-gray-800 flex items-center px-6 border-b border-gray-200 dark:border-gray-700 shrink-0">
            <button onClick={() => setIsContactProfileOpen(false)} className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white mr-4">
              <svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
            <h2 className="font-semibold text-gray-800 dark:text-gray-100">Dados do Contato</h2>
          </div>

          <div className="bg-white dark:bg-gray-800 p-6 flex flex-col items-center text-center border-b border-gray-200 dark:border-gray-700 mb-2 shadow-sm">
            <div className="w-48 h-48 rounded-full overflow-hidden mb-4 shadow-md bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-gray-400">
              {contactDetails ? (
                contactDetails.profilePicUrl ? (
                  <img
                    src={contactDetails.profilePicUrl}
                    alt="Profile"
                    className="w-full h-full object-cover cursor-pointer hover:opacity-90"
                    onClick={() => setFullscreenImage(contactDetails.profilePicUrl)}
                  />
                ) : selectedChat.phone_number.includes('@g.us') ? (
                  <Users size={64} />
                ) : (
                  <User size={64} />
                )
              ) : selectedChat.profile_pic_url ? (
                <img
                  src={selectedChat.profile_pic_url}
                  alt="Profile"
                  className="w-full h-full object-cover cursor-pointer hover:opacity-90"
                  onClick={() => setFullscreenImage(selectedChat.profile_pic_url)}
                />
              ) : selectedChat.phone_number.includes('@g.us') ? (
                <Users size={64} />
              ) : (
                <User size={64} />
              )}
            </div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-1">
              {contactDetails?.number && contactDetails.number !== selectedChat.phone_number.split('@')[0]
                ? (contactDetails.name || contactDetails.pushname || formatPhoneNumber(contactDetails.number))
                : (selectedChat.contact_name || formatPhoneNumber(selectedChat.phone_number))}
            </h2>

            <p className="text-gray-600 dark:text-gray-300 text-sm font-bold mt-2">
              {contactDetails?.groupData ? (
                'Grupo'
              ) : (
                (() => {
                  // Usa sempre o número do @c.us do chat como fonte da verdade
                  const rawPhone = selectedChat.phone_number.split('@')[0];
                  return `Celular: +${rawPhone}`;
                })()
              )}
            </p>
            <p className="text-gray-400 text-xs mt-1 bg-gray-100 px-2 py-1 rounded">
              ID Interno: {contactDetails?.number ? (contactDetails.groupData ? `${contactDetails.number}@g.us` : `${contactDetails.number}@c.us`) : selectedChat.phone_number}
            </p>

            {contactDetails && contactDetails.pushname && contactDetails.pushname !== selectedChat.contact_name && (
              <p className="text-gray-400 text-xs mt-2">Nome no WhatsApp: ~{contactDetails.pushname}</p>
            )}
          </div>

          {contactDetails?.groupData && (
            <div className="bg-white dark:bg-gray-800 p-5 border-y border-gray-200 dark:border-gray-700 mb-2 shadow-sm">
              <h3 className="text-[#00a884] text-xs font-bold uppercase mb-2">Descrição do Grupo</h3>
              <p className="text-gray-800 dark:text-gray-200 text-sm whitespace-pre-wrap">{contactDetails.groupData.description || 'Sem descrição'}</p>
            </div>
          )}

          {contactDetails?.groupData && (
            <div className="bg-white dark:bg-gray-800 p-5 border-y border-gray-200 dark:border-gray-700 mb-2 shadow-sm">
              <h3 className="text-[#00a884] text-xs font-bold uppercase mb-2 flex justify-between">
                <span>Participantes ({contactDetails.groupData.participants.length})</span>
              </h3>
              <div className="flex flex-col gap-3 mt-3 max-h-60 overflow-y-auto pr-2">
                {contactDetails.groupData.participants.map((p: any) => (
                  <div key={p.id} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-gray-500 overflow-hidden">
                        <User size={16} />
                      </div>
                      <div className="flex flex-col">
                        <span className="text-sm text-gray-800 dark:text-gray-200 font-medium">{p.name}</span>
                        <span className="text-[10px] text-gray-500">{formatPhoneNumber(p.id)}</span>
                      </div>
                    </div>
                    {p.isAdmin && (
                      <span className="text-[10px] bg-[#00a884] text-white px-2 py-0.5 rounded uppercase font-bold">Admin</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="bg-white dark:bg-gray-800 p-5 border-y border-gray-200 dark:border-gray-700 mb-2 shadow-sm">
            <div className="flex justify-between items-center mb-2">
              <h3 className="text-[#00a884] text-xs font-bold uppercase">Anotações Internas</h3>
              {chatNotes !== (chats.find(c => c.id === selectedChatId)?.notes || '') && (
                <button 
                  onClick={saveNotes}
                  disabled={isSavingNotes}
                  className="text-[10px] bg-[#00a884] text-white px-2 py-1 rounded hover:bg-[#008f6f] transition-colors disabled:opacity-50"
                >
                  {isSavingNotes ? 'Salvando...' : 'Salvar'}
                </button>
              )}
            </div>
            <textarea
              className="w-full h-24 p-2 text-sm bg-yellow-50 dark:bg-gray-700/50 border border-yellow-100 dark:border-gray-600 rounded focus:outline-none focus:ring-1 focus:ring-[#00a884] text-gray-800 dark:text-gray-200 resize-none"
              placeholder="Adicione observações sobre este cliente/grupo aqui..."
              value={chatNotes}
              onChange={(e) => setChatNotes(e.target.value)}
            />
          </div>

          <div className="bg-white dark:bg-gray-800 p-5 border-y border-gray-200 dark:border-gray-700 mb-2 shadow-sm">
            <h3 className="text-[#00a884] text-xs font-bold uppercase mb-2">Recado (About)</h3>
            <p className="text-gray-800 dark:text-gray-200 text-sm">{contactDetails?.about || 'Disponível'}</p>
          </div>

          <div className="bg-white dark:bg-gray-800 p-5 border-y border-gray-200 dark:border-gray-700 shadow-sm flex-1">
            <h3 className="text-gray-500 text-xs font-bold uppercase mb-4 flex justify-between items-center">
              Mídias, links e docs
              <span className="text-blue-500 cursor-pointer">Ver todos</span>
            </h3>
            <div className="grid grid-cols-3 gap-2">
              {messages.filter(m => m.media_url).slice(-6).reverse().map((msg, idx) => (
                <div key={idx} className="aspect-square bg-gray-100 rounded overflow-hidden cursor-pointer hover:opacity-80 transition-opacity">
                  {msg.media_type?.startsWith('image/') ? (
                    <img src={`http://${window.location.hostname}:3001${msg.media_url}`} alt="Media" className="w-full h-full object-cover" onClick={() => setFullscreenImage(`http://${window.location.hostname}:3001${msg.media_url}`)} />
                  ) : msg.media_type?.startsWith('video/') ? (
                    <div className="w-full h-full bg-black flex items-center justify-center text-white"><svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" strokeWidth="2" fill="none"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg></div>
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-500"><Paperclip size={24} /></div>
                  )}
                </div>
              ))}
              {messages.filter(m => m.media_url).length === 0 && (
                <div className="col-span-3 text-center text-gray-400 text-xs py-4">Nenhuma mídia encontrada.</div>
              )}
            </div>
          </div>
        </aside>
      )}

      {fullscreenImage && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4 cursor-zoom-out"
          onClick={() => setFullscreenImage(null)}
        >
          <img src={fullscreenImage} alt="Fullscreen" className="max-w-full max-h-full object-contain" />
        </div>
      )}
    </div>
  );
}
