import { useCallback, useEffect, useId, useRef, useState } from 'react';
import type { ActorContext } from '../access-types';
import type { BrowserIdentity } from '../access-composition';
import {
  handleAuthenticatedAccessRejection,
  runLatestAuthenticatedRequest,
} from '../api/latest-authenticated-request';
import { formatMessage } from '../localization/messages';
import { useInterfaceLocale } from '../localization/interface-locale';
import { offerModelAuthority } from './offer-model-authority';
import {
  readOfferModelResponse,
  type OfferModel,
} from './offer-model-response';
import { useOfferModelCopy } from './offer-model.copy';
import { OfferModelHistory } from './OfferModelHistory';
import { OfferModelForm } from './OfferModelForm';
import { OfferModelVersionContent } from './OfferModelVersionContent';
import { useOfferModelCommand } from './use-offer-model-command';
import { text } from './offer-model-content';
import type { OfferModelContent } from './offer-model-content';
import type { ApiResult } from '../api/authenticated-api-client';
import './offer-model.css';

export interface OfferModelWorkspaceProps {
  actor: ActorContext;
  identity: BrowserIdentity;
  onActorRevalidated?: (actor: ActorContext) => void | Promise<void>;
  onCompanyContextRejected?: (companyId: string) => void;
  onWorkspaceAccessRejected?: () => void | Promise<void>;
}
type Authority = NonNullable<ReturnType<typeof offerModelAuthority>>;
type Read =
  | { kind: 'loading' | 'error' | 'denied' }
  | { kind: 'ready'; model: OfferModel | null };

export function OfferModelWorkspace(props: OfferModelWorkspaceProps) {
  const [session, setSession] = useState({
    identity: props.identity,
    generation: 0,
  });
  if (session.identity !== props.identity) {
    setSession({
      identity: props.identity,
      generation: session.generation + 1,
    });
    return null;
  }
  const authority = offerModelAuthority(props.actor);
  return authority ? (
    <ScopedOfferModelWorkspace
      key={`${session.generation}:${authority.key}`}
      {...props}
      authority={authority}
    />
  ) : null;
}

