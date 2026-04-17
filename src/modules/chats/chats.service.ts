import { Injectable } from '@nestjs/common';
import {
  BotConnectionSnapshot,
  BotService,
} from '../../core/bot/bot.service';
import type { BotChatSummary, BotTypingPayload } from '../../core/bot/bot.types';

@Injectable()
export class ChatsService {
  constructor(private readonly botService: BotService) {}

  listAll() {
    return this.botService.listChats();
  }

  listMessages(chatId: string) {
    return this.botService.listMessages(chatId);
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
