import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import { Redis } from 'ioredis';
import {
  REDIS_KEY_AUTH_PASSWORD_HASH,
  REDIS_KEY_AI_CONTEXT,
  REDIS_KEY_GEMINI_API_KEY,
  SETTINGS_REDIS,
} from './settings.constants';
import { hashPassword, verifyPassword } from './password-crypto';

export type AiContext = {
  instructions: string;
};

const DEFAULT_AI_CONTEXT: AiContext = {
  instructions: '',
};

@Injectable()
export class SettingsService implements OnModuleDestroy {
  constructor(@Inject(SETTINGS_REDIS) private readonly redis: Redis) {}

  async onModuleDestroy() {
    await this.redis.quit().catch(() => undefined);
  }

  async getPasswordHash(): Promise<string | null> {
    const v = await this.redis.get(REDIS_KEY_AUTH_PASSWORD_HASH);
    return v && v.length > 0 ? v : null;
  }

  async setPasswordFromPlain(plain: string): Promise<void> {
    const h = hashPassword(plain);
    await this.redis.set(REDIS_KEY_AUTH_PASSWORD_HASH, h);
  }

  async verifyStoredPassword(plain: string): Promise<boolean> {
    const stored = await this.getPasswordHash();
    if (!stored) {
      return false;
    }
    return verifyPassword(plain, stored);
  }

  async getGeminiApiKeyFromStore(): Promise<string | null> {
    const v = await this.redis.get(REDIS_KEY_GEMINI_API_KEY);
    return v && v.length > 0 ? v : null;
  }

  /** Chave efetiva: Redis sobrescreve variável de ambiente. */
  async getEffectiveGeminiApiKey(): Promise<string | null> {
    const fromRedis = await this.getGeminiApiKeyFromStore();
    if (fromRedis) {
      return fromRedis;
    }
    const fromEnv = process.env.GEMINI_API_KEY?.trim();
    return fromEnv && fromEnv.length > 0 ? fromEnv : null;
  }

  async setGeminiApiKey(apiKey: string): Promise<void> {
    const t = apiKey.trim();
    if (t.length === 0) {
      await this.redis.del(REDIS_KEY_GEMINI_API_KEY);
      return;
    }
    await this.redis.set(REDIS_KEY_GEMINI_API_KEY, t);
  }

  async isGeminiConfigured(): Promise<boolean> {
    const key = await this.getEffectiveGeminiApiKey();
    return key !== null;
  }

  async getAiContext(): Promise<AiContext> {
    const raw = await this.redis.get(REDIS_KEY_AI_CONTEXT);
    if (!raw) return { ...DEFAULT_AI_CONTEXT };
    try {
      const parsed = JSON.parse(raw) as Partial<AiContext>;
      return {
        instructions:
          typeof parsed.instructions === 'string' ? parsed.instructions : '',
      };
    } catch {
      return { ...DEFAULT_AI_CONTEXT };
    }
  }

  async setAiContext(next: AiContext): Promise<void> {
    await this.redis.set(
      REDIS_KEY_AI_CONTEXT,
      JSON.stringify({
        instructions: next.instructions,
      }),
    );
  }
}
