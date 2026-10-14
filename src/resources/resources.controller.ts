import { Controller, Get, Param, Query } from '@nestjs/common';

import { ContentQueryDto } from '../common/dto/content-query.dto';
import { ResourcesService } from './resources.service';
import type { Resource } from './resources.types';

@Controller('resources')
export class ResourcesController {
  constructor(private readonly resourcesService: ResourcesService) {}

  @Get()
  findAll(@Query() query: ContentQueryDto): Resource[] {
    return this.resourcesService.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string): Resource {
    return this.resourcesService.findOne(id);
  }
}