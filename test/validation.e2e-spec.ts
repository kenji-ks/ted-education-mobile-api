import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import {
  beforeAll,
  afterAll,
  describe,
  expect,
  it,
} from 'vitest';

import { configureHttp } from '../src/common/configure-http';
import { EducationModule } from '../src/education/education.module';
import { HealthModule } from '../src/health/health.module';
import { ResourcesModule } from '../src/resources/resources.module';
import { TreatmentsModule } from '../src/treatments/treatments.module';
import { registerRequestContext } from './helpers/register-request-context';

describe('API-004 Request Validation (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        HealthModule,
        EducationModule,
        TreatmentsModule,
        ResourcesModule,
      ],
    }).compile();

    app = moduleRef.createNestApplication();

    registerRequestContext(app);
    configureHttp(app);

    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  const collections = [
    'education',
    'treatments',
    'resources',
  ];

  describe.each(collections)('%s collection', (endpoint) => {
    it('accepts requests without query parameters', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/${endpoint}`)
        .expect(200);

      expect(response.headers['x-request-id']).toEqual(
        expect.any(String),
      );
    });

    it('accepts supported language', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/${endpoint}?language=en`)
        .expect(200);

      expect(response.headers['x-request-id']).toEqual(
        expect.any(String),
      );
    });

    it('rejects unsupported language', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/${endpoint}?language=invalid`)
        .expect(400);

      expect(response.body.error.code).toBe(
        'VALIDATION_ERROR',
      );

      expect(response.body.error.requestId).toBe(
        response.headers['x-request-id'],
      );
    });

    it('rejects unknown query fields', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/${endpoint}?unknownField=test`)
        .expect(400);

      expect(response.body.error.code).toBe(
        'VALIDATION_ERROR',
      );

      expect(response.body.error.requestId).toBe(
        response.headers['x-request-id'],
      );
    });

    it('rejects long search values', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/${endpoint}`)
        .query({ search: 'a'.repeat(101) })
        .expect(400);

      expect(response.body.error.code).toBe(
        'VALIDATION_ERROR',
      );

      expect(response.body.error.requestId).toBe(
        response.headers['x-request-id'],
      );
    });

    it('rejects empty category', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/${endpoint}?category=`)
        .expect(400);

      expect(response.body.error.code).toBe(
        'VALIDATION_ERROR',
      );

      expect(response.body.error.requestId).toBe(
        response.headers['x-request-id'],
      );
    });

    it('returns 404 for nonexistent IDs', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/${endpoint}/not-real`)
        .expect(404);

      expect(response.body.error.code).toBe(
        'RESOURCE_NOT_FOUND',
      );

      expect(response.body.error.requestId).toBe(
        response.headers['x-request-id'],
      );
    });
  });

  describe('Health endpoint', () => {
    it('returns 200 OK', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/health')
        .expect(200);

      expect(response.body.status).toBe('ok');

      expect(response.headers['x-request-id']).toEqual(
        expect.any(String),
      );
    });
  });
});
