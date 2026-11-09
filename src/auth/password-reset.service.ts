
import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import { hash } from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';

const GENERIC = {
  message: 'If an eligible account exists, a code will be sent.',
};
const INVALID = 'Invalid or expired reset code.';

@Injectable()
export class PasswordResetService {
  private readonly logger = new Logger(PasswordResetService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  private digest(id: string, code: string): string {
    return createHmac(
      'sha256',
      this.config.getOrThrow<string>('PASSWORD_RESET_SECRET'),
    )
      .update('ted:reset:' + id + ':' + code)
      .digest('hex');
  }

  async requestCode(emailInput: string) {
    const key = this.config.get<string>('RESEND_API_KEY')?.trim();
    const from = this.config.get<string>('RESET_EMAIL_FROM')?.trim();

    if (!key || !from) {
      throw new ServiceUnavailableException(
        'Email service is not configured.',
      );
    }

    const email = emailInput.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    if (!user || !user.isActive) {
      return GENERIC;
    }

    const now = new Date();
    const old = await this.prisma.passwordResetCode.findUnique({
      where: { userId: user.id },
    });

    if (old && now.getTime() - old.sentAt.getTime() < 60000) {
      return GENERIC;
    }

    const code = randomInt(100000000).toString().padStart(8, '0');
    const codeHash = this.digest(user.id, code);

    await this.prisma.passwordResetCode.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        codeHash,
        attempts: 0,
        sentAt: now,
        expiresAt: new Date(now.getTime() + 600000),
      },
      update: {
        codeHash,
        attempts: 0,
        sentAt: now,
        expiresAt: new Date(now.getTime() + 600000),
      },
    });

    try {
      const result = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + key,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from,
          to: [email],
          subject: 'TED Education: Password reset code',
          text:
            'Your reset code is ' + code +
            '. It expires in 10 minutes. If this was not you, ignore it.',
        }),
        signal: AbortSignal.timeout(10000),
      });

      if (!result.ok) {
        throw new Error('Mail API HTTP ' + result.status);
      }
    } catch (error) {
      this.logger.warn(
        'Password reset email failed: ' +
        (error instanceof Error ? error.message : 'unknown'),
      );

      await this.prisma.passwordResetCode.deleteMany({
        where: { userId: user.id, codeHash },
      }).catch(() => undefined);
    }

    return GENERIC;
  }

  async resetPassword(
    emailInput: string,
    code: string,
    newPassword: string,
  ) {
    if (Buffer.byteLength(newPassword, 'utf8') > 72) {
      throw new BadRequestException('Password exceeds 72 bytes.');
    }

    const email = emailInput.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    if (!user || !user.isActive) {
      throw new BadRequestException(INVALID);
    }

    const record = await this.prisma.passwordResetCode.findUnique({
      where: { userId: user.id },
    });

    if (
      !record ||
      record.expiresAt <= new Date() ||
      record.attempts >= 5
    ) {
      throw new BadRequestException(INVALID);
    }

    const actual = Buffer.from(record.codeHash, 'hex');
    const expected = Buffer.from(this.digest(user.id, code), 'hex');

    if (
      actual.length !== expected.length ||
      !timingSafeEqual(actual, expected)
    ) {
      await this.prisma.passwordResetCode.updateMany({
        where: {
          userId: user.id,
          attempts: { lt: 5 },
        },
        data: { attempts: { increment: 1 } },
      });

      throw new BadRequestException(INVALID);
    }

    const passwordHash = await hash(newPassword, 12);

    await this.prisma.$transaction(async tx => {
      const consumed = await tx.passwordResetCode.deleteMany({
        where: {
          userId: user.id,
          codeHash: record.codeHash,
          attempts: { lt: 5 },
          expiresAt: { gt: new Date() },
        },
      });

      if (consumed.count !== 1) {
        throw new BadRequestException(INVALID);
      }

      await tx.user.update({
        where: { id: user.id },
        data: { passwordHash, sessionVersion: { increment: 1 } },
      });
    });


    // TED password-change notification
    // The completed password update must not fail if mail is unavailable.
    try {
      const key = this.config.get<string>('RESEND_API_KEY')?.trim();
      const from = this.config.get<string>('RESET_EMAIL_FROM')?.trim();

      if (key && from) {
        const result = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: 'Bearer ' + key,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from,
            to: [email],
            subject: 'TED Education: Your password was changed',
            text:
              'Your TED Education password was changed. ' +
              'If you did not request this, contact TED support.',
          }),
          signal: AbortSignal.timeout(3000),
        });

        if (!result.ok) {
          this.logger.warn(
            'Password notification HTTP ' + result.status,
          );
        }
      }
    } catch {
      this.logger.warn(
        'Password-change notification could not be sent.',
      );
    }

    return { message: 'Password changed. Sign in again.' };
  }
}
