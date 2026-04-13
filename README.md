# Projeto Amil

Painel administrativo fullstack para operação de um **bot WhatsApp** (Baileys), com autenticação por sessão (JWT em cookie), listagem de conversas e mensagens em tempo real, configurações (Gemini, senha, tema) e base preparada em Prisma para domínio de **planos / operadoras** (ainda não ligada à API de negócio).

---

## Sumário

- [Visão geral](#visão-geral)
- [O que funciona, o que não e o que está pendente](#o-que-funciona-o-que-não-e-o-que-está-pendente)
- [Arquitetura e dependências](#arquitetura-e-dependências)
- [Estrutura de pastas (resumo)](#estrutura-de-pastas-resumo)
- [Como executar](#como-executar)
- [Variáveis de ambiente](#variáveis-de-ambiente)
- [Fluxo de autenticação](#fluxo-de-autenticação)
- [Fluxo do bot WhatsApp](#fluxo-do-bot-whatsapp)
- [Fluxo de chats (REST + WebSocket)](#fluxo-de-chats-rest--websocket)
- [Módulo de mensagens genérico](#módulo-de-mensagens-genérico)
- [Configurações (Gemini e senha)](#configurações-gemini-e-senha)
- [Health check](#health-check)
- [Frontend](#frontend)
- [Prisma e banco de dados](#prisma-e-banco-de-dados)
- [API e documentação](#api-e-documentação)
- [Testes](#testes)
- [Segurança e limitações](#segurança-e-limitações)
- [Scripts úteis](#scripts-úteis)

---

## Visão geral

| Camada | Tecnologia |
|--------|------------|
| Backend | NestJS 11, prefixo global `/api`, validação com `class-validator`, Swagger em `/api/docs` |
| Frontend | React 19, Vite 8, Tailwind, React Router 7, Socket.IO client, Sonner |
| WhatsApp | Baileys 7 (RC), credenciais e estado de auth no **Redis** |
| UI do bot | Chats e mensagens em memória + **snapshot** periódico no Redis (`bot:ui:snapshot:v1`) |
| Auth | JWT em cookie `httpOnly`, guard global; senha pode ser sobrescrita por **hash no Redis** |
| Dados de negócio | Schema Prisma extenso (planos, operadoras, etc.) — **sem CRUD ativo** na API atual |

---

## O que funciona, o que não e o que está pendente

### Funciona hoje

- Login / logout com cookie JWT; `GET /api/auth/me` para bootstrap da sessão no browser.
- Alteração de **senha** do utilizador administrativo (hash scrypt no Redis) via `POST /api/auth/password` (painel **Configurações**).
- **Sessão WhatsApp**: estado, QR e erros expostos em `GET /api/bot/connection` e em tempo real no namespace Socket.IO `/chats` (`bot:connection`).
- **Chats**: lista de conversas **apenas contatos diretos** (sem grupos `@g.us` nem canais); mensagens vistas pelo bot (texto resumido e placeholders para mídia); envio pelo painel; atualizações em tempo real (`chats:list`, `chats:updated`, `chat:messages`).
- **Persistência de UI** do bot: hidratação e flush do snapshot de chats/mensagens no Redis.
- **POST /api/messages/send**: envio genérico de texto para um destino (número ou JID), autenticado.
- **GET /api/health** (público): verificação de Postgres e Redis conforme `DATABASE_URL` / `REDIS_URL`.
- **Configurações**: `GET/PUT` Gemini key no Redis; tema claro/escuro/sistema no **frontend** (localStorage).
- **Tela Contexto**: formulário só no cliente (instruções para IA) — **sem persistência** nem uso no backend.
- Build único: `npm run build` gera `frontend/dist` + `dist`; `ServeStaticModule` serve o SPA em produção (exceto `/api/*`).

### Não implementado ou incompleto

- **Gemini**: chave guardada e resumo em `GET /api/settings`; **nenhum serviço chama a API Google** ainda (respostas automáticas com IA não existem).
- **Contexto (IA)**: não há modelo, endpoint nem Redis para o texto de contexto do painel.
- **Prisma / domínio Amil**: models existem no schema; **não há** `PrismaService`, migrations aplicadas no fluxo da app, nem endpoints de planos/operadoras.
- **Multi-utilizador**: um único `AUTH_USERNAME`; não há registo nem gestão de vários admins na base de dados.
- **WebSocket `/chats`**: **não valida JWT** na handshake; qualquer cliente que consiga abrir o socket pode receber eventos (mitigar com proxy, auth no gateway ou mesmo origin apenas em produção).

### Pendências recomendadas (roadmap)

1. Integrar **Gemini** (ou outro LLM) usando `SettingsService.getEffectiveGeminiApiKey()` após mensagens recebidas.
2. Persistir **contexto** da IA (Postgres ou Redis) e ligar à tela **Contexto**.
3. Ativar **Prisma** (client singleton, migrations, serviços) e APIs de negócio conforme o schema.
4. Proteger **Socket.IO** (middleware JWT ou sessão).
5. Ampliar **testes e2e** (hoje cobrem auth + `GET /api/chats`; exige **Redis** acessível).
6. Endurecer **CORS/origins** em produção e rever `cors: { origin: true }` no gateway.

---

## Arquitetura e dependências

```
[Browser]
   │  cookie JWT + fetch /api/*
   │  Socket.IO → /chats (namespace)
   ▼
[NestJS :3000]
   ├── AuthModule (JWT cookie, SettingsModule)
   ├── SettingsModule (Redis: Gemini key, password hash)
   ├── BotModule (Baileys, BotAuthStore Redis, BotChatState Redis snapshot)
   ├── ChatsModule (REST + ChatsGateway)
   ├── MessagesModule (POST send)
   ├── HealthModule
   ├── PrismaModule (vazio)
   └── ServeStaticModule → frontend/dist
```

**Redis** (dois usos principais):

1. **Baileys auth** (`baileys:creds`, chaves `baileys:keys:*`) — sessão WhatsApp oficial.
2. **Snapshot UI** (`bot:ui:snapshot:v1`) + **settings** (`app:settings:*`).

**Postgres**: necessário para Prisma/health quando `DATABASE_URL` está definido; a aplicação de chats/bot **não** grava conversas em Postgres hoje.

---

## Estrutura de pastas (resumo)

```txt
src/
  app.module.ts
  main.ts
  http-bootstrap.ts
  core/
    auth/           # JWT, login, logout, change password
    bot/            # BotService, BotAuthStore, BotChatState, bot.types, BotController
    health/
    prisma/         # schema.prisma, PrismaModule (vazio)
    settings/       # Redis settings, Gemini key, password hash helpers
  modules/
    chats/          # ChatsController, ChatsService, ChatsGateway (Socket.IO)
    messages/       # POST /api/messages/send
frontend/
  src/
    components/layout/app-shell.tsx
    contexts/       # auth-context, theme-context
    pages/
      auth/login-page
      sessao/         # WhatsApp conexão + QR
      contexto/       # UI só (IA) — sem API
      chats/
      configuracoes/  # Gemini, senha, tema
    routes/app-routes.tsx
test/
  app.e2e-spec.ts   # parcialmente desatualizado (ver Testes)
docker-compose.yml  # postgres, redis, app (opcional)
Dockerfile
prisma.config.ts
```

---

## Como executar

### Pré-requisitos

- Node.js 20+ (o Dockerfile usa 22)
- npm
- **Redis** obrigatório para o bot e para configurações dinâmicas
- **Postgres** se for usar Prisma/health com base real

### Só bases (Docker) + API e Vite no terminal

```bash
docker compose up -d postgres redis
```

Na raiz, crie `.env` (veja tabela abaixo). Depois:

```bash
npm install
npm install --prefix frontend
npm run start:dev          # terminal 1 — API :3000
npm run dev --prefix frontend   # terminal 2 — Vite :5173 (proxy /api → 3000)
```

Abra `http://localhost:5173`. Com tudo só na porta 3000 (build de produção), use `http://localhost:3000`.

### Build fullstack (um processo)

```bash
npm run build
npm run start:prod
```

### Docker Compose completo

`docker compose up` sobe Postgres, Redis e o serviço `app` (instala deps e `start:dev`). Ajuste variáveis em `docker-compose.yml` conforme necessário.

---

## Variáveis de ambiente

| Variável | Obrigatória | Uso |
|----------|-------------|-----|
| `JWT_SECRET` | Sim em produção | Assinatura JWT |
| `AUTH_USERNAME` | Sim | Único utilizador aceite no login |
| `AUTH_PASSWORD` | Sim até existir hash no Redis | Senha inicial; depois pode ficar só o hash em Redis |
| `REDIS_URL` | Recomendado | Default `redis://localhost:6379` em parte do código |
| `DATABASE_URL` | Para Prisma/health Postgres | Connection string PostgreSQL |
| `GEMINI_API_KEY` | Não | Fallback se a chave não estiver só no Redis |
| `COOKIE_SECRET` | Não | `cookie-parser` |
| `PORT` | Não | Default `3000` |
| `NODE_ENV` | Não | `production` ativa cookie `secure` |

Chaves Redis usadas pela app (referência):

- `baileys:*` — autenticação Baileys  
- `bot:ui:snapshot:v1` — último snapshot da lista de chats/mensagens da UI  
- `app:settings:gemini_api_key` — API key Gemini (painel)  
- `app:settings:auth_password_hash` — hash scrypt da senha alterada pelo painel  

---

## Fluxo de autenticação

1. **Bootstrap (frontend)**  
   `GET /api/auth/me` (público): lê o cookie `access_token`; se JWT válido, devolve `{ user: { username } }`, senão `{ user: null }`.

2. **Login**  
   `POST /api/auth/login` com `{ username, password }` (público).  
   `AuthService.validateCredentials` é **assíncrono**:
   - Compara `username` com `AUTH_USERNAME`.
   - Se existir `app:settings:auth_password_hash` no Redis, valida a senha contra esse hash (scrypt).
   - Caso contrário, compara com `AUTH_PASSWORD` (comparação em tempo constante).
   - Em caso de sucesso, emite JWT (payload com `username`, expiração 7 dias) e define cookie `httpOnly`, `sameSite: lax`, `path: /`, `secure` se produção.

3. **Rotas protegidas**  
   `JwtAuthGuard` global + `passport-jwt` extrai o token **do cookie** `access_token` (não do header Authorization por omissão).

4. **Logout**  
   `POST /api/auth/logout` (público) limpa o cookie.

5. **Alterar senha**  
   `POST /api/auth/password` (protegido): body `ChangePasswordDto` (`currentPassword`, `newPassword` mín. 8 caracteres). Valida a senha atual com a mesma lógica do login e grava **novo hash** em Redis. A partir daí o login usa só o hash (continua a ser o mesmo `AUTH_USERNAME`).

6. **Frontend**  
   `apiFetch` envia `credentials: 'include'`; em `401` limpa o utilizador no contexto e redireciona ao fluxo de login.

---

## Fluxo do bot WhatsApp

1. **Arranque**  
   `BotService.onModuleInit` → fila serial `connect()` → `runConnect()`.

2. **Autenticação Baileys**  
   `BotAuthStore.createAuthenticationState()` usa **Redis** como armazenamento de credenciais (equivalente multi-file auth state). Há mutex em escritas para evitar corrida.

3. **Socket**  
   `makeWASocket` com versão recente do WhatsApp Web, browser label “Projeto Amil”, logger Pino filtrado.

4. **Estados de ligação**  
   - `connection.update`: QR code, `connecting`, `open`, `close`.  
   - Em `open`: estado interno `conectado`, emite snapshot para listeners.  
   - Em `close`: distingue logout definitivo (limpa credenciais Redis e volta a tentar) vs reconexão temporária.

5. **Mensagens**  
   `messages.upsert` (tipos `notify` / `append`) delega em `BotChatState.processMessagesUpsert`.  
   Eventos `chats.*` e `contacts.upsert` atualizam metadados de conversas e nomes.

6. **Exposição ao painel**  
   - HTTP: `GET /api/bot/connection` → `{ state, connected, qr, updatedAt, lastError }`.  
   - Tempo real: `ChatsGateway` emite `bot:connection` para todos os clientes no namespace ao conectar e quando o estado muda.

7. **Envio**  
   `sendTextMessage(to, text)` normaliza destino (`@s.whatsapp.net` se for só dígitos), envia via Baileys e regista na `BotChatState` (mensagem “from me”).

**Nota:** Não há “echo” automático genérico descrito no código atual; o foco é persistir estado de UI e permitir envio manual/API.

---

## Fluxo de chats (REST + WebSocket)

### REST (tudo sob `/api`, cookie JWT)

| Método | Caminho | Descrição |
|--------|---------|-----------|
| `GET` | `/chats` | Lista resumida de chats (só JIDs de contato). |
| `GET` | `/chats/:chatId/messages` | Mensagens guardadas na memória do bot para esse chat (`chatId` URL-encoded se tiver `@`). |
| `POST` | `/chats/:chatId/messages` | Envia texto para o chat (corpo `{ text }`). |

### WebSocket (Socket.IO)

- **Namespace:** `/chats`  
- **URL:** mesma origem que a API (no dev com Vite, o cliente aponta explicitamente para `http://localhost:3000` quando a porta é 5173).  
- **CORS:** `origin: true`, `credentials: true` (aberto; ver limitações de segurança).  
- **Ao conectar:** o servidor envia `chats:list` (lista atual) e `bot:connection` (snapshot).  
- **Eventos emitidos pelo servidor:**  
  - `chats:updated` — lista de chats alterada.  
  - `chat:messages` — `{ chatId, messages }` quando as mensagens de um chat mudam.  
  - `bot:connection` — alteração de estado da ligação WhatsApp.

### Modelo de dados na UI do bot

- Lista e mensagens vivem em `BotChatState` (Maps em memória), com **debounce** para gravar snapshot no Redis.  
- Na subida, **hidrata** a partir de `bot:ui:snapshot:v1` se existir.  
- Grupos e newsletters são **filtrados** na listagem; conversas `@lid` e `@s.whatsapp.net` entram.

---

## Módulo de mensagens genérico

- `POST /api/messages/send` com corpo `{ to, text }` (DTO validado).  
- Encaminha para `BotService.sendTextMessage`.  
- Útil para integrações que não passam pela tela de Chats.

---

## Configurações (Gemini e senha)

| Método | Caminho | Descrição |
|--------|---------|-----------|
| `GET` | `/api/settings` | `{ geminiConfigured, passwordOverriddenInRedis }` (sem expor segredos). |
| `PUT` | `/api/settings/gemini` | `{ apiKey }`; string vazia remove a chave do Redis. |
| `POST` | `/api/auth/password` | Altera senha (ver auth). |

`SettingsService.getEffectiveGeminiApiKey()` devolve Redis primeiro, depois `GEMINI_API_KEY` no ambiente — preparado para uso futuro pelo motor de IA.

---

## Health check

- `GET /api/health` (**público**): tenta conectar a Postgres (`DATABASE_URL`) e Redis (`REDIS_URL` ou localhost), devolve `up` agregado e detalhe por dependência.

---

## Frontend

### Rotas autenticadas (layout com sidebar fixa + scroll só no `main`)

| Rota | Página |
|------|--------|
| `/` | **Sessão** — estado WhatsApp, QR, Socket `bot:connection` + fetch inicial. |
| `/contexto` | **Contexto** — texto para IA (só estado local). |
| `/chats` | **Chats** — lista, thread, envio, Socket.IO. |
| `/configuracoes` | **Configurações** — Gemini, senha, tema (claro / escuro / sistema). |

### Outros

- `/login` — formulário; redireciona se já autenticado.  
- `ThemeProvider` — classe `dark` no `documentElement`; preferência em `localStorage` (`projeto-amil-theme`).  
- Toaster Sonner (canto superior direito).

---

## Prisma e banco de dados

- Ficheiro: `src/core/prisma/schema.prisma` — domínio rico (operadora, linhas, planos, preços, coberturas, elegibilidade, documentos).  
- `PrismaModule` está **vazio** (sem `PrismaService`).  
- **Migrations:** pasta configurada em `prisma.config.ts` (`prisma/migrations`); aplicação e uso em código são **pendentes**.

---

## API e documentação

- Swagger UI: **`/api/docs`** (cookie auth documentado para rotas protegidas).  
- Prefixo global: **`/api`**.

---

## Testes

- **Unitários Jest:** há specs em `messages` (e outros conforme o repositório).  
- **E2E** (`test/app.e2e-spec.ts`):
  - Exige **Redis** em `REDIS_URL` ou `redis://127.0.0.1:6379`.
  - Antes de cada caso remove `app:settings:auth_password_hash` e `app:settings:gemini_api_key` para o login com `AUTH_PASSWORD` não colidir com dados locais.
  - Cenários: `GET /api/chats` sem cookie → `401`; `GET /api/auth/me` sem cookie → `{ user: null }`; após login → `GET /api/chats` → `200` com array.
  - O pacote `baileys` é mapeado para `test/mocks/baileys.e2e.mock.ts` (stubs como `initAuthCreds`, `BufferJSON`, `proto`, etc.).

```bash
npm run test
npm run test:e2e
```

---

## Segurança e limitações

- Credenciais e segredos: usar `.env` forte; não commitar segredos reais.  
- Produção: HTTPS para cookies `secure`, `JWT_SECRET` robusto.  
- Login é adequado para **painel interno** de um único operador; não escala a multi-tenant sem evolução.  
- **Socket.IO sem JWT:** tratar como risco em redes abertas; restringir rede ou adicionar autenticação no gateway.  
- Baileys não é API oficial do WhatsApp; uso sujeito a termos da Meta.

---

## Scripts úteis

| Comando | Descrição |
|---------|-----------|
| `npm run start:dev` | Nest em modo watch |
| `npm run build` | Frontend + Nest |
| `npm run start:prod` | Só servidor (requer `dist` + `frontend/dist`) |
| `npm run dev --prefix frontend` | Vite |
| `npm run lint` | ESLint (raiz) |
| `npm run test` / `test:e2e` | Testes |

---

Documento alinhado ao estado do repositório em **abril de 2026**. Se alterar módulos ou rotas, atualize esta página na mesma alteração.
