import {
  JWT_ISSUER,
  JWT_AUDIENCE,
  JWT_ALGORITHM,
} from './jwt.config';
import {
  CanActivate, ExecutionContext, Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp()
      .getRequest<Request & { user?: unknown }>();

    const [scheme, token] =
      (req.headers.authorization ?? '').split(' ');

    if (scheme !== 'Bearer' || !token) {
      throw new UnauthorizedException();
    }

    let payload: { sub?: string };

    try {
      payload = await this.jwt.verifyAsync(token, {
        algorithms: [JWT_ALGORITHM],
        issuer: JWT_ISSUER,
        audience: JWT_AUDIENCE,
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }

    if (!payload.sub ||
        !/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(payload.sub)) {
      throw new UnauthorizedException();
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        email: true,
        fullName: true,
        gender: true,
        role: true,
        isActive: true,
      },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException();
    }

    const { isActive, ...safeUser } = user;
    req.user = safeUser;
    return true;
  }
}
