
import {
  BadRequestException,
  Controller,
  Get,
  Query,
} from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';

import { IsIn } from 'class-validator';
import request from 'supertest';

import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import { configureHttp } from '../../src/common/configure-http';
import { AppLoggerService } from '../../src/common/logging/logger.service';
import type { HttpRequestLog } from '../../src/common/logging/logging.types';
import { RequestContextMiddleware } from '../../src/common/middleware/request-context.middleware';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Test DTO used to verify the real global ValidationPipe.
 */
class IntegrationQueryDto {
  @IsIn(['en', 'zh'])
  language!: string;
}

/**
 * A minimal controller for exercising the HTTP pipeline.
 * No business modules or database connections are required.
 */
@Controller('integration-test')
class IntegrationTestController {
  @Get('success')
  success(): { status: string } {
    return { status: 'ok' };
  }

  @Get('validated')
  validated(
    @Query() query: IntegrationQueryDto,
  ): { language: string } {
    return {
      language: query.language,
    };
  }

  @Get('failure')
  failure(): never {
    throw new BadRequestException(
      'SECRET_INTERNAL_ERROR_DETAILS',
    );
  }
}

describe('HTTP Request Pipeline (integration)', () => {
  let app: INestApplication;
  let entries: HttpRequestLog[];

  const logHttpRequest = vi.fn(
    (entry: HttpRequestLog): void => {
      entries.push(entry);
    },
  );

  beforeAll(async () => {
    entries = [];

    const moduleRef = await Test.createTestingModule({
      controllers: [IntegrationTestController],
    }).compile();

    const expressApp =
      moduleRef.createNestApplication<NestExpressApplication>();

    app = expressApp;

    // Use the real middleware with an observable logger.
    const logger = {
      logHttpRequest,
    } as unknown as AppLoggerService;

    const middleware = new RequestContextMiddleware(logger);

    // Register request context before route handling.
    expressApp.use(middleware.use.bind(middleware));

    // Register the production global prefix, ValidationPipe,
    // and HttpExceptionFilter.
    configureHttp(expressApp);

    await expressApp.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  beforeEach(() => {
    entries.length = 0;
    logHttpRequest.mockClear();
  });

  it('connects middleware, controller, and logger for successful requests', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/integration-test/success')
      .expect(200);

    const requestId = response.headers[
      'x-request-id'
    ] as string;

    expect(requestId).toMatch(UUID_PATTERN);

    expect(response.body).toEqual({
      status: 'ok',
    });

    expect(logHttpRequest).toHaveBeenCalledTimes(1);
    expect(entries).toHaveLength(1);

    expect(entries[0]).toMatchObject({
      level: 'info',
      event: 'http_request_completed',
      method: 'GET',
      statusCode: 200,
      requestId,
    });

    expect(entries[0].path).toMatch(/success$/);
  });

  it('connects ValidationPipe, ExceptionFilter, and Logger using one request ID', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/integration-test/validated')
      .query({
        language: 'invalid-language',
      })
      .expect(400);

    const requestId = response.headers[
      'x-request-id'
    ] as string;

    expect(requestId).toMatch(UUID_PATTERN);

    expect(response.body.error).toMatchObject({
      code: 'VALIDATION_ERROR',
      message: 'Invalid request parameters.',
      status: 400,
      path: '/api/v1/integration-test/validated',
      requestId,
    });

    expect(logHttpRequest).toHaveBeenCalledTimes(1);

    expect(entries[0]).toMatchObject({
      level: 'warn',
      event: 'http_request_completed',
      statusCode: 400,
      requestId,
    });
  });

  it('allows valid input through the global ValidationPipe', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/integration-test/validated')
      .query({
        language: 'en',
      })
      .expect(200);

    expect(response.body).toEqual({
      language: 'en',
    });

    expect(entries).toHaveLength(1);

    expect(entries[0]).toMatchObject({
      level: 'info',
      statusCode: 200,
      requestId: response.headers['x-request-id'],
    });
  });

  it('sanitizes HTTP exception messages without breaking request tracing', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/integration-test/failure')
      .expect(400);

    const requestId = response.headers[
      'x-request-id'
    ] as string;

    expect(response.body.error).toMatchObject({
      code: 'BAD_REQUEST',
      message: 'The request is invalid.',
      status: 400,
      requestId,
    });

    expect(entries).toHaveLength(1);
    expect(entries[0].requestId).toBe(requestId);

    const serialized = JSON.stringify({
      response: response.body,
      logs: entries,
    });

    expect(serialized).not.toContain(
      'SECRET_INTERNAL_ERROR_DETAILS',
    );
  });

  it('does not expose unmatched request paths in structured logs', async () => {
    const secret = 'SECRET_PATIENT_IDENTIFIER';

    const response = await request(app.getHttpServer())
      .get(`/api/v1/${secret}`)
      .expect(404);

    const requestId = response.headers[
      'x-request-id'
    ] as string;

    expect(response.body.error).toMatchObject({
      code: 'RESOURCE_NOT_FOUND',
      status: 404,
      requestId,
    });

    expect(entries).toHaveLength(1);

    expect(entries[0]).toMatchObject({
      level: 'warn',
      statusCode: 404,
      requestId,
      path: '[unmatched]',
    });

    expect(JSON.stringify(entries)).not.toContain(secret);
  });

  it('keeps request IDs independent and excludes query secrets from logs', async () => {
    const secret = 'SECRET_QUERY_TOKEN';

    const first = await request(app.getHttpServer())
      .get('/api/v1/integration-test/success')
      .query({
        token: secret,
      })
      .expect(200);

    const second = await request(app.getHttpServer())
      .get('/api/v1/integration-test/success')
      .expect(200);

    const firstId = first.headers[
      'x-request-id'
    ] as string;

    const secondId = second.headers[
      'x-request-id'
    ] as string;

    expect(firstId).toMatch(UUID_PATTERN);
    expect(secondId).toMatch(UUID_PATTERN);
    expect(firstId).not.toBe(secondId);

    expect(logHttpRequest).toHaveBeenCalledTimes(2);
    expect(entries).toHaveLength(2);

    expect(entries[0].requestId).toBe(firstId);
    expect(entries[1].requestId).toBe(secondId);

    expect(JSON.stringify(entries)).not.toContain(secret);
  });
});
