import { describe, expect, it, vi } from 'vitest';
import {
  BadRequestException,
  ConflictException,
  UnauthorizedException,
} from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { hash } from 'bcryptjs';

import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { MfaService } from './mfa.service';
import { UpdateAccountDto } from './dto/update-account.dto';

const USER_ID = '11111111-1111-4111-8111-111111111111';

function authHarness() {
  const prisma = {
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  };

  const mfa = {
    loginResult: vi.fn(),
  };

  const service = new AuthService(
    prisma as never,
    {} as never,
    mfa as never,
  );

  return { prisma, mfa, service };
}

describe('TED registration security regression', () => {
  it('rejects an already registered email', async () => {
    const { prisma, service } = authHarness();

    prisma.user.findUnique.mockResolvedValue({
      id: USER_ID,
    });

    await expect(
      service.register({
        fullName: 'Test Patient',
        email: 'patient@example.com',
        password: 'SecurePassword123!',
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('rejects an invalid short name', async () => {
    const { service } = authHarness();

    await expect(
      service.register({
        fullName: 'A',
        email: 'patient@example.com',
        password: 'SecurePassword123!',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a password longer than the bcrypt input limit', async () => {
    const { service } = authHarness();

    await expect(
      service.register({
        fullName: 'Test Patient',
        email: 'patient@example.com',
        password: 'A'.repeat(73),
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('normalizes email and name before registration', async () => {
    const { prisma, service } = authHarness();

    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.create.mockResolvedValue({
      id: USER_ID,
      email: 'patient@example.com',
    });

    await service.register({
      fullName: '  Test   Patient  ',
      email: '  PATIENT@EXAMPLE.COM  ',
      password: 'SecurePassword123!',
    });

    expect(prisma.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          email: 'patient@example.com',
          fullName: 'Test Patient',
          role: 'PATIENT',
        }),
      }),
    );
  });
});

describe('TED password login regression', () => {
  it('rejects unknown users', async () => {
    const { prisma, service } = authHarness();

    prisma.user.findUnique.mockResolvedValue(null);

    await expect(
      service.login({
        email: 'unknown@example.com',
        password: 'IncorrectPassword123!',
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects an incorrect password', async () => {
    const { prisma, service } = authHarness();

    prisma.user.findUnique.mockResolvedValue({
      id: USER_ID,
      isActive: true,
      passwordHash: await hash('CorrectPassword123!', 4),
    });

    await expect(
      service.login({
        email: 'patient@example.com',
        password: 'WrongPassword123!',
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('routes a valid password login through MFA', async () => {
    const { prisma, mfa, service } = authHarness();

    prisma.user.findUnique.mockResolvedValue({
      id: USER_ID,
      isActive: true,
      sessionVersion: 0,
      passwordHash: await hash('CorrectPassword123!', 4),
    });

    mfa.loginResult.mockResolvedValue({
      mfaRequired: true,
      challengeToken: 'test-challenge',
    });

    const result = await service.login({
      email: '  PATIENT@EXAMPLE.COM ',
      password: 'CorrectPassword123!',
    });

    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { email: 'patient@example.com' },
    });

    expect(mfa.loginResult).toHaveBeenCalledTimes(1);

    expect(result).toMatchObject({
      mfaRequired: true,
      challengeToken: 'test-challenge',
    });
  });
});

describe('TED MFA login result', () => {
  it('requires a challenge when MFA is enabled', async () => {
    const prisma = {
      mfaSetting: {
        findUnique: vi.fn().mockResolvedValue({
          enabledAt: new Date(),
        }),
      },
    };

    const jwt = {
      signAsync: vi.fn().mockResolvedValue('challenge'),
    };

    const service = new MfaService(
      prisma as never,
      jwt as never,
      {} as never,
    );

    const result = await service.loginResult({
      id: USER_ID,
      sessionVersion: 3,
    });

    expect(result).toMatchObject({
      mfaRequired: true,
      challengeToken: 'challenge',
    });

    expect(jwt.signAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        purpose: 'mfa',
        sv: 3,
      }),
      expect.objectContaining({
        expiresIn: '5m',
      }),
    );
  });

  it('issues an access token when MFA is disabled', async () => {
    const prisma = {
      mfaSetting: {
        findUnique: vi.fn().mockResolvedValue(null),
      },
    };

    const jwt = {
      signAsync: vi.fn().mockResolvedValue('access-token'),
    };

    const service = new MfaService(
      prisma as never,
      jwt as never,
      {} as never,
    );

    const result = await service.loginResult({
      id: USER_ID,
      sessionVersion: 2,
    });

    expect(result).toMatchObject({
      mfaRequired: false,
      accessToken: 'access-token',
    });

    expect(jwt.signAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        purpose: 'access',
        sv: 2,
      }),
    );
  });
});

function guardHarness(
  payload: unknown,
  user: unknown,
) {
  const jwt = {
    verifyAsync: vi.fn().mockResolvedValue(payload),
  };

  const prisma = {
    user: {
      findUnique: vi.fn().mockResolvedValue(user),
    },
  };

  const request = {
    headers: {
      authorization: 'Bearer test-token',
    },
    user: undefined as unknown,
  };

  const context = {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as unknown as ExecutionContext;

  const guard = new JwtAuthGuard(
    jwt as never,
    prisma as never,
  );

  return { guard, context, request, prisma };
}

describe('TED JWT access protection', () => {
  it('rejects MFA challenge tokens as access tokens', async () => {
    const { guard, context, prisma } = guardHarness(
      {
        sub: USER_ID,
        purpose: 'mfa',
        sv: 1,
      },
      null,
    );

    await expect(
      guard.canActivate(context),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('rejects expired or invalid JWTs', async () => {
    const { guard, context } = guardHarness(null, null);

    const jwt = (guard as unknown as {
      jwt: { verifyAsync: ReturnType<typeof vi.fn> };
    }).jwt;

    jwt.verifyAsync.mockRejectedValue(
      new Error('JWT expired'),
    );

    await expect(
      guard.canActivate(context),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects old session versions', async () => {
    const { guard, context } = guardHarness(
      {
        sub: USER_ID,
        purpose: 'access',
        sv: 1,
      },
      {
        id: USER_ID,
        isActive: true,
        sessionVersion: 2,
      },
    );

    await expect(
      guard.canActivate(context),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('accepts a current full-access token', async () => {
    const { guard, context, request } = guardHarness(
      {
        sub: USER_ID,
        purpose: 'access',
        sv: 2,
      },
      {
        id: USER_ID,
        email: 'patient@example.com',
        role: 'PATIENT',
        isActive: true,
        sessionVersion: 2,
      },
    );

    await expect(
      guard.canActivate(context),
    ).resolves.toBe(true);

    expect(request.user).toMatchObject({
      id: USER_ID,
      role: 'PATIENT',
    });
  });
});

describe('TED onboarding profile persistence', () => {
  it('saves language, font and progress', async () => {
    const { prisma, service } = authHarness();

    prisma.user.update.mockResolvedValue({
      id: USER_ID,
      fullName: 'Test Patient',
      preferredLanguage: 'ko',
      fontScale: 1.25,
      onboardingStep: 2,
    });

    const dto: UpdateAccountDto = {
      fullName: '  Test   Patient ',
      preferredLanguage: 'ko',
      fontScale: 1.25,
      onboardingStep: 2,
    };

    await service.updateAccount(USER_ID, dto);

    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: USER_ID },
        data: expect.objectContaining({
          fullName: 'Test Patient',
          preferredLanguage: 'ko',
          fontScale: 1.25,
          onboardingStep: 2,
        }),
      }),
    );
  });

  it('sets completion time when onboarding finishes', async () => {
    const { prisma, service } = authHarness();

    prisma.user.update.mockResolvedValue({
      id: USER_ID,
    });

    await service.updateAccount(USER_ID, {
      completeOnboarding: true,
    });

    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          onboardingStep: 3,
          onboardingCompletedAt: expect.any(Date),
        }),
      }),
    );
  });

  it('does not accept an empty profile name', async () => {
    const { prisma, service } = authHarness();

    await expect(
      service.updateAccount(USER_ID, {
        fullName: ' ',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.user.update).not.toHaveBeenCalled();
  });
});

// Known, intentionally deferred issue.
// This is not counted as a successful security test.
describe('Known security gap', () => {
  it.todo(
    'Email/password accounts must verify mailbox ownership before full access',
  );
});
