import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { AnyBulkWriteOperation, Model } from 'mongoose';
import { Chat, ChatDocument } from '../schemas/chat.schema';

/**
 * Repository do aggregate `Chat` — único ponto de acesso à collection `chats`.
 */
@Injectable()
export class ChatRepository {
  constructor(
    @InjectModel(Chat.name) private readonly chatModel: Model<ChatDocument>,
  ) {}

  findAll() {
    return this.chatModel
      .find({}, { _id: 0 })
      .sort({ lastMessageAt: -1 })
      .lean()
      .exec();
  }

  bulkUpsert(ops: AnyBulkWriteOperation<ChatDocument>[]): Promise<unknown> {
    if (ops.length === 0) return Promise.resolve(null);
    return this.chatModel.bulkWrite(ops, { ordered: false });
  }
}
