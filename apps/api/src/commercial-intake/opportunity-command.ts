import type { ActorContext } from '../access/access.types.js';
import {
  commandFingerprint,
  insertionOrderFingerprint,
  type AdvisoryLockParts,
} from '../command/idempotent-command.js';
import type {
  ChangeOpportunityOutcomeCommand,
  ChangeOpportunityResponsibleCommand,
  SetOpportunityStageCommand,
  UpdateOpportunityNextActionCommand,
} from './commercial-intake.types.js';

// Recorded receipts replay only while these fingerprints and lock keys keep
// their exact spelling: the plain JSON of each fixed object, in this key order.

export type OpportunityCommandName =
  | 'commercial-intake.update-next-action'
  | 'commercial-intake.change-responsible'
  | 'commercial-intake.change-outcome'
  | 'commercial-intake.set-stage';

export function opportunityCommandLockParts(input: {
  readonly command: OpportunityCommandName;
  readonly actor: Pick<ActorContext, 'workspaceId' | 'workspaceMembershipId'>;
  readonly companyId: string;
  readonly idempotencyKey: string;
}): AdvisoryLockParts {
  return [
    input.command,
    input.actor.workspaceId,
    input.companyId,
    input.actor.workspaceMembershipId,
    input.idempotencyKey,
  ];
}

export function nextActionFingerprint(
  opportunityId: string,
  command: UpdateOpportunityNextActionCommand,
): string {
  return insertionOrderFingerprint({
    opportunityId,
    expectedVersion: command.expectedVersion,
    nextAction: command.nextAction,
  });
}

export function responsibleFingerprint(
  opportunityId: string,
  command: ChangeOpportunityResponsibleCommand,
): string {
  return insertionOrderFingerprint({
    opportunityId,
    expectedVersion: command.expectedVersion,
    workspaceMembershipId: command.workspaceMembershipId,
  });
}

// The requested change exactly as submitted, so any changed field conflicts.
export function outcomeFingerprint(
  opportunityId: string,
  command: ChangeOpportunityOutcomeCommand,
): string {
  return insertionOrderFingerprint({
    opportunityId,
    expectedVersion: command.expectedVersion,
    change: command.change,
  });
}

// A new command, so its fingerprint uses the key-order-free spelling.
export function stageFingerprint(
  opportunityId: string,
  command: SetOpportunityStageCommand,
): string {
  return commandFingerprint({
    opportunityId,
    expectedVersion: command.expectedVersion,
    salesStageId: command.salesStageId,
  });
}
