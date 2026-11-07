import { useInterfaceLocale } from '../localization/interface-locale';
import { formatMessage } from '../localization/messages';
import {
  useCertificationCopy,
  type CertificationMessageKey,
} from './certification.copy';
import {
  CONFIRMED_DURATION_FIELDS,
  INCREASE_FACTORS,
  REDUCTION_FACTORS,
  type DurationDetermination,
  type DurationProposal,
  type DurationRefusal,
  type DurationResult,
  type DurationWarning,
  type IncreaseFactor,
  type ReductionFactor,
} from './certification-duration';

/** Exact day amounts and percentages in the interface locale. */
export function useDurationFormat() {
  const copy = useCertificationCopy();
  const { locale } = useInterfaceLocale();
  // Amounts carry up to eight decimals; none of them is rounded for display.
  const number = new Intl.NumberFormat(locale, { maximumFractionDigits: 8 });
  return {
    days: (amount: string) => number.format(Number(amount)),
    percent: (value: number) =>
      formatMessage(copy('percentValue'), { percent: number.format(value) }),
  };
}

export function factorLabel(
  factor: IncreaseFactor | ReductionFactor,
): CertificationMessageKey {
  switch (factor) {
    case 'productTypes':
      return 'factorProductTypes';
    case 'productLines':
      return 'factorProductLines';
    case 'productDevelopment':
      return 'factorProductDevelopment';
    case 'criticalControlPoints':
      return 'factorCriticalControlPoints';
    case 'operationalPrerequisites':
      return 'factorOperationalPrerequisites';
    case 'constructionSites':
      return 'factorConstructionSites';
    case 'complexInfrastructure':
      return 'factorComplexInfrastructure';
    case 'onSiteLaboratory':
      return 'factorOnSiteLaboratory';
    case 'remoteAuditTechnology':
      return 'factorRemoteAuditTechnology';
    case 'interpreter':
      return 'factorInterpreter';
    case 'systemMaturity':
      return 'factorSystemMaturity';
    case 'priorCertification':
      return 'factorPriorCertification';
    case 'transferPreparedness':
      return 'factorTransferPreparedness';
    case 'automation':
      return 'factorAutomation';
  }
  return unexpected(factor);
}

function warningLabel(warning: DurationWarning): CertificationMessageKey {
  switch (warning) {
    case 'SURVEILLANCE_BELOW_ONE_DAY':
      return 'warningSurveillanceBelowOneDay';
    case 'RECERTIFICATION_BELOW_ONE_DAY':
      return 'warningRecertificationBelowOneDay';
    case 'STAGE2_BELOW_ONE_DAY':
      return 'warningStage2BelowOneDay';
  }
  return unexpected(warning);
}

function refusalLabel(refusal: DurationRefusal): CertificationMessageKey {
  switch (refusal) {
    case 'PRIMARY_NOT_SELECTED':
      return 'refusalPrimaryNotSelected';
    case 'PRIMARY_NOT_HIGHEST_BASIC_TIME':
      return 'refusalPrimaryNotHighestBasicTime';
    case 'HACCP_STUDIES_MISMATCH':
      return 'refusalHaccpStudiesMismatch';
    case 'REDUCTION_FACTOR_CAP':
      return 'refusalReductionFactorCap';
    case 'REDUCTION_TOTAL_CAP':
      return 'refusalReductionTotalCap';
  }
  return unexpected(refusal);
}

