
import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { compare, hash } from 'bcryptjs';
import { JwtService } from '@nestjs/jwt';
import { UnauthorizedException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { MfaService } from './mfa.service';
import { UpdateAccountDto } from './dto/update-account.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly mfa: MfaService,
  ) {}

  async login(dto: LoginDto) {
    const email = dto.email.trim().toLowerCase();

    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    if (!user || !user.isActive || !user.passwordHash ||
        !(await compare(dto.password, user.passwordHash))) {
      throw new UnauthorizedException('Invalid email or password.');
    }

    return this.mfa.loginResult(user);
  }
  async register(dto: RegisterDto) {
    const email = dto.email.trim().toLowerCase();
    const fullName = dto.fullName.trim().replace(/\s+/g, ' ');

    if (fullName.length < 2) {
      throw new BadRequestException('Full name is required.');
    }

    if (Buffer.byteLength(dto.password, 'utf8') > 72) {
      throw new BadRequestException('Password is too long.');
    }

    const existing = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });

    if (existing) {
      throw new ConflictException('Email already registered.');
    }

    const passwordHash = await hash(dto.password, 12);

    try {
      return await this.prisma.user.create({
        data: {
          email,
          fullName,
          passwordHash,
          gender: dto.gender ?? null,
          role: Role.PATIENT,
        },
        select: {
          id: true,
          fullName: true,
          email: true,
          gender: true,
          role: true,
          createdAt: true,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('Email already registered.');
      }

      throw error;
    }
  }

  async updateAccount(userId: string, dto: UpdateAccountDto) {
    const values: Prisma.UserUpdateInput = {};

    if (dto.fullName !== undefined) {
      const name = dto.fullName.trim().replace(/\s+/g,' ');
      if (name.length < 2) {
        throw new BadRequestException('Name must contain at least 2 characters.');
      }
      values.fullName = name;
    }

    if (dto.gender !== undefined) values.gender = dto.gender;
    if (dto.preferredLanguage !== undefined)
      values.preferredLanguage = dto.preferredLanguage;
    if (dto.fontScale !== undefined)
      values.fontScale = dto.fontScale;
    if (dto.highContrast !== undefined)
      values.highContrast = dto.highContrast;
    if (dto.onboardingStep !== undefined)
      values.onboardingStep = dto.onboardingStep;

    if (dto.completeOnboarding === true) {
      values.onboardingStep = 3;
      values.onboardingCompletedAt = new Date();
    }

    return this.prisma.user.update({
      where: { id: userId },
      data: values,
      select: {
        id: true, email: true, fullName: true, gender: true,
        role: true, preferredLanguage: true, fontScale: true,
        highContrast: true, onboardingStep: true,
        onboardingCompletedAt: true
      }
    });
  }
}
