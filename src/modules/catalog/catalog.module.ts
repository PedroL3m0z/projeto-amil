import { Module } from '@nestjs/common';
import { PlanCatalogService } from './plan-catalog.service';

@Module({
  providers: [PlanCatalogService],
  exports: [PlanCatalogService],
})
export class CatalogModule {}
