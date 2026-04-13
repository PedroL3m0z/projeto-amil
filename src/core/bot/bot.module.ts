import { Module } from '@nestjs/common';
import { BotAuthStore, botRedisProvider } from './bot-auth.store';
import { BotChatState } from './bot-chat.state';
import { BotController } from './bot.controller';
import { BotService } from './bot.service';

@Module({
  controllers: [BotController],
  providers: [botRedisProvider, BotAuthStore, BotChatState, BotService],
  exports: [BotService],
})
export class BotModule {}
