import { useRef, useState } from 'react';
import type { BrowserIdentity } from '../access-composition';
import {
  createAuthenticatedApiClient,
  type ApiResult,
} from '../api/authenticated-api-client';
import { useScopedOperation } from '../api/use-scoped-operation';

export type ModelCommandNotice = {
  key: 'saved' | 'decisionSaved' | 'withdrawalSaved';
  number: number;
};
export type ModelCommandConfirmation = { receipt: unknown };
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
type Run = { kind: 'pending'; signal: AbortSignal };
/** A pending or uncertain owner retires with its signal; the slot is then free. */
type Owner =
  | { kind: 'idle' }
  | Run
  | { kind: 'uncertain'; attempt: Attempt; signal: AbortSignal };
type Outcome =
  | { kind: 'confirmed'; notice: ModelCommandNotice }
  | { kind: 'denied'; result: ApiResult<unknown> }
  | { kind: 'invalid' | 'stale' | 'uncertain' };

/** Private to the Company model command hook, inside ModelAccessLifetime's scope. */
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
  // The keyed parent fixes identity, Company and authority for this mount.
  // Effect replay creates a new owner; an old run can never become live again.
  const operation = useScopedOperation(companyId);
  const owner = useRef<Owner>({ kind: 'idle' });
  const callbacks = useRef({ onStart, onConfirmed, onDenied });
  callbacks.current = { onStart, onConfirmed, onDenied };

  function live(run: Run) {
    return owner.current === run && !run.signal.aborted;
  }

  async function execute(run: Run, attempt: Attempt): Promise<Outcome> {
    try {
      const api = await createAuthenticatedApiClient(identity);
      if (!live(run)) return { kind: 'uncertain' };
      const result = await api.request(attempt.path, {
        method: 'POST',
        body: attempt.body,
        headers: {
          'content-type': 'application/json',
          'idempotency-key': attempt.key,
        },
        companyContextId: attempt.companyId,
        signal: run.signal,
      });
      if (!live(run)) return { kind: 'uncertain' };
      if (result.status === 'unauthorized' || result.status === 'forbidden')
        return { kind: 'denied', result };
      if (result.status === 'validation') return { kind: 'invalid' };
      if (result.status === 'conflict' || result.status === 'notFound')
        return { kind: 'stale' };
      if (result.status !== 'ok') return { kind: 'uncertain' };
      const notice = await attempt.confirm({ receipt: result.value });
      return { kind: 'confirmed', notice };
    } catch {
      return { kind: 'uncertain' };
    }
  }

  async function run(attempt: Attempt, current: Run) {
    const outcome = await execute(current, attempt);
    if (!live(current)) return;
    if (outcome.kind === 'uncertain') {
      owner.current = { kind: 'uncertain', attempt, signal: current.signal };
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

  function claim(): Run | null {
    const signal = operation.begin();
    if (!signal) return null;
    const current: Run = { kind: 'pending', signal };
    owner.current = current;
    return current;
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
      const previous = owner.current;
      if (previous.kind !== 'idle' && !previous.signal.aborted) return;
      const current = claim();
      if (!current) return;
      let attempt: Attempt;
      try {
        attempt = { ...prepare(), companyId, key: crypto.randomUUID() };
      } catch (error: unknown) {
        owner.current = { kind: 'idle' };
        operation.retire();
        throw error;
      }
      begin(attempt, current);
    },
    retry() {
      const previous = owner.current;
      if (previous.kind !== 'uncertain' || previous.signal.aborted) return;
      const current = claim();
      if (current) begin(previous.attempt, current);
    },
  };
}
