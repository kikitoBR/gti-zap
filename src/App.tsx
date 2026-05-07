import React, { useState, useEffect, useRef } from 'react';
import { Search, MoreVertical, Paperclip, Send, User, Check, CheckCheck, MessageSquare, Users, Settings, LogOut, Lock, Unlock } from 'lucide-react';
import { supabase } from './lib/supabase';
import Login from './Login';

type Message = {
  id: string;
  chat_id: string;
  sender_id: string;
  text: string;
  timestamp: string;
  status: 'pending' | 'sent' | 'delivered' | 'read';
  is_incoming: boolean;
};

type Chat = {
  id: string;
  contact_name: string;
  phone_number: string;
  last_message: string;
  unread_count: number;
  assigned_to?: string;
  updated_at: string;
};

export default function App() {
  const [user, setUser] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<'all' | 'mine'>('all');
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [newMessage, setNewMessage] = useState('');
  
  const [chats, setChats] = useState<Chat[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [agents, setAgents] = useState<Record<string, string>>({}); // id -> name mapping

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

    // Supabase Realtime Setup
    const channel = supabase.channel('whatsapp-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chats' }, payload => {
        handleChatChange(payload);
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, payload => {
        handleNewMessage(payload.new as Message);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'users' }, payload => {
        if (payload.new && payload.new.id && payload.new.name) {
          setAgents(prev => ({ ...prev, [payload.new.id]: payload.new.name }));
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, selectedChatId]);

  const fetchInitialData = async () => {
    // Busca Agentes (tabela users pública mapeada no supabase_schema.sql)
    const { data: usersData } = await supabase.from('users').select('id, name');
    if (usersData) {
      const agentsMap: Record<string, string> = {};
      usersData.forEach(u => agentsMap[u.id] = u.name);
      setAgents(agentsMap);
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
    } else {
      setMessages([]);
    }
  }, [selectedChatId]);

  const fetchMessages = async (chatId: string) => {
    const { data } = await supabase.from('messages').select('*').eq('chat_id', chatId).order('timestamp', { ascending: true });
    if (data) setMessages(data);
  };

  const handleChatChange = (payload: any) => {
    if (payload.eventType === 'INSERT') {
      setChats(prev => [payload.new as Chat, ...prev].sort((a,b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()));
    } else if (payload.eventType === 'UPDATE') {
      setChats(prev => prev.map(c => c.id === payload.new.id ? payload.new as Chat : c).sort((a,b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()));
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

    const text = newMessage;
    setNewMessage('');

    // Enviar via Backend API (que envia pelo WhatsApp Web JS)
    try {
      await fetch('http://localhost:3001/send', {
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

  const handleAssignToMe = async () => {
    if (!selectedChatId || !user) return;
    await supabase.from('chats').update({ assigned_to: user.id }).eq('id', selectedChatId);
  };

  const handleFreeAssignment = async () => {
    if (!selectedChatId) return;
    await supabase.from('chats').update({ assigned_to: null }).eq('id', selectedChatId);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  if (!user) {
    return <Login onLogin={setUser} />;
  }

  const selectedChat = chats.find(c => c.id === selectedChatId);
  
  const filteredChats = chats.filter(chat => {
    if (activeTab === 'mine') return chat.assigned_to === user.id;
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

  return (
    <div className="flex h-screen w-full bg-[#f0f2f5] font-sans overflow-hidden">
      
      {/* Sidebar - Menu (Left) */}
      <div className="w-16 bg-[#111b21] flex flex-col items-center py-4 space-y-6">
        <div className="w-10 h-10 bg-[#00a884] rounded-full flex items-center justify-center text-white font-bold text-sm">
          WH
        </div>
        <nav className="flex-1 flex flex-col space-y-4">
          <button className="p-2 rounded-lg bg-[#2a3942] text-white relative">
            <MessageSquare size={24} />
          </button>
          <button className="p-2 rounded-lg text-gray-400 hover:bg-[#2a3942] hover:text-white transition-colors">
            <Users size={24} />
          </button>
          <button className="p-2 rounded-lg text-gray-400 hover:bg-[#2a3942] hover:text-white transition-colors">
            <Settings size={24} />
          </button>
        </nav>
        <div className="mt-auto flex flex-col gap-4">
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
      <div className="w-80 bg-white border-r border-gray-200 flex flex-col">
        <div className="p-4 border-b border-gray-200 bg-[#f0f2f5]">
          <h1 className="text-xl font-bold text-[#111b21]">Caixa de Entrada</h1>
          <p className="text-[11px] text-gray-500 uppercase tracking-wider font-bold mt-1">
            Logado: <span className="text-[#00a884]">{agents[user.id] || user.email}</span>
          </p>
          <div className="mt-3 relative">
            <input 
              type="text" 
              placeholder="Pesquisar conversas..." 
              className="w-full bg-white border-none rounded-md py-1.5 pl-8 pr-4 text-sm ring-1 ring-gray-300 focus:ring-2 focus:ring-[#00a884] outline-none"
            />
            <Search className="absolute left-2.5 top-2 text-gray-400" size={16} />
          </div>
        </div>
        
        <div className="flex border-b border-gray-200 p-1 bg-[#f0f2f5]">
          <button 
            className={`flex-1 py-1.5 text-xs font-bold uppercase tracking-wider rounded ${activeTab === 'all' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            onClick={() => setActiveTab('all')}
          >
            Todas
          </button>
          <button 
            className={`flex-1 py-1.5 text-xs font-bold uppercase tracking-wider rounded ${activeTab === 'mine' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            onClick={() => setActiveTab('mine')}
          >
            Minhas
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {filteredChats.map(chat => (
            <div 
              key={chat.id} 
              onClick={() => setSelectedChatId(chat.id)}
              className={`flex items-center p-3 cursor-pointer border-b border-gray-100 ${selectedChatId === chat.id ? 'bg-[#f0f2f5] border-l-4 border-l-[#00a884]' : 'hover:bg-gray-50 border-l-4 border-l-transparent'}`}
            >
              <div className="w-12 h-12 bg-blue-100 rounded-full flex-shrink-0 flex items-center justify-center text-blue-600 font-bold">
                {(chat.contact_name || chat.phone_number).substring(0, 2).toUpperCase()}
              </div>
              <div className="ml-3 flex-1 overflow-hidden">
                <div className="flex justify-between items-baseline">
                  <span className="text-sm font-semibold text-gray-900 truncate pr-2">{chat.contact_name || chat.phone_number}</span>
                  <span className={`text-[10px] ${chat.unread_count > 0 ? 'text-[#00a884] font-bold' : 'text-gray-500'}`}>{formatTime(chat.updated_at)}</span>
                </div>
                <p className={`text-xs truncate ${chat.unread_count > 0 ? 'text-gray-800 font-medium' : 'text-gray-500'}`}>{chat.last_message || 'Nenhuma mensagem'}</p>
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
      </div>

      {/* Main Chat Area (Right) */}
      {selectedChat ? (
        <main className="flex-1 flex flex-col bg-[#efeae2] relative">
          {/* Chat Header */}
          <header className="h-16 bg-[#f0f2f5] border-b border-gray-200 flex items-center px-6 justify-between">
            <div className="flex items-center">
              <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 font-bold">
                {(selectedChat.contact_name || selectedChat.phone_number).substring(0, 2).toUpperCase()}
              </div>
              <div className="ml-3">
                <h2 className="text-sm font-bold text-gray-800">{selectedChat.contact_name || selectedChat.phone_number}</h2>
                <span className="text-xs text-gray-500 flex items-center">
                  <span className="w-2 h-2 bg-green-500 rounded-full mr-1.5"></span> {selectedChat.phone_number}
                </span>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <span className="text-xs text-gray-500 mt-0.5">Resp:</span>
                <span className="text-xs font-bold text-gray-700 bg-white px-2 py-1 rounded shadow-sm border border-gray-200">
                  {getAgentName(selectedChat.assigned_to) || 'Nenhum'}
                </span>
              </div>
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
              <button className="text-gray-500 hover:text-gray-700 ml-2">
                <MoreVertical size={20} />
              </button>
            </div>
          </header>

          {/* Chat Messages */}
          <div className="flex-1 p-6 overflow-y-auto flex flex-col space-y-4">
            <div className="self-center bg-[#d1f4ff] text-[#111b21] px-3 py-1 text-[11px] rounded uppercase tracking-wider font-semibold shadow-sm text-center">
              Protegido e criptografado de ponta a ponta
            </div>

            {messages.length === 0 && (
              <div className="flex-1 flex items-center justify-center text-gray-500 text-sm">
                Nenhuma mensagem carregada.
              </div>
            )}

            {messages.map(msg => (
              <div key={msg.id} className={`flex max-w-[75%] ${msg.is_incoming ? 'self-start' : 'self-end'}`}>
                <div className={`p-3 rounded-lg shadow-sm relative ${msg.is_incoming ? 'bg-white rounded-tl-none' : 'bg-[#dcf8c6] rounded-tr-none'}`}>
                  {!msg.is_incoming && msg.sender_id !== 'client' && msg.sender_id !== 'agent' && (
                    <div className="text-[10px] text-gray-500 font-bold mb-1 uppercase">
                       {agents[msg.sender_id]?.split(' ')[0] || 'Atendente'}
                    </div>
                  )}
                  <p className="text-sm text-gray-800 leading-relaxed break-words whitespace-pre-wrap">{msg.text}</p>
                  <div className="flex items-center justify-end gap-1 mt-1">
                    <span className="text-[10px] text-gray-400 block text-right">{formatTime(msg.timestamp)}</span>
                    {!msg.is_incoming && (
                      <span className="text-blue-500">
                         {msg.status === 'read' ? <CheckCheck size={14} /> : msg.status === 'delivered' ? <CheckCheck size={14} className="text-gray-400" /> : <Check size={14} className="text-gray-400" />}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Area */}
          {selectedChat.assigned_to && selectedChat.assigned_to !== user.id ? (
            <footer className="bg-[#f0f2f5] p-4 border-t border-gray-200 flex items-center justify-center text-gray-500 text-sm">
              <Lock size={16} className="mr-2" />
              Esta conversa está sendo atendida por {getAgentName(selectedChat.assigned_to)}. Apenas visualização.
            </footer>
          ) : (
            <footer className="bg-[#f0f2f5] p-3 border-t border-gray-200">
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
        <main className="flex-1 flex flex-col items-center justify-center bg-[#f0f2f5] text-center px-10 border-b-8 border-[#00a884]">
          <div className="bg-white p-6 rounded-full shadow-sm mb-6 text-[#00a884]">
            <MessageSquare size={64} />
          </div>
          <h2 className="text-2xl font-light text-gray-800 mb-4">WhatsApp Compartilhado</h2>
          <p className="text-gray-500 max-w-md text-sm">
            Selecione uma conversa para começar a atender. Todos os atendentes podem usar esta interface simultaneamente, atribuindo os chats a eles mesmos.
          </p>
        </main>
      )}
    </div>
  );
}
