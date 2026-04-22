import {
  BadGatewayException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenAI } from '@google/genai';
import { SettingsService } from '../../core/settings/settings.service';
import { SendAiMessageDto } from './dto/send-ai-message.dto';

const TRANSCRIPTION_INSTRUCTIONS = `
Transcreva o áudio anexo para português do Brasil.
Responda APENAS com o texto transcrito, palavra por palavra quando possível.
Sem saudações, sem comentários, sem explicações, sem prefixos ou sufixos.
Se não houver fala audível, responda com uma única palavra: (silêncio).
`.trim();

@Injectable()
export class AiService {
  private readonly log = new Logger(AiService.name);

  constructor(
    private readonly settingsService: SettingsService,
    private readonly configService: ConfigService,
  ) {}

  async reply(payload: SendAiMessageDto) {
    const prompt = await this.buildPrompt(payload);
    const { text: reply, model } = await this.runGeminiTextPrompt(prompt);
    return { reply, model };
  }

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

  async transcribeAudio(buffer: Buffer, mimeType: string): Promise<string | null> {
    const apiKey = await this.settingsService.getEffectiveGeminiApiKey();
    if (!apiKey) {
      this.log.debug('Gemini não configurado; transcrição ignorada.');
      return null;
    }

    const preferred = this.configService.get<string>('GEMINI_TRANSCRIPTION_MODEL')?.trim();
    const models = [
      ...new Set(
        [
          preferred,
          'gemini-2.0-flash',
          'gemini-2.5-flash',
          'gemini-1.5-flash',
          'gemini-1.5-flash-8b',
        ].filter((m): m is string => Boolean(m)),
      ),
    ];

    const cleanMime = (mimeType.split(';')[0] ?? 'audio/ogg').trim() || 'audio/ogg';
    const ai = new GoogleGenAI({ apiKey });
    const contents = [
      {
        role: 'user' as const,
        parts: [
          { text: TRANSCRIPTION_INSTRUCTIONS },
          {
            inlineData: {
              mimeType: cleanMime,
              data: buffer.toString('base64'),
            },
          },
        ],
      },
    ];

    let lastErr: string | null = null;
    for (const model of models) {
      try {
        const response = await ai.models.generateContent({ model, contents });
        const text = response.text?.trim();
        if (text) {
          if (model !== models[0]) {
            this.log.log(`Transcrição OK com modelo fallback: ${model}`);
          }
          return text;
        }
      } catch (e) {
        lastErr = e instanceof Error ? e.message : String(e);
        this.log.warn(`Transcrição com ${model} falhou: ${lastErr}`);
      }
    }
    if (lastErr) {
      this.log.warn(`Transcrição esgotou modelos (${models.join(', ')}). Último erro: ${lastErr}`);
    }
    return null;
  }

  private async buildPrompt(payload: SendAiMessageDto): Promise<string> {
    const aiContext = await this.settingsService.getAiContext();
    const instructions = aiContext.instructions.trim();
    const history = payload.history ?? [];

    const historyBlock = history
      .map((item) => {
        const author = item.role === 'assistant' ? 'Assistente' : 'Usuário';
        return `${author}: ${item.text}`;
      })
      .join('\n');

    const sections = [
      instructions
        ? `Instruções internas para o assistente:\n${instructions}`
        : '',
      historyBlock ? `Histórico recente da conversa:\n${historyBlock}` : '',
      `Mensagem atual do usuário:\n${payload.message}`,
      'Responda somente com o texto da resposta final para o usuário.',
    ].filter((value) => value.length > 0);

    return sections.join('\n\n');
  }
}
