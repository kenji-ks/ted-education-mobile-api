
import { ApiProperty } from '@nestjs/swagger';

import type { EducationArticle } from '../education.types';

export class EducationArticleResponseDto
  implements EducationArticle
{
  @ApiProperty({
    description: 'Unique identifier of the education article.',
    example: 'ted-overview',
  })
  id!: string;

  @ApiProperty({
    description: 'Title of the education article.',
    example: 'What is Thyroid Eye Disease?',
  })
  title!: string;

  @ApiProperty({
    description: 'Short summary of the article.',
    example:
      'An introduction to Thyroid Eye Disease and how it can affect the eyes.',
  })
  summary!: string;

  @ApiProperty({
    description: 'Category of the article.',
    example: 'overview',
  })
  category!: string;

  @ApiProperty({
    description: 'Language of the article.',
    enum: ['en', 'zh', 'ja'],
    example: 'en',
  })
  language!: string;

  @ApiProperty({
    description: 'Publication status of the article.',
    enum: ['published'],
    example: 'published',
  })
  status!: 'published';
}
