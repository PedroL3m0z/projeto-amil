import { Injectable, Logger } from '@nestjs/common';
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
import { AiService } from '../ai/ai.service';
import { CHAT_AUDIO_PLACEHOLDER } from './chat-audio.constants';
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
  private readonly log = new Logger(ChatsService.name);

  constructor(
    private readonly botService: BotService,
    private readonly r2: R2Service,
    private readonly aiService: AiService,
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

  /**
   * Garante que mensagens ainda com placeholder `[Áudio]` e ficheiro no R2
   * fiquem com `[Áudio Transcrito] …` no Mongo e no estado do bot (ex.: antes de sugerir resposta).
   */
  async transcribePendingAudiosForChat(chatId: string): Promise<void> {
    if (!this.r2.isEnabled()) {
      this.log.debug('R2 desligado; não é possível transcrever áudios pendentes a partir do storage.');
      return;
    }

    const canonical = this.botService.canonicalChatId(chatId);
    const chatIds = [...new Set([canonical, ...this.botService.linkedDirectChatIds(chatId)])];

    const candidates = await this.messageModel
      .find({
        chatId: { $in: chatIds },
        fromMe: false,
        $or: [
          { text: CHAT_AUDIO_PLACEHOLDER },
          { text: { $regex: /^\s*\[Áudio\]\s*$/ } },
        ],
        'attachment.storageKey': { $exists: true, $nin: [null, ''] },
      })
      .lean()
      .exec();

    if (candidates.length === 0) {
      this.log.debug(
        `Nenhuma mensagem [Áudio] pendente com storageKey para chatIds=${chatIds.join(', ')}`,
      );
      return;
    }

    for (const doc of candidates) {
      const key = doc.attachment?.storageKey;
      const mime = doc.attachment?.mimeType?.trim() || 'audio/ogg';
      if (!key) continue;

      const buf = await this.r2.getObjectBuffer(key);
      if (!buf?.length) {
        this.log.warn(`R2: objeto vazio ou inexistente para key=${key}`);
        continue;
      }

      const text = await this.aiService.transcribeAudio(buf, mime);
      if (!text) {
        this.log.warn(`Transcrição devolveu vazio para messageId=${doc.messageId} key=${key}`);
        continue;
      }

      const newText = `[Áudio Transcrito] ${text}`;
      await this.messageModel
        .updateOne({ chatId: doc.chatId, messageId: doc.messageId }, { $set: { text: newText } })
        .exec();
      this.botService.updateChatMessageText(canonical, doc.messageId, newText);
    }
  }
}
