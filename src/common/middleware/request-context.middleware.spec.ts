
import { EventEmitter } from 'node:events';

import type { NextFunction, Response } from 'express';
import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import { AppLoggerService } from '../logging/logger.service';
import type { HttpRequestLog } from '../logging/logging.types';
import type { RequestWithContext } from '../types/request-context.types';
import { RequestContextMiddleware } from './request-context.middleware';

type MockResponse = Response & EventEmitter;

type TestContext = {
  req: RequestWithContext;
  res: MockResponse;
  next: NextFunction;
  entries: HttpRequestLog[];
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function createTestContext(
  options: {
    method?: string;
    routePath?: string;
    statusCode?: number;
    requestId?: string;
    writableFinished?: boolean;
  } = {},
): TestContext {
  const entries: HttpRequestLog[] = [];

  const logger = {
    logHttpRequest: vi.fn((entry: HttpRequestLog) => {
      entries.push(entry);
    }),
  } as unknown as AppLoggerService;

  const req = {
    method: options.method ?? 'GET',
    route:
      options.routePath === undefined
        ? undefined
        : { path: options.routePath },
    requestId: options.requestId,
  } as RequestWithContext;

  const emitter = new EventEmitter();

  const res = Object.assign(emitter, {
    statusCode: options.statusCode ?? 200,
    writableFinished: options.writableFinished ?? false,
    setHeader: vi.fn(),
  }) as unknown as MockResponse;

  const next = vi.fn() as NextFunction;

  const middleware = new RequestContextMiddleware(logger);

  middleware.use(req, res, next);

  return {
    req,
    res,
    next,
    entries,
  };
}

describe('API-006 RequestContextMiddleware (unit)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('generates a valid UUID request ID', () => {
    const { req } = createTestContext();

    expect(req.requestId).toMatch(UUID_PATTERN);
  });

  it('adds X-Request-ID to the response', () => {
    const { req, res } = createTestContext();

    expect(res.setHeader).toHaveBeenCalledWith(
      'X-Request-ID',
      req.requestId,
    );
  });

  it('does not trust client-provided request IDs', () => {
    const { req } = createTestContext({
      requestId: 'fake-client-id',
    });

    expect(req.requestId).toMatch(UUID_PATTERN);
    expect(req.requestId).not.toBe('fake-client-id');
  });

  it('generates different IDs for separate requests', () => {
    const first = createTestContext();
    const second = createTestContext();

    expect(first.req.requestId).not.toBe(second.req.requestId);
  });

  it('calls next exactly once', () => {
    const { next } = createTestContext();

    expect(next).toHaveBeenCalledTimes(1);
  });

  it('does not log before the request finishes', () => {
    const { entries } = createTestContext();

    expect(entries).toHaveLength(0);
  });

  it('logs completed requests on finish', () => {
    const { req, res, entries } = createTestContext({
      routePath: '/api/v1/health',
    });

    res.emit('finish');

    expect(entries).toHaveLength(1);

    expect(entries[0]).toMatchObject({
      level: 'info',
      event: 'http_request_completed',
      requestId: req.requestId,
      method: 'GET',
      path: '/api/v1/health',
      statusCode: 200,
    });
  });

  it('logs aborted requests on close', () => {
    const { req, res, entries } = createTestContext({
      routePath: '/api/v1/health',
      writableFinished: false,
    });

    res.emit('close');

    expect(entries).toHaveLength(1);

    expect(entries[0]).toMatchObject({
      event: 'http_request_aborted',
      requestId: req.requestId,
      path: '/api/v1/health',
    });
  });

  it('does not mark completed responses as aborted', () => {
    const { res, entries } = createTestContext({
      writableFinished: true,
    });

    res.emit('close');

    expect(entries).toHaveLength(0);
  });

  it('does not log twice when finish and close both fire', () => {
    const { res, entries } = createTestContext({
      routePath: '/api/v1/health',
    });

    res.emit('finish');
    res.emit('close');

    expect(entries).toHaveLength(1);
    expect(entries[0].event).toBe('http_request_completed');
  });

  it('does not log twice when close and finish both fire', () => {
    const { res, entries } = createTestContext({
      routePath: '/api/v1/health',
    });

    res.emit('close');
    res.emit('finish');

    expect(entries).toHaveLength(1);
    expect(entries[0].event).toBe('http_request_aborted');
  });

  it.each([
    [200, 'info'],
    [201, 'info'],
    [301, 'info'],
    [400, 'warn'],
    [404, 'warn'],
    [413, 'warn'],
    [429, 'warn'],
    [500, 'error'],
    [503, 'error'],
  ] as const)(
    'uses log level %s -> %s',
    (statusCode, level) => {
      const { res, entries } = createTestContext({
        statusCode,
        routePath: '/api/v1/health',
      });

      res.emit('finish');

      expect(entries).toHaveLength(1);
      expect(entries[0].level).toBe(level);
      expect(entries[0].statusCode).toBe(statusCode);
    },
  );

  it('records a non-negative duration', () => {
    const { res, entries } = createTestContext({
      routePath: '/api/v1/health',
    });

    res.emit('finish');

    expect(entries[0].durationMs).toEqual(
      expect.any(Number),
    );
    expect(entries[0].durationMs).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(entries[0].durationMs)).toBe(true);
  });

  it('records the HTTP method', () => {
    const { res, entries } = createTestContext({
      method: 'POST',
      routePath: '/api/v1/symptoms',
      statusCode: 201,
    });

    res.emit('finish');

    expect(entries[0].method).toBe('POST');
  });

  it('uses the matched route template', () => {
    const { res, entries } = createTestContext({
      routePath: '/api/v1/education/:id',
    });

    res.emit('finish');

    expect(entries[0].path).toBe('/api/v1/education/:id');
  });

  it('does not expose unmatched request paths', () => {
    const { res, entries } = createTestContext();

    res.emit('finish');

    expect(entries[0].path).toBe('[unmatched]');
  });

  it('does not expose wildcard paths', () => {
    const { res, entries } = createTestContext({
      routePath: '/api/v1/*path',
    });

    res.emit('finish');

    expect(entries[0].path).toBe('[unmatched]');
  });

  it('does not include sensitive request data in logs', () => {
    const { req, res, entries } = createTestContext({
      routePath: '/api/v1/education/:id',
    });

    Object.assign(req, {
      originalUrl:
        '/api/v1/education/SECRET_PATIENT_ID?token=SECRET_QUERY',
      headers: {
        authorization: 'Bearer SECRET_TOKEN',
        cookie: 'session=SECRET_COOKIE',
        'x-api-key': 'SECRET_API_KEY',
      },
      body: {
        password: 'SECRET_PASSWORD',
      },
    });

    res.emit('finish');

    const serializedLog = JSON.stringify(entries);

    expect(serializedLog).not.toContain('SECRET_PATIENT_ID');
    expect(serializedLog).not.toContain('SECRET_QUERY');
    expect(serializedLog).not.toContain('SECRET_TOKEN');
    expect(serializedLog).not.toContain('SECRET_COOKIE');
    expect(serializedLog).not.toContain('SECRET_API_KEY');
    expect(serializedLog).not.toContain('SECRET_PASSWORD');

    expect(entries[0].path).toBe('/api/v1/education/:id');
  });

  it('records matching request IDs in logs', () => {
    const { req, res, entries } = createTestContext({
      routePath: '/api/v1/health',
    });

    res.emit('finish');

    expect(entries[0].requestId).toBe(req.requestId);
    expect(res.setHeader).toHaveBeenCalledWith(
      'X-Request-ID',
      entries[0].requestId,
    );
  });
});
