
import {
  afterEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import { createCorsConfig } from './cors.config';

describe('API-007 CORS Configuration (unit)', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('parses multiple allowed origins', () => {
    vi.stubEnv(
      'CORS_ORIGINS',
      'https://app.example.com,https://admin.example.com',
    );

    expect(createCorsConfig().origin).toEqual([
      'https://app.example.com',
      'https://admin.example.com',
    ]);
  });

  it('trims whitespace around origins', () => {
    vi.stubEnv(
      'CORS_ORIGINS',
      '  https://app.example.com , https://admin.example.com  ',
    );

    expect(createCorsConfig().origin).toEqual([
      'https://app.example.com',
      'https://admin.example.com',
    ]);
  });

  it('filters out empty origins', () => {
    vi.stubEnv(
      'CORS_ORIGINS',
      ',https://app.example.com,, ,https://admin.example.com,',
    );

    expect(createCorsConfig().origin).toEqual([
      'https://app.example.com',
      'https://admin.example.com',
    ]);
  });

  it('uses Expo web origins by default in development', () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('CORS_ORIGINS', undefined);

    expect(createCorsConfig().origin).toEqual([
      'http://localhost:8081',
      'http://localhost:19006',
    ]);
  });

  it('does not allow origins by default in production', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('CORS_ORIGINS', undefined);

    expect(createCorsConfig().origin).toEqual([]);
  });

  it('does not allow wildcard origins by default', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('CORS_ORIGINS', undefined);

    const config = createCorsConfig();

    expect(config.origin).not.toBe('*');
    expect(config.origin).toEqual([]);
  });

  it('does not enable credentialed CORS requests', () => {
    const config = createCorsConfig();

    expect(config.credentials).toBe(false);
  });

  it('exposes X-Request-ID to browser clients', () => {
    const config = createCorsConfig();

    expect(config.exposedHeaders).toContain('X-Request-ID');
  });

  it('allows expected HTTP methods', () => {
    const config = createCorsConfig();

    expect(config.methods).toEqual([
      'GET',
      'HEAD',
      'POST',
      'PUT',
      'PATCH',
      'DELETE',
    ]);
  });

  it('restricts allowed request headers', () => {
    const config = createCorsConfig();

    expect(config.allowedHeaders).toEqual([
      'Content-Type',
      'Authorization',
      'X-Request-ID',
    ]);
  });

  it('respects an explicitly empty origin allowlist', () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('CORS_ORIGINS', '');

    expect(createCorsConfig().origin).toEqual([]);
  });

  it('rejects wildcard origins', () => {
    vi.stubEnv('CORS_ORIGINS', '*');

    expect(() => createCorsConfig()).toThrow(
      'Wildcard and null origins are not allowed.',
    );
  });

  it('rejects null origins', () => {
    vi.stubEnv('CORS_ORIGINS', 'null');

    expect(() => createCorsConfig()).toThrow(
      'Wildcard and null origins are not allowed.',
    );
  });

  it('rejects invalid origin URLs', () => {
    vi.stubEnv('CORS_ORIGINS', 'not-a-valid-origin');

    expect(() => createCorsConfig()).toThrow(
      'Invalid CORS origin',
    );
  });

  it('rejects origins containing paths', () => {
    vi.stubEnv(
      'CORS_ORIGINS',
      'https://app.example.com/dashboard',
    );

    expect(() => createCorsConfig()).toThrow(
      'Invalid CORS origin',
    );
  });

  it('rejects HTTP origins in production', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv(
      'CORS_ORIGINS',
      'http://app.example.com',
    );

    expect(() => createCorsConfig()).toThrow(
      'Production CORS origin must use HTTPS',
    );
  });

  it('accepts HTTPS origins in production', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv(
      'CORS_ORIGINS',
      'https://app.example.com',
    );

    expect(createCorsConfig().origin).toEqual([
      'https://app.example.com',
    ]);
  });

  it('removes duplicate origins', () => {
    vi.stubEnv(
      'CORS_ORIGINS',
      'https://app.example.com,https://app.example.com',
    );

    expect(createCorsConfig().origin).toEqual([
      'https://app.example.com',
    ]);
  });

  it('rejects wildcard mixed with valid origins', () => {
    vi.stubEnv(
      'CORS_ORIGINS',
      'https://app.example.com,*',
    );

    expect(() => createCorsConfig()).toThrow(
      'Wildcard and null origins are not allowed.',
    );
  });
});
