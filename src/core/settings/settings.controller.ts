import { Body, Controller, Get, Put } from '@nestjs/common';
import {
  ApiBody,
  ApiCookieAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { SetGeminiKeyDto } from './dto/set-gemini-key.dto';
import { SettingsService } from './settings.service';

@Controller('settings')
@ApiTags('Settings')
@ApiCookieAuth('access_token')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get()
  @ApiOperation({ summary: 'Resumo das configurações persistidas (sem expor segredos).' })
  @ApiOkResponse({
    schema: {
      example: { geminiConfigured: true, passwordOverriddenInRedis: false },
    },
  })
  @ApiUnauthorizedResponse()
  async summary() {
    const geminiConfigured = await this.settingsService.isGeminiConfigured();
    const passwordOverriddenInRedis =
      (await this.settingsService.getPasswordHash()) !== null;
    return { geminiConfigured, passwordOverriddenInRedis };
  }

  @Put('gemini')
  @ApiOperation({ summary: 'Define a API key do Gemini no Redis (string vazia remove).' })
  @ApiBody({ type: SetGeminiKeyDto })
  @ApiOkResponse({ schema: { example: { ok: true } } })
  async setGemini(@Body() body: SetGeminiKeyDto) {
    await this.settingsService.setGeminiApiKey(body.apiKey ?? '');
    return { ok: true as const };
  }
}
