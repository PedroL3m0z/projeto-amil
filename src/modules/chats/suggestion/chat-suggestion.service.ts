import { Injectable } from '@nestjs/common';
import { SettingsService } from '../../../core/settings/settings.service';
import { AiService } from '../../ai/ai.service';
import { PlanCatalogService } from '../../catalog/plan-catalog.service';
import { ChatAudioService } from '../audio/chat-audio.service';
import { ChatsService } from '../chats.service';

const LAST_CUSTOMER_MESSAGES = 12;

/**
 * Caso de uso: montar o prompt do Gemini e sugerir a próxima mensagem
 * do vendedor. Fica isolado num sub-domínio (`suggestion/`) para não
 * inflar `ChatsService` com lógica de IA/catálogo.
 */
@Injectable()
export class ChatSuggestionService {
  constructor(
    private readonly chatsService: ChatsService,
    private readonly chatAudioService: ChatAudioService,
    private readonly settingsService: SettingsService,
    private readonly planCatalogService: PlanCatalogService,
    private readonly aiService: AiService,
  ) {}

  async suggestReply(
    chatId: string,
  ): Promise<{ suggestion: string; model: string }> {
    // Garante que áudios pendentes viram texto antes de montar o prompt.
    await this.chatAudioService.transcribePendingAudios(chatId);

    const messages = await this.chatsService.listMessages(chatId);
    const historyLines: string[] = [];
    for (const m of messages) {
      const role = m.fromMe ? 'Vendedor' : 'Cliente';
      if (m.text?.trim()) {
        historyLines.push(`${role}: ${m.text.trim()}`);
      }
    }

    const customerTexts = messages
      .filter((m) => !m.fromMe && m.text?.trim())
      .slice(-LAST_CUSTOMER_MESSAGES)
      .map((m) => m.text.trim());
    const lastCustomerJoined = customerTexts.join('\n');

    const aiContext = await this.settingsService.getAiContext();
    const instructions = aiContext.instructions.trim();

    const catalogBlock =
      await this.planCatalogService.buildContextForChat(lastCustomerJoined);

    const historyBlock =
      historyLines.length > 0
        ? `Histórico do WhatsApp (mais antigo primeiro):\n${historyLines.join('\n')}`
        : 'Histórico do WhatsApp: (ainda sem mensagens neste chat).';

    const prompt = [
      'Você sugere APENAS a próxima mensagem que o VENDEDOR deve enviar no WhatsApp, em português do Brasil.',
      'Baseie-se no histórico abaixo, nas instruções internas (se houver) e no catálogo odontológico (contexto interno).',
      'Regras: sem markdown; sem aspas; sem prefixos do tipo "Vendedor:"; uma única mensagem curta ou média; tom profissional e cordial.',
      instructions
        ? `Instruções internas para o time comercial:\n${instructions}`
        : '',
      catalogBlock,
      historyBlock,
      'Responda somente com o texto da mensagem a enviar, nada mais.',
    ]
      .filter((s) => s.length > 0)
      .join('\n\n');

    const { text, model } = await this.aiService.runGeminiTextPrompt(prompt);
    return { suggestion: text, model };
  }
}
