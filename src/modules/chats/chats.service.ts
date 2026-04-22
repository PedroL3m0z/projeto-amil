import { Injectable } from '@nestjs/common';
import {
  BotConnectionSnapshot,
  BotService,
} from '../../core/bot/bot.service';
import type {
  BotChatMessage,
  BotChatSummary,
  BotMessageStatus,
  BotTypingPayload,
} from '../../core/bot/bot.types';
import { R2Service } from '../../core/r2/r2.service';
import { AUDIO_SIGNED_URL_TTL_SECONDS } from './audio/chat-audio.constants';
import { ChatRepository } from './repositories/chat.repository';
import { MessageRepository } from './repositories/message.repository';

export type ChatAudioAttachmentResponse = {
  kind: 'audio';
  mimeType: string;
  ptt?: boolean;
  durationSec?: number;
  ready: boolean;
  audioUrl: string | null;
};

export type ChatMessageResponse = Omit<BotChatMessage, 'attachment'> & {
  attachment?: ChatAudioAttachmentResponse;
};

/**
 * Fachada de leitura/escrita para os consumidores externos (controller e
 * gateway). Não contém regras de negócio específicas de áudio (veja
 * `ChatAudioService`) nem de IA (veja `ChatSuggestionService`).
 *
 * Proxy fino para eventos/ações do bot e mapeamento de mensagens do Mongo
 * para o DTO consumido pelo front.
 */
@Injectable()
export class ChatsService {
  constructor(
    private readonly botService: BotService,
    private readonly r2: R2Service,
    private readonly chatRepo: ChatRepository,
    private readonly messageRepo: MessageRepository,
  ) {}

  async listAll(): Promise<BotChatSummary[]> {
    const docs = await this.chatRepo.findAll();
    return docs.map((d) => ({
      id: d.chatId,
      name: d.name ?? null,
      displayName: d.displayName,
      lastMessage: d.lastMessage ?? null,
      lastMessageAt: d.lastMessageAt ?? null,
      lastMessageFromMe: d.lastMessageFromMe ?? null,
      lastMessageAuthor: d.lastMessageAuthor ?? null,
      unreadCount: d.unreadCount ?? 0,
    }));
  }

  async listMessages(chatId: string): Promise<ChatMessageResponse[]> {
    const docs = await this.messageRepo.findByChat(chatId);
    const results: ChatMessageResponse[] = [];
    for (const d of docs) {
      const base: ChatMessageResponse = {
        id: d.messageId,
        at: d.at,
        text: d.text ?? '',
        fromMe: d.fromMe,
        status: d.status as BotMessageStatus | undefined,
      };
      if (d.attachment && d.attachment.kind === 'audio') {
        base.attachment = await this.buildAudioAttachment(d.attachment);
      }
      results.push(base);
    }
    return results;
  }

  private async buildAudioAttachment(att: {
    mimeType: string;
    ptt?: boolean;
    durationSec?: number;
    storageKey?: string;
  }): Promise<ChatAudioAttachmentResponse> {
    const ready = Boolean(att.storageKey);
    let audioUrl: string | null = null;
    if (att.storageKey && this.r2.isEnabled()) {
      try {
        audioUrl = await this.r2.getSignedDownloadUrl(
          att.storageKey,
          AUDIO_SIGNED_URL_TTL_SECONDS,
        );
      } catch {
        audioUrl = null;
      }
    }
    return {
      kind: 'audio',
      mimeType: att.mimeType,
      ptt: att.ptt,
      durationSec: att.durationSec,
      ready,
      audioUrl,
    };
  }

  getProfilePictureUrl(chatId: string) {
    return this.botService.getProfilePictureUrl(chatId);
  }

  markChatRead(chatId: string) {
    this.botService.markChatRead(chatId);
    return { ok: true };
  }

  getConnectionSnapshot(): BotConnectionSnapshot {
    return this.botService.getConnectionSnapshot();
  }

  async sendToChat(chatId: string, text: string) {
    await this.botService.sendTextMessage(chatId, text);
    return { ok: true };
  }

  onChatsChanged(listener: Parameters<BotService['onChatsChanged']>[0]) {
    return this.botService.onChatsChanged(listener);
  }

  onConnectionChanged(listener: Parameters<BotService['onConnectionChanged']>[0]) {
    return this.botService.onConnectionChanged(listener);
  }

  onChatMessagesChanged(
    listener: Parameters<BotService['onChatMessagesChanged']>[0],
  ) {
    return this.botService.onChatMessagesChanged(listener);
  }

  onTypingUpdate(listener: (p: BotTypingPayload) => void) {
    return this.botService.onTypingUpdate(listener);
  }

  schedulePresenceSubscribe(chats?: BotChatSummary[]) {
    this.botService.schedulePresenceSubscribe(chats);
  }
}
