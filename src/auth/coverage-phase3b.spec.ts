import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  BadRequestException,
  ConflictException,
  UnauthorizedException,
} from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { createHmac } from 'node:crypto';

import { MfaService } from './mfa.service';
import { MfaController } from './mfa.controller';
import { JwtAuthGuard } from './jwt-auth.guard';

const ID = '11111111-1111-4111-8111-111111111111';
const EMAIL = 'patient@example.com';
const KEY = 'a'.repeat(64);
const SECRET = 'JBSWY3DPEHPK3PXP';
const RECOVERY = 'ABCDEF12-34567890';

function clock() {
  const instant =
    Math.floor(Date.now() / 30000) * 30000 + 15000;

  vi.spyOn(Date, 'now').mockReturnValue(instant);

  return instant;
}

function totp(secret: string, step: number): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const bytes: number[] = [];
  let bits = 0;
  let value = 0;

  for (const ch of secret.toUpperCase()) {
    value = (value << 5) | alphabet.indexOf(ch);
    bits += 5;

    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }

  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));

  const digest = createHmac('sha1', Buffer.from(bytes))
    .update(counter)
    .digest();

  const offset = digest[digest.length - 1] & 15;

  const value6 =
    (digest.readUInt32BE(offset) & 0x7fffffff) % 1000000;

  return String(value6).padStart(6, '0');
}

type InternalMfa = {
  encrypt(value: string): string;
  decrypt(value: string): string;
  recoveryHash(value: string): string;
  notifyChange(
    id: string,
    action: 'enabled' | 'disabled',
  ): Promise<void>;
  authenticateFactor(
    id: string,
    code: string,
  ): Promise<void>;
};

function harness() {
  const prisma = {
    mfaSetting: {
      findUnique: vi.fn().mockResolvedValue(null),
      upsert: vi.fn().mockResolvedValue({}),
      updateMany: vi.fn().mockResolvedValue({
        count: 1,
      }),
    },
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    $executeRaw: vi.fn().mockResolvedValue(0),
    $transaction: vi.fn(),
  };

  const jwt = {
    signAsync: vi.fn().mockResolvedValue('access-token'),
    verifyAsync: vi.fn(),
  };

  const config = {
    getOrThrow: vi.fn().mockReturnValue(KEY),
    get: vi.fn().mockReturnValue(undefined),
  };

  const service = new MfaService(
    prisma as never,
    jwt as never,
    config as never,
  );

  const inside = service as unknown as InternalMfa;

  return {
    prisma,
    jwt,
    config,
    service,
    inside,
  };
}

function factor(h: ReturnType<typeof harness>) {
  return {
    enabledAt: new Date(),
    pendingAt: new Date(Date.now()),
    pendingCipher: h.inside.encrypt(SECRET),
    secretCipher: h.inside.encrypt(SECRET),
    lastUsedStep: -1,
    attempts: 0,
    lockedUntil: null as Date | null,
    recoveryHashes: [] as string[],
  };
}

function tx(
  h: ReturnType<typeof harness>,
  updateCount = 1,
  deleteCount = 1,
) {
  const transaction = {
    mfaSetting: {
      updateMany: vi.fn().mockResolvedValue({
        count: updateCount,
      }),
      deleteMany: vi.fn().mockResolvedValue({
        count: deleteCount,
      }),
    },
    user: {
      update: vi.fn().mockResolvedValue({
        sessionVersion: 8,
      }),
    },
  };

  h.prisma.$transaction.mockImplementation(
    async (
      cb: (client: typeof transaction) => Promise<unknown>,
    ) => cb(transaction),
  );

  return transaction;
}

