import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import type { BrowserIdentity } from '../access-composition';
import { useAuthorityLifetime } from '../access/use-authority-lifetime';
import {
  createAuthenticatedApiClient,
  type ApiResult,
} from '../api/authenticated-api-client';
import {
  isClosedProjectStatus,
  readProjectLifecycle,
  type ProjectStatus,
} from './project-lifecycle-response';
import { useProjectNextActionCopy } from './project-next-action.copy';
import {
  normalizeNextActionText,
  readNextActionReceipt,
  type NextActionIntent,
  type NextActionReceipt,
  type NextActionScope,
  type NextActionSnapshot,
} from './project-next-action-response';
import { NextActionValue } from './ProjectNextActionViews';

export type NextActionRecovery = (
  result: ApiResult<unknown>,
  valid: () => boolean,
  recoveryValid: () => boolean,
  signal: AbortSignal,
) => Promise<void>;
type Command = {
  intent: NextActionIntent;
  body: string;
  key: string;
  valid: () => boolean;
  recoveryValid: () => boolean;
  controller: AbortController;
};
type Mutation =
  | { kind: 'idle' | 'invalid' | 'conflict' | 'denied' }
  | { kind: 'pending' | 'uncertain'; command: Command }
  | { kind: 'confirmed'; command: Command; receipt: NextActionReceipt };
