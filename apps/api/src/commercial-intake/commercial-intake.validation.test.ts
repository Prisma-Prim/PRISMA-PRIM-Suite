import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import {
  readAssociateClientCommand,
  readUpdateOpportunityNextActionCommand,
} from './commercial-intake.validation.js';

describe('Request Client association command validation', () => {
  it('accepts exactly an observed Request version and one Client Account id', () => {
    expect(
      readAssociateClientCommand({
        expectedVersion: 1,
        clientAccountId: '00000000-0000-4000-8000-000000000452',
      }),
    ).toEqual({
      expectedVersion: 1,
      clientAccountId: '00000000-0000-4000-8000-000000000452',
    });
  });

  it.each([
    [
      { expectedVersion: 0, clientAccountId: crypto.randomUUID() },
      'expectedVersion',
    ],
    [
      { expectedVersion: 1.5, clientAccountId: crypto.randomUUID() },
      'expectedVersion',
    ],
    [
      { expectedVersion: 1, clientAccountId: 'not-a-client-id' },
      'clientAccountId',
    ],
    [
      {
        expectedVersion: 1,
        clientAccountId: crypto.randomUUID(),
        clientLegalEntityId: crypto.randomUUID(),
      },
      'association',
    ],
  ])('rejects malformed or expanded input %#', (value, field) => {
    try {
      readAssociateClientCommand(value);
      expect.unreachable('Expected validation to reject the association');
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(BadRequestException);
      if (!(error instanceof BadRequestException)) return;
      expect(error.getResponse()).toMatchObject({
        code: 'VALIDATION_ERROR',
        field,
      });
    }
  });
});

describe('Opportunity next-action expected version validation', () => {
  it('accepts the largest PostgreSQL integer version that can still increment', () => {
    expect(
      readUpdateOpportunityNextActionCommand({
        expectedVersion: 2_147_483_646,
        nextAction: 'Still representable after increment',
      }),
    ).toEqual({
      expectedVersion: 2_147_483_646,
      nextAction: 'Still representable after increment',
    });
  });

  it('accepts the PostgreSQL integer maximum so an unchanged or replayed command can confirm it', () => {
    expect(
      readUpdateOpportunityNextActionCommand({
        expectedVersion: 2_147_483_647,
        nextAction: 'Unchanged at the maximum',
      }),
    ).toEqual({
      expectedVersion: 2_147_483_647,
      nextAction: 'Unchanged at the maximum',
    });
  });

  it.each([2_147_483_648, Number.MAX_SAFE_INTEGER])(
    'rejects %d above the PostgreSQL integer maximum before persistence',
    (expectedVersion) => {
      try {
        readUpdateOpportunityNextActionCommand({
          expectedVersion,
          nextAction: 'Not a PostgreSQL integer version',
        });
        expect.unreachable('Expected validation to reject the version');
      } catch (error: unknown) {
        expect(error).toBeInstanceOf(BadRequestException);
        if (!(error instanceof BadRequestException)) return;
        expect(error.getResponse()).toMatchObject({
          code: 'VALIDATION_ERROR',
          field: 'expectedVersion',
        });
      }
    },
  );
});
