
import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

const SUPPORTED_LANGUAGES = ['en', 'zh', 'ja'] as const;

export class ContentQueryDto {
  @ApiPropertyOptional({
    description:
      'Filter content by language. ' +
      'Supported languages are English, Chinese, and Japanese.',
    enum: SUPPORTED_LANGUAGES,
    example: 'en',
  })
  @IsOptional()
  @IsIn(SUPPORTED_LANGUAGES)
  language?: string;

  @ApiPropertyOptional({
    description:
      'Filter content by category. ' +
      'Must contain between 1 and 50 characters.',
    type: String,
    minLength: 1,
    maxLength: 50,
    example: 'overview',
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  category?: string;

  @ApiPropertyOptional({
    description:
      'Search content by title or summary. ' +
      'Search is case-insensitive.',
    type: String,
    maxLength: 100,
    example: 'thyroid',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;
}
