import { useEffect, useState } from 'react';
import type { BrowserIdentity } from '../access-composition';
import { createAuthenticatedApiClient } from '../api/authenticated-api-client';
import {
  readReviewReceipt,
  type AvailableMissionReview,
} from './mission-result-review-response';
import { useMissionReviewCopy } from './mission-result-review.copy';

type Evidence =
  | { kind: 'DECLARED_RESULT'; resultId: string }
  | { kind: 'EXTERNAL_REPORTED'; reference: string };
type Item = {
  taskId: string;
  expectedTaskVersion: number;
  expectedResultRevision: number;
  evidence: Evidence;
};
type Intent = {
  expectedReviewRevision: number;
  outcome: 'ACCEPTED_BY_REVIEWER' | 'NEEDS_WORK';
  basis: string;
  items: Item[];
};
type Command = { key: string; body: string };
type State =
  | {
      kind:
        | 'editing'
        | 'conflict'
        | 'invalid'
        | 'denied'
        | 'confirmed'
        | 'unchanged';
    }
  | { kind: 'pending' | 'uncertain'; command: Command };
interface Props {
  snapshot: AvailableMissionReview;
  fresh: boolean;
  identity: BrowserIdentity;
  projectId: string;
  companyId?: string;
  onConfirmed: () => void;
}

