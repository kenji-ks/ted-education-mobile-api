
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import { AppLoggerService } from './logger.service';
import type { HttpRequestLog } from './logging.types';

describe('AppLoggerService (unit)', () => {
  let service: AppLoggerService;
  let writeSpy: ReturnType<typeof vi.spyOn>;

  const createEntry = (
    overrides: Partial<HttpRequestLog> = {},
  ): HttpRequestLog => ({
    level: 'info',
    event: 'http_request_completed',
    requestId: 'test-request-id',
    method: 'GET',
    path: '/api/v1/health',
    statusCode: 200,
    durationMs: 12.5,
    ...overrides,
  });

  beforeEach(() => {
    service = new AppLoggerService();

    writeSpy = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('writes one JSON log entry to stdout', () => {
    const entry = createEntry();

    service.logHttpRequest(entry);

    expect(writeSpy).toHaveBeenCalledTimes(1);

    expect(writeSpy).toHaveBeenCalledWith(
      `${JSON.stringify(entry)}\n`,
    );
  });

  it('produces valid newline-delimited JSON', () => {
    const entry = createEntry();

    service.logHttpRequest(entry);

    const output = writeSpy.mock.calls[0][0];

    expect(typeof output).toBe('string');

    if (typeof output !== 'string') {
      throw new Error('Expected string log output');
    }

    expect(output.endsWith('\n')).toBe(true);

    const parsed = JSON.parse(output.trim()) as HttpRequestLog;

    expect(parsed).toEqual(entry);
  });

  it('preserves warning log metadata', () => {
    const entry = createEntry({
      level: 'warn',
      statusCode: 429,
      path: '/api/v1/education',
    });

    service.logHttpRequest(entry);

    const output = String(writeSpy.mock.calls[0][0]);
    const parsed = JSON.parse(output) as HttpRequestLog;

    expect(parsed).toMatchObject({
      level: 'warn',
      statusCode: 429,
      path: '/api/v1/education',
    });
  });

  it('preserves error log metadata', () => {
    const entry = createEntry({
      level: 'error',
      statusCode: 503,
      event: 'http_request_completed',
    });

    service.logHttpRequest(entry);

    const output = String(writeSpy.mock.calls[0][0]);
    const parsed = JSON.parse(output) as HttpRequestLog;

    expect(parsed).toMatchObject({
      level: 'error',
      statusCode: 503,
      requestId: 'test-request-id',
    });
  });

  it('preserves aborted request events', () => {
    const entry = createEntry({
      event: 'http_request_aborted',
      statusCode: 200,
    });

    service.logHttpRequest(entry);

    const output = String(writeSpy.mock.calls[0][0]);
    const parsed = JSON.parse(output) as HttpRequestLog;

    expect(parsed.event).toBe('http_request_aborted');
  });

  it('does not mutate the original log entry', () => {
    const entry = createEntry();
    const original = structuredClone(entry);

    service.logHttpRequest(entry);

    expect(entry).toEqual(original);
  });
});
