import { Injectable } from '@nestjs/common';
import { Socket } from 'node:net';

type DependencyStatus = {
  up: boolean;
  host: string;
  port: number;
  error?: string;
};

@Injectable()
export class HealthService {
  async check() {
    const postgresTarget = this.resolvePostgresTarget();
    const redisTarget = this.resolveRedisTarget();

    const [postgres, redis] = await Promise.all([
      this.checkTcpDependency(postgresTarget.host, postgresTarget.port),
      this.checkTcpDependency(redisTarget.host, redisTarget.port),
    ]);

    const up = postgres.up && redis.up;
    return {
      up,
      timestamp: new Date().toISOString(),
      dependencies: {
        postgres,
        redis,
      },
    };
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
