
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';

import { AppModule } from './app.module';
import { configureSecurity } from './common/configure-security';
import { configureSwagger } from './common/configure-swagger';
import { ObserveInstrument } from './observe';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(
    AppModule,
    {
      instrument: ObserveInstrument,
      bodyParser: false,
    },
  );

  // Preserve existing security, logging, and validation.
  configureSecurity(app);

  // Configure interactive OpenAPI documentation.
  configureSwagger(app);

  await app.listen(
    process.env.PORT ?? 3000,
    '0.0.0.0',
  );
}

bootstrap();
