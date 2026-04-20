import { S3Client } from '@aws-sdk/client-s3';
import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { R2ConfigService, type R2Config } from './r2-config.service';
import { R2_CLIENT, R2_CONFIG } from './r2.constants';
import { R2Service } from './r2.service';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    R2ConfigService,
    {
      provide: R2_CONFIG,
      inject: [R2ConfigService],
      useFactory: (cfg: R2ConfigService): R2Config | null => cfg.load(),
    },
    {
      provide: R2_CLIENT,
      inject: [R2_CONFIG],
      useFactory: (config: R2Config | null): S3Client | null =>
        config
          ? new S3Client({
              region: 'auto',
              endpoint: config.endpoint,
              credentials: {
                accessKeyId: config.accessKeyId,
                secretAccessKey: config.secretAccessKey,
              },
            })
          : null,
    },
    R2Service,
  ],
  exports: [R2Service],
})
export class R2Module {}
