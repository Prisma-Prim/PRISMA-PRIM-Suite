import {
  useSalesStageCopy,
  type SalesStageMessageKey,
} from './sales-stage.copy';
import type { SalesStageList } from './sales-stage';
import {
  useSalesStageSettings,
  type SalesStageSettingsProps,
} from './use-sales-stage-settings';

// Indexing by the stage state makes a new state a type error until its
// localized label exists.
export const SALES_STAGE_STATE_KEYS = {
  ACTIVE: 'stateActive',
} as const satisfies Record<
  SalesStageList['stages'][number]['state'],
  SalesStageMessageKey
>;

/**
 * The active Company's Sales Stage settings (Commercial Workflow PRD section
 * 24.6): the stages in order with their state. A holder of the configuration
 * bundle creates stages at the end of the list; every other Commercial Intake
 * reader sees the list read-only.
 */
export function SalesStageSettings({
  onBack,
  ...props
}: SalesStageSettingsProps & { onBack: () => void }) {
  const stageCopy = useSalesStageCopy();
  const { canConfigure } = props;
  const {
    list,
    stages,
    full,
    label,
    create,
    feedback,
    labelError,
    loadList,
    submit,
    editLabel,
    reloadAfterConflict,
    abandonUncertain,
  } = useSalesStageSettings(props);
  return (
    <section
      className="commercial-intake-sales-stages"
      aria-labelledby="commercial-intake-sales-stages-title"
    >
      <button type="button" onClick={onBack} disabled={create === 'saving'}>
        {stageCopy('backToRequests')}
      </button>
      <h3 id="commercial-intake-sales-stages-title">
        {stageCopy('salesStageSettings')}
      </h3>
      <p>{stageCopy('salesStageSettingsHelp')}</p>
      {feedback ? <p role="alert">{feedback}</p> : null}
      {list.kind === 'loading' ? (
        <p role="status">{stageCopy('salesStagesLoading')}</p>
      ) : list.kind === 'error' ? (
        <>
          <p role="alert">{stageCopy('salesStagesError')}</p>
          <button type="button" onClick={() => void loadList()}>
            {stageCopy('salesStagesReload')}
          </button>
        </>
      ) : stages.length === 0 ? (
        <p>{stageCopy('salesStagesEmpty')}</p>
      ) : (
        <ol aria-label={stageCopy('salesStageList')}>
          {stages.map((stage) => (
            <li key={stage.id}>
              <span>{stage.label}</span>
              <small>{stageCopy(SALES_STAGE_STATE_KEYS[stage.state])}</small>
            </li>
          ))}
        </ol>
      )}
      {canConfigure && list.kind === 'ready' ? (
        create === 'conflict' ? (
          <button type="button" onClick={reloadAfterConflict}>
            {stageCopy('salesStagesReload')}
          </button>
        ) : full ? (
          <p>{stageCopy('salesStageLimit')}</p>
        ) : (
          <form
            className="commercial-intake-sales-stage-form"
            noValidate
            onSubmit={(event) => void submit(event)}
          >
            <label>
              {stageCopy('salesStageLabel')}
              <input
                value={label}
                onChange={(event) => editLabel(event.target.value)}
                disabled={create !== 'idle'}
                aria-invalid={labelError ? true : undefined}
                aria-describedby={
                  labelError ? 'commercial-intake-sales-stage-error' : undefined
                }
              />
            </label>
            {labelError ? (
              <p id="commercial-intake-sales-stage-error" role="alert">
                {labelError}
              </p>
            ) : null}
            {create === 'saving' ? (
              <p role="status">{stageCopy('salesStageSaving')}</p>
            ) : null}
            <div className="commercial-intake-next-action-actions">
              <button
                type="submit"
                className="commercial-intake-primary-action"
                disabled={create === 'saving'}
              >
                {create === 'uncertain'
                  ? stageCopy('retrySalesStage')
                  : stageCopy('createSalesStage')}
              </button>
              {create === 'uncertain' ? (
                <button
                  type="button"
                  className="commercial-intake-secondary-action"
                  onClick={abandonUncertain}
                >
                  {stageCopy('cancelSalesStage')}
                </button>
              ) : null}
            </div>
          </form>
        )
      ) : list.kind === 'ready' && !canConfigure ? (
        <p>{stageCopy('salesStageReadOnly')}</p>
      ) : null}
    </section>
  );
}
