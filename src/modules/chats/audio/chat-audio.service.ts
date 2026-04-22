import { Injectable, Logger } from '@nestjs/common';
import { BotService } from '../../../core/bot/bot.service';
import { R2Service } from '../../../core/r2/r2.service';
import { AiService } from '../../ai/ai.service';
import { MessageRepository } from '../repositories/message.repository';

/**
 * Regras de negócio específicas de **áudio** em chats:
 *  - Transcrever (on-demand) áudios ainda com placeholder `[Áudio]`.
 *  - Propagar o novo texto para o Mongo e para o estado em memória do bot.
 *
 * Mantido à parte do `ChatsService` para respeitar SRP: esse service
 * cuida apenas do ciclo de vida do áudio pós-upload.
 */
@Injectable()
export class ChatAudioService {
  private readonly log = new Logger(ChatAudioService.name);

  constructor(
    private readonly botService: BotService,
    private readonly r2: R2Service,
    private readonly aiService: AiService,
    private readonly messageRepo: MessageRepository,
  ) {}

  /**
   * Garante que mensagens com placeholder `[Áudio]` e ficheiro no R2
   * fiquem com `[Áudio Transcrito] …` no Mongo e no estado do bot
   * (tipicamente chamado antes de sugerir uma resposta).
   */
  async transcribePendingAudios(chatId: string): Promise<void> {
    if (!this.r2.isEnabled()) {
      this.log.debug(
        'R2 desligado; não é possível transcrever áudios pendentes a partir do storage.',
      );
      return;
    }

    const canonical = this.botService.canonicalChatId(chatId);
    const chatIds = [
      ...new Set([canonical, ...this.botService.linkedDirectChatIds(chatId)]),
    ];

    const candidates = await this.messageRepo.findPendingAudios(chatIds);
    if (candidates.length === 0) {
      this.log.debug(
        `Nenhuma mensagem [Áudio] pendente com storageKey para chatIds=${chatIds.join(', ')}`,
      );
      return;
    }

    for (const doc of candidates) {
      const key = doc.attachment?.storageKey;
      const mime = doc.attachment?.mimeType?.trim() || 'audio/ogg';
      if (!key) continue;

      const buf = await this.r2.getObjectBuffer(key);
      if (!buf?.length) {
        this.log.warn(`R2: objeto vazio ou inexistente para key=${key}`);
        continue;
      }

      const text = await this.aiService.transcribeAudio(buf, mime);
      if (!text) {
        this.log.warn(
          `Transcrição devolveu vazio para messageId=${doc.messageId} key=${key}`,
        );
        continue;
      }

      const newText = `[Áudio Transcrito] ${text}`;
      await this.messageRepo.updateText(doc.chatId, doc.messageId, newText);
      this.botService.updateChatMessageText(canonical, doc.messageId, newText);
    }
  }
}
