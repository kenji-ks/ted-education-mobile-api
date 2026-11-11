
import { describe, expect, it } from 'vitest';

import { validateEnv } from './env.validation';

const VALID_CONFIG: Record<string, unknown> = {
  OBSERVE_APP_KEY: 'test-app-key',
  OBSERVE_APP_SECRET: 'test-app-secret',
};

function validate(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return validateEnv({
    ...VALID_CONFIG,
    ...overrides,
  });
}

describe('API-009 Environment Validation (unit)', () => {
  describe('Valid configuration', () => {
    it('accepts valid configuration and returns it unchanged', () => {
      const config = {
        ...VALID_CONFIG,
        NODE_ENV: 'production',
        CORS_ORIGINS: 'https://app.example.com',
        API_RATE_LIMIT_TTL: '60000',
        API_RATE_LIMIT_MAX: '100',
        REQUEST_BODY_LIMIT: '1mb',
      };

      expect(validateEnv(config)).toBe(config);
    });

    it('accepts missing optional configuration', () => {
      expect(validate()).toEqual(VALID_CONFIG);
    });

    it.each([
      'development',
      'test',
      'production',
    ])('supports NODE_ENV=%s', (environment) => {
      expect(() =>
        validate({ NODE_ENV: environment }),
      ).not.toThrow();
    });
  });

  describe('Observe credentials', () => {
    it.each([
      'OBSERVE_APP_KEY',
      'OBSERVE_APP_SECRET',
    ])('rejects missing %s', (name) => {
      expect(() =>
        validate({ [name]: undefined }),
      ).toThrow(
        `Missing required environment variable: ${name}`,
      );
    });

    it.each([
      'OBSERVE_APP_KEY',
      'OBSERVE_APP_SECRET',
    ])('rejects empty %s', (name) => {
      expect(() =>
        validate({ [name]: '' }),
      ).toThrow(
        `Missing required environment variable: ${name}`,
      );
    });

    it.each([
      'OBSERVE_APP_KEY',
      'OBSERVE_APP_SECRET',
    ])('rejects whitespace-only %s', (name) => {
      expect(() =>
        validate({ [name]: '   ' }),
      ).toThrow(
        `Missing required environment variable: ${name}`,
      );
    });

    it.each([
      null,
      123,
    ])('rejects non-string Observe credentials', (value) => {
      expect(() =>
        validate({ OBSERVE_APP_KEY: value }),
      ).toThrow(
        'Invalid environment variable: OBSERVE_APP_KEY',
      );
    });

    it('does not expose credentials in error messages', () => {
      const secret = 'private-test-value-123';

      expect(() =>
        validate({
          OBSERVE_APP_SECRET: secret,
          API_RATE_LIMIT_MAX: '-10',
        }),
      ).toThrow(
        'Invalid environment variable: API_RATE_LIMIT_MAX',
      );

      try {
        validate({
          OBSERVE_APP_SECRET: secret,
          API_RATE_LIMIT_MAX: '-10',
        });
      } catch (error) {
        expect((error as Error).message).not.toContain(
          secret,
        );
      }
    });
  });

  describe('NODE_ENV', () => {
    it('rejects unsupported environments', () => {
      expect(() =>
        validate({ NODE_ENV: 'staging' }),
      ).toThrow(
        'Invalid environment variable: NODE_ENV',
      );
    });

    it('rejects empty NODE_ENV', () => {
      expect(() =>
        validate({ NODE_ENV: '' }),
      ).toThrow(
        'Invalid environment variable: NODE_ENV',
      );
    });

    it('rejects non-string NODE_ENV', () => {
      expect(() =>
        validate({ NODE_ENV: 123 }),
      ).toThrow(
        'Invalid environment variable: NODE_ENV',
      );
    });
  });

  describe('Rate limiting', () => {
    it.each([
      'API_RATE_LIMIT_TTL',
      'API_RATE_LIMIT_MAX',
    ])('accepts valid %s', (name) => {
      expect(() =>
        validate({ [name]: '120' }),
      ).not.toThrow();
    });

    it.each([
      'API_RATE_LIMIT_TTL',
      'API_RATE_LIMIT_MAX',
    ])('accepts missing optional %s', (name) => {
      expect(() =>
        validate({ [name]: undefined }),
      ).not.toThrow();
    });

    it.each([
      '0',
      '-10',
      'abc',
      '1.5',
      '1e3',
      '9007199254740992',
      '',
      ' 100',
    ])('rejects invalid rate limit value %s', (value) => {
      expect(() =>
        validate({ API_RATE_LIMIT_MAX: value }),
      ).toThrow(
        'Invalid environment variable: API_RATE_LIMIT_MAX',
      );
    });

    it('rejects invalid TTL values', () => {
      expect(() =>
        validate({ API_RATE_LIMIT_TTL: '-1000' }),
      ).toThrow(
        'Invalid environment variable: API_RATE_LIMIT_TTL',
      );
    });

    it('rejects non-string rate limit values', () => {
      expect(() =>
        validate({ API_RATE_LIMIT_MAX: 100 }),
      ).toThrow(
        'Invalid environment variable: API_RATE_LIMIT_MAX',
      );
    });
  });

  describe('Request body limit', () => {
    it.each([
      '100kb',
      '1mb',
      '256b',
      '123',
      '2KB',
    ])('accepts body limit %s', (value) => {
      expect(() =>
        validate({ REQUEST_BODY_LIMIT: value }),
      ).not.toThrow();
    });

    it('accepts an undefined body limit', () => {
      expect(() =>
        validate({ REQUEST_BODY_LIMIT: undefined }),
      ).not.toThrow();
    });

    it.each([
      '',
      '0',
      '-1kb',
      '1.5mb',
      'invalid',
      '1gb',
      '999999999999999999999mb',
    ])('rejects invalid body limit %s', (value) => {
      expect(() =>
        validate({ REQUEST_BODY_LIMIT: value }),
      ).toThrow(
        'Invalid environment variable: REQUEST_BODY_LIMIT',
      );
    });

    it('rejects non-string body limits', () => {
      expect(() =>
        validate({ REQUEST_BODY_LIMIT: 1024 }),
      ).toThrow(
        'Invalid environment variable: REQUEST_BODY_LIMIT',
      );
    });
  });

  describe('CORS origins', () => {
    it('accepts an HTTPS origin in production', () => {
      expect(() =>
        validate({
          NODE_ENV: 'production',
          CORS_ORIGINS: 'https://app.example.com',
        }),
      ).not.toThrow();
    });

    it('accepts multiple HTTPS origins', () => {
      expect(() =>
        validate({
          NODE_ENV: 'production',
          CORS_ORIGINS:
            'https://app.example.com,https://admin.example.com',
        }),
      ).not.toThrow();
    });

    it('accepts HTTP localhost in development', () => {
      expect(() =>
        validate({
          NODE_ENV: 'development',
          CORS_ORIGINS: 'http://localhost:8081',
        }),
      ).not.toThrow();
    });

    it('accepts HTTP localhost in test', () => {
      expect(() =>
        validate({
          NODE_ENV: 'test',
          CORS_ORIGINS: 'http://localhost:8081',
        }),
      ).not.toThrow();
    });

    it('accepts an absent CORS configuration', () => {
      expect(() =>
        validate({
          NODE_ENV: 'production',
          CORS_ORIGINS: undefined,
        }),
      ).not.toThrow();
    });

    it('accepts an explicitly empty allowlist', () => {
      expect(() =>
        validate({
          CORS_ORIGINS: '',
        }),
      ).not.toThrow();
    });

    it('accepts empty entries between valid origins', () => {
      expect(() =>
        validate({
          CORS_ORIGINS:
            ', https://app.example.com, ,',
        }),
      ).not.toThrow();
    });

    it.each([
      '*',
      'null',
      'not-a-url',
      'ftp://app.example.com',
      'https://app.example.com/path',
      'https://app.example.com?x=1',
      'https://user:pass@app.example.com',
    ])('rejects invalid CORS origin %s', (origin) => {
      expect(() =>
        validate({ CORS_ORIGINS: origin }),
      ).toThrow(
        'Invalid environment variable: CORS_ORIGINS',
      );
    });

    it('rejects HTTP origins in production', () => {
      expect(() =>
        validate({
          NODE_ENV: 'production',
          CORS_ORIGINS: 'http://app.example.com',
        }),
      ).toThrow(
        'Invalid environment variable: CORS_ORIGINS',
      );
    });

    it('rejects non-string CORS configuration', () => {
      expect(() =>
        validate({ CORS_ORIGINS: 123 }),
      ).toThrow(
        'Invalid environment variable: CORS_ORIGINS',
      );
    });
  });
});
