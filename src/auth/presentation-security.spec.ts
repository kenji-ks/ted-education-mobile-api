import {
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import {
  BadRequestException,
  ConflictException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';

import { MfaService } from './mfa.service';
import { PasswordResetService } from './password-reset.service';
import { GoogleAuthService } from './google-auth.service';

const USER_ID =
  '11111111-1111-4111-8111-111111111111';

function mfaHarness() {
  const prisma = {
    mfaSetting: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
    },
  };

  const jwt = {
    signAsync: vi.fn().mockResolvedValue('token'),
    verifyAsync: vi.fn(),
  };

  const config = {
    getOrThrow: vi.fn().mockReturnValue(
      'a'.repeat(64)
    ),
    get: vi.fn().mockReturnValue(undefined),
  };

  const service = new MfaService(
    prisma as never,
    jwt as never,
    config as never,
  );

  return { service, prisma, jwt, config };
}

describe('MFA security regression', () => {
  it('reports MFA disabled when not configured', async () => {
    const { service, prisma } = mfaHarness();

    prisma.mfaSetting.findUnique.mockResolvedValue(null);

    await expect(
      service.status(USER_ID)
    ).resolves.toEqual({
      enabled: false,
      recoveryCodesRemaining: 0,
    });
  });

  it('reports remaining recovery codes', async () => {
    const { service, prisma } = mfaHarness();

    prisma.mfaSetting.findUnique.mockResolvedValue({
      enabledAt: new Date(),
      recoveryHashes: ['hash1', 'hash2'],
    });

    await expect(
      service.status(USER_ID)
    ).resolves.toEqual({
      enabled: true,
      recoveryCodesRemaining: 2,
    });
  });

  it('prevents MFA setup when already enabled', async () => {
    const { service, prisma } = mfaHarness();

    prisma.mfaSetting.findUnique.mockResolvedValue({
      enabledAt: new Date(),
    });

    await expect(
      service.setup(USER_ID, 'patient@example.com')
    ).rejects.toBeInstanceOf(ConflictException);

    expect(prisma.mfaSetting.upsert)
      .not.toHaveBeenCalled();
  });

  it('creates a standards-based setup URI', async () => {
    const { service, prisma } = mfaHarness();

    prisma.mfaSetting.findUnique.mockResolvedValue(null);

    prisma.mfaSetting.upsert.mockResolvedValue({});

    const result = await service.setup(
      USER_ID,
      'patient@example.com'
    );

    expect(result.uri).toContain('otpauth://totp/');
    expect(result.uri).toContain('secret=');
    expect(result.uri).toContain('digits=6');

    expect(result.secret).toMatch(
      /^[A-Z2-7]+$/
    );

    expect(prisma.mfaSetting.upsert)
      .toHaveBeenCalledOnce();
  });

  it('rejects enabling MFA without valid setup', async () => {
    const { service, prisma } = mfaHarness();

    prisma.mfaSetting.findUnique.mockResolvedValue(null);

    await expect(
      service.enable(USER_ID, '123456')
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects an expired MFA challenge JWT', async () => {
    const { service, jwt } = mfaHarness();

    jwt.verifyAsync.mockRejectedValue(
      new Error('JWT expired')
    );

    await expect(
      service.verifyChallenge('expired', '123456')
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects a normal JWT used as an MFA challenge', async () => {
    const { service, jwt } = mfaHarness();

    jwt.verifyAsync.mockResolvedValue({
      sub: USER_ID,
      purpose: 'access',
      sv: 1,
    });

    await expect(
      service.verifyChallenge('normal-token', '123456')
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects a challenge for an inactive user', async () => {
    const { service, jwt, prisma } = mfaHarness();

    jwt.verifyAsync.mockResolvedValue({
      sub: USER_ID,
      purpose: 'mfa',
      sv: 2,
    });

    prisma.user.findUnique.mockResolvedValue({
      isActive: false,
      sessionVersion: 2,
    });

    await expect(
      service.verifyChallenge('challenge', '123456')
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects a challenge with an outdated session', async () => {
    const { service, jwt, prisma } = mfaHarness();

    jwt.verifyAsync.mockResolvedValue({
      sub: USER_ID,
      purpose: 'mfa',
      sv: 1,
    });

    prisma.user.findUnique.mockResolvedValue({
      isActive: true,
      sessionVersion: 2,
    });

    await expect(
      service.verifyChallenge('challenge', '123456')
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});

function resetHarness() {
  const prisma = {
    user: {
      findUnique: vi.fn(),
    },
    passwordResetCode: {
      findUnique: vi.fn(),
      updateMany: vi.fn(),
    },
  };

  const config = {
    get: vi.fn(),
    getOrThrow: vi.fn().mockReturnValue(
      'test-secret-for-unit-tests'
    ),
  };

  const service = new PasswordResetService(
    prisma as never,
    config as never,
  );

  return { service, prisma, config };
}

describe('Password recovery security regression', () => {
  it('rejects sending mail without configuration', async () => {
    const { service } = resetHarness();

    await expect(
      service.requestCode('patient@example.com')
    ).rejects.toBeInstanceOf(
      ServiceUnavailableException
    );
  });

  it('does not expose whether an unknown email exists', async () => {
    const { service, prisma, config } = resetHarness();

    config.get.mockImplementation((key: string) => {
      if (key === 'RESEND_API_KEY') return 'test-key';
      if (key === 'RESET_EMAIL_FROM')
        return 'TED <test@example.com>';
      return undefined;
    });

    prisma.user.findUnique.mockResolvedValue(null);

    const result = await service.requestCode(
      'unknown@example.com'
    );

    expect(result.message).toContain(
      'If an eligible account exists'
    );
  });

  it('rejects passwords exceeding bcrypt length', async () => {
    const { service } = resetHarness();

    await expect(
      service.resetPassword(
        'patient@example.com',
        '12345678',
        'A'.repeat(73),
      )
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects password reset for an unknown user', async () => {
    const { service, prisma } = resetHarness();

    prisma.user.findUnique.mockResolvedValue(null);

    await expect(
      service.resetPassword(
        'unknown@example.com',
        '12345678',
        'ValidPassword123!'
      )
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects expired reset codes', async () => {
    const { service, prisma } = resetHarness();

    prisma.user.findUnique.mockResolvedValue({
      id: USER_ID,
      isActive: true,
    });

    prisma.passwordResetCode.findUnique.mockResolvedValue({
      codeHash: '0'.repeat(64),
      attempts: 0,
      expiresAt: new Date(Date.now() - 1000),
    });

    await expect(
      service.resetPassword(
        'patient@example.com',
        '12345678',
        'ValidPassword123!'
      )
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a locked recovery code', async () => {
    const { service, prisma } = resetHarness();

    prisma.user.findUnique.mockResolvedValue({
      id: USER_ID,
      isActive: true,
    });

    prisma.passwordResetCode.findUnique.mockResolvedValue({
      codeHash: '0'.repeat(64),
      attempts: 5,
      expiresAt: new Date(Date.now() + 60000),
    });

    await expect(
      service.resetPassword(
        'patient@example.com',
        '12345678',
        'ValidPassword123!'
      )
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('counts an incorrect recovery code attempt', async () => {
    const { service, prisma } = resetHarness();

    prisma.user.findUnique.mockResolvedValue({
      id: USER_ID,
      isActive: true,
    });

    prisma.passwordResetCode.findUnique.mockResolvedValue({
      codeHash: '0'.repeat(64),
      attempts: 0,
      expiresAt: new Date(Date.now() + 60000),
    });

    prisma.passwordResetCode.updateMany.mockResolvedValue({
      count: 1,
    });

    await expect(
      service.resetPassword(
        'patient@example.com',
        '12345678',
        'ValidPassword123!'
      )
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.passwordResetCode.updateMany)
      .toHaveBeenCalledOnce();
  });
});

describe('Google authentication security regression', () => {
  it('refuses login without a configured client ID', async () => {
    const config = {
      get: vi.fn().mockReturnValue(undefined),
    };

    const service = new GoogleAuthService(
      {} as never,
      {} as never,
      config as never,
      {} as never,
    );

    await expect(
      service.login('untrusted-token')
    ).rejects.toBeInstanceOf(
      ServiceUnavailableException
    );
  });
});
