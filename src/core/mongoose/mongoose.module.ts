import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';

@Global()
@Module({
  imports: [
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const uri =
          config.get<string>('MONGO_URI')?.trim() ||
          process.env.MONGO_URI?.trim();

        if (!uri) {
          throw new Error(
            'MONGO_URI não está definida. Configure no .env ou nas variáveis do container.',
          );
        }

        return {
          uri,
        };
      },
    }),
  ],
  exports: [MongooseModule],
})
export class MongooseConfigModule {}
