import type {
  PaymentConfirmation,
  PaymentCopy,
  PaymentFact,
  PaymentRevision,
  PaymentSelectable,
  PaymentSummary,
  PaymentValues,
} from '../payment.types';
import { paymentCopy, type PaymentLocale } from './payment-copy';
import './payment-observation.css';

function displayAmount(values: PaymentValues, locale: PaymentLocale): string {
  // A validated minor-unit string is split without numeric conversion or rounding.
  const padded = values.amountMinor.padStart(3, '0');
  const separator = locale === 'en' ? '.' : ',';
  return `${padded.slice(0, -2)}${separator}${padded.slice(-2)} ${values.currency}`;
}

function RecordedTime({
  value,
  locale,
}: {
  value: string;
  locale: PaymentLocale;
}) {
  const formatted = new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZone: 'UTC',
    timeZoneName: 'short',
  }).format(new Date(value));
  return <time dateTime={value}>{formatted}</time>;
}

export function PaymentValuesView({
  locale,
  values,
}: {
  locale: PaymentLocale;
  values: PaymentValues;
}) {
  const copy = paymentCopy[locale];
  return (
    <dl className="payment-observation-facts">
      <dt>{copy.amount}</dt>
      <dd className="payment-observation-amount">
        {displayAmount(values, locale)}
      </dd>
      <dt>{copy.effectiveOn}</dt>
      <dd>
        <time dateTime={values.effectiveOn}>{values.effectiveOn}</time>
      </dd>
      <dt>{copy.method}</dt>
      <dd>{values.method}</dd>
      <dt>{copy.externalReference}</dt>
      <dd>{values.externalReference ?? copy.notRecorded}</dd>
      <dt>{copy.observationBasis}</dt>
      <dd>{values.observationBasis}</dd>
    </dl>
  );
}

export function PaymentContextView({
  locale,
  context,
}: {
  locale: PaymentLocale;
  context: PaymentCopy;
}) {
  const copy = paymentCopy[locale];
  return (
    <dl className="payment-observation-facts">
      <dt>{copy.company}</dt>
      <dd>{context.companyLabel}</dd>
      <dt>{copy.payer}</dt>
      <dd>
        <span className="payment-observation-literal">
          {context.payer.legalName}
        </span>
        <span className="payment-observation-party-kind">
          {context.payer.kind === 'PRIMARY' ? copy.primary : copy.additional}
        </span>
      </dd>
      <dt>{copy.taxId}</dt>
      <dd>{context.payer.taxId ?? copy.notRecorded}</dd>
      <dt>{copy.legalAddress}</dt>
      <dd>{context.payer.legalAddress ?? copy.notRecorded}</dd>
    </dl>
  );
}

function Confirmation({
  locale,
  confirmation,
}: {
  locale: PaymentLocale;
  confirmation: PaymentConfirmation;
}) {
  const copy = paymentCopy[locale];
  return (
    <section
      className="payment-observation-confirmation"
      aria-label={copy.confirmation}
    >
      <h5>{copy.confirmation}</h5>
      <dl className="payment-observation-facts">
        <dt>{copy.reviewedBy}</dt>
        <dd>{confirmation.actor.displayName}</dd>
        <dt>{copy.reviewedAt}</dt>
        <dd>
          <RecordedTime locale={locale} value={confirmation.recordedAt} />
        </dd>
        <dt>{copy.confirmationNote}</dt>
        <dd>{confirmation.note}</dd>
      </dl>
    </section>
  );
}

function Fact({ locale, fact }: { locale: PaymentLocale; fact: PaymentFact }) {
  return (
    <>
      <p className="payment-observation-state">
        {paymentCopy[locale].states[fact.state]}
      </p>
      <PaymentValuesView locale={locale} values={fact.values} />
      {fact.confirmation !== null && (
        <Confirmation locale={locale} confirmation={fact.confirmation} />
      )}
    </>
  );
}

export function PaymentSummaryView({
  locale,
  payment,
}: {
  locale: PaymentLocale;
  payment: PaymentSummary;
}) {
  const copy = paymentCopy[locale];
  return (
    <section className="payment-observation-summary" aria-label={copy.values}>
      <header className="payment-observation-summary-heading">
        <h3>{copy.states[payment.state]}</h3>
        <span className="payment-observation-revision-number">
          {copy.revision} {payment.revision}
        </span>
      </header>
      <PaymentContextView locale={locale} context={payment.copiedContext} />
      <PaymentValuesView locale={locale} values={payment.values} />
      <dl className="payment-observation-facts">
        <dt>{copy.createdAt}</dt>
        <dd>
          <RecordedTime locale={locale} value={payment.createdAt} />
        </dd>
      </dl>
      {payment.confirmation !== null && (
        <Confirmation locale={locale} confirmation={payment.confirmation} />
      )}
      <section
        className="payment-observation-lineage"
        aria-label={copy.lineage}
      >
        <h4>{copy.lineage}</h4>
        <p>
          {payment.replacesClosedPaymentId === null
            ? copy.noPredecessor
            : copy.replacesClosedPayment}
        </p>
        <p>
          {payment.replacementPaymentId === null
            ? copy.noReplacement
            : copy.replacementPayment}
        </p>
      </section>
    </section>
  );
}

export function PaymentRevisionView({
  locale,
  revision,
}: {
  locale: PaymentLocale;
  revision: PaymentRevision;
}) {
  const copy = paymentCopy[locale];
  return (
    <article className="payment-observation-revision">
      <h4>
        {copy.revision} {revision.revision} · {copy.actions[revision.action]}
      </h4>
      <dl className="payment-observation-facts">
        <dt>{copy.actor}</dt>
        <dd>{revision.actor.displayName}</dd>
        <dt>{copy.recordedAt}</dt>
        <dd>
          <RecordedTime locale={locale} value={revision.recordedAt} />
        </dd>
        {revision.reason !== null && (
          <>
            <dt>{copy.reason}</dt>
            <dd>{revision.reason}</dd>
          </>
        )}
      </dl>
      <div className="payment-observation-revision-values">
        {revision.before !== null && (
          <section aria-label={copy.before}>
            <h5>{copy.before}</h5>
            <Fact locale={locale} fact={revision.before} />
          </section>
        )}
        <section aria-label={copy.after}>
          <h5>{copy.after}</h5>
          <Fact locale={locale} fact={revision.after} />
        </section>
      </div>
    </article>
  );
}

export function PaymentSourceView({
  locale,
  source,
}: {
  locale: PaymentLocale;
  source: PaymentSelectable;
}) {
  const copy = paymentCopy[locale];
  return (
    <section className="payment-observation-source" aria-label={copy.source}>
      <h4 className="payment-observation-literal">{source.documentTitle}</h4>
      <p>
        {copy.version} {source.versionNumber} ·{' '}
        {source.versionState === 'official' ? copy.official : copy.superseded}
      </p>
      <PaymentContextView locale={locale} context={source.copiedContext} />
      <dl className="payment-observation-facts">
        <dt>{copy.fileName}</dt>
        <dd>{source.fileName}</dd>
        <dt>{copy.byteLength}</dt>
        <dd>{source.byteLength.toLocaleString(locale)}</dd>
        <dt>{copy.sha256}</dt>
        <dd className="payment-observation-hash">{source.sha256}</dd>
      </dl>
    </section>
  );
}
