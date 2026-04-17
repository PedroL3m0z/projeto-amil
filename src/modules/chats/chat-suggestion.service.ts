import { Injectable } from '@nestjs/common';
import { AiService } from '../ai/ai.service';
import { PlanCatalogService } from '../catalog/plan-catalog.service';
import { SettingsService } from '../../core/settings/settings.service';
import { ChatsService } from './chats.service';

const LAST_CUSTOMER_MESSAGES = 12;

@Injectable()
export class ChatSuggestionService {
  constructor(
    private readonly chatsService: ChatsService,
    private readonly settingsService: SettingsService,
    private readonly planCatalogService: PlanCatalogService,
    private readonly aiService: AiService,
  ) {}

  async suggestReply(chatId: string): Promise<{ suggestion: string; model: string }> {
    const messages = this.chatsService.listMessages(chatId);
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
        ? `Historico do WhatsApp (mais antigo primeiro):\n${historyLines.join('\n')}`
        : 'Historico do WhatsApp: (ainda sem mensagens neste chat).';

    const prompt = [
      'Voce sugere APENAS a proxima mensagem que o VENDEDOR deve enviar no WhatsApp, em portugues do Brasil.',
      'Baseie-se no historico abaixo, nas instrucoes internas (se houver) e no catalogo odontologico (contexto interno).',
      'Regras: sem markdown; sem aspas; sem prefixos do tipo "Vendedor:"; uma unica mensagem curta ou media; tom profissional e cordial.',
      instructions ? `Instrucoes internas para o time comercial:\n${instructions}` : '',
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
