import {
  ConflictException,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AuthProvider, Prisma, Role } from '@prisma/client';
import { OAuth2Client } from 'google-auth-library';

import { PrismaService } from '../prisma/prisma.service';

import { MfaService } from './mfa.service';

@Injectable()
export class GoogleAuthService {
  private readonly google = new OAuth2Client();

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly mfa: MfaService,
  ) {}

  private async findGoogleUser(subject: string) {
    const identity = await this.prisma.socialAccount.findUnique({
      where: {
        provider_providerUserId: {
          provider: AuthProvider.GOOGLE,
          providerUserId: subject,
        },
      },
      include: { user: true },
    });

    return identity?.user;
  }

  async login(idToken: string) {
    const audience = this.config
      .get<string>('GOOGLE_WEB_CLIENT_ID')
      ?.trim();

    if (!audience) {
      throw new ServiceUnavailableException(
        'Google sign-in is not configured.',
      );
    }

    let payload;

    try {
      const ticket = await this.google.verifyIdToken({
        idToken,
        audience,
      });

      payload = ticket.getPayload();
    } catch {
      throw new UnauthorizedException('Invalid Google ID token.');
    }

    if (
      !payload?.sub ||
      !payload.email ||
      payload.email_verified !== true
    ) {
      throw new UnauthorizedException(
        'Google account identity could not be verified.',
      );
    }

    const subject = payload.sub;
    const email = payload.email.trim().toLowerCase();

    if (email.length > 254) {
      throw new UnauthorizedException('Invalid Google email.');
    }

    let user = await this.findGoogleUser(subject);

    if (!user) {
      const existing = await this.prisma.user.findUnique({
        where: { email },
        select: { id: true },
      });

      if (existing) {
        throw new ConflictException(
          'Email already registered. Sign in using your existing method.',
        );
      }

      const candidateName = (payload.name || '')
        .trim()
        .replace(/\s+/g, ' ');

      const fullName = (
        candidateName.length >= 2
          ? candidateName
          : 'Google User'
      ).slice(0, 120);

      const authoritativeEmail =
        email.endsWith('@gmail.com') || Boolean(payload.hd);

      try {
        user = await this.prisma.user.create({
          data: {
            email,
            fullName,
            passwordHash: null,
            role: Role.PATIENT,
            emailVerifiedAt: authoritativeEmail
              ? new Date()
              : null,
            socialAccounts: {
              create: {
                provider: AuthProvider.GOOGLE,
                providerUserId: subject,
              },
            },
          },
        });
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002'
        ) {
          // Handle simultaneous sign-in requests safely.
          user = await this.findGoogleUser(subject);

          if (!user) {
            throw new ConflictException(
              'Account already exists. Sign in using the existing method.',
            );
          }
        } else {
          throw error;
        }
      }
    }

    if (!user.isActive) {
      throw new UnauthorizedException('Account is inactive.');
    }

    return this.mfa.loginResult(user);
  }
}