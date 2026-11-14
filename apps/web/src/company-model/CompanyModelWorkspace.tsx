import { useCallback, useEffect, useId, useRef, useState } from 'react';
import type { ActorContext } from '../access-types';
import type { BrowserIdentity } from '../access-composition';
import { runLatestAuthenticatedRequest } from '../api/latest-authenticated-request';
import { formatMessage } from '../localization/messages';
import { useInterfaceLocale } from '../localization/interface-locale';
import {
  companyModelAuthority,
  type CompanyModelAuthority,
} from './company-model-authority';
import type {
  CompanyModelContentBase,
  CompanyModelDraftBase,
  CompanyModelKind,
} from './company-model-kind';
import {
  modelText,
  readCompanyModelResponse,
  type CompanyModel,
} from './company-model-response';
import { CompanyModelForm } from './CompanyModelForm';
import { CompanyModelHistory } from './CompanyModelHistory';
import { CompanyModelVersion } from './CompanyModelVersion';
import { useCompanyModelCommand } from './use-company-model-command';
import {
  ModelAccessLifetime,
  useModelAccessRejection,
} from './ModelAccessLifetime';
import './company-model.css';

export interface CompanyModelWorkspaceProps {
  actor: ActorContext;
  identity: BrowserIdentity;
  onActorRevalidated?: (actor: ActorContext) => void | Promise<void>;
  onCompanyContextRejected?: (companyId: string) => void;
  onWorkspaceAccessRejected?: () => void | Promise<void>;
}
type Kind<
  Content extends CompanyModelContentBase,
  Draft extends CompanyModelDraftBase,
> = { kind: CompanyModelKind<Content, Draft> };
type Read<Content extends CompanyModelContentBase> =
  | { kind: 'loading' | 'error' }
  | { kind: 'ready'; model: CompanyModel<Content> | null };

/** One Company model kind's workspace: current model, decisions and history. */
export function CompanyModelWorkspace<
  Content extends CompanyModelContentBase,
  Draft extends CompanyModelDraftBase,
>(props: CompanyModelWorkspaceProps & Kind<Content, Draft>) {
  const authority = companyModelAuthority(props.actor, props.kind.grants);
  return authority ? (
    <ScopedCompanyModelWorkspace {...props} authority={authority} />
  ) : null;
}

function ScopedCompanyModelWorkspace<
  Content extends CompanyModelContentBase,
  Draft extends CompanyModelDraftBase,
>({
  kind,
  actor,
  identity,
  authority,
  ...handlers
}: CompanyModelWorkspaceProps &
  Kind<Content, Draft> & { authority: CompanyModelAuthority }) {
  const copy = kind.useCopy();
  const heading = useId();
  return (
    <section
      className={`company-model-workspace ${kind.rootClass}`}
      aria-labelledby={heading}
    >
      <header>
        <h2 id={heading}>{copy('title')}</h2>
        <p>{copy('description')}</p>
      </header>
      <p className="company-model-company">
        {actor.activeCompany?.displayName}
      </p>
      <ModelAccessLifetime
        identity={identity}
        actor={actor}
        authority={authority}
        {...handlers}
        denied={(retry) => (
          <>
            <p role="alert">{copy('denied')}</p>
            <button type="button" onClick={retry}>
              {copy('refresh')}
            </button>
          </>
        )}
      >
        <CompanyModelBody
          kind={kind}
          identity={identity}
          authority={authority}
          heading={heading}
        />
      </ModelAccessLifetime>
    </section>
  );
}

function CompanyModelBody<
  Content extends CompanyModelContentBase,
  Draft extends CompanyModelDraftBase,
