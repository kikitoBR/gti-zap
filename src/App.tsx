import React, { useState, useEffect, useRef } from 'react';
import { Search, MoreVertical, Paperclip, Send, User, Check, CheckCheck, MessageSquare, Users, Settings as SettingsIcon, LogOut, Lock, Unlock, Plus, Clock, Moon, Sun, Shield, ChevronDown, X, FileUp, Image, Headphones, UserPlus, Trash2, Sparkles, Loader2, Reply, Pencil, Ban, Smile, FileText } from 'lucide-react';
import { supabase } from './lib/supabase';
import Login from './Login';
import AudioPlayer from './components/AudioPlayer';
import Settings from './components/Settings';

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
  whatsapp_id?: string;
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

type ChatNote = {
  id: string;
  chat_id: string;
  user_id: string;
  text: string;
  created_at: string;
};

type WhatsAppContact = {
  id: string;
  name: string;
  number: string;
  pushname: string;
};

export default function App() {
  const [user, setUser] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<'all' | 'mine' | 'groups' | 'team'>('all');
  const [showSettings, setShowSettings] = useState(false);
  const [userSignature, setUserSignature] = useState<string | null>(null);
  const [userAvatar, setUserAvatar] = useState<string | null>(null);
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const selectedChatIdRef = useRef<string | null>(null);

  // Sincroniza o Ref com o State para evitar stale closure no Realtime
  useEffect(() => {
    selectedChatIdRef.current = selectedChatId;
  }, [selectedChatId]);


  const [newMessage, setNewMessage] = useState('');
  const [replyToMessage, setReplyToMessage] = useState<Message | null>(null);
  const [editMessage, setEditMessage] = useState<Message | null>(null);

  const [isComposing, setIsComposing] = useState(false);
  const [composePhone, setComposePhone] = useState('');
  const [composeText, setComposeText] = useState('');

  const [isContactProfileOpen, setIsContactProfileOpen] = useState(false);
  const [contactDetails, setContactDetails] = useState<any>(null);

  const [fullscreenMedia, setFullscreenMedia] = useState<{ url: string; type: string } | null>(null);
  const [isDarkMode, setIsDarkMode] = useState(() => localStorage.getItem('theme') === 'dark');
  const [chatFontSize, setChatFontSize] = useState(() => parseInt(localStorage.getItem('chatFontSize') || '14'));
  const [chatNotes, setChatNotes] = useState<ChatNote[]>([]);
  const [newNoteText, setNewNoteText] = useState('');
  const [isSavingNote, setIsSavingNote] = useState(false);
  const [attachMenuOpen, setAttachMenuOpen] = useState(false);
  const [sendingMedia, setSendingMedia] = useState(false);
  const [contactPickerOpen, setContactPickerOpen] = useState(false);
  const [whatsappContacts, setWhatsappContacts] = useState<WhatsAppContact[]>([]);
  const [contactSearch, setContactSearch] = useState('');
  const [loadingContacts, setLoadingContacts] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState<string[]>([]);
  const [loadingAI, setLoadingAI] = useState(false);
  const [showAiPanel, setShowAiPanel] = useState(false);
  const attachFileRef = useRef<HTMLInputElement>(null);
  const attachImageRef = useRef<HTMLInputElement>(null);
  const attachAudioRef = useRef<HTMLInputElement>(null);

  const [deleteMenuId, setDeleteMenuId] = useState<string | null>(null);
  const [reactionMenuId, setReactionMenuId] = useState<string | null>(null);
  const [transcribingMessageId, setTranscribingMessageId] = useState<string | null>(null);
  const [toastNotification, setToastNotification] = useState<{ id: string, name: string, text: string, chatId: string } | null>(null);
  
  // Typing Indicator State
  const [typingUsers, setTypingUsers] = useState<Record<string, Record<string, string>>>({});
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const typingChannelRef = useRef<any>(null);

  // Fechar menus ao clicar fora
  useEffect(() => {
    const handleClickOutside = () => {
      setDeleteMenuId(null);
      setReactionMenuId(null);
    };
    if (deleteMenuId || reactionMenuId) {
      document.addEventListener('click', handleClickOutside);
    }
    return () => document.removeEventListener('click', handleClickOutside);
  }, [deleteMenuId, reactionMenuId]);

  // Persistir tema
  useEffect(() => {
    localStorage.setItem('theme', isDarkMode ? 'dark' : 'light');
  }, [isDarkMode]);

  useEffect(() => {
    localStorage.setItem('chatFontSize', String(chatFontSize));
  }, [chatFontSize]);

  const [chats, setChats] = useState<Chat[]>([]);
  const chatsRef = useRef<Chat[]>([]);
  useEffect(() => {
    chatsRef.current = chats;
  }, [chats]);
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

    // Solicitar permissão de notificação
    if (Notification.permission === 'default') {
      Notification.requestPermission();
    }

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
        .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, payload => {
          handleMessageChange(payload);
        })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'users' }, payload => {
        const updatedUser = payload.new as TeamMember;
        if (updatedUser && updatedUser.id && updatedUser.name) {
          setAgents(prev => ({ ...prev, [updatedUser.id]: updatedUser.name }));
          setTeamMembers(prev => prev.map(m => m.id === updatedUser.id ? { ...m, ...updatedUser } : m));
        }
      })
      .subscribe();

    // Setup Typing Indicator Channel (Broadcast)
    const typingChannel = supabase.channel('typing_indicators');
    typingChannelRef.current = typingChannel;
    
    typingChannel.on('broadcast', { event: 'typing' }, payload => {
      const { chatId, agentId, agentName, isTyping } = payload.payload;
      setTypingUsers(prev => {
        const chatTyping = { ...(prev[chatId] || {}) };
        if (isTyping) {
          chatTyping[agentId] = agentName;
        } else {
          delete chatTyping[agentId];
        }
        return { ...prev, [chatId]: chatTyping };
      });
    }).subscribe();

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
    const { data: usersData } = await supabase.from('users').select('id, name, email, role, status, last_seen_at, signature, avatar_url');
    if (usersData) {
      const agentsMap: Record<string, string> = {};
      usersData.forEach(u => agentsMap[u.id] = u.name);
      setAgents(agentsMap);
      setTeamMembers(usersData as TeamMember[]);

      // Define a role do usuário logado
      const currentUser = usersData.find(u => u.id === user.id);
      if (currentUser?.role) setUserRole(currentUser.role as 'admin' | 'atendente');
      if (currentUser) {
        setUserSignature((currentUser as any).signature || null);
        setUserAvatar((currentUser as any).avatar_url || null);
      }
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
        }
      }
      // Fetch structured notes
      fetchChatNotes(selectedChatId);
    } else {
      setMessages([]);
      setIsContactProfileOpen(false);
      setChatNotes([]);
      setNewNoteText('');
      setReplyToMessage(null);
      setEditMessage(null);
    }
  }, [selectedChatId]);

  const fetchChatNotes = async (chatId: string) => {
    const { data } = await supabase
      .from('chat_notes')
      .select('*')
      .eq('chat_id', chatId)
      .order('created_at', { ascending: false });
    if (data) setChatNotes(data);
  };

  const addNote = async () => {
    if (!selectedChatId || !newNoteText.trim()) return;
    setIsSavingNote(true);
    try {
      const { error } = await supabase
        .from('chat_notes')
        .insert([{
          chat_id: selectedChatId,
          user_id: user.id,
          text: newNoteText.trim()
        }]);
      if (error) throw error;
      setNewNoteText('');
      await fetchChatNotes(selectedChatId);
    } catch (err) {
      console.error('Erro ao salvar anotação:', err);
      alert('Erro ao salvar. Verifique se a tabela chat_notes existe no Supabase (execute migration_notes.sql).');
    } finally {
      setIsSavingNote(false);
    }
  };

  const deleteNote = async (noteId: string) => {
    try {
      let query = supabase
        .from('chat_notes')
        .delete()
        .eq('id', noteId);

      // Admins podem apagar qualquer anotação; atendentes só suas próprias
      if (userRole !== 'admin') {
        query = query.eq('user_id', user.id);
      }

      const { error } = await query;
      if (error) throw error;
      setChatNotes(prev => prev.filter(n => n.id !== noteId));
    } catch (err) {
      console.error('Erro ao deletar anotação:', err);
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
      setChats(prev => {
        if (prev.find(c => c.id === payload.new.id)) return prev;
        return [payload.new as Chat, ...prev].sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
      });
    } else if (payload.eventType === 'UPDATE') {
      setChats(prev => prev.map(c => c.id === payload.new.id ? payload.new as Chat : c).sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()));
    } else if (payload.eventType === 'DELETE') {
      const deletedId = payload.old.id;
      setChats(prev => prev.filter(c => c.id !== deletedId));
    }
  };

  const handleMessageChange = (payload: any) => {
    if (payload.eventType === 'INSERT') {
      console.log('[Realtime] Nova mensagem detectada:', payload.new);
      handleNewMessage(payload.new as Message);
    } else if (payload.eventType === 'UPDATE') {
      const updatedMsg = payload.new as Message;
      // Atualiza o status da mensagem se ela já estiver na lista
      setMessages(prev => prev.map(m => m.id === updatedMsg.id ? { ...m, ...updatedMsg } : m));
    } else if (payload.eventType === 'DELETE') {
      const deletedId = payload.old.id;
      setMessages(prev => prev.filter(m => m.id !== deletedId));
    }
  };

  const handleNewMessage = (newMsg: Message) => {
    console.log('[DEBUG] Processando nova mensagem para notificação:', { 
      id: newMsg.id, 
      isIncoming: newMsg.is_incoming,
      text: newMsg.text?.slice(0, 20)
    });

    // Som e Notificação para mensagens recebidas
    if (newMsg.is_incoming) {
      if (document.hidden || newMsg.chat_id !== selectedChatIdRef.current) {
        // Toca o som (Usando o arquivo local notification.ogg)
        const audio = new Audio('/notification.ogg');
        audio.volume = 0.6;
        audio.play().catch(e => {
          console.warn('[DEBUG] Browser bloqueou o som local:', e);
        });

        const chat = chatsRef.current.find(c => c.id === newMsg.chat_id);
        const senderName = chat?.contact_name || 'GTI-ZAP';
        
        // Remove tags de metadados ([META], [REPLY], [TRANSCRIPT]) para não poluir a notificação
        let msgText = newMsg.text || '';
        msgText = msgText.replace(/\[(META|REPLY|TRANSCRIPT)\][\s\S]*?\[\/\1\]\n?/g, '').trim();
        if (!msgText) msgText = '📷 Mídia recebida';

        // Notificação Visual (Browser)
        if (Notification.permission === 'granted') {
          const n = new Notification(senderName, {
            body: msgText,
            icon: 'https://cdn-icons-png.flaticon.com/512/733/733585.png',
            tag: newMsg.chat_id,
            renotify: true
          });

          n.onclick = () => {
            window.focus();
            if (newMsg.chat_id) {
              setSelectedChatId(newMsg.chat_id);
            }
          };
        } else if (Notification.permission !== 'denied') {
          Notification.requestPermission();
        }

        // In-App Toast Visual (Fallback 100% confiável)
        setToastNotification({
          id: newMsg.id,
          name: senderName,
          text: msgText,
          chatId: newMsg.chat_id
        });
        setTimeout(() => setToastNotification(null), 5000);
      }
    }

    // Só adiciona à tela se for para o chat que está aberto no momento
    // Usamos o Ref para garantir que temos o ID atualizado mesmo dentro do callback do Realtime
    if (newMsg.chat_id === selectedChatIdRef.current) {
      setMessages(prev => {
        // Evita duplicados (checa se o ID da mensagem já existe na lista atual)
        if (prev.find(m => m.id === newMsg.id)) return prev;
        return [...prev, newMsg];
      });
    } else {
      console.log(`[Realtime] Mensagem recebida para chat ${newMsg.chat_id}, mas o chat aberto é ${selectedChatIdRef.current}`);
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !selectedChat) return;

    const currentUserName = userSignature || agents[user.id] || user.email.split('@')[0] || 'Atendente';
    const text = `*${currentUserName}*\n\n${newMessage.trim()}`;
    const cleanNewMessage = newMessage.trim();
    setNewMessage('');
    const currentReplyTo = replyToMessage;
    setReplyToMessage(null);

    if (editMessage) {
      const currentEditMessage = editMessage;
      setEditMessage(null);
      
      let fullNewText = currentEditMessage.text || '';
      let metaAndReplyTags = '';
      const metaMatch = fullNewText.match(/\[(META|REPLY)\].*?\[\/\1\]\n?/g);
      if (metaMatch) {
        metaMatch.forEach(m => {
          metaAndReplyTags += m;
        });
      }
      
      const whatsappText = `*${currentUserName}*\n\n${cleanNewMessage}`;
      const dbText = metaAndReplyTags + whatsappText;

      try {
        await fetch(`http://${window.location.hostname}:3001/edit`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            whatsappId: currentEditMessage.whatsapp_id,
            phoneNumber: selectedChat.phone_number,
            whatsappText: whatsappText,
            dbText: dbText
          })
        });
      } catch (err) {
        console.error('Erro ao editar msg:', err);
      }
      return;
    }

    // Enviar via Backend API (que envia pelo WhatsApp Web JS)
    try {
      await fetch(`http://${window.location.hostname}:3001/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chatId: selectedChat.id,
          phoneNumber: selectedChat.phone_number,
          text: text,
          agentId: user.id,
          quotedMsgId: currentReplyTo?.whatsapp_id,
          quotedMsgIsIncoming: currentReplyTo?.is_incoming
        })
      });
    } catch (err) {
      console.error('Erro ao enviar msg:', err);
    }
  };

  const handleDeleteMessage = async (msg: Message, forEveryone: boolean) => {
    if (!selectedChat) return;
    try {
      await fetch(`http://${window.location.hostname}:3001/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          whatsappId: msg.whatsapp_id,
          phoneNumber: selectedChat.phone_number,
          forEveryone
        })
      });
    } catch (err) {
      console.error('Erro ao apagar msg:', err);
    }
  };

  const handleReact = async (msg: Message, reaction: string) => {
    if (!selectedChat) return;
    try {
      await fetch(`http://${window.location.hostname}:3001/react`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          whatsappId: msg.whatsapp_id,
          phoneNumber: selectedChat.phone_number,
          reaction
        })
      });
      setReactionMenuId(null);
    } catch (err) {
      console.error('Erro ao reagir à msg:', err);
    }
  };

  const handleTranscribe = async (msg: Message) => {
    if (!selectedChat) return;
    setTranscribingMessageId(msg.whatsapp_id);
    try {
      await fetch(`http://${window.location.hostname}:3001/transcribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          whatsappId: msg.whatsapp_id,
          phoneNumber: selectedChat.phone_number
        })
      });
      // A atualização real-time via Supabase mostrará a transcrição
    } catch (err) {
      console.error('Erro ao solicitar transcrição:', err);
    } finally {
      setTranscribingMessageId(null);
    }
  };

  const handleSendNewMessage = async () => {
    if (!composePhone.trim() || !composeText.trim()) return;

    const currentUserName = userSignature || agents[user.id] || user.email.split('@')[0] || 'Atendente';
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

  const handleTyping = (text: string) => {
    setNewMessage(text);
    
    if (!selectedChatId || !user) return;
    
    // Broadcast isTyping: true
    if (typingChannelRef.current) {
      typingChannelRef.current.send({
        type: 'broadcast',
        event: 'typing',
        payload: { chatId: selectedChatId, agentId: user.id, agentName: user.user_metadata?.name || user.email?.split('@')[0] || 'Agente', isTyping: true }
      });
    }

    // Debounce to clear typing status
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      if (typingChannelRef.current) {
        typingChannelRef.current.send({
          type: 'broadcast',
          event: 'typing',
          payload: { chatId: selectedChatId, agentId: user.id, agentName: user.user_metadata?.name || user.email?.split('@')[0] || 'Agente', isTyping: false }
        });
      }
    }, 3000);
  };

  const handleAssignToMe = async () => {
    if (!selectedChatId || !user) return;
    await supabase.from('chats').update({
      assigned_to: user.id,
      updated_at: new Date().toISOString()
    }).eq('id', selectedChatId);
  };

  const handleFreeAssignment = async () => {
    if (!selectedChatId) return;
    await supabase.from('chats').update({
      assigned_to: null,
      updated_at: new Date().toISOString()
    }).eq('id', selectedChatId);
  };

  const handleAssignToAgent = async (agentId: string) => {
    if (!selectedChatId) return;
    await supabase.from('chats').update({
      assigned_to: agentId || null,
      updated_at: new Date().toISOString()
    }).eq('id', selectedChatId);
    setAssignDropdownOpen(false);
  };

  const handleLogout = async () => {
    await supabase.from('users').update({ status: 'offline', last_seen_at: null }).eq('id', user.id);
    await supabase.auth.signOut();
  };

  const handleSendMedia = async (file: File) => {
    if (!selectedChat) return;
    setSendingMedia(true);
    setAttachMenuOpen(false);

    const currentUserName = userSignature || agents[user.id] || user.email.split('@')[0] || 'Atendente';
    const caption = `*${currentUserName}*`;

    const formData = new FormData();
    formData.append('media', file);
    formData.append('chatId', selectedChat.id);
    formData.append('phoneNumber', selectedChat.phone_number);
    formData.append('agentId', user.id);
    formData.append('caption', caption);
    if (replyToMessage?.whatsapp_id) {
      formData.append('quotedMsgId', replyToMessage.whatsapp_id);
      formData.append('quotedMsgIsIncoming', String(replyToMessage.is_incoming));
    }
    const currentReplyTo = replyToMessage;
    setReplyToMessage(null);

    try {
      const res = await fetch(`http://${window.location.hostname}:3001/send-media`, {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (!data.success) {
        alert('Erro ao enviar mídia: ' + (data.error || 'Erro desconhecido'));
      }
    } catch (err) {
      console.error('Erro ao enviar mídia:', err);
      alert('Erro ao enviar mídia.');
    } finally {
      setSendingMedia(false);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleSendMedia(file);
    e.target.value = ''; // reset
  };

  const openContactPicker = async () => {
    setAttachMenuOpen(false);
    setContactPickerOpen(true);
    setContactSearch('');
    setLoadingContacts(true);
    try {
      const res = await fetch(`http://${window.location.hostname}:3001/contacts`);
      const data = await res.json();
      setWhatsappContacts(data);
    } catch (err) {
      console.error('Erro ao carregar contatos:', err);
    } finally {
      setLoadingContacts(false);
    }
  };

  const sendContact = async (contact: WhatsAppContact) => {
    if (!selectedChat) return;
    setContactPickerOpen(false);
    try {
      await fetch(`http://${window.location.hostname}:3001/send-contact`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chatId: selectedChat.id,
          phoneNumber: selectedChat.phone_number,
          agentId: user.id,
          contactId: contact.id
        })
      });
    } catch (err) {
      console.error('Erro ao enviar contato:', err);
      alert('Erro ao enviar contato.');
    }
  };

  const fetchAiSuggestions = async () => {
    if (!selectedChat || messages.length === 0) return;
    setLoadingAI(true);
    setShowAiPanel(true);
    setAiSuggestions([]);
    try {
      const recentMessages = messages.slice(-15).map(m => {
        let text = m.text || '';
        // Remove [META] tags para enviar texto limpo
        const metaMatch = text.match(/^\[META\](.*?)\[\/META\]\n?(.*)/s);
        if (metaMatch) text = metaMatch[2];
        return { text, is_incoming: m.is_incoming };
      }).filter(m => m.text.trim());

      const res = await fetch(`http://${window.location.hostname}:3001/ai-suggest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: recentMessages,
          contactName: selectedChat.contact_name
        })
      });
      const data = await res.json();
      setAiSuggestions(data.suggestions || []);
    } catch (err) {
      console.error('Erro ao buscar sugestões de IA:', err);
      setAiSuggestions(['A IA está demorando a responder. Tente novamente em instantes.']);
      setLoadingAI(false);
    } finally {
      setLoadingAI(false);
    }
  };

  const getTeamMemberStatus = (member: TeamMember): { label: string; color: string } => {
    const lastSeen = member.last_seen_at ? new Date(member.last_seen_at).getTime() : 0;
    const isActive = (Date.now() - lastSeen) < 60000; // 60 segundos

    if (!isActive) return { label: 'Ausente', color: 'bg-gray-400' };

    const hasAssignments = chats.some(c => c.assigned_to === member.id);
    if (hasAssignments) return { label: 'Ocupado', color: 'bg-yellow-500' };
    return { label: 'Disponível', color: 'bg-green-500' };
  };

  const scrollToMessage = (whatsappId: string) => {
    if (!whatsappId) return;
    const element = document.getElementById(`msg-${whatsappId}`);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      // Adiciona um efeito visual temporário de destaque
      element.classList.add('ring-4', 'ring-[#00a884]', 'ring-opacity-50', 'bg-yellow-50', 'dark:bg-yellow-900/20');
      setTimeout(() => {
        element.classList.remove('ring-4', 'ring-[#00a884]', 'ring-opacity-50', 'bg-yellow-50', 'dark:bg-yellow-900/20');
      }, 2000);
    }
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
      {/* Toast In-App */}
      {toastNotification && (
        <div 
          onClick={() => {
            setSelectedChatId(toastNotification.chatId);
            setToastNotification(null);
          }}
          className="absolute top-4 right-4 z-50 bg-[#00a884] dark:bg-[#06cf9c] text-white p-4 rounded-lg shadow-2xl cursor-pointer w-72 animate-in slide-in-from-right-10 fade-in duration-300 hover:scale-105 transition-all border border-[#008f6f]"
        >
          <div className="flex justify-between items-start mb-1">
            <h4 className="font-bold truncate pr-4">{toastNotification.name}</h4>
            <button 
              onClick={(e) => { e.stopPropagation(); setToastNotification(null); }} 
              className="absolute top-2 right-2 p-1 hover:bg-black/20 rounded-full text-white"
            >
              <X size={14} />
            </button>
          </div>
          <p className="text-sm line-clamp-2 opacity-90">{toastNotification.text}</p>
        </div>
      )}

      {/* Sidebar - Menu (Left) */}
      <div className="w-16 bg-[#111b21] flex flex-col items-center py-4 space-y-6">
        <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center overflow-hidden">
          <img src="/gti-logo.png" alt="GTI" className="w-full h-full object-contain p-0.1" />
        </div>
        <nav className="flex-1 flex flex-col space-y-4 items-center w-full px-2">
          <button
            onClick={() => { if (activeTab === 'groups' || activeTab === 'team') setActiveTab('all'); setShowSettings(false); }}
            className={`w-full p-2 flex justify-center rounded-lg relative transition-colors ${!showSettings && activeTab !== 'groups' && activeTab !== 'team' ? 'bg-[#2a3942] text-white' : 'text-gray-400 hover:bg-[#2a3942] hover:text-white'}`}
            title="Conversas"
          >
            <MessageSquare size={24} />
          </button>
          <button
            onClick={() => { setActiveTab('groups'); setShowSettings(false); }}
            className={`w-full p-2 flex justify-center rounded-lg relative transition-colors ${!showSettings && activeTab === 'groups' ? 'bg-[#2a3942] text-white' : 'text-gray-400 hover:bg-[#2a3942] hover:text-white'}`}
            title="Grupos"
          >
            <Users size={24} />
          </button>
          {userRole === 'admin' && (
            <button
              onClick={() => { setActiveTab('team'); setShowSettings(false); }}
              className={`w-full p-2 flex justify-center rounded-lg relative transition-colors ${!showSettings && activeTab === 'team' ? 'bg-[#2a3942] text-white' : 'text-gray-400 hover:bg-[#2a3942] hover:text-white'}`}
              title="Equipe"
            >
              <Shield size={24} />
            </button>
          )}
          <button
            onClick={() => { setShowSettings(true); setSelectedChatId(null); setIsComposing(false); }}
            className={`w-full p-2 flex justify-center rounded-lg transition-colors ${showSettings ? 'bg-[#2a3942] text-white' : 'text-gray-400 hover:bg-[#2a3942] hover:text-white'}`}
            title="Configurações"
          >
            <SettingsIcon size={24} />
          </button>
        </nav>
        <div className="mt-auto flex flex-col gap-4 items-center">
          <button onClick={() => setIsDarkMode(!isDarkMode)} className="p-2 text-gray-400 hover:text-white transition-colors" title="Alternar Tema">
            {isDarkMode ? <Sun size={24} /> : <Moon size={24} />}
          </button>
          <div
            className="w-10 h-10 rounded-full bg-gray-600 border border-gray-400 flex flex-col items-center justify-center text-white cursor-pointer group relative overflow-hidden"
            onClick={() => { setShowSettings(true); setSelectedChatId(null); setIsComposing(false); }}
          >
            {userAvatar ? (
              <img src={userAvatar} alt="Avatar" className="w-full h-full object-cover" />
            ) : (
              <User size={20} />
            )}
            <div className="absolute left-12 bg-black text-white text-xs px-2 py-1 rounded hidden group-hover:block whitespace-nowrap z-50">
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
                          <span className={`text-[11px] ${memberStatus.label === 'Disponível' ? 'text-green-600' :
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
              <div key="normal-tabs" className="flex border-b border-gray-200 dark:border-gray-700 p-1 bg-[#f0f2f5] dark:bg-gray-900">
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
              <div key="groups-tab-msg" className="p-2 bg-[#f0f2f5] dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 text-center">
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
      {showSettings ? (
        <Settings
          user={user}
          currentName={agents[user.id] || user.email}
          userRole={userRole}
          chatFontSize={chatFontSize}
          onClose={() => setShowSettings(false)}
          onProfileUpdated={() => fetchInitialData()}
          onFontSizeChange={(size) => setChatFontSize(size)}
        />
      ) : isComposing ? (
        <main className="flex-1 flex flex-col items-center justify-center bg-[#f0f2f5] dark:bg-[#0b141a] px-10 border-b-8 border-[#00a884]">
          <div className="bg-white dark:bg-gray-800 p-8 rounded-lg shadow-sm w-full max-w-md border-t-4 border-[#00a884]">
            <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100 mb-4">Nova Conversa</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Número do WhatsApp</label>
                <input
                  type="text"
                  placeholder="Ex: 5511999999999"
                  value={composePhone}
                  onChange={e => setComposePhone(e.target.value)}
                  className="w-full bg-white dark:bg-gray-700 text-gray-900 dark:text-white border border-gray-300 dark:border-gray-600 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-[#00a884] outline-none"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Digite apenas números, incluindo DDI e DDD (ex: 55 para Brasil).</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Mensagem Inicial</label>
                <textarea
                  rows={4}
                  placeholder="Olá! Como podemos ajudar?"
                  value={composeText}
                  onChange={e => setComposeText(e.target.value)}
                  className="w-full bg-white dark:bg-gray-700 text-gray-900 dark:text-white border border-gray-300 dark:border-gray-600 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-[#00a884] outline-none resize-none"
                />
              </div>
              <div className="flex justify-end space-x-2 pt-2">
                <button
                  onClick={() => setIsComposing(false)}
                  className="px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
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

                  {/* Admin: Botões de Atribuição */}
                  {userRole === 'admin' && (
                    <div className="flex items-center gap-2 ml-2">
                      {/* Botão Soltar (visível se alguém estiver atribuído) */}
                      {selectedChat.assigned_to && (
                        <button
                          onClick={handleFreeAssignment}
                          className="px-3 py-1.5 bg-rose-50 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400 text-xs font-bold rounded border border-rose-200 dark:border-rose-800 hover:bg-rose-100 dark:hover:bg-rose-900/50 shadow-sm flex items-center gap-1 transition-colors"
                        >
                          <Unlock size={14} /> Soltar
                        </button>
                      )}

                      {/* Botão Atribuir (Dropdown) */}
                      <div className="relative">
                        <button
                          onClick={() => setAssignDropdownOpen(!assignDropdownOpen)}
                          className={`px-3 py-1.5 ${selectedChat.assigned_to === user.id ? 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700' : 'bg-[#00a884] text-white hover:bg-[#008f6f]'} text-xs font-bold rounded shadow-sm flex items-center gap-1 transition-colors`}
                        >
                          {selectedChat.assigned_to === user.id ? 'Reatribuir' : 'Atribuir'} <ChevronDown size={12} />
                        </button>
                        {assignDropdownOpen && (
                          <div className="absolute right-0 top-full mt-1 w-52 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl z-50 overflow-hidden">
                            <div className="p-2 border-b border-gray-100 dark:border-gray-700">
                              <span className="text-[10px] text-gray-400 uppercase font-bold">Atribuir a...</span>
                            </div>
                            <div className="max-h-48 overflow-y-auto">
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
              let replyMeta: any = null;

              // Extrair metadados do remetente ([META]) - Busca em qualquer lugar e remove
              const metaMatch = textToRender.match(/\[META\](.*?)\[\/META\]\n?/);
              if (metaMatch) {
                try { msgMeta = JSON.parse(metaMatch[1]); } catch (e) { }
                textToRender = textToRender.replace(metaMatch[0], '');
              }

              // Extrair metadados da resposta ([REPLY]) - Busca em qualquer lugar e remove
              const replyMatch = textToRender.match(/\[REPLY\](.*?)\[\/REPLY\]\n?/);
              if (replyMatch) {
                try { replyMeta = JSON.parse(replyMatch[1]); } catch (e) { }
                textToRender = textToRender.replace(replyMatch[0], '');
              }

              // Extrair metadados de mensagem editada ([EDITED])
              const isEdited = textToRender.includes('[EDITED]');
              if (isEdited) {
                textToRender = textToRender.replace('[EDITED]', '');
              }

              // Detectar mensagem apagada ([REVOKED])
              const isRevoked = textToRender === '[REVOKED]';

              // Extrair reações ([REACTIONS])
              let messageReactions: any[] = [];
              const reactionsMatch = textToRender.match(/\[REACTIONS\](.*?)\[\/REACTIONS\]\n?/);
              if (reactionsMatch) {
                try { messageReactions = JSON.parse(reactionsMatch[1]); } catch (e) { }
                textToRender = textToRender.replace(reactionsMatch[0], '');
              }

              // Extrair transcrição ([TRANSCRIPT])
              let audioTranscript = '';
              const transcriptMatch = textToRender.match(/\[TRANSCRIPT\](.*?)\[\/TRANSCRIPT\]\n?/);
              if (transcriptMatch) {
                audioTranscript = transcriptMatch[1];
                textToRender = textToRender.replace(transcriptMatch[0], '');
              }

              return (
                <div key={msg.id} id={`msg-${msg.whatsapp_id}`} className={`flex max-w-[75%] gap-2 group ${msg.is_incoming ? 'self-start items-start' : 'self-end'}`}>
                  {!msg.is_incoming && !isRevoked && (
                    <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center self-center pr-1 gap-1">
                      {msg.status !== 'pending' && msg.text && (
                        <button onClick={() => {
                          setEditMessage(msg);
                          setReplyToMessage(null);
                          let pureText = msg.text;
                          const metaMatch = pureText.match(/\[(META|REPLY)\].*?\[\/\1\]\n?/g);
                          if (metaMatch) {
                            metaMatch.forEach(m => pureText = pureText.replace(m, ''));
                          }
                          pureText = pureText.replace(/^\*.*?\*\n\n/, '');
                          setNewMessage(pureText);
                        }} className="text-gray-400 hover:text-blue-500 p-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800" title="Editar">
                          <Pencil size={14} />
                        </button>
                      )}
                      <button onClick={() => setReplyToMessage(msg)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 p-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800" title="Responder">
                        <Reply size={16} />
                      </button>
                      {(msg.media_type?.startsWith('audio/') || msg.media_type === 'video/ogg') && (
                        <button 
                          onClick={() => handleTranscribe(msg)} 
                          disabled={transcribingMessageId === msg.whatsapp_id}
                          className="text-gray-400 hover:text-blue-500 p-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-50" 
                          title="Transcrever Áudio"
                        >
                          {transcribingMessageId === msg.whatsapp_id ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />}
                        </button>
                      )}
                      <div className="relative">
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            setReactionMenuId(reactionMenuId === msg.id ? null : msg.id);
                            setDeleteMenuId(null);
                          }} 
                          className="text-gray-400 hover:text-yellow-500 p-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800" 
                          title="Reagir"
                        >
                          <Smile size={14} />
                        </button>
                        {reactionMenuId === msg.id && (
                          <div className="absolute right-0 bottom-full mb-2 bg-white dark:bg-[#233138] rounded-full shadow-xl border border-gray-200 dark:border-gray-700 p-1 z-50 flex gap-1 animate-in fade-in zoom-in duration-200 origin-bottom-right">
                            {['❤️', '👍', '😂', '😮', '😢', '🙏'].map(emoji => (
                              <button key={emoji} onClick={() => handleReact(msg, emoji)} className="hover:bg-gray-100 dark:hover:bg-[#182229] p-1.5 rounded-full text-lg transition-transform hover:scale-125">
                                {emoji}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="relative">
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteMenuId(deleteMenuId === msg.id ? null : msg.id);
                          }} 
                          className="text-gray-400 hover:text-red-500 p-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800" 
                          title="Apagar"
                        >
                          <Trash2 size={14} />
                        </button>
                        {deleteMenuId === msg.id && (
                          <div className="absolute right-0 bottom-full mb-2 w-48 bg-white dark:bg-[#233138] rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 py-1 z-50 animate-in fade-in zoom-in duration-200 origin-bottom-right">
                            <button 
                              onClick={() => handleDeleteMessage(msg, false)}
                              className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-[#182229] transition-colors"
                            >
                              Apagar para mim
                            </button>
                            <button 
                              onClick={() => handleDeleteMessage(msg, true)}
                              className="w-full text-left px-4 py-2 text-sm text-red-500 hover:bg-gray-100 dark:hover:bg-[#182229] transition-colors"
                            >
                              Apagar para todos
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
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
                  <div className={`${(msg.media_type?.startsWith('audio/') || msg.media_type === 'video/ogg') ? 'pt-1.5 px-2 pb-1' : 'p-3'} rounded-lg shadow-sm relative overflow-hidden break-words ${msg.is_incoming ? 'bg-white dark:bg-[#202c33] rounded-tl-none' : 'bg-[#dcf8c6] dark:bg-[#005c4b] rounded-tr-none'}`}>
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

                    {/* BLOC DE RESPOSTA (REPLY) - SEMPRE NO TOPO DO BALÃO */}
                    {replyMeta && (
                      <div 
                        onClick={() => replyMeta.whatsappId && scrollToMessage(replyMeta.whatsappId)}
                        className="bg-gray-100/60 dark:bg-black/20 border-l-4 border-[#00a884] rounded p-2 mb-2 text-xs cursor-pointer hover:bg-gray-200/60 dark:hover:bg-black/30 transition-colors border-opacity-70 flex justify-between gap-2 overflow-hidden"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="font-bold text-[#00a884] dark:text-[#06cf9c] mb-0.5 truncate">
                            {replyMeta.isMe ? 'Você' : replyMeta.author}
                          </div>
                          <div className="text-gray-600 dark:text-gray-300 line-clamp-2 italic leading-tight">
                            {replyMeta.body}
                          </div>
                        </div>
                        {replyMeta.mediaUrl && (
                          <div className="w-10 h-10 bg-gray-200 dark:bg-gray-800 rounded flex-shrink-0 overflow-hidden">
                            <img 
                              src={`http://${window.location.hostname}:3001${replyMeta.mediaUrl}`} 
                              alt="thumb" 
                              className="w-full h-full object-cover opacity-80" 
                            />
                          </div>
                        )}
                      </div>
                    )}

                    {!msg.is_incoming && msg.sender_id !== 'client' && msg.sender_id !== 'agent' && (
                      <div className="text-[10px] text-gray-500 dark:text-gray-400 font-bold mb-1 uppercase">
                        {agents[msg.sender_id]?.split(' ')[0] || 'Atendente'}
                      </div>
                    )}

                    {isRevoked ? (
                      <div className="flex items-center gap-2 text-gray-400 dark:text-gray-500 italic text-sm py-1 select-none min-w-[180px]">
                        <Ban size={16} />
                        <span>Mensagem apagada</span>
                        <span className="text-[10px] ml-auto opacity-70 not-italic self-end mb-[-4px]">{formatTime(msg.timestamp)}</span>
                      </div>
                    ) : (
                      <>
                        {msg.media_url && (
                          <div className="mb-2 max-w-[280px] rounded overflow-hidden">
                            {msg.media_type?.startsWith('image/') ? (
                              <img
                                src={`http://${window.location.hostname}:3001${msg.media_url}`}
                                alt="Mídia Recebida"
                                className="w-full h-auto object-cover rounded cursor-zoom-in hover:opacity-90 transition-opacity"
                                onClick={() => setFullscreenMedia({ url: `http://${window.location.hostname}:3001${msg.media_url}`, type: msg.media_type || 'image/jpeg' })}
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
                                {audioTranscript && (
                                  <div className="mt-2 p-2 bg-black/5 dark:bg-white/5 rounded-lg border-l-4 border-blue-400 animate-in fade-in slide-in-from-left-1 duration-500">
                                    <div className="flex items-center gap-1 mb-1 opacity-60">
                                      <Sparkles size={10} className="text-blue-500" />
                                      <span className="text-[9px] font-bold uppercase tracking-wider">Transcrição IA</span>
                                    </div>
                                    <p className="text-[11px] italic text-gray-600 dark:text-gray-300 leading-tight" title="Transcrição Automática via IA">
                                      "{audioTranscript}"
                                    </p>
                                  </div>
                                )}
                              </div>
                            ) : (
                              <a href={`http://${window.location.hostname}:3001${msg.media_url}`} target="_blank" rel="noreferrer" className="text-blue-500 underline text-sm flex items-center">
                                <Paperclip size={14} className="mr-1" /> Arquivo Anexo
                              </a>
                            )}
                          </div>
                        )}
                        {textToRender && (
                          <p className="text-gray-800 dark:text-gray-100 leading-relaxed break-words whitespace-pre-wrap" style={{ fontSize: `${chatFontSize}px` }}>
                            {textToRender.replace(/^~.*:\n/, '')}
                            {!(msg.media_type?.startsWith('audio/') || msg.media_type === 'video/ogg') && (
                              <span className="float-right flex items-center gap-1 ml-2 mt-2 select-none">
                                <span className="text-xs text-gray-400">
                                   {isEdited && <span className="mr-1 opacity-70 italic text-[10px]">Editada</span>}
                                   {formatTime(msg.timestamp)}
                                 </span>
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
                        {messageReactions.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-2 mb-1">
                            {messageReactions.map((r: any, idx: number) => (
                              <div key={idx} className="bg-white/50 dark:bg-black/20 px-1.5 py-0.5 rounded-full text-xs flex items-center gap-1 shadow-sm border border-black/5 dark:border-white/5">
                                <span>{r.reaction}</span>
                                {r.count > 1 && <span className="text-[10px] opacity-70 font-bold">{r.count}</span>}
                              </div>
                            ))}
                          </div>
                        )}

                        {!textToRender && !(msg.media_type?.startsWith('audio/') || msg.media_type === 'video/ogg') && (
                          <div className="flex items-center justify-end gap-1 mt-1">
                            {messageReactions.length > 0 && !textToRender && (
                              <div className="flex flex-wrap gap-1 mr-auto">
                                {messageReactions.map((r: any, idx: number) => (
                                  <div key={idx} className="bg-white/50 dark:bg-black/20 px-1.5 py-0.5 rounded-full text-xs flex items-center gap-1 shadow-sm border border-black/5 dark:border-white/5">
                                    <span>{r.reaction}</span>
                                    {r.count > 1 && <span className="text-[10px] opacity-70 font-bold">{r.count}</span>}
                                  </div>
                                ))}
                              </div>
                            )}
                            <span className="text-xs text-gray-400 block text-right">
                               {isEdited && <span className="mr-1 opacity-70 italic text-[10px]">Editada</span>}
                               {formatTime(msg.timestamp)}
                             </span>
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
                      </>
                    )}
                  </div>
                  {msg.is_incoming && !isRevoked && (
                    <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center self-center pl-1">
                      <button onClick={() => setReplyToMessage(msg)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 p-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800" title="Responder">
                        <Reply size={16} />
                      </button>
                      {(msg.media_type?.startsWith('audio/') || msg.media_type === 'video/ogg') && (
                        <button 
                          onClick={() => handleTranscribe(msg)} 
                          disabled={transcribingMessageId === msg.whatsapp_id}
                          className="text-gray-400 hover:text-blue-500 p-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-50" 
                          title="Transcrever Áudio"
                        >
                          {transcribingMessageId === msg.whatsapp_id ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />}
                        </button>
                      )}
                      <div className="relative">
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            setReactionMenuId(reactionMenuId === msg.id ? null : msg.id);
                            setDeleteMenuId(null);
                          }} 
                          className="text-gray-400 hover:text-yellow-500 p-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800" 
                          title="Reagir"
                        >
                          <Smile size={14} />
                        </button>
                        {reactionMenuId === msg.id && (
                          <div className="absolute left-0 bottom-full mb-2 bg-white dark:bg-[#233138] rounded-full shadow-xl border border-gray-200 dark:border-gray-700 p-1 z-50 flex gap-1 animate-in fade-in zoom-in duration-200 origin-bottom-left">
                            {['❤️', '👍', '😂', '😮', '😢', '🙏'].map(emoji => (
                              <button key={emoji} onClick={() => handleReact(msg, emoji)} className="hover:bg-gray-100 dark:hover:bg-[#182229] p-1.5 rounded-full text-lg transition-transform hover:scale-125">
                                {emoji}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="relative">
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteMenuId(deleteMenuId === msg.id ? null : msg.id);
                          }} 
                          className="text-gray-400 hover:text-red-500 p-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800" 
                          title="Apagar"
                        >
                          <Trash2 size={14} />
                        </button>
                        {deleteMenuId === msg.id && (
                          <div className="absolute left-0 bottom-full mb-2 w-48 bg-white dark:bg-[#233138] rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 py-1 z-50 animate-in fade-in zoom-in duration-200 origin-bottom-left">
                            <button 
                              onClick={() => handleDeleteMessage(msg, false)}
                              className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-[#182229] transition-colors"
                            >
                              Apagar para mim
                            </button>
                            {selectedChat?.phone_number?.endsWith('@g.us') && (
                              <button 
                                onClick={() => handleDeleteMessage(msg, true)}
                                className="w-full text-left px-4 py-2 text-sm text-red-500 hover:bg-gray-100 dark:hover:bg-[#182229] transition-colors"
                              >
                                Apagar para todos
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
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
              {/* Hidden file inputs */}
              <input type="file" ref={attachFileRef} onChange={handleFileInputChange} className="hidden" />
              <input type="file" ref={attachImageRef} onChange={handleFileInputChange} accept="image/*,video/*" className="hidden" />
              <input type="file" ref={attachAudioRef} onChange={handleFileInputChange} accept="audio/*" className="hidden" />

              {sendingMedia && (
                <div className="flex items-center gap-2 mb-2 px-2">
                  <div className="w-4 h-4 border-2 border-[#00a884] border-t-transparent rounded-full animate-spin"></div>
                  <span className="text-xs text-gray-500">Enviando arquivo...</span>
                </div>
              )}

              {/* Painel de Edição (Edit) */}
              {editMessage && (
                <div className="mb-2 mx-1 flex items-center bg-gray-100 dark:bg-[#202c33] rounded-lg border-l-4 border-blue-500 p-2 relative">
                  <div className="flex-1 min-w-0">
                    <span className="text-xs font-bold text-blue-500 block truncate">
                      Editando mensagem
                    </span>
                    <span className="text-sm text-gray-600 dark:text-gray-300 truncate block">
                      {editMessage.text ? editMessage.text.replace(/\[(META|REPLY)\].*?\[\/\1\]\n?/g, '').replace(/^\*.*?\*\n\n/, '') : ''}
                    </span>
                  </div>
                  <button onClick={() => { setEditMessage(null); setNewMessage(''); }} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 ml-2">
                    <X size={16} />
                  </button>
                </div>
              )}

              {/* Painel de Resposta (Reply) */}
              {replyToMessage && (
                <div className="mb-2 mx-1 flex items-center bg-gray-100 dark:bg-[#202c33] rounded-lg border-l-4 border-[#00a884] p-2 relative">
                  <div className="flex-1 min-w-0">
                    <span className="text-xs font-bold text-[#00a884] block truncate">
                      {replyToMessage.sender_id === user.id ? 'Você' : (agents[replyToMessage.sender_id] || selectedChat.contact_name || formatPhoneNumber(selectedChat.phone_number))}
                    </span>
                    <span className="text-sm text-gray-600 dark:text-gray-300 truncate block">
                      {replyToMessage.text ? replyToMessage.text.replace(/\[(META|REPLY)\].*?\[\/\1\]\n?/g, '') : 'Mídia'}
                    </span>
                  </div>
                  <button onClick={() => setReplyToMessage(null)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 ml-2">
                    <X size={16} />
                  </button>
                </div>
              )}

              {/* Painel de Sugestões de IA */}
              {showAiPanel && (
                <div className="mb-2 mx-1 bg-gradient-to-r from-purple-50 to-blue-50 dark:from-purple-900/20 dark:to-blue-900/20 rounded-xl border border-purple-200/50 dark:border-purple-700/30 p-3">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-1.5">
                      <Sparkles size={14} className="text-purple-500" />
                      <span className="text-xs font-bold text-purple-600 dark:text-purple-400 uppercase tracking-wider">Sugestões da IA</span>
                    </div>
                    <button
                      onClick={() => { setShowAiPanel(false); setAiSuggestions([]); }}
                      className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                    >
                      <X size={14} />
                    </button>
                  </div>
                  {loadingAI ? (
                    <div className="flex items-center gap-2 py-3 justify-center">
                      <Loader2 size={16} className="text-purple-500 animate-spin" />
                      <span className="text-xs text-purple-500">Analisando conversa...</span>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-1.5">
                      {aiSuggestions.map((suggestion, idx) => (
                        <button
                          key={idx}
                          onClick={() => {
                            setNewMessage(suggestion);
                            setShowAiPanel(false);
                            setAiSuggestions([]);
                          }}
                          className="text-left text-sm text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 hover:bg-purple-100 dark:hover:bg-purple-900/30 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 transition-all hover:border-purple-300 dark:hover:border-purple-600 hover:shadow-sm group"
                        >
                          <span className="text-purple-400 text-xs font-bold mr-1.5">{idx + 1}.</span>
                          {suggestion}
                          <span className="text-[10px] text-gray-400 group-hover:text-purple-500 ml-1 transition-colors">↵ usar</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div className="flex items-center space-x-3">
                <div className="relative">
                  <button
                    onClick={() => setAttachMenuOpen(!attachMenuOpen)}
                    className={`text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors ${attachMenuOpen ? 'text-[#00a884]' : ''}`}
                  >
                    {attachMenuOpen ? <X size={24} /> : <Paperclip size={24} />}
                  </button>

                  {attachMenuOpen && (
                    <div className="absolute bottom-12 left-0 bg-white dark:bg-[#233138] rounded-xl shadow-2xl border border-gray-200 dark:border-gray-600 py-2 w-48 z-50 animate-in">
                      <button
                        onClick={() => { setAttachMenuOpen(false); attachFileRef.current?.click(); }}
                        className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors"
                      >
                        <span className="w-8 h-8 rounded-full bg-purple-500 flex items-center justify-center"><FileUp size={16} className="text-white" /></span>
                        Documento
                      </button>
                      <button
                        onClick={() => { setAttachMenuOpen(false); attachImageRef.current?.click(); }}
                        className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors"
                      >
                        <span className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center"><Image size={16} className="text-white" /></span>
                        Fotos e vídeos
                      </button>
                      <button
                        onClick={() => { setAttachMenuOpen(false); attachAudioRef.current?.click(); }}
                        className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors"
                      >
                        <span className="w-8 h-8 rounded-full bg-orange-500 flex items-center justify-center"><Headphones size={16} className="text-white" /></span>
                        Áudio
                      </button>
                      <button
                        onClick={openContactPicker}
                        className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors"
                      >
                        <span className="w-8 h-8 rounded-full bg-teal-500 flex items-center justify-center"><UserPlus size={16} className="text-white" /></span>
                        Contato
                      </button>
                    </div>
                  )}
                </div>
                <button
                  onClick={fetchAiSuggestions}
                  disabled={loadingAI || messages.length === 0}
                  className={`p-1.5 rounded-lg transition-all ${loadingAI ? 'text-purple-400 animate-pulse' : 'text-gray-400 hover:text-purple-500 hover:bg-purple-50 dark:hover:bg-purple-900/20'} disabled:opacity-30`}
                  title="Sugestões de IA"
                >
                  <Sparkles size={20} />
                </button>
                <form onSubmit={handleSendMessage} className="flex-1 flex flex-col">
                  {/* Typing Indicator Display */}
                  {selectedChatId && typingUsers[selectedChatId] && Object.keys(typingUsers[selectedChatId]).filter(id => id !== user?.id).length > 0 && (
                    <div className="text-xs text-gray-500 italic mb-1 ml-2 animate-pulse">
                      {Object.keys(typingUsers[selectedChatId]).filter(id => id !== user?.id).map(id => typingUsers[selectedChatId][id]).join(', ')} {Object.keys(typingUsers[selectedChatId]).filter(id => id !== user?.id).length > 1 ? 'estão' : 'está'} digitando...
                    </div>
                  )}
                  <div className="flex w-full">
                    <input
                      type="text"
                      value={newMessage}
                      onChange={(e) => handleTyping(e.target.value)}
                      placeholder="Digite uma mensagem..."
                      className="flex-1 bg-white dark:bg-[#2a3942] text-gray-900 dark:text-gray-100 border-none rounded-lg px-4 py-2 text-sm ring-1 ring-gray-200 dark:ring-gray-700 outline-none focus:ring-1 focus:ring-[#00a884]"
                    />
                  </div>
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
        <main className="flex-1 flex flex-col items-center justify-center bg-[#f0f2f5] dark:bg-[#0b141a] text-center px-10">
          <div className="w-32 h-32 bg-white rounded-full shadow-md mb-6 overflow-hidden flex items-center justify-center border-4 border-white dark:border-gray-700">
            <img src="/gti-logo.png" alt="GTI Logo" className="w-full h-full object-cover" />
          </div>
          <h2 className="text-3xl font-bold text-gray-800 dark:text-gray-100 mb-4 tracking-tight">GTI-ZAP</h2>
          <p className="text-gray-500 dark:text-gray-400 max-w-md text-sm leading-relaxed">
            Sistema Integrado de Atendimento via WhatsApp da Gerência de TI. Selecione uma conversa ao lado para iniciar.
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
                    onClick={() => setFullscreenMedia({ url: contactDetails.profilePicUrl, type: 'image/jpeg' })}
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
                  onClick={() => setFullscreenMedia({ url: selectedChat.profile_pic_url || '', type: 'image/jpeg' })}
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
                  // Prioriza o número resolvido do backend (que já vem limpo)
                  const phoneNum = contactDetails?.number || selectedChat.phone_number.split('@')[0];
                  // Remove @c.us ou @lid se ainda existir
                  const clean = phoneNum.replace(/@.*$/, '');
                  return `Celular: +${clean}`;
                })()
              )}
            </p>
            <p className="text-gray-400 text-xs mt-1 bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">
              ID Interno: {selectedChat.phone_number}
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
            <h3 className="text-[#00a884] text-xs font-bold uppercase mb-3">Anotações Internas</h3>

            {/* Add new note */}
            <div className="flex gap-2 mb-3">
              <textarea
                className="flex-1 h-16 p-2 text-sm bg-yellow-50 dark:bg-gray-700/50 border border-yellow-100 dark:border-gray-600 rounded focus:outline-none focus:ring-1 focus:ring-[#00a884] text-gray-800 dark:text-gray-200 resize-none"
                placeholder="Escreva uma anotação..."
                value={newNoteText}
                onChange={(e) => setNewNoteText(e.target.value)}
              />
              <button
                onClick={addNote}
                disabled={isSavingNote || !newNoteText.trim()}
                className="self-end px-3 py-2 bg-[#00a884] text-white rounded text-xs font-bold hover:bg-[#008f6f] transition-colors disabled:opacity-50"
              >
                {isSavingNote ? '...' : 'Salvar'}
              </button>
            </div>

            {/* Notes list */}
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {chatNotes.length === 0 && (
                <p className="text-gray-400 text-xs text-center py-2">Nenhuma anotação ainda.</p>
              )}
              {chatNotes.map(note => (
                <div key={note.id} className="bg-yellow-50 dark:bg-gray-700/40 rounded-lg p-3 border border-yellow-100 dark:border-gray-600">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-bold text-[#00a884]">
                      {agents[note.user_id] || 'Atendente'}
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-gray-400">
                        {new Date(note.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })} às {new Date(note.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                      {(note.user_id === user.id || userRole === 'admin') && (
                        <button
                          onClick={() => deleteNote(note.id)}
                          className="text-red-400 hover:text-red-600 transition-colors"
                          title="Apagar anotação"
                        >
                          <Trash2 size={12} />
                        </button>
                      )}
                    </div>
                  </div>
                  <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{note.text}</p>
                </div>
              ))}
            </div>
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
                <div
                  key={idx}
                  className="aspect-square bg-gray-100 dark:bg-gray-700 rounded overflow-hidden cursor-pointer hover:opacity-80 transition-opacity"
                  onClick={() => setFullscreenMedia({ url: `http://${window.location.hostname}:3001${msg.media_url}`, type: msg.media_type || 'application/octet-stream' })}
                >
                  {msg.media_type?.startsWith('image/') ? (
                    <img src={`http://${window.location.hostname}:3001${msg.media_url}`} alt="Media" className="w-full h-full object-cover" />
                  ) : msg.media_type?.startsWith('video/') ? (
                    <div className="w-full h-full bg-black flex items-center justify-center text-white">
                      <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center backdrop-blur-sm">
                        <svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" strokeWidth="2" fill="none"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
                      </div>
                    </div>
                  ) : msg.media_type?.startsWith('audio/') || msg.media_type === 'video/ogg' ? (
                    <div className="w-full h-full bg-[#00a884]/10 flex flex-col items-center justify-center text-[#00a884]">
                      <Headphones size={24} />
                      <span className="text-[9px] mt-1 uppercase font-bold">Áudio</span>
                    </div>
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center text-gray-500">
                      <Paperclip size={24} />
                      <span className="text-[9px] mt-1 uppercase font-bold">Arquivo</span>
                    </div>
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

      {fullscreenMedia && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
          onClick={() => setFullscreenMedia(null)}
        >
          <button
            className="absolute top-4 right-4 w-10 h-10 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center text-white transition-colors z-10"
            onClick={() => setFullscreenMedia(null)}
          >
            <X size={24} />
          </button>

          <div onClick={(e) => e.stopPropagation()} className="max-w-4xl max-h-[90vh] flex items-center justify-center">
            {fullscreenMedia.type.startsWith('image/') ? (
              <img src={fullscreenMedia.url} alt="Fullscreen" className="max-w-full max-h-[90vh] object-contain rounded" />
            ) : fullscreenMedia.type.startsWith('video/') ? (
              <video src={fullscreenMedia.url} controls autoPlay className="max-w-full max-h-[90vh] rounded" />
            ) : fullscreenMedia.type.startsWith('audio/') || fullscreenMedia.type === 'video/ogg' ? (
              <div className="bg-white dark:bg-gray-800 rounded-2xl p-8 shadow-2xl flex flex-col items-center gap-4 min-w-[320px]">
                <div className="w-20 h-20 rounded-full bg-[#00a884]/10 flex items-center justify-center">
                  <Headphones size={36} className="text-[#00a884]" />
                </div>
                <p className="text-gray-800 dark:text-gray-100 font-medium">Reproduzindo áudio</p>
                <audio src={fullscreenMedia.url} controls autoPlay className="w-full" />
              </div>
            ) : fullscreenMedia.type === 'application/pdf' ? (
              <iframe src={fullscreenMedia.url} className="w-[80vw] h-[85vh] rounded bg-white" title="PDF Viewer" />
            ) : (
              <div className="bg-white dark:bg-gray-800 rounded-2xl p-8 shadow-2xl flex flex-col items-center gap-4 min-w-[320px]">
                <div className="w-20 h-20 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center">
                  <Paperclip size={36} className="text-gray-500" />
                </div>
                <p className="text-gray-800 dark:text-gray-100 font-medium">Arquivo</p>
                <a
                  href={fullscreenMedia.url}
                  target="_blank"
                  rel="noreferrer"
                  className="bg-[#00a884] text-white font-bold px-6 py-2 rounded-lg hover:bg-[#008f6f] transition-colors"
                >
                  Baixar Arquivo
                </a>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Contact Picker Modal */}
      {contactPickerOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
          onClick={() => setContactPickerOpen(false)}
        >
          <div
            className="bg-white dark:bg-[#111b21] rounded-2xl shadow-2xl w-full max-w-md max-h-[80vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700 bg-[#00a884]">
              <h3 className="text-white font-bold text-base">Enviar Contato</h3>
              <button
                onClick={() => setContactPickerOpen(false)}
                className="text-white/70 hover:text-white transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* Search */}
            <div className="p-3 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-center bg-gray-100 dark:bg-gray-800 rounded-lg px-3 py-2">
                <Search size={16} className="text-gray-400 mr-2" />
                <input
                  type="text"
                  value={contactSearch}
                  onChange={(e) => setContactSearch(e.target.value)}
                  placeholder="Buscar contato..."
                  className="flex-1 bg-transparent text-sm text-gray-800 dark:text-gray-200 outline-none placeholder-gray-400"
                  autoFocus
                />
              </div>
            </div>

            {/* Contact List */}
            <div className="flex-1 overflow-y-auto">
              {loadingContacts ? (
                <div className="flex items-center justify-center py-10">
                  <div className="w-6 h-6 border-2 border-[#00a884] border-t-transparent rounded-full animate-spin"></div>
                  <span className="ml-2 text-sm text-gray-500">Carregando contatos...</span>
                </div>
              ) : (
                whatsappContacts
                  .filter(c =>
                    c.name.toLowerCase().includes(contactSearch.toLowerCase()) ||
                    c.number.includes(contactSearch)
                  )
                  .map(contact => (
                    <button
                      key={contact.id}
                      onClick={() => sendContact(contact)}
                      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors border-b border-gray-100 dark:border-gray-800"
                    >
                      <div className="w-10 h-10 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-gray-500">
                        <User size={20} />
                      </div>
                      <div className="text-left flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">{contact.name}</p>
                        <p className="text-xs text-gray-500 truncate">{contact.number || contact.id}</p>
                      </div>
                    </button>
                  ))
              )}
              {!loadingContacts && whatsappContacts.filter(c => c.name.toLowerCase().includes(contactSearch.toLowerCase()) || c.number.includes(contactSearch)).length === 0 && (
                <p className="text-center text-gray-400 text-sm py-10">Nenhum contato encontrado.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
