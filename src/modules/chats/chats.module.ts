import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BotModule } from '../../core/bot/bot.module';
import { SettingsModule } from '../../core/settings/settings.module';
import { AiModule } from '../ai/ai.module';
import { CatalogModule } from '../catalog/catalog.module';
import { AudioStorageLimiterService } from './audio-storage-limiter.service';
import { ChatSuggestionService } from './chat-suggestion.service';
import { ChatsService } from './chats.service';
import { ChatsController } from './chats.controller';
import { ChatsGateway } from './chats.gateway';
import { ChatsSyncService } from './chats.sync.service';
import { WhatsappAudioService } from './whatsapp-audio.service';
import { Chat, ChatSchema } from './schemas/chat.schema';
import { Message, MessageSchema } from './schemas/message.schema';

@Module({
  imports: [
    BotModule,
    CatalogModule,
    SettingsModule,
    AiModule,
    MongooseModule.forFeature([
      { name: Chat.name, schema: ChatSchema },
      { name: Message.name, schema: MessageSchema },
    ]),
  ],
  providers: [
    ChatsService,
    ChatsGateway,
    ChatSuggestionService,
    ChatsSyncService,
    WhatsappAudioService,
    AudioStorageLimiterService,
  ],
  controllers: [ChatsController],
})
export class ChatsModule {}
