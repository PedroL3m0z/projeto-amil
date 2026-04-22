import { Test, TestingModule } from '@nestjs/testing';
import { ChatsController } from './chats.controller';

jest.mock('./suggestion/chat-suggestion.service', () => ({
  ChatSuggestionService: class ChatSuggestionService {},
}));

jest.mock('./chats.service', () => ({
  ChatsService: class ChatsService {},
}));

import { ChatsService } from './chats.service';
import { ChatSuggestionService } from './suggestion/chat-suggestion.service';

describe('ChatsController', () => {
  let controller: ChatsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ChatsController],
      providers: [
        { provide: ChatsService, useValue: {} },
        { provide: ChatSuggestionService, useValue: {} },
      ],
    }).compile();

    controller = module.get<ChatsController>(ChatsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
