import {
  OnGatewayConnection,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import type { Server, Socket } from 'socket.io';
import { ChatsService } from './chats.service';

@WebSocketGateway({
  namespace: '/chats',
  cors: {
    origin: true,
    credentials: true,
  },
})
export class ChatsGateway
  implements OnGatewayConnection, OnModuleInit, OnModuleDestroy
{
  constructor(private readonly chatsService: ChatsService) {}

  @WebSocketServer()
  private server!: Server;

  private unsubscribeChats: (() => void) | null = null;
  private unsubscribeConnection: (() => void) | null = null;
  private unsubscribeChatMessages: (() => void) | null = null;

  onModuleInit() {
    this.unsubscribeChats = this.chatsService.onChatsChanged((chats) => {
      this.server.emit('chats:updated', chats);
    });
    this.unsubscribeConnection = this.chatsService.onConnectionChanged(
      (snapshot) => {
        this.server.emit('bot:connection', snapshot);
      },
    );
    this.unsubscribeChatMessages = this.chatsService.onChatMessagesChanged(
      (payload) => {
        this.server.emit('chat:messages', payload);
      },
    );
  }

  onModuleDestroy() {
    this.unsubscribeChats?.();
    this.unsubscribeConnection?.();
    this.unsubscribeChatMessages?.();
  }

  handleConnection(client: Socket) {
    client.emit('chats:list', this.chatsService.listAll());
    client.emit('bot:connection', this.chatsService.getConnectionSnapshot());
  }
}
