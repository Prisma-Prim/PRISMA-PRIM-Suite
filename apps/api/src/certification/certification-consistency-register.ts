import type {
  ConsistencySection,
  DiscrepancyResolution,
  DiscrepancySide,
  DiscrepancySource,
  DiscrepancySubject,
  DiscrepancyValue,
  DiscrepancyView,
} from './certification-consistency.js';
import {
  CONSISTENCY_LABELS,
  type ConsistencyLabels,
} from './certification-consistency.labels.js';
import {
  REGISTER_LABELS,
  type RegisterLabels,
  type RegisterLanguage,
} from './certification-register.labels.js';

/** A laid-out register block, as `certification-register.ts` renders it. */
export type ConsistencyRegisterBlock =
  | { kind: 'section'; text: string }
  | {
      kind: 'entry';
      title: string | null;
      fields: { label: string; value: string }[];
    }
  | { kind: 'paragraph'; text: string };

/** The open, then the resolved Discrepancies of the Case, in one language. */
export function consistencyRegisterBlocks(
  section: ConsistencySection,
  language: RegisterLanguage,
): ConsistencyRegisterBlock[] {
  const labels = CONSISTENCY_LABELS[language];
  const register = REGISTER_LABELS[language];
  const blocks: ConsistencyRegisterBlock[] = [
    { kind: 'section', text: labels.section },
    {
      kind: 'paragraph',
      text: `${labels.ruleSet}: ${section.ruleSetVersion}. ${fill(
        labels.openCounts,
        {
          critical: String(section.counts.critical),
          error: String(section.counts.error),
          toClarify: String(section.counts.toClarify),
        },
      )}`,
    },
  ];
  if (section.open.length === 0 && section.resolved.length === 0) {
    blocks.push({
      kind: 'paragraph',
      text: fill(labels.none, { version: section.ruleSetVersion }),
    });
    return blocks;
  }
  for (const view of [...section.open, ...section.resolved])
    blocks.push({
      kind: 'entry',
      title: title(view, labels),
      fields: fields(view, labels, register),
    });
  return blocks;
}

function title(view: DiscrepancyView, labels: ConsistencyLabels): string {
  const name =
    view.origin === 'rule'
      ? `${view.rule} — ${labels.rules[view.rule]}`
      : `${labels.manual} ${view.sequence} — ${view.subject.text}`;
  return `${name} — ${labels.verdicts[view.verdict]} — ${labels.status[view.status]}`;
}

function fields(
  view: DiscrepancyView,
  labels: ConsistencyLabels,
  register: RegisterLabels,
): { label: string; value: string }[] {
  const f = labels.fields;
  const rows = [
    ...(view.origin === 'rule'
      ? [{ label: f.compared, value: subject(view.subject, labels, register) }]
      : []),
    { label: f.firstValue, value: side(view.left, labels, register) },
    { label: f.secondValue, value: side(view.right, labels, register) },
    {
      label: f.opened,
      value: `${labels.units.revision} ${String(view.openedRevision)}${
        view.opened
          ? `, ${view.opened.by.displayName}, ${utc(view.opened.at)}`
          : ''
      }`,
    },
    ...(view.origin === 'manual' && view.note !== null
      ? [{ label: f.note, value: view.note }]
      : []),
  ];
  if (view.status === 'open')
    return [
      ...rows,
      {
        label: f.blocks,
        value: view.blocks ? labels.blocks[view.blocks] : labels.blocks.nothing,
      },
    ];
  return [...rows, ...resolution(view.resolution, labels, register)];
}

function resolution(
  value: DiscrepancyResolution,
  labels: ConsistencyLabels,
  register: RegisterLabels,
): { label: string; value: string }[] {
  const f = labels.fields;
  const kind = labels.resolutions[value.via];
  const origin =
    value.via !== 'acceptance' && value.source
      ? ` (${source(value.source, labels, register)})`
      : '';
  return [
    { label: f.resolution, value: `${kind}${origin}` },
    ...(value.by ? [{ label: f.resolvedBy, value: value.by.displayName }] : []),
    ...(value.at ? [{ label: f.resolvedAt, value: utc(value.at) }] : []),
    ...(value.reason ? [{ label: f.reason, value: value.reason }] : []),
  ];
}

function subject(
  value: DiscrepancySubject,
  labels: ConsistencyLabels,
  register: RegisterLabels,
): string {
  const s = labels.subjects;
  switch (value.kind) {
    case 'duration_proposal':
      return s.durationProposal;
    case 'prior_certification_reduction':
      return s.priorCertification;
    case 'stage_share':
      return `${s.stageShare} — ${register.values.stage[value.stage]}`;
    case 'stage_capacity':
      return `${s.stageCapacity} — ${register.values.stage[value.stage]}`;
    case 'date_order':
      return `${s.dateOrder}: ${labels.dates[value.earlier]} ≤ ${labels.dates[value.later]}`;
    case 'dossier_item':
      return `${s.dossierItem} — ${labels.items[value.item]}`;
    case 'certificate_number':
      return s.certificateNumber;
    case 'certificate_text':
      return `${s.certificateText} — ${value.language}, ${labels.textFields[value.field]}`;
    case 'address_numbers':
      return `${s.addressNumbers} — ${value.language}`;
    case 'document_version':
      return s.documentVersion;
    case 'plan_sending':
      return `${s.planSending} — ${register.values.stage[value.stage]}`;
    case 'exchange_reference':
      return `${s.exchangeReference} ${value.reference} — ${labels.units.exchange} ${String(value.first)}, ${String(value.second)}`;
    case 'exchange_deadline':
      return `${s.exchangeDeadline} — ${labels.units.exchange} ${String(value.sequence)}`;
  }
  return unexpected(value);
}

function side(
  value: DiscrepancySide,
  labels: ConsistencyLabels,
  register: RegisterLabels,
): string {
  const shown = valueText(value.value, labels);
  const detail = value.detail ? ` (${value.detail})` : '';
  const from = value.source
    ? ` — ${source(value.source, labels, register)}`
    : '';
  return `${shown}${detail}${from}`;
}

function valueText(value: DiscrepancyValue, labels: ConsistencyLabels): string {
  switch (value.kind) {
    case 'days':
      return `${value.days} ${labels.units.auditorDays}`;
    case 'capacity':
      return fill(labels.units.capacity, {
        calendarDays: String(value.calendarDays),
        auditors: String(value.auditors),
      });
    case 'percent':
      return `${String(value.percent)} %`;
    case 'date':
      return value.date;
    case 'text':
      return value.text;
    case 'numbers':
      return value.numbers.length ? value.numbers.join(', ') : '—';
    case 'version':
      return `${labels.units.version} ${String(value.version)}`;
    case 'state':
      return labels.states[value.state];
  }
  return unexpected(value);
}

function source(
  value: DiscrepancySource,
  labels: ConsistencyLabels,
  register: RegisterLabels,
): string {
  const reference = value.attachment;
  const attachment = reference
    ? `${reference.sourceTitle}, ${labels.units.version} ${String(reference.versionNumber)}`
    : '';
  switch (value.kind) {
    case 'step':
      return `${register.steps[value.step]}, ${labels.units.version} ${String(value.version)}${attachment ? `; ${attachment}` : ''}`;
    case 'finding':
      return `${labels.units.finding} ${String(value.sequence)}${attachment ? `; ${attachment}` : ''}`;
    case 'company_certificate_number':
    case 'certificate':
      return `${labels.units.certificate} ${value.number}${attachment ? `; ${attachment}` : ''}`;
    case 'exchange':
      return `${labels.units.exchange} ${String(value.sequence)}, ${labels.units.version} ${String(value.version)}${attachment ? `; ${attachment}` : ''}`;
    case 'attachment':
      return attachment;
  }
  return unexpected(value);
}

function fill(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/gu, (match, key: string) =>
    Object.hasOwn(values, key) ? (values[key] ?? match) : match,
  );
}

/** An ISO instant as a language-independent UTC timestamp. */
function utc(instant: string): string {
  const iso = new Date(instant).toISOString();
  return `${iso.slice(0, 10)} ${iso.slice(11, 19)} UTC`;
}

function unexpected(value: never): never {
  throw new Error(`Unexpected consistency register value ${String(value)}`);
}
