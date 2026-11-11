import {
  JWT_ISSUER,
  JWT_AUDIENCE,
  JWT_ALGORITHM,
  JWT_ACCESS_DURATION,
} from './jwt.config';
import { JwtAuthGuard } from './jwt-auth.guard';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';

import { PrismaModule } from '../prisma/prisma.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { GoogleAuthService } from './google-auth.service';
import { MfaService } from './mfa.service';
import { MfaController } from './mfa.controller';
import { PasswordResetService } from './password-reset.service';

@Module({
  imports: [
    PrismaModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
        signOptions: {
          expiresIn: JWT_ACCESS_DURATION,
          issuer: JWT_ISSUER,
          audience: JWT_AUDIENCE,
          algorithm: JWT_ALGORITHM,
        },
      }),
    }),
  ],
  controllers: [AuthController, MfaController],
  providers: [AuthService, GoogleAuthService, PasswordResetService, MfaService, JwtAuthGuard],
})
export class AuthModule {}