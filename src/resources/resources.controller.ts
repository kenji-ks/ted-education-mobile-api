
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

import { ApiErrorResponseDto } from '../common/dto/api-error-response.dto';
import { ContentQueryDto } from '../common/dto/content-query.dto';
import { ResourceResponseDto } from './dto/resource-response.dto';
import { ResourcesService } from './resources.service';
import type { Resource } from './resources.types';

@ApiTags('Resources')
@ApiResponse({
  status: 429,
  description: 'Rate limit exceeded.',
  type: ApiErrorResponseDto,
})
@ApiInternalServerErrorResponse({
  description: 'An unexpected server error occurred.',
  type: ApiErrorResponseDto,
})
@Controller('resources')
export class ResourcesController {
  constructor(
    private readonly resourcesService: ResourcesService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Get educational resources',
    description:
      'Retrieve educational resources and support information ' +
      'for patients with Thyroid Eye Disease. ' +
      'Results can be filtered by language, category, and search term.',
  })
  @ApiOkResponse({
    description: 'List of matching resources.',
    type: ResourceResponseDto,
    isArray: true,
  })
  @ApiBadRequestResponse({
    description: 'Invalid query parameters.',
    type: ApiErrorResponseDto,
  })
  findAll(@Query() query: ContentQueryDto): Resource[] {
    return this.resourcesService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get a resource by ID',
    description:
      'Retrieve a specific educational or support resource ' +
      'using its unique identifier.',
  })
  @ApiParam({
    name: 'id',
    description: 'Unique identifier of the resource.',
    example: 'ted-support-group',
    type: String,
  })
  @ApiOkResponse({
    description: 'The requested resource.',
    type: ResourceResponseDto,
  })
  @ApiNotFoundResponse({
    description: 'Resource not found.',
    type: ApiErrorResponseDto,
  })
  findOne(@Param('id') id: string): Resource {
    return this.resourcesService.findOne(id);
  }
}
