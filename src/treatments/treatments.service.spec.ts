
import { NotFoundException } from '@nestjs/common';
import {
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest';

import { TreatmentsService } from './treatments.service';

describe('TreatmentsService (unit)', () => {
  let service: TreatmentsService;

  beforeEach(() => {
    service = new TreatmentsService();
  });

  describe('findAll', () => {
    it('returns all treatments without filters', () => {
      const results = service.findAll();

      expect(results).toHaveLength(4);

      expect(results.map((item) => item.id)).toEqual([
        'medical-treatment',
        'radiation-treatment',
        'surgical-treatment',
        'symptom-management',
      ]);
    });

    it('returns all treatments with empty filters', () => {
      expect(service.findAll({})).toHaveLength(4);
    });

    it('filters by matching language', () => {
      const results = service.findAll({
        language: 'en',
      });

      expect(results).toHaveLength(4);
      expect(results.every((item) => item.language === 'en')).toBe(
        true,
      );
    });

    it('returns no treatments for an unmatched language', () => {
      expect(
        service.findAll({ language: 'zh' }),
      ).toEqual([]);
    });

    it('filters by category', () => {
      const results = service.findAll({
        category: 'medical',
      });

      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('medical-treatment');
    });

    it('returns no treatments for an unknown category', () => {
      expect(
        service.findAll({ category: 'unknown' }),
      ).toEqual([]);
    });

    it('searches treatment titles', () => {
      const results = service.findAll({
        search: 'Medical Treatment',
      });

      expect(results.map((item) => item.id)).toEqual([
        'medical-treatment',
      ]);
    });

    it('searches treatment summaries', () => {
      const results = service.findAll({
        search: 'approaches used to manage',
      });

      expect(results.map((item) => item.id)).toEqual([
        'symptom-management',
      ]);
    });

    it('matches titles using case-insensitive search', () => {
      const results = service.findAll({
        search: 'SURGICAL',
      });

      expect(results.map((item) => item.id)).toEqual([
        'surgical-treatment',
      ]);
    });

    it('trims surrounding whitespace from search', () => {
      const results = service.findAll({
        search: '  radiation  ',
      });

      expect(results.map((item) => item.id)).toEqual([
        'radiation-treatment',
      ]);
    });

    it('returns no results for an unmatched search', () => {
      expect(
        service.findAll({ search: 'nonexistent-treatment' }),
      ).toEqual([]);
    });

    it('combines matching language and category filters', () => {
      const results = service.findAll({
        language: 'en',
        category: 'radiation',
      });

      expect(results.map((item) => item.id)).toEqual([
        'radiation-treatment',
      ]);
    });

    it('combines language, category, and search filters', () => {
      const results = service.findAll({
        language: 'en',
        category: 'surgical',
        search: 'surgical',
      });

      expect(results.map((item) => item.id)).toEqual([
        'surgical-treatment',
      ]);
    });

    it('returns no results when filters conflict', () => {
      const results = service.findAll({
        language: 'en',
        category: 'medical',
        search: 'radiation',
      });

      expect(results).toEqual([]);
    });

    it('returns no results when the language conflicts with other filters', () => {
      const results = service.findAll({
        language: 'zh',
        category: 'medical',
        search: 'medical',
      });

      expect(results).toEqual([]);
    });

    it('returns all treatments when search is whitespace only', () => {
      const results = service.findAll({
        search: '   ',
      });

      expect(results).toHaveLength(4);
    });
  });

  describe('findOne', () => {
    it('returns a treatment by ID', () => {
      const result = service.findOne('medical-treatment');

      expect(result).toMatchObject({
        id: 'medical-treatment',
        title: 'Medical Treatment',
        category: 'medical',
        language: 'en',
        status: 'published',
      });
    });

    it('returns the correct treatment for every known ID', () => {
      const ids = [
        'medical-treatment',
        'radiation-treatment',
        'surgical-treatment',
        'symptom-management',
      ];

      for (const id of ids) {
        expect(service.findOne(id).id).toBe(id);
      }
    });

    it('throws NotFoundException for an unknown ID', () => {
      expect(() =>
        service.findOne('unknown-treatment'),
      ).toThrow(NotFoundException);
    });

    it('returns HTTP 404 for an unknown ID', () => {
      try {
        service.findOne('unknown-treatment');
        expect.fail('Expected NotFoundException');
      } catch (error) {
        expect(error).toBeInstanceOf(NotFoundException);

        if (error instanceof NotFoundException) {
          expect(error.getStatus()).toBe(404);
        }
      }
    });

    it('throws NotFoundException for an empty ID', () => {
      expect(() => service.findOne('')).toThrow(
        NotFoundException,
      );
    });

    it('does not match IDs case-insensitively', () => {
      expect(() =>
        service.findOne('MEDICAL-TREATMENT'),
      ).toThrow(NotFoundException);
    });
  });
});