function challenge(
  h: ReturnType<typeof harness>,
  f = factor(h),
) {
  h.jwt.verifyAsync.mockResolvedValue({
    sub: ID,
    purpose: 'mfa',
    sv: 7,
  });

  h.prisma.user.findUnique.mockResolvedValue({
    isActive: true,
    sessionVersion: 7,
  });

  h.prisma.mfaSetting.findUnique.mockResolvedValue(f);

  return f;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('MFA setup and encryption', () => {
  it('rejects an invalid encryption key', async () => {
    const h = harness();

    h.config.getOrThrow.mockReturnValue('invalid-key');

    await expect(
      h.service.setup(ID, EMAIL),
    ).rejects.toThrow('64 hex characters');

    expect(h.prisma.mfaSetting.upsert)
      .not.toHaveBeenCalled();
  });

  it('encrypts a new authenticator secret', async () => {
    const h = harness();

    const result = await h.service.setup(ID, EMAIL);

    const call =
      h.prisma.mfaSetting.upsert.mock.calls[0][0];

    expect(result.uri).toContain('otpauth://totp/');

    expect(result.uri).toContain(
      'secret=' + result.secret,
    );

    expect(call.create.pendingCipher)
      .not.toContain(result.secret);

    expect(
      h.inside.decrypt(call.create.pendingCipher),
    ).toBe(result.secret);

    expect(
      h.inside.decrypt(call.update.pendingCipher),
    ).toBe(result.secret);
  });

  it('rejects corrupted encrypted data', () => {
    const h = harness();

    expect(() => {
      h.inside.decrypt('invalid');
    }).toThrow('Invalid encrypted secret');

    const encrypted =
      h.inside.encrypt(SECRET).split('.');

    encrypted[2] =
      Buffer.from('altered').toString('base64url');

    expect(() => {
      h.inside.decrypt(encrypted.join('.'));
    }).toThrow();
  });

  it.each([
    ['missing factor', null],
    ['already enabled', {
      enabledAt: new Date(),
    }],
    ['no pending secret', {
      enabledAt: null,
      pendingCipher: null,
      pendingAt: new Date(),
    }],
    ['no pending date', {
      enabledAt: null,
      pendingCipher: 'cipher',
      pendingAt: null,
    }],
    ['expired setup', {
      enabledAt: null,
      pendingCipher: 'cipher',
      pendingAt: new Date(0),
    }],
  ])('rejects enable when %s', async (_name, data) => {
    const h = harness();

    h.prisma.mfaSetting.findUnique
      .mockResolvedValue(data);

    await expect(
      h.service.enable(ID, '123456'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects an incorrect setup code', async () => {
    const h = harness();

    h.prisma.mfaSetting.findUnique
      .mockResolvedValue(factor(h));

    await expect(
      h.service.enable(ID, 'invalid'),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(h.prisma.$transaction)
      .not.toHaveBeenCalled();
  });

  it('enables MFA and generates eight recovery codes', async () => {
    const at = clock();
    const h = harness();

    h.prisma.mfaSetting.findUnique
      .mockResolvedValue({ ...factor(h), enabledAt: null });

    const transaction = tx(h);

    const result = await h.service.enable(
      ID,
      totp(SECRET, Math.floor(at / 30000)),
    );

    expect(transaction.mfaSetting.updateMany)
      .toHaveBeenCalledOnce();

    expect(transaction.user.update)
      .toHaveBeenCalledOnce();

    expect(result.recoveryCodes).toHaveLength(8);

    expect(
      new Set(result.recoveryCodes).size,
    ).toBe(8);

    expect(result.recoveryCodes[0]).toMatch(
      /^[A-F0-9]{8}-[A-F0-9]{8}$/,
    );

    expect(result.accessToken).toBe('access-token');

    const data =
      transaction.mfaSetting.updateMany
        .mock.calls[0][0].data;

    expect(data.recoveryHashes).toHaveLength(8);
    expect(data.enabledAt).toBeInstanceOf(Date);
    expect(data.pendingCipher).toBeNull();
  });

  it('rejects concurrent MFA setup modification', async () => {
    const at = clock();
    const h = harness();

    h.prisma.mfaSetting.findUnique
      .mockResolvedValue({ ...factor(h), enabledAt: null });

    const transaction = tx(h, 0);

    await expect(
      h.service.enable(
        ID,
        totp(SECRET, Math.floor(at / 30000)),
      ),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(transaction.user.update)
      .not.toHaveBeenCalled();
  });
});

describe('MFA verification and replay protection', () => {
  it.each([
    ['missing subject', {
      purpose: 'mfa',
      sv: 7,
    }],
    ['wrong token purpose', {
      sub: ID,
      purpose: 'access',
      sv: 7,
    }],
    ['invalid session version', {
      sub: ID,
      purpose: 'mfa',
      sv: '7',
    }],
  ])('rejects challenge with %s', async (_name, payload) => {
    const h = harness();

    h.jwt.verifyAsync.mockResolvedValue(payload);

    await expect(
      h.service.verifyChallenge('challenge', '123456'),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(h.prisma.user.findUnique)
      .not.toHaveBeenCalled();
  });

  it('rejects a challenge for a missing user', async () => {
    const h = harness();

    h.jwt.verifyAsync.mockResolvedValue({
      sub: ID,
      purpose: 'mfa',
      sv: 7,
    });

    h.prisma.user.findUnique.mockResolvedValue(null);

    await expect(
      h.service.verifyChallenge('challenge', '123456'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it.each([
    ['missing factor', null],
    ['disabled MFA', {
      enabledAt: null,
      secretCipher: 'cipher',
    }],
    ['missing secret', {
      enabledAt: new Date(),
      secretCipher: null,
    }],
  ])('rejects verification with %s', async (_name, data) => {
    const h = harness();

    challenge(h);

    h.prisma.mfaSetting.findUnique
      .mockResolvedValue(data);

    await expect(
      h.service.verifyChallenge('challenge', '123456'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it.each([
    ['too many attempts', {
      attempts: 5,
      lockedUntil: null,
    }],
    ['active lockout', {
      attempts: 1,
      lockedUntil: new Date(Date.now() + 600000),
    }],
  ])('rejects %s', async (_name, overrides) => {
    const h = harness();

    challenge(h, {
      ...factor(h),
      ...overrides,
    });

    await expect(
      h.service.verifyChallenge('challenge', '123456'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('accepts a valid TOTP code', async () => {
    const at = clock();
    const h = harness();

    challenge(h);

    const result = await h.service.verifyChallenge(
      'challenge',
      totp(SECRET, Math.floor(at / 30000)),
    );

    expect(result).toMatchObject({
      mfaRequired: false,
      accessToken: 'access-token',
    });

    expect(h.prisma.mfaSetting.updateMany)
      .toHaveBeenCalledOnce();

    expect(h.prisma.$executeRaw)
      .toHaveBeenCalledOnce();
  });

  it('accepts TOTP from the previous time window', async () => {
    const at = clock();
    const h = harness();

    challenge(h);

    await expect(
      h.service.verifyChallenge(
        'challenge',
        totp(SECRET, Math.floor(at / 30000) - 1),
      ),
    ).resolves.toHaveProperty('accessToken');
  });

  it('rejects replayed authenticator codes', async () => {
    const at = clock();
    const h = harness();

    challenge(h, {
      ...factor(h),
      lastUsedStep: Math.floor(at / 30000) + 1,
    });

    await expect(
      h.service.verifyChallenge(
        'challenge',
        totp(SECRET, Math.floor(at / 30000)),
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(h.prisma.$executeRaw)
      .toHaveBeenCalledTimes(2);
  });

  it('rejects concurrent consumption of a TOTP', async () => {
    const at = clock();
    const h = harness();

    challenge(h);

    h.prisma.mfaSetting.updateMany.mockResolvedValue({
      count: 0,
    });

    await expect(
      h.service.verifyChallenge(
        'challenge',
        totp(SECRET, Math.floor(at / 30000)),
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects malformed verification codes', async () => {
    const h = harness();

    challenge(h);

    await expect(
      h.service.verifyChallenge('challenge', 'bad code'),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(h.prisma.$executeRaw)
      .toHaveBeenCalledTimes(2);
  });

  it('accepts and consumes a recovery code', async () => {
    const h = harness();

    challenge(h);

    h.prisma.$executeRaw
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(1);

    await expect(
      h.service.verifyChallenge('challenge', RECOVERY),
    ).resolves.toHaveProperty('accessToken');

    expect(h.prisma.$executeRaw)
      .toHaveBeenCalledTimes(2);
  });

  it('rejects an already-consumed recovery code', async () => {
    const h = harness();

    challenge(h);

    await expect(
      h.service.verifyChallenge('challenge', RECOVERY),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(h.prisma.$executeRaw)
      .toHaveBeenCalledTimes(3);
  });

  it('normalizes recovery code case and hyphens', () => {
    const h = harness();

    expect(
      h.inside.recoveryHash('ABCD-1234'),
    ).toBe(
      h.inside.recoveryHash('abcd1234'),
    );
  });
});

describe('MFA notifications and disabling', () => {
  it('skips email when the service is not configured', async () => {
    const h = harness();

    await expect(
      h.inside.notifyChange(ID, 'enabled'),
    ).resolves.toBeUndefined();

    expect(h.prisma.user.findUnique)
      .not.toHaveBeenCalled();
  });

  it('skips email when the user is missing', async () => {
    const h = harness();

    h.config.get.mockImplementation(
      (key: string) =>
        key === 'RESEND_API_KEY'
          ? 'key'
          : 'from@example.com',
    );

    h.prisma.user.findUnique.mockResolvedValue(null);

    const send = vi.fn();
    vi.stubGlobal('fetch', send);

    await h.inside.notifyChange(ID, 'enabled');

    expect(send).not.toHaveBeenCalled();
  });

  it('sends MFA enable and disable notifications', async () => {
    const h = harness();

    h.config.get.mockImplementation(
      (key: string) =>
        key === 'RESEND_API_KEY'
          ? 'key'
          : 'from@example.com',
    );

    h.prisma.user.findUnique.mockResolvedValue({
      email: EMAIL,
    });

    const send = vi.fn().mockResolvedValue({
      ok: true,
    });

    vi.stubGlobal('fetch', send);

    await h.inside.notifyChange(ID, 'enabled');
    await h.inside.notifyChange(ID, 'disabled');

    expect(send).toHaveBeenCalledTimes(2);

    expect(
      JSON.parse(send.mock.calls[0][1].body).to,
    ).toEqual([EMAIL]);

    expect(
      JSON.parse(send.mock.calls[1][1].body).subject,
    ).toContain('disabled');
  });

  it('does not roll back MFA changes if email fails', async () => {
    const h = harness();

    h.config.get.mockImplementation(
      (key: string) =>
        key === 'RESEND_API_KEY'
          ? 'key'
          : 'from@example.com',
    );

    h.prisma.user.findUnique.mockResolvedValue({
      email: EMAIL,
    });

    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(
        new Error('mail unavailable'),
      ),
    );

    await expect(
      h.inside.notifyChange(ID, 'enabled'),
    ).resolves.toBeUndefined();
  });

  it('disables MFA and invalidates the old session', async () => {
    const h = harness();

    const authenticate = vi
      .spyOn(h.inside, 'authenticateFactor')
      .mockResolvedValue(undefined);

    const transaction = tx(h);

    await expect(
      h.service.disable(ID, RECOVERY),
    ).resolves.toHaveProperty('accessToken');

    expect(authenticate).toHaveBeenCalledWith(
      ID,
      RECOVERY,
    );

    expect(transaction.mfaSetting.deleteMany)
      .toHaveBeenCalledOnce();

    expect(transaction.user.update)
      .toHaveBeenCalledOnce();
  });

  it('rejects concurrent deletion of MFA settings', async () => {
    const h = harness();

    vi.spyOn(h.inside, 'authenticateFactor')
      .mockResolvedValue(undefined);

    const transaction = tx(h, 1, 0);

    await expect(
      h.service.disable(ID, RECOVERY),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(transaction.user.update)
      .not.toHaveBeenCalled();
  });
});

describe('MfaController routing', () => {
  it('delegates status and setup', async () => {
    const mfa = {
      status: vi.fn().mockResolvedValue({
        enabled: false,
      }),
      setup: vi.fn().mockResolvedValue({
        secret: 'secret',
      }),
    };

    const controller = new MfaController(mfa as never);

    const req = {
      user: {
        id: ID,
        email: EMAIL,
      },
    };

    await expect(controller.status(req)).resolves.toEqual({
      enabled: false,
    });

    await expect(controller.setup(req)).resolves.toEqual({
      secret: 'secret',
    });

    expect(mfa.status).toHaveBeenCalledWith(ID);

    expect(mfa.setup).toHaveBeenCalledWith(
      ID,
      EMAIL,
    );
  });

  it('delegates enable, verify and disable', async () => {
    const mfa = {
      enable: vi.fn().mockResolvedValue({
        enabled: true,
      }),
      verifyChallenge: vi.fn().mockResolvedValue({
        accessToken: 'token',
      }),
      disable: vi.fn().mockResolvedValue({
        enabled: false,
      }),
    };

    const controller = new MfaController(mfa as never);

    const req = {
      user: {
        id: ID,
        email: EMAIL,
      },
    };

    await controller.enable(req, {
      code: '123456',
    });

    await controller.verify({
      code: '123456',
      challengeToken: 'challenge-token',
    });

    await controller.disable(req, {
      code: RECOVERY,
    });

    expect(mfa.enable).toHaveBeenCalledWith(
      ID,
      '123456',
    );

    expect(mfa.verifyChallenge).toHaveBeenCalledWith(
      'challenge-token',
      '123456',
    );

    expect(mfa.disable).toHaveBeenCalledWith(
      ID,
      RECOVERY,
    );
  });
});

function guardHarness(authorization?: string) {
  const user = {
    id: ID,
    email: EMAIL,
    role: 'PATIENT',
    isActive: true,
    sessionVersion: 3,
  };

  const prisma = {
    user: {
      findUnique: vi.fn().mockResolvedValue(user),
    },
  };

  const jwt = {
    verifyAsync: vi.fn().mockResolvedValue({
      sub: ID,
      purpose: 'access',
      sv: 3,
    }),
  };

  const guard = new JwtAuthGuard(
    jwt as never,
    prisma as never,
  );

  const req = {
    headers: {
      authorization,
    },
    user: undefined as unknown,
  };

  const context = {
    switchToHttp: () => ({
      getRequest: () => req,
    }),
  } as unknown as ExecutionContext;

  return {
    user,
    prisma,
    jwt,
    guard,
    req,
    context,
  };
}

describe('JwtAuthGuard security', () => {
  it.each([
    ['missing header', undefined],
    ['wrong scheme', 'Basic token'],
    ['empty bearer token', 'Bearer '],
  ])('rejects %s', async (_name, header) => {
    const h = guardHarness(header);

    await expect(
      h.guard.canActivate(h.context),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(h.jwt.verifyAsync)
      .not.toHaveBeenCalled();
  });

  it('rejects invalid JWT signatures or expiration', async () => {
    const h = guardHarness('Bearer token');

    h.jwt.verifyAsync.mockRejectedValue(
      new Error('expired'),
    );

    await expect(
      h.guard.canActivate(h.context),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it.each([
    ['MFA challenge token', {
      sub: ID,
      purpose: 'mfa',
      sv: 3,
    }],
    ['missing session version', {
      sub: ID,
      purpose: 'access',
    }],
    ['missing subject', {
      purpose: 'access',
      sv: 3,
    }],
    ['invalid subject', {
      sub: 'not-a-uuid',
      purpose: 'access',
      sv: 3,
    }],
  ])('rejects %s', async (_name, payload) => {
    const h = guardHarness('Bearer token');

    h.jwt.verifyAsync.mockResolvedValue(payload);

    await expect(
      h.guard.canActivate(h.context),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(h.prisma.user.findUnique)
      .not.toHaveBeenCalled();
  });

  it.each([
    ['unknown user', null],
    ['inactive account', {
      id: ID,
      isActive: false,
      sessionVersion: 3,
    }],
    ['outdated session', {
      id: ID,
      isActive: true,
      sessionVersion: 4,
    }],
  ])('rejects %s', async (_name, user) => {
    const h = guardHarness('Bearer token');

    h.prisma.user.findUnique.mockResolvedValue(user);

    await expect(
      h.guard.canActivate(h.context),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('returns a sanitized user for valid access tokens', async () => {
    const h = guardHarness('Bearer token');

    await expect(
      h.guard.canActivate(h.context),
    ).resolves.toBe(true);

    expect(h.req.user).toMatchObject({
      id: ID,
      email: EMAIL,
      role: 'PATIENT',
    });

    expect(h.req.user)
      .not.toHaveProperty('sessionVersion');

    expect(h.req.user)
      .not.toHaveProperty('isActive');

    expect(h.jwt.verifyAsync).toHaveBeenCalledWith(
      'token',
      expect.objectContaining({
        algorithms: ['HS256'],
      }),
    );
  });
});


describe('MFA final uncovered branches', () => {

  it('rejects a malformed authenticator code during setup', async () => {
    const h = harness();

    h.prisma.mfaSetting.findUnique.mockResolvedValue({
      ...factor(h),
      enabledAt: null,
    });

    await expect(
      h.service.enable(ID, 'NOT-A-CODE'),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(h.prisma.$transaction)
      .not.toHaveBeenCalled();
  });

  it('rejects a corrupted Base32 authenticator secret', async () => {
    const h = harness();

    h.prisma.mfaSetting.findUnique.mockResolvedValue({
      ...factor(h),
      enabledAt: null,
      pendingCipher: h.inside.encrypt('INVALID!'),
    });

    await expect(
      h.service.enable(ID, '123456'),
    ).rejects.toThrow('Invalid TOTP secret');

    expect(h.prisma.$transaction)
      .not.toHaveBeenCalled();
  });

  it('rejects a well-formed but incorrect TOTP code', async () => {
    const h = harness();

    h.prisma.mfaSetting.findUnique.mockResolvedValue({
      ...factor(h),
      enabledAt: null,
    });

    const step = Math.floor(Date.now() / 30000);

    const valid = new Set([
      totp(SECRET, step - 1),
      totp(SECRET, step),
      totp(SECRET, step + 1),
    ]);

    const wrongCode = [
      '000000',
      '000001',
      '000002',
      '000003',
    ].find(code => !valid.has(code));

    if (!wrongCode) {
      throw new Error('Test fixture could not find an invalid code');
    }

    await expect(
      h.service.enable(ID, wrongCode),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(h.prisma.$transaction)
      .not.toHaveBeenCalled();
  });
});