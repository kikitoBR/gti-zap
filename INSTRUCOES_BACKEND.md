# Instruções para Continuação do Projeto (WhatsApp Multi-Agente)

Este arquivo contém as instruções e o planejamento arquitetural para que o próximo agente (ou você, em sua IDE local) possa continuar o desenvolvimento do sistema de atendimento compartilhado do WhatsApp.

## 1. Arquitetura Escolhida

Dado o cenário (Hospedagem em máquina local com 16GB de RAM, uso apenas em rede local, 10 atendentes):

- **Frontend:** React (Vite) + Tailwind CSS + Lucide Icons (Já iniciado aqui).
- **Banco de Dados & Realtime:** Supabase.
  - *Dica:* Como o uso é estritamente local, você pode rodar o **Supabase Localmente via Docker** na sua máquina de 16GB. Isso garante latência zero e que os dados não saiam da sua rede.
- **Backend / API do WhatsApp:** Node.js.
  - **Recomendação de Biblioteca:** `whatsapp-web.js` ou `Baileys`.
  - Como você tem 16GB de RAM na máquina local, o `whatsapp-web.js` funcionará perfeitamente e é consideravelmente mais fácil de implementar e manter do que a Baileys, pois ele controla um navegador Chromium invisível (que consumirá cerca de 300MB a 800MB de RAM, o que é ínfimo para seus 16GB). A `Baileys` interage diretamente com o WebSocket do WhatsApp (não usa navegador), consome muito pouca RAM (menos de 50MB), mas a curva de aprendizado e tratamento de erros de conexão é maior. Minha recomendação: **Use o whatsapp-web.js pela facilidade de implementação**, a menos que queira performance extrema, aí vá de Baileys.

## 2. O que já foi feito até aqui (Frontend)

1. **Design UI/UX:** Layout inspirado na interface padrão de chats densos (WhatsApp Web / CRMs de atendimento).
2. **Sistema de Atribuição:** O painel lista conversas e quem as "assumiu".
3. **Bloqueio de Conversas (Lock):** Como solicitado, se o chat foi assumido por outro atendente (ex: "Carlos"), a barra de envio de mensagens é ocultada/bloqueada para o usuário atual, exibindo uma mensagem de "Apenas visualização".
4. **Instalação do Supabase:** O pacote `@supabase/supabase-js` está instalado e tem o esboço de conexão na raiz (`src/lib/supabase.ts`).

## 3. Próximos Passos (Para executar na IDE)

### Passo 3.1: Configurar o Supabase
1. Crie um projeto no Supabase (seja na nuvem deles ou via Docker na sua rede).
2. Crie as seguintes tabelas:
   - `users`: ID, nome, status.
   - `chats`: ID, telefone_cliente, nome_cliente, last_message, unread_count, assigned_to (FK para users).
   - `messages`: ID, chat_id (FK para chats), sender (agent/client), text, timestamp, status.
3. Habilite o Realtime nas tabelas `chats` e `messages`.
4. Preencha as variáveis de ambiente no arquivo `.env` do frontend:
   ```
   VITE_SUPABASE_URL=sua_url
   VITE_SUPABASE_ANON_KEY=sua_chave
   ```

### Passo 3.2: Criar o Backend do WhatsApp (Node.js)
1. Crie uma pasta `backend` separada.
2. Inicialize um projeto Node (`npm init -y`) e instale as dependências:
   `npm install whatsapp-web.js qrcode-terminal @supabase/supabase-js express cors dotenv`
3. Crie um script principal (`index.js` ou `server.js`) que:
   - Inicie o cliente do `whatsapp-web.js`.
   - Gere o QR Code no terminal (ou exponha via API para o frontend ler).
   - Escute o evento `client.on('message')`. Ao receber, salve a mensagem na tabela `messages` do Supabase e atualize ou crie o chat na tabela `chats`.
   - Opcionalmente: Crie uma rota Express `/send` onde o Frontend fará um POST para enviar uma mensagem. O backend pega a mensagem, envia via `whatsapp-web.js` (`client.sendMessage()`) e salva no Supabase.

### Passo 3.3: Ligar o Frontend ao Supabase (Realtime)
1. No arquivo `App.tsx`, substitua o estado mockado (`MOCK_CHATS`, `MOCK_MESSAGES`) por chamadas ao `supabase.from('chats').select()`.
2. Adicione os listeners realtime no `useEffect` do React:
   ```javascript
   supabase.channel('custom-all-channel')
     .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, payload => {
       // Atualiza a tela de mensagens em tempo real
     })
     .subscribe()
   ```

## 4. Regras de Negócio Implementadas no Frontend

- Um Atendente clica em "Assumir" -> Atualiza no Supabase o `assigned_to`.
- O Frontend via Realtime de todos os outros 9 atendentes atualiza, e a barra de digitar some para eles, mostrando: 🔒 "Esta conversa está sendo atendida por [Nome]".
- Há um botão "Soltar" implementado no cabeçalho (visível para o atendente logado que assumiu) caso ele queira devolver o chat para a fila geral para que outros possam pegar. O front já tem a lógica visual, no backend precisa limpar o `assigned_to`.