/** This owner is retired on any consumed write capture change, without retiring readable history. */
export function MissionResultReviewForm({
  snapshot,
  fresh,
  identity,
  projectId,
  companyId,
  onConfirmed,
}: Props) {
  const copy = useMissionReviewCopy();
  const [draft, setDraft] = useState<Intent>({
    expectedReviewRevision: snapshot.revision,
    outcome: 'NEEDS_WORK',
    basis: '',
    items: [],
  });
  const [state, setState] = useState<State>({ kind: 'editing' });
  const [conflictSnapshot, setConflictSnapshot] =
    useState<AvailableMissionReview | null>(null);
  const requiresReload = conflictSnapshot === snapshot;
  const [lifetime] = useState(() => new AbortController());
  useEffect(() => () => lifetime.abort(), [lifetime]);
  const locked = state.kind === 'pending' || state.kind === 'uncertain';
  const stale =
    draft.items.length > 0 &&
    (draft.expectedReviewRevision !== snapshot.revision ||
      draft.items.some((item) => {
        const row = snapshot.activities.find(
          (row) => row.taskId === item.taskId,
        );
        return (
          !row ||
          row.task.status !== 'done' ||
          row.task.version !== item.expectedTaskVersion ||
          (row.result.current?.revision ?? 0) !== item.expectedResultRevision
        );
      }));
  const update = (taskId: string, evidence: Evidence) =>
    setDraft((value) => ({
      ...value,
      items: value.items.map((item) =>
        item.taskId === taskId ? { ...item, evidence } : item,
      ),
    }));
  const clear = () => {
    setDraft({
      expectedReviewRevision: snapshot.revision,
      outcome: 'NEEDS_WORK',
      basis: '',
      items: [],
    });
    setState({ kind: 'editing' });
  };
  async function submit(command: Command) {
    setState({ kind: 'pending', command });
    try {
      const api = await createAuthenticatedApiClient(identity);
      const response = await api.request<unknown>(
        `/projects/${projectId}/mission-result-reviews`,
        {
          method: 'POST',
          companyContextId: companyId,
          body: command.body,
          headers: {
            'Idempotency-Key': command.key,
            'Content-Type': 'application/json',
          },
          signal: lifetime.signal,
        },
      );
      if (lifetime.signal.aborted) return;
      if (response.status === 'unauthorized') {
        setDraft({ ...draft, basis: '', items: [] });
        setState({ kind: 'denied' });
        await identity.rejectSession();
        return;
      }
      if (response.status === 'forbidden' || response.status === 'notFound') {
        setDraft({ ...draft, basis: '', items: [] });
        setState({ kind: 'denied' });
        return;
      }
      if (response.status === 'conflict') {
        setConflictSnapshot(snapshot);
        setState({ kind: 'conflict' });
        return;
      }
      if (response.status === 'validation') {
        setState({ kind: 'invalid' });
        return;
      }
      if (response.status !== 'ok') {
        setState({ kind: 'uncertain', command });
        return;
      }
      try {
        const receipt = readReviewReceipt(response.value, projectId);
        setDraft({
          expectedReviewRevision: receipt.reviewRevision,
          outcome: 'NEEDS_WORK',
          basis: '',
          items: [],
        });
        setState({
          kind: receipt.action === 'recorded' ? 'confirmed' : 'unchanged',
        });
        onConfirmed();
      } catch {
        setState({ kind: 'uncertain', command });
      }
    } catch {
      if (!lifetime.signal.aborted) setState({ kind: 'uncertain', command });
    }
  }
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (locked || stale || requiresReload || !fresh || !snapshot.mutable)
          return;
        const ordered = snapshot.activities.flatMap((row) =>
          draft.items.filter((item) => item.taskId === row.taskId),
        );
        void submit({
          key: crypto.randomUUID(),
          body: JSON.stringify({
            ...draft,
            basis: draft.basis.trim(),
            items: ordered,
          }),
        });
      }}
    >
      {snapshot.mutable && (
        <fieldset
          disabled={
            locked || requiresReload || !fresh || state.kind === 'denied'
          }
        >
          {snapshot.activities.map((row) => {
            const selected = draft.items.find(
              (item) => item.taskId === row.taskId,
            );
            return (
              <div key={row.taskId}>
                <label>
                  <input
                    type="checkbox"
                    checked={Boolean(selected)}
                    disabled={row.task.status !== 'done'}
                    onChange={(event) => {
                      if (!event.currentTarget.checked)
                        setDraft((value) => ({
                          ...value,
                          items: value.items.filter(
                            (item) => item.taskId !== row.taskId,
                          ),
                        }));
                      else
                        setDraft((value) => ({
                          ...value,
                          expectedReviewRevision: value.items.length
                            ? value.expectedReviewRevision
                            : snapshot.revision,
                          items: [
                            ...value.items,
                            {
                              taskId: row.taskId,
                              expectedTaskVersion: row.task.version,
                              expectedResultRevision:
                                row.result.current?.revision ?? 0,
                              evidence: row.result.current
                                ? {
                                    kind: 'DECLARED_RESULT',
                                    resultId: row.result.current.id,
                                  }
                                : { kind: 'EXTERNAL_REPORTED', reference: '' },
                            },
                          ],
                        }));
                    }}
                  />
                  {copy('select')} — {row.key}
                </label>
                {selected && (
                  <>
                    <p>{row.intendedResult}</p>
                    <p>
                      {selected.expectedTaskVersion} /{' '}
                      {selected.expectedResultRevision}
                    </p>
                    <label>
                      {copy('outcome')} — {row.key}
                      <select
                        value={selected.evidence.kind}
                        onChange={(event) => {
                          if (event.currentTarget.value === 'EXTERNAL_REPORTED')
                            update(row.taskId, {
                              kind: 'EXTERNAL_REPORTED',
                              reference: '',
                            });
                          if (
                            event.currentTarget.value === 'DECLARED_RESULT' &&
                            row.result.current
                          )
                            update(row.taskId, {
                              kind: 'DECLARED_RESULT',
                              resultId: row.result.current.id,
                            });
                        }}
                      >
                        <option value="EXTERNAL_REPORTED">
                          {copy('EXTERNAL_REPORTED')}
                        </option>
                        {row.result.current && (
                          <option value="DECLARED_RESULT">
                            {copy('DECLARED_RESULT')}
                          </option>
                        )}
                      </select>
                    </label>
                    {selected.evidence.kind === 'EXTERNAL_REPORTED' ? (
                      <>
                        <label>
                          {copy('reference')} — {row.key}
                          <input
                            required
                            maxLength={2000}
                            value={selected.evidence.reference}
                            onChange={(event) =>
                              update(row.taskId, {
                                kind: 'EXTERNAL_REPORTED',
                                reference: event.currentTarget.value,
                              })
                            }
                          />
                        </label>
                        <p>{copy('externalNotice')}</p>
                      </>
                    ) : (
                      <p>
                        {copy('DECLARED_RESULT')} — {selected.evidence.resultId}
                      </p>
                    )}
                  </>
                )}
              </div>
            );
          })}
          <label>
            {copy('outcome')}
            <select
              value={draft.outcome}
              onChange={(event) => {
                const outcome = event.currentTarget.value;
                if (
                  outcome === 'NEEDS_WORK' ||
                  outcome === 'ACCEPTED_BY_REVIEWER'
                )
                  setDraft({ ...draft, outcome });
              }}
            >
              <option value="NEEDS_WORK">{copy('NEEDS_WORK')}</option>
              <option value="ACCEPTED_BY_REVIEWER">
                {copy('ACCEPTED_BY_REVIEWER')}
              </option>
            </select>
          </label>
          <label>
            {copy('basis')}
            <textarea
              required
              maxLength={4000}
              value={draft.basis}
              onChange={(event) =>
                setDraft({ ...draft, basis: event.currentTarget.value })
              }
            />
          </label>
          <button
            type="submit"
            disabled={
              stale ||
              !draft.items.length ||
              !draft.basis.trim() ||
              draft.items.some(
                (item) =>
                  item.evidence.kind === 'EXTERNAL_REPORTED' &&
                  !item.evidence.reference.trim(),
              )
            }
          >
            {copy('submit')}
          </button>
          <button type="button" onClick={clear}>
            {copy('clear')}
          </button>
        </fieldset>
      )}
      {stale && <p role="alert">{copy('draftStale')}</p>}
      {state.kind !== 'editing' && (
        <p role={state.kind === 'pending' ? 'status' : 'alert'}>
          {copy(state.kind)}
        </p>
      )}
      {state.kind === 'uncertain' && (
        <button type="button" onClick={() => void submit(state.command)}>
          {copy('retry')}
        </button>
      )}
    </form>
  );
}
