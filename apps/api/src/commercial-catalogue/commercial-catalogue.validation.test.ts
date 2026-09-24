import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import {
  readCreateCompanyServiceOfferingCommand,
  readCreateServiceDefinitionCommand,
} from './commercial-catalogue.validation.js';

// One supplementary code point is two UTF-16 code units in a JavaScript string.
const supplementary = '😀';
const definitionId = '00000000-0000-4000-8000-000000000001';

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

  it('counts each supplementary character once at the name and description limits', () => {
    const body = {
      code: 'EMOJI',
      name: supplementary.repeat(160),
      description: supplementary.repeat(2_000),
    };

    expect(readCreateServiceDefinitionCommand(body)).toEqual(body);
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
    [{ code: 'OK', name: supplementary.repeat(161) }, 'name'],
    [
      { code: 'OK', name: 'Fine', description: supplementary.repeat(2001) },
      'description',
    ],
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

  it('counts each supplementary character once at the commercial label limit', () => {
    const body = {
      serviceDefinitionId: definitionId,
      commercialLabel: supplementary.repeat(160),
    };

    expect(readCreateCompanyServiceOfferingCommand(body)).toEqual(body);
  });

  it.each([
    [{}, 'serviceDefinitionId'],
    [{ serviceDefinitionId: 'nope' }, 'serviceDefinitionId'],
    [
      {
        serviceDefinitionId: definitionId,
        commercialLabel: 'x'.repeat(161),
      },
      'commercialLabel',
    ],
    [
      {
        serviceDefinitionId: definitionId,
        commercialLabel: supplementary.repeat(161),
      },
      'commercialLabel',
    ],
    [
      {
        serviceDefinitionId: definitionId,
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
