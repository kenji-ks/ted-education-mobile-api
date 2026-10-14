
import { NotFoundException } from '@nestjs/common';
import {
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest';

import { EducationService } from './education.service';

describe('EducationService (unit)', () => {
  let service: EducationService;

  beforeEach(() => {
    service = new EducationService();
  });

  describe('findAll', () => {
    it('returns all articles without filters', () => {
      const results = service.findAll();

      expect(results).toHaveLength(3);

      expect(results.map((article) => article.id)).toEqual([
        'ted-overview',
        'ted-symptoms',
        'ted-risk-factors',
      ]);
    });

    it('returns all articles with empty filters', () => {
      const results = service.findAll({});

      expect(results).toHaveLength(3);
    });

    it('filters articles by matching language', () => {
      const results = service.findAll({
        language: 'en',
      });

      expect(results).toHaveLength(3);

      expect(
        results.every((article) => article.language === 'en'),
      ).toBe(true);
    });

    it('returns no articles for an unmatched language', () => {
      const results = service.findAll({
        language: 'zh',
      });

      expect(results).toEqual([]);
    });

    it('filters articles by category', () => {
      const results = service.findAll({
        category: 'overview',
      });

      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('ted-overview');
    });

    it('filters the symptoms category', () => {
      const results = service.findAll({
        category: 'symptoms',
      });

      expect(results.map((article) => article.id)).toEqual([
        'ted-symptoms',
      ]);
    });

    it('filters the risk-factors category', () => {
      const results = service.findAll({
        category: 'risk-factors',
      });

      expect(results.map((article) => article.id)).toEqual([
        'ted-risk-factors',
      ]);
    });

    it('returns no articles for an unknown category', () => {
      const results = service.findAll({
        category: 'unknown',
      });

      expect(results).toEqual([]);
    });

    it('searches article titles', () => {
      const results = service.findAll({
        search: 'Common Symptoms',
      });

      expect(results.map((article) => article.id)).toEqual([
        'ted-symptoms',
      ]);
    });

    it('searches article summaries', () => {
      const results = service.findAll({
        search: 'an introduction',
      });

      expect(results.map((article) => article.id)).toEqual([
        'ted-overview',
      ]);
    });

    it('matches searches regardless of case', () => {
      const results = service.findAll({
        search: 'RISK FACTORS',
      });

      expect(results.map((article) => article.id)).toEqual([
        'ted-risk-factors',
      ]);
    });

    it('trims surrounding whitespace from search', () => {
      const results = service.findAll({
        search: '  Common Symptoms  ',
      });

      expect(results.map((article) => article.id)).toEqual([
        'ted-symptoms',
      ]);
    });

    it('returns no articles for unmatched search terms', () => {
      const results = service.findAll({
        search: 'nonexistent-article',
      });

      expect(results).toEqual([]);
    });

    it('combines matching language and category filters', () => {
      const results = service.findAll({
        language: 'en',
        category: 'symptoms',
      });

      expect(results.map((article) => article.id)).toEqual([
        'ted-symptoms',
      ]);
    });

    it('combines language, category, and search filters', () => {
      const results = service.findAll({
        language: 'en',
        category: 'risk-factors',
        search: 'risk factors',
      });

      expect(results.map((article) => article.id)).toEqual([
        'ted-risk-factors',
      ]);
    });

    it('returns no results when filters conflict', () => {
      const results = service.findAll({
        language: 'en',
        category: 'overview',
        search: 'symptoms',
      });

      expect(results).toEqual([]);
    });

    it('returns no results when language conflicts with other filters', () => {
      const results = service.findAll({
        language: 'zh',
        category: 'overview',
        search: 'thyroid',
      });

      expect(results).toEqual([]);
    });

    it('returns all articles when search contains only whitespace', () => {
      const results = service.findAll({
        search: '   ',
      });

      expect(results).toHaveLength(3);
    });

    it('returns all matching articles for a broad search', () => {
      const results = service.findAll({
        search: 'thyroid eye disease',
      });

      expect(results).toHaveLength(3);
    });

    it('does not modify the original article collection', () => {
      service.findAll({
        category: 'overview',
      });

      const results = service.findAll();

      expect(results).toHaveLength(3);
    });
  });

  describe('findOne', () => {
    it('returns an article by its ID', () => {
      const article = service.findOne('ted-overview');

      expect(article).toMatchObject({
        id: 'ted-overview',
        title: 'What is Thyroid Eye Disease?',
        category: 'overview',
        language: 'en',
        status: 'published',
      });
    });

    it('returns the correct article for every known ID', () => {
      const ids = [
        'ted-overview',
        'ted-symptoms',
        'ted-risk-factors',
      ];

      for (const id of ids) {
        expect(service.findOne(id).id).toBe(id);
      }
    });

    it('throws NotFoundException for an unknown ID', () => {
      expect(() =>
        service.findOne('unknown-article'),
      ).toThrow(NotFoundException);
    });

    it('returns HTTP 404 for an unknown ID', () => {
      try {
        service.findOne('unknown-article');
        expect.fail('Expected NotFoundException');
      } catch (error) {
        expect(error).toBeInstanceOf(NotFoundException);

        if (error instanceof NotFoundException) {
          expect(error.getStatus()).toBe(404);
          expect(error.message).toBe(
            'Education article not found',
          );
        }
      }
    });

    it('throws NotFoundException for an empty ID', () => {
      expect(() => service.findOne('')).toThrow(
        NotFoundException,
      );
    });

    it('matches IDs case-sensitively', () => {
      expect(() =>
        service.findOne('TED-OVERVIEW'),
      ).toThrow(NotFoundException);
    });
  });
});
