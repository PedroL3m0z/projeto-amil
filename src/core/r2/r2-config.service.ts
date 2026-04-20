import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type R2Config = {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  endpoint: string;
  publicUrl: string | null;
};

@Injectable()
export class R2ConfigService {
  private readonly log = new Logger(R2ConfigService.name);

  constructor(private readonly config: ConfigService) {}

  /** Retorna a configuração se todas as envs obrigatórias estiverem definidas; caso contrário `null`. */
  load(): R2Config | null {
    const accountId = this.read('R2_ACCOUNT_ID');
    const accessKeyId = this.read('R2_ACCESS_KEY_ID');
    const secretAccessKey = this.read('R2_SECRET_ACCESS_KEY');
    const bucket = this.read('R2_BUCKET');

    if (!accountId || !accessKeyId || !secretAccessKey || !bucket) {
      this.log.warn(
        'R2 não configurado (faltam R2_ACCOUNT_ID/R2_ACCESS_KEY_ID/R2_SECRET_ACCESS_KEY/R2_BUCKET). ' +
          'Operações no R2Service irão falhar até que as variáveis sejam definidas.',
      );
      return null;
    }

    const publicUrlRaw = this.read('R2_PUBLIC_URL');

    return {
      accountId,
      accessKeyId,
      secretAccessKey,
      bucket,
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      publicUrl: publicUrlRaw ? publicUrlRaw.replace(/\/$/, '') : null,
    };
  }

  private read(key: string): string | null {
    const value = this.config.get<string>(key)?.trim() || process.env[key]?.trim();
    return value || null;
  }
}
