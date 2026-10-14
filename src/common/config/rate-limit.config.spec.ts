import { ConfigService } from '@nestjs/config';
import { describe, expect, it, vi } from 'vitest';

import { createRateLimitConfig } from './rate-limit.config';

function createMockConfig(
  values: Record<string, string> = {},
): ConfigService {
  return {
    get: vi.fn((key: string) => values[key]),
  } as unknown as ConfigService;
}

describe('API-007 Rate Limit Configuration (unit)', () => {
  it('uses defaults when values are missing', () => {
    const config = createMockConfig();

    expect(createRateLimitConfig(config)).toEqual([
      { ttl: 60000, limit: 100 },
    ]);
  });

  it('accepts custom values', () => {
    const config = createMockConfig({
      API_RATE_LIMIT_TTL: '30000',
      API_RATE_LIMIT_MAX: '50',
    });

    expect(createRateLimitConfig(config)).toEqual([
      { ttl: 30000, limit: 50 },
    ]);
  });

  it.each([
    ['zero TTL', 'API_RATE_LIMIT_TTL', '0'],
    ['negative TTL', 'API_RATE_LIMIT_TTL', '-1000'],
    ['decimal TTL', 'API_RATE_LIMIT_TTL', '1000.5'],
    ['invalid TTL', 'API_RATE_LIMIT_TTL', 'invalid'],
    ['zero limit', 'API_RATE_LIMIT_MAX', '0'],
    ['negative limit', 'API_RATE_LIMIT_MAX', '-5'],
    ['decimal limit', 'API_RATE_LIMIT_MAX', '2.5'],
    ['invalid limit', 'API_RATE_LIMIT_MAX', 'abc'],
    [
      'unsafe integer',
      'API_RATE_LIMIT_MAX',
      '9007199254740992',
    ],
  ])('rejects %s', (_name, key, value) => {
    const config = createMockConfig({
      [key]: value,
    });

    expect(() => createRateLimitConfig(config)).toThrow(
      'Invalid API rate limit configuration.',
    );
  });
});
