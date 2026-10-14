import {
  Controller,
  Get,
  NotFoundException,
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

@Controller('test-missing-id')
class TestMissingIdController {
  @Get('not-found')
  notFound(): never {
    throw new NotFoundException();
  }
}

describe('API-006 Missing Request ID (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [TestMissingIdController],
    }).compile();

    app = moduleRef.createNestApplication();

    // Deliberately do not register RequestContextMiddleware.
    configureHttp(app);

    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('preserves HTTP status when request ID is missing', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/test-missing-id/not-found')
      .expect(404);

    expect(response.body.error.code).toBe(
      'RESOURCE_NOT_FOUND',
    );

    expect(response.body.error.status).toBe(404);
    expect(response.body.error.requestId).toBe('');
  });
});
