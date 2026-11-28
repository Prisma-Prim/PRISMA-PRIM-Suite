import { Info, Plus, RefreshCw } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import {
  FeedbackMessage as RuleFeedback,
  Instant,
  usePricingRules,
  type PricingWorkspaceProps,
  type RuleVersion,
} from '../../pricing-configuration/PricingConfigurationWorkspace';
import {
  currencies,
  FeedbackMessage as TariffFeedback,
  readCurrency,
  useTariffVersions,
  type TariffVersion,
} from '../../pricing-configuration/TariffVersionPanel';
import { usePricingConfigurationCopy } from '../../pricing-configuration/pricing-configuration.copy';
import { useTariffVersionCopy } from '../../pricing-configuration/tariff-version.copy';
import { Select } from '../../presentation/Select';
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

type VersionState = RuleVersion['state'];

const stateTones = {
  CURRENT: 'success',
  SCHEDULED: 'info',
  SUPERSEDED: 'neutral',
} as const satisfies Record<VersionState, ClarteTone>;

/** The publication form a definite answer closes; a refusal keeps it open. */
function useClosingForm(feedback: { kind: string } | undefined) {
  const [open, setOpen] = useState(false);
  const [seen, setSeen] = useState(feedback);
  if (feedback !== seen) {
    setSeen(feedback);
    if (feedback?.kind === 'published' || feedback?.kind === 'unchanged')
      setOpen(false);
  }
  return [open, setOpen] as const;
}

/**
 * Pricing in the Settings console (EX-073 to EX-076): the Pricing Rule
 * versions and the Tariff versions of each Offering, current, scheduled and
 * history, each published from a side panel through the existing commands.
 */
export function ClartePricing(props: PricingWorkspaceProps) {
  return (
    <div className="clarte-config">
      <ClartePricingRules {...props} />
      <ClarteTariffVersions {...props} />
    </div>
  );
}

function Validity({
  version,
  words,
}: Readonly<{
  version: Pick<RuleVersion, 'effectiveFrom' | 'effectiveTo' | 'supersession'>;
  words: {
    from: string;
    until: string;
    openEnded: string;
    takenOverFrom: string;
  };
}>) {
  return (
    <span className="clarte-settings-cell-stack">
      <span>
        {words.from} <Instant value={version.effectiveFrom} />{' '}
        {version.effectiveTo ? (
          <>
            {words.until} <Instant value={version.effectiveTo} />
          </>
        ) : (
          words.openEnded
        )}
      </span>
      {version.supersession && (
        <small>
          {words.takenOverFrom}{' '}
          <Instant value={version.supersession.supersededFrom} />
        </small>
      )}
    </span>
  );
}

function StateBadges({
  state,
  isHead,
  stateLabels,
  headMarker,
}: Readonly<{
  state: VersionState;
  isHead: boolean;
  stateLabels: Record<VersionState, string>;
  headMarker: string;
}>) {
  return (
    <span className="clarte-config-badges">
      <ClarteBadge tone={stateTones[state]}>{stateLabels[state]}</ClarteBadge>
      {isHead && <ClarteBadge tone="accent">{headMarker}</ClarteBadge>}
    </span>
  );
}

