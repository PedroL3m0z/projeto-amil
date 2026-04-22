import { Boom } from '@hapi/boom';
import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import makeWASocket, {
  areJidsSameUser,
  Browsers,
  DisconnectReason,
  downloadMediaMessage,
  fetchLatestBaileysVersion,
  type Contact,
  type WAMessage,
} from 'baileys';
import pino from 'pino';
import { BotAuthStore } from './bot-auth.store';
import { BotChatState } from './bot-chat.state';
import type {
  BotChatMessage,
  BotChatSummary,
  BotConnectionSnapshot,
  BotTypingPayload,
} from './bot.types';

export type { BotChatMessage, BotChatSummary, BotConnectionSnapshot, BotTypingPayload };

type Sock = ReturnType<typeof makeWASocket>;

function disconnectUserMessage(code?: number, message?: string): string {
  if (code === DisconnectReason.loggedOut) {
    return 'Sessão encerrada no WhatsApp. Escaneie o QR novamente para conectar.';
  }
  if (code === DisconnectReason.badSession) {
    return 'Sessão inválida ou corrompida. Limpe o Redis ou conecte de novo.';
  }
  if (code === DisconnectReason.forbidden) return 'Acesso negado pelo WhatsApp.';
  if (code === DisconnectReason.multideviceMismatch) {
    return 'Conta incompatível com multi-dispositivo.';
  }
  if (message?.trim()) return `Falha na conexão: ${message}`;
  return `Falha na conexão (código ${String(code ?? '?')}).`;
}

function disconnectLog(code?: number, message?: string): string {
  if (code === DisconnectReason.loggedOut) return 'logout no aparelho';
  if (message?.includes('connection closed')) return 'conexão fechada pelo servidor';
  if (message?.includes('timed out')) return 'timeout';
  return `${message ?? '?'} (${String(code)})`;
}

const baileysLog = pino({
  level: 'warn',
  hooks: {
    logMethod(args, method) {
      const m =
        (typeof args[0] === 'string' ? args[0] : undefined) ??
        (typeof args[1] === 'string' ? args[1] : undefined);
      if (m?.includes("unexpected error in 'init queries'")) return;
      method.apply(this, args);
    },
  },
});

