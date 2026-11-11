
import { Controller, Get, Param, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiInternalServerErrorResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

import { ContentQueryDto } from '../common/dto/content-query.dto';
import { ApiErrorResponseDto } from '../common/dto/api-error-response.dto';
import { EducationArticleResponseDto } from './dto/education-article-response.dto';
import { EducationService } from './education.service';
import type { EducationArticle } from './education.types';

@ApiTags('Education')
@ApiResponse({
  status: 429,
  description: 'Rate limit exceeded.',
  type: ApiErrorResponseDto,
})
@ApiInternalServerErrorResponse({
  description: 'An unexpected server error occurred.',
  type: ApiErrorResponseDto,
})
@Controller('education')
export class EducationController {
  constructor(
    private readonly educationService: EducationService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Get education articles',
    description:
      'Retrieve education articles about Thyroid Eye Disease. ' +
      'Results can be filtered by language, category, and search term.',
  })
  @ApiOkResponse({
    description: 'List of matching education articles.',
    type: EducationArticleResponseDto,
    isArray: true,
  })
  @ApiBadRequestResponse({
    description: 'Invalid query parameters.',
    type: ApiErrorResponseDto,
  })
  findAll(@Query() query: ContentQueryDto): EducationArticle[] {
    return this.educationService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get an education article by ID',
    description:
      'Retrieve a specific education article using its unique ID.',
  })
  @ApiParam({
    name: 'id',
    description: 'Unique identifier of the education article.',
    example: 'ted-overview',
    type: String,
  })
  @ApiOkResponse({
    description: 'The requested education article.',
    type: EducationArticleResponseDto,
  })
  @ApiNotFoundResponse({
    description: 'Education article not found.',
    type: ApiErrorResponseDto,
  })
  findOne(@Param('id') id: string): EducationArticle {
    return this.educationService.findOne(id);
  }
}
