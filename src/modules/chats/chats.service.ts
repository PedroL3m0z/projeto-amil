import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
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
import { Chat, ChatDocument } from './schemas/chat.schema';
import { Message, MessageDocument } from './schemas/message.schema';

const AUDIO_URL_TTL_SECONDS = 60 * 60;

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

@Injectable()
export class ChatsService {
  constructor(
    private readonly botService: BotService,
    private readonly r2: R2Service,
    @InjectModel(Chat.name) private readonly chatModel: Model<ChatDocument>,
    @InjectModel(Message.name)
    private readonly messageModel: Model<MessageDocument>,
  ) {}

  async listAll(): Promise<BotChatSummary[]> {
    const docs = await this.chatModel
      .find({}, { _id: 0 })
      .sort({ lastMessageAt: -1 })
      .lean()
      .exec();

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
    const docs = await this.messageModel
      .find({ chatId }, { _id: 0 })
      .sort({ at: 1 })
      .lean()
      .exec();

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
        const ready = Boolean(d.attachment.storageKey);
        let audioUrl: string | null = null;
        if (d.attachment.storageKey && this.r2.isEnabled()) {
          try {
            audioUrl = await this.r2.getSignedDownloadUrl(
              d.attachment.storageKey,
              AUDIO_URL_TTL_SECONDS,
            );
          } catch {
            audioUrl = null;
          }
        }
        base.attachment = {
          kind: 'audio',
          mimeType: d.attachment.mimeType,
          ptt: d.attachment.ptt,
          durationSec: d.attachment.durationSec,
          ready,
          audioUrl,
        };
      }

      results.push(base);
    }
    return results;
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
