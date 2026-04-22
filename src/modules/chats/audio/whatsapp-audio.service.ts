import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import type { WAMessage } from 'baileys';
import { BotService } from '../../../core/bot/bot.service';
import { unwrapMessage } from '../../../core/bot/message-unwrap.util';
import { R2Service } from '../../../core/r2/r2.service';
import { AiService } from '../../ai/ai.service';
import { MessageRepository } from '../repositories/message.repository';
import { AudioStorageLimiterService } from './audio-storage-limiter.service';
import { R2_WHATSAPP_AUDIO_PREFIX } from './chat-audio.constants';

function extensionFor(mimeType: string): string {
  const clean = mimeType.split(';')[0].trim().toLowerCase();
  if (clean.includes('ogg')) return 'ogg';
  if (clean.includes('mp4') || clean.includes('m4a')) return 'm4a';
  if (clean.includes('mpeg') || clean.includes('mp3')) return 'mp3';
  if (clean.includes('wav')) return 'wav';
  if (clean.includes('webm')) return 'webm';
  return 'bin';
}

/**
 * Intercepta mensagens cruas do WhatsApp (`messages.upsert`), faz o download
 * do áudio, sobe no R2 e dispara a transcrição imediata para o modelo de IA.
 *
 * As atualizações no Mongo passam pelo `ChatsRepository` (nada de query inline).
 */
@Injectable()
export class WhatsappAudioService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(WhatsappAudioService.name);
  private unsubscribe: (() => void) | null = null;
  private readonly inFlight = new Set<string>();

  constructor(
    private readonly botService: BotService,
    private readonly r2: R2Service,
    private readonly aiService: AiService,
    private readonly limiter: AudioStorageLimiterService,
    private readonly messageRepo: MessageRepository,
  ) {}

  onModuleInit() {
    this.unsubscribe = this.botService.onRawMessagesUpsert((messages) => {
      for (const m of messages) {
        const inner = unwrapMessage(m.message);
        if (!inner?.audioMessage) continue;
        void this.handleAudioMessage(m).catch((err) =>
          this.log.warn(
            `Falha ao processar áudio: ${err instanceof Error ? err.message : String(err)}`,
          ),
        );
      }
    });
  }

  onModuleDestroy() {
    this.unsubscribe?.();
  }

  private async handleAudioMessage(m: WAMessage) {
    const jid = m.key.remoteJid;
    if (!jid) return;

    const fromMe = Boolean(m.key.fromMe);
    const stableId = this.botService.stableMessageId(jid, m.key.id, fromMe);
    const chatId = this.botService.canonicalChatId(jid);
    const r2Folder = this.botService.mediaStorageFolderId(jid);
    const dedupeKey = `${chatId}|${stableId}`;
    if (this.inFlight.has(dedupeKey)) return;
    this.inFlight.add(dedupeKey);

    try {
      const audioMsg = unwrapMessage(m.message)?.audioMessage;
      if (!audioMsg) return;

      const existing = await this.messageRepo.findAttachment(chatId, stableId);

      const alreadyTranscribed =
        existing?.text?.trim().startsWith('[Áudio Transcrito]') ?? false;
      if (alreadyTranscribed) return;

      const hasStorage = Boolean(existing?.attachment?.storageKey);
      if (hasStorage) {
        this.botService.markAttachmentReady(chatId, stableId);
      }

      const needsTranscription = !fromMe;
      const needsUpload = this.r2.isEnabled() && !hasStorage;

      if (!needsTranscription && !needsUpload) {
        this.log.debug(
          'R2 não configurado e mensagem própria; sem upload nem transcrição.',
        );
        return;
      }

      let buffer: Buffer | null = null;
      if (
        hasStorage &&
        this.r2.isEnabled() &&
        existing?.attachment?.storageKey
      ) {
        buffer = await this.r2.getObjectBuffer(existing.attachment.storageKey);
      }
      if (!buffer?.length) {
        buffer = await this.botService.downloadMessageMedia(m);
      }
      if (!buffer?.length) return;

      const mimeType =
        audioMsg.mimetype?.trim() ||
        existing?.attachment?.mimeType?.trim() ||
        'audio/ogg';

      if (needsUpload) {
        const ext = extensionFor(mimeType);
        const storageKey = `${R2_WHATSAPP_AUDIO_PREFIX}${r2Folder}/${stableId}.${ext}`;

        await this.r2.putObject({
          key: storageKey,
          body: buffer,
          contentType: mimeType,
          cacheControl: 'private, max-age=31536000, immutable',
        });

        await this.messageRepo.upsertAudioAttachment({
          chatId,
          messageId: stableId,
          mimeType,
          ptt: audioMsg.ptt ?? undefined,
          durationSec:
            typeof audioMsg.seconds === 'number' ? audioMsg.seconds : undefined,
          storageKey,
        });

        this.botService.markAttachmentReady(chatId, stableId);
        this.log.log(`Áudio persistido em R2: ${storageKey}`);
        this.limiter.scheduleEnforce();
      }

      if (needsTranscription) {
        const text = await this.aiService.transcribeAudio(buffer, mimeType);
        if (text) {
          this.botService.updateChatMessageText(
            chatId,
            stableId,
            `[Áudio Transcrito] ${text}`,
          );
        }
      }
    } finally {
      this.inFlight.delete(dedupeKey);
    }
  }
}
