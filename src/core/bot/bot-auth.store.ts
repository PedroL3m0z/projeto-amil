import { Mutex } from 'async-mutex';
import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Redis } from 'ioredis';
import {
  BufferJSON,
  initAuthCreds,
  proto,
  type AuthenticationCreds,
  type AuthenticationState,
  type SignalDataSet,
  type SignalDataTypeMap,
} from 'baileys';

export const BOT_AUTH_REDIS = Symbol('BOT_AUTH_REDIS');

const log = new Logger('BotRedis');

export const botRedisProvider = {
  provide: BOT_AUTH_REDIS,
  useFactory: (): Redis => {
    const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
      maxRetriesPerRequest: null,
      enableReadyCheck: true,
    });
    redis.on('error', (e: Error) => log.error(e.message));
    return redis;
  },
};

@Injectable()
export class BotAuthStore implements OnModuleDestroy {
  private readonly logger = new Logger(BotAuthStore.name);
  private readonly credsKey = 'baileys:creds';
  private readonly keysPrefix = 'baileys:keys:';
  private readonly writeMutex = new Mutex();

  constructor(@Inject(BOT_AUTH_REDIS) private readonly redis: Redis) {}

  async onModuleDestroy() {
    await this.redis.quit().catch(() => undefined);
  }

  drainPendingWrites(): Promise<void> {
    return this.writeMutex.runExclusive(async () => {});
  }

  async resetAuthState(): Promise<void> {
    await this.writeMutex.runExclusive(async () => {
      await this.redis.del(this.credsKey);
      await this.scanDel(`${this.keysPrefix}*`);
    });
    this.logger.warn('Auth Baileys limpo no Redis.');
  }

  async createAuthenticationState(): Promise<{
    state: AuthenticationState;
    saveCreds: () => Promise<void>;
  }> {
    const raw = await this.redis.get(this.credsKey);
    let creds: AuthenticationCreds;

    if (raw) {
      try {
        creds = JSON.parse(raw, BufferJSON.reviver) as AuthenticationCreds;
      } catch {
        this.logger.warn('Creds inválidas; a limpar chaves.');
        await this.scanDel(`${this.keysPrefix}*`);
        creds = initAuthCreds();
      }
    } else {
      await this.scanDel(`${this.keysPrefix}*`);
      creds = initAuthCreds();
    }

    return {
      state: {
        creds,
        keys: {
          get: async <T extends keyof SignalDataTypeMap>(type: T, ids: string[]) => {
            if (!ids.length) return {} as Record<string, SignalDataTypeMap[T]>;
            const pipe = this.redis.pipeline();
            for (const id of ids) pipe.get(this.k(type, id));
            const rows = await pipe.exec();
            const out = {} as Record<string, SignalDataTypeMap[T]>;
            for (let i = 0; i < ids.length; i++) {
              const id = ids[i];
              const t = rows?.[i];
              const err = t?.[0];
              const val = t?.[1];
              if (err || val == null || val === '') continue;
              try {
                let v = JSON.parse(val as string, BufferJSON.reviver) as SignalDataTypeMap[T];
                if (type === 'app-state-sync-key' && v) {
                  v = proto.Message.AppStateSyncKeyData.fromObject(v as object) as unknown as SignalDataTypeMap[T];
                }
                out[id] = v;
              } catch {
                /* skip */
              }
            }
            return out;
          },
          set: async (data: SignalDataSet) => {
            const pipe = this.redis.pipeline();
            let n = 0;
            for (const cat in data) {
              const bucket = data[cat as keyof SignalDataSet];
              if (!bucket) continue;
              for (const id in bucket) {
                const v = bucket[id];
                const key = this.k(cat as keyof SignalDataTypeMap, id);
                if (v) {
                  pipe.set(key, JSON.stringify(v, BufferJSON.replacer));
                } else {
                  pipe.del(key);
                }
                n++;
              }
            }
            if (!n) return;
            await this.writeMutex.runExclusive(async () => {
              await pipe.exec();
            });
          },
        },
      },
      saveCreds: async () => {
        await this.writeMutex.runExclusive(async () => {
          await this.redis.set(this.credsKey, JSON.stringify(creds, BufferJSON.replacer));
        });
      },
    };
  }

  private k(type: keyof SignalDataTypeMap | string, id: string): string {
    return `${this.keysPrefix}${String(type)}:${id}`;
  }

  private async scanDel(pattern: string): Promise<void> {
    let c = '0';
    do {
      const [next, keys] = await this.redis.scan(c, 'MATCH', pattern, 'COUNT', 200);
      c = next;
      if (keys.length) await this.redis.del(...keys);
    } while (c !== '0');
  }
}
