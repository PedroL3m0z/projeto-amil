import { Module } from '@nestjs/common';
import { BotModule } from '../../core/bot/bot.module';
import { SettingsModule } from '../../core/settings/settings.module';
import { AiService } from './ai.service';

@Module({
  imports: [SettingsModule, BotModule],
  providers: [AiService],
  exports: [AiService],
})
export class AiModule {}
