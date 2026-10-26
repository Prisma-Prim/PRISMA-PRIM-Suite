import { useCallback, useEffect, useId, useRef, useState } from 'react';
import type { BrowserIdentity } from '../access-composition';
import type { ActorContext } from '../access-types';
import {
  createAuthenticatedApiClient,
  type ApiResult,
} from '../api/authenticated-api-client';
import { handleAuthenticatedAccessRejection } from '../api/latest-authenticated-request';
import { useInterfaceLocale } from '../localization/interface-locale';
import { ProfitabilityForm } from './ProfitabilityForm';
import { ProfitabilityVersionDetail } from './ProfitabilityVersionDetail';
import {
  parseEstimateHistory,
  parseEstimateVersion,
  profitabilityAuthority,
  profitabilityContextKey,
  type DecisionCode,
  type EstimateHistory,
  type EstimateInputs,
  type EstimateVersion,
} from './profitability-contract';
import { useProfitabilityCopy } from './profitability.copy';
import './profitability-estimate.css';

type Props = {
  actor: ActorContext;
  identity: BrowserIdentity;
  opportunityId: string;
  requestedVersionId?: string;
  onProtectedAccessRejected?: () => void;
  onCompanyContextRejected: (companyContextId: string) => void;
  onActorRevalidated?: (actor: ActorContext) => Promise<void> | void;
  onWorkspaceAccessRejected?: () => Promise<void> | void;
};
type View =
  | { kind: 'loading' | 'error' | 'denied' }
  | { kind: 'ready'; history: EstimateHistory };
type Command = { path: string; payload: string; key: string } & (
  | { kind: 'submit' }
  | {
      kind: 'decision';
      versionId: string;
      versionNumber: number;
      code: DecisionCode;
    }
);
type Mutation =
  | { kind: 'idle' | 'invalid' | 'stale' | 'saved' | 'decided' }
  | { kind: 'sending' | 'uncertain'; command: Command };

export function ProfitabilityEstimatePanel(props: Props) {
  const authority = profitabilityAuthority(props.actor);
  // Session replacement must retire a command even if its principal IDs match.
  const identityGeneration = useRef({
    identity: props.identity,
    generation: 0,
  });
  if (identityGeneration.current.identity !== props.identity) {
    identityGeneration.current = {
      identity: props.identity,
      generation: identityGeneration.current.generation + 1,
    };
  }
  if (
    !authority.read ||
    !props.identity.loaded ||
    !props.identity.signedIn ||
    !props.actor.activeCompany
  )
    return null;
  return (
    <ProfitabilityEstimateOwner
      key={`${profitabilityContextKey(props.actor)}:${props.opportunityId}:${props.requestedVersionId ?? 'history'}:${identityGeneration.current.generation}`}
      {...props}
      company={props.actor.activeCompany}
      authority={authority}
    />
  );
}

