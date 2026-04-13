import { Module } from '@nestjs/common';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'node:path';
import { BotModule } from './core/bot/bot.module';
import { PrismaModule } from './core/prisma/prisma.module';
import { AuthModule } from './core/auth/auth.module';
import { HealthModule } from './core/health/health.module';
import { MessagesModule } from './modules/messages/messages.module';
import { ChatsModule } from './modules/chats/chats.module';

const frontendDist = join(process.cwd(), 'frontend', 'dist');

@Module({
  imports: [
    BotModule,
    PrismaModule,
    AuthModule,
    HealthModule,
    ServeStaticModule.forRoot({
      rootPath: frontendDist,
      exclude: ['/api/{*any}'],
    }),
    MessagesModule,
    ChatsModule,
  ],
})
export class AppModule {}
