import { Injectable, NotFoundException } from '@nestjs/common';

import type {
  EducationArticle,
  EducationFilters,
} from './education.types';

@Injectable()
export class EducationService {
  private readonly articles: EducationArticle[] = [
    {
      id: 'ted-overview',
      title: 'What is Thyroid Eye Disease?',
      summary:
        'An introduction to Thyroid Eye Disease and how it can affect the eyes.',
      category: 'overview',
      language: 'en',
      status: 'published',
    },
    {
      id: 'ted-symptoms',
      title: 'Common Symptoms of TED',
      summary:
        'Learn about common symptoms associated with Thyroid Eye Disease.',
      category: 'symptoms',
      language: 'en',
      status: 'published',
    },
    {
      id: 'ted-risk-factors',
      title: 'TED Risk Factors',
      summary:
        'Learn about common risk factors associated with Thyroid Eye Disease.',
      category: 'risk-factors',
      language: 'en',
      status: 'published',
    },
  ];

  findAll(filters: EducationFilters = {}): EducationArticle[] {
    let results = this.articles;

    if (filters.language) {
      results = results.filter(
        (article) => article.language === filters.language,
      );
    }

    if (filters.category) {
      results = results.filter(
        (article) => article.category === filters.category,
      );
    }

    if (filters.search) {
      const search = filters.search.toLowerCase().trim();

      results = results.filter(
        (article) =>
          article.title.toLowerCase().includes(search) ||
          article.summary.toLowerCase().includes(search),
      );
    }

    return results;
  }

  findOne(id: string): EducationArticle {
    const article = this.articles.find((item) => item.id === id);

    if (!article) {
      throw new NotFoundException('Education article not found');
    }

    return article;
  }
}