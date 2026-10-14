
import { NotFoundException } from '@nestjs/common';
import {
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest';

import { ResourcesService } from './resources.service';

describe('ResourcesService (unit)', () => {
  let service: ResourcesService;

  beforeEach(() => {
    service = new ResourcesService();
  });

  describe('findAll', () => {
    it('returns all resources without filters', () => {
      const results = service.findAll();

      expect(results).toHaveLength(3);

      expect(results.map((resource) => resource.id)).toEqual([
        'ted-support-group',
        'patient-education-resource',
        'patient-organization',
      ]);
    });

    it('returns all resources with empty filters', () => {
      const results = service.findAll({});

      expect(results).toHaveLength(3);
    });

    it('filters resources by matching language', () => {
      const results = service.findAll({
        language: 'en',
      });

      expect(results).toHaveLength(3);

      expect(
        results.every((resource) => resource.language === 'en'),
      ).toBe(true);
    });

    it('returns no resources for an unmatched language', () => {
      const results = service.findAll({
        language: 'zh',
      });

      expect(results).toEqual([]);
    });

    it('filters resources by category', () => {
      const results = service.findAll({
        category: 'support-group',
      });

      expect(results.map((resource) => resource.id)).toEqual([
        'ted-support-group',
      ]);
    });

    it('filters the education category', () => {
      const results = service.findAll({
        category: 'education',
      });

      expect(results.map((resource) => resource.id)).toEqual([
        'patient-education-resource',
      ]);
    });

    it('filters the patient-organization category', () => {
      const results = service.findAll({
        category: 'patient-organization',
      });

      expect(results.map((resource) => resource.id)).toEqual([
        'patient-organization',
      ]);
    });

    it('returns no resources for an unknown category', () => {
      const results = service.findAll({
        category: 'unknown',
      });

      expect(results).toEqual([]);
    });

    it('searches resource names', () => {
      const results = service.findAll({
        search: 'TED Support Group',
      });

      expect(results.map((resource) => resource.id)).toEqual([
        'ted-support-group',
      ]);
    });

    it('searches resource descriptions', () => {
      const results = service.findAll({
        search: 'General educational resources',
      });

      expect(results.map((resource) => resource.id)).toEqual([
        'patient-education-resource',
      ]);
    });

    it('matches searches regardless of case', () => {
      const results = service.findAll({
        search: 'PATIENT ORGANIZATION',
      });

      expect(results.map((resource) => resource.id)).toEqual([
        'patient-organization',
      ]);
    });

    it('trims surrounding whitespace from search', () => {
      const results = service.findAll({
        search: '  TED Support Group  ',
      });

      expect(results.map((resource) => resource.id)).toEqual([
        'ted-support-group',
      ]);
    });

    it('returns no resources for unmatched search terms', () => {
      const results = service.findAll({
        search: 'nonexistent-resource',
      });

      expect(results).toEqual([]);
    });

    it('combines matching language and category filters', () => {
      const results = service.findAll({
        language: 'en',
        category: 'education',
      });

      expect(results.map((resource) => resource.id)).toEqual([
        'patient-education-resource',
      ]);
    });

    it('combines language, category, and search filters', () => {
      const results = service.findAll({
        language: 'en',
        category: 'support-group',
        search: 'support',
      });

      expect(results.map((resource) => resource.id)).toEqual([
        'ted-support-group',
      ]);
    });

    it('returns no results when filters conflict', () => {
      const results = service.findAll({
        language: 'en',
        category: 'education',
        search: 'support group',
      });

      expect(results).toEqual([]);
    });

    it('returns no results when language conflicts with other filters', () => {
      const results = service.findAll({
        language: 'zh',
        category: 'support-group',
        search: 'TED',
      });

      expect(results).toEqual([]);
    });

    it('returns all resources when search contains only whitespace', () => {
      const results = service.findAll({
        search: '   ',
      });

      expect(results).toHaveLength(3);
    });

    it('returns multiple matching resources for a broad search', () => {
      const results = service.findAll({
        search: 'support',
      });

      expect(results.map((resource) => resource.id)).toEqual([
        'ted-support-group',
        'patient-organization',
      ]);
    });

    it('does not modify the original resource collection', () => {
      service.findAll({
        category: 'education',
      });

      const results = service.findAll();

      expect(results).toHaveLength(3);
    });
  });

  describe('findOne', () => {
    it('returns a resource by its ID', () => {
      const resource = service.findOne('ted-support-group');

      expect(resource).toMatchObject({
        id: 'ted-support-group',
        name: 'TED Support Group',
        category: 'support-group',
        language: 'en',
        status: 'published',
      });
    });

    it('returns the correct resource for every known ID', () => {
      const ids = [
        'ted-support-group',
        'patient-education-resource',
        'patient-organization',
      ];

      for (const id of ids) {
        expect(service.findOne(id).id).toBe(id);
      }
    });

    it('throws NotFoundException for an unknown ID', () => {
      expect(() =>
        service.findOne('unknown-resource'),
      ).toThrow(NotFoundException);
    });

    it('returns HTTP 404 for an unknown ID', () => {
      try {
        service.findOne('unknown-resource');
        expect.fail('Expected NotFoundException');
      } catch (error) {
        expect(error).toBeInstanceOf(NotFoundException);

        if (error instanceof NotFoundException) {
          expect(error.getStatus()).toBe(404);
          expect(error.message).toBe('Resource not found');
        }
      }
    });

    it('throws NotFoundException for an empty ID', () => {
      expect(() => service.findOne('')).toThrow(
        NotFoundException,
      );
    });

    it('matches resource IDs case-sensitively', () => {
      expect(() =>
        service.findOne('TED-SUPPORT-GROUP'),
      ).toThrow(NotFoundException);
    });
  });
});
