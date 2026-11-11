
import type { INestApplication } from '@nestjs/common';
import {
  DocumentBuilder,
  SwaggerModule,
} from '@nestjs/swagger';

export function configureSwagger(
  app: INestApplication,
): void {
  const config = new DocumentBuilder()
    .setTitle('TED Education API')
    .setDescription(
      'REST API for the Thyroid Eye Disease Education App. ' +
      'Public API endpoints use the /api/v1 prefix.',
    )
    .setVersion('1.0')
    .build();

  const documentFactory = () =>
    SwaggerModule.createDocument(app, config);

  SwaggerModule.setup(
    'api/docs',
    app,
    documentFactory,
    {
      useGlobalPrefix: false,
    },
  );
}
