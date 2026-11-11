import { ApiProperty } from '@nestjs/swagger';
import {
  IsEmail, IsString, Matches, MaxLength, MinLength
} from 'class-validator';

export class ResetPasswordDto {
  @ApiProperty()
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @ApiProperty({ writeOnly: true })
  @Matches(/^\d{8}$/)
  code!: string;

  @ApiProperty({ writeOnly: true })
  @IsString()
  @MinLength(12)
  @MaxLength(72)
  newPassword!: string;
}
