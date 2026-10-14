
import type { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';

const DEVELOPMENT_ORIGINS = [
  'http://localhost:8081',
  'http://localhost:19006',
];

function parseAllowedOrigins(
  configuredOrigins: string,
  isProduction: boolean,
): string[] {
  const origins = configuredOrigins
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);

  const uniqueOrigins = new Set<string>();

  for (const origin of origins) {
    if (origin === '*' || origin === 'null') {
      throw new Error(
        `Invalid CORS origin: "${origin}". Wildcard and null origins are not allowed.`,
      );
    }

    let url: URL;

    try {
      url = new URL(origin);
    } catch {
      throw new Error(`Invalid CORS origin: "${origin}".`);
    }

    // CORS_ORIGINS must contain exact origins, not full URLs
    // with paths, queries, fragments, or credentials.
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.origin !== origin ||
      url.username !== '' ||
      url.password !== ''
    ) {
      throw new Error(`Invalid CORS origin: "${origin}".`);
    }

    if (isProduction && url.protocol !== 'https:') {
      throw new Error(
        `Production CORS origin must use HTTPS: "${origin}".`,
      );
    }

    uniqueOrigins.add(origin);
  }

  return [...uniqueOrigins];
}

export function createCorsConfig(): CorsOptions {
  const isProduction = process.env.NODE_ENV === 'production';
  const configuredOrigins = process.env.CORS_ORIGINS;

  const allowedOrigins =
    configuredOrigins === undefined
      ? isProduction
        ? []
        : [...DEVELOPMENT_ORIGINS]
      : parseAllowedOrigins(configuredOrigins, isProduction);

  return {
    origin: allowedOrigins,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Request-ID',
    ],
    exposedHeaders: ['X-Request-ID'],
    credentials: false,
  };
}
