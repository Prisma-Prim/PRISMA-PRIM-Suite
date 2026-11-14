import { describe, expect, it } from 'vitest';
import { commandFingerprint } from '../command/idempotent-command.js';
import {
  readChangeOpportunityOutcomeCommand,
  readChangeOpportunityResponsibleCommand,
  readUpdateOpportunityNextActionCommand,
} from './commercial-intake.validation.js';
import {
  nextActionFingerprint,
  opportunityCommandLockParts,
  outcomeFingerprint,
  responsibleFingerprint,
  type OpportunityCommandName,
} from './opportunity-command.js';

// The lock key keeps its spelling: the plain JSON of the fixed array.
const previous = {
  lockKey(
    command: OpportunityCommandName,
    actor: { workspaceId: string; workspaceMembershipId: string },
    companyId: string,
    idempotencyKey: string,
  ): string {
    return JSON.stringify([
      command,
      actor.workspaceId,
      companyId,
      actor.workspaceMembershipId,
      idempotencyKey,
    ]);
  },
};

const OPPORTUNITY_ID = '0f2a6c1e-8a43-4d6b-9e1f-3c5d7a9b1c2d';

describe('Opportunity command fingerprints', () => {
  it('fingerprints every command with the shared stable fingerprint, key order immaterial', () => {
    const nextAction = readUpdateOpportunityNextActionCommand({
      expectedVersion: 1,
      nextAction: 'Arrange a qualification call',
    });
    expect(nextActionFingerprint(OPPORTUNITY_ID, nextAction)).toBe(
      commandFingerprint({
        nextAction: nextAction.nextAction,
        expectedVersion: 1,
        opportunityId: OPPORTUNITY_ID,
      }),
    );
    const responsible = readChangeOpportunityResponsibleCommand({
      expectedVersion: 1,
      workspaceMembershipId: '7b1d2c3e-4f5a-4b6c-8d7e-9f0a1b2c3d4e',
    });
    expect(responsibleFingerprint(OPPORTUNITY_ID, responsible)).toBe(
      commandFingerprint({
        workspaceMembershipId: responsible.workspaceMembershipId,
        expectedVersion: 1,
        opportunityId: OPPORTUNITY_ID,
      }),
    );
    const outcome = readChangeOpportunityOutcomeCommand({
      expectedVersion: 3,
      status: 'LOST',
      lossReasonCode: 'PRICE',
    });
    expect(outcomeFingerprint(OPPORTUNITY_ID, outcome)).toBe(
      commandFingerprint({
        change: outcome.change,
        expectedVersion: 3,
        opportunityId: OPPORTUNITY_ID,
      }),
    );
  });
});

describe('Opportunity command lock keys', () => {
  const actor = {
    workspaceId: parseWorkspaceId('00000000-0000-4000-8000-000000000399'),
    workspaceMembershipId: '7b1d2c3e-4f5a-4b6c-8d7e-9f0a1b2c3d4e',
  };
  const companyId = '5c4b3a29-1807-4f6e-9d5c-4b3a29180716';

  it('keeps each command lock key string unchanged', () => {
    for (const command of [
      'commercial-intake.update-next-action',
      'commercial-intake.change-responsible',
      'commercial-intake.change-outcome',
    ] as const)
      for (const idempotencyKey of ['key-1', 'Ключ "with" \\ escapes'])
        expect(
          JSON.stringify(
            opportunityCommandLockParts({
              command,
              actor,
              companyId,
              idempotencyKey,
            }),
          ),
        ).toBe(previous.lockKey(command, actor, companyId, idempotencyKey));
  });
});
import { parseWorkspaceId } from '../access/access-identifiers.js';
