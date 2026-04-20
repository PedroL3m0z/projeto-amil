import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type ChatDocument = HydratedDocument<Chat>;

@Schema({ collection: 'chats', timestamps: false, versionKey: false })
export class Chat {
  @Prop({ required: true, unique: true, index: true })
  chatId: string;

  @Prop({ type: String, default: null })
  name: string | null;

  @Prop({ required: true })
  displayName: string;

  @Prop({ type: String, default: null })
  lastMessage: string | null;

  @Prop({ type: String, default: null, index: true })
  lastMessageAt: string | null;

  @Prop({ type: Boolean, default: null })
  lastMessageFromMe: boolean | null;

  @Prop({ type: String, default: null })
  lastMessageAuthor: string | null;

  @Prop({ type: Number, default: 0 })
  unreadCount: number;
}

export const ChatSchema = SchemaFactory.createForClass(Chat);