/** Every component of a computed proposal, exactly as the server states it. */
export function ProposalBreakdown({
  proposal,
}: {
  proposal: DurationProposal;
}) {
  const copy = useCertificationCopy();
  const format = useDurationFormat();
  const amounts = [
    'basicTime',
    'haccpTime',
    'fteTime',
    'baseDays',
    'initialOnSite',
    'initialTotal',
    'stage1OnSite',
    'stage2OnSite',
    'surveillanceOnSite',
    'surveillanceTotal',
    'recertificationOnSite',
    'recertificationTotal',
  ] as const;
  return (
    <>
      <p className="certification-attribution">
        {copy('amountsInAuditorDays')}
      </p>
      <dl className="certification-facts">
        {amounts.slice(0, 4).map((field) => (
          <div key={field}>
            <dt>{copy(field)}</dt>
            <dd>{format.days(proposal[field])}</dd>
          </div>
        ))}
        <div>
          <dt>{copy('netAdjustment')}</dt>
          <dd>{format.percent(proposal.netAdjustmentPercent)}</dd>
        </div>
        {amounts.slice(4).map((field) => (
          <div key={field}>
            <dt>{copy(field)}</dt>
            <dd>{format.days(proposal[field])}</dd>
          </div>
        ))}
        <div>
          <dt>{copy('ruleVersion')}</dt>
          <dd>{proposal.ruleVersion}</dd>
        </div>
      </dl>
      {proposal.warnings.length > 0 && (
        <div className="certification-blocked">
          <p>{copy('warningsTitle')}</p>
          <ul>
            {proposal.warnings.map((warning) => (
              <li key={warning}>{copy(warningLabel(warning))}</li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}

/** A computed proposal, the manual case, or why no proposal exists. */
export function DurationResultView({ result }: { result: DurationResult }) {
  const copy = useCertificationCopy();
  switch (result.kind) {
    case 'proposal':
      return <ProposalBreakdown proposal={result.proposal} />;
    case 'manual':
      return <p className="certification-blocked">{copy('durationManual')}</p>;
    case 'refused':
      return (
        <div className="certification-blocked">
          <p>{copy('refusalsTitle')}</p>
          <ul>
            {result.refusals.map((refusal) => (
              <li key={refusal}>{copy(refusalLabel(refusal))}</li>
            ))}
          </ul>
        </div>
      );
  }
  return unexpected(result);
}

/** A confirmed determination: values, inputs, computation and justification. */
export function DurationView({
  determination,
}: {
  determination: DurationDetermination;
}) {
  const copy = useCertificationCopy();
  const { formatNumber } = useInterfaceLocale();
  const format = useDurationFormat();
  const { inputs, computation } = determination;
  const factors = <Factor extends IncreaseFactor | ReductionFactor>(
    list: readonly Factor[],
    values: Partial<Record<Factor, number>>,
  ) => {
    const used = list.flatMap((factor) => {
      const percent = values[factor] ?? 0;
      return percent > 0
        ? [`${copy(factorLabel(factor))}: ${format.percent(percent)}`]
        : [];
    });
    return used.length ? used.join(', ') : copy('noFactor');
  };
  return (
    <>
      <p className="certification-attribution">
        {copy('amountsInAuditorDays')}
      </p>
      <dl className="certification-facts">
        {CONFIRMED_DURATION_FIELDS.map((field) => (
          <div key={field}>
            <dt>{copy(field)}</dt>
            <dd>{format.days(determination.confirmed[field])}</dd>
          </div>
        ))}
        <div>
          <dt>{copy('justification')}</dt>
          <dd>{determination.justification ?? copy('notProvided')}</dd>
        </div>
        <div>
          <dt>{copy('computation')}</dt>
          <dd>
            {copy(
              computation.kind === 'proposal'
                ? 'computationProposal'
                : 'computationManual',
            )}
          </dd>
        </div>
        <div>
          <dt>{copy('primarySubcategory')}</dt>
          <dd>{inputs.primary}</dd>
        </div>
        <div>
          <dt>{copy('foodChainSubcategories')}</dt>
          <dd>{inputs.subcategories.join(', ')}</dd>
        </div>
        <div>
          <dt>{copy('haccpStudiesPerSubcategory')}</dt>
          <dd>
            {inputs.subcategories
              .map(
                (code) =>
                  `${code}: ${formatNumber(inputs.haccpStudies[code] ?? 0)}`,
              )
              .join(', ')}
          </dd>
        </div>
        <div>
          <dt>{copy('effectiveFte')}</dt>
          <dd>{formatNumber(inputs.effectiveFte)}</dd>
        </div>
        <div>
          <dt>{copy('increaseFactors')}</dt>
          <dd>{factors(INCREASE_FACTORS, inputs.increases)}</dd>
        </div>
        <div>
          <dt>{copy('reductionFactors')}</dt>
          <dd>{factors(REDUCTION_FACTORS, inputs.reductions)}</dd>
        </div>
        <div>
          <dt>{copy('ruleVersion')}</dt>
          <dd>{determination.ruleVersion}</dd>
        </div>
      </dl>
      {computation.kind === 'proposal' && (
        <details>
          <summary>{copy('showProposal')}</summary>
          <ProposalBreakdown proposal={computation.proposal} />
        </details>
      )}
    </>
  );
}

function unexpected(value: never): never {
  throw new Error(`Unexpected Certification duration value: ${String(value)}`);
}
