
import { ApiProperty } from '@nestjs/swagger';

export class ApiErrorDetailsDto {
  @ApiProperty({
    description: 'Machine-readable API error code.',
    enum: [
      'VALIDATION_ERROR',
      'BAD_REQUEST',
      'RESOURCE_NOT_FOUND',
      'UNAUTHORIZED',
      'FORBIDDEN',
      'CONFLICT',
      'PAYLOAD_TOO_LARGE',
      'HTTP_ERROR',
      'INTERNAL_SERVER_ERROR',
    ],
    example: 'VALIDATION_ERROR',
  })
  code!: string;

  @ApiProperty({
    description: 'Human-readable error message.',
    example: 'Invalid request parameters.',
  })
  message!: string;

  @ApiProperty({
    description: 'HTTP status code.',
    type: Number,
    example: 400,
  })
  status!: number;

  @ApiProperty({
    description: 'Request path where the error occurred.',
    example: '/api/v1/education',
  })
  path!: string;

  @ApiProperty({
    description: 'Timestamp when the error occurred.',
    type: String,
    format: 'date-time',
    example: '2026-10-20T02:00:00.000Z',
  })
  timestamp!: string;

  @ApiProperty({
    description: 'Unique request identifier for tracing.',
    example: 'ed79772a-dca5-4877-890c-1ccca8c5f77c',
  })
  requestId!: string;
}

export class ApiErrorResponseDto {
  @ApiProperty({
    description: 'Standard API error details.',
    type: () => ApiErrorDetailsDto,
  })
  error!: ApiErrorDetailsDto;
}
