import { Controller, Get, Param, Query } from '@nestjs/common';

import { ContentQueryDto } from '../common/dto/content-query.dto';
import { EducationService } from './education.service';
import type { EducationArticle } from './education.types';

@Controller('education')
export class EducationController {
  constructor(private readonly educationService: EducationService) {}

  @Get()
  findAll(@Query() query: ContentQueryDto): EducationArticle[] {
    return this.educationService.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string): EducationArticle {
    return this.educationService.findOne(id);
  }
}