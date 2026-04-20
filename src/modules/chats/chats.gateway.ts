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
  private unsubscribeTyping: (() => void) | null = null;

  onModuleInit() {
    this.unsubscribeChats = this.chatsService.onChatsChanged((chats) => {
      this.server.emit('chats:updated', chats);
      this.chatsService.schedulePresenceSubscribe(chats);
    });
    this.unsubscribeConnection = this.chatsService.onConnectionChanged(
      (snapshot) => {
        this.server.emit('bot:connection', snapshot);
      },
    );
    this.unsubscribeTyping = this.chatsService.onTypingUpdate((payload) => {
      this.server.emit('chat:typing', payload);
    });
  }

  /**
   * Emite o snapshot atualizado de mensagens de um chat. É chamado pelo
   * `ChatsSyncService` **depois** de persistir no Mongo, garantindo que a
   * resposta inclua `audioUrl` presigned e demais metadados de attachments.
   */
  async broadcastChatMessages(chatId: string): Promise<void> {
    try {
      const messages = await this.chatsService.listMessages(chatId);
      this.server.emit('chat:messages', { chatId, messages });
    } catch {
      /* ignore: falha transitória na leitura do Mongo */
    }
  }

  onModuleDestroy() {
    this.unsubscribeChats?.();
    this.unsubscribeConnection?.();
    this.unsubscribeTyping?.();
  }

  async handleConnection(client: Socket) {
    const list = await this.chatsService.listAll();
    client.emit('chats:list', list);
    client.emit('bot:connection', this.chatsService.getConnectionSnapshot());
    this.chatsService.schedulePresenceSubscribe(list);
  }
}
