
import type { NestExpressApplication } from '@nestjs/platform-express';
import {
  ThrottlerGuard,
  ThrottlerModule,
} from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest';

import { configureSecurity } from '../src/common/configure-security';
import { AppLoggerService } from '../src/common/logging/logger.service';
import type { HttpRequestLog } from '../src/common/logging/logging.types';
import { EducationModule } from '../src/education/education.module';
import { HealthModule } from '../src/health/health.module';
import { ResourcesModule } from '../src/resources/resources.module';
import { TreatmentsModule } from '../src/treatments/treatments.module';

class TestLogger extends AppLoggerService {
  readonly entries: HttpRequestLog[] = [];

  override logHttpRequest(entry: HttpRequestLog): void {
    this.entries.push(entry);
  }

  clear(): void {
    this.entries.length = 0;
  }
}

async function createTestApp(
  limit: number,
): Promise<{
  app: NestExpressApplication;
  logger: TestLogger;
}> {
  const logger = new TestLogger();

  const moduleRef = await Test.createTestingModule({
    imports: [
      ThrottlerModule.forRoot([
        {
          ttl: 60000,
          limit,
        },
      ]),
      HealthModule,
      EducationModule,
      TreatmentsModule,
      ResourcesModule,
    ],
    providers: [
      {
        provide: AppLoggerService,
        useValue: logger,
      },
      {
        provide: APP_GUARD,
        useClass: ThrottlerGuard,
      },
    ],
  }).compile();

  const app = moduleRef.createNestApplication<NestExpressApplication>({
    bodyParser: false,
  });

  configureSecurity(app);

  await app.init();

  return { app, logger };
}

function expectRequestId(
  response: {
    headers: Record<string, string>;
    body: {
      error?: {
        requestId?: string;
      };
    };
  },
): string {
  const requestId = response.headers['x-request-id'];

  expect(requestId).toMatch(
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  );

  if (response.body.error) {
    expect(response.body.error.requestId).toBe(requestId);
  }

  return requestId;
}

