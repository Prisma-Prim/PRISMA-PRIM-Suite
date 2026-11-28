import { Pencil } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { BrowserIdentity } from '../../access-composition';
import type { ActorContext } from '../../access-types';
import { createAuthenticatedApiClient } from '../../api/authenticated-api-client';
import { handleAuthenticatedAccessRejection } from '../../api/latest-authenticated-request';
import { useRequestLifetime } from '../../api/use-actor-requests';
import { useScopedOperation } from '../../api/use-scoped-operation';
import {
  DEADLINE_KINDS,
  wrongDeadlineDay,
  type DeadlineSetVersion,
} from '../../certification/certification-exchanges';
import { useExchangeCopy } from '../../certification/certification-exchanges.copy';
import { deadlineLabel } from '../../certification/CertificationExchanges';
import {
  useDeadlineAdministration,
  type DeadlineQuery,
} from '../../certification/use-deadline-administration';
import { useInterfaceLocale } from '../../localization/interface-locale';
import { formatMessage } from '../../localization/messages';
import { ClarteButton } from '../components/ClarteButton';
import { ClarteCard } from '../components/ClarteCard';
import { ClarteField } from '../components/ClarteField';
import { ClarteSidePanel } from '../components/ClarteSidePanel';
import {
  ClarteEmptyState,
  ClarteErrorState,
  ClarteLoadingState,
} from '../components/ClarteState';
import { useSettingsConfigCopy } from './settings-config.copy';
import './settings-config.css';

type Props = Readonly<{
  actor: ActorContext;
  identity: BrowserIdentity;
  onActorRevalidated: (actor: ActorContext) => Promise<void> | void;
  onCompanyContextRejected: (companyId: string) => void;
  onWorkspaceAccessRejected: () => Promise<void> | void;
}>;

/**
 * Procedure deadlines in the Settings console (EX-233): the active
 * Company's certification procedure deadlines in calendar days, their next
 * version saved from a side panel and the history of versions, through the
 * Case dossier's deadline administration. A refusal rechecks the actor.
 */
