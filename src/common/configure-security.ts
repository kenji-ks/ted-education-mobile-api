import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';

import { createCorsConfig } from './config/cors.config';
import { configureHttp } from './configure-http';
import { AppLoggerService } from './logging/logger.service';
import { RequestContextMiddleware } from './middleware/request-context.middleware';

/**
 * Configures shared HTTP security and request handling.
 *
 * Request tracking must run before body parsing so rejected
 * requests can retain their request IDs.
 */
export function configureSecurity(
  app: NestExpressApplication,
): void {
  // Enable standard HTTP security headers.
  app.use(helmet());

  // Generate request IDs before body parsing.
  const logger = app.get(AppLoggerService);
  const requestContext = new RequestContextMiddleware(logger);

  app.use(requestContext.use.bind(requestContext));

  // Preserve validation and standardized error handling.
  configureHttp(app);

  // Restrict browser origins using the configured allowlist.
  app.enableCors(createCorsConfig());

  // Limit JSON and URL-encoded request bodies.
  const bodyLimit = process.env.REQUEST_BODY_LIMIT ?? '100kb';

  app.useBodyParser('json', {
    limit: bodyLimit,
  });

  app.useBodyParser('urlencoded', {
    limit: bodyLimit,
    extended: true,
  });
}