describe('API-007 HTTP Security (e2e)', () => {
  let app: NestExpressApplication;
  let logger: TestLogger;

  const originalCorsOrigins = process.env.CORS_ORIGINS;
  const originalBodyLimit = process.env.REQUEST_BODY_LIMIT;

  beforeAll(async () => {
    process.env.CORS_ORIGINS =
      'http://localhost:8081,http://localhost:19006';
    process.env.REQUEST_BODY_LIMIT = '100kb';

    const result = await createTestApp(1000);

    app = result.app;
    logger = result.logger;
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }

    if (originalCorsOrigins === undefined) {
      delete process.env.CORS_ORIGINS;
    } else {
      process.env.CORS_ORIGINS = originalCorsOrigins;
    }

    if (originalBodyLimit === undefined) {
      delete process.env.REQUEST_BODY_LIMIT;
    } else {
      process.env.REQUEST_BODY_LIMIT = originalBodyLimit;
    }
  });

  beforeEach(() => {
    logger.clear();
  });

  it('adds Helmet security headers', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/health')
      .expect(200);

    expect(
      response.headers['x-content-type-options'],
    ).toBe('nosniff');

    expect(
      response.headers['x-frame-options'],
    ).toBe('SAMEORIGIN');

    expect(
      response.headers['referrer-policy'],
    ).toBe('no-referrer');

    expect(
      response.headers['content-security-policy'],
    ).toBeDefined();

    expectRequestId(response);
  });

  it('allows configured CORS origins', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/health')
      .set('Origin', 'http://localhost:8081')
      .expect(200);

    expect(
      response.headers['access-control-allow-origin'],
    ).toBe('http://localhost:8081');

    expect(
      response.headers['access-control-expose-headers'],
    ).toContain('X-Request-ID');

    expectRequestId(response);
  });

  it('does not allow unsupported CORS origins', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/health')
      .set('Origin', 'https://unknown-site.example')
      .expect(200);

    expect(
      response.headers['access-control-allow-origin'],
    ).toBeUndefined();

    expectRequestId(response);
  });

  it('handles allowed CORS preflight requests', async () => {
    const response = await request(app.getHttpServer())
      .options('/api/v1/health')
      .set('Origin', 'http://localhost:8081')
      .set('Access-Control-Request-Method', 'GET')
      .set('Access-Control-Request-Headers', 'Content-Type')
      .expect(204);

    expect(
      response.headers['access-control-allow-origin'],
    ).toBe('http://localhost:8081');

    expect(
      response.headers['access-control-allow-methods'],
    ).toContain('GET');

    expect(
      response.headers['access-control-allow-headers'],
    ).toContain('Content-Type');
  });

  it('rejects oversized JSON bodies with HTTP 413', async () => {
    const largeBody = {
      data: 'a'.repeat(150000),
    };

    const response = await request(app.getHttpServer())
      .post('/api/v1/education')
      .set('Content-Type', 'application/json')
      .send(largeBody)
      .expect(413);

    const requestId = expectRequestId(response);

    expect(response.body.error.code).toBe(
      'PAYLOAD_TOO_LARGE',
    );

    expect(response.body.error.status).toBe(413);

    expect(response.body.error.message).toBe(
      'The request body is too large.',
    );

    expect(logger.entries).toHaveLength(1);

    const entry = logger.entries[0];

    expect(entry.requestId).toBe(requestId);
    expect(entry.statusCode).toBe(413);
    expect(entry.method).toBe('POST');
    expect(entry.level).toBe('warn');
    expect(entry.durationMs).toBeGreaterThanOrEqual(0);

    const logs = JSON.stringify(logger.entries);

    expect(logs).not.toContain('a'.repeat(1000));
    expect(logs).not.toContain('"data"');
  });

  it('preserves request IDs for validation errors', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/education?unknownField=test')
      .expect(400);

    const requestId = expectRequestId(response);

    expect(response.body.error.code).toBe(
      'VALIDATION_ERROR',
    );

    expect(logger.entries).toHaveLength(1);
    expect(logger.entries[0].requestId).toBe(requestId);
    expect(logger.entries[0].statusCode).toBe(400);
  });

  it('preserves request IDs for not-found errors', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/education/not-real')
      .expect(404);

    const requestId = expectRequestId(response);

    expect(response.body.error.code).toBe(
      'RESOURCE_NOT_FOUND',
    );

    expect(logger.entries).toHaveLength(1);
    expect(logger.entries[0].requestId).toBe(requestId);
    expect(logger.entries[0].statusCode).toBe(404);
  });

  it('keeps the Health endpoint working', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/health')
      .expect(200);

    expect(response.body.status).toBe('ok');
    expectRequestId(response);
  });

  it.each([
    'education',
    'treatments',
    'resources',
  ])('keeps the %s endpoint working', async (endpoint) => {
    const response = await request(app.getHttpServer())
      .get(`/api/v1/${endpoint}`)
      .expect(200);

    expectRequestId(response);
  });
});

describe('API-007 Rate Limiting (e2e)', () => {
  let app: NestExpressApplication;
  let logger: TestLogger;

  beforeAll(async () => {
    const result = await createTestApp(3);

    app = result.app;
    logger = result.logger;
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('returns HTTP 429 with matching request IDs', async () => {
    logger.clear();

    for (let i = 0; i < 3; i++) {
      await request(app.getHttpServer())
        .get('/api/v1/health')
        .expect(200);
    }

    const response = await request(app.getHttpServer())
      .get('/api/v1/health')
      .expect(429);

    const requestId = expectRequestId(response);

    expect(response.body.error.status).toBe(429);
    expect(response.body.error.code).toBe('HTTP_ERROR');

    expect(response.headers['retry-after']).toBeDefined();

    const matchingLogs = logger.entries.filter(
      (entry) => entry.requestId === requestId,
    );

    expect(matchingLogs).toHaveLength(1);

    expect(matchingLogs[0].statusCode).toBe(429);
    expect(matchingLogs[0].level).toBe('warn');
    expect(matchingLogs[0].method).toBe('GET');
    expect(matchingLogs[0].durationMs).toBeGreaterThanOrEqual(0);
  });
});
