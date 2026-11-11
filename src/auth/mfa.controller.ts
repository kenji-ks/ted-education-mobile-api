import { Body, Controller, Get, HttpCode, Post, Req, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { IsString, Matches, MaxLength } from 'class-validator';
import { MfaService } from './mfa.service';
import { JwtAuthGuard } from './jwt-auth.guard';

class CodeDto {
  @IsString()
  @Matches(/^([0-9]{6}|[A-Fa-f0-9]{8}-[A-Fa-f0-9]{8})$/)
  code!: string;
}
class VerifyDto extends CodeDto {
  @IsString()
  @MaxLength(4096)
  challengeToken!: string;
}

type AuthRequest = { user: { id: string; email: string } };

@Controller('auth/mfa')
export class MfaController {
  constructor(private readonly mfa: MfaService) {}

  @Get('status')
  @UseGuards(JwtAuthGuard)
  status(@Req() req: AuthRequest) { return this.mfa.status(req.user.id); }

  @Post('setup')
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  setup(@Req() req: AuthRequest) { return this.mfa.setup(req.user.id, req.user.email); }

  @Post('enable')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  enable(@Req() req: AuthRequest, @Body() dto: CodeDto) {
    return this.mfa.enable(req.user.id, dto.code);
  }

  @Post('verify')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  verify(@Body() dto: VerifyDto) { return this.mfa.verifyChallenge(dto.challengeToken, dto.code); }

  @Post('disable')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  disable(@Req() req: AuthRequest, @Body() dto: CodeDto) {
    return this.mfa.disable(req.user.id, dto.code);
  }
}
