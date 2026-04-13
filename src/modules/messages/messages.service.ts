import { Injectable } from '@nestjs/common';
import { BotService } from '../../core/bot/bot.service';

@Injectable()
export class MessagesService {
  constructor(private readonly botService: BotService) {}

  async send(payload: { to: string; text: string }) {
    await this.botService.sendTextMessage(payload.to, payload.text);
    return { ok: true };
  }
}
