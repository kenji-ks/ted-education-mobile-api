
import {
  type ArgumentsHost,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import { HttpExceptionFilter } from './http-exception.filter';
import type { RequestWithContext } from '../types/request-context.types';

type ErrorResponse = {
  error: {
    code: string;
    message: string;
    status: number;
    path: string;
    timestamp: string;
    requestId: string;
  };
};

type ResponseMock = {
  status: ReturnType<typeof vi.fn>;
  json: ReturnType<typeof vi.fn>;
};

function createMockHost(
  path = '/api/v1/test',
  requestId?: string,
) {
  const request = {
    path,
    requestId,
  } as RequestWithContext;

  const response: ResponseMock = {
    status: vi.fn(),
    json: vi.fn(),
  };

  response.status.mockReturnValue(response);

  const host = {
    switchToHttp: vi.fn().mockReturnValue({
      getRequest: vi.fn().mockReturnValue(request),
      getResponse: vi.fn().mockReturnValue(
        response as unknown as Response,
      ),
    }),
  } as unknown as ArgumentsHost;

  return {
    host,
    response,
  };
}

function executeFilter(
  exception: unknown,
  path = '/api/v1/test',
  requestId?: string,
) {
  const filter = new HttpExceptionFilter();

  const { host, response } = createMockHost(
    path,
    requestId,
  );

  filter.catch(exception, host);

  expect(response.status).toHaveBeenCalledTimes(1);
  expect(response.json).toHaveBeenCalledTimes(1);

  const status = response.status.mock.calls[0][0] as number;
  const body = response.json.mock.calls[0][0] as ErrorResponse;

  return {
    status,
    body,
  };
}

describe('API-005/007 HttpExceptionFilter (unit)', () => {
  const REQUEST_ID = '550e8400-e29b-41d4-a716-446655440000';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('HTTP status mapping', () => {
    it.each([
      [
        '400 Bad Request',
        new BadRequestException('Sensitive request details'),
        400,
        'BAD_REQUEST',
        'The request is invalid.',
      ],
      [
        '401 Unauthorized',
        new UnauthorizedException(),
        401,
        'UNAUTHORIZED',
        'Authentication is required.',
      ],
      [
        '403 Forbidden',
        new ForbiddenException(),
        403,
        'FORBIDDEN',
        'Access is denied.',
      ],
      [
        '404 Not Found',
        new NotFoundException(),
        404,
        'RESOURCE_NOT_FOUND',
        'The requested resource was not found.',
      ],
      [
        '409 Conflict',
        new ConflictException(),
        409,
        'CONFLICT',
        'The request conflicts with the current state.',
      ],
      [
        '429 Too Many Requests',
        new HttpException('Rate limit exceeded', 429),
        429,
        'HTTP_ERROR',
        'The request could not be completed.',
      ],
      [
        '503 Service Unavailable',
        new HttpException('SECRET_DATABASE_ERROR', 503),
        503,
        'INTERNAL_SERVER_ERROR',
        'An internal error occurred.',
      ],
    ])(
      'maps %s correctly',
      (
        _name,
        exception,
        expectedStatus,
        expectedCode,
        expectedMessage,
      ) => {
        const { status, body } = executeFilter(
          exception,
          '/api/v1/test',
          REQUEST_ID,
        );

        expect(status).toBe(expectedStatus);
        expect(body.error.status).toBe(expectedStatus);
        expect(body.error.code).toBe(expectedCode);
        expect(body.error.message).toBe(expectedMessage);
        expect(body.error.requestId).toBe(REQUEST_ID);
      },
    );
  });

  describe('validation errors', () => {
    it('recognizes ValidationPipe errors', () => {
      const exception = new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Sensitive validation details',
      });

      const { status, body } = executeFilter(exception);

      expect(status).toBe(400);
      expect(body.error.code).toBe('VALIDATION_ERROR');
      expect(body.error.message).toBe(
        'Invalid request parameters.',
      );
    });
  });

  describe('HTTP 413 Payload Too Large', () => {
    it('recognizes body-parser errors with status 413', () => {
      const exception = Object.assign(
        new Error('entity too large'),
        {
          status: 413,
          type: 'entity.too.large',
        },
      );

      const { status, body } = executeFilter(
        exception,
        '/api/v1/education',
        REQUEST_ID,
      );

      expect(status).toBe(413);
      expect(body.error.code).toBe('PAYLOAD_TOO_LARGE');
      expect(body.error.message).toBe(
        'The request body is too large.',
      );
    });

    it('recognizes body-parser errors with statusCode 413', () => {
      const exception = Object.assign(
        new Error('entity too large'),
        {
          statusCode: 413,
        },
      );

      const { status, body } = executeFilter(exception);

      expect(status).toBe(413);
      expect(body.error.code).toBe('PAYLOAD_TOO_LARGE');
    });

    it('recognizes 413 when status differs but statusCode is 413', () => {
      const exception = Object.assign(
        new Error('entity too large'),
        {
          status: 400,
          statusCode: 413,
        },
      );

      const { status, body } = executeFilter(exception);

      expect(status).toBe(413);
      expect(body.error.status).toBe(413);
      expect(body.error.code).toBe('PAYLOAD_TOO_LARGE');
      expect(body.error.message).toBe(
        'The request body is too large.',
      );
    });

    it('does not trust arbitrary status codes on unexpected errors', () => {
      const exception = Object.assign(
        new Error('SECRET_INTERNAL_ERROR'),
        {
          status: 418,
        },
      );

      const { status, body } = executeFilter(exception);

      expect(status).toBe(500);
      expect(body.error.code).toBe(
        'INTERNAL_SERVER_ERROR',
      );
    });

    it('falls back to HTTP 500 when neither status property is 413', () => {
      const exception = Object.assign(
        new Error('SECRET_INTERNAL_FAILURE'),
        {
          status: 400,
          statusCode: 503,
        },
      );

      const { status, body } = executeFilter(exception);

      expect(status).toBe(500);
      expect(body.error.status).toBe(500);
      expect(body.error.code).toBe(
        'INTERNAL_SERVER_ERROR',
      );
      expect(body.error.message).toBe(
        'An internal error occurred.',
      );

      expect(JSON.stringify(body)).not.toContain(
        'SECRET_INTERNAL_FAILURE',
      );
    });

    it('falls back to HTTP 500 for a plain object without HTTP status properties', () => {
      const exception = {
        message: 'SECRET_UNEXPECTED_ERROR',
      };

      const { status, body } = executeFilter(exception);

      expect(status).toBe(500);
      expect(body.error.code).toBe(
        'INTERNAL_SERVER_ERROR',
      );
      expect(body.error.message).toBe(
        'An internal error occurred.',
      );

      expect(JSON.stringify(body)).not.toContain(
        'SECRET_UNEXPECTED_ERROR',
      );
    });
  });

  describe('security and error sanitization', () => {
    it('does not expose internal exception messages', () => {
      const secret = 'SECRET_DATABASE_PASSWORD';

      const { status, body } = executeFilter(
        new Error(secret),
      );

      expect(status).toBe(500);
      expect(body.error.code).toBe(
        'INTERNAL_SERVER_ERROR',
      );

      expect(JSON.stringify(body)).not.toContain(secret);
      expect(JSON.stringify(body)).not.toContain('stack');
    });

    it('does not expose internal details from HTTP 503', () => {
      const secret = 'SECRET_DATABASE_CONNECTION_STRING';

      const { status, body } = executeFilter(
        new HttpException(secret, 503),
      );

      expect(status).toBe(503);
      expect(JSON.stringify(body)).not.toContain(secret);
    });

    it('handles explicit HTTP 500 exceptions safely', () => {
      const { status, body } = executeFilter(
        new HttpException(
          'SECRET_INTERNAL_EXCEPTION',
          HttpStatus.INTERNAL_SERVER_ERROR,
        ),
      );

      expect(status).toBe(500);
      expect(body.error.code).toBe(
        'INTERNAL_SERVER_ERROR',
      );
      expect(body.error.message).toBe(
        'An internal error occurred.',
      );
    });
  });

  describe('request tracing', () => {
    it('preserves the request ID', () => {
      const { body } = executeFilter(
        new NotFoundException(),
        '/api/v1/education/123',
        REQUEST_ID,
      );

      expect(body.error.requestId).toBe(REQUEST_ID);
    });

    it('handles missing request IDs safely', () => {
      const { body } = executeFilter(
        new NotFoundException(),
      );

      expect(body.error.requestId).toBe('');
    });

    it('returns the expected error response structure', () => {
      const { body } = executeFilter(
        new NotFoundException(),
        '/api/v1/education/123',
        REQUEST_ID,
      );

      expect(body).toEqual({
        error: {
          code: 'RESOURCE_NOT_FOUND',
          message: 'The requested resource was not found.',
          status: 404,
          path: '/api/v1/education/123',
          timestamp: expect.any(String),
          requestId: REQUEST_ID,
        },
      });
    });

    it('preserves the request path without query parameters', () => {
      const { body } = executeFilter(
        new BadRequestException(),
        '/api/v1/education',
        REQUEST_ID,
      );

      expect(body.error.path).toBe('/api/v1/education');
      expect(body.error.path).not.toContain('?');
    });

    it('returns a valid ISO timestamp', () => {
      const { body } = executeFilter(
        new BadRequestException(),
      );

      const timestamp = body.error.timestamp;

      expect(new Date(timestamp).toISOString()).toBe(timestamp);
    });

    it('handles null exceptions safely', () => {
        const { status, body } = executeFilter(null);

        expect(status).toBe(500);
        expect(body.error.code).toBe('INTERNAL_SERVER_ERROR');
        expect(body.error.message).toBe(
            'An internal error occurred.',
        );
    });

    it('handles primitive exceptions safely', () => {
        const { status, body } = executeFilter(
            'SECRET_UNEXPECTED_ERROR',
        );

        expect(status).toBe(500);
        expect(body.error.code).toBe('INTERNAL_SERVER_ERROR');
        expect(body.error.message).toBe(
            'An internal error occurred.',
        );

        expect(JSON.stringify(body)).not.toContain(
            'SECRET_UNEXPECTED_ERROR',
        );
    });
  });
});
