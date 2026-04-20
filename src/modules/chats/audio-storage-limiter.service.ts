import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Mutex } from 'async-mutex';
import { Model } from 'mongoose';
import { R2Service } from '../../core/r2/r2.service';
import { Message, MessageDocument } from './schemas/message.schema';

/** Prefixo sob o qual os áudios do WhatsApp são armazenados no bucket R2. */
const AUDIO_PREFIX = 'whatsapp/audio/';

/** Padrão: 10 GiB = 10 * 1024^3 bytes. */
const DEFAULT_MAX_BYTES = 10 * 1024 * 1024 * 1024;

/**
 * Percentual do limite a atingir após o corte. Apagamos até ficar abaixo
 * desta fração para não rodar o enforceQuota a cada upload novo.
 */
const TARGET_RATIO = 0.9;

@Injectable()
export class AudioStorageLimiterService
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly log = new Logger(AudioStorageLimiterService.name);
  private readonly mutex = new Mutex();
  private readonly maxBytes: number;
  /** Pequeno debounce para não rodar o scan em rajada (ex: 5 áudios em sequência). */
  private pendingTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly r2: R2Service,
    @InjectModel(Message.name)
    private readonly messageModel: Model<MessageDocument>,
  ) {
    const raw = this.config.get<string>('R2_AUDIO_MAX_BYTES')?.trim();
    const parsed = raw ? Number(raw) : Number.NaN;
    this.maxBytes =
      Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : DEFAULT_MAX_BYTES;
    this.log.log(
      `Quota de áudios no R2: ${this.formatBytes(this.maxBytes)} (corte alvo: ${this.formatBytes(
        Math.floor(this.maxBytes * TARGET_RATIO),
      )}).`,
    );
  }

  onApplicationBootstrap() {
    // Roda uma verificação inicial; se o bucket já estiver acima do limite, corta logo.
    this.scheduleEnforce(2_000);
  }

  onModuleDestroy() {
    if (this.pendingTimer) {
      clearTimeout(this.pendingTimer);
      this.pendingTimer = null;
    }
  }

  /** Agenda uma verificação com debounce (evita N scans seguidos). Nunca lança. */
  scheduleEnforce(delayMs = 500): void {
    if (!this.r2.isEnabled()) return;
    if (this.pendingTimer) return;
    this.pendingTimer = setTimeout(() => {
      this.pendingTimer = null;
      void this.enforceQuota().catch((err) =>
        this.log.warn(
          `Falha ao aplicar quota do R2: ${err instanceof Error ? err.message : String(err)}`,
        ),
      );
    }, delayMs);
  }

  /**
   * Lista tudo em `whatsapp/audio/`, soma bytes e, se exceder o limite,
   * apaga do R2 + limpa `attachment.storageKey` no Mongo dos itens mais antigos
   * até ficar abaixo de `maxBytes * TARGET_RATIO`.
   *
   * Protegido por mutex — execuções simultâneas retornam sem rodar.
   */
  async enforceQuota(): Promise<{
    totalBytes: number;
    deletedCount: number;
    freedBytes: number;
  }> {
    if (!this.r2.isEnabled()) {
      return { totalBytes: 0, deletedCount: 0, freedBytes: 0 };
    }

    if (this.mutex.isLocked()) {
      return { totalBytes: 0, deletedCount: 0, freedBytes: 0 };
    }

    return this.mutex.runExclusive(async () => {
      const items = await this.r2.listAllObjects(AUDIO_PREFIX);
      const totalBytes = items.reduce((acc, it) => acc + it.size, 0);
      if (totalBytes <= this.maxBytes) {
        return { totalBytes, deletedCount: 0, freedBytes: 0 };
      }

      const target = Math.floor(this.maxBytes * TARGET_RATIO);
      // Objetos sem `lastModified` vão para o começo (serão apagados primeiro).
      const sorted = [...items].sort((a, b) => {
        const ta = a.lastModified ? a.lastModified.getTime() : 0;
        const tb = b.lastModified ? b.lastModified.getTime() : 0;
        return ta - tb;
      });

      const toDelete: string[] = [];
      let remaining = totalBytes;
      for (const it of sorted) {
        if (remaining <= target) break;
        toDelete.push(it.key);
        remaining -= it.size;
      }

      if (toDelete.length === 0) {
        return { totalBytes, deletedCount: 0, freedBytes: 0 };
      }

      const freedBytes = totalBytes - remaining;
      this.log.warn(
        `Quota excedida (${this.formatBytes(totalBytes)} > ${this.formatBytes(
          this.maxBytes,
        )}). Apagando ${String(toDelete.length)} áudios mais antigos (~${this.formatBytes(
          freedBytes,
        )}).`,
      );

      const errors = await this.r2.deleteObjects(toDelete);
      const deleted = toDelete.filter((k) => !errors.includes(k));

      if (errors.length > 0) {
        this.log.warn(
          `Falha ao apagar ${String(errors.length)} objetos do R2 (permanecem no Mongo como órfãos).`,
        );
      }

      if (deleted.length > 0) {
        try {
          const res = await this.messageModel
            .updateMany(
              { 'attachment.storageKey': { $in: deleted } },
              { $unset: { 'attachment.storageKey': 1 } },
            )
            .exec();
          this.log.log(
            `Quota aplicada: ${String(deleted.length)} objetos apagados do R2, ${String(
              res.modifiedCount ?? 0,
            )} documentos atualizados no Mongo.`,
          );
        } catch (err) {
          this.log.error(
            `Áudios apagados do R2 mas falhou ao limpar Mongo: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }

      return {
        totalBytes,
        deletedCount: deleted.length,
        freedBytes,
      };
    });
  }

  private formatBytes(bytes: number): string {
    if (bytes < 1024) return `${String(bytes)} B`;
    const units = ['KiB', 'MiB', 'GiB', 'TiB'];
    let v = bytes / 1024;
    let u = 0;
    while (v >= 1024 && u < units.length - 1) {
      v /= 1024;
      u += 1;
    }
    return `${v.toFixed(2)} ${units[u]}`;
  }
}
