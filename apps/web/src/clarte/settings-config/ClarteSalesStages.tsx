import { Plus } from 'lucide-react';
import { useState } from 'react';
import type { BrowserIdentity } from '../../access-composition';
import type { ActorContext } from '../../access-types';
import { useSalesStageCopy } from '../../commercial-intake/sales-stage.copy';
import { useSalesStageTransport } from '../../commercial-intake/sales-stage-transport';
import { SALES_STAGE_STATE_KEYS } from '../../commercial-intake/SalesStageSettings';
import {
  useSalesStageSettings,
  type SalesStageSettingsProps,
} from '../../commercial-intake/use-sales-stage-settings';
import { formatMessage } from '../../localization/messages';
import { useInterfaceLocale } from '../../localization/interface-locale';
import { ClarteBadge } from '../components/ClarteBadge';
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
  onActivityRecorded: () => Promise<void> | void;
  onActorRevalidated: (actor: ActorContext) => Promise<void> | void;
  onCompanyContextRejected: (companyId: string) => void;
  onWorkspaceAccessRejected: () => Promise<void> | void;
}>;

/**
 * Sales stages in the Settings console (EX-064): the active Company's stages
 * in order, and for a holder of the configuration bundle one stage added at
 * the end, through the Commercial Intake transport.
 */
export function ClarteSalesStages(props: Props) {
  const copy = useSettingsConfigCopy();
  const transport = useSalesStageTransport(props);
  if (transport.status === 'denied')
    return (
      <ClarteErrorState
        title={copy.accessLost}
        action={
          <ClarteButton onClick={transport.retry}>{copy.retry}</ClarteButton>
        }
      />
    );
  if (transport.status === 'no-company') return null;
  return (
    <SalesStagePanel
      {...transport.settings}
      companyName={props.actor.activeCompany?.displayName ?? ''}
    />
  );
}

function SalesStagePanel({
  companyName,
  onConfigured,
  ...props
}: SalesStageSettingsProps & Readonly<{ companyName: string }>) {
  const copy = useSettingsConfigCopy();
  const stageCopy = useSalesStageCopy();
  const { formatNumber } = useInterfaceLocale();
  const [adding, setAdding] = useState(false);
  const settings = useSalesStageSettings({
    ...props,
    // A confirmed stage closes the form before the Activity Log refresh.
    onConfigured: () => {
      setAdding(false);
      return onConfigured();
    },
  });
  const { list, stages, full, create, feedback } = settings;
  const feedbackRole =
    feedback === stageCopy('salesStageCreated') ? 'status' : 'alert';
  const protectedWrite = create === 'saving' || create === 'uncertain';
  if (list.kind === 'loading')
    return <ClarteLoadingState label={stageCopy('salesStagesLoading')} />;
  if (list.kind === 'error')
    return (
      <ClarteErrorState
        title={stageCopy('salesStagesError')}
        action={
          <ClarteButton onClick={() => void settings.loadList()}>
            {stageCopy('salesStagesReload')}
          </ClarteButton>
        }
      />
    );
  const canAdd = props.canConfigure && !full && create !== 'conflict';
  return (
    <>
      <ClarteCard
        title={`${companyName} · ${formatMessage(copy.stageCount, {
          count: formatNumber(stages.length),
        })}`}
        actions={
          canAdd && (
            <ClarteButton
              variant="quiet"
              size="small"
              className="clarte-config-soft"
              disabled={protectedWrite && !adding}
              onClick={() => setAdding(true)}
            >
              <Plus aria-hidden="true" />
              {copy.addStage}
            </ClarteButton>
          )
        }
      >
        {feedback && !adding && (
          <p className={`clarte-settings-${feedbackRole}`} role={feedbackRole}>
            {feedback}
          </p>
        )}
        {stages.length === 0 ? (
          <ClarteEmptyState title={stageCopy('salesStagesEmpty')} />
        ) : (
          <ol
            className="clarte-config-steps"
            aria-label={stageCopy('salesStageList')}
          >
            {stages.map((stage, index) => (
              <li key={stage.id}>
                <span className="clarte-config-step-dot" aria-hidden="true">
                  {formatNumber(index + 1)}
                </span>
                <strong>{stage.label}</strong>
                <ClarteBadge tone="success">
                  {stageCopy(SALES_STAGE_STATE_KEYS[stage.state])}
                </ClarteBadge>
              </li>
            ))}
          </ol>
        )}
        {props.canConfigure && create === 'conflict' && (
          <div className="clarte-settings-actions">
            <ClarteButton onClick={settings.reloadAfterConflict}>
              {stageCopy('salesStagesReload')}
            </ClarteButton>
          </div>
        )}
        {props.canConfigure && full && (
          <p className="clarte-settings-hint">{stageCopy('salesStageLimit')}</p>
        )}
        {!props.canConfigure && (
          <p className="clarte-settings-hint">
            {stageCopy('salesStageReadOnly')}
          </p>
        )}
        <p className="clarte-settings-hint">{copy.stageLimits}</p>
      </ClarteCard>
      {adding && (
        <ClarteSidePanel
          title={stageCopy('salesStageSettings')}
          description={stageCopy('salesStageSettingsHelp')}
          dismissible={!protectedWrite}
          onClose={() => setAdding(false)}
        >
          <form
            className="clarte-settings-form"
            noValidate
            onSubmit={(event) => void settings.submit(event)}
          >
            {feedback && (
              <p
                className={`clarte-settings-${feedbackRole}`}
                role={feedbackRole}
              >
                {feedback}
              </p>
            )}
            <ClarteField
              label={stageCopy('salesStageLabel')}
              error={settings.labelError || undefined}
            >
              {(control) => (
                <input
                  {...control}
                  className="clarte-input"
                  value={settings.label}
                  maxLength={80}
                  disabled={create !== 'idle'}
                  onChange={(event) => settings.editLabel(event.target.value)}
                />
              )}
            </ClarteField>
            {create === 'saving' && (
              <p className="clarte-settings-status" role="status">
                {stageCopy('salesStageSaving')}
              </p>
            )}
            {create === 'conflict' ? (
              <div className="clarte-settings-actions">
                <ClarteButton
                  onClick={() => {
                    settings.reloadAfterConflict();
                    setAdding(false);
                  }}
                >
                  {stageCopy('salesStagesReload')}
                </ClarteButton>
              </div>
            ) : (
              <div className="clarte-settings-actions">
                <ClarteButton
                  type="submit"
                  variant="primary"
                  disabled={create === 'saving'}
                >
                  {create === 'uncertain'
                    ? stageCopy('retrySalesStage')
                    : stageCopy('createSalesStage')}
                </ClarteButton>
                {create === 'uncertain' && (
                  <ClarteButton
                    variant="quiet"
                    onClick={() => {
                      settings.abandonUncertain();
                      setAdding(false);
                    }}
                  >
                    {stageCopy('cancelSalesStage')}
                  </ClarteButton>
                )}
              </div>
            )}
          </form>
        </ClarteSidePanel>
      )}
    </>
  );
}
