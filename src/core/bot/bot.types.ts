export type BotMessageStatus = 'sent' | 'delivered' | 'read';

export type BotAudioAttachment = {
  kind: 'audio';
  mimeType: string;
  ptt?: boolean;
  durationSec?: number;
  /** `false` enquanto o áudio ainda está sendo baixado do WhatsApp e subindo pro R2. */
  ready: boolean;
};

export type BotAttachment = BotAudioAttachment;

export type BotChatMessage = {
  id: string;
  at: string;
  text: string;
  fromMe: boolean;
  status?: BotMessageStatus;
  attachment?: BotAttachment;
};

export type BotChatSummary = {
  id: string;
  name: string | null;
  displayName: string;
  lastMessage: string | null;
  lastMessageAt: string | null;
  lastMessageFromMe: boolean | null;
  /** Quem enviou a última mensagem (só preenchido se não for você); pushName / contacto / telefone. */
  lastMessageAuthor: string | null;
  /** Mensagens recebidas do cliente ainda não “vistas” no painel (zerado ao abrir o chat). */
  unreadCount: number;
};

export type BotConnectionSnapshot = {
  state: 'conectando' | 'conectado' | 'desconectado';
  connected: boolean;
  qr: string | null;
  updatedAt: string;
  lastError: string | null;
};

export type BotTypingPayload = {
  chatId: string;
  typing: boolean;
  /** `composing` = a digitar texto; `recording` = a gravar nota de voz */
  kind: 'composing' | 'recording' | null;
};
