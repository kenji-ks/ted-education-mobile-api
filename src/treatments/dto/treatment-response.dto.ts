
import { ApiProperty } from '@nestjs/swagger';

import type { Treatment } from '../treatments.types';

export class TreatmentResponseDto implements Treatment {
  @ApiProperty({
    description: 'Unique identifier of the treatment.',
    example: 'medical-treatment',
  })
  id!: string;

  @ApiProperty({
    description: 'Title of the treatment option.',
    example: 'Medical Treatment',
  })
  title!: string;

  @ApiProperty({
    description: 'Educational summary of the treatment.',
    example:
      'Educational information about medical treatment options for Thyroid Eye Disease.',
  })
  summary!: string;

  @ApiProperty({
    description: 'Category of the treatment.',
    example: 'medical',
  })
  category!: string;

  @ApiProperty({
    description: 'Language of the treatment content.',
    enum: ['en', 'zh', 'ja'],
    example: 'en',
  })
  language!: string;

  @ApiProperty({
    description: 'Publication status of the treatment.',
    enum: ['published'],
    example: 'published',
  })
  status!: 'published';
}
