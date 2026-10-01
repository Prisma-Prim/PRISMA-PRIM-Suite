import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { BrowserIdentity } from '../access-composition';
import type { ActorContext } from '../access-types';
import { createAuthenticatedApiClient } from '../api/authenticated-api-client';
import { Select } from '../presentation/Select';
import './profitability.css';

type DecisionCode = 'APPROVE' | 'MODIFY' | 'REJECT';
type Version = {
  estimateId: string;
  versionId: string;
  versionNumber: number;
  currency: string;
  executorType: string;
  executorCost: string;
  fiscalCost: string;
  allocatedOverhead: string;
  directCosts: Array<{
    key: string;
    category: string;
    label: string;
    currency: string;
    amount: string;
  }>;
  targetProfitability: string;
  proposedPrice: string;
  pricingIntent: string;
  strategicReason: string | null;
  totalCost: string;
  profit: string;
  estimatedProfitability: string;
  targetDifference: string;
  createdBy: { displayName: string };
  createdAt: string;
  decision: null | {
    code: DecisionCode;
    decidedBy: { displayName: string };
    decidedAt: string;
  };
};
type State =
  | { kind: 'loading' }
  | { kind: 'ready'; versions: Version[] }
  | { kind: 'denied' | 'error' };
type Feedback =
  'idle' | 'saving' | 'success' | 'validation' | 'stale' | 'uncertain';
const words = {
  en: {
    title: 'Confirmed-cost profitability',
    empty: 'No estimate has been submitted.',
    submit: 'Confirm and submit version',
    retry: 'Retry unchanged command',
    approve: 'Approve',
    modify: 'Return for modification',
    reject: 'Reject',
    total: 'Total cost',
    profit: 'Profit',
    estimated: 'Estimated profitability',
    difference: 'Difference from target',
    denied: 'Profitability history is unavailable.',
    error: 'Profitability history could not be loaded.',
    confirmed: 'The immutable version was recorded.',
    uncertain: 'The result is uncertain. Retry the unchanged command.',
    stale: 'The estimate changed. Reload before submitting again.',
  },
  ro: {
    title: 'Rentabilitate pe costuri confirmate',
    empty: 'Nu a fost transmisă nicio estimare.',
    submit: 'Confirmă și transmite versiunea',
    retry: 'Reîncearcă aceeași comandă',
    approve: 'Aprobă',
    modify: 'Întoarce pentru modificare',
    reject: 'Respinge',
    total: 'Cost total',
    profit: 'Profit',
    estimated: 'Rentabilitate estimată',
    difference: 'Diferență față de țintă',
    denied: 'Istoricul rentabilității nu este disponibil.',
    error: 'Istoricul rentabilității nu a putut fi încărcat.',
    confirmed: 'Versiunea imuabilă a fost înregistrată.',
    uncertain: 'Rezultatul este incert. Reîncercați comanda neschimbată.',
    stale: 'Estimarea s-a schimbat. Reîncărcați înainte de retrimitere.',
  },
  ru: {
    title: 'Рентабельность по подтверждённым затратам',
    empty: 'Оценка ещё не отправлена.',
    submit: 'Подтвердить и отправить версию',
    retry: 'Повторить неизменённую команду',
    approve: 'Утвердить',
    modify: 'Вернуть на доработку',
    reject: 'Отклонить',
    total: 'Общие затраты',
    profit: 'Прибыль',
    estimated: 'Расчётная рентабельность',
    difference: 'Отклонение от цели',
    denied: 'История рентабельности недоступна.',
    error: 'Не удалось загрузить историю рентабельности.',
    confirmed: 'Неизменяемая версия записана.',
    uncertain: 'Результат неизвестен. Повторите команду без изменений.',
    stale: 'Оценка изменилась. Обновите данные перед повторной отправкой.',
  },
  fr: {
    title: 'Rentabilité sur coûts confirmés',
    empty: 'Aucune estimation n’a été soumise.',
    submit: 'Confirmer et soumettre la version',
    retry: 'Réessayer la commande inchangée',
    approve: 'Approuver',
    modify: 'Renvoyer pour modification',
    reject: 'Rejeter',
    total: 'Coût total',
    profit: 'Bénéfice',
    estimated: 'Rentabilité estimée',
    difference: 'Écart par rapport à la cible',
    denied: 'L’historique de rentabilité est indisponible.',
    error: 'L’historique de rentabilité n’a pas pu être chargé.',
    confirmed: 'La version immuable a été enregistrée.',
    uncertain: 'Le résultat est incertain. Réessayez la commande inchangée.',
    stale: 'L’estimation a changé. Rechargez avant de soumettre à nouveau.',
  },
} as const;

