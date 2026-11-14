import type { ActorContext } from '../access/access.types.js';
import {
  commandFingerprint,
  type AdvisoryLockParts,
} from '../command/idempotent-command.js';
import type {
  ChangeOpportunityOutcomeCommand,
  ChangeOpportunityResponsibleCommand,
  SetOpportunityStageCommand,
  UpdateOpportunityNextActionCommand,
} from './commercial-intake.types.js';

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
  return commandFingerprint({
    opportunityId,
    expectedVersion: command.expectedVersion,
    nextAction: command.nextAction,
  });
}

export function responsibleFingerprint(
  opportunityId: string,
  command: ChangeOpportunityResponsibleCommand,
): string {
  return commandFingerprint({
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
  return commandFingerprint({
    opportunityId,
    expectedVersion: command.expectedVersion,
    change: command.change,
  });
}

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
