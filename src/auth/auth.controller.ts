import { Get, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from './jwt-auth.guard';
import { Body, Controller, HttpCode, Post, Patch } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';

import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { GoogleLoginDto } from './dto/google-login.dto';
import { GoogleAuthService } from './google-auth.service';
import { PasswordResetService } from './password-reset.service';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { UpdateAccountDto } from './dto/update-account.dto';

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly googleAuthService: GoogleAuthService,
    private readonly passwordResetService: PasswordResetService,
  ) {}

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@Req() request: { user: unknown }) {
    return request.user;
  }
  @Post('login')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }
  @Post('google')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({ summary: 'Sign in with Google' })
  googleLogin(@Body() dto: GoogleLoginDto) {
    return this.googleAuthService.login(dto.idToken);
  }

  @Post('register')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({
    summary: 'Register a patient account',
  })
  @ApiCreatedResponse({
    description: 'Patient account created successfully.',
  })
  @ApiBadRequestResponse({
    description: 'Invalid registration data.',
  })
  @ApiConflictResponse({
    description: 'Email is already registered.',
  })
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('forgot-password')
  @HttpCode(200)
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  @ApiOperation({ summary: 'Request password reset code' })
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.passwordResetService.requestCode(dto.email);
  }

  @Post('reset-password')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: 'Reset password with code' })
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.passwordResetService.resetPassword(
      dto.email,
      dto.code,
      dto.newPassword
    );
  }

  @Patch('profile')
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  profile(
    @Req() req: { user: { id: string } },
    @Body() dto: UpdateAccountDto
  ) {
    return this.authService.updateAccount(req.user.id, dto);
  }
}
