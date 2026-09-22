import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import {
  readCreateCompanyServiceOfferingCommand,
  readCreateServiceDefinitionCommand,
} from './commercial-catalogue.validation.js';

describe('Service Definition command validation', () => {
  it('accepts the code grammar and keeps optional description absent as null', () => {
    expect(
      readCreateServiceDefinitionCommand({
        code: 'ISO-9001_GAP',
        name: 'ISO 9001 gap analysis',
      }),
    ).toEqual({
      code: 'ISO-9001_GAP',
      name: 'ISO 9001 gap analysis',
      description: null,
    });
  });

  it.each([
    [{ code: 'iso-9001', name: 'Lowercase' }, 'code'],
    [{ code: 'ISO 9001', name: 'Space' }, 'code'],
    [{ code: 'É', name: 'Non-ASCII' }, 'code'],
    [{ code: 'A'.repeat(41), name: 'Too long' }, 'code'],
    [{ code: '', name: 'Empty' }, 'code'],
    [{ name: 'Missing code' }, 'code'],
    [{ code: 'OK', name: '  ' }, 'name'],
    [{ code: 'OK', name: 'x'.repeat(161) }, 'name'],
    [
      { code: 'OK', name: 'Fine', description: 'x'.repeat(2001) },
      'description',
    ],
    [{ code: 'OK', name: 'Fine', description: 42 }, 'description'],
    [{ code: 'OK', name: 'Fine', price: '10' }, 'definition'],
    ['ISO', 'definition'],
  ])('rejects %j on field %s', (body, field) => {
    expect(() => readCreateServiceDefinitionCommand(body)).toThrow(
      BadRequestException,
    );
    try {
      readCreateServiceDefinitionCommand(body);
    } catch (error) {
      if (!(error instanceof BadRequestException)) throw error;
      expect(error.getResponse()).toMatchObject({
        code: 'VALIDATION_ERROR',
        field,
      });
    }
  });
});

describe('Company Service Offering command validation', () => {
  it('normalizes the definition id and keeps an absent label as null', () => {
    expect(
      readCreateCompanyServiceOfferingCommand({
        serviceDefinitionId: '00000000-0000-4000-8000-0000000003AB',
      }),
    ).toEqual({
      serviceDefinitionId: '00000000-0000-4000-8000-0000000003ab',
      commercialLabel: null,
    });
  });

  it.each([
    [{}, 'serviceDefinitionId'],
    [{ serviceDefinitionId: 'nope' }, 'serviceDefinitionId'],
    [
      {
        serviceDefinitionId: '00000000-0000-4000-8000-000000000001',
        commercialLabel: 'x'.repeat(161),
      },
      'commercialLabel',
    ],
    [
      {
        serviceDefinitionId: '00000000-0000-4000-8000-000000000001',
        unitAmount: '100',
      },
      'offering',
    ],
  ])('rejects %j on field %s', (body, field) => {
    try {
      readCreateCompanyServiceOfferingCommand(body);
      throw new Error('Expected a validation error.');
    } catch (error) {
      if (!(error instanceof BadRequestException)) throw error;
      expect(error.getResponse()).toMatchObject({
        code: 'VALIDATION_ERROR',
        field,
      });
    }
  });
});
