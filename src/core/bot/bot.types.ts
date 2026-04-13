export type BotChatMessage = {
  id: string;
  at: string;
  text: string;
  fromMe: boolean;
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
};

export type BotConnectionSnapshot = {
  state: 'conectando' | 'conectado' | 'desconectado';
  connected: boolean;
  qr: string | null;
  updatedAt: string;
  lastError: string | null;
};
