import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { AnyBulkWriteOperation, Model } from 'mongoose';
import { CHAT_AUDIO_PLACEHOLDER } from '../audio/chat-audio.constants';
import { Message, MessageDocument } from '../schemas/message.schema';

/**
 * Repository do aggregate `Message` — único ponto de acesso à collection `messages`.
 *
 * Mesmo as queries/updates relacionadas a áudio (attachment) ficam aqui: áudio
 * é um *value object* dentro de `Message`, não um aggregate próprio. Quebrar
 * em "AudioRepository" violaria a regra "um repository por aggregate root".
 */
@Injectable()
export class MessageRepository {
  constructor(
    @InjectModel(Message.name)
    private readonly messageModel: Model<MessageDocument>,
  ) {}

  findByChat(chatId: string) {
    return this.messageModel
      .find({ chatId }, { _id: 0 })
      .sort({ at: 1 })
      .lean()
      .exec();
  }

  findAttachment(chatId: string, messageId: string) {
    return this.messageModel
      .findOne({ chatId, messageId }, { attachment: 1, text: 1 })
      .lean()
      .exec();
  }

  /** Mensagens de áudio ainda com placeholder e com ficheiro no R2. */
  findPendingAudios(chatIds: string[]) {
    return this.messageModel
      .find({
        chatId: { $in: chatIds },
        fromMe: false,
        $or: [
          { text: CHAT_AUDIO_PLACEHOLDER },
          { text: { $regex: /^\s*\[Áudio\]\s*$/ } },
        ],
        'attachment.storageKey': { $exists: true, $nin: [null, ''] },
      })
      .lean()
      .exec();
  }

  updateText(chatId: string, messageId: string, text: string) {
    return this.messageModel
      .updateOne({ chatId, messageId }, { $set: { text } })
      .exec();
  }

  upsertAudioAttachment(params: {
    chatId: string;
    messageId: string;
    mimeType: string;
    ptt?: boolean;
    durationSec?: number;
    storageKey: string;
  }) {
    return this.messageModel
      .updateOne(
        { chatId: params.chatId, messageId: params.messageId },
        {
          $set: {
            'attachment.kind': 'audio',
            'attachment.mimeType': params.mimeType,
            'attachment.ptt': params.ptt,
            'attachment.durationSec': params.durationSec,
            'attachment.storageKey': params.storageKey,
          },
        },
      )
      .exec();
  }

  clearStorageKeys(keys: string[]) {
    return this.messageModel
      .updateMany(
        { 'attachment.storageKey': { $in: keys } },
        { $unset: { 'attachment.storageKey': 1 } },
      )
      .exec();
  }

  bulkUpsert(ops: AnyBulkWriteOperation<MessageDocument>[]): Promise<unknown> {
    if (ops.length === 0) return Promise.resolve(null);
    return this.messageModel.bulkWrite(ops, { ordered: false });
  }
}
