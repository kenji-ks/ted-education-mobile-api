
type Environment = 'development' | 'test' | 'production';

const SUPPORTED_ENVIRONMENTS: Environment[] = [
  'development',
  'test',
  'production',
];

function invalidConfig(name: string): never {
  throw new Error(`Invalid environment variable: ${name}`);
}

function getOptionalString(
  config: Record<string, unknown>,
  name: string,
): string | undefined {
  const value = config[name];

  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== 'string') {
    return invalidConfig(name);
  }

  return value;
}

function requireNonEmptyString(
  config: Record<string, unknown>,
  name: string,
): void {
  const value = getOptionalString(config, name);

  if (!value || value.trim().length === 0) {
    throw new Error(
      `Missing required environment variable: ${name}`,
    );
  }
}

function validatePositiveInteger(
  config: Record<string, unknown>,
  name: string,
): void {
  const value = getOptionalString(config, name);

  if (value === undefined) {
    return;
  }

  if (!/^[1-9]\d*$/.test(value)) {
    invalidConfig(name);
  }

  const number = Number(value);

  if (!Number.isSafeInteger(number)) {
    invalidConfig(name);
  }
}

function validateBodyLimit(
  config: Record<string, unknown>,
): void {
  const value = getOptionalString(
    config,
    'REQUEST_BODY_LIMIT',
  );

  if (value === undefined) {
    return;
  }

  // Accept positive integer byte limits or b/kb/mb units.
  const match = /^([1-9]\d*)(b|kb|mb)?$/i.exec(value);

  if (!match || !Number.isSafeInteger(Number(match[1]))) {
    invalidConfig('REQUEST_BODY_LIMIT');
  }
}

function validateCorsOrigins(
  config: Record<string, unknown>,
  environment: Environment,
): void {
  const value = getOptionalString(config, 'CORS_ORIGINS');

  if (value === undefined) {
    return;
  }

  const origins = value
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  for (const origin of origins) {
    if (origin === '*' || origin === 'null') {
      invalidConfig('CORS_ORIGINS');
    }

    let url: URL;

    try {
      url = new URL(origin);
    } catch {
      invalidConfig('CORS_ORIGINS');
    }

    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.origin !== origin ||
      url.username !== '' ||
      url.password !== ''
    ) {
      invalidConfig('CORS_ORIGINS');
    }

    if (
      environment === 'production' &&
      url.protocol !== 'https:'
    ) {
      invalidConfig('CORS_ORIGINS');
    }
  }
}

export function validateEnv(
  config: Record<string, unknown>,
): Record<string, unknown> {
  const rawEnvironment = getOptionalString(
    config,
    'NODE_ENV',
  );

  const environment = rawEnvironment ?? 'development';

  if (
    !SUPPORTED_ENVIRONMENTS.includes(
      environment as Environment,
    )
  ) {
    invalidConfig('NODE_ENV');
  }

  const nodeEnv = environment as Environment;

  requireNonEmptyString(config, 'OBSERVE_APP_KEY');
  requireNonEmptyString(config, 'OBSERVE_APP_SECRET');

  validatePositiveInteger(config, 'API_RATE_LIMIT_TTL');
  validatePositiveInteger(config, 'API_RATE_LIMIT_MAX');

  validateBodyLimit(config);
  validateCorsOrigins(config, nodeEnv);

  return config;
}
