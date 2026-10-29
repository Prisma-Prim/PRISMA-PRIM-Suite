import { useEffect, useRef, useState } from 'react';
import type { BrowserIdentity } from '../access-composition';
import {
  createAuthenticatedApiClient,
  type ApiResult,
} from '../api/authenticated-api-client';

export type ModelCommandNotice = {
  key: 'saved' | 'decisionSaved' | 'withdrawalSaved';
  number: number;
};
export type ModelCommandConfirmation = {
  receipt: unknown;
  read: (path: string) => Promise<unknown>;
};
type PreparedAttempt = {
  path: string;
  body: string;
  confirm: (
    input: ModelCommandConfirmation,
  ) => ModelCommandNotice | Promise<ModelCommandNotice>;
};
type Attempt = PreparedAttempt & { companyId: string; key: string };
type State =
  | {
      kind: 'idle';
      notice: ModelCommandNotice | null;
      error: 'invalid' | 'stale' | null;
    }
  | { kind: 'pending' | 'uncertain' };
type Run = { kind: 'pending'; controller: AbortController };
type Owner =
  { kind: 'idle' | 'retired' } | Run | { kind: 'uncertain'; attempt: Attempt };
type Outcome =
  | { kind: 'confirmed'; notice: ModelCommandNotice }
  | { kind: 'denied'; result: ApiResult<unknown> }
  | { kind: 'invalid' | 'stale' | 'uncertain' };

class ConfirmationDenied extends Error {
  constructor(readonly result: ApiResult<unknown>) {
    super('Model confirmation access denied.');
  }
}

/** Private to the two model command hooks, inside ModelAccessLifetime's scope. */
export function useCompanyModelCommandAttempt({
  identity,
  companyId,
  onStart,
  onConfirmed,
  onDenied,
}: {
  identity: BrowserIdentity;
  companyId: string;
  onStart: () => void;
  onConfirmed: () => void;
  onDenied: (result: ApiResult<unknown>) => void;
}) {
  const [state, setState] = useState<State>({
    kind: 'idle',
    notice: null,
    error: null,
  });
  const owner = useRef<Owner>({ kind: 'idle' });
  const callbacks = useRef({ onStart, onConfirmed, onDenied });
  callbacks.current = { onStart, onConfirmed, onDenied };

  // The keyed parent fixes identity, Company and authority for this mount.
  // Effect replay creates a new owner; an old run can never become live again.
  useEffect(() => {
    if (owner.current.kind === 'retired') owner.current = { kind: 'idle' };
    return () => {
      const previous = owner.current;
      owner.current = { kind: 'retired' };
      if (previous.kind === 'pending') previous.controller.abort();
    };
  }, []);

  function live(run: Run) {
    return owner.current === run && !run.controller.signal.aborted;
  }

  async function execute(run: Run, attempt: Attempt): Promise<Outcome> {
    try {
      const api = await createAuthenticatedApiClient(identity);
      if (!live(run)) return { kind: 'uncertain' };
      const result = await api.request<unknown>(attempt.path, {
        method: 'POST',
        body: attempt.body,
        headers: {
          'content-type': 'application/json',
          'idempotency-key': attempt.key,
        },
        companyContextId: attempt.companyId,
        signal: run.controller.signal,
      });
      if (!live(run)) return { kind: 'uncertain' };
      if (result.status === 'unauthorized' || result.status === 'forbidden')
        return { kind: 'denied', result };
      if (result.status === 'validation') return { kind: 'invalid' };
      if (result.status === 'conflict' || result.status === 'notFound')
        return { kind: 'stale' };
      if (result.status !== 'ok') return { kind: 'uncertain' };
      const notice = await attempt.confirm({
        receipt: result.value,
        read: async (path) => {
          if (!live(run)) throw new Error('Model attempt retired.');
          const confirmation = await api.request<unknown>(path, {
            companyContextId: attempt.companyId,
            signal: run.controller.signal,
          });
          if (!live(run)) throw new Error('Model attempt retired.');
          if (
            confirmation.status === 'unauthorized' ||
            confirmation.status === 'forbidden'
          )
            throw new ConfirmationDenied(confirmation);
          if (confirmation.status !== 'ok')
            throw new Error('Model confirmation unavailable.');
          return confirmation.value;
        },
      });
      return { kind: 'confirmed', notice };
    } catch (error: unknown) {
      return error instanceof ConfirmationDenied
        ? { kind: 'denied', result: error.result }
        : { kind: 'uncertain' };
    }
  }

  async function run(attempt: Attempt, current: Run) {
    const outcome = await execute(current, attempt);
    if (!live(current)) return;
    if (outcome.kind === 'uncertain') {
      owner.current = { kind: 'uncertain', attempt };
      setState({ kind: 'uncertain' });
      return;
    }
    // Notifications happen after receipt classification, so a follow-up read
    // cannot change a confirmed write into an uncertain attempt.
    try {
      if (outcome.kind === 'confirmed') {
        setState({ kind: 'idle', notice: outcome.notice, error: null });
        callbacks.current.onConfirmed();
      } else if (outcome.kind === 'denied') {
        setState({ kind: 'idle', notice: null, error: null });
        callbacks.current.onDenied(outcome.result);
      } else {
        setState({ kind: 'idle', notice: null, error: outcome.kind });
      }
    } finally {
      if (live(current)) owner.current = { kind: 'idle' };
    }
  }

  function begin(attempt: Attempt, current: Run) {
    setState({ kind: 'pending' });
    callbacks.current.onStart();
    void run(attempt, current);
  }

  return {
    state,
    blocked: state.kind !== 'idle',
    start(prepare: () => PreparedAttempt) {
      if (owner.current.kind !== 'idle') return;
      const current: Run = {
        kind: 'pending',
        controller: new AbortController(),
      };
      owner.current = current;
      let attempt: Attempt;
      try {
        attempt = { ...prepare(), companyId, key: crypto.randomUUID() };
      } catch (error: unknown) {
        owner.current = { kind: 'idle' };
        current.controller.abort();
        throw error;
      }
      begin(attempt, current);
    },
    retry() {
      if (owner.current.kind !== 'uncertain') return;
      const { attempt } = owner.current;
      const current: Run = {
        kind: 'pending',
        controller: new AbortController(),
      };
      owner.current = current;
      begin(attempt, current);
    },
  };
}