function VersionsTable({
  label,
  columns,
  rows,
}: Readonly<{
  label: string;
  columns: readonly string[];
  rows: readonly { id: string; cells: readonly ReactNode[] }[];
}>) {
  return (
    <div className="clarte-table-wrap">
      <table className="clarte-table clarte-config-table" aria-label={label}>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column} scope="col">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              {row.cells.map((cell, index) => (
                <td key={index} data-label={columns[index]}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ClartePricingRules(props: PricingWorkspaceProps) {
  const copy = usePricingConfigurationCopy();
  const config = useSettingsConfigCopy();
  const rules = usePricingRules(props);
  const { view, draft, setDraft, feedback, pending, unresolved, zone } = rules;
  const [publishing, setPublishing] = useClosingForm(feedback);
  if (rules.denied) return <ClarteErrorState title={copy.denied} />;
  const head = view.kind === 'ready' ? view.scope.headVersionNumber : null;
  const pendingRetry = pending ? undefined : unresolved;
  const columns = [
    config.columnVersion,
    config.columnLabel,
    config.columnValidity,
    config.columnState,
  ];
  const row = (version: RuleVersion) => ({
    id: version.id,
    cells: [
      <strong key="version">{copy.versionName(version.versionNumber)}</strong>,
      <span key="label" className="clarte-settings-cell-stack">
        <span>{version.label}</span>
        <small>{copy.provenanceLabels[version.provenance]}</small>
      </span>,
      <Validity key="validity" version={version} words={copy} />,
      <StateBadges
        key="state"
        state={version.state}
        isHead={version.versionNumber === head}
        stateLabels={copy.stateLabels}
        headMarker={copy.headMarker}
      />,
    ],
  });
  return (
    <>
      <ClarteCard
        title={copy.versionsList}
        actions={
          <>
            <ClarteButton
              variant="quiet"
              size="small"
              disabled={view.kind === 'loading'}
              onClick={rules.reload}
            >
              <RefreshCw aria-hidden="true" />
              {copy.reload}
            </ClarteButton>
            {rules.canPublish && (
              <ClarteButton
                variant="quiet"
                size="small"
                className="clarte-config-soft"
                disabled={view.kind !== 'ready'}
                onClick={() => setPublishing(true)}
              >
                <Plus aria-hidden="true" />
                {copy.publishTitle}
              </ClarteButton>
            )}
          </>
        }
      >
        <aside className="clarte-config-notice" aria-label={copy.noticeLabel}>
          <Info aria-hidden="true" />
          <div>
            <strong>{copy.illustrativeMarker}</strong>
            <p>{copy.illustrativeDetail}</p>
            <p>{copy.timeZone(zone)}</p>
          </div>
        </aside>
        {!publishing && feedback && <RuleFeedback feedback={feedback} />}
        {!publishing && pendingRetry && (
          <div className="clarte-settings-alert" role="alert">
            <p>{copy.uncertain}</p>
            <ClarteButton onClick={() => void rules.send(pendingRetry)}>
              {copy.retryPublication}
            </ClarteButton>
          </div>
        )}
        {view.kind === 'loading' && (
          <ClarteLoadingState label={copy.currentLoading} />
        )}
        {view.kind === 'error' && (
          <ClarteErrorState title={copy.versionsError} />
        )}
        {view.kind === 'changing' && (
          <ClarteErrorState title={copy.versionsChanging} />
        )}
        {view.kind === 'ready' && (
          <>
            <div className="clarte-config-current">
              <h3>{copy.currentTitle}</h3>
              {view.scope.current ? (
                <VersionsTable
                  label={copy.currentTitle}
                  columns={columns}
                  rows={[row(view.scope.current)]}
                />
              ) : (
                <p>{copy.noCurrent}</p>
              )}
              <p className="clarte-settings-hint">
                {head === null ? copy.noHead : copy.head(head)}
              </p>
            </div>
            <h3>{copy.scheduledTitle}</h3>
            {view.scheduled.length === 0 ? (
              <p className="clarte-settings-hint">{copy.noScheduled}</p>
            ) : (
              <VersionsTable
                label={copy.scheduledTitle}
                columns={columns}
                rows={view.scheduled.map(row)}
              />
            )}
            <h3>{copy.versionsTitle}</h3>
            {view.versions.length === 0 ? (
              <ClarteEmptyState title={copy.versionsEmpty} />
            ) : (
              <VersionsTable
                label={copy.versionsTitle}
                columns={columns}
                rows={view.versions.map(row)}
              />
            )}
            {view.olderPage === 'loading' && (
              <p className="clarte-settings-status" role="status">
                {copy.olderLoading}
              </p>
            )}
            {view.olderPage === 'error' && (
              <p className="clarte-settings-alert" role="alert">
                {copy.olderError}
              </p>
            )}
            {view.nextCursor && (
              <div className="clarte-settings-actions">
                <ClarteButton
                  size="small"
                  disabled={view.olderPage === 'loading'}
                  onClick={() =>
                    view.nextCursor && void rules.loadOlder(view.nextCursor)
                  }
                >
                  {copy.showOlder}
                </ClarteButton>
              </div>
            )}
          </>
        )}
      </ClarteCard>
      {publishing && (
        <ClarteSidePanel
          title={copy.publishTitle}
          description={
            head === null ? copy.publishFirst : copy.publishAfterHead(head)
          }
          dismissible={!pending && !unresolved}
          onClose={() => setPublishing(false)}
        >
          <form
            className="clarte-settings-form"
            noValidate
            onSubmit={(event) => void rules.submit(event)}
          >
            <p className="clarte-settings-hint">{copy.fixedRule}</p>
            {feedback && <RuleFeedback feedback={feedback} />}
            {pendingRetry && (
              <div className="clarte-settings-alert" role="alert">
                <p>{copy.uncertain}</p>
                <ClarteButton onClick={() => void rules.send(pendingRetry)}>
                  {copy.retryPublication}
                </ClarteButton>
              </div>
            )}
            <ClarteField label={copy.label} hint={copy.labelHelp}>
              {(control) => (
                <input
                  {...control}
                  className="clarte-input"
                  value={draft.label}
                  required
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      label: event.target.value,
                    }))
                  }
                />
              )}
            </ClarteField>
            <ClarteField label={copy.effectiveFrom(zone)}>
              {(control) => (
                <input
                  {...control}
                  className="clarte-input"
                  type="datetime-local"
                  step={1}
                  value={draft.effectiveFrom}
                  required
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      effectiveFrom: event.target.value,
                    }))
                  }
                />
              )}
            </ClarteField>
            <ClarteField label={copy.effectiveTo(zone)}>
              {(control) => (
                <input
                  {...control}
                  className="clarte-input"
                  type="datetime-local"
                  step={1}
                  value={draft.effectiveTo}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      effectiveTo: event.target.value,
                    }))
                  }
                />
              )}
            </ClarteField>
            <div className="clarte-settings-actions">
              <ClarteButton
                type="submit"
                variant="primary"
                disabled={
                  pending || unresolved !== undefined || view.kind !== 'ready'
                }
              >
                {copy.publish}
              </ClarteButton>
            </div>
          </form>
        </ClarteSidePanel>
      )}
    </>
  );
}