@Injectable()
export class BotService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(BotService.name);
  private connectQ = Promise.resolve();

  private sock: Sock | null = null;
  private connectionState: BotConnectionSnapshot['state'] = 'conectando';
  private latestQr: string | null = null;
  private updatedAtIso = new Date().toISOString();
  private lastError: string | null = null;
  private readonly connListeners = new Set<(s: BotConnectionSnapshot) => void>();

  private readonly rawMessageListeners = new Set<(messages: WAMessage[]) => void>();
  private readonly typingListeners = new Set<(p: BotTypingPayload) => void>();
  private readonly presenceSubscribed = new Set<string>();
  private readonly typingClearTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private presSubscribeTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly auth: BotAuthStore,
    private readonly chats: BotChatState,
  ) {}

  async onModuleInit() {
    await this.connect();
  }

  onModuleDestroy() {
    this.clearTypingTimers();
    if (this.presSubscribeTimer) {
      clearTimeout(this.presSubscribeTimer);
      this.presSubscribeTimer = null;
    }
    this.sock?.end(undefined);
    this.sock = null;
    this.presenceSubscribed.clear();
    this.connectionState = 'desconectado';
    this.lastError = null;
    this.updatedAtIso = new Date().toISOString();
    this.emitConn();
  }

  getConnectionSnapshot(): BotConnectionSnapshot {
    return {
      state: this.connectionState,
      connected: this.connectionState === 'conectado',
      qr: this.latestQr,
      updatedAt: this.updatedAtIso,
      lastError: this.lastError,
    };
  }

  async sendTextMessage(to: string, text: string) {
    const jid = this.normalizeRecipient(to);
    if (!jid) throw new Error('Destino inválido.');
    if (!this.sock || this.connectionState !== 'conectado') {
      throw new Error('Bot não está conectado ao WhatsApp.');
    }
    const sent = await this.sock.sendMessage(jid, { text });
    const ts = new Date().toISOString();
    const key = sent?.key;
    const remoteJid = key?.remoteJid ?? jid;
    this.chats.recordOutboundTextMessage({
      remoteJid,
      remoteJidAlt: key?.remoteJidAlt,
      text,
      keyId: key?.id,
      ts,
    });
  }

  listChats() {
    return this.chats.listChats();
  }

  listMessages(chatId: string) {
    return this.chats.listMessages(chatId);
  }

  /** URL da foto de perfil (preview) via Baileys; `null` se indisponível ou bot desligado. */
  async getProfilePictureUrl(to: string): Promise<string | null> {
    const jid = this.normalizeRecipient(to);
    if (!jid) return null;
    if (!this.sock || this.connectionState !== 'conectado') return null;
    try {
      const url = await this.sock.profilePictureUrl(jid, 'preview');
      return url ?? null;
    } catch {
      return null;
    }
  }

  markChatRead(chatId: string) {
    this.chats.markChatRead(chatId);
  }

  onChatsChanged(fn: Parameters<BotChatState['onChatsChanged']>[0]) {
    return this.chats.onChatsChanged(fn);
  }

  onConnectionChanged(fn: (s: BotConnectionSnapshot) => void) {
    this.connListeners.add(fn);
    return () => this.connListeners.delete(fn);
  }

  onChatMessagesChanged(fn: Parameters<BotChatState['onChatMessagesChanged']>[0]) {
    return this.chats.onChatMessagesChanged(fn);
  }

  onTypingUpdate(fn: (p: BotTypingPayload) => void) {
    this.typingListeners.add(fn);
    return () => this.typingListeners.delete(fn);
  }

  /** Assina as mensagens cruas recebidas do WhatsApp (ex: para baixar mídias). */
  onRawMessagesUpsert(fn: (messages: WAMessage[]) => void) {
    this.rawMessageListeners.add(fn);
    return () => this.rawMessageListeners.delete(fn);
  }

  /** Baixa o conteúdo bruto de uma mídia (áudio, imagem, etc). Retorna `null` em falha. */
  async downloadMessageMedia(message: WAMessage): Promise<Buffer | null> {
    if (!message.message) return null;
    try {
      const buf = await downloadMediaMessage(message, 'buffer', {});
      return Buffer.isBuffer(buf) ? buf : Buffer.from(buf as Uint8Array);
    } catch (err) {
      this.log.warn(
        `Falha ao baixar mídia: ${err instanceof Error ? err.message : String(err)}`,
      );
      return null;
    }
  }

  /** Resolve o JID canônico (igual ao `id` retornado em `listChats`). */
  canonicalChatId(jid: string): string {
    return this.chats.canonicalChatId(jid);
  }

  /** Pasta no R2 para mídia: `telefone@s.whatsapp.net__lid@lid` quando o par existe; senão um só JID. */
  mediaStorageFolderId(jid: string): string {
    return this.chats.mediaStorageFolderId(jid);
  }

  /** JIDs alternativos do mesmo contacto (ex.: LID + número) para cruzar dados no Mongo. */
  linkedDirectChatIds(jid: string): string[] {
    return this.chats.linkedDirectChatIds(jid);
  }

  /** Gera o mesmo `stableId` usado internamente para identificar uma mensagem. */
  stableMessageId(jid: string, keyId: string | null | undefined, fromMe: boolean): string {
    return this.chats.stableMessageId(jid, keyId, fromMe);
  }

  /** Marca um `attachment` como pronto (ex: após upload concluir) e re-emite o chat. */
  markAttachmentReady(chatId: string, messageStableId: string): boolean {
    return this.chats.markAttachmentReady(chatId, messageStableId);
  }

  /** Atualiza o texto mostrado de uma mensagem (ex.: transcrição de áudio). */
  updateChatMessageText(chatId: string, messageStableId: string, text: string): boolean {
    return this.chats.replaceMessageText(chatId, messageStableId, text);
  }

  /** Inscreve presença nos JIDs listados (necessário para receber `composing` / `recording`). */
  schedulePresenceSubscribe(chats?: BotChatSummary[]) {
    if (this.presSubscribeTimer) clearTimeout(this.presSubscribeTimer);
    this.presSubscribeTimer = setTimeout(() => {
      this.presSubscribeTimer = null;
      void this.runPresenceSubscribe(chats);
    }, 350);
  }

  private clearTypingTimers() {
    for (const t of this.typingClearTimers.values()) clearTimeout(t);
    this.typingClearTimers.clear();
  }

  private emitTyping(p: BotTypingPayload) {
    for (const fn of this.typingListeners) {
      try {
        fn(p);
      } catch {
        /* */
      }
    }
  }

  private handlePresenceUpdate(ev: { id: string; presences: Record<string, { lastKnownPresence?: string }> }) {
    const root = this.chats.canonicalContactChatId(ev.id);
    if (!root) return;
    const me = this.sock?.authState.creds.me?.id;
    let active = false;
    let kind: 'composing' | 'recording' | null = null;
    for (const [participant, pr] of Object.entries(ev.presences ?? {})) {
      if (me && areJidsSameUser(participant, me)) continue;
      const t = pr?.lastKnownPresence;
      if (t === 'composing') {
        active = true;
        kind = 'composing';
      } else if (t === 'recording') {
        active = true;
        kind = 'recording';
      }
    }
    const prev = this.typingClearTimers.get(root);
    if (prev) clearTimeout(prev);
    if (active) {
      this.typingClearTimers.set(
        root,
        setTimeout(() => {
          this.typingClearTimers.delete(root);
          this.emitTyping({ chatId: root, typing: false, kind: null });
        }, 7000),
      );
    } else {
      this.typingClearTimers.delete(root);
    }
    this.emitTyping({ chatId: root, typing: active, kind: active ? kind : null });
  }

  private async runPresenceSubscribe(chats?: BotChatSummary[]) {
    const sock = this.sock;
    if (!sock || this.connectionState !== 'conectado') return;
    const ids = chats?.length ? chats.map((c) => c.id) : this.chats.listChats().map((c) => c.id);
    for (const id of ids) {
      if (this.presenceSubscribed.has(id)) continue;
      try {
        await sock.presenceSubscribe(id);
        this.presenceSubscribed.add(id);
      } catch {
        /* ignore */
      }
    }
  }

  private async connect(): Promise<void> {
    const job = this.connectQ.then(() => this.runConnect());
    this.connectQ = job.catch(() => undefined);
    await job;
  }

  private async runConnect() {
    await this.auth.drainPendingWrites();
    this.clearTypingTimers();
    this.presenceSubscribed.clear();
    this.sock?.end(undefined);
    this.sock = null;
    await this.auth.drainPendingWrites();

    this.connectionState = 'conectando';
    this.updatedAtIso = new Date().toISOString();

    const { state, saveCreds } = await this.auth.createAuthenticationState();
    const { version } = await fetchLatestBaileysVersion();
    const sock = makeWASocket({
      auth: state,
      version,
      browser: Browsers.appropriate('Projeto Amil'),
      logger: baileysLog,
    });
    this.sock = sock;

    const save = () =>
      saveCreds().catch((e: unknown) =>
        this.log.error(e instanceof Error ? e.message : String(e)),
      );

    sock.ev.on('creds.update', save);

    sock.ev.on('connection.update', (u) => {
      const { connection, lastDisconnect, qr } = u;
      if (qr) {
        this.latestQr = qr;
        this.updatedAtIso = new Date().toISOString();
        this.emitConn();
        this.log.log('QR disponível — escaneie no WhatsApp → Aparelhos conectados.');
      }
      if (connection === 'close') {
        this.clearTypingTimers();
        this.presenceSubscribed.clear();
        const err = lastDisconnect?.error as Boom | undefined;
        const code = err?.output?.statusCode;
        const loggedOut = code === DisconnectReason.loggedOut;
        const reconnect = !loggedOut;
        if (reconnect) {
          this.connectionState = 'conectando';
          this.latestQr = null;
          this.lastError = null;
        } else {
          this.connectionState = 'desconectado';
          this.latestQr = null;
          this.lastError = disconnectUserMessage(code, err?.message);
        }
        this.updatedAtIso = new Date().toISOString();
        this.emitConn();
        this.log.warn(
          `Desligado: ${disconnectLog(code, err?.message)} · reconectar: ${reconnect}`,
        );
        if (loggedOut) void this.afterLogout();
        else if (reconnect) void this.reconnectSoon(800);
      } else if (connection === 'open') {
        this.connectionState = 'conectado';
        this.latestQr = null;
        this.lastError = null;
        this.updatedAtIso = new Date().toISOString();
        this.emitConn();
        this.log.log('WhatsApp conectado.');
        this.schedulePresenceSubscribe();
        void saveCreds().catch((e: unknown) =>
          this.log.error(e instanceof Error ? e.message : String(e)),
        );
      } else if (connection === 'connecting') {
        this.connectionState = 'conectando';
        this.updatedAtIso = new Date().toISOString();
        this.emitConn();
      }
    });

    sock.ev.on('messages.upsert', (e) => {
      if (e.type !== 'notify' && e.type !== 'append') return;
      this.chats.processMessagesUpsert(e.messages);
      this.emitRawMessages(e.messages);
    });
    sock.ev.on('messages.update', (updates) => {
      this.chats.processMessagesUpdate(updates as Array<{
        key?: {
          id?: string | null;
          fromMe?: boolean | null;
          remoteJid?: string | null;
          remoteJidAlt?: string | null;
        };
        update?: { status?: unknown };
      }>);
    });
    sock.ev.on('chats.upsert', (e) => this.chats.onChatsUpsert(e));
    sock.ev.on('chats.update', (e) => this.chats.onChatsUpdate(e));
    sock.ev.on('contacts.upsert', (c: Contact[]) => this.chats.onContactsUpsert(c));
    sock.ev.on('presence.update', (ev: { id: string; presences: Record<string, { lastKnownPresence?: string }> }) => {
      this.handlePresenceUpdate(ev);
    });
  }

  private async reconnectSoon(ms: number) {
    await new Promise((r) => setTimeout(r, ms));
    await this.connect();
  }

  private async afterLogout() {
    try {
      await this.auth.resetAuthState();
    } catch (e: unknown) {
      this.log.error(e instanceof Error ? e.message : String(e));
    }
    await new Promise((r) => setTimeout(r, 5000));
    await this.connect();
  }

  private normalizeRecipient(to: string): string | null {
    const raw = to.trim();
    if (!raw) return null;
    if (raw.includes('@')) return raw;
    const d = raw.replace(/\D/g, '');
    return d ? `${d}@s.whatsapp.net` : null;
  }

  private emitConn() {
    const s = this.getConnectionSnapshot();
    for (const fn of this.connListeners) {
      try {
        fn(s);
      } catch {
        /* */
      }
    }
  }

  private emitRawMessages(messages: WAMessage[]) {
    if (messages.length === 0) return;
    for (const fn of this.rawMessageListeners) {
      try {
        fn(messages);
      } catch (err) {
        this.log.warn(
          `Listener de raw messages falhou: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }
}
