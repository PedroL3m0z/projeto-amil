import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';
import {
  ApiBody,
  ApiCookieAuth,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { SendChatMessageDto } from './dto/send-chat-message.dto';
import { ChatsService } from './chats.service';

@Controller('chats')
@ApiTags('Chats')
export class ChatsController {
  constructor(private readonly chatsService: ChatsService) {}

  @Get()
  @ApiOperation({
    summary: 'Lista conversas diretas (contatos). Grupos e canais não entram.',
  })
  @ApiOkResponse({
    schema: {
      example: [
        {
          id: '5585999999999@s.whatsapp.net',
          name: null,
          displayName: '+5585999999999',
          lastMessage: 'Olá',
          lastMessageAt: '2026-04-13T14:00:00.000Z',
          lastMessageFromMe: false,
          lastMessageAuthor: 'Maria',
        },
      ],
    },
  })
  @ApiCookieAuth('access_token')
  listChats() {
    return this.chatsService.listAll();
  }

  @Get(':chatId/messages')
  @ApiOperation({ summary: 'Lista mensagens armazenadas do chat (memória do bot).' })
  @ApiParam({
    name: 'chatId',
    description: 'JID completo do chat (URL-encoded se contiver @).',
  })
  @ApiOkResponse({
    schema: {
      example: [
        {
          id: '5585@s.whatsapp.net|ABC|0',
          at: '2026-04-13T14:00:00.000Z',
          text: 'Olá',
          fromMe: false,
        },
      ],
    },
  })
  @ApiCookieAuth('access_token')
  listMessages(@Param('chatId') chatId: string) {
    try {
      return this.chatsService.listMessages(decodeURIComponent(chatId));
    } catch {
      return this.chatsService.listMessages(chatId);
    }
  }

  @Post(':chatId/messages')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Envia mensagem para um chat específico.' })
  @ApiParam({
    name: 'chatId',
    example: '5585999999999',
    description: 'JID completo ou número com DDI.',
  })
  @ApiBody({ type: SendChatMessageDto })
  @ApiOkResponse({ schema: { example: { ok: true } } })
  @ApiCookieAuth('access_token')
  sendToChat(@Param('chatId') chatId: string, @Body() body: SendChatMessageDto) {
    try {
      return this.chatsService.sendToChat(decodeURIComponent(chatId), body.text);
    } catch {
      return this.chatsService.sendToChat(chatId, body.text);
    }
  }
}
