
import { Controller, Get } from '@nestjs/common';
import {
  ApiInternalServerErrorResponse,
  ApiOkResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

import { ApiErrorResponseDto } from '../common/dto/api-error-response.dto';
import { HealthStatusResponseDto } from './dto/health-status-response.dto';
import { HealthService } from './health.service';
import type { HealthStatus } from './health.types';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly healthService: HealthService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Check backend service health',
    description:
      'Returns the current operational status of the ' +
      'TED Education API. This endpoint is used for ' +
      'backend service monitoring and does not provide ' +
      'patient health information.',
  })
  @ApiOkResponse({
    description: 'Backend service is operational.',
    type: HealthStatusResponseDto,
  })
  @ApiResponse({
    status: 429,
    description: 'Rate limit exceeded.',
    type: ApiErrorResponseDto,
  })
  @ApiInternalServerErrorResponse({
    description: 'An unexpected server error occurred.',
    type: ApiErrorResponseDto,
  })
  getHealth(): HealthStatus {
    return this.healthService.getHealth();
  }
}
