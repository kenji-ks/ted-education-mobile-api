import {
  IsBoolean, IsIn, IsInt, IsNumber, IsOptional,
  IsString, Length, Max, Min
} from 'class-validator';
import { Gender } from '@prisma/client';

export class UpdateAccountDto {
  @IsOptional() @IsString() @Length(2,120)
  fullName?: string;

  @IsOptional() @IsIn(['MALE','FEMALE','PREFER_NOT_TO_SAY'])
  gender?: Gender;

  @IsOptional() @IsIn(['en','zh','ja','ko','es'])
  preferredLanguage?: string;

  @IsOptional() @IsNumber() @Min(1) @Max(2)
  fontScale?: number;

  @IsOptional() @IsBoolean()
  highContrast?: boolean;

  @IsOptional() @IsInt() @Min(0) @Max(3)
  onboardingStep?: number;

  @IsOptional() @IsBoolean()
  completeOnboarding?: boolean;
}
