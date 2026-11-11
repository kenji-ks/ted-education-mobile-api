
import type { INestApplication } from '@nestjs/common';
import type { OpenAPIObject } from '@nestjs/swagger';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import {
  afterAll,
  beforeAll,
  describe,
  expect,
  it,
} from 'vitest';

import { configureHttp } from '../src/common/configure-http';
import { configureSwagger } from '../src/common/configure-swagger';
import { EducationModule } from '../src/education/education.module';
import { HealthModule } from '../src/health/health.module';
import { ResourcesModule } from '../src/resources/resources.module';
import { TreatmentsModule } from '../src/treatments/treatments.module';
import { registerRequestContext } from './helpers/register-request-context';

describe('API-008 OpenAPI Documentation (e2e)', () => {
  let app: INestApplication;
  let document: OpenAPIObject;

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
    configureSwagger(app);

    await app.init();

    const response = await request(app.getHttpServer())
      .get('/api/docs-json')
      .expect(200);

    document = response.body as OpenAPIObject;
  });

  afterAll(async () => {
    await app?.close();
  });

  it('serves the interactive Swagger UI', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/docs')
      .expect(200);

    expect(response.headers['content-type']).toMatch(/html/);
  });

  it('provides the correct API metadata', () => {
    expect(document.info.title).toBe('TED Education API');
    expect(document.info.version).toBe('1.0');
  });

  it('documents all seven required GET endpoints', () => {
    const paths = [
      '/api/v1/health',
      '/api/v1/education',
      '/api/v1/education/{id}',
      '/api/v1/treatments',
      '/api/v1/treatments/{id}',
      '/api/v1/resources',
      '/api/v1/resources/{id}',
    ];

    for (const path of paths) {
      expect(document.paths[path]?.get).toBeDefined();
    }
  });

  it.each([
    ['education', 'EducationArticleResponseDto'],
    ['treatments', 'TreatmentResponseDto'],
    ['resources', 'ResourceResponseDto'],
  ])('documents %s success responses', (name, model) => {
    const collection =
      document.paths[`/api/v1/${name}`]?.get;

    const detail =
      document.paths[`/api/v1/${name}/{id}`]?.get;

    expect(collection?.responses['200']).toMatchObject({
      content: {
        'application/json': {
          schema: {
            type: 'array',
            items: {
              $ref: `#/components/schemas/${model}`,
            },
          },
        },
      },
    });

    expect(detail?.responses['200']).toMatchObject({
      content: {
        'application/json': {
          schema: {
            $ref: `#/components/schemas/${model}`,
          },
        },
      },
    });

    expect(
      document.components?.schemas?.[model],
    ).toBeDefined();
  });

  it.each([
    'education',
    'treatments',
    'resources',
  ])('documents %s query validation', (name) => {
    const parameters =
      document.paths[`/api/v1/${name}`]?.get?.parameters;

    expect(parameters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'language',
          in: 'query',
          required: false,
          schema: expect.objectContaining({
            enum: ['en', 'zh', 'ja'],
          }),
        }),
        expect.objectContaining({
          name: 'category',
          in: 'query',
          required: false,
          schema: expect.objectContaining({
            minLength: 1,
            maxLength: 50,
          }),
        }),
        expect.objectContaining({
          name: 'search',
          in: 'query',
          required: false,
          schema: expect.objectContaining({
            maxLength: 100,
          }),
        }),
      ]),
    );
  });

  it.each([
    'education',
    'treatments',
    'resources',
  ])('documents %s error status codes', (name) => {
    const collection =
      document.paths[`/api/v1/${name}`]?.get;

    const detail =
      document.paths[`/api/v1/${name}/{id}`]?.get;

    expect(
      Object.keys(collection?.responses ?? {}).sort(),
    ).toEqual([
      '200',
      '400',
      '429',
      '500',
    ]);

    expect(
      Object.keys(detail?.responses ?? {}).sort(),
    ).toEqual([
      '200',
      '404',
      '429',
      '500',
    ]);
  });

  it('documents the shared API error structure', () => {
    expect(
      document.components?.schemas?.ApiErrorResponseDto,
    ).toMatchObject({
      type: 'object',
      required: expect.arrayContaining([
        'error',
      ]),
      properties: {
        error: {
          allOf: [
            {
              $ref: '#/components/schemas/ApiErrorDetailsDto',
            },
          ],
        },
      },
    });

    expect(
      document.components?.schemas?.ApiErrorDetailsDto,
    ).toMatchObject({
      type: 'object',
      required: expect.arrayContaining([
        'code',
        'message',
        'status',
        'path',
        'timestamp',
        'requestId',
      ]),
    });
  });

  it('documents Health as a service status endpoint', () => {
    const operation =
      document.paths['/api/v1/health']?.get;

    expect(
      Object.keys(operation?.responses ?? {}).sort(),
    ).toEqual([
      '200',
      '429',
      '500',
    ]);

    expect(operation?.responses['200']).toMatchObject({
      content: {
        'application/json': {
          schema: {
            $ref: '#/components/schemas/HealthStatusResponseDto',
          },
        },
      },
    });

    expect(operation?.description).toContain(
      'does not provide patient health information',
    );
  });
});
