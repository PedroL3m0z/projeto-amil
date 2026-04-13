import { Logger } from '@nestjs/common';
import { Redis } from 'ioredis';
import { SETTINGS_REDIS } from './settings.constants';

const log = new Logger('SettingsRedis');

export const settingsRedisProvider = {
  provide: SETTINGS_REDIS,
  useFactory: (): Redis => {
    const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
      maxRetriesPerRequest: null,
      enableReadyCheck: true,
    });
    redis.on('error', (e: Error) => log.error(e.message));
    return redis;
  },
};
