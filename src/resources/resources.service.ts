import { Injectable, NotFoundException } from '@nestjs/common';

import type {
  Resource,
  ResourceFilters,
} from './resources.types';

@Injectable()
export class ResourcesService {
  private readonly resources: Resource[] = [
    {
      id: 'ted-support-group',
      name: 'TED Support Group',
      description:
        'A support resource for people living with Thyroid Eye Disease.',
      category: 'support-group',
      language: 'en',
      status: 'published',
    },
    {
      id: 'patient-education-resource',
      name: 'Patient Education Resource',
      description:
        'General educational resources for patients learning about TED.',
      category: 'education',
      language: 'en',
      status: 'published',
    },
    {
      id: 'patient-organization',
      name: 'Patient Organization',
      description:
        'Information about organizations that provide support and education for patients.',
      category: 'patient-organization',
      language: 'en',
      status: 'published',
    },
  ];

  findAll(filters: ResourceFilters = {}): Resource[] {
    let results = this.resources;

    if (filters.language) {
      results = results.filter(
        (resource) => resource.language === filters.language,
      );
    }

    if (filters.category) {
      results = results.filter(
        (resource) => resource.category === filters.category,
      );
    }

    if (filters.search) {
      const search = filters.search.toLowerCase().trim();

      results = results.filter(
        (resource) =>
          resource.name.toLowerCase().includes(search) ||
          resource.description.toLowerCase().includes(search),
      );
    }

    return results;
  }

  findOne(id: string): Resource {
    const resource = this.resources.find((item) => item.id === id);

    if (!resource) {
      throw new NotFoundException('Resource not found');
    }

    return resource;
  }
}