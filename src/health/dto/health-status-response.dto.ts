
import { ApiProperty } from '@nestjs/swagger';

import type { HealthStatus } from '../health.types';

export class HealthStatusResponseDto implements HealthStatus {
  @ApiProperty({
    description: 'Current backend service status.',
    enum: ['ok'],
    example: 'ok',
  })
  status!: 'ok';

  @ApiProperty({
    description: 'Name of the backend service.',
    example: 'TED Education API',
  })
  service!: string;

  @ApiProperty({
    description: 'Time when the health check was performed.',
    type: String,
    format: 'date-time',
    example: '2026-10-20T02:00:00.000Z',
  })
  timestamp!: string;
}
