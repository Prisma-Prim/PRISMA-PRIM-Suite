import { grantOf } from '../../access/company-grants';
import { useInterfaceLocale } from '../../localization/interface-locale';
import { formatMessage } from '../../localization/messages';
import { PricingSnapshotPanel } from '../../pricing-configuration/PricingSnapshotPanel';
import { ProfitabilityEstimatePanel } from '../../profitability-estimate/ProfitabilityEstimatePanel';
import { ClarteBadge } from '../components/ClarteBadge';
import { ClarteCard } from '../components/ClarteCard';
import { estimateLabel, estimateTone } from './deal-labels';
import type { DealStageView } from './deal-response';
import { useDealCopy } from './deals.copy';
import { useCommercialStageCopy } from './commercial-stages.copy';
import type { DealStagePanelProps } from './stage-panels';
import './commercial-stages.css';

type CostingView = Extract<
  DealStageView,
  { stage: 'costing'; pricingSnapshot: unknown }
>;

/**
 * The Costing stage (EX-078 to EX-082): the stage's facts at a glance, then
 * the existing Profitability Estimate and pricing snapshot owners with
 * their own drafts, retries, receipts and permission states. The Director
 * decides an estimate version beside its exact figures.
 */
export function CostingStagePanel({
  deal,
  view,
  context,
}: DealStagePanelProps) {
  if (view.stage !== 'costing' || view.marker === 'not_available') return null;
  const { actor } = context;
  return (
    <div className="clarte-commercial-stage clarte-costing-stage">
      <CostingFacts view={view} />
      <div className="clarte-commercial-owner">
        <ProfitabilityEstimatePanel
          actor={actor}
          identity={context.identity}
          opportunityId={deal.opportunityId}
          besideVersion
          onChanged={context.onDealChanged}
          onCompanyContextRejected={context.onCompanyContextRejected}
          onActorRevalidated={context.onActorRevalidated}
          onWorkspaceAccessRejected={context.onWorkspaceAccessRejected}
        />
      </div>
      <div className="clarte-commercial-owner">
        <PricingSnapshotPanel
          key={`${deal.opportunityId}:${JSON.stringify([
            grantOf(actor.activeCompany, 'company_pricing_user') ?? null,
            grantOf(actor.activeCompany, 'company_pricing_adjustment') ?? null,
          ])}`}
          actor={actor}
          identity={context.identity}
          opportunityId={deal.opportunityId}
          onChanged={context.onDealChanged}
          onCompanyContextRejected={context.onCompanyContextRejected}
          onActorRevalidated={context.onActorRevalidated}
          onWorkspaceAccessRejected={context.onWorkspaceAccessRejected}
        />
      </div>
    </div>
  );
}

/** The latest recorded snapshot and estimate the deal read shows. */
function CostingFacts({ view }: Readonly<{ view: CostingView }>) {
  const copy = useDealCopy();
  const stageCopy = useCommercialStageCopy();
  const { formatDateTime } = useInterfaceLocale();
  const snapshot = view.pricingSnapshot;
  const estimate = view.profitabilityEstimate;
  return (
    <ClarteCard title={stageCopy('costingSummary')}>
      <dl className="clarte-stage-facts clarte-costing-facts">
        <div>
          <dt>{copy('pricingTitle')}</dt>
          <dd>
            {!snapshot.readable ? (
              <span className="clarte-muted">{copy('notAvailable')}</span>
            ) : snapshot.value ? (
              <>
                <span className="clarte-fact-figure">
                  {formatMessage(copy('pricingValue'), {
                    total: snapshot.value.total,
                    currency: snapshot.value.currency,
                  })}
                </span>
                <span className="clarte-muted">
                  {formatMessage(copy('pricingCalculated'), {
                    date: formatDateTime(snapshot.value.calculatedAt),
                  })}
                </span>
              </>
            ) : (
              <span className="clarte-muted">{copy('pricingNone')}</span>
            )}
          </dd>
        </div>
        <div>
          <dt>{copy('estimateTitle')}</dt>
          <dd>
            {!estimate.readable ? (
              <span className="clarte-muted">{copy('notAvailable')}</span>
            ) : estimate.value ? (
              <span className="clarte-fact-line">
                <span>
                  {formatMessage(copy('estimateVersion'), {
                    version: estimate.value.versionNumber,
                  })}
                </span>
                <ClarteBadge tone={estimateTone(estimate.value.decision)}>
                  {copy(estimateLabel(estimate.value.decision))}
                </ClarteBadge>
              </span>
            ) : (
              <span className="clarte-muted">{copy('estimateNone')}</span>
            )}
          </dd>
        </div>
      </dl>
    </ClarteCard>
  );
}