function ScopedOfferModelWorkspace({
  actor,
  identity,
  authority,
  ...handlers
}: OfferModelWorkspaceProps & { authority: Authority }) {
  const copy = useOfferModelCopy();
  const heading = useId();
  const { formatNumber } = useInterfaceLocale();
  const epoch = useRef(0);
  const [historyGeneration, setHistoryGeneration] = useState(0);
  const [read, setRead] = useState<Read>({ kind: 'loading' });
  const [reason, setReason] = useState('');
  const [basis, setBasis] = useState('');
  const [invalidDecision, setInvalidDecision] = useState(false);
  const [draft, setDraft] = useState<{
    initial: OfferModelContent | null;
  } | null>(null);
  const pending = useRef<AbortController | undefined>(undefined);
  const accessRevalidation = useRef<AbortController | undefined>(undefined);
  const callbacks = useRef(handlers);
  callbacks.current = handlers;
  const load = useCallback(() => {
    epoch.current += 1;
    accessRevalidation.current?.abort();
    accessRevalidation.current = undefined;
    return runLatestAuthenticatedRequest({
      pending,
      identity,
      execute: (api, signal) =>
        api.request<unknown>('/offer-models/consulting-ro', {
          companyContextId: authority.companyId,
          signal,
        }),
      onResult: async (result, signal) => {
        if (result.status === 'ok') {
          try {
            const { model } = readOfferModelResponse(result.value);
            if (
              model &&
              (model.companyId !== authority.companyId ||
                model.workspaceId !== authority.workspaceId)
            )
              throw new Error('Unexpected model scope.');
            setRead({ kind: 'ready', model });
          } catch {
            setRead({ kind: 'error' });
          }
        } else if (
          result.status === 'forbidden' ||
          result.status === 'unauthorized'
        ) {
          setDraft(null);
          setBasis('');
          setReason('');
          setRead({ kind: 'denied' });
          await handleAuthenticatedAccessRejection({
            result,
            identity,
            companyContextId: authority.companyId,
            signal,
            onActorRevalidated: (value) =>
              callbacks.current.onActorRevalidated?.(value),
            onCompanyContextRejected: (id) =>
              callbacks.current.onCompanyContextRejected?.(id),
            onWorkspaceAccessRejected: () =>
              callbacks.current.onWorkspaceAccessRejected?.(),
          });
        } else setRead({ kind: 'error' });
      },
      onError: () => setRead({ kind: 'error' }),
    });
  }, [identity, authority.companyId, authority.workspaceId]);

  useEffect(() => {
    setRead({ kind: 'loading' });
    void load();
    return () => {
      pending.current?.abort();
      accessRevalidation.current?.abort();
    };
  }, [load]);

  // The scoped workspace survives a denied history read; the history child does not.
  // Its independent controller still retires on session/Company/authority changes.
  function rejectHistoryAccess(result: ApiResult<unknown>) {
    epoch.current += 1;
    pending.current?.abort();
    accessRevalidation.current?.abort();
    const controller = new AbortController();
    accessRevalidation.current = controller;
    setDraft(null);
    setBasis('');
    setReason('');
    setRead({ kind: 'denied' });
    void handleAuthenticatedAccessRejection({
      result,
      identity,
      companyContextId: authority.companyId,
      signal: controller.signal,
      onActorRevalidated: (actor) =>
        callbacks.current.onActorRevalidated?.(actor),
      onCompanyContextRejected: (id) =>
        callbacks.current.onCompanyContextRejected?.(id),
      onWorkspaceAccessRejected: () =>
        callbacks.current.onWorkspaceAccessRejected?.(),
    })
      .catch(() => undefined)
      .finally(() => {
        if (accessRevalidation.current === controller)
          accessRevalidation.current = undefined;
      });
  }

  const command = useOfferModelCommand({
    identity,
    authority,
    ...handlers,
    onStart: () => {
      epoch.current += 1;
      pending.current?.abort();
    },
    onConfirmed: () => {
      setHistoryGeneration((value) => value + 1);
      setReason('');
      setBasis('');
      setInvalidDecision(false);
      setDraft(null);
      setRead({ kind: 'loading' });
      void load();
    },
    onDenied: () => {
      setHistoryGeneration((value) => value + 1);
      setReason('');
      setBasis('');
      setInvalidDecision(false);
      setDraft(null);
      setRead({ kind: 'denied' });
    },
  });

  return (
    <section className="offer-model-workspace" aria-labelledby={heading}>
      <header>
        <h2 id={heading}>{copy('title')}</h2>
        <p>{copy('description')}</p>
      </header>
      <p className="offer-model-company">{actor.activeCompany?.displayName}</p>
      {read.kind === 'loading' && <p role="status">{copy('loading')}</p>}
      {(read.kind === 'error' || read.kind === 'denied') && (
        <p role="alert">{copy(read.kind)}</p>
      )}
      {read.kind === 'ready' && !read.model && <p>{copy('empty')}</p>}
      {command.state.kind === 'pending' && (
        <p role="status">{copy('saving')}</p>
      )}
      {command.state.kind === 'uncertain' && (
        <div role="alert">
          <p>{copy('uncertain')}</p>
          <button type="button" onClick={command.retry}>
            {copy('retry')}
          </button>
        </div>
      )}
      {command.state.kind === 'idle' && command.state.error && (
        <p role="alert">{copy(command.state.error)}</p>
      )}
      {command.state.kind === 'idle' && command.state.notice && (
        <p role="status">
          {formatMessage(copy(command.state.notice.key), {
            number: formatNumber(command.state.notice.number),
          })}
        </p>
      )}
      {read.kind === 'ready' && read.model && (
        <>
          <p>
            {read.model.activeVersion
              ? formatMessage(copy('active'), {
                  number: formatNumber(read.model.activeVersion.versionNumber),
                })
              : copy('noActive')}
          </p>
          {read.model.activeVersion && (
            <p className="offer-model-literal">
              {read.model.activeVersion.serviceTitle} —{' '}
              {copy(read.model.activeVersion.sourceKind)}
            </p>
          )}
          {authority.canDecide && read.model.activeVersion && (
            <fieldset disabled={command.blocked || draft !== null}>
              <legend>{copy('withdraw')}</legend>
              <div className="offer-model-field">
                <label htmlFor={`${heading}-withdrawal`}>
                  {copy('withdrawReason')}
                </label>
                <textarea
                  id={`${heading}-withdrawal`}
                  value={reason}
                  maxLength={2000}
                  required
                  onChange={(event) => setReason(event.target.value)}
                />
              </div>
              {invalidDecision && <p role="alert">{copy('invalid')}</p>}
              <button
                type="button"
                onClick={() => {
                  if (
                    read.kind !== 'ready' ||
                    !read.model?.activeVersion ||
                    command.blocked ||
                    draft
                  )
                    return;
                  try {
                    text(reason, 2000);
                    setInvalidDecision(false);
                    command.start({
                      kind: 'WITHDRAW',
                      previous: read.model,
                      target: read.model.activeVersion,
                      reason,
                    });
                  } catch {
                    setInvalidDecision(true);
                  }
                }}
              >
                {copy('withdraw')}
              </button>
            </fieldset>
          )}
          <h3>{copy('head')}</h3>
          <OfferModelVersionContent version={read.model.head} />
          {authority.canDecide && read.model.head.decision === null && (
            <fieldset disabled={command.blocked || draft !== null}>
              <legend>{copy('pending')}</legend>
              <div className="offer-model-field">
                <label htmlFor={`${heading}-basis`}>{copy('basis')}</label>
                <textarea
                  id={`${heading}-basis`}
                  value={basis}
                  maxLength={2000}
                  required
                  onChange={(event) => setBasis(event.target.value)}
                />
              </div>
              {invalidDecision && <p role="alert">{copy('invalid')}</p>}
              <div className="offer-model-actions">
                {(['APPROVE', 'REJECT'] as const).map((outcome) => (
                  <button
                    key={outcome}
                    type="button"
                    onClick={() => {
                      if (
                        read.kind !== 'ready' ||
                        !read.model ||
                        command.blocked ||
                        draft
                      )
                        return;
                      try {
                        text(basis, 2000);
                        setInvalidDecision(false);
                        command.start({
                          kind: 'DECIDE',
                          previous: read.model,
                          outcome,
                          basis,
                        });
                      } catch {
                        setInvalidDecision(true);
                      }
                    }}
                  >
                    {copy(outcome === 'APPROVE' ? 'approve' : 'reject')}
                  </button>
                ))}
              </div>
            </fieldset>
          )}
        </>
      )}
      {read.kind === 'ready' && read.model && (
        <OfferModelHistory
          key={historyGeneration}
          identity={identity}
          model={read.model}
          blocked={command.blocked || draft !== null}
          epoch={epoch}
          onDenied={rejectHistoryAccess}
        />
      )}
      {authority.canEdit && read.kind === 'ready' && !draft && (
        <div className="offer-model-actions">
          <button
            type="button"
            disabled={command.blocked}
            onClick={() => setDraft({ initial: null })}
          >
            {copy('newVersion')}
          </button>
          {read.model && (
            <button
              type="button"
              disabled={command.blocked}
              onClick={() => {
                if (read.model) setDraft({ initial: read.model.head.content });
              }}
            >
              {copy('copyHead')}
            </button>
          )}
        </div>
      )}
      {draft && (
        <OfferModelForm
          initial={draft.initial}
          disabled={command.blocked || read.kind !== 'ready'}
          onCancel={() => setDraft(null)}
          onSubmit={(content) => {
            if (read.kind === 'ready')
              command.start({ kind: 'CREATE', previous: read.model, content });
          }}
        />
      )}
      <button
        type="button"
        disabled={read.kind === 'loading' || command.blocked}
        onClick={() => {
          setRead({ kind: 'loading' });
          void load();
        }}
      >
        {copy('refresh')}
      </button>
    </section>
  );
}
