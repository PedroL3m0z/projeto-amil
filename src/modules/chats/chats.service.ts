import { Injectable } from '@nestjs/common';
import {
  BotConnectionSnapshot,
  BotService,
} from '../../core/bot/bot.service';

@Injectable()
export class ChatsService {
  constructor(private readonly botService: BotService) {}

  listAll() {
    return this.botService.listChats();
  }

  listMessages(chatId: string) {
    return this.botService.listMessages(chatId);
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
}
