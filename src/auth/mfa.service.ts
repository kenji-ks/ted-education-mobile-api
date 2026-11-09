import {
  BadRequestException, ConflictException, Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  createCipheriv, createDecipheriv, createHmac,
  randomBytes, timingSafeEqual,
} from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import {
  JWT_ACCESS_SECONDS, JWT_ALGORITHM, JWT_AUDIENCE, JWT_ISSUER,
} from './jwt.config';

function base32Encode(bytes: Buffer): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += alphabet[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  // A 20-byte secret contains exactly 32 Base32 symbols; no remainder.
  return out;
}

function base32Decode(text: string): Buffer {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const c of text.replace(/=+$/, '').toUpperCase()) {
    const n = alphabet.indexOf(c);
    if (n === -1) throw new Error('Invalid TOTP secret');
    value = (value << 5) | n;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

function totpStep(secret: string, code: string, lastUsed: number): number | null {
  if (!/^[0-9]{6}$/.test(code)) return null;
  const key = base32Decode(secret);
  const current = Math.floor(Date.now() / 30000);
  for (const step of [current, current - 1, current + 1]) {
    if (step <= lastUsed) continue;
    const counter = Buffer.alloc(8);
    counter.writeBigUInt64BE(BigInt(step));
    const digest = createHmac('sha1', key).update(counter).digest();
    const offset = digest[digest.length - 1] & 15;
    const value = (digest.readUInt32BE(offset) & 0x7fffffff) % 1000000;
    const expected = Buffer.from(String(value).padStart(6, '0'));
    if (timingSafeEqual(expected, Buffer.from(code))) return step;
  }
  return null;
}

@Injectable()
export class MfaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  private key(): Buffer {
    const hex = this.config.getOrThrow<string>('MFA_ENCRYPTION_KEY');
    if (!/^[0-9a-f]{64}$/i.test(hex)) {
      throw new Error('MFA_ENCRYPTION_KEY must be 64 hex characters');
    }
    return Buffer.from(hex, 'hex');
  }

  private encrypt(clear: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key(), iv);
    const data = Buffer.concat([cipher.update(clear, 'utf8'), cipher.final()]);
    return [iv, cipher.getAuthTag(), data].map(x => x.toString('base64url')).join('.');
  }

  private decrypt(value: string): string {
    const [i, t, d] = value.split('.');
    if (!i || !t || !d) throw new Error('Invalid encrypted secret');
    const decipher = createDecipheriv('aes-256-gcm', this.key(), Buffer.from(i, 'base64url'));
    decipher.setAuthTag(Buffer.from(t, 'base64url'));
    return Buffer.concat([
      decipher.update(Buffer.from(d, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  }

  private async notifyChange(userId: string, action: 'enabled' | 'disabled') {
    try {
      const key = this.config.get<string>('RESEND_API_KEY')?.trim();
      const from = this.config.get<string>('RESET_EMAIL_FROM')?.trim();
      if (!key || !from) return;
      const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
      if (!user) return;
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from, to: [user.email], subject: 'TED Education: Two-factor authentication ' + action,
          text: 'Two-factor authentication was ' + action + ' on your TED account. If this was not you, contact TED support.',
        }),
        signal: AbortSignal.timeout(5000),
      });
    } catch { /* Never fail an already-completed security change because of mail. */ }
  }

  private recoveryHash(code: string): string {
    return createHmac('sha256', this.key())
      .update('ted-mfa-recovery:' + code.replace(/-/g, '').toUpperCase())
      .digest('hex');
  }

  private async issueAccess(id: string, version: number) {
    const accessToken = await this.jwt.signAsync({
      sub: id, purpose: 'access', sv: version,
    });
    return { mfaRequired: false as const, accessToken, tokenType: 'Bearer' as const, expiresIn: JWT_ACCESS_SECONDS };
  }

  async loginResult(user: { id: string; sessionVersion: number }) {
    const factor = await this.prisma.mfaSetting.findUnique({
      where: { userId: user.id }, select: { enabledAt: true },
    });
    if (factor?.enabledAt) {
      const challengeToken = await this.jwt.signAsync(
        { sub: user.id, purpose: 'mfa', sv: user.sessionVersion },
        { expiresIn: '5m' },
      );
      return { mfaRequired: true as const, challengeToken };
    }
    return this.issueAccess(user.id, user.sessionVersion);
  }

  async status(userId: string) {
    const factor = await this.prisma.mfaSetting.findUnique({
      where: { userId }, select: { enabledAt: true, recoveryHashes: true },
    });
    return { enabled: Boolean(factor?.enabledAt), recoveryCodesRemaining: factor?.enabledAt ? factor.recoveryHashes.length : 0 };
  }

  async setup(userId: string, email: string) {
    const existing = await this.prisma.mfaSetting.findUnique({ where: { userId } });
    if (existing?.enabledAt) throw new ConflictException('Two-factor authentication is already enabled.');
    const secret = base32Encode(randomBytes(20));
    await this.prisma.mfaSetting.upsert({
      where: { userId },
      create: { userId, pendingCipher: this.encrypt(secret), pendingAt: new Date() },
      update: { pendingCipher: this.encrypt(secret), pendingAt: new Date() },
    });
    const label = encodeURIComponent('TED Education:' + email);
    const uri = 'otpauth://totp/' + label + '?secret=' + secret + '&issuer=TED%20Education&algorithm=SHA1&digits=6&period=30';
    return { secret, uri };
  }

  async enable(userId: string, code: string) {
    const factor = await this.prisma.mfaSetting.findUnique({ where: { userId } });
    if (!factor || factor.enabledAt || !factor.pendingCipher || !factor.pendingAt ||
        Date.now() - factor.pendingAt.getTime() > 600000) {
      throw new BadRequestException('Setup expired. Start again.');
    }
    const step = totpStep(this.decrypt(factor.pendingCipher), code, -1);
    if (step === null) throw new BadRequestException('Invalid authenticator code.');
    const codes = Array.from({ length: 8 }, () => {
      const s = randomBytes(8).toString('hex').toUpperCase();
      return s.slice(0, 8) + '-' + s.slice(8);
    });
    const hashes = codes.map(c => this.recoveryHash(c));
    const newVersion = await this.prisma.$transaction(async tx => {
      const updated = await tx.mfaSetting.updateMany({
        where: { userId, enabledAt: null, pendingCipher: factor.pendingCipher },
        data: {
          secretCipher: factor.pendingCipher,
          pendingCipher: null, pendingAt: null, enabledAt: new Date(),
          lastUsedStep: step, recoveryHashes: hashes, attempts: 0, lockedUntil: null,
        },
      });
      if (updated.count !== 1) throw new ConflictException('Setup changed. Try again.');
      const user = await tx.user.update({
        where: { id: userId }, data: { sessionVersion: { increment: 1 } },
        select: { sessionVersion: true },
      });
      return user.sessionVersion;
    });
    await this.notifyChange(userId, 'enabled');
    return { ...(await this.issueAccess(userId, newVersion)), recoveryCodes: codes };
  }

  private async authenticateFactor(userId: string, code: string): Promise<void> {
    await this.prisma.$executeRaw`
      UPDATE "MfaSetting" SET "attempts"=0, "lockedUntil"=NULL
      WHERE "userId"=${userId}::uuid AND "lockedUntil" IS NOT NULL AND "lockedUntil"<=NOW()
    `;
    const factor = await this.prisma.mfaSetting.findUnique({ where: { userId } });
    if (!factor?.enabledAt || !factor.secretCipher) throw new UnauthorizedException('Invalid verification code.');
    if (factor.attempts >= 5 || (factor.lockedUntil && factor.lockedUntil > new Date())) {
      throw new UnauthorizedException('Too many attempts. Try again in 15 minutes.');
    }
    const clean = code.trim().toUpperCase();
    if (/^[0-9]{6}$/.test(clean)) {
      const step = totpStep(this.decrypt(factor.secretCipher), clean, factor.lastUsedStep);
      if (step !== null) {
        const result = await this.prisma.mfaSetting.updateMany({
          where: { userId, enabledAt: { not: null }, lastUsedStep: { lt: step }, attempts: { lt: 5 } },
          data: { lastUsedStep: step, attempts: 0, lockedUntil: null },
        });
        if (result.count === 1) return;
      }
    } else if (/^[0-9A-F]{8}-[0-9A-F]{8}$/.test(clean)) {
      const digest = this.recoveryHash(clean);
      const changed = await this.prisma.$executeRaw`
        UPDATE "MfaSetting"
        SET "recoveryHashes"=array_remove("recoveryHashes", ${digest}),
            "attempts"=0, "lockedUntil"=NULL
        WHERE "userId"=${userId}::uuid AND "enabledAt" IS NOT NULL
          AND "attempts"<5 AND ${digest}=ANY("recoveryHashes")
      `;
      if (changed === 1) return;
    }
    await this.prisma.$executeRaw`
      UPDATE "MfaSetting"
      SET "attempts"=LEAST("attempts"+1, 5),
          "lockedUntil"=CASE WHEN "attempts">=4 THEN NOW()+ INTERVAL '15 minutes'
                             ELSE "lockedUntil" END
      WHERE "userId"=${userId}::uuid AND "attempts"<5
    `;
    throw new UnauthorizedException('Invalid verification code.');
  }

  async verifyChallenge(challengeToken: string, code: string) {
    let payload: { sub?: string; purpose?: string; sv?: number };
    try {
      payload = await this.jwt.verifyAsync(challengeToken, {
        algorithms: [JWT_ALGORITHM], issuer: JWT_ISSUER, audience: JWT_AUDIENCE,
      });
    } catch {
      throw new UnauthorizedException('Sign in again. Verification expired.');
    }
    if (!payload.sub || payload.purpose !== 'mfa' || typeof payload.sv !== 'number') {
      throw new UnauthorizedException('Invalid verification challenge.');
    }
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub }, select: { isActive: true, sessionVersion: true },
    });
    if (!user?.isActive || user.sessionVersion !== payload.sv) {
      throw new UnauthorizedException('Sign in again.');
    }
    await this.authenticateFactor(payload.sub, code);
    return this.issueAccess(payload.sub, user.sessionVersion);
  }

  async disable(userId: string, code: string) {
    await this.authenticateFactor(userId, code);
    const version = await this.prisma.$transaction(async tx => {
      const removed = await tx.mfaSetting.deleteMany({ where: { userId, enabledAt: { not: null } } });
      if (removed.count !== 1) throw new ConflictException('Two-factor authentication changed.');
      const user = await tx.user.update({
        where: { id: userId }, data: { sessionVersion: { increment: 1 } },
        select: { sessionVersion: true },
      });
      return user.sessionVersion;
    });
    await this.notifyChange(userId, 'disabled');
    return this.issueAccess(userId, version);
  }
}
