
import { ApiProperty } from '@nestjs/swagger';

import type { Resource } from '../resources.types';

export class ResourceResponseDto implements Resource {
  @ApiProperty({
    description: 'Unique identifier of the resource.',
    example: 'ted-support-group',
  })
  id!: string;

  @ApiProperty({
    description: 'Name of the resource.',
    example: 'TED Support Group',
  })
  name!: string;

  @ApiProperty({
    description: 'Description of the resource.',
    example:
      'A support resource for people living with Thyroid Eye Disease.',
  })
  description!: string;

  @ApiProperty({
    description: 'Category of the resource.',
    example: 'support-group',
  })
  category!: string;

  @ApiProperty({
    description: 'Language of the resource content.',
    enum: ['en', 'zh', 'ja'],
    example: 'en',
  })
  language!: string;

  @ApiProperty({
    description: 'Publication status of the resource.',
    enum: ['published'],
    example: 'published',
  })
  status!: 'published';
}
