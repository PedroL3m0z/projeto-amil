import { Controller, Get } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { BotService } from './bot.service';

@Controller('bot')
@ApiTags('Bot')
export class BotController {
  constructor(private readonly bot: BotService) {}

  @Get('connection')
  @ApiOperation({ summary: 'Estado da conexão WhatsApp do bot.' })
  @ApiCookieAuth('access_token')
  connection() {
    return this.bot.getConnectionSnapshot();
  }
}
