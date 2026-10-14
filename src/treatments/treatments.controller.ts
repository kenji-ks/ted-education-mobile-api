import { Controller, Get, Param, Query } from '@nestjs/common';

import { ContentQueryDto } from '../common/dto/content-query.dto';
import { TreatmentsService } from './treatments.service';
import type { Treatment } from './treatments.types';

@Controller('treatments')
export class TreatmentsController {
  constructor(private readonly treatmentsService: TreatmentsService) {}

  @Get()
  findAll(@Query() query: ContentQueryDto): Treatment[] {
    return this.treatmentsService.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string): Treatment {
    return this.treatmentsService.findOne(id);
  }
}