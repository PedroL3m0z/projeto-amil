import {
  BadGatewayException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenAI } from '@google/genai';
import { SettingsService } from '../../core/settings/settings.service';
import { SendAiMessageDto } from './dto/send-ai-message.dto';

@Injectable()
export class AiService {
  constructor(
    private readonly settingsService: SettingsService,
    private readonly configService: ConfigService,
  ) {}

  async reply(payload: SendAiMessageDto) {
    const prompt = await this.buildPrompt(payload);
    const { text: reply, model } = await this.runGeminiTextPrompt(prompt);
    return { reply, model };
  }

  /**
   * Executa um prompt de texto único no Gemini (mesma config de modelo e chave que o assistente).
   */
  async runGeminiTextPrompt(prompt: string): Promise<{ text: string; model: string }> {
    const apiKey = await this.settingsService.getEffectiveGeminiApiKey();
    if (!apiKey) {
      throw new ServiceUnavailableException('Gemini não configurado no servidor.');
    }

    const ai = new GoogleGenAI({ apiKey });
    const model =
      this.configService.get<string>('GEMINI_MODEL')?.trim() ||
      'gemini-2.5-flash';

    try {
      const response = await ai.models.generateContent({
        model,
        contents: prompt,
      });
      const text = response.text?.trim();
      if (!text) {
        throw new BadGatewayException(
          'A IA respondeu sem conteúdo de texto utilizável.',
        );
      }
      return { text, model };
    } catch (error) {
      if (error instanceof BadGatewayException) {
        throw error;
      }
      throw new BadGatewayException('Falha ao consultar o Gemini.');
    }
  }

  private async buildPrompt(payload: SendAiMessageDto): Promise<string> {
    const aiContext = await this.settingsService.getAiContext();
    const instructions = aiContext.instructions.trim();
    const history = payload.history ?? [];

    const historyBlock = history
      .map((item) => {
        const author = item.role === 'assistant' ? 'Assistente' : 'Usuario';
        return `${author}: ${item.text}`;
      })
      .join('\n');

    const sections = [
      instructions
        ? `Instrucoes internas para o assistente:\n${instructions}`
        : '',
      historyBlock ? `Historico recente da conversa:\n${historyBlock}` : '',
      `Mensagem atual do usuario:\n${payload.message}`,
      'Responda somente com o texto da resposta final para o usuario.',
    ].filter((value) => value.length > 0);

    return sections.join('\n\n');
  }
}
