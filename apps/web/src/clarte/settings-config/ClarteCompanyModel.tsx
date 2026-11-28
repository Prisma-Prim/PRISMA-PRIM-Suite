import { BookOpen, Copy, Plus, RefreshCw, Undo2 } from 'lucide-react';
import { useState } from 'react';
import { useAuthorityLifetime } from '../../access/use-authority-lifetime';
import { useActorObservation } from '../../api/use-actor-requests';
import { companyModelAuthority } from '../../company-model/company-model-authority';
import type {
  CompanyModelContentBase,
  CompanyModelDraftBase,
  CompanyModelKind,
} from '../../company-model/company-model-kind';
import type { CompanyModelVersion as Version } from '../../company-model/company-model-response';
import { CompanyModelForm } from '../../company-model/CompanyModelForm';
import { CompanyModelHistory } from '../../company-model/CompanyModelHistory';
import { CompanyModelVersion } from '../../company-model/CompanyModelVersion';
import {
  useCompanyModel,
  type CompanyModelBodyProps,
  type CompanyModelWorkspaceProps,
} from '../../company-model/CompanyModelWorkspace';
import { ModelAccessLifetime } from '../../company-model/ModelAccessLifetime';
import { useInterfaceLocale } from '../../localization/interface-locale';
import { formatMessage } from '../../localization/messages';
import { ClarteBadge, type ClarteTone } from '../components/ClarteBadge';
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

type Kind<
  Content extends CompanyModelContentBase,
  Draft extends CompanyModelDraftBase,
> = { kind: CompanyModelKind<Content, Draft> };

/**
 * An Offer or Contract model in the Settings console (EX-096 to EX-099,
 * EX-116 to EX-118): the version available for new use, the latest
 * submitted version with its decision, the history with any exact version
 * reopened and copied into a draft, and a complete new version proposed
 * from a side panel. Lost access shows the existing message and reload.
 */
export function ClarteCompanyModel<
  Content extends CompanyModelContentBase,
  Draft extends CompanyModelDraftBase,
>({
  kind,
  actor,
  identity,
  ...handlers
}: CompanyModelWorkspaceProps & Kind<Content, Draft>) {
  const copy = kind.useCopy();
  const authority = companyModelAuthority(actor, kind.grants);
  const observation = useActorObservation(actor);
  const captureRecovery = useAuthorityLifetime(String(observation), identity);
  if (!authority) return null;
  return (
    <div className={`clarte-config ${kind.rootClass}`}>
      <ModelAccessLifetime
        identity={identity}
        actor={actor}
        authority={authority}
        {...handlers}
        denied={(retry) => (
          <ClarteErrorState
            title={copy('denied')}
            action={
              <ClarteButton onClick={retry}>{copy('refresh')}</ClarteButton>
            }
          />
        )}
      >
        <CompanyModelScreen
          kind={kind}
          identity={identity}
          authority={authority}
          captureRecovery={captureRecovery}
        />
      </ModelAccessLifetime>
    </div>
  );
}

type Panel = 'read' | 'decide' | 'withdraw' | null;

function statusOf(version: Version<CompanyModelContentBase>): {
  key: 'pending' | 'approved' | 'rejected' | 'withdrawn';
  tone: ClarteTone;
} {
  if (version.withdrawal) return { key: 'withdrawn', tone: 'neutral' };
  if (!version.decision) return { key: 'pending', tone: 'warning' };
  return version.decision.outcome === 'APPROVE'
    ? { key: 'approved', tone: 'success' }
    : { key: 'rejected', tone: 'danger' };
}

function CompanyModelScreen<
  Content extends CompanyModelContentBase,
  Draft extends CompanyModelDraftBase,
