import {
  BadRequestException,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  HttpException,
  UnauthorizedException,
  type INestApplication,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import {
  afterAll,
  beforeAll,
  describe,
  expect,
  it,
} from 'vitest';

import { configureHttp } from '../src/common/configure-http';
import { EducationModule } from '../src/education/education.module';
import { registerRequestContext } from './helpers/register-request-context';

@Controller('test-errors')
class TestErrorController {
  @Get('bad-request')
  badRequest() {
    throw new BadRequestException('Test bad request');
  }

  @Get('unauthorized')
  unauthorized() {
    throw new UnauthorizedException();
  }

  @Get('forbidden')
  forbidden() {
    throw new ForbiddenException();
  }

  @Get('conflict')
  conflict() {
    throw new ConflictException();
  }

  @Get('unexpected')
  unexpected() {
    throw new Error('SECRET_INTERNAL_DATABASE_ERROR');
  }

  @Get('unhandled-status')
  unhandledStatus() {
    throw new HttpException('Test error', 429);
  }

  @Get('service-unavailable')
  serviceUnavailable() {
    throw new HttpException(
      'INTERNAL_DATABASE_CONNECTION_FAILED',
      503,
    );
  }
}

describe('API-005 Global Exception Handling (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [EducationModule],
      controllers: [TestErrorController],
    }).compile();

    app = moduleRef.createNestApplication();

    registerRequestContext(app);
    configureHttp(app);

    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns VALIDATION_ERROR for invalid input', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/education?language=invalid')
      .expect(400);

    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(response.body.error.status).toBe(400);
    expect(response.body.error.path).toBe('/api/v1/education');
    expect(response.body.error.timestamp).toBeDefined();

    expect(response.body.error.requestId).toBe(
      response.headers['x-request-id'],
    );
  });

  it('returns BAD_REQUEST for ordinary bad requests', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/test-errors/bad-request')
      .expect(400);

    expect(response.body.error.code).toBe('BAD_REQUEST');

    expect(response.body.error.requestId).toBe(
      response.headers['x-request-id'],
    );
  });

  it('preserves 401 Unauthorized', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/test-errors/unauthorized')
      .expect(401);

    expect(response.body.error.code).toBe('UNAUTHORIZED');

    expect(response.body.error.requestId).toBe(
      response.headers['x-request-id'],
    );
  });

  it('preserves 403 Forbidden', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/test-errors/forbidden')
      .expect(403);

    expect(response.body.error.code).toBe('FORBIDDEN');

    expect(response.body.error.requestId).toBe(
      response.headers['x-request-id'],
    );
  });

  it('preserves 404 Not Found', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/education/not-real')
      .expect(404);

    expect(response.body.error.code).toBe(
      'RESOURCE_NOT_FOUND',
    );

    expect(response.body.error.requestId).toBe(
      response.headers['x-request-id'],
    );
  });

  it('preserves 409 Conflict', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/test-errors/conflict')
      .expect(409);

    expect(response.body.error.code).toBe('CONFLICT');

    expect(response.body.error.requestId).toBe(
      response.headers['x-request-id'],
    );
  });

  it('handles other HTTP status codes safely', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/test-errors/unhandled-status')
      .expect(429);

    expect(response.body.error.code).toBe('HTTP_ERROR');
    expect(response.body.error.status).toBe(429);

    expect(response.body.error.requestId).toBe(
      response.headers['x-request-id'],
    );
  });

  it('hides internal error details for unexpected errors', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/test-errors/unexpected')
      .expect(500);

    expect(response.body.error.code).toBe(
      'INTERNAL_SERVER_ERROR',
    );
    expect(response.body.error.status).toBe(500);
    expect(response.body.error.message).toBe(
      'An internal error occurred.',
    );

    expect(response.body.error.requestId).toBe(
      response.headers['x-request-id'],
    );

    const body = JSON.stringify(response.body);

    expect(body).not.toContain('SECRET_INTERNAL_DATABASE_ERROR');
    expect(body).not.toContain('stack');
    expect(body).not.toContain('node_modules');
  });

  it('preserves 503 without exposing internal details', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/test-errors/service-unavailable')
      .expect(503);

    expect(response.body.error.code).toBe(
      'INTERNAL_SERVER_ERROR',
    );
    expect(response.body.error.status).toBe(503);
    expect(response.body.error.message).toBe(
      'An internal error occurred.',
    );

    expect(response.body.error.requestId).toBe(
      response.headers['x-request-id'],
    );

    const body = JSON.stringify(response.body);

    expect(body).not.toContain(
      'INTERNAL_DATABASE_CONNECTION_FAILED',
    );
    expect(body).not.toContain('stack');
    expect(body).not.toContain('node_modules');
  });

  it('returns the standard error response structure', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/education/not-real')
      .expect(404);

    expect(response.body).toEqual({
      error: {
        code: 'RESOURCE_NOT_FOUND',
        message: 'The requested resource was not found.',
        status: 404,
        path: '/api/v1/education/not-real',
        timestamp: expect.any(String),
        requestId: expect.any(String),
      },
    });

    expect(response.body.error.requestId).toBe(
      response.headers['x-request-id'],
    );
  });

  it('returns a valid ISO timestamp', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/test-errors/bad-request')
      .expect(400);

    const timestamp: string = response.body.error.timestamp;

    expect(typeof timestamp).toBe('string');
    expect(new Date(timestamp).toISOString()).toBe(timestamp);

    expect(response.body.error.requestId).toBe(
      response.headers['x-request-id'],
    );
  });

  it('does not expose query parameters in the error path', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/education?language=invalid&search=private-value')
      .expect(400);

    expect(response.body.error.path).toBe('/api/v1/education');
    expect(response.body.error.path).not.toContain('private-value');

    expect(response.body.error.requestId).toBe(
      response.headers['x-request-id'],
    );
  });
});