export function NextActionEditor(props: {
  identity: BrowserIdentity;
  projectStatus: ProjectStatus;
  scope: NextActionScope;
  path: string;
  snapshot: NextActionSnapshot | null;
  ready: boolean;
  refresh: number;
  review: number;
  capture: () => () => boolean;
  captureRecovery: () => () => boolean;
  recover: NextActionRecovery;
  onReadRejected: (
    result: ApiResult<unknown>,
    recoveryValid: () => boolean,
  ) => Promise<void>;
  onConfirmed: () => Promise<void>;
}) {
  const copy = useProjectNextActionCopy(),
    id = useId(),
    capture = useAuthorityLifetime(props.path, props.identity);
  const [draft, setDraft] = useState(''),
    [dirty, setDirty] = useState(false),
    [mutation, setMutation] = useState<Mutation>({ kind: 'idle' }),
    [lifecycle, setLifecycle] = useState<{
      refresh: number;
      value: ReturnType<typeof readProjectLifecycle>;
    } | null>(null),
    [lifecycleError, setLifecycleError] = useState(false);
  const writeRequest = useRef<AbortController | undefined>(undefined);
  function validCapture() {
    const read = props.capture(),
      write = capture();
    return () => read() && write();
  }
  useEffect(() => {
    const valid = validCapture(),
      recoveryValid = props.captureRecovery(),
      controller = new AbortController();
    const live = () => valid() && !controller.signal.aborted;
    setLifecycle(null);
    setLifecycleError(false);
    void (async () => {
      try {
        const api = await createAuthenticatedApiClient(props.identity);
        if (!live()) return;
        const result = await api.request<unknown>(
          `/projects/${encodeURIComponent(props.scope.projectId)}/lifecycle`,
          {
            companyContextId: props.scope.companyId,
            signal: controller.signal,
          },
        );
        if (!live()) return;
        if (result.status === 'unauthorized' || result.status === 'forbidden') {
          await props.onReadRejected(result, recoveryValid);
          return;
        }
        if (result.status !== 'ok') {
          setLifecycleError(true);
          return;
        }
        const value = readProjectLifecycle(result.value);
        if (live()) setLifecycle({ refresh: props.refresh, value });
      } catch {
        if (live()) setLifecycleError(true);
      }
    })();
    return () => controller.abort();
  }, [props.refresh]);
  useEffect(() => () => writeRequest.current?.abort(), []);
  useEffect(() => {
    if (
      props.ready &&
      (mutation.kind === 'conflict' || mutation.kind === 'invalid')
    )
      setMutation({ kind: 'idle' });
  }, [props.review]);
  const source = props.snapshot?.current;
  const value = dirty ? draft : (source?.text ?? '');
  const protectedIntent =
    mutation.kind === 'pending' || mutation.kind === 'uncertain';
  const observedLifecycle =
    lifecycle?.refresh === props.refresh ? lifecycle.value : null;
  const closed =
    isClosedProjectStatus(props.projectStatus) ||
    (observedLifecycle !== null &&
      (!observedLifecycle.mutable ||
        isClosedProjectStatus(observedLifecycle.status)));
  const disabled =
    protectedIntent ||
    mutation.kind === 'denied' ||
    mutation.kind === 'conflict' ||
    closed ||
    !props.ready ||
    !source ||
    !observedLifecycle;
  async function execute(command: Command) {
    if (!command.valid()) return;
    setMutation({ kind: 'pending', command });
    writeRequest.current = command.controller;
    const live = () => command.valid() && !command.controller.signal.aborted;
    try {
      const api = await createAuthenticatedApiClient(props.identity);
      if (!live()) return;
      const result = await api.request<unknown>(props.path, {
        method: 'POST',
        body: command.body,
        headers: {
          'content-type': 'application/json',
          'idempotency-key': command.key,
        },
        companyContextId: props.scope.companyId,
        signal: command.controller.signal,
      });
      if (!live()) return;
      if (result.status === 'ok') {
        let receipt: ReturnType<typeof readNextActionReceipt>;
        try {
          receipt = readNextActionReceipt(
            result.value,
            props.scope,
            command.intent,
          );
        } catch {
          setMutation({ kind: 'uncertain', command });
          return;
        }
        if (!receipt) {
          setMutation({ kind: 'uncertain', command });
          return;
        }
        setMutation({ kind: 'confirmed', command, receipt });
        setDirty(false);
        await props.onConfirmed();
        return;
      }
      if (result.status === 'unauthorized') {
        await props.onReadRejected(result, command.recoveryValid);
        return;
      }
      if (result.status === 'forbidden') {
        setDraft('');
        setDirty(false);
        setMutation({ kind: 'denied' });
        try {
          await props.recover(
            result,
            live,
            command.recoveryValid,
            command.controller.signal,
          );
        } catch {
          // A definite write refusal remains refused if optional recovery fails.
        }
        return;
      }
      setMutation(
        result.status === 'conflict' || result.status === 'notFound'
          ? { kind: 'conflict' }
          : result.status === 'validation'
            ? { kind: 'invalid' }
            : { kind: 'uncertain', command },
      );
    } catch {
      if (live()) setMutation({ kind: 'uncertain', command });
    }
  }
  function submit(clear = false) {
    if (disabled || !source || !observedLifecycle) return;
    let text: string | null;
    try {
      text = clear
        ? null
        : dirty
          ? normalizeNextActionText(draft)
          : source.text;
    } catch {
      setMutation({ kind: 'invalid' });
      return;
    }
    const intent = {
      expectedRevision: source.revision,
      expectedLifecycleRevision: observedLifecycle.lifecycleRevision,
      text,
    };
    void execute({
      intent,
      body: JSON.stringify(intent),
      key: crypto.randomUUID(),
      valid: validCapture(),
      recoveryValid: props.captureRecovery(),
      controller: new AbortController(),
    });
  }
  function onSubmit(event: FormEvent) {
    event.preventDefault();
    submit();
  }
  return (
    <form onSubmit={onSubmit} className="next-action-editor">
      <label htmlFor={`${id}-input`}>{copy('label')}</label>
      <p id={`${id}-help`}>{copy('help')}</p>
      <textarea
        id={`${id}-input`}
        rows={4}
        value={value}
        disabled={disabled}
        aria-describedby={`${id}-help${mutation.kind === 'invalid' ? ` ${id}-error` : ''}`}
        aria-invalid={mutation.kind === 'invalid'}
        onChange={(event) => {
          setDraft(event.target.value);
          setDirty(true);
          if (mutation.kind === 'invalid') setMutation({ kind: 'idle' });
        }}
      />
      <div className="next-action-controls">
        <button type="submit" disabled={disabled}>
          {copy(source && source.revision > 0 ? 'replace' : 'save')}
        </button>
        <button
          type="button"
          disabled={disabled || source?.text === null}
          onClick={() => submit(true)}
        >
          {copy('clear')}
        </button>
      </div>
      {closed && !isClosedProjectStatus(props.projectStatus) && (
        <p>{copy('closed')}</p>
      )}
      {lifecycleError && <p role="alert">{copy('lifecycleError')}</p>}
      {mutation.kind !== 'idle' && mutation.kind !== 'confirmed' && (
        <p
          id={`${id}-error`}
          role={mutation.kind === 'pending' ? 'status' : 'alert'}
        >
          {copy(mutation.kind)}
        </p>
      )}
      {mutation.kind === 'uncertain' && (
        <button type="button" onClick={() => void execute(mutation.command)}>
          {copy('retry')}
        </button>
      )}
      {mutation.kind === 'confirmed' && (
        <section aria-label={copy('savedResult')}>
          <p role="status">
            {copy(
              mutation.receipt.outcome === 'changed'
                ? 'confirmed'
                : 'unchanged',
            )}
          </p>
          <NextActionValue record={mutation.receipt.record} />
        </section>
      )}
    </form>
  );
}
