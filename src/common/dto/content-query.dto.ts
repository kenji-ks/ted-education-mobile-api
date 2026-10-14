import {
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class ContentQueryDto {
  @IsOptional()
  @IsIn(['en', 'zh', 'ja'])
  language?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  category?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;
}