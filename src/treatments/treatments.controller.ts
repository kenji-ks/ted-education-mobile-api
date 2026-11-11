
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
import { TreatmentResponseDto } from './dto/treatment-response.dto';
import { TreatmentsService } from './treatments.service';
import type { Treatment } from './treatments.types';

@ApiTags('Treatments')
@ApiResponse({
  status: 429,
  description: 'Rate limit exceeded.',
  type: ApiErrorResponseDto,
})
@ApiInternalServerErrorResponse({
  description: 'An unexpected server error occurred.',
  type: ApiErrorResponseDto,
})
@Controller('treatments')
export class TreatmentsController {
  constructor(
    private readonly treatmentsService: TreatmentsService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Get treatment options',
    description:
      'Retrieve educational information about treatment options ' +
      'for Thyroid Eye Disease. Results can be filtered by ' +
      'language, category, and search term.',
  })
  @ApiOkResponse({
    description: 'List of matching treatment options.',
    type: TreatmentResponseDto,
    isArray: true,
  })
  @ApiBadRequestResponse({
    description: 'Invalid query parameters.',
    type: ApiErrorResponseDto,
  })
  findAll(@Query() query: ContentQueryDto): Treatment[] {
    return this.treatmentsService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get a treatment by ID',
    description:
      'Retrieve information about a specific treatment option ' +
      'using its unique identifier.',
  })
  @ApiParam({
    name: 'id',
    description: 'Unique identifier of the treatment.',
    example: 'medical-treatment',
    type: String,
  })
  @ApiOkResponse({
    description: 'The requested treatment option.',
    type: TreatmentResponseDto,
  })
  @ApiNotFoundResponse({
    description: 'Treatment not found.',
    type: ApiErrorResponseDto,
  })
  findOne(@Param('id') id: string): Treatment {
    return this.treatmentsService.findOne(id);
  }
}
