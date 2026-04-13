import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { SendMessageDto } from './dto/send-message.dto';
import { MessagesService } from './messages.service';

@Controller('messages')
@ApiTags('Messages')
export class MessagesController {
  constructor(private readonly messagesService: MessagesService) {}

  @Post('send')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Envia mensagem de texto pelo bot.' })
  @ApiOkResponse({
    schema: { example: { ok: true } },
  })
  @ApiCookieAuth('access_token')
  async send(@Body() body: SendMessageDto) {
    return this.messagesService.send(body);
  }
}
