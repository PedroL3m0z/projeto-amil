import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import type { Redis } from 'ioredis';
import type { Contact, WAMessage } from 'baileys';
import type {
  BotAttachment,
  BotChatMessage,
  BotChatSummary,
  BotMessageStatus,
} from './bot.types';
import { BOT_AUTH_REDIS } from './bot-auth.store';
import { unwrapMessage } from './message-unwrap.util';

type Row = Omit<BotChatSummary, 'displayName' | 'unreadCount'>;
const MAX = 400;
const UI_SNAPSHOT_KEY = 'bot:ui:snapshot:v1';

type UiSnapshotV1 = {
  v: 1;
  chats: [string, Row][];
  messages: [string, BotChatMessage[]][];
  contacts: [string, string][];
  edges: [string, string][];
  unread?: [string, number][];
};

function stableId(
  jid: string,
  keyId: string | null | undefined,
  fromMe: boolean,
): string {
  const k =
    keyId != null && String(keyId).length > 0
      ? String(keyId)
      : `noid:${jid}:${Date.now()}`;
  return `${k}|${fromMe ? '1' : '0'}`;
}

function normalizeMessageStatus(raw: unknown): BotMessageStatus | null {
  if (raw === 'read') return 'read';
  if (raw === 'delivered') return 'delivered';
  if (raw === 'sent') return 'sent';
  if (typeof raw === 'number') {
    if (raw >= 4) return 'read';
    if (raw >= 3) return 'delivered';
    if (raw >= 1) return 'sent';
  }
  return null;
}

/** Apenas conversas diretas (contato), não grupo nem canal. */
function isContactJid(jid: string): boolean {
  if (!jid || jid === 'status@broadcast') return false;
  if (jid.endsWith('@g.us') || jid.endsWith('@newsletter')) return false;
  return jid.endsWith('@s.whatsapp.net') || jid.endsWith('@lid');
}

function messageText(m: WAMessage): string {
  const msg = unwrapMessage(m.message);
  if (!msg) return '';
  const t =
    msg.conversation ??
    msg.extendedTextMessage?.text ??
    msg.imageMessage?.caption ??
    msg.videoMessage?.caption ??
    msg.documentMessage?.caption ??
    '';
  if (t?.trim()) return t.trim();
  if (msg.stickerMessage) return '[Figurinha]';
  if (msg.audioMessage) return '[Áudio]';
  if (msg.imageMessage) return '[Imagem]';
  if (msg.videoMessage) return '[Vídeo]';
  if (msg.documentMessage) return '[Documento]';
  if (msg.contactMessage || msg.contactsArrayMessage) return '[Contato]';
  if (msg.locationMessage || msg.liveLocationMessage) return '[Localização]';
  if (msg.pollCreationMessage || msg.pollUpdateMessage) return '[Enquete]';
  if (msg.reactionMessage) return '[Reação]';
  if (msg.protocolMessage || msg.senderKeyDistributionMessage) return '';
  return '';
}

