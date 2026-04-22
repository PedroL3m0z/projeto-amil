import { Injectable } from '@nestjs/common';
import { Socket } from 'node:net';
import { R2Service } from '../r2/r2.service';

type DependencyStatus = {
  up: boolean;
  host: string;
  port: number;
  error?: string;
};

@Injectable()
export class HealthService {
  constructor(private readonly r2: R2Service) {}

  async check() {
    const postgresTarget = this.resolvePostgresTarget();
    const redisTarget = this.resolveRedisTarget();

    const [postgres, redis, r2] = await Promise.all([
      this.checkTcpDependency(postgresTarget.host, postgresTarget.port),
      this.checkTcpDependency(redisTarget.host, redisTarget.port),
      this.checkR2(),
    ]);

    const up = postgres.up && redis.up;
    return {
      up,
      timestamp: new Date().toISOString(),
      dependencies: {
        postgres,
        redis,
        r2,
      },
    };
  }

  /** Lista até 1 objeto no bucket (confirma credenciais e endpoint R2). */
  private async checkR2(): Promise<{
    ok: boolean;
    configured: boolean;
    error?: string;
  }> {
    if (!this.r2.isEnabled()) {
      return { configured: false, ok: true };
    }
    try {
      await this.r2.listObjects(undefined, 1);
      return { configured: true, ok: true };
    } catch (e) {
      return {
        configured: true,
        ok: false,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  }

  private async checkTcpDependency(
    host: string,
    port: number,
  ): Promise<DependencyStatus> {
    return new Promise((resolve) => {
      const socket = new Socket();
      let settled = false;

      const finish = (status: DependencyStatus) => {
        if (settled) return;
        settled = true;
        socket.destroy();
        resolve(status);
      };

      socket.setTimeout(1500);
      socket.once('connect', () => finish({ up: true, host, port }));
      socket.once('timeout', () =>
        finish({ up: false, host, port, error: 'timeout' }),
      );
      socket.once('error', (error: Error) =>
        finish({ up: false, host, port, error: error.message }),
      );

      socket.connect(port, host);
    });
  }

  private resolvePostgresTarget(): { host: string; port: number } {
    const hostFromEnv = process.env.PGHOST;
    const portFromEnv = Number(process.env.PGPORT);
    if (hostFromEnv && Number.isFinite(portFromEnv) && portFromEnv > 0) {
      return { host: hostFromEnv, port: portFromEnv };
    }

    const databaseUrl = process.env.DATABASE_URL;
    if (
      databaseUrl &&
      (databaseUrl.startsWith('postgresql://') ||
        databaseUrl.startsWith('postgres://'))
    ) {
      try {
        const parsed = new URL(databaseUrl);
        return {
          host: parsed.hostname || 'localhost',
          port: Number(parsed.port) || 5432,
        };
      } catch {
        // fallback below
      }
    }

    return { host: 'localhost', port: 5432 };
  }

  private resolveRedisTarget(): { host: string; port: number } {
    const redisUrl = process.env.REDIS_URL;
    if (redisUrl) {
      try {
        const parsed = new URL(redisUrl);
        return {
          host: parsed.hostname || 'localhost',
          port: Number(parsed.port) || 6379,
        };
      } catch {
        // fallback below
      }
    }

    return { host: 'localhost', port: 6379 };
  }
}