>({
  kind,
  identity,
  authority,
  heading,
}: Kind<Content, Draft> & {
  identity: BrowserIdentity;
  authority: CompanyModelAuthority;
  heading: string;
}) {
  const copy = kind.useCopy();
  const rejectAccess = useModelAccessRejection();
  const { formatNumber } = useInterfaceLocale();
  const epoch = useRef(0);
  const [historyGeneration, setHistoryGeneration] = useState(0);
  const [read, setRead] = useState<Read<Content>>({ kind: 'loading' });
  const [reason, setReason] = useState('');
  const [basis, setBasis] = useState('');
  const [invalidDecision, setInvalidDecision] = useState(false);
  const [draft, setDraft] = useState<{ initial: Content | null } | null>(null);
  const pending = useRef<AbortController | undefined>(undefined);
  const load = useCallback(() => {
    epoch.current += 1;
    return runLatestAuthenticatedRequest({
      pending,
      identity,
      execute: (api, signal) =>
        api.request(kind.path, {
          companyContextId: authority.companyId,
          signal,
        }),
      onResult: (result) => {
        if (result.status === 'ok') {
          try {
            const { model } = readCompanyModelResponse(kind, result.value);
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
          rejectAccess(result);
        } else setRead({ kind: 'error' });
      },
      onError: () => setRead({ kind: 'error' }),
    });
  }, [
    kind,
    identity,
    authority.companyId,
    authority.workspaceId,
    rejectAccess,
  ]);

  useEffect(() => {
    setRead({ kind: 'loading' });
    void load();
    return () => {
      pending.current?.abort();
    };
  }, [load]);

  const command = useCompanyModelCommand({
    kind,
    identity,
    authority,
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
    onDenied: rejectAccess,
  });

  return (
    <>
      {read.kind === 'loading' && <p role="status">{copy('loading')}</p>}
      {read.kind === 'error' && <p role="alert">{copy('error')}</p>}
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
            <p className="company-model-literal">
              {read.model.activeVersion.serviceTitle} —{' '}
              {copy(read.model.activeVersion.sourceKind)}
            </p>
          )}
          {authority.canDecide && read.model.activeVersion && (
            <fieldset disabled={command.blocked || draft !== null}>
              <legend>{copy('withdraw')}</legend>
              <div className="company-model-field">
                <label htmlFor={`${heading}-withdrawal`}>
                  {copy('withdrawReason')}
                </label>
                <textarea
                  id={`${heading}-withdrawal`}
                  value={reason}
                  maxLength={2000}
                  required
                  aria-invalid={invalidDecision || undefined}
                  aria-describedby={
                    invalidDecision ? `${heading}-withdraw-error` : undefined
                  }
                  onChange={(event) => setReason(event.target.value)}
                />
              </div>
              {invalidDecision && (
                <p role="alert" id={`${heading}-withdraw-error`}>
                  {copy('invalid')}
                </p>
              )}
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
                    modelText(reason, 2000);
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
          <CompanyModelVersion kind={kind} version={read.model.head} />
          {authority.canDecide && read.model.head.decision === null && (
            <fieldset disabled={command.blocked || draft !== null}>
              <legend>{copy('pending')}</legend>
              <div className="company-model-field">
                <label htmlFor={`${heading}-basis`}>{copy('basis')}</label>
                <textarea
                  id={`${heading}-basis`}
                  value={basis}
                  maxLength={2000}
                  required
                  aria-invalid={invalidDecision || undefined}
                  aria-describedby={
                    invalidDecision ? `${heading}-basis-error` : undefined
                  }
                  onChange={(event) => setBasis(event.target.value)}
                />
              </div>
              {invalidDecision && (
                <p role="alert" id={`${heading}-basis-error`}>
                  {copy('invalid')}
                </p>
              )}
              <div className="company-model-actions">
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
                        modelText(basis, 2000);
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
        <CompanyModelHistory
          key={historyGeneration}
          kind={kind}
          identity={identity}
          model={read.model}
          blocked={command.blocked || draft !== null}
          epoch={epoch}
          onDenied={rejectAccess}
          onCopy={
            authority.canEdit
              ? (content) => {
                  if (!command.blocked && !draft)
                    setDraft({ initial: content });
                }
              : undefined
          }
        />
      )}
      {authority.canEdit && read.kind === 'ready' && !draft && (
        <div className="company-model-actions">
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
        <CompanyModelForm
          kind={kind}
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
    </>
  );
}