export function ProfitabilityPanel({
  actor,
  identity,
  opportunityId,
}: {
  actor: ActorContext;
  identity: BrowserIdentity;
  opportunityId: string;
}) {
  const locale = document.documentElement.lang.split('-')[0];
  const copy =
    locale === 'ro' || locale === 'ru' || locale === 'fr'
      ? words[locale]
      : words.en;
  const contributor =
    actor.activeCompany?.profitabilityContributorPermissions?.includes(
      'commercial.profitability_estimate.create',
    ) === true;
  const director =
    actor.activeCompany?.profitabilityDirectorPermissions?.includes(
      'commercial.profitability_estimate.decide',
    ) === true;
  const canRead =
    actor.activeCompany?.profitabilityContributorPermissions?.includes(
      'commercial.profitability_estimate.read',
    ) === true ||
    actor.activeCompany?.profitabilityDirectorPermissions?.includes(
      'commercial.profitability_estimate.read',
    ) === true;
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [feedback, setFeedback] = useState<Feedback>('idle');
  const retry = useRef<{ path: string; body: string; key: string } | undefined>(
    undefined,
  );
  const [form, setForm] = useState({
    currency: 'EUR',
    executorType: 'DIRECTOR_OR_EMPLOYEE',
    executorCost: '0.00',
    fiscalCost: '0.00',
    overhead: '0.00',
    directKey: '',
    directCategory: 'OTHER_PROJECT_DIRECT',
    directLabel: '',
    directAmount: '',
    target: '',
    price: '',
    intent: 'ORDINARY',
    reason: '',
    complete: false,
    duplicate: false,
  });
  async function load() {
    setState({ kind: 'loading' });
    const api = await createAuthenticatedApiClient(identity);
    const result = await api.request<unknown>(
      `/commercial/opportunities/${encodeURIComponent(opportunityId)}/profitability-estimate/versions`,
    );
    if (result.status === 'ok') {
      const versions = readPage(result.value);
      setState({ kind: 'ready', versions });
      setFeedback('idle');
    } else if (result.status === 'unauthorized') {
      await identity.rejectSession();
    } else
      setState({
        kind:
          result.status === 'forbidden' || result.status === 'notFound'
            ? 'denied'
            : 'error',
      });
  }
  useEffect(() => {
    if (canRead) void load();
    return () => {
      retry.current = undefined;
    };
  }, [canRead, opportunityId, actor.workspaceMembershipId]);
  if (!canRead) return null;
  if (state.kind === 'loading')
    return (
      <section className="profitability-panel">
        <h3>{copy.title}</h3>
        <p role="status">Loading…</p>
      </section>
    );
  if (state.kind !== 'ready')
    return (
      <section className="profitability-panel">
        <h3>{copy.title}</h3>
        <p role="alert">{state.kind === 'denied' ? copy.denied : copy.error}</p>
        <button type="button" onClick={() => void load()}>
          Retry
        </button>
      </section>
    );
  const head = state.versions[0];
  async function command(path: string, body: string, key: string) {
    setFeedback('saving');
    retry.current = { path, body, key };
    try {
      const api = await createAuthenticatedApiClient(identity);
      const result = await api.request<unknown>(path, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'idempotency-key': key },
        body,
      });
      if (result.status === 'ok') {
        retry.current = undefined;
        setFeedback('success');
        await load();
      } else if (result.status === 'conflict') setFeedback('stale');
      else if (result.status === 'validation') setFeedback('validation');
      else if (result.status === 'unauthorized') await identity.rejectSession();
      else if (result.status === 'forbidden' || result.status === 'notFound') {
        retry.current = undefined;
        setState({ kind: 'denied' });
      } else setFeedback('uncertain');
    } catch {
      setFeedback('uncertain');
    }
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    const directCosts =
      form.directKey || form.directLabel || form.directAmount
        ? [
            {
              key: form.directKey,
              category: form.directCategory,
              label: form.directLabel,
              currency: form.currency,
              amount: form.directAmount,
            },
          ]
        : [];
    const body = JSON.stringify({
      expectedLatestVersion: head?.versionNumber ?? null,
      currency: form.currency,
      executorType: form.executorType,
      executorCost: form.executorCost,
      fiscalCost: form.fiscalCost,
      allocatedOverhead: form.overhead,
      directCosts,
      targetProfitability: form.target,
      proposedPrice: form.price,
      pricingIntent: form.intent,
      strategicReason: form.intent === 'STRATEGIC' ? form.reason : null,
      costComplete: form.complete,
      noKnownDuplicate: form.duplicate,
    });
    void command(
      `/commercial/opportunities/${encodeURIComponent(opportunityId)}/profitability-estimate/versions`,
      body,
      crypto.randomUUID(),
    );
  }
  function decide(version: Version, code: DecisionCode) {
    void command(
      `/commercial/opportunities/${encodeURIComponent(opportunityId)}/profitability-estimate/versions/${encodeURIComponent(version.versionId)}/decision`,
      JSON.stringify({
        versionNumber: version.versionNumber,
        expectedDecision: null,
        code,
      }),
      crypto.randomUUID(),
    );
  }
  return (
    <section
      className="profitability-panel"
      aria-labelledby="profitability-title"
    >
      <h3 id="profitability-title">{copy.title}</h3>
      {state.versions.length === 0 && <p>{copy.empty}</p>}
      {contributor && (
        <form onSubmit={submit} className="profitability-form">
          <label>
            Currency
            <input
              value={form.currency}
              onChange={(e) =>
                setForm({ ...form, currency: e.target.value.toUpperCase() })
              }
            />
          </label>
          <label>
            Executor type
            <Select
              id="profitability-executor-type"
              value={form.executorType}
              options={[
                { value: 'PATENT_CONSULTANT', label: 'Patent consultant' },
                { value: 'CIVIL_CONTRACT', label: 'Civil-contract freelancer' },
                {
                  value: 'DIRECTOR_OR_EMPLOYEE',
                  label: 'Director or employee',
                },
                {
                  value: 'EXTERNAL_SUBCONTRACTOR',
                  label: 'External subcontractor',
                },
              ]}
              onValueChange={(value) =>
                setForm({ ...form, executorType: value })
              }
            />
          </label>
          <label>
            Executor cost
            <input
              inputMode="decimal"
              value={form.executorCost}
              onChange={(event) =>
                setForm({ ...form, executorCost: event.target.value })
              }
            />
          </label>
          <label>
            Fiscal cost
            <input
              inputMode="decimal"
              value={form.fiscalCost}
              onChange={(event) =>
                setForm({ ...form, fiscalCost: event.target.value })
              }
            />
          </label>
          <label>
            Allocated overhead
            <input
              inputMode="decimal"
              value={form.overhead}
              onChange={(event) =>
                setForm({ ...form, overhead: event.target.value })
              }
            />
          </label>
          <label>
            Target profitability (%)
            <input
              inputMode="decimal"
              value={form.target}
              onChange={(event) =>
                setForm({ ...form, target: event.target.value })
              }
            />
          </label>
          <label>
            Proposed commercial price
            <input
              inputMode="decimal"
              value={form.price}
              onChange={(event) =>
                setForm({ ...form, price: event.target.value })
              }
            />
          </label>
          <fieldset>
            <legend>Optional direct cost</legend>
            <Select
              id="profitability-direct-category"
              value={form.directCategory}
              options={[
                { value: 'PATENT_COST', label: 'Patent cost' },
                { value: 'TRAVEL', label: 'Travel' },
                { value: 'SUBCONTRACTOR', label: 'Subcontractor' },
                {
                  value: 'TRANSLATION_MATERIAL_CONSUMABLE',
                  label: 'Translation, material or consumable',
                },
                {
                  value: 'OTHER_PROJECT_DIRECT',
                  label: 'Other project-specific direct cost',
                },
              ]}
              onValueChange={(value) =>
                setForm({ ...form, directCategory: value })
              }
            />
            <input
              aria-label="Line key"
              placeholder="Line key"
              value={form.directKey}
              onChange={(e) => setForm({ ...form, directKey: e.target.value })}
            />
            <input
              aria-label="Line label"
              placeholder="Label"
              value={form.directLabel}
              onChange={(e) =>
                setForm({ ...form, directLabel: e.target.value })
              }
            />
            <input
              aria-label="Line amount"
              placeholder="0.00"
              value={form.directAmount}
              onChange={(e) =>
                setForm({ ...form, directAmount: e.target.value })
              }
            />
          </fieldset>
          <label>
            Pricing intent
            <Select
              id="profitability-pricing-intent"
              value={form.intent}
              options={[
                { value: 'ORDINARY', label: 'Ordinary' },
                { value: 'STRATEGIC', label: 'Strategic' },
              ]}
              onValueChange={(value) => setForm({ ...form, intent: value })}
            />
          </label>
          {form.intent === 'STRATEGIC' && (
            <label>
              Strategic reason
              <textarea
                value={form.reason}
                onChange={(e) => setForm({ ...form, reason: e.target.value })}
              />
            </label>
          )}
          <label>
            <input
              type="checkbox"
              checked={form.complete}
              onChange={(e) => setForm({ ...form, complete: e.target.checked })}
            />
            Costs are complete
          </label>
          <label>
            <input
              type="checkbox"
              checked={form.duplicate}
              onChange={(e) =>
                setForm({ ...form, duplicate: e.target.checked })
              }
            />
            No cost is knowingly duplicated
          </label>
          <button disabled={feedback === 'saving'}>{copy.submit}</button>
        </form>
      )}
      {feedback !== 'idle' && (
        <p
          role={
            feedback === 'validation' || feedback === 'stale'
              ? 'alert'
              : 'status'
          }
        >
          {feedback === 'success'
            ? copy.confirmed
            : feedback === 'stale'
              ? copy.stale
              : feedback === 'uncertain'
                ? copy.uncertain
                : feedback === 'validation'
                  ? 'Check every required value.'
                  : 'Saving…'}
        </p>
      )}
      {feedback === 'uncertain' && retry.current && (
        <button
          type="button"
          onClick={() => {
            const commandValue = retry.current;
            if (commandValue)
              void command(
                commandValue.path,
                commandValue.body,
                commandValue.key,
              );
          }}
        >
          {copy.retry}
        </button>
      )}
      <div className="profitability-history">
        {state.versions.map((version) => (
          <article key={version.versionId}>
            <h4>
              Version {version.versionNumber} ·{' '}
              {version.decision?.code ?? 'AWAITING'}
            </h4>
            <dl>
              <dt>{copy.total}</dt>
              <dd>
                {version.currency} {version.totalCost}
              </dd>
              <dt>{copy.profit}</dt>
              <dd>
                {version.currency} {version.profit}
              </dd>
              <dt>{copy.estimated}</dt>
              <dd>{version.estimatedProfitability}%</dd>
              <dt>{copy.difference}</dt>
              <dd>{version.targetDifference} pp</dd>
            </dl>
            <details>
              <summary>Frozen inputs</summary>
              <p>
                {version.executorType}: {version.currency}{' '}
                {version.executorCost}; fiscal {version.fiscalCost}; overhead{' '}
                {version.allocatedOverhead}; price {version.proposedPrice};
                target {version.targetProfitability}%.
              </p>
              {version.directCosts.map((line) => (
                <p key={line.key}>
                  {line.label}: {line.currency} {line.amount}
                </p>
              ))}
            </details>
            {director && !version.decision && (
              <div className="profitability-actions">
                <button
                  type="button"
                  onClick={() => decide(version, 'APPROVE')}
                >
                  {copy.approve}
                </button>
                <button type="button" onClick={() => decide(version, 'MODIFY')}>
                  {copy.modify}
                </button>
                <button type="button" onClick={() => decide(version, 'REJECT')}>
                  {copy.reject}
                </button>
              </div>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}

function readPage(value: unknown): Version[] {
  if (!record(value) || !Array.isArray(value.versions))
    throw new Error('Invalid profitability history.');
  return value.versions.map(readVersion);
}
function readVersion(value: unknown): Version {
  if (
    !record(value) ||
    typeof value.versionId !== 'string' ||
    typeof value.estimateId !== 'string' ||
    typeof value.versionNumber !== 'number' ||
    typeof value.currency !== 'string' ||
    typeof value.executorType !== 'string' ||
    typeof value.executorCost !== 'string' ||
    typeof value.fiscalCost !== 'string' ||
    typeof value.allocatedOverhead !== 'string' ||
    !Array.isArray(value.directCosts) ||
    typeof value.targetProfitability !== 'string' ||
    typeof value.proposedPrice !== 'string' ||
    typeof value.pricingIntent !== 'string' ||
    !(
      typeof value.strategicReason === 'string' ||
      value.strategicReason === null
    ) ||
    typeof value.totalCost !== 'string' ||
    typeof value.profit !== 'string' ||
    typeof value.estimatedProfitability !== 'string' ||
    typeof value.targetDifference !== 'string' ||
    !record(value.createdBy) ||
    typeof value.createdBy.displayName !== 'string'
  )
    throw new Error('Invalid profitability version.');
  const decision =
    value.decision === null ? null : readDecision(value.decision);
  return {
    estimateId: value.estimateId,
    versionId: value.versionId,
    versionNumber: value.versionNumber,
    currency: value.currency,
    executorType: value.executorType,
    executorCost: value.executorCost,
    fiscalCost: value.fiscalCost,
    allocatedOverhead: value.allocatedOverhead,
    directCosts: value.directCosts.map(readLine),
    targetProfitability: value.targetProfitability,
    proposedPrice: value.proposedPrice,
    pricingIntent: value.pricingIntent,
    strategicReason: value.strategicReason,
    totalCost: value.totalCost,
    profit: value.profit,
    estimatedProfitability: value.estimatedProfitability,
    targetDifference: value.targetDifference,
    createdBy: { displayName: value.createdBy.displayName },
    createdAt: typeof value.createdAt === 'string' ? value.createdAt : '',
    decision,
  };
}
function readLine(value: unknown) {
  if (
    !record(value) ||
    typeof value.key !== 'string' ||
    typeof value.category !== 'string' ||
    typeof value.label !== 'string' ||
    typeof value.currency !== 'string' ||
    typeof value.amount !== 'string'
  )
    throw new Error('Invalid direct cost.');
  return {
    key: value.key,
    category: value.category,
    label: value.label,
    currency: value.currency,
    amount: value.amount,
  };
}
function readDecision(value: unknown): NonNullable<Version['decision']> {
  if (
    !record(value) ||
    (value.code !== 'APPROVE' &&
      value.code !== 'MODIFY' &&
      value.code !== 'REJECT') ||
    !record(value.decidedBy) ||
    typeof value.decidedBy.displayName !== 'string' ||
    typeof value.decidedAt !== 'string'
  )
    throw new Error('Invalid profitability decision.');
  return {
    code: value.code,
    decidedBy: { displayName: value.decidedBy.displayName },
    decidedAt: value.decidedAt,
  };
}
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
