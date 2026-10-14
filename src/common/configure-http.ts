import {
  BadRequestException,
  ValidationPipe,
  type INestApplication,
} from '@nestjs/common';

import { HttpExceptionFilter } from './filters/http-exception.filter';

export function configureHttp(app: INestApplication): void {
  app.setGlobalPrefix('api/v1');

  app.useGlobalFilters(new HttpExceptionFilter());

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,

      exceptionFactory: (errors) =>
        new BadRequestException({
          code: 'VALIDATION_ERROR',
          message: 'Invalid request parameters.',
          details: errors.map((error) => ({
            field: error.property,
            constraints: Object.values(error.constraints ?? {}),
          })),
        }),
    }),
  );
}
