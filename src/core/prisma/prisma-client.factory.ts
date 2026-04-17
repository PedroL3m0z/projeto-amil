import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

/**
 * Prisma 7 exige um driver adapter em runtime (não basta `prisma.config.ts` para o CLI).
 */
export function createPrismaClient(connectionString?: string): PrismaClient {
  const url =
    connectionString?.trim() ||
    process.env.DATABASE_URL?.trim() ||
    '';
  if (!url) {
    throw new Error(
      'DATABASE_URL não está definida. Configure no .env ou nas variáveis do container.',
    );
  }
  const adapter = new PrismaPg({ connectionString: url });
  return new PrismaClient({ adapter });
}
