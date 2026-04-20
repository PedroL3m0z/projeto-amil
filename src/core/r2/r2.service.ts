import {
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  NoSuchKey,
  NotFound,
  PutObjectCommand,
  S3Client,
  type _Object,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
} from '@nestjs/common';
import { Readable } from 'node:stream';
import { R2_CLIENT, R2_CONFIG } from './r2.constants';
import type { R2Config } from './r2-config.service';

export type R2PutObjectInput = {
  key: string;
  body: Buffer | Uint8Array | string | Readable;
  contentType?: string;
  cacheControl?: string;
  metadata?: Record<string, string>;
};

export type R2ListItem = {
  key: string;
  size: number;
  lastModified: Date | null;
  etag: string | null;
};

@Injectable()
export class R2Service implements OnModuleDestroy {
  private readonly log = new Logger(R2Service.name);

  constructor(
    @Inject(R2_CLIENT) private readonly client: S3Client | null,
    @Inject(R2_CONFIG) private readonly config: R2Config | null,
  ) {}

  onModuleDestroy() {
    this.client?.destroy();
  }

  isEnabled(): boolean {
    return this.client !== null && this.config !== null;
  }

  get bucket(): string {
    return this.requireConfig().bucket;
  }

  async putObject(input: R2PutObjectInput): Promise<{ key: string; etag: string | null }> {
    const { client, config } = this.requireReady();
    const res = await client.send(
      new PutObjectCommand({
        Bucket: config.bucket,
        Key: input.key,
        Body: input.body,
        ContentType: input.contentType,
        CacheControl: input.cacheControl,
        Metadata: input.metadata,
      }),
    );
    return { key: input.key, etag: res.ETag ?? null };
  }

  async getObjectBuffer(key: string): Promise<Buffer | null> {
    const { client, config } = this.requireReady();
    try {
      const res = await client.send(
        new GetObjectCommand({ Bucket: config.bucket, Key: key }),
      );
      if (!res.Body) return null;
      const chunks: Buffer[] = [];
      for await (const chunk of res.Body as Readable) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      return Buffer.concat(chunks);
    } catch (err) {
      if (err instanceof NoSuchKey || err instanceof NotFound) return null;
      throw err;
    }
  }

  async getObjectStream(key: string): Promise<Readable | null> {
    const { client, config } = this.requireReady();
    try {
      const res = await client.send(
        new GetObjectCommand({ Bucket: config.bucket, Key: key }),
      );
      return (res.Body as Readable) ?? null;
    } catch (err) {
      if (err instanceof NoSuchKey || err instanceof NotFound) return null;
      throw err;
    }
  }

  async deleteObject(key: string): Promise<void> {
    const { client, config } = this.requireReady();
    await client.send(
      new DeleteObjectCommand({ Bucket: config.bucket, Key: key }),
    );
  }

  async exists(key: string): Promise<boolean> {
    const { client, config } = this.requireReady();
    try {
      await client.send(
        new HeadObjectCommand({ Bucket: config.bucket, Key: key }),
      );
      return true;
    } catch (err) {
      if (err instanceof NotFound) return false;
      throw err;
    }
  }

  async listObjects(prefix?: string, max = 1000): Promise<R2ListItem[]> {
    const { client, config } = this.requireReady();
    const res = await client.send(
      new ListObjectsV2Command({
        Bucket: config.bucket,
        Prefix: prefix,
        MaxKeys: max,
      }),
    );
    return (res.Contents ?? []).map((o: _Object) => ({
      key: o.Key ?? '',
      size: o.Size ?? 0,
      lastModified: o.LastModified ?? null,
      etag: o.ETag ?? null,
    }));
  }

  /**
   * Lista TODOS os objetos com o prefixo fornecido, paginando pelo `ContinuationToken`.
   * Usa páginas de 1000 itens (máximo do S3). Para buckets enormes pode demorar e consumir memória.
   */
  async listAllObjects(prefix?: string): Promise<R2ListItem[]> {
    const { client, config } = this.requireReady();
    const out: R2ListItem[] = [];
    let token: string | undefined;
    do {
      const res = await client.send(
        new ListObjectsV2Command({
          Bucket: config.bucket,
          Prefix: prefix,
          MaxKeys: 1000,
          ContinuationToken: token,
        }),
      );
      for (const o of res.Contents ?? []) {
        out.push({
          key: o.Key ?? '',
          size: o.Size ?? 0,
          lastModified: o.LastModified ?? null,
          etag: o.ETag ?? null,
        });
      }
      token = res.IsTruncated ? res.NextContinuationToken : undefined;
    } while (token);
    return out;
  }

  /**
   * Apaga vários objetos em lote (mais eficiente que deleteObject em loop).
   * A API aceita até 1000 chaves por request — o método pagina automaticamente.
   * Retorna as chaves que falharam.
   */
  async deleteObjects(keys: string[]): Promise<string[]> {
    if (keys.length === 0) return [];
    const { client, config } = this.requireReady();
    const errors: string[] = [];
    for (let i = 0; i < keys.length; i += 1000) {
      const chunk = keys.slice(i, i + 1000);
      const res = await client.send(
        new DeleteObjectsCommand({
          Bucket: config.bucket,
          Delete: {
            Objects: chunk.map((k) => ({ Key: k })),
            Quiet: true,
          },
        }),
      );
      for (const err of res.Errors ?? []) {
        if (err.Key) errors.push(err.Key);
      }
    }
    return errors;
  }

  /** URL assinada para DOWNLOAD (GET) temporário. `expiresIn` em segundos. */
  async getSignedDownloadUrl(key: string, expiresIn = 900): Promise<string> {
    const { client, config } = this.requireReady();
    return getSignedUrl(
      client,
      new GetObjectCommand({ Bucket: config.bucket, Key: key }),
      { expiresIn },
    );
  }

  /** URL assinada para UPLOAD (PUT) direto do client ao R2. */
  async getSignedUploadUrl(
    key: string,
    expiresIn = 900,
    contentType?: string,
  ): Promise<string> {
    const { client, config } = this.requireReady();
    return getSignedUrl(
      client,
      new PutObjectCommand({
        Bucket: config.bucket,
        Key: key,
        ContentType: contentType,
      }),
      { expiresIn },
    );
  }

  /** URL pública (apenas se R2_PUBLIC_URL estiver configurada). Para buckets privados, use `getSignedDownloadUrl`. */
  getPublicUrl(key: string): string | null {
    const config = this.requireConfig();
    if (!config.publicUrl) return null;
    const safeKey = key.replace(/^\/+/, '');
    return `${config.publicUrl}/${safeKey}`;
  }

  private requireReady(): { client: S3Client; config: R2Config } {
    if (!this.client || !this.config) {
      throw new Error(
        'R2 não está configurado. Defina R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY e R2_BUCKET no .env.',
      );
    }
    return { client: this.client, config: this.config };
  }

  private requireConfig(): R2Config {
    if (!this.config) {
      throw new Error(
        'R2 não está configurado. Defina R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY e R2_BUCKET no .env.',
      );
    }
    return this.config;
  }
}
