import { Module } from '@nestjs/common';
import { BotModule } from '../../core/bot/bot.module';
import { ChatsService } from './chats.service';
import { ChatsController } from './chats.controller';
import { ChatsGateway } from './chats.gateway';

@Module({
  imports: [BotModule],
  providers: [ChatsService, ChatsGateway],
  controllers: [ChatsController],
})
export class ChatsModule {}