export function ClarteProcedureDeadlines({
  actor,
  identity,
  ...handlers
}: Props) {
  const t = useExchangeCopy();
  const copy = useSettingsConfigCopy();
  const { formatDateTime } = useInterfaceLocale();
  const companyId = actor.activeCompany?.id;
  const scope = String(
    useRequestLifetime(
      identity,
      JSON.stringify([
        actor.workspaceId,
        actor.workspaceMembershipId,
        companyId,
        actor.workspacePermissions.includes('company.assignment.manage'),
      ]),
    ),
  );
  const recovery = useScopedOperation(`${scope}:recovery`);
  const callbacks = useRef(handlers);
  useLayoutEffect(() => {
    callbacks.current = handlers;
  });
  const query: DeadlineQuery = async (_slot, signal, path, post) => {
    const api = await createAuthenticatedApiClient(identity);
    signal.throwIfAborted();
    const result = await api.request(
      path,
      post
        ? {
            companyContextId: companyId,
            signal,
            method: 'POST',
            body: post.body,
            headers: {
              'idempotency-key': post.key,
              'content-type': 'application/json',
            },
          }
        : { companyContextId: companyId, signal, cache: 'no-store' },
    );
    if (
      !signal.aborted &&
      (result.status === 'unauthorized' || result.status === 'forbidden')
    ) {
      const recoverySignal = recovery.begin();
      if (recoverySignal)
        void handleAuthenticatedAccessRejection({
          result,
          identity,
          companyContextId: companyId,
          signal: recoverySignal,
          onActorRevalidated: (next) =>
            callbacks.current.onActorRevalidated(next),
          onCompanyContextRejected: (id) =>
            callbacks.current.onCompanyContextRejected(id),
          onWorkspaceAccessRejected: () =>
            callbacks.current.onWorkspaceAccessRejected(),
        }).catch(() => undefined);
    }
    return result;
  };
  const deadlines = useDeadlineAdministration({
    scope,
    enabled: true,
    query,
    onSaved: () => undefined,
  });
  const { view, feedback, draft } = deadlines;
  const [editing, setEditing] = useState(false);
  // Each access scope reads the set once; its own operation retires the last.
  useEffect(() => {
    void deadlines.load();
  }, [scope]);
  // A saved version closes the form.
  const [seen, setSeen] = useState(feedback);
  if (feedback !== seen) {
    setSeen(feedback);
    if (feedback.status === 'saved') setEditing(false);
  }
  const saving = feedback.status === 'saving';
  const days = (
    set: DeadlineSetVersion,
    kind: (typeof DEADLINE_KINDS)[number],
  ) => {
    const value = set.days[kind];
    return value === null
      ? t('adminNotConfigured')
      : formatMessage(t('adminDayCount'), { days: value });
  };
  const message = (() => {
    switch (feedback.status) {
      case 'saved':
        return (
          <p className="clarte-settings-status" role="status">
            {formatMessage(t('adminSaved'), { version: feedback.version })}
          </p>
        );
      case 'invalid':
      case 'unchanged':
        return (
          <p className="clarte-settings-alert" role="alert">
            {t(
              feedback.status === 'invalid' ? 'adminInvalid' : 'adminUnchanged',
            )}
          </p>
        );
      case 'stale':
        return (
          <div className="clarte-settings-alert" role="alert">
            <p>{t('adminStale')}</p>
            <ClarteButton onClick={() => void deadlines.load()}>
              {t('adminReload')}
            </ClarteButton>
          </div>
        );
      case 'uncertain':
        return (
          <div className="clarte-settings-alert" role="alert">
            <p>{t('adminUncertain')}</p>
            <ClarteButton
              onClick={() => void deadlines.save({ retry: true, busy: false })}
            >
              {t('adminRetry')}
            </ClarteButton>
          </div>
        );
      case 'saving':
      case 'idle':
        return null;
    }
  })();
  if (view.status !== 'ready')
    return view.status === 'denied' ? (
      <ClarteErrorState title={t('adminDenied')} />
    ) : view.status === 'unavailable' ? (
      <ClarteErrorState
        title={t('adminUnavailable')}
        action={
          <ClarteButton onClick={() => void deadlines.load()}>
            {t('adminRetry')}
          </ClarteButton>
        }
      />
    ) : (
      <ClarteLoadingState label={t('adminLoading')} />
    );
  const current = view.history.current;
  return (
    <div className="clarte-config">
      <ClarteCard
        title={t('adminTitle')}
        actions={
          <ClarteButton
            variant="quiet"
            size="small"
            className="clarte-config-soft"
            onClick={() => setEditing(true)}
          >
            <Pencil aria-hidden="true" />
            {copy.edit}
          </ClarteButton>
        }
      >
        {!editing && message}
        <div className="clarte-table-wrap">
          <table className="clarte-table clarte-config-table">
            <thead>
              <tr>
                <th scope="col">{copy.columnDeadline}</th>
                <th scope="col">{copy.columnDays}</th>
              </tr>
            </thead>
            <tbody>
              {DEADLINE_KINDS.map((kind) => (
                <tr key={kind}>
                  <td data-label={copy.columnDeadline}>
                    {t(deadlineLabel(kind))}
                  </td>
                  <td data-label={copy.columnDays}>
                    {current ? days(current, kind) : t('adminNotConfigured')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="clarte-settings-hint">
          {current
            ? formatMessage(copy.deadlineVersion, {
                version: current.version,
                by: current.configuredBy.displayName,
                at: formatDateTime(current.configuredAt),
              })
            : copy.noDeadlineVersion}
        </p>
      </ClarteCard>
      <ClarteCard title={t('adminHistoryTitle')}>
        {view.history.history.length === 0 ? (
          <ClarteEmptyState title={copy.noDeadlineVersion} />
        ) : (
          <ol
            className="clarte-config-timeline"
            aria-label={t('adminHistoryTitle')}
          >
            {view.history.history.map((set) => (
              <li key={set.version}>
                <strong>
                  {DEADLINE_KINDS.map(
                    (kind) => `${t(deadlineLabel(kind))}: ${days(set, kind)}`,
                  ).join(' · ')}
                </strong>
                <small>
                  {formatMessage(copy.deadlineVersion, {
                    version: set.version,
                    by: set.configuredBy.displayName,
                    at: formatDateTime(set.configuredAt),
                  })}
                </small>
              </li>
            ))}
          </ol>
        )}
      </ClarteCard>
      {editing && (
        <ClarteSidePanel
          title={t('adminTitle')}
          description={t('adminHelp')}
          dismissible={!saving && feedback.status !== 'uncertain'}
          onClose={() => setEditing(false)}
        >
          <form
            className="clarte-settings-form"
            aria-label={t('adminTitle')}
            noValidate
            onSubmit={(event) => {
              event.preventDefault();
              void deadlines.save({ retry: false, busy: false });
            }}
          >
            {message}
            {DEADLINE_KINDS.map((kind) => (
              <ClarteField
                key={kind}
                label={formatMessage(t('adminDays'), {
                  name: t(deadlineLabel(kind)),
                })}
              >
                {(control) => (
                  <input
                    {...control}
                    className="clarte-input"
                    inputMode="numeric"
                    value={draft[kind]}
                    disabled={saving}
                    aria-invalid={
                      feedback.status === 'invalid' &&
                      wrongDeadlineDay(draft[kind])
                        ? true
                        : undefined
                    }
                    onChange={(event) =>
                      deadlines.editDraft({
                        ...draft,
                        [kind]: event.target.value,
                      })
                    }
                  />
                )}
              </ClarteField>
            ))}
            <div className="clarte-settings-actions">
              <ClarteButton type="submit" variant="primary" disabled={saving}>
                {saving ? t('saving') : t('adminSubmit')}
              </ClarteButton>
            </div>
          </form>
        </ClarteSidePanel>
      )}
    </div>
  );
}
