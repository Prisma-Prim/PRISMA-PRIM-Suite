import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import {
  readChangeOpportunityResponsibleCommand,
  readUpdateOpportunityNextActionCommand,
} from './commercial-intake.validation.js';

const MEMBER = '00000000-0000-4000-8000-000000000399';

function validationField(read: () => unknown): unknown {
  try {
    read();
  } catch (error: unknown) {
    if (!(error instanceof BadRequestException)) throw error;
    const response = error.getResponse();
    return typeof response === 'object' && response !== null
      ? Object.fromEntries(Object.entries(response))
      : response;
  }
  return expect.unreachable('Expected field validation.');
}

describe('Opportunity responsible actor command validation', () => {
  it('accepts exactly an observed version and one membership, normalized to lower case', () => {
    expect(
      readChangeOpportunityResponsibleCommand({
        expectedVersion: 1,
        workspaceMembershipId: MEMBER.toUpperCase(),
      }),
    ).toEqual({ expectedVersion: 1, workspaceMembershipId: MEMBER });
  });

  it.each([
    [null, 'change'],
    [[], 'change'],
    ['change', 'change'],
    [{ expectedVersion: 1 }, 'workspaceMembershipId'],
    [
      { expectedVersion: 1, workspaceMembershipId: null },
      'workspaceMembershipId',
    ],
    [
      { expectedVersion: 1, workspaceMembershipId: 'ion' },
      'workspaceMembershipId',
    ],
    [
      { expectedVersion: 1, workspaceMembershipId: 399 },
      'workspaceMembershipId',
    ],
    [{ workspaceMembershipId: MEMBER }, 'expectedVersion'],
    [
      { expectedVersion: '1', workspaceMembershipId: MEMBER },
      'expectedVersion',
    ],
    [{ expectedVersion: 0, workspaceMembershipId: MEMBER }, 'expectedVersion'],
    [
      { expectedVersion: 1.5, workspaceMembershipId: MEMBER },
      'expectedVersion',
    ],
    [
      { expectedVersion: 2_147_483_648, workspaceMembershipId: MEMBER },
      'expectedVersion',
    ],
    [
      {
        expectedVersion: 1,
        workspaceMembershipId: MEMBER,
        nextAction: 'Call back',
      },
      'change',
    ],
  ])('rejects %j as field validation of %s', (body, field) => {
    expect(
      validationField(() => readChangeOpportunityResponsibleCommand(body)),
    ).toMatchObject({ code: 'VALIDATION_ERROR', field });
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
