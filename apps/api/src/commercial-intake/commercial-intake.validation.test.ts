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

  it('rejects the PostgreSQL integer maximum before persistence', () => {
    try {
      readUpdateOpportunityNextActionCommand({
        expectedVersion: 2_147_483_647,
        nextAction: 'Would overflow after increment',
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
  });
});