>(props: CompanyModelBodyProps<Content, Draft>) {
  const { kind, identity, authority, captureRecovery } = props;
  const copy = kind.useCopy();
  const versionKind = kind.useVersionKind();
  const config = useSettingsConfigCopy();
  const { formatNumber, formatDateTime } = useInterfaceLocale();
  const model = useCompanyModel(props);
  const { read, command, draft, setDraft, invalidDecision } = model;
  const [panel, setPanel] = useState<Panel>(null);
  // A confirmed decision or withdrawal closes its panel.
  const [generation, setGeneration] = useState(model.historyGeneration);
  if (generation !== model.historyGeneration) {
    setGeneration(model.historyGeneration);
    setPanel(null);
  }
  const number = (value: number) =>
    formatMessage(copy('version'), { number: formatNumber(value) });
  const status = (
    <>
      {command.state.kind === 'pending' && (
        <p className="clarte-settings-status" role="status">
          {copy('saving')}
        </p>
      )}
      {command.state.kind === 'uncertain' && (
        <div className="clarte-settings-alert" role="alert">
          <p>{copy('uncertain')}</p>
          <ClarteButton onClick={command.retry}>{copy('retry')}</ClarteButton>
        </div>
      )}
      {command.state.kind === 'idle' && command.state.error && (
        <p className="clarte-settings-alert" role="alert">
          {copy(command.state.error)}
        </p>
      )}
      {command.state.kind === 'idle' && command.state.notice && (
        <p className="clarte-settings-status" role="status">
          {formatMessage(copy(command.state.notice.key), {
            number: formatNumber(command.state.notice.number),
          })}
        </p>
      )}
    </>
  );
  const editActions = authority.canEdit && read.kind === 'ready' && !draft && (
    <>
      <ClarteButton
        variant="quiet"
        size="small"
        className="clarte-config-soft"
        disabled={command.blocked}
        onClick={() => setDraft({ initial: null })}
      >
        <Plus aria-hidden="true" />
        {copy('newVersion')}
      </ClarteButton>
      {read.model && (
        <ClarteButton
          size="small"
          disabled={command.blocked}
          onClick={() => {
            if (read.model) setDraft({ initial: read.model.head.content });
          }}
        >
          <Copy aria-hidden="true" />
          {copy('copyHead')}
        </ClarteButton>
      )}
    </>
  );
  const reload = (
    <ClarteButton
      variant="quiet"
      size="small"
      disabled={read.kind === 'loading' || command.blocked}
      onClick={model.reload}
    >
      <RefreshCw aria-hidden="true" />
      {copy('refresh')}
    </ClarteButton>
  );
  if (read.kind !== 'ready')
    return (
      <>
        {status}
        {read.kind === 'loading' ? (
          <ClarteLoadingState label={copy('loading')} />
        ) : (
          <ClarteErrorState title={copy('error')} action={reload} />
        )}
      </>
    );
  const current = read.model;
  // A form or decision panel shows the command's outcome beside its fields.
  const statusBeside =
    draft !== null || panel === 'decide' || panel === 'withdraw';
  return (
    <>
      {!statusBeside && status}
      {!current ? (
        <ClarteCard>
          <ClarteEmptyState
            title={copy('empty')}
            action={
              <div className="clarte-settings-actions">{editActions}</div>
            }
          />
        </ClarteCard>
      ) : (
        <>
          <ClarteCard
            title={
              current.activeVersion
                ? formatMessage(copy('active'), {
                    number: formatNumber(current.activeVersion.versionNumber),
                  })
                : copy('noActive')
            }
            actions={
              <>
                <ClarteButton
                  variant="quiet"
                  size="small"
                  className="clarte-config-soft"
                  onClick={() => setPanel('read')}
                >
                  <BookOpen aria-hidden="true" />
                  {config.readVersion}
                </ClarteButton>
                {editActions}
              </>
            }
          >
            {current.activeVersion && (
              <p className="clarte-config-literal">
                {current.activeVersion.serviceTitle} —{' '}
                {copy(current.activeVersion.sourceKind)}
              </p>
            )}
            <p className="clarte-settings-hint">{versionKind}</p>
            {authority.canDecide && current.activeVersion && (
              <div className="clarte-settings-actions">
                <ClarteButton
                  size="small"
                  disabled={command.blocked || draft !== null}
                  onClick={() => setPanel('withdraw')}
                >
                  <Undo2 aria-hidden="true" />
                  {copy('withdraw')}
                </ClarteButton>
              </div>
            )}
          </ClarteCard>
          <ClarteCard title={config.versions} actions={reload}>
            <h3>{copy('head')}</h3>
            <div className="clarte-table-wrap">
              <table className="clarte-table clarte-config-table">
                <thead>
                  <tr>
                    <th scope="col">{config.columnVersion}</th>
                    <th scope="col">{config.columnCreatedBy}</th>
                    <th scope="col">{config.columnState}</th>
                    <th scope="col">
                      <span className="clarte-visually-hidden">
                        {config.decide}
                      </span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td data-label={config.columnVersion}>
                      <span className="clarte-settings-cell-stack">
                        <strong>{number(current.head.versionNumber)}</strong>
                        <small className="clarte-config-literal">
                          {current.head.content.serviceTitle}
                        </small>
                      </span>
                    </td>
                    <td data-label={config.columnCreatedBy}>
                      <span className="clarte-settings-cell-stack">
                        <span>{current.head.actor.displayName}</span>
                        <small>{formatDateTime(current.head.recordedAt)}</small>
                      </span>
                    </td>
                    <td data-label={config.columnState}>
                      <ClarteBadge tone={statusOf(current.head).tone}>
                        {copy(statusOf(current.head).key)}
                      </ClarteBadge>
                    </td>
                    <td>
                      {authority.canDecide &&
                        current.head.decision === null && (
                          <ClarteButton
                            size="small"
                            variant="quiet"
                            className="clarte-config-soft"
                            disabled={command.blocked || draft !== null}
                            onClick={() => setPanel('decide')}
                          >
                            {config.decide}
                          </ClarteButton>
                        )}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div className="clarte-config-history">
              <CompanyModelHistory
                captureRecovery={captureRecovery}
                key={model.historyGeneration}
                kind={kind}
                identity={identity}
                model={current}
                blocked={command.blocked || draft !== null}
                epoch={model.epoch}
                onDenied={model.rejectAccess}
                onCopy={
                  authority.canEdit
                    ? (content) => {
                        if (!command.blocked && !draft)
                          setDraft({ initial: content });
                      }
                    : undefined
                }
              />
            </div>
          </ClarteCard>
        </>
      )}
      {panel === 'read' && current && (
        <ClarteSidePanel
          title={copy('head')}
          description={versionKind}
          onClose={() => setPanel(null)}
        >
          <div className="clarte-config-version">
            <CompanyModelVersion kind={kind} version={current.head} />
          </div>
        </ClarteSidePanel>
      )}
      {panel === 'decide' && current && (
        <ClarteSidePanel
          title={copy('pending')}
          description={`${number(current.head.versionNumber)}: ${current.head.content.serviceTitle}`}
          dismissible={!command.blocked}
          onClose={() => setPanel(null)}
        >
          <div className="clarte-settings-form">
            {status}
            <ClarteField
              label={copy('basis')}
              error={invalidDecision ? copy('invalid') : undefined}
            >
              {(control) => (
                <textarea
                  {...control}
                  className="clarte-input"
                  value={model.basis}
                  maxLength={2000}
                  required
                  disabled={command.blocked}
                  onChange={(event) => model.setBasis(event.target.value)}
                />
              )}
            </ClarteField>
            <div className="clarte-settings-actions">
              <ClarteButton
                variant="primary"
                disabled={command.blocked}
                onClick={() => model.decide('APPROVE')}
              >
                {copy('approve')}
              </ClarteButton>
              <ClarteButton
                variant="danger"
                disabled={command.blocked}
                onClick={() => model.decide('REJECT')}
              >
                {copy('reject')}
              </ClarteButton>
            </div>
          </div>
        </ClarteSidePanel>
      )}
      {panel === 'withdraw' && current?.activeVersion && (
        <ClarteSidePanel
          title={copy('withdraw')}
          description={`${number(current.activeVersion.versionNumber)}: ${current.activeVersion.serviceTitle}`}
          dismissible={!command.blocked}
          onClose={() => setPanel(null)}
        >
          <div className="clarte-settings-form">
            {status}
            <ClarteField
              label={copy('withdrawReason')}
              error={invalidDecision ? copy('invalid') : undefined}
            >
              {(control) => (
                <textarea
                  {...control}
                  className="clarte-input"
                  value={model.reason}
                  maxLength={2000}
                  required
                  disabled={command.blocked}
                  onChange={(event) => model.setReason(event.target.value)}
                />
              )}
            </ClarteField>
            <div className="clarte-settings-actions">
              <ClarteButton
                variant="danger"
                disabled={command.blocked}
                onClick={model.withdraw}
              >
                {copy('withdraw')}
              </ClarteButton>
            </div>
          </div>
        </ClarteSidePanel>
      )}
      {draft && (
        <ClarteSidePanel
          title={copy('newVersion')}
          description={copy('formHelp')}
          dismissible={!command.blocked}
          onClose={() => setDraft(null)}
        >
          <div className="clarte-config-model-form">
            {status}
            <CompanyModelForm
              kind={kind}
              initial={draft.initial}
              disabled={command.blocked || read.kind !== 'ready'}
              onCancel={() => setDraft(null)}
              onSubmit={model.create}
            />
          </div>
        </ClarteSidePanel>
      )}
    </>
  );
}
