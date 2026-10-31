import type { BrowserIdentity } from '../access-composition';
import type { ApiResult } from '../api/authenticated-api-client';
import {
  useCompanyModelCommandAttempt,
  type ModelCommandConfirmation,
  type ModelCommandNotice,
} from '../company-model/use-company-model-command-attempt';
import type { contractModelAuthority } from './contract-model-authority';
import type { ContractModelContent } from './contract-model-content';
import {
  readContractModelResponse,
  type ContractModel,
} from './contract-model-response';

type Authority = NonNullable<ReturnType<typeof contractModelAuthority>>;
export type ModelCommand =
  | {
      kind: 'CREATE';
      previous: ContractModel | null;
      content: ContractModelContent;
    }
  | {
      kind: 'DECIDE';
      previous: ContractModel;
      outcome: 'APPROVE' | 'REJECT';
      basis: string;
    }
  | {
      kind: 'WITHDRAW';
      previous: ContractModel;
      target: NonNullable<ContractModel['activeVersion']>;
      reason: string;
    };
export function useContractModelCommand({
  identity,
  authority,
  onStart,
  onConfirmed,
  onDenied,
}: {
  identity: BrowserIdentity;
  authority: Authority;
  onStart: () => void;
  onConfirmed: () => void;
  onDenied: (result: ApiResult<unknown>) => void;
}) {
  const attempt = useCompanyModelCommandAttempt({
    identity,
    companyId: authority.companyId,
    onStart,
    onConfirmed,
    onDenied,
  });

  async function confirm(
    { receipt }: ModelCommandConfirmation,
    command: ModelCommand,
  ): Promise<ModelCommandNotice> {
    const { model } = readContractModelResponse(receipt);
    if (
      !model ||
      model.workspaceId !== authority.workspaceId ||
      model.companyId !== authority.companyId ||
      model.revision !== (command.previous?.revision ?? 0) + 1 ||
      (command.previous && model.id !== command.previous.id)
    )
      throw new Error('Unexpected model command receipt.');
    if (command.kind === 'CREATE') {
      if (
        model.head.versionNumber !==
          (command.previous?.head.versionNumber ?? 0) + 1 ||
        model.head.predecessorVersionId !==
          (command.previous?.head.id ?? null) ||
        JSON.stringify(model.head.content) !==
          JSON.stringify(command.content) ||
        model.head.decision ||
        model.head.withdrawal ||
        !sameActor(model.head.actor) ||
        JSON.stringify(model.activeVersion) !==
          JSON.stringify(command.previous?.activeVersion ?? null)
      )
        throw new Error('Unexpected creation receipt.');
    } else if (command.kind === 'DECIDE') {
      const decision = model.head.decision;
      const selected =
        command.outcome === 'REJECT'
          ? command.previous.activeVersion
          : {
              id: command.previous.head.id,
              versionNumber: command.previous.head.versionNumber,
              sourceKind: command.previous.head.content.sourceKind,
              serviceTitle: command.previous.head.content.serviceTitle,
            };
      if (
        JSON.stringify({ ...model.head, decision: null }) !==
          JSON.stringify(command.previous.head) ||
        !decision ||
        decision.outcome !== command.outcome ||
        decision.basis !== command.basis ||
        !sameActor(decision.actor) ||
        JSON.stringify(model.activeVersion) !== JSON.stringify(selected)
      )
        throw new Error('Unexpected decision receipt.');
    }
    if (command.kind === 'WITHDRAW') {
      const selected = command.previous.activeVersion;
      if (
        !selected ||
        command.target.id !== selected.id ||
        command.target.versionNumber !== selected.versionNumber ||
        model.activeVersion ||
        JSON.stringify({
          ...model.head,
          withdrawal: command.previous.head.withdrawal,
        }) !== JSON.stringify(command.previous.head)
      )
        throw new Error('Unexpected withdrawal receipt.');
      // The successful exact command confirms an older active selection's
      // removal. Its historical detail is independently readable afterwards;
      // a later read failure cannot turn that committed result uncertain.
      if (command.target.id === model.head.id) {
        const version = model.head;
        if (
          version.versionNumber !== command.target.versionNumber ||
          !version.withdrawal ||
          version.withdrawal.reason !== command.reason ||
          !sameActor(version.withdrawal.actor)
        )
          throw new Error('Unexpected withdrawal attribution.');
      }
    }
    return {
      key:
        command.kind === 'CREATE'
          ? 'saved'
          : command.kind === 'DECIDE'
            ? 'decisionSaved'
            : 'withdrawalSaved',
      number:
        command.kind === 'WITHDRAW'
          ? command.target.versionNumber
          : model.head.versionNumber,
    };
  }
  function sameActor(actor: {
    workspaceMembershipId: string;
    internalUserId: string;
  }) {
    return (
      actor.workspaceMembershipId === authority.membershipId &&
      actor.internalUserId === authority.internalUserId
    );
  }
  return {
    state: attempt.state,
    blocked: attempt.blocked,
    start(command: ModelCommand) {
      attempt.start(() => {
        const { payload, path } = prepare(command);
        return {
          body: JSON.stringify(payload),
          path,
          confirm: (confirmation) => confirm(confirmation, command),
        };
      });
    },
    retry: attempt.retry,
  };
}

function prepare(command: ModelCommand) {
  switch (command.kind) {
    case 'CREATE':
      return {
        path: '/contract-models/consulting-ro/versions',
        payload: {
          expectedModelRevision: command.previous?.revision ?? 0,
          content: command.content,
        },
      };
    case 'DECIDE':
      return {
        path: `/contract-models/consulting-ro/versions/${command.previous.head.id}/decision`,
        payload: {
          expectedModelRevision: command.previous.revision,
          versionNumber: command.previous.head.versionNumber,
          outcome: command.outcome,
          basis: command.basis,
        },
      };
    case 'WITHDRAW':
      return {
        path: `/contract-models/consulting-ro/versions/${command.target.id}/withdrawal`,
        payload: {
          expectedModelRevision: command.previous.revision,
          versionNumber: command.target.versionNumber,
          reason: command.reason,
        },
      };
    default: {
      const never: never = command;
      return never;
    }
  }
}
