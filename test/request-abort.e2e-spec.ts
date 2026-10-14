import {
  Controller,
  Get,
  type INestApplication,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { request as httpRequest, type ClientRequest } from 'node:http';
import type { Server } from 'node:http';
import {
  afterAll,
  beforeAll,
  describe,
  expect,
  it,
} from 'vitest';

import { configureHttp } from '../src/common/configure-http';
import { AppLoggerService } from '../src/common/logging/logger.service';
import type { HttpRequestLog } from '../src/common/logging/logging.types';
import { RequestContextMiddleware } from '../src/common/middleware/request-context.middleware';

@Controller('test-abort')
class TestAbortController {
  static onStarted: (() => void) | undefined;
  static release: (() => void) | undefined;

  @Get('slow')
  slow(): Promise<{ status: string }> {
    TestAbortController.onStarted?.();

    return new Promise((resolve) => {
      TestAbortController.release = () => {
        resolve({ status: 'ok' });
      };
    });
  }
}

class TestLogger extends AppLoggerService {
  readonly entries: HttpRequestLog[] = [];

  onEntry: ((entry: HttpRequestLog) => void) | undefined;

  override logHttpRequest(entry: HttpRequestLog): void {
    this.entries.push(entry);
    this.onEntry?.(entry);
  }
}

describe('API-006 Aborted Request (e2e)', () => {
  let app: INestApplication;
  let logger: TestLogger;
  let port: number;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [TestAbortController],
    }).compile();

    app = moduleRef.createNestApplication();

    logger = new TestLogger();

    const middleware = new RequestContextMiddleware(logger);
    app.use(middleware.use.bind(middleware));

    configureHttp(app);

    await app.listen(0, '127.0.0.1');

    const server = app.getHttpServer() as Server;
    const address = server.address();

    if (!address || typeof address === 'string') {
      throw new Error('Unable to determine test server port.');
    }

    port = address.port;
  });

  afterAll(async () => {
    TestAbortController.release?.();
    TestAbortController.onStarted = undefined;
    TestAbortController.release = undefined;
    logger.onEntry = undefined;

    await app.close();
  });

  it(
    'logs an aborted request exactly once',
    async () => {
      logger.entries.length = 0;

      const requestStarted = new Promise<void>((resolve) => {
        TestAbortController.onStarted = resolve;
      });

      const requestLogged = new Promise<HttpRequestLog>((resolve) => {
        logger.onEntry = resolve;
      });

      let client: ClientRequest | undefined;

      try {
        client = httpRequest({
          hostname: '127.0.0.1',
          port,
          path: '/api/v1/test-abort/slow',
          method: 'GET',
          agent: false,
        });

        // Aborting an HTTP request may cause ECONNRESET.
        // This is expected during this test.
        client.on('error', () => {
          // Expected connection termination.
        });

        client.end();

        // Ensure the controller received the request
        // before closing the client connection.
        await requestStarted;

        client.destroy();

        // Wait until the middleware records the close event.
        const entry = await requestLogged;

        expect(logger.entries).toHaveLength(1);

        expect(entry.event).toBe('http_request_aborted');
        expect(entry.method).toBe('GET');
        expect(entry.path).toBe('/api/v1/test-abort/slow');

        expect(entry.requestId).toMatch(
          /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
        );

        expect(entry.durationMs).toEqual(
          expect.any(Number),
        );
        expect(entry.durationMs).toBeGreaterThanOrEqual(0);

        // Allow the controller to finish its pending work.
        TestAbortController.release?.();

        expect(logger.entries).toHaveLength(1);
      } finally {
        client?.destroy();
        TestAbortController.release?.();

        TestAbortController.onStarted = undefined;
        TestAbortController.release = undefined;
        logger.onEntry = undefined;
      }
    },
    10000,
  );
});
