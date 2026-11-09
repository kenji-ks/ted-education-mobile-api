import { describe, expect, it, vi } from 'vitest';
import {
  ConflictException,
  UnauthorizedException,
} from '@nestjs/common';
import { Gender, Prisma } from '@prisma/client';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';

import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { PrismaService } from '../prisma/prisma.service';

import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { GoogleLoginDto } from './dto/google-login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { UpdateAccountDto } from './dto/update-account.dto';

const USER_ID = '11111111-1111-4111-8111-111111111111';

function makeAuth() {
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

  return { service, prisma, mfa };
}

describe('AuthService uncovered registration branches', () => {
  it('handles a concurrent duplicate-email P2002 error', async () => {
    const { service, prisma } = makeAuth();

    prisma.user.findUnique.mockResolvedValue(null);

    const error = new Prisma.PrismaClientKnownRequestError(
      'Unique constraint failed',
      {
        code: 'P2002',
        clientVersion: '6.19.3',
      },
    );

    prisma.user.create.mockRejectedValue(error);

    await expect(
      service.register({
        email: 'patient@example.com',
        fullName: 'Test Patient',
        password: 'ValidPassword123!',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('does not disguise an unrelated database failure', async () => {
    const { service, prisma } = makeAuth();

    const error = new Error('Database connection failed');

    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.create.mockRejectedValue(error);

    await expect(
      service.register({
        email: 'patient@example.com',
        fullName: 'Test Patient',
        password: 'ValidPassword123!',
      }),
    ).rejects.toBe(error);
  });

  it('preserves the selected gender during registration', async () => {
    const { service, prisma } = makeAuth();

    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.create.mockResolvedValue({
      id: USER_ID,
    });

    await service.register({
      email: 'patient@example.com',
      fullName: 'Test Patient',
      password: 'ValidPassword123!',
      gender: Gender.FEMALE,
    });

    expect(prisma.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          gender: Gender.FEMALE,
          role: 'PATIENT',
        }),
      }),
    );
  });
});

describe('AuthService remaining login branches', () => {
  it('rejects a disabled account', async () => {
    const { service, prisma, mfa } = makeAuth();

    prisma.user.findUnique.mockResolvedValue({
      id: USER_ID,
      isActive: false,
      passwordHash: 'not-used',
    });

    await expect(
      service.login({
        email: 'patient@example.com',
        password: 'ValidPassword123!',
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(mfa.loginResult).not.toHaveBeenCalled();
  });

  it('rejects an account without a password', async () => {
    const { service, prisma, mfa } = makeAuth();

    prisma.user.findUnique.mockResolvedValue({
      id: USER_ID,
      isActive: true,
      passwordHash: null,
    });

    await expect(
      service.login({
        email: 'patient@example.com',
        password: 'ValidPassword123!',
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(mfa.loginResult).not.toHaveBeenCalled();
  });
});

describe('AuthService profile update branches', () => {
  it('updates every optional profile preference', async () => {
    const { service, prisma } = makeAuth();

    prisma.user.update.mockResolvedValue({
      id: USER_ID,
    });

    await service.updateAccount(USER_ID, {
      fullName: '  Alice    Smith  ',
      gender: Gender.FEMALE,
      preferredLanguage: 'es',
      fontScale: 1.5,
      highContrast: true,
      onboardingStep: 2,
      completeOnboarding: false,
    });

    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: USER_ID },
        data: {
          fullName: 'Alice Smith',
          gender: Gender.FEMALE,
          preferredLanguage: 'es',
          fontScale: 1.5,
          highContrast: true,
          onboardingStep: 2,
        },
      }),
    );
  });

  it('does not overwrite preferences on an empty patch', async () => {
    const { service, prisma } = makeAuth();

    prisma.user.update.mockResolvedValue({
      id: USER_ID,
    });

    await service.updateAccount(USER_ID, {});

    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {},
      }),
    );
  });
});

