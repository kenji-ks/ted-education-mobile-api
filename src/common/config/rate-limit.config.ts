
import type { ConfigService } from '@nestjs/config';
import type { ThrottlerModuleOptions } from '@nestjs/throttler';

/**
 * Builds global rate limiting configuration.
 *
 * TTL is measured in milliseconds.
 * Limit represents maximum requests per TTL window.
 */
export function createRateLimitConfig(
  config: ConfigService,
): ThrottlerModuleOptions {
  const ttl = Number(
    config.get<string>('API_RATE_LIMIT_TTL') ?? '60000',
  );

  const limit = Number(
    config.get<string>('API_RATE_LIMIT_MAX') ?? '100',
  );

  if (
    !Number.isSafeInteger(ttl) ||
    ttl <= 0 ||
    !Number.isSafeInteger(limit) ||
    limit <= 0
  ) {
    throw new Error('Invalid API rate limit configuration.');
  }

  return [
    {
      ttl,
      limit,
    },
  ];
}
