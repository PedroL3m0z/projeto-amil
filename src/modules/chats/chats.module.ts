import { Module } from '@nestjs/common';
import { BotModule } from '../../core/bot/bot.module';
import { SettingsModule } from '../../core/settings/settings.module';
import { AiModule } from '../ai/ai.module';
import { CatalogModule } from '../catalog/catalog.module';
import { ChatSuggestionService } from './chat-suggestion.service';
import { ChatsService } from './chats.service';
import { ChatsController } from './chats.controller';
import { ChatsGateway } from './chats.gateway';

@Module({
  imports: [BotModule, CatalogModule, SettingsModule, AiModule],
  providers: [ChatsService, ChatsGateway, ChatSuggestionService],
  controllers: [ChatsController],
})
export class ChatsModule {}
