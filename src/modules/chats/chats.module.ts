import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BotModule } from '../../core/bot/bot.module';
import { SettingsModule } from '../../core/settings/settings.module';
import { AiModule } from '../ai/ai.module';
import { CatalogModule } from '../catalog/catalog.module';
import { AudioStorageLimiterService } from './audio/audio-storage-limiter.service';
import { ChatAudioService } from './audio/chat-audio.service';
import { WhatsappAudioService } from './audio/whatsapp-audio.service';
import { ChatsController } from './chats.controller';
import { ChatsService } from './chats.service';
import { ChatRepository } from './repositories/chat.repository';
import { MessageRepository } from './repositories/message.repository';
import { ChatsGateway } from './ws/chats.gateway';
import { Chat, ChatSchema } from './schemas/chat.schema';
import { Message, MessageSchema } from './schemas/message.schema';
import { ChatSuggestionService } from './suggestion/chat-suggestion.service';
import { ChatsSyncService } from './sync/chats-sync.service';

/**
 * ChatsModule agrupa tudo o que gira em torno do domínio de chats:
 *
 *  - `ChatsService`, `ChatsController`, `repositories/`: leitura/escrita
 *    e fachada HTTP (um repository por aggregate: `Chat` e `Message`).
 *  - `audio/`      : ingestão WhatsApp, transcrição on-demand e quota R2.
 *  - `suggestion/` : caso de uso Gemini + catálogo de planos.
 *  - `sync/`       : replicação do estado do bot para o Mongo.
 *  - `ws/`         : gateway Socket.IO (websocket) do namespace `/chats`.
 */
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
    ChatRepository,
    MessageRepository,
    ChatsService,
    ChatsGateway,
    ChatSuggestionService,
    ChatsSyncService,
    ChatAudioService,
    WhatsappAudioService,
    AudioStorageLimiterService,
  ],
  controllers: [ChatsController],
})
export class ChatsModule {}
