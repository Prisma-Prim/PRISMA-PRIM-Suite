import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { readUpdateOpportunityNextActionCommand } from './commercial-intake.validation.js';

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
