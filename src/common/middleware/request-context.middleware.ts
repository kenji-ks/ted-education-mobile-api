
import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';

import {
  Injectable,
  type NestMiddleware,
} from '@nestjs/common';
import type { NextFunction, Response } from 'express';

import { AppLoggerService } from '../logging/logger.service';
import type { HttpRequestLog } from '../logging/logging.types';
import type { RequestWithContext } from '../types/request-context.types';

@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  constructor(private readonly logger: AppLoggerService) {}

  use(
    req: RequestWithContext,
    res: Response,
    next: NextFunction,
  ): void {
    const requestId = randomUUID();
    const startTime = performance.now();

    // Store the request ID for controllers and exception filters.
    req.requestId = requestId;

    // Return the same request ID to the client.
    res.setHeader('X-Request-ID', requestId);

    let logged = false;

    const logRequest = (
      event: HttpRequestLog['event'],
    ): void => {
      // Ensure each request is logged only once.
      if (logged) {
        return;
      }

      logged = true;

      const durationMs = Number(
        (performance.now() - startTime).toFixed(2),
      );

      const statusCode = res.statusCode;

      const level: HttpRequestLog['level'] =
        statusCode >= 500
          ? 'error'
          : statusCode >= 400
            ? 'warn'
            : 'info';

      const entry: HttpRequestLog = {
        level,
        event,
        requestId,
        method: req.method,
        path: this.getSafePath(req),
        statusCode,
        durationMs,
      };

      this.logger.logHttpRequest(entry);
    };

    // Log successfully completed HTTP responses.
    res.once('finish', () => {
      logRequest('http_request_completed');
    });

    // Log requests whose connections close before completion.
    res.once('close', () => {
      if (!res.writableFinished) {
        logRequest('http_request_aborted');
      }
    });

    next();
  }

  private getSafePath(req: RequestWithContext): string {
    // Use the matched route template instead of the raw URL.
    // This avoids exposing query strings or dynamic path values.
    const routePath: unknown = req.route?.path;

    // NestJS/Express may use wildcard routes such as "*path"
    // for requests that do not match any defined endpoint.
    if (
      typeof routePath !== 'string' ||
      routePath.includes('*')
    ) {
      return '[unmatched]';
    }

    return routePath;
  }
}
