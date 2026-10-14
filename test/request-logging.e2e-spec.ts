import {
  Controller,
  Get,
  type INestApplication,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest';

import { configureHttp } from '../src/common/configure-http';
import { AppLoggerService } from '../src/common/logging/logger.service';
import type { HttpRequestLog } from '../src/common/logging/logging.types';
import { RequestContextMiddleware } from '../src/common/middleware/request-context.middleware';
import { EducationModule } from '../src/education/education.module';
import { HealthModule } from '../src/health/health.module';

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

@Controller('test-logging')
class TestLoggingController {
  @Get('unexpected')
  unexpected(): never {
    throw new Error('SECRET_INTERNAL_DATABASE_ERROR');
  }

  @Get('slow')
  async slow(): Promise<{ status: string }> {
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 2000);
    });

    return { status: 'ok' };
  }
}

class TestLogger extends AppLoggerService {
  readonly entries: HttpRequestLog[] = [];

  override logHttpRequest(entry: HttpRequestLog): void {
    this.entries.push(entry);
  }

  clear(): void {
    this.entries.length = 0;
  }
}

describe('API-006 Request Logging (e2e)', () => {
  let app: INestApplication<App>;
  let logger: TestLogger;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [HealthModule, EducationModule],
      controllers: [TestLoggingController],
    }).compile();

    app = moduleRef.createNestApplication();

    logger = new TestLogger();

    const middleware = new RequestContextMiddleware(logger);

    app.use(middleware.use.bind(middleware));

    configureHttp(app);

    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    logger.clear();
  });

  function expectSingleLog(
    requestId: string,
    statusCode: number,
    path: string,
  ): HttpRequestLog {
    expect(logger.entries).toHaveLength(1);

    const entry = logger.entries[0];

    expect(entry.requestId).toBe(requestId);
    expect(entry.method).toBe('GET');
    expect(entry.path).toBe(path);
    expect(entry.statusCode).toBe(statusCode);
    expect(entry.event).toBe('http_request_completed');
    expect(entry.durationMs).toEqual(expect.any(Number));
    expect(entry.durationMs).toBeGreaterThanOrEqual(0);

    return entry;
  }

  it('tracks successful health requests', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/health')
      .expect(200);

    const requestId: string = response.headers['x-request-id'];

    expect(isUuid(requestId)).toBe(true);
    expect(response.body.status).toBe('ok');

    const entry = expectSingleLog(
      requestId,
      200,
      '/api/v1/health',
    );

    expect(entry.level).toBe('info');
  });

  it('tracks validation failures', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/education?unknownField=test')
      .expect(400);

    const requestId: string = response.headers['x-request-id'];

    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(response.body.error.requestId).toBe(requestId);

    const entry = expectSingleLog(
      requestId,
      400,
      '/api/v1/education',
    );

    expect(entry.level).toBe('warn');
  });

  it('tracks not-found errors', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/education/not-real')
      .expect(404);

    const requestId: string = response.headers['x-request-id'];

    expect(response.body.error.code).toBe(
      'RESOURCE_NOT_FOUND',
    );
    expect(response.body.error.requestId).toBe(requestId);

    const entry = expectSingleLog(
      requestId,
      404,
      '/api/v1/education/:id',
    );

    expect(entry.level).toBe('warn');
  });

  it('tracks internal server errors safely', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/test-logging/unexpected')
      .expect(500);

    const requestId: string = response.headers['x-request-id'];

    expect(response.body.error.code).toBe(
      'INTERNAL_SERVER_ERROR',
    );
    expect(response.body.error.requestId).toBe(requestId);

    const entry = expectSingleLog(
      requestId,
      500,
      '/api/v1/test-logging/unexpected',
    );

    expect(entry.level).toBe('error');

    expect(JSON.stringify(response.body)).not.toContain(
      'SECRET_INTERNAL_DATABASE_ERROR',
    );

    expect(JSON.stringify(logger.entries)).not.toContain(
      'SECRET_INTERNAL_DATABASE_ERROR',
    );
  });

  it('generates unique IDs for separate requests', async () => {
    const first = await request(app.getHttpServer())
      .get('/api/v1/health')
      .expect(200);

    const second = await request(app.getHttpServer())
      .get('/api/v1/health')
      .expect(200);

    const firstId: string = first.headers['x-request-id'];
    const secondId: string = second.headers['x-request-id'];

    expect(isUuid(firstId)).toBe(true);
    expect(isUuid(secondId)).toBe(true);
    expect(firstId).not.toBe(secondId);

    expect(logger.entries).toHaveLength(2);
    expect(logger.entries[0].requestId).toBe(firstId);
    expect(logger.entries[1].requestId).toBe(secondId);
  });

  it('does not trust client-supplied request IDs', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/health')
      .set('X-Request-ID', 'fake-client-id')
      .expect(200);

    const requestId: string = response.headers['x-request-id'];

    expect(isUuid(requestId)).toBe(true);
    expect(requestId).not.toBe('fake-client-id');

    expectSingleLog(
      requestId,
      200,
      '/api/v1/health',
    );
  });

  it('does not log sensitive headers or query values', async () => {
    const token = 'SECRET_BEARER_TOKEN_123';
    const cookie = 'SECRET_SESSION_COOKIE_456';
    const apiKey = 'SECRET_API_KEY_789';
    const queryValue = 'SECRET_PRIVATE_QUERY_999';

    const response = await request(app.getHttpServer())
      .get('/api/v1/health')
      .query({ privateValue: queryValue })
      .set('Authorization', `Bearer ${token}`)
      .set('Cookie', `session=${cookie}`)
      .set('X-API-Key', apiKey)
      .expect(200);

    expectSingleLog(
      response.headers['x-request-id'],
      200,
      '/api/v1/health',
    );

    const logs = JSON.stringify(logger.entries);

    expect(logs).not.toContain(token);
    expect(logs).not.toContain(cookie);
    expect(logs).not.toContain(apiKey);
    expect(logs).not.toContain(queryValue);

    expect(logs).not.toContain('Authorization');
    expect(logs).not.toContain('Cookie');
    expect(logs).not.toContain('X-API-Key');
  });

  it('does not log sensitive dynamic path values', async () => {
    const privateId = 'SECRET_PRIVATE_PATIENT_ID';

    const response = await request(app.getHttpServer())
      .get(`/api/v1/education/${privateId}`)
      .expect(404);

    expectSingleLog(
      response.headers['x-request-id'],
      404,
      '/api/v1/education/:id',
    );

    expect(JSON.stringify(logger.entries)).not.toContain(
      privateId,
    );
  });

  it('does not expose unmatched paths in logs', async () => {
    const privatePath = 'SECRET_UNKNOWN_PATH_123';

    const response = await request(app.getHttpServer())
      .get(`/api/v1/${privatePath}`)
      .expect(404);

    const requestId: string = response.headers['x-request-id'];

    expect(logger.entries).toHaveLength(1);
    expect(logger.entries[0].requestId).toBe(requestId);
    expect(logger.entries[0].statusCode).toBe(404);
    expect(logger.entries[0].path).toBe('[unmatched]');

    expect(JSON.stringify(logger.entries)).not.toContain(
      privatePath,
    );
  });
});
