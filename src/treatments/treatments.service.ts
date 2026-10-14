import { Injectable, NotFoundException } from '@nestjs/common';

import type {
  Treatment,
  TreatmentFilters,
} from './treatments.types';

@Injectable()
export class TreatmentsService {
  private readonly treatments: Treatment[] = [
    {
      id: 'medical-treatment',
      title: 'Medical Treatment',
      summary:
        'Educational information about medical treatment options for Thyroid Eye Disease.',
      category: 'medical',
      language: 'en',
      status: 'published',
    },
    {
      id: 'radiation-treatment',
      title: 'Radiation Treatment',
      summary:
        'Educational information about radiation treatment for Thyroid Eye Disease.',
      category: 'radiation',
      language: 'en',
      status: 'published',
    },
    {
      id: 'surgical-treatment',
      title: 'Surgical Treatment',
      summary:
        'Educational information about surgical treatment options for Thyroid Eye Disease.',
      category: 'surgical',
      language: 'en',
      status: 'published',
    },
    {
      id: 'symptom-management',
      title: 'Symptom Management',
      summary:
        'Educational information about approaches used to manage TED symptoms.',
      category: 'symptom-management',
      language: 'en',
      status: 'published',
    },
  ];

  findAll(filters: TreatmentFilters = {}): Treatment[] {
    let results = this.treatments;

    if (filters.language) {
      results = results.filter(
        (treatment) => treatment.language === filters.language,
      );
    }

    if (filters.category) {
      results = results.filter(
        (treatment) => treatment.category === filters.category,
      );
    }

    if (filters.search) {
      const search = filters.search.toLowerCase().trim();

      results = results.filter(
        (treatment) =>
          treatment.title.toLowerCase().includes(search) ||
          treatment.summary.toLowerCase().includes(search),
      );
    }

    return results;
  }

  findOne(id: string): Treatment {
    const treatment = this.treatments.find((item) => item.id === id);

    if (!treatment) {
      throw new NotFoundException('Treatment not found');
    }

    return treatment;
  }
}