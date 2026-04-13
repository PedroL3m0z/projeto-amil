import { Module } from '@nestjs/common';
import { settingsRedisProvider } from './settings-redis.provider';
import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';

@Module({
  controllers: [SettingsController],
  providers: [settingsRedisProvider, SettingsService],
  exports: [SettingsService],
})
export class SettingsModule {}
