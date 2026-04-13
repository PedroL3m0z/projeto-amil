import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/public.decorator';
import { HealthService } from './health.service';

@Controller('health')
@ApiTags('Health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Verifica saúde da API e dependências externas.' })
  @ApiOkResponse({
    description: 'Status de saúde.',
    schema: {
      example: {
        up: true,
        timestamp: '2026-04-13T14:00:00.000Z',
        dependencies: {
          postgres: { up: true, host: 'localhost', port: 5432 },
          redis: { up: true, host: 'localhost', port: 6379 },
        },
      },
    },
  })
  async getHealth() {
    return this.healthService.check();
  }
}