describe('AuthController route delegation', () => {
  function makeController() {
    const auth = {
      login: vi.fn().mockResolvedValue({ token: 'demo' }),
      register: vi.fn().mockResolvedValue({ id: USER_ID }),
      updateAccount: vi.fn().mockResolvedValue({ id: USER_ID }),
    };

    const google = {
      login: vi.fn().mockResolvedValue({ token: 'google-demo' }),
    };

    const reset = {
      requestCode: vi.fn().mockResolvedValue({ message: 'sent' }),
      resetPassword: vi.fn().mockResolvedValue({ message: 'changed' }),
    };

    const controller = new AuthController(
      auth as never,
      google as never,
      reset as never,
    );

    return { controller, auth, google, reset };
  }

  it('returns the authenticated request user', () => {
    const { controller } = makeController();
    const user = { id: USER_ID, role: 'PATIENT' };

    expect(controller.me({ user })).toBe(user);
  });

  it('delegates password login', async () => {
    const { controller, auth } = makeController();
    const dto = {
      email: 'patient@example.com',
      password: 'ValidPassword123!',
    };

    await expect(controller.login(dto)).resolves.toEqual({
      token: 'demo',
    });

    expect(auth.login).toHaveBeenCalledWith(dto);
  });

  it('delegates Google login using the ID token', async () => {
    const { controller, google } = makeController();

    await expect(
      controller.googleLogin({
        idToken: 'google-id-token',
      }),
    ).resolves.toEqual({
      token: 'google-demo',
    });

    expect(google.login).toHaveBeenCalledWith(
      'google-id-token',
    );
  });

  it('delegates registration', async () => {
    const { controller, auth } = makeController();
    const dto = {
      fullName: 'Test Patient',
      email: 'patient@example.com',
      password: 'ValidPassword123!',
    };

    await controller.register(dto);

    expect(auth.register).toHaveBeenCalledWith(dto);
  });

  it('delegates the forgot-password request', async () => {
    const { controller, reset } = makeController();

    await controller.forgotPassword({
      email: 'patient@example.com',
    });

    expect(reset.requestCode).toHaveBeenCalledWith(
      'patient@example.com',
    );
  });

  it('delegates password reset with all three fields', async () => {
    const { controller, reset } = makeController();

    await controller.resetPassword({
      email: 'patient@example.com',
      code: '12345678',
      newPassword: 'ValidPassword123!',
    });

    expect(reset.resetPassword).toHaveBeenCalledWith(
      'patient@example.com',
      '12345678',
      'ValidPassword123!',
    );
  });

  it('uses the authenticated user ID for profile updates', async () => {
    const { controller, auth } = makeController();
    const dto = { preferredLanguage: 'ja' };

    await controller.profile({
      user: { id: USER_ID },
    }, dto);

    expect(auth.updateAccount).toHaveBeenCalledWith(
      USER_ID,
      dto,
    );
  });
});

describe('Authentication DTO validation', () => {
  async function errors<T extends object>(
    type: new () => T,
    input: Record<string, unknown>,
  ) {
    const instance = plainToInstance(type, input);
    const result = await validate(instance);

    return result.map(e => e.property);
  }

  it('rejects invalid registration fields', async () => {
    const fields = await errors(RegisterDto, {
      fullName: ' ',
      email: 'invalid',
      password: 'short',
      gender: 'UNKNOWN',
    });

    expect(fields).toContain('fullName');
    expect(fields).toContain('email');
    expect(fields).toContain('password');
    expect(fields).toContain('gender');
  });

  it('accepts a valid registration DTO', async () => {
    expect(await errors(RegisterDto, {
      fullName: 'Test Patient',
      email: 'patient@example.com',
      password: 'ValidPassword123!',
      gender: Gender.MALE,
    })).toEqual([]);
  });

  it('rejects invalid login input', async () => {
    const fields = await errors(LoginDto, {
      email: 'invalid',
      password: '',
    });

    expect(fields).toContain('email');
    expect(fields).toContain('password');
  });

  it('validates the Google ID token length', async () => {
    const fields = await errors(GoogleLoginDto, {
      idToken: 'short',
    });

    expect(fields).toContain('idToken');
  });

  it('rejects invalid recovery email', async () => {
    const fields = await errors(ForgotPasswordDto, {
      email: 'not-an-email',
    });

    expect(fields).toContain('email');
  });

  it('rejects malformed reset codes and passwords', async () => {
    const fields = await errors(ResetPasswordDto, {
      email: 'patient@example.com',
      code: '12345',
      newPassword: 'short',
    });

    expect(fields).toContain('code');
    expect(fields).toContain('newPassword');
  });

  it('rejects invalid profile preferences', async () => {
    const fields = await errors(UpdateAccountDto, {
      fullName: 'A',
      gender: 'UNKNOWN',
      preferredLanguage: 'xx',
      fontScale: 3,
      highContrast: 'yes',
      onboardingStep: 10,
      completeOnboarding: 'yes',
    });

    expect(fields).toHaveLength(7);
  });

  it('accepts valid onboarding preferences', async () => {
    const fields = await errors(UpdateAccountDto, {
      fullName: 'Test Patient',
      gender: Gender.FEMALE,
      preferredLanguage: 'ko',
      fontScale: 1.25,
      highContrast: false,
      onboardingStep: 2,
      completeOnboarding: true,
    });

    expect(fields).toEqual([]);
  });
});

describe('PrismaService lifecycle', () => {
  it('connects when the module initializes', async () => {
    const connect = vi.fn().mockResolvedValue(undefined);

    await PrismaService.prototype.onModuleInit.call({
      $connect: connect,
    } as never);

    expect(connect).toHaveBeenCalledOnce();
  });

  it('disconnects when the module is destroyed', async () => {
    const disconnect = vi.fn().mockResolvedValue(undefined);

    await PrismaService.prototype.onModuleDestroy.call({
      $disconnect: disconnect,
    } as never);

    expect(disconnect).toHaveBeenCalledOnce();
  });
});
