import { useId } from 'react';
import { useInterfaceLocale } from '../localization/interface-locale';
import {
  displayDecimal,
  type DecisionCode,
  type EstimateVersion,
} from './profitability-contract';
import { useProfitabilityCopy } from './profitability.copy';

export function ProfitabilityVersionDetail({
  version,
  disabled,
  mayCreate,
  mayDecide,
  onDecide,
  onCorrection,
}: {
  version: EstimateVersion;
  disabled: boolean;
  mayCreate: boolean;
  mayDecide: boolean;
  onDecide: (code: DecisionCode) => void;
  onCorrection: () => void;
}) {
  const copy = useProfitabilityCopy();
  const { locale, formatDateTime } = useInterfaceLocale();
  const fieldId = useId();
  const { inputs, results } = version;
  const amount = (value: string) =>
    `${displayDecimal(value, locale)} ${inputs.currency}`;
  return (
    <article
      className="profitability-version"
      aria-labelledby={`${fieldId}-title`}
    >
      <h4 id={`${fieldId}-title`}>
        {copy('version')} {version.versionNumber}
      </h4>
      <dl className="profitability-facts">
        <dt>{copy('currency')}</dt>
        <dd>{inputs.currency}</dd>
        <dt>{copy('executorType')}</dt>
        <dd>{copy(inputs.executorType)}</dd>
        <dt>{copy('executorCost')}</dt>
        <dd>{amount(inputs.executorCost)}</dd>
        <dt>{copy('fiscalCost')}</dt>
        <dd>{amount(inputs.fiscalCost)}</dd>
        <dt>{copy('allocatedOverhead')}</dt>
        <dd>{amount(inputs.allocatedOverhead)}</dd>
        <dt>{copy('proposedPrice')}</dt>
        <dd>{amount(inputs.proposedPrice)}</dd>
        <dt>{copy('targetProfitability')}</dt>
        <dd>{displayDecimal(inputs.targetProfitability, locale)}%</dd>
        <dt>{copy('pricingIntent')}</dt>
        <dd>{copy(inputs.pricingIntent.kind)}</dd>
        {inputs.pricingIntent.kind === 'STRATEGIC' ? (
          <>
            <dt>{copy('reason')}</dt>
            <dd>{inputs.pricingIntent.reason}</dd>
          </>
        ) : null}
      </dl>
      <h5>{copy('directCosts')}</h5>
      {inputs.directCosts.length === 0 ? (
        <p>{copy('noDirect')}</p>
      ) : (
        <ul>
          {inputs.directCosts.map((line) => (
            <li key={line.key}>
              {copy(line.category)} — {line.label}: {amount(line.amount)}
            </li>
          ))}
        </ul>
      )}
      <p>{copy('costConfirmed')}</p>
      <dl className="profitability-facts profitability-results">
        <dt>{copy('totalCost')}</dt>
        <dd>{amount(results.totalCost)}</dd>
        <dt>{copy('profit')}</dt>
        <dd>{amount(results.profit)}</dd>
        <dt>{copy('profitability')}</dt>
        <dd>{displayDecimal(results.profitabilityPercent, locale)}%</dd>
        <dt>{copy('difference')}</dt>
        <dd>
          {displayDecimal(results.targetDifferencePercentagePoints, locale)}
        </dd>
        <dt>{copy('rule')}</dt>
        <dd>
          {version.calculationRule.id} · {version.calculationRule.version} ·
          HALF_UP · {version.calculationRule.monetaryScale}/
          {version.calculationRule.percentageScale}
        </dd>
        <dt>{copy('author')}</dt>
        <dd className="profitability-reference">
          {version.createdByWorkspaceMembershipId}
        </dd>
        <dt>{copy('createdAt')}</dt>
        <dd>{formatDateTime(version.createdAt)}</dd>
      </dl>
      <h5>{copy('decision')}</h5>
      <p>{copy(version.decision?.code ?? 'awaiting')}</p>
      {version.decision ? (
        <dl className="profitability-facts">
          <dt>{copy('director')}</dt>
          <dd className="profitability-reference">
            {version.decision.decidedByWorkspaceMembershipId}
          </dd>
          <dt>{copy('decidedAt')}</dt>
          <dd>{formatDateTime(version.decision.decidedAt)}</dd>
        </dl>
      ) : mayDecide ? (
        <div className="profitability-actions">
          <button
            type="button"
            disabled={disabled}
            onClick={() => onDecide('APPROVE')}
          >
            {copy('approve')}
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={() => onDecide('MODIFY')}
          >
            {copy('modify')}
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={() => onDecide('REJECT')}
          >
            {copy('reject')}
          </button>
        </div>
      ) : null}
      {mayCreate ? (
        <button type="button" disabled={disabled} onClick={onCorrection}>
          {copy('correction')}
        </button>
      ) : null}
    </article>
  );
}
