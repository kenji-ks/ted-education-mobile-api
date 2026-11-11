import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength, MaxLength } from 'class-validator';

export class GoogleLoginDto {
  @ApiProperty({ writeOnly: true })
  @IsString()
  @MinLength(20)
  @MaxLength(8192)
  idToken!: string;
}