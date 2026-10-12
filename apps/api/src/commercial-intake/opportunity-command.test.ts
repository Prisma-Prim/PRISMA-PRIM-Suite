import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type {
  ChangeOpportunityOutcomeCommand,
  ChangeOpportunityResponsibleCommand,
  UpdateOpportunityNextActionCommand,
} from './commercial-intake.types.js';
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

// The implementations every recorded Opportunity receipt and lock was made
// with before the shared command kernel, inlined unchanged. Receipts keep
// replaying only while the current ones produce the same strings.
const previous = {
  nextActionFingerprint(
    opportunityId: string,
    command: UpdateOpportunityNextActionCommand,
  ): string {
    return createHash('sha256')
      .update(
        JSON.stringify({
          opportunityId,
          expectedVersion: command.expectedVersion,
          nextAction: command.nextAction,
        }),
      )
      .digest('hex');
  },
  responsibleFingerprint(
    opportunityId: string,
    command: ChangeOpportunityResponsibleCommand,
  ): string {
    return createHash('sha256')
      .update(
        JSON.stringify({
          opportunityId,
          expectedVersion: command.expectedVersion,
          workspaceMembershipId: command.workspaceMembershipId,
        }),
      )
      .digest('hex');
  },
  outcomeFingerprint(
    opportunityId: string,
    command: ChangeOpportunityOutcomeCommand,
  ): string {
    return createHash('sha256')
      .update(
        JSON.stringify({
          opportunityId,
          expectedVersion: command.expectedVersion,
          change: command.change,
        }),
      )
      .digest('hex');
  },
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

const OPPORTUNITY_IDS = [
  '0f2a6c1e-8a43-4d6b-9e1f-3c5d7a9b1c2d',
  // Fingerprints cover the target exactly as addressed, case included.
  '0F2A6C1E-8A43-4D6B-9E1F-3C5D7A9B1C2D',
];

describe('Opportunity command fingerprints', () => {
  it('keeps the next-action fingerprint byte-identical', () => {
    for (const opportunityId of OPPORTUNITY_IDS)
      for (const value of [
        { expectedVersion: 1, nextAction: 'Arrange a qualification call' },
        { nextAction: '  Untrimmed — ăîșț "quoted"\n', expectedVersion: 41 },
        { expectedVersion: 2147483646, nextAction: 'x'.repeat(500) },
      ]) {
        const command = readUpdateOpportunityNextActionCommand(value);
        expect(nextActionFingerprint(opportunityId, command)).toBe(
          previous.nextActionFingerprint(opportunityId, command),
        );
      }
  });

  it('keeps the responsible actor fingerprint byte-identical', () => {
    for (const opportunityId of OPPORTUNITY_IDS)
      for (const value of [
        {
          expectedVersion: 1,
          workspaceMembershipId: '7b1d2c3e-4f5a-4b6c-8d7e-9f0a1b2c3d4e',
        },
        {
          workspaceMembershipId: '7B1D2C3E-4F5A-4B6C-8D7E-9F0A1B2C3D4E',
          expectedVersion: 12,
        },
      ]) {
        const command = readChangeOpportunityResponsibleCommand(value);
        expect(responsibleFingerprint(opportunityId, command)).toBe(
          previous.responsibleFingerprint(opportunityId, command),
        );
      }
  });

  it('keeps the outcome status fingerprint byte-identical, reason fields included', () => {
    for (const opportunityId of OPPORTUNITY_IDS)
      for (const value of [
        { expectedVersion: 1, status: 'WON' },
        {
          expectedVersion: 3,
          status: 'LOST',
          lossReasonCode: 'PRICE',
          note: 'The client chose a cheaper audit.',
        },
        {
          note: null,
          reason: 'Reopened after a call',
          status: 'OPEN',
          expectedVersion: 7,
        },
        {
          expectedVersion: 2,
          status: 'DISQUALIFIED',
          reason: 42,
          note: ['as', 'submitted'],
        },
      ]) {
        const command = readChangeOpportunityOutcomeCommand(value);
        expect(outcomeFingerprint(opportunityId, command)).toBe(
          previous.outcomeFingerprint(opportunityId, command),
        );
      }
  });
});

describe('Opportunity command lock keys', () => {
  const actor = {
    workspaceId: '00000000-0000-4000-8000-000000000399',
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