function ProfitabilityEstimateOwner({
  actor,
  identity,
  opportunityId,
  requestedVersionId,
  onProtectedAccessRejected,
  company,
  authority,
  onCompanyContextRejected,
  onActorRevalidated = () => undefined,
  onWorkspaceAccessRejected = () => undefined,
}: Props & {
  company: NonNullable<ActorContext['activeCompany']>;
  authority: ReturnType<typeof profitabilityAuthority>;
}) {
  const copy = useProfitabilityCopy();
  const { formatDateTime } = useInterfaceLocale();
  const fieldId = useId();
  const [view, setView] = useState<View>({ kind: 'loading' });
  const [mutation, setMutation] = useState<Mutation>({ kind: 'idle' });
  const [selected, setSelected] = useState<EstimateVersion>();
  const [correction, setCorrection] = useState<EstimateVersion>();
  const [editorGeneration, setEditorGeneration] = useState(0);
  const [confirmationRevision, setConfirmationRevision] = useState(0);
  const [reading, setReading] = useState(false);
  const [readError, setReadError] = useState(false);
  const pending = useRef<AbortController | undefined>(undefined);
  const callbacks = useRef({
    onProtectedAccessRejected,
    onCompanyContextRejected,
    onActorRevalidated,
    onWorkspaceAccessRejected,
  });
  callbacks.current = {
    onProtectedAccessRejected,
    onCompanyContextRejected,
    onActorRevalidated,
    onWorkspaceAccessRejected,
  };
  const basePath = `/opportunities/${encodeURIComponent(opportunityId)}/profitability-estimates`;
  const scope = {
    workspaceId: actor.workspaceId,
    companyId: company.id,
    opportunityId,
  };
  const busy = reading || mutation.kind === 'sending';
  const locked =
    busy || mutation.kind === 'uncertain' || mutation.kind === 'stale';

  const request = useCallback(
    async (
      path: string,
      controller: AbortController,
      command?: Command,
    ): Promise<ApiResult<unknown> | undefined> => {
      const api = await createAuthenticatedApiClient(identity);
      if (controller.signal.aborted) return undefined;
      return api.request<unknown>(path, {
        companyContextId: company.id,
        signal: controller.signal,
        ...(command
          ? {
              method: 'POST',
              body: command.payload,
              headers: {
                'content-type': 'application/json',
                'idempotency-key': command.key,
              },
            }
          : {}),
      });
    },
    [company.id, identity],
  );

  const reject = useCallback(
    async (result: ApiResult<unknown>, controller: AbortController) => {
      if (
        result.status !== 'unauthorized' &&
        result.status !== 'forbidden' &&
        result.status !== 'notFound'
      )
        return false;
      // Close the protected projection before any asynchronous actor refresh.
      setView({ kind: 'denied' });
      setSelected(undefined);
      setCorrection(undefined);
      setMutation({ kind: 'idle' });
      callbacks.current.onProtectedAccessRejected?.();
      await handleAuthenticatedAccessRejection({
        result,
        identity,
        companyContextId: company.id,
        signal: controller.signal,
        ...callbacks.current,
      });
      return true;
    },
    [company.id, identity],
  );

  const load = useCallback(async () => {
    pending.current?.abort();
    const controller = new AbortController();
    pending.current = controller;
    setView({ kind: 'loading' });
    setSelected(undefined);
    setConfirmationRevision((current) => current + 1);
    setMutation({ kind: 'idle' });
    setReadError(false);
    try {
      const result = await request(basePath, controller);
      if (
        !result ||
        controller.signal.aborted ||
        (await reject(result, controller))
      )
        return;
      if (result.status !== 'ok') {
        setView({ kind: 'error' });
        return;
      }
      const history = parseEstimateHistory(result.value, {
        workspaceId: actor.workspaceId,
        companyId: company.id,
        opportunityId,
      });
      if (requestedVersionId) {
        const exact = await request(
          `${basePath}/versions/${encodeURIComponent(requestedVersionId)}`,
          controller,
        );
        if (
          !exact ||
          controller.signal.aborted ||
          (await reject(exact, controller))
        )
          return;
        if (exact.status !== 'ok')
          throw new Error('Exact estimate unavailable.');
        const version = parseEstimateVersion(exact.value, {
          workspaceId: actor.workspaceId,
          companyId: company.id,
          opportunityId,
        });
        if (version.id !== requestedVersionId)
          throw new Error('Unexpected exact profitability Version.');
        setSelected(version);
      }
      setView({ kind: 'ready', history });
    } catch {
      if (!controller.signal.aborted) setView({ kind: 'error' });
    } finally {
      if (pending.current === controller) {
        pending.current = undefined;
        setReading(false);
      }
    }
  }, [
    actor.workspaceId,
    basePath,
    company.id,
    opportunityId,
    requestedVersionId,
    reject,
    request,
  ]);

  useEffect(() => {
    void load();
    return () => {
      pending.current?.abort();
      pending.current = undefined;
    };
  }, [load]);

  async function read(
    path: string,
    kind: 'older' | 'detail',
    versionId?: string,
  ) {
    if (view.kind !== 'ready' || locked) return;
    pending.current?.abort();
    const controller = new AbortController();
    pending.current = controller;
    setReading(true);
    setReadError(false);
    try {
      const result = await request(path, controller);
      if (
        !result ||
        controller.signal.aborted ||
        (await reject(result, controller))
      )
        return;
      if (result.status !== 'ok') {
        setReadError(true);
        return;
      }
      if (kind === 'detail') {
        const detail = parseEstimateVersion(result.value, scope);
        if (detail.id !== versionId)
          throw new Error('Unexpected exact profitability version.');
        setSelected(detail);
        setView({
          kind: 'ready',
          history: {
            ...view.history,
            items: view.history.items.map((item) =>
              item.id === detail.id ? detail : item,
            ),
          },
        });
      } else {
        const page = parseEstimateHistory(result.value, scope);
        const last = view.history.items.at(-1);
        if (
          page.items.some(
            (item) => item.versionNumber >= (last?.versionNumber ?? Infinity),
          ) ||
          page.items.some((item) =>
            view.history.items.some((existing) => existing.id === item.id),
          )
        )
          throw new Error('Invalid continued profitability history.');
        setView({
          kind: 'ready',
          history: { ...page, items: [...view.history.items, ...page.items] },
        });
      }
    } catch {
      if (!controller.signal.aborted) setReadError(true);
    } finally {
      if (pending.current === controller) {
        pending.current = undefined;
        setReading(false);
      }
    }
  }

  async function execute(command: Command) {
    if (view.kind !== 'ready' || busy) return;
    pending.current?.abort();
    const controller = new AbortController();
    pending.current = controller;
    setMutation({ kind: 'sending', command });
    // Aborting our local wait cannot prove a rollback. The exact command remains retryable.
    const timeout = window.setTimeout(() => controller.abort(), 15_000);
    try {
      const result = await request(command.path, controller, command);
      if (pending.current !== controller) return;
      if (!result || controller.signal.aborted) {
        setMutation({ kind: 'uncertain', command });
        return;
      }
      if (await reject(result, controller)) return;
      if (result.status === 'validation') {
        setMutation({ kind: 'invalid' });
        return;
      }
      if (result.status === 'conflict') {
        setMutation({ kind: 'stale' });
        return;
      }
      if (result.status !== 'ok') {
        setMutation({ kind: 'uncertain', command });
        return;
      }
      const version = parseEstimateVersion(result.value, scope);
      if (
        command.kind === 'decision' &&
        (version.id !== command.versionId ||
          version.versionNumber !== command.versionNumber ||
          version.decision?.code !== command.code)
      )
        throw new Error('Unexpected Director decision response.');
      if (
        command.kind === 'submit' &&
        version.versionNumber !== (view.history.latestVersionNumber ?? 0) + 1
      )
        throw new Error('Unexpected profitability successor.');
      setView({
        kind: 'ready',
        history: {
          ...view.history,
          latestVersionNumber:
            command.kind === 'submit'
              ? version.versionNumber
              : view.history.latestVersionNumber,
          items:
            command.kind === 'submit'
              ? [version, ...view.history.items]
              : view.history.items.map((item) =>
                  item.id === version.id ? version : item,
                ),
        },
      });
      setSelected(version);
      if (command.kind === 'submit') setCorrection(version);
      setMutation({ kind: command.kind === 'submit' ? 'saved' : 'decided' });
    } catch {
      if (pending.current === controller)
        setMutation({ kind: 'uncertain', command });
    } finally {
      window.clearTimeout(timeout);
      if (pending.current === controller) pending.current = undefined;
    }
  }

  function submit(inputs: EstimateInputs) {
    if (view.kind !== 'ready' || locked || !authority.create) return;
    void execute({
      kind: 'submit',
      path: basePath,
      payload: JSON.stringify({
        expectedLatestVersionNumber: view.history.latestVersionNumber,
        ...inputs,
      }),
      key: crypto.randomUUID(),
    });
  }
  function decide(version: EstimateVersion, code: DecisionCode) {
    if (!authority.decide || locked || version.decision !== null) return;
    void execute({
      kind: 'decision',
      versionId: version.id,
      versionNumber: version.versionNumber,
      code,
      path: `${basePath}/versions/${encodeURIComponent(version.id)}/decision`,
      payload: JSON.stringify({
        expectedVersionNumber: version.versionNumber,
        expectedDecision: null,
        code,
      }),
      key: crypto.randomUUID(),
    });
  }
  return (
    <section
      className="profitability-estimate"
      aria-labelledby={`${fieldId}-title`}
    >
      <h3 id={`${fieldId}-title`}>{copy('title')}</h3>
      <p>
        {copy('company')}: <strong>{company.displayName}</strong>
      </p>
      <p>{copy('boundary')}</p>
      {view.kind === 'loading' ? <p role="status">{copy('loading')}</p> : null}
      {view.kind === 'error' || view.kind === 'denied' ? (
        <p role="alert">{copy(view.kind === 'error' ? 'error' : 'denied')}</p>
      ) : null}
      {view.kind !== 'loading' ? (
        <button type="button" onClick={() => void load()} disabled={busy}>
          {copy('reload')}
        </button>
      ) : null}
      {view.kind === 'ready' ? (
        <>
          {mutation.kind === 'invalid' ? (
            <p id={`${fieldId}-error`} role="alert">
              {copy('validation')}
            </p>
          ) : null}
          {mutation.kind === 'stale' ? (
            <p role="alert">{copy('stale')}</p>
          ) : null}
          {mutation.kind === 'sending' ? (
            <p role="status">{copy('saving')}</p>
          ) : null}
          {mutation.kind === 'saved' || mutation.kind === 'decided' ? (
            <p role="status">{copy(mutation.kind)}</p>
          ) : null}
          {mutation.kind === 'uncertain' ? (
            <div role="alert">
              <p>{copy('uncertain')}</p>
              <button
                type="button"
                onClick={() => void execute(mutation.command)}
              >
                {copy('retry')}
              </button>
            </div>
          ) : null}
          <p>
            {copy('latest')}: {view.history.latestVersionNumber ?? '—'}
          </p>
        </>
      ) : null}
      {authority.create && !requestedVersionId && view.kind !== 'denied' ? (
        <div hidden={view.kind !== 'ready'}>
          <ProfitabilityForm
            key={`${correction?.id ?? 'first'}:${editorGeneration}`}
            initialInputs={correction?.inputs}
            confirmationRevision={confirmationRevision}
            disabled={locked || view.kind !== 'ready'}
            invalid={mutation.kind === 'invalid'}
            errorId={`${fieldId}-error`}
            onInvalid={() => setMutation({ kind: 'invalid' })}
            onSubmit={submit}
          />
        </div>
      ) : null}
      {view.kind === 'ready' ? (
        <>
          {!requestedVersionId ? (
            <>
              <h4>{copy('history')}</h4>
              {view.history.items.length === 0 ? (
                <p>{copy('empty')}</p>
              ) : (
                <ol className="profitability-history">
                  {view.history.items.map((version) => (
                    <li key={version.id}>
                      <strong>
                        {copy('version')} {version.versionNumber}
                      </strong>
                      <p>
                        {copy('decision')}:{' '}
                        {copy(version.decision?.code ?? 'awaiting')}
                      </p>
                      <p>
                        {copy('author')}:{' '}
                        <span className="profitability-reference">
                          {version.createdByWorkspaceMembershipId}
                        </span>{' '}
                        — {formatDateTime(version.createdAt)}
                      </p>
                      <button
                        type="button"
                        disabled={locked}
                        onClick={() =>
                          void read(
                            `${basePath}/versions/${encodeURIComponent(version.id)}`,
                            'detail',
                            version.id,
                          )
                        }
                      >
                        {copy('open')} {version.versionNumber}
                      </button>
                    </li>
                  ))}
                </ol>
              )}
              {readError ? <p role="alert">{copy('error')}</p> : null}
              {reading ? <p role="status">{copy('loading')}</p> : null}
              {view.history.nextCursor ? (
                <button
                  type="button"
                  disabled={locked}
                  onClick={() =>
                    void read(
                      `${basePath}?cursor=${encodeURIComponent(view.history.nextCursor ?? '')}`,
                      'older',
                    )
                  }
                >
                  {copy('more')}
                </button>
              ) : null}
            </>
          ) : null}
          {selected ? (
            <ProfitabilityVersionDetail
              version={selected}
              disabled={locked}
              mayDecide={authority.decide}
              mayCreate={authority.create && !requestedVersionId}
              onDecide={(code) => decide(selected, code)}
              onCorrection={() => {
                setCorrection(selected);
                setEditorGeneration((current) => current + 1);
                setMutation({ kind: 'idle' });
              }}
            />
          ) : null}
        </>
      ) : null}
    </section>
  );
}
