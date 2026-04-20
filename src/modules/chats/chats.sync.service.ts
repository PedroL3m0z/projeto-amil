import {
  forwardRef,
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BotService } from '../../core/bot/bot.service';
import type {
  BotChatMessage,
  BotChatSummary,
} from '../../core/bot/bot.types';
import { ChatsGateway } from './chats.gateway';
import { Chat, ChatDocument } from './schemas/chat.schema';
import { Message, MessageDocument } from './schemas/message.schema';

@Injectable()
export class ChatsSyncService
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly log = new Logger(ChatsSyncService.name);
  private unsubscribeChats: (() => void) | null = null;
  private unsubscribeMessages: (() => void) | null = null;
  private unsubscribeConnection: (() => void) | null = null;
  private syncing = false;

  constructor(
    private readonly botService: BotService,
    @InjectModel(Chat.name) private readonly chatModel: Model<ChatDocument>,
    @InjectModel(Message.name)
    private readonly messageModel: Model<MessageDocument>,
    @Inject(forwardRef(() => ChatsGateway))
    private readonly chatsGateway: ChatsGateway,
  ) {}

  async onApplicationBootstrap() {
    this.unsubscribeChats = this.botService.onChatsChanged((chats) => {
      void this.persistChats(chats).catch((err) =>
        this.log.error(
          `Falha ao persistir chats: ${err instanceof Error ? err.message : String(err)}`,
        ),
      );
    });

    this.unsubscribeMessages = this.botService.onChatMessagesChanged(
      ({ chatId, messages }) => {
        void this.persistMessages(chatId, messages)
          .then(() => this.chatsGateway.broadcastChatMessages(chatId))
          .catch((err) =>
            this.log.error(
              `Falha ao persistir mensagens do chat ${chatId}: ${err instanceof Error ? err.message : String(err)}`,
            ),
          );
      },
    );

    this.unsubscribeConnection = this.botService.onConnectionChanged(
      (snapshot) => {
        if (snapshot.state === 'conectado') {
          void this.fullSync('WhatsApp conectado').catch((err) =>
            this.log.error(
              `Falha no full sync após reconexão: ${err instanceof Error ? err.message : String(err)}`,
            ),
          );
        }
      },
    );

    await this.fullSync('bootstrap');
  }

  onModuleDestroy() {
    this.unsubscribeChats?.();
    this.unsubscribeMessages?.();
    this.unsubscribeConnection?.();
  }

  private async fullSync(reason: string) {
    if (this.syncing) return;
    this.syncing = true;
    try {
      const chats = this.botService.listChats();
      if (chats.length === 0) {
        this.log.log(`Full sync (${reason}): bot ainda sem chats em memória.`);
        return;
      }
      await this.persistChats(chats);
      let messagesTotal = 0;
      for (const chat of chats) {
        const messages = this.botService.listMessages(chat.id);
        if (messages.length === 0) continue;
        await this.persistMessages(chat.id, messages);
        messagesTotal += messages.length;
      }
      this.log.log(
        `Full sync (${reason}): ${chats.length} chats, ${messagesTotal} mensagens persistidas no Mongo.`,
      );
    } finally {
      this.syncing = false;
    }
  }

  private async persistChats(chats: BotChatSummary[]) {
    if (chats.length === 0) return;
    const ops = chats.map((c) => ({
      updateOne: {
        filter: { chatId: c.id },
        update: {
          $set: {
            chatId: c.id,
            name: c.name,
            displayName: c.displayName,
            lastMessage: c.lastMessage,
            lastMessageAt: c.lastMessageAt,
            lastMessageFromMe: c.lastMessageFromMe,
            lastMessageAuthor: c.lastMessageAuthor,
            unreadCount: c.unreadCount,
          },
        },
        upsert: true,
      },
    }));
    await this.chatModel.bulkWrite(ops, { ordered: false });
  }

  private async persistMessages(chatId: string, messages: BotChatMessage[]) {
    if (messages.length === 0) return;
    const ops = messages.map((m) => {
      const set: Record<string, unknown> = {
        chatId,
        messageId: m.id,
        at: m.at,
        text: m.text,
        fromMe: m.fromMe,
        status: m.status,
      };
      // Atualiza metadados do attachment sem tocar em `storageKey` (controlado pelo upload).
      if (m.attachment) {
        set['attachment.kind'] = m.attachment.kind;
        set['attachment.mimeType'] = m.attachment.mimeType;
        if (m.attachment.kind === 'audio') {
          set['attachment.ptt'] = m.attachment.ptt;
          set['attachment.durationSec'] = m.attachment.durationSec;
        }
      }
      return {
        updateOne: {
          filter: { chatId, messageId: m.id },
          update: { $set: set },
          upsert: true,
        },
      };
    });
    await this.messageModel.bulkWrite(ops, { ordered: false });
  }
}
