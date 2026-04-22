import { Module } from '@nestjs/common';
import { R2Module } from '../r2/r2.module';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';

@Module({
  imports: [R2Module],
  controllers: [HealthController],
  providers: [HealthService],
})
export class HealthModule {}
