import { useEffect, useRef, useState } from 'react';
import type { BrowserIdentity } from '../access-composition';
import {
  createAuthenticatedApiClient,
  type ApiResult,
} from '../api/authenticated-api-client';
import type { offerModelAuthority } from './offer-model-authority';
import type { OfferModelContent } from './offer-model-content';
import {
  readOfferModelResponse,
  readExactModelVersion,
  type OfferModel,
} from './offer-model-response';

type Authority = NonNullable<ReturnType<typeof offerModelAuthority>>;
export type ModelCommand =
  | { kind: 'CREATE'; previous: OfferModel | null; content: OfferModelContent }
  | {
      kind: 'DECIDE';
      previous: OfferModel;
      outcome: 'APPROVE' | 'REJECT';
      basis: string;
    }
  | {
      kind: 'WITHDRAW';
      previous: OfferModel;
      target: NonNullable<OfferModel['activeVersion']>;
      reason: string;
    };
type Attempt = {
  command: ModelCommand;
  body: string;
  path: string;
  key: string;
};
type State =
  | {
      kind: 'idle';
      notice: null | {
        key: 'saved' | 'decisionSaved' | 'withdrawalSaved';
        number: number;
      };
      error: null | 'invalid' | 'stale';
    }
  | { kind: 'pending' | 'uncertain'; attempt: Attempt };

export function useOfferModelCommand({
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
  const [state, setState] = useState<State>({
    kind: 'idle',
    notice: null,
    error: null,
  });
  const lock = useRef(false);
  const pending = useRef<AbortController | null>(null);
  const callbacks = useRef({ onStart, onConfirmed, onDenied });
  callbacks.current = { onStart, onConfirmed, onDenied };
  useEffect(
    () => () => {
      pending.current?.abort();
    },
    [identity],
  );

  async function run(attempt: Attempt) {
    if (lock.current) return;
    lock.current = true;
    pending.current?.abort();
    const controller = new AbortController();
    pending.current = controller;
    setState({ kind: 'pending', attempt });
    callbacks.current.onStart();
    try {
      const api = await createAuthenticatedApiClient(identity);
      if (controller.signal.aborted) return;
      const result = await api.request<unknown>(attempt.path, {
        method: 'POST',
        body: attempt.body,
        headers: {
          'content-type': 'application/json',
          'idempotency-key': attempt.key,
        },
        companyContextId: authority.companyId,
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      if (result.status === 'unauthorized' || result.status === 'forbidden') {
        setState({ kind: 'idle', notice: null, error: null });
        callbacks.current.onDenied(result);
        return;
      }
      if (
        result.status === 'validation' ||
        result.status === 'conflict' ||
        result.status === 'notFound'
      ) {
        setState({
          kind: 'idle',
          notice: null,
          error: result.status === 'validation' ? 'invalid' : 'stale',
        });
        return;
      }
      if (result.status !== 'ok') {
        setState({ kind: 'uncertain', attempt });
        return;
      }
      const { model } = readOfferModelResponse(result.value);
      const { command } = attempt;
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
        if (
          model.activeVersion ||
          JSON.stringify({
            ...model.head,
            withdrawal: command.previous.head.withdrawal,
          }) !== JSON.stringify(command.previous.head)
        )
          throw new Error('Unexpected withdrawal receipt.');
        let version = model.head;
        if (command.target.id !== model.head.id) {
          const confirmation = await api.request<unknown>(
            `/offer-models/consulting-ro/versions/${command.target.id}`,
            {
              companyContextId: authority.companyId,
              signal: controller.signal,
            },
          );
          if (controller.signal.aborted) return;
          if (
            confirmation.status === 'forbidden' ||
            confirmation.status === 'unauthorized'
          ) {
            setState({ kind: 'idle', notice: null, error: null });
            callbacks.current.onDenied(confirmation);
            return;
          }
          if (confirmation.status !== 'ok')
            throw new Error('Withdrawal confirmation unavailable.');
          version = readExactModelVersion(confirmation.value).version;
        }
        if (
          version.id !== command.target.id ||
          version.versionNumber !== command.target.versionNumber ||
          !version.withdrawal ||
          version.withdrawal.reason !== command.reason ||
          !sameActor(version.withdrawal.actor)
        )
          throw new Error('Unexpected withdrawal attribution.');
      }
      setState({
        kind: 'idle',
        notice: {
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
        },
        error: null,
      });
      callbacks.current.onConfirmed();
    } catch {
      if (!controller.signal.aborted) setState({ kind: 'uncertain', attempt });
    } finally {
      if (pending.current === controller) {
        lock.current = false;
        pending.current = null;
      }
    }
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
    state,
    blocked: state.kind !== 'idle',
    start(command: ModelCommand) {
      if (state.kind !== 'idle' || lock.current) return;
      const { payload, path } = prepare(command);
      void run({
        command,
        body: JSON.stringify(payload),
        path,
        key: crypto.randomUUID(),
      });
    },
    retry() {
      if (state.kind === 'uncertain') void run(state.attempt);
    },
  };
}

function prepare(command: ModelCommand) {
  switch (command.kind) {
    case 'CREATE':
      return {
        path: '/offer-models/consulting-ro/versions',
        payload: {
          expectedModelRevision: command.previous?.revision ?? 0,
          content: command.content,
        },
      };
    case 'DECIDE':
      return {
        path: `/offer-models/consulting-ro/versions/${command.previous.head.id}/decision`,
        payload: {
          expectedModelRevision: command.previous.revision,
          versionNumber: command.previous.head.versionNumber,
          outcome: command.outcome,
          basis: command.basis,
        },
      };
    case 'WITHDRAW':
      return {
        path: `/offer-models/consulting-ro/versions/${command.target.id}/withdrawal`,
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
