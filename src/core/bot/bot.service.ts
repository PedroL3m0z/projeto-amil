import { Boom } from '@hapi/boom';
import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import makeWASocket, {
  Browsers,
  DisconnectReason,
  fetchLatestBaileysVersion,
  type Contact,
} from 'baileys';
import pino from 'pino';
import { BotAuthStore } from './bot-auth.store';
import { BotChatState } from './bot-chat.state';
import type { BotChatMessage, BotChatSummary, BotConnectionSnapshot } from './bot.types';

export type { BotChatMessage, BotChatSummary, BotConnectionSnapshot };

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

  constructor(
    private readonly auth: BotAuthStore,
    private readonly chats: BotChatState,
  ) {}

  async onModuleInit() {
    await this.connect();
  }

  onModuleDestroy() {
    this.sock?.end(undefined);
    this.sock = null;
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

  private async connect(): Promise<void> {
    const job = this.connectQ.then(() => this.runConnect());
    this.connectQ = job.catch(() => undefined);
    await job;
  }

  private async runConnect() {
    await this.auth.drainPendingWrites();
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
    });
    sock.ev.on('chats.upsert', (e) => this.chats.onChatsUpsert(e));
    sock.ev.on('chats.update', (e) => this.chats.onChatsUpdate(e));
    sock.ev.on('contacts.upsert', (c: Contact[]) => this.chats.onContactsUpsert(c));
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
}
