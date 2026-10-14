
import {
  BadRequestException,
  ValidationPipe,
  type INestApplication,
} from '@nestjs/common';
import { IsIn, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

import {
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import { configureHttp } from './configure-http';
import { HttpExceptionFilter } from './filters/http-exception.filter';

class TestQueryDto {
  @IsIn(['en', 'zh'])
  language!: string;
}

class NestedChildDto {
  @IsIn(['en', 'zh'])
  language!: string;
}

class NestedParentDto {
  @ValidateNested()
  @Type(() => NestedChildDto)
  child!: NestedChildDto;
}

describe('configureHttp (unit)', () => {
  function createAppMock() {
    const app = {
      setGlobalPrefix: vi.fn(),
      useGlobalFilters: vi.fn(),
      useGlobalPipes: vi.fn(),
    };

    configureHttp(app as unknown as INestApplication);

    return app;
  }

  function getValidationPipe(): ValidationPipe {
    const app = createAppMock();

    const pipe = app.useGlobalPipes.mock.calls[0][0];

    expect(pipe).toBeInstanceOf(ValidationPipe);

    return pipe;
  }

  it('registers the API version prefix', () => {
    const app = createAppMock();

    expect(app.setGlobalPrefix).toHaveBeenCalledWith(
      'api/v1',
    );
  });

  it('registers the global HTTP exception filter', () => {
    const app = createAppMock();

    expect(app.useGlobalFilters).toHaveBeenCalledTimes(1);

    expect(
      app.useGlobalFilters.mock.calls[0][0],
    ).toBeInstanceOf(HttpExceptionFilter);
  });

  it('registers the global ValidationPipe', () => {
    const app = createAppMock();

    expect(app.useGlobalPipes).toHaveBeenCalledTimes(1);

    expect(
      app.useGlobalPipes.mock.calls[0][0],
    ).toBeInstanceOf(ValidationPipe);
  });

  it('rejects invalid input using the custom validation error format', async () => {
    const pipe = getValidationPipe();

    await expect(
      pipe.transform(
        { language: 'invalid' },
        {
          type: 'query',
          metatype: TestQueryDto,
        },
      ),
    ).rejects.toMatchObject({
      response: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid request parameters.',
        details: [
          {
            field: 'language',
            constraints: [
              expect.any(String),
            ],
          },
        ],
      },
    });
  });

  it('handles validation errors without direct constraints', async () => {
    const pipe = getValidationPipe();

    try {
      await pipe.transform(
        {
          child: {
            language: 'invalid',
          },
        },
        {
          type: 'body',
          metatype: NestedParentDto,
        },
      );

      expect.fail('Expected validation to fail');
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestException);

      const exception = error as BadRequestException;

      expect(exception.getResponse()).toMatchObject({
        code: 'VALIDATION_ERROR',
        message: 'Invalid request parameters.',
        details: [
          {
            field: 'child',
            constraints: [],
          },
        ],
      });
    }
  });

  it('accepts valid input', async () => {
    const pipe = getValidationPipe();

    const result = await pipe.transform(
      {
        language: 'en',
      },
      {
        type: 'query',
        metatype: TestQueryDto,
      },
    );

    expect(result).toBeInstanceOf(TestQueryDto);
    expect(result).toMatchObject({
      language: 'en',
    });
  });

  it('rejects unexpected properties', async () => {
    const pipe = getValidationPipe();

    await expect(
      pipe.transform(
        {
          language: 'en',
          unexpected: 'secret',
        },
        {
          type: 'query',
          metatype: TestQueryDto,
        },
      ),
    ).rejects.toMatchObject({
      response: {
        code: 'VALIDATION_ERROR',
        details: [
          {
            field: 'unexpected',
          },
        ],
      },
    });
  });
});
