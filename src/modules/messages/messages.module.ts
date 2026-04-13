import { Module } from '@nestjs/common';
import { BotModule } from '../../core/bot/bot.module';
import { MessagesService } from './messages.service';
import { MessagesController } from './messages.controller';

@Module({
  imports: [BotModule],
  providers: [MessagesService],
  controllers: [MessagesController],
})
export class MessagesModule {}