@Injectable()
export class BotChatState implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(BotChatState.name);
  private readonly chats = new Map<string, Row>();
  private readonly messagesByChat = new Map<string, BotChatMessage[]>();
  private readonly messageIdsByChat = new Map<string, Set<string>>();
  private readonly contactNames = new Map<string, string>();
  private readonly jidAdjacency = new Map<string, Set<string>>();
  private readonly chatsListeners = new Set<(chats: BotChatSummary[]) => void>();
  private readonly msgListeners = new Set<
    (p: { chatId: string; messages: BotChatMessage[] }) => void
  >();

  /** Contagem de não lidas por JID canónico do chat (mesmo id que `listChats`). */
  private readonly unreadByRoot = new Map<string, number>();

  private hydrateDone = false;
  private snapTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(@Inject(BOT_AUTH_REDIS) private readonly redis: Redis) {}

  async onModuleInit() {
    await this.hydrateFromRedis();
    this.hydrateDone = true;
  }

  async onModuleDestroy() {
    if (this.snapTimer) {
      clearTimeout(this.snapTimer);
      this.snapTimer = null;
    }
    await this.flushSnapshotToRedis();
  }

  private scheduleSnapshot() {
    if (!this.hydrateDone) return;
    if (this.snapTimer) clearTimeout(this.snapTimer);
    this.snapTimer = setTimeout(() => {
      this.snapTimer = null;
      void this.flushSnapshotToRedis();
    }, 300);
  }

  private buildEdges(): [string, string][] {
    const out: [string, string][] = [];
    for (const [a, ns] of this.jidAdjacency) {
      for (const b of ns) {
        if (a < b) out.push([a, b]);
      }
    }
    return out;
  }

  private async flushSnapshotToRedis() {
    try {
      const payload: UiSnapshotV1 = {
        v: 1,
        chats: [...this.chats.entries()],
        messages: [...this.messagesByChat.entries()],
        contacts: [...this.contactNames.entries()],
        edges: this.buildEdges(),
        unread: [...this.unreadByRoot.entries()],
      };
      await this.redis.set(UI_SNAPSHOT_KEY, JSON.stringify(payload));
    } catch (e: unknown) {
      this.log.warn(
        `Falha ao gravar snapshot UI no Redis: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  private async hydrateFromRedis() {
    try {
      const raw = await this.redis.get(UI_SNAPSHOT_KEY);
      if (!raw) return;
      const p = JSON.parse(raw) as Partial<UiSnapshotV1>;
      if (p.v !== 1 || !Array.isArray(p.chats)) return;

      this.jidAdjacency.clear();
      for (const [a, b] of p.edges ?? []) {
        if (typeof a === 'string' && typeof b === 'string') this.edge(a, b);
      }
      for (const [id, name] of p.contacts ?? []) {
        if (typeof id === 'string' && typeof name === 'string') {
          this.contactNames.set(id, name);
        }
      }
      this.chats.clear();
      for (const [id, row] of p.chats) {
        if (typeof id === 'string' && row && typeof row === 'object') {
          this.chats.set(id, row as Row);
        }
      }
      this.messagesByChat.clear();
      this.messageIdsByChat.clear();
      for (const [id, msgs] of p.messages ?? []) {
        if (typeof id !== 'string' || !Array.isArray(msgs)) continue;
        const list = msgs as BotChatMessage[];
        this.messagesByChat.set(id, list);
        this.messageIdsByChat.set(id, new Set(list.map((m) => m.id)));
      }
      this.unreadByRoot.clear();
      for (const [id, n] of p.unread ?? []) {
        if (typeof id !== 'string' || typeof n !== 'number' || n < 1) continue;
        this.unreadByRoot.set(id, Math.min(n, 999));
      }
      this.log.log(`UI de chats restaurada do Redis (${String(this.chats.size)} chats).`);
    } catch (e: unknown) {
      this.log.warn(
        `Snapshot UI inválido ou ilegível: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  /** JID canónico do contacto (1:1) para presença / typing; `null` se não for DM. */
  canonicalContactChatId(jid: string): string | null {
    if (!isContactJid(jid)) return null;
    return this.storageKeyFor(jid);
  }

  listChats(): BotChatSummary[] {
    const groups = new Map<string, Row[]>();
    for (const c of this.chats.values()) {
      const root = this.storageKeyFor(c.id);
      const arr = groups.get(root) ?? [];
      arr.push(c);
      groups.set(root, arr);
    }
    const merged: Row[] = [];
    for (const [, arr] of groups) merged.push(this.mergeRows(arr));
    return merged
      .map((c) => {
        const id = this.storageKeyFor(c.id);
        return {
          ...c,
          id,
          displayName: this.displayName(id, c.name),
          lastMessageAuthor: c.lastMessageAuthor ?? null,
          unreadCount: this.unreadByRoot.get(id) ?? 0,
        };
      })
      .filter((c) => isContactJid(c.id))
      .sort((a, b) => {
        const ta = a.lastMessageAt ? Date.parse(a.lastMessageAt) : 0;
        const tb = b.lastMessageAt ? Date.parse(b.lastMessageAt) : 0;
        return tb - ta;
      });
  }

  markChatRead(chatId: string) {
    const root = this.storageKeyFor(chatId);
    if ((this.unreadByRoot.get(root) ?? 0) === 0) return;
    this.unreadByRoot.set(root, 0);
    this.emitChats();
    this.scheduleSnapshot();
  }

  private bumpUnread(root: string) {
    const next = Math.min((this.unreadByRoot.get(root) ?? 0) + 1, 999);
    this.unreadByRoot.set(root, next);
  }

  listMessages(chatId: string): BotChatMessage[] {
    const seen = new Set<string>();
    const out: BotChatMessage[] = [];
    for (const id of this.component(chatId)) {
      for (const m of this.messagesByChat.get(id) ?? []) {
        if (seen.has(m.id)) continue;
        seen.add(m.id);
        out.push(m);
      }
    }
    return out.sort((a, b) => a.at.localeCompare(b.at));
  }

  onChatsChanged(fn: (chats: BotChatSummary[]) => void) {
    this.chatsListeners.add(fn);
    return () => this.chatsListeners.delete(fn);
  }

  onChatMessagesChanged(
    fn: (p: { chatId: string; messages: BotChatMessage[] }) => void,
  ) {
    this.msgListeners.add(fn);
    return () => this.msgListeners.delete(fn);
  }

  onChatsUpsert(events: Array<{ id?: string | null; name?: string | null }>) {
    let ch = false;
    for (const e of events) {
      if (!e.id) continue;
      this.upsert(this.storageKeyFor(e.id), null, null, e.name ?? null);
      ch = true;
    }
    if (ch) this.emitChats();
  }

  onChatsUpdate(updates: Array<{ id?: string | null; name?: string | null }>) {
    let ch = false;
    for (const u of updates) {
      if (!u.id) continue;
      const nm = typeof u.name === 'string' && u.name.trim() ? u.name.trim() : null;
      if (nm) {
        this.upsert(this.storageKeyFor(u.id), null, null, nm);
        ch = true;
      }
    }
    if (ch) this.emitChats();
  }

  onContactsUpsert(contacts: Contact[]) {
    let ch = false;
    for (const c of contacts) {
      let row = false;
      const label = c.name?.trim() || c.notify?.trim() || c.verifiedName?.trim();
      if (label) {
        this.contactNames.set(c.id, label);
        if (c.lid) this.contactNames.set(c.lid, label);
        if (c.phoneNumber) this.contactNames.set(c.phoneNumber, label);
        row = true;
      }
      if (c.phoneNumber && c.lid) row = this.link(c.phoneNumber, c.lid) || row;
      if (c.id && c.lid && c.id !== c.lid) row = this.link(c.id, c.lid) || row;
      if (c.id && c.phoneNumber && c.id !== c.phoneNumber) {
        row = this.link(c.id, c.phoneNumber) || row;
      }
      if (row) ch = true;
    }
    if (ch) this.emitChats();
  }

  processMessagesUpsert(messages: WAMessage[]) {
    if (messages.length > 0) {
      const sample = messages[0];
      const kind = sample.message
        ? Object.keys(unwrapMessage(sample.message) ?? {})[0] ?? 'unknown'
        : 'empty';
      this.log.log(
        `messages.upsert: ${String(messages.length)} msg(s), primeira jid=${String(sample.key.remoteJid)} fromMe=${String(Boolean(sample.key.fromMe))} tipo=${kind}`,
      );
    }
    let dirty = false;
    for (const m of messages) {
      const jid = m.key.remoteJid;
      if (!jid || jid === 'status@broadcast') continue;
      const alt = m.key.remoteJidAlt;
      if (alt && !jid.endsWith('@g.us') && !jid.endsWith('@newsletter')) {
        if (this.link(jid, alt)) dirty = true;
      }
      if (!m.message) continue;
      const inner = unwrapMessage(m.message);
      const text = messageText(m);
      if (!text) continue;
      const fromMe = Boolean(m.key.fromMe);
      const status = fromMe ? normalizeMessageStatus((m as { status?: unknown }).status) ?? 'sent' : undefined;
      const ts =
        typeof m.messageTimestamp === 'number'
          ? new Date(Number(m.messageTimestamp) * 1000).toISOString()
          : new Date().toISOString();
      const sid = stableId(jid, m.key.id, fromMe);
      const audioMsg = inner?.audioMessage;
      const attachment: BotAttachment | undefined = audioMsg
        ? {
            kind: 'audio',
            mimeType: audioMsg.mimetype?.trim() || 'audio/ogg',
            ptt: audioMsg.ptt ?? undefined,
            durationSec:
              typeof audioMsg.seconds === 'number' ? audioMsg.seconds : undefined,
            ready: false,
          }
        : undefined;
      if (!fromMe && m.pushName) {
        this.contactNames.set(jid, m.pushName);
        this.contactNames.set(this.storageKeyFor(jid), m.pushName);
      }
      const stor = new Set<string>([this.storageKeyFor(jid)]);
      if (alt && !jid.endsWith('@g.us') && !jid.endsWith('@newsletter')) {
        stor.add(this.storageKeyFor(alt));
      }
      let any = false;
      let inboundNew = false;
      for (const s of stor) {
        if (this.pushMsg(s, { id: sid, at: ts, text, fromMe, status, attachment })) {
          any = true;
          if (!fromMe) inboundNew = true;
        }
      }
      if (any) {
        const inboundAuthor = !fromMe
          ? m.pushName?.trim() || this.peerLabel(jid) || null
          : null;
        for (const s of stor) {
          this.upsert(
            s,
            text,
            ts,
            fromMe ? null : (m.pushName ?? null),
            fromMe,
            inboundAuthor,
          );
        }
        dirty = true;
      }
      if (inboundNew) {
        this.bumpUnread(this.storageKeyFor(jid));
      }
    }
    if (dirty) this.emitChats();
  }

  processMessagesUpdate(
    updates: Array<{
      key?: {
        id?: string | null;
        fromMe?: boolean | null;
        remoteJid?: string | null;
        remoteJidAlt?: string | null;
      };
      update?: { status?: unknown };
    }>,
  ) {
    const touched = new Set<string>();
    for (const u of updates) {
      const key = u.key;
      if (!key?.fromMe || !key.id || !key.remoteJid) continue;
      const nextStatus = normalizeMessageStatus(u.update?.status);
      if (!nextStatus) continue;
      const sid = stableId(key.remoteJid, key.id, true);
      const stor = new Set<string>([this.storageKeyFor(key.remoteJid)]);
      if (key.remoteJidAlt) stor.add(this.storageKeyFor(key.remoteJidAlt));
      for (const s of stor) {
        if (this.updateMessageStatus(s, sid, nextStatus)) touched.add(s);
      }
    }
    for (const chatId of touched) this.emitMsgs(chatId);
  }

  /** JID canônico usado como chave lógica do chat (mesmo que `listChats()[i].id`). */
  canonicalChatId(jid: string): string {
    return this.storageKeyFor(jid);
  }

  /**
   * Segmento de pasta no object storage (R2): no mesmo contacto, prefere o JID de telefone
   * (`@s.whatsapp.net`) quando existir ligação com `@lid`, para não espalhar ficheiros só por LID.
   */
  /**
   * Pasta no R2 sob `whatsapp/audio/`: se LID e telefone estiverem ligados no mesmo contacto,
   * usa os dois no nome (`numero@s.whatsapp.net__lid@lid`); senão só o que existir.
   */
  mediaStorageFolderId(jid: string): string {
    const nodes = this.component(jid);
    const dm = [...nodes].filter(
      (n) => !n.endsWith('@g.us') && !n.endsWith('@newsletter'),
    );
    const phones = dm.filter((n) => n.endsWith('@s.whatsapp.net')).sort();
    const lids = dm.filter((n) => n.endsWith('@lid')).sort();
    const phone = phones[0];
    const lid = lids[0];
    if (phone && lid) return `${phone}__${lid}`;
    if (phone) return phone;
    if (lid) return lid;
    return this.pick(nodes);
  }

  /** JIDs de DM no mesmo contacto (LID ↔ telefone ligados) — útil para consultas Mongo com `$in`. */
  linkedDirectChatIds(jid: string): string[] {
    const nodes = this.component(jid);
    const dm = [...nodes].filter(
      (n) => !n.endsWith('@g.us') && !n.endsWith('@newsletter'),
    );
    const out = dm.filter(
      (n) => n.endsWith('@s.whatsapp.net') || n.endsWith('@lid'),
    );
    if (out.length > 0) return [...new Set(out)];
    const root = this.storageKeyFor(jid);
    return [root];
  }

  /** Gera o mesmo `stableId` usado para identificar uma mensagem internamente. */
  stableMessageId(jid: string, keyId: string | null | undefined, fromMe: boolean): string {
    return stableId(jid, keyId, fromMe);
  }

  /** Marca o `attachment.ready = true` de uma mensagem (ex: após upload do áudio no R2). */
  markAttachmentReady(chatId: string, messageStableId: string): boolean {
    const root = this.storageKeyFor(chatId);
    let changed = false;
    for (const id of this.component(root)) {
      const list = this.messagesByChat.get(id);
      if (!list?.length) continue;
      for (const m of list) {
        if (m.id === messageStableId && m.attachment && !m.attachment.ready) {
          m.attachment = { ...m.attachment, ready: true };
          changed = true;
        }
      }
    }
    if (changed) this.emitMsgs(root);
    return changed;
  }

  /** Atualiza o texto de uma mensagem já presente (ex.: após transcrever áudio). */
  replaceMessageText(chatId: string, messageStableId: string, newText: string): boolean {
    const root = this.storageKeyFor(chatId);
    let changed = false;
    let msgAt: string | null = null;
    let msgFromMe = false;
    for (const id of this.component(root)) {
      const list = this.messagesByChat.get(id);
      if (!list?.length) continue;
      for (const m of list) {
        if (m.id === messageStableId && m.text !== newText) {
          m.text = newText;
          changed = true;
          msgAt = m.at;
          msgFromMe = m.fromMe;
        }
      }
    }
    if (!changed) return false;

    const merged = this.listMessages(root);
    const last = merged[merged.length - 1];
    if (last?.id === messageStableId && msgAt) {
      const author = msgFromMe
        ? null
        : this.chats.get(root)?.lastMessageAuthor ?? this.peerLabel(root);
      this.upsert(root, newText, msgAt, null, msgFromMe, author);
      this.emitChats();
    }
    this.emitMsgs(root);
    return true;
  }

  recordOutboundTextMessage(p: {
    remoteJid: string;
    remoteJidAlt?: string | null;
    text: string;
    keyId: string | null | undefined;
    ts: string;
  }) {
    const { remoteJid: jid, remoteJidAlt: alt, text, keyId, ts } = p;
    if (alt && !jid.endsWith('@g.us') && !jid.endsWith('@newsletter')) {
      this.link(jid, alt);
    }
    if (keyId != null && String(keyId).length > 0) {
      const sid = stableId(jid, keyId, true);
      const stor = new Set<string>([this.storageKeyFor(jid)]);
      if (alt && !jid.endsWith('@g.us') && !jid.endsWith('@newsletter')) {
        stor.add(this.storageKeyFor(alt));
      }
      for (const s of stor) {
        this.pushMsg(s, { id: sid, at: ts, text, fromMe: true, status: 'sent' });
      }
    }
    for (const s of new Set([
      this.storageKeyFor(jid),
      ...(alt && !jid.endsWith('@g.us') && !jid.endsWith('@newsletter')
        ? [this.storageKeyFor(alt)]
        : []),
    ])) {
      this.upsert(s, text, ts, null, true, null);
    }
    this.emitChats();
  }

  /** Nome amigável do interlocutor (push/notify ainda não virou título do chat). */
  private peerLabel(jid: string): string | null {
    const c =
      this.contactNames.get(jid)?.trim() ||
      this.contactNames.get(this.storageKeyFor(jid))?.trim();
    if (c) return c;
    if (jid.endsWith('@s.whatsapp.net')) {
      const d = jid.replace(/@s\.whatsapp\.net$/u, '');
      return d ? `+${d}` : null;
    }
    if (jid.endsWith('@lid')) return `Contato • ${jid.split('@')[0]}`;
    return null;
  }

  private displayName(jid: string, chatName: string | null): string {
    const cn = chatName?.trim();
    if (cn) return cn;
    const c = this.contactNames.get(jid)?.trim();
    if (c) return c;
    for (const a of this.component(jid)) {
      if (a === jid) continue;
      const n = this.contactNames.get(a)?.trim();
      if (n) return n;
      if (a.endsWith('@s.whatsapp.net')) {
        const d = a.replace(/@s\.whatsapp\.net$/u, '');
        if (d) return `+${d}`;
      }
    }
    if (jid.endsWith('@s.whatsapp.net')) {
      const n = jid.replace(/@s\.whatsapp\.net$/u, '');
      return n ? `+${n}` : jid;
    }
    if (jid.endsWith('@g.us')) return `Grupo • ${jid.split('@')[0]}`;
    if (jid.endsWith('@lid')) return `Contato • ${jid.split('@')[0]}`;
    if (jid.endsWith('@newsletter')) return `Canal • ${jid.split('@')[0]}`;
    return jid;
  }

  private edge(a: string, b: string) {
    if (!this.jidAdjacency.has(a)) this.jidAdjacency.set(a, new Set());
    if (!this.jidAdjacency.has(b)) this.jidAdjacency.set(b, new Set());
    this.jidAdjacency.get(a)!.add(b);
    this.jidAdjacency.get(b)!.add(a);
  }

  private component(start: string): Set<string> {
    const seen = new Set<string>();
    const st = [start];
    while (st.length) {
      const x = st.pop()!;
      if (seen.has(x)) continue;
      seen.add(x);
      for (const n of this.jidAdjacency.get(x) ?? []) st.push(n);
    }
    return seen;
  }

  private pick(nodes: Set<string>): string {
    const list = [...nodes];
    const dm = list.filter((j) => !j.endsWith('@g.us') && !j.endsWith('@newsletter'));
    return (
      dm.find((j) => j.endsWith('@lid')) ??
      dm.find((j) => j.endsWith('@s.whatsapp.net')) ??
      list.find((j) => j.endsWith('@g.us')) ??
      list.find((j) => j.endsWith('@newsletter')) ??
      list.sort()[0] ??
      [...nodes][0]
    );
  }

  private storageKeyFor(jid: string): string {
    return this.pick(this.component(jid));
  }

  private link(a: string, b: string): boolean {
    if (a === b) return false;
    const ca = this.component(a);
    const cb = this.component(b);
    const linked = [...ca].some((x) => cb.has(x));
    this.edge(a, b);
    if (!linked) {
      const m = this.component(a);
      this.mergeMsgs(m);
      this.mergeChats(m);
      for (const id of m) this.emitMsgs(id);
      return true;
    }
    return false;
  }

  private mergeMsgs(comp: Set<string>) {
    const target = this.pick(comp);
    const seen = new Set<string>();
    const merged: BotChatMessage[] = [];
    for (const id of comp) {
      for (const m of this.messagesByChat.get(id) ?? []) {
        if (seen.has(m.id)) continue;
        seen.add(m.id);
        merged.push(m);
      }
      this.messagesByChat.delete(id);
      this.messageIdsByChat.delete(id);
    }
    merged.sort((a, b) => a.at.localeCompare(b.at));
    const cut = merged.length > MAX ? merged.slice(merged.length - MAX) : merged;
    this.messagesByChat.set(target, cut);
    this.messageIdsByChat.set(target, new Set(cut.map((m) => m.id)));
  }

  private mergeRows(entries: Row[]): Row {
    const nodes = new Set<string>();
    for (const e of entries) for (const x of this.component(e.id)) nodes.add(x);
    const root = this.pick(nodes);
    if (entries.length === 1) {
      const e = entries[0];
      return {
        ...e,
        id: root,
        lastMessageAuthor: e.lastMessageAuthor ?? null,
      };
    }
    let name: string | null = null;
    let lastMessage: string | null = null;
    let lastMessageAt: string | null = null;
    let lastMessageFromMe: boolean | null = null;
    let lastMessageAuthor: string | null = null;
    let best = -1;
    for (const e of entries) {
      const cand = e.name?.trim();
      if (cand && (!name || cand.length > name.length)) name = cand;
      const ts = e.lastMessageAt ? Date.parse(e.lastMessageAt) : 0;
      if (e.lastMessage != null && ts >= best) {
        best = ts;
        lastMessage = e.lastMessage;
        lastMessageAt = e.lastMessageAt;
        lastMessageFromMe = e.lastMessageFromMe ?? null;
        lastMessageAuthor = e.lastMessageAuthor ?? null;
      }
    }
    return {
      id: root,
      name,
      lastMessage,
      lastMessageAt,
      lastMessageFromMe,
      lastMessageAuthor,
    };
  }

  private mergeChats(comp: Set<string>) {
    let unreadSum = 0;
    for (const id of comp) {
      unreadSum += this.unreadByRoot.get(id) ?? 0;
      this.unreadByRoot.delete(id);
    }
    const rows: Row[] = [];
    for (const id of comp) {
      const e = this.chats.get(id);
      if (e) rows.push(e);
    }
    if (!rows.length) return;
    const m = this.mergeRows(rows);
    for (const id of comp) this.chats.delete(id);
    this.chats.set(m.id, m);
    this.unreadByRoot.set(m.id, Math.min(unreadSum, 999));
  }

  private pushMsg(jid: string, msg: BotChatMessage): boolean {
    let ids = this.messageIdsByChat.get(jid);
    if (!ids) {
      ids = new Set();
      this.messageIdsByChat.set(jid, ids);
    }
    if (ids.has(msg.id)) return false;
    ids.add(msg.id);
    const list = this.messagesByChat.get(jid) ?? [];
    list.push({
      ...msg,
      status: msg.fromMe ? (msg.status ?? 'sent') : undefined,
    });
    if (list.length > MAX) {
      for (const r of list.splice(0, list.length - MAX)) ids.delete(r.id);
    }
    this.messagesByChat.set(jid, list);
    for (const a of this.component(jid)) this.emitMsgs(a);
    return true;
  }

  private updateMessageStatus(
    chatId: string,
    messageStableId: string,
    nextStatus: BotMessageStatus,
  ): boolean {
    const list = this.messagesByChat.get(chatId);
    if (!list?.length) return false;
    let changed = false;
    for (const m of list) {
      if (m.id !== messageStableId || !m.fromMe) continue;
      if (m.status === 'read') continue;
      if (m.status === nextStatus) continue;
      if (m.status === 'delivered' && nextStatus === 'sent') continue;
      m.status = nextStatus;
      changed = true;
    }
    return changed;
  }

  private emitMsgs(chatId: string) {
    const payload = { chatId, messages: this.listMessages(chatId) };
    for (const fn of this.msgListeners) {
      try {
        fn(payload);
      } catch {
        /* */
      }
    }
    this.scheduleSnapshot();
  }

  private upsert(
    jid: string,
    lastMessage: string | null,
    lastMessageAt: string | null,
    name: string | null = null,
    lastMessageFromMe?: boolean,
    lastMessageAuthor: string | null | undefined = undefined,
  ) {
    const cur = this.chats.get(jid);
    const mergedName =
      name?.trim() || cur?.name?.trim() || this.contactNames.get(jid)?.trim() || null;
    const nextLast = lastMessage ?? cur?.lastMessage ?? null;
    const nextAt = lastMessageAt ?? cur?.lastMessageAt ?? null;
    let nextFm = cur?.lastMessageFromMe ?? null;
    let nextAuthor = cur?.lastMessageAuthor ?? null;
    if (lastMessage != null && lastMessageAt != null && lastMessageFromMe !== undefined) {
      nextFm = lastMessageFromMe;
      nextAuthor = lastMessageFromMe
        ? null
        : (lastMessageAuthor?.trim() || this.peerLabel(jid) || null);
    }
    this.chats.set(jid, {
      id: jid,
      name: mergedName,
      lastMessage: nextLast,
      lastMessageAt: nextAt,
      lastMessageFromMe: nextFm,
      lastMessageAuthor: nextAuthor,
    });
  }

  private emitChats() {
    const snap = this.listChats();
    for (const fn of this.chatsListeners) {
      try {
        fn(snap);
      } catch {
        /* */
      }
    }
    this.scheduleSnapshot();
  }
}