function ClarteTariffVersions(props: PricingWorkspaceProps) {
  const copy = useTariffVersionCopy();
  const config = useSettingsConfigCopy();
  const tariffs = useTariffVersions(props);
  const {
    offerings,
    offeringId,
    view,
    draft,
    setDraft,
    feedback,
    pending,
    unresolved,
    companyId,
    zone,
  } = tariffs;
  const [publishing, setPublishing] = useClosingForm(feedback);
  if (tariffs.denied) return <ClarteErrorState title={copy.denied} />;
  const selected =
    offerings.kind === 'ready'
      ? offerings.items.find((item) => item.id === offeringId)
      : undefined;
  const head = view.kind === 'ready' ? view.scope.headVersionNumber : null;
  const pendingRetry = pending ? undefined : unresolved;
  const columns = [
    config.columnVersion,
    config.columnAmount,
    config.columnTax,
    config.columnValidity,
    config.columnState,
  ];
  const row = (version: TariffVersion) => ({
    id: version.id,
    cells: [
      <strong key="version">{copy.versionName(version.versionNumber)}</strong>,
      <span key="amount" className="clarte-settings-cell-stack">
        <strong>
          {copy.amount({
            unitAmount: version.unitAmount,
            currency: version.currency,
            unit: version.unit,
          })}
        </strong>
        <small>
          {copy.provenanceLabels[version.provenance]} · {copy.provisionalMarker}
        </small>
      </span>,
      <span key="tax" className="clarte-settings-cell-stack">
        <span>
          {copy.taxRate({
            taxRatePercent: version.taxRatePercent,
            taxLabel: version.taxLabel,
          })}
        </span>
        <small>{copy.noFiscalValidity}</small>
      </span>,
      <Validity key="validity" version={version} words={copy} />,
      <StateBadges
        key="state"
        state={version.state}
        isHead={version.versionNumber === head}
        stateLabels={copy.stateLabels}
        headMarker={copy.headMarker}
      />,
    ],
  });
  const text = (
    field: 'unit' | 'unitAmount' | 'taxRatePercent' | 'taxLabel',
    label: string,
    hint: string,
    decimal = false,
  ) => (
    <ClarteField label={label} hint={hint}>
      {(control) => (
        // A decimal is entered as text, never type=number, so the exact
        // string the owner typed is what the grammar checks and sends.
        <input
          {...control}
          className="clarte-input"
          type="text"
          inputMode={decimal ? 'decimal' : undefined}
          autoComplete="off"
          spellCheck={decimal ? false : undefined}
          value={draft[field]}
          required
          onChange={(event) => {
            const value = event.target.value;
            setDraft((current) => ({ ...current, [field]: value }));
          }}
        />
      )}
    </ClarteField>
  );
  return (
    <>
      <ClarteCard
        title={copy.title}
        actions={
          selected && (
            <>
              <ClarteButton
                variant="quiet"
                size="small"
                disabled={view.kind === 'loading'}
                onClick={tariffs.reload}
              >
                <RefreshCw aria-hidden="true" />
                {copy.reload}
              </ClarteButton>
              {tariffs.canPublish && (
                <ClarteButton
                  variant="quiet"
                  size="small"
                  className="clarte-config-soft"
                  disabled={view.kind !== 'ready'}
                  onClick={() => setPublishing(true)}
                >
                  <Plus aria-hidden="true" />
                  {copy.publishTitle}
                </ClarteButton>
              )}
            </>
          )
        }
      >
        <aside className="clarte-config-notice" aria-label={copy.noticeLabel}>
          <Info aria-hidden="true" />
          <div>
            <strong>{copy.illustrativeMarker}</strong>
            <p>{copy.illustrativeDetail}</p>
            <p>{copy.timeZone(zone)}</p>
          </div>
        </aside>
        {offerings.kind === 'loading' && (
          <ClarteLoadingState label={copy.offeringsLoading} />
        )}
        {offerings.kind === 'error' && (
          <ClarteErrorState
            title={copy.offeringsError}
            action={
              <ClarteButton
                onClick={() =>
                  companyId && void tariffs.loadOfferings(companyId)
                }
              >
                {copy.reloadOfferings}
              </ClarteButton>
            }
          />
        )}
        {offerings.kind === 'ready' && offerings.items.length === 0 && (
          <ClarteEmptyState title={copy.offeringsEmpty} />
        )}
        {offerings.kind === 'ready' && offerings.items.length > 0 && (
          <div className="clarte-config-offering">
            <ClarteField label={copy.offering}>
              {(control) => (
                <Select
                  id={control.id}
                  describedBy={control['aria-describedby']}
                  value={offeringId ?? ''}
                  placeholder={copy.chooseOffering}
                  options={offerings.items.map((item) => ({
                    value: item.id,
                    label: copy.offeringOption({
                      name: item.serviceDefinition.name,
                      code: item.serviceDefinition.code,
                      commercialLabel: item.commercialLabel,
                    }),
                  }))}
                  onValueChange={tariffs.chooseOffering}
                />
              )}
            </ClarteField>
            {offerings.nextCursor && (
              <ClarteButton
                size="small"
                disabled={offerings.morePage === 'loading'}
                onClick={() =>
                  companyId &&
                  offerings.nextCursor &&
                  void tariffs.loadOfferings(companyId, offerings.nextCursor)
                }
              >
                {copy.showMoreOfferings}
              </ClarteButton>
            )}
          </div>
        )}
        {offerings.kind === 'ready' && offerings.morePage === 'loading' && (
          <p className="clarte-settings-status" role="status">
            {copy.moreOfferingsLoading}
          </p>
        )}
        {offerings.kind === 'ready' && offerings.morePage === 'error' && (
          <p className="clarte-settings-alert" role="alert">
            {copy.moreOfferingsError}
          </p>
        )}
        {offerings.kind === 'ready' &&
          offerings.items.length > 0 &&
          !selected && (
            <p className="clarte-settings-hint">{copy.chooseOfferingPrompt}</p>
          )}
        {selected && (
          <>
            {!publishing && feedback && <TariffFeedback feedback={feedback} />}
            {!publishing && pendingRetry && (
              <div className="clarte-settings-alert" role="alert">
                <p>{copy.uncertain}</p>
                <ClarteButton onClick={() => void tariffs.send(pendingRetry)}>
                  {copy.retryPublication}
                </ClarteButton>
              </div>
            )}
            {view.kind === 'loading' && (
              <ClarteLoadingState label={copy.currentLoading} />
            )}
            {view.kind === 'error' && (
              <ClarteErrorState title={copy.versionsError} />
            )}
            {view.kind === 'changing' && (
              <ClarteErrorState title={copy.versionsChanging} />
            )}
            {view.kind === 'ready' && (
              <>
                <div className="clarte-config-current">
                  <h3>{copy.currentTitle}</h3>
                  {view.scope.current ? (
                    <VersionsTable
                      label={copy.currentTitle}
                      columns={columns}
                      rows={[row(view.scope.current)]}
                    />
                  ) : (
                    <p>{copy.noCurrent}</p>
                  )}
                  <p className="clarte-settings-hint">
                    {head === null ? copy.noHead : copy.head(head)}
                  </p>
                </div>
                <h3>{copy.scheduledTitle}</h3>
                {view.scheduled.length === 0 ? (
                  <p className="clarte-settings-hint">{copy.noScheduled}</p>
                ) : (
                  <VersionsTable
                    label={copy.scheduledTitle}
                    columns={columns}
                    rows={view.scheduled.map(row)}
                  />
                )}
                <h3>{copy.versionsTitle}</h3>
                {view.versions.length === 0 ? (
                  <ClarteEmptyState title={copy.versionsEmpty} />
                ) : (
                  <VersionsTable
                    label={copy.versionsTitle}
                    columns={columns}
                    rows={view.versions.map(row)}
                  />
                )}
                {view.olderPage === 'loading' && (
                  <p className="clarte-settings-status" role="status">
                    {copy.olderLoading}
                  </p>
                )}
                {view.olderPage === 'error' && (
                  <p className="clarte-settings-alert" role="alert">
                    {copy.olderError}
                  </p>
                )}
                {view.nextCursor && (
                  <div className="clarte-settings-actions">
                    <ClarteButton
                      size="small"
                      disabled={view.olderPage === 'loading'}
                      onClick={() =>
                        view.nextCursor &&
                        void tariffs.loadOlder(view.nextCursor)
                      }
                    >
                      {copy.showOlder}
                    </ClarteButton>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </ClarteCard>
      {publishing && selected && (
        <ClarteSidePanel
          title={copy.publishTitle}
          description={
            head === null ? copy.publishFirst : copy.publishAfterHead(head)
          }
          dismissible={!pending && !unresolved}
          onClose={() => setPublishing(false)}
        >
          <form
            className="clarte-settings-form"
            noValidate
            onSubmit={(event) => void tariffs.submit(event)}
          >
            {feedback && <TariffFeedback feedback={feedback} />}
            {pendingRetry && (
              <div className="clarte-settings-alert" role="alert">
                <p>{copy.uncertain}</p>
                <ClarteButton onClick={() => void tariffs.send(pendingRetry)}>
                  {copy.retryPublication}
                </ClarteButton>
              </div>
            )}
            {text('unit', copy.unit, copy.unitHelp)}
            {text('unitAmount', copy.unitAmount, copy.unitAmountHelp, true)}
            <ClarteField label={copy.currency}>
              {(control) => (
                <Select
                  id={control.id}
                  describedBy={control['aria-describedby']}
                  value={draft.currency}
                  placeholder={copy.chooseCurrency}
                  options={currencies.map((currency) => ({
                    value: currency,
                    label: currency,
                  }))}
                  onValueChange={(value) => {
                    const currency = readCurrency(value);
                    setDraft((current) => ({ ...current, currency }));
                  }}
                  required
                />
              )}
            </ClarteField>
            {text(
              'taxRatePercent',
              copy.taxRatePercent,
              copy.taxRatePercentHelp,
              true,
            )}
            {text('taxLabel', copy.taxLabel, copy.taxLabelHelp)}
            <ClarteField label={copy.effectiveFrom(zone)}>
              {(control) => (
                <input
                  {...control}
                  className="clarte-input"
                  type="datetime-local"
                  step={1}
                  value={draft.effectiveFrom}
                  required
                  onChange={(event) => {
                    const effectiveFrom = event.target.value;
                    setDraft((current) => ({ ...current, effectiveFrom }));
                  }}
                />
              )}
            </ClarteField>
            <ClarteField label={copy.effectiveTo(zone)}>
              {(control) => (
                <input
                  {...control}
                  className="clarte-input"
                  type="datetime-local"
                  step={1}
                  value={draft.effectiveTo}
                  onChange={(event) => {
                    const effectiveTo = event.target.value;
                    setDraft((current) => ({ ...current, effectiveTo }));
                  }}
                />
              )}
            </ClarteField>
            <div className="clarte-settings-actions">
              <ClarteButton
                type="submit"
                variant="primary"
                disabled={
                  pending || unresolved !== undefined || view.kind !== 'ready'
                }
              >
                {copy.publish}
              </ClarteButton>
            </div>
          </form>
        </ClarteSidePanel>
      )}
    </>
  );
}
