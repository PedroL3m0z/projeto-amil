import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'node:path';
import { BotModule } from './core/bot/bot.module';
import { PrismaModule } from './core/prisma/prisma.module';
import { AuthModule } from './core/auth/auth.module';
import { HealthModule } from './core/health/health.module';
import { AiModule } from './modules/ai/ai.module';
import { MessagesModule } from './modules/messages/messages.module';
import { ChatsModule } from './modules/chats/chats.module';

const frontendDist = join(process.cwd(), 'frontend', 'dist');

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env'],
    }),
    BotModule,
    PrismaModule,
    AuthModule,
    HealthModule,
    AiModule,
    MessagesModule,
    ChatsModule,
    ServeStaticModule.forRoot({
      rootPath: frontendDist,
      exclude: ['/api/{*any}'],
      useGlobalPrefix: false,
    }),
  ],
})
export class AppModule {}
