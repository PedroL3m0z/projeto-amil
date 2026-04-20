import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import type { BotMessageStatus } from '../../../core/bot/bot.types';

export type MessageDocument = HydratedDocument<Message>;

@Schema({ _id: false, versionKey: false })
export class MessageAttachment {
  @Prop({ type: String, enum: ['audio'], required: true })
  kind: 'audio';

  @Prop({ type: String, required: true })
  mimeType: string;

  @Prop({ type: Boolean })
  ptt?: boolean;

  @Prop({ type: Number })
  durationSec?: number;

  /** Chave do objeto no R2; só presente quando o upload terminou. */
  @Prop({ type: String })
  storageKey?: string;
}

const MessageAttachmentSchema = SchemaFactory.createForClass(MessageAttachment);

@Schema({ collection: 'messages', timestamps: false, versionKey: false })
export class Message {
  @Prop({ required: true })
  messageId: string;

  @Prop({ required: true, index: true })
  chatId: string;

  @Prop({ required: true, index: true })
  at: string;

  @Prop({ type: String, default: '' })
  text: string;

  @Prop({ required: true })
  fromMe: boolean;

  @Prop({ type: String, enum: ['sent', 'delivered', 'read'], required: false })
  status?: BotMessageStatus;

  @Prop({ type: MessageAttachmentSchema, required: false })
  attachment?: MessageAttachment;
}

export const MessageSchema = SchemaFactory.createForClass(Message);

MessageSchema.index({ chatId: 1, messageId: 1 }, { unique: true });
MessageSchema.index({ chatId: 1, at: 1 });
