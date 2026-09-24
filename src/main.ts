import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module';
import { ObserveInstrument } from './observe';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    instrument: ObserveInstrument,
  });

  app.setGlobalPrefix('api/v1');

  // Allow mobile and web clients to access the API during development.
  app.enableCors();

  await app.listen(process.env.PORT ?? 3000, '0.0.0.0');
}

bootstrap();