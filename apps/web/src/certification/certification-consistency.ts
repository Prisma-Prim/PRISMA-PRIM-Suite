import type { CertificationActorReference } from './certification-response';

/**
 * The server's Dossier Consistency Check of one Certification Case: what the
 * Case read returns and what its two commands accept. The server stays
 * authoritative; this module parses its section strictly and only mirrors
 * who may resolve which verdict to decide what to offer.
 */
export const CONSISTENCY_RULES = [
  'R01',
  'R02',
  'R03',
  'R04',
  'R05',
  'R06',
  'R07',
  'R08',
  'R09',
  'R10',
  'R11',
  'R12',
  'R14',
  'R15',
  'R16',
] as const;
export type ConsistencyRule = (typeof CONSISTENCY_RULES)[number];

export const DISCREPANCY_VERDICTS = [
  'critical',
  'error',
  'to_clarify',
] as const;
export type DiscrepancyVerdict = (typeof DISCREPANCY_VERDICTS)[number];

export const DISCREPANCY_STATES = [
  'present',
  'missing',
  'not_applicable',
  'recorded',
  'not_recorded',
  'not_declared',
  'not_computable',
] as const;
export type DiscrepancyState = (typeof DISCREPANCY_STATES)[number];

export type DiscrepancyValue =
  | { kind: 'days'; days: string }
  | { kind: 'capacity'; calendarDays: number; auditors: number }
  | { kind: 'percent'; percent: number }
  | { kind: 'date'; date: string }
  | { kind: 'text'; text: string }
  | { kind: 'numbers'; numbers: string[] }
  | { kind: 'version'; version: number }
  | { kind: 'state'; state: DiscrepancyState };

export const DATE_FACTS = [
  'agreement_signed',
  'team_approved',
  'stage_1_start',
  'stage_1_end',
  'stage_1_report',
  'stage_2_end',
  'stage_2_report',
  'recommendation',
  'dossier_reviewed',
  'dossier_approved',
  'decision',
] as const;
export type DateFact = (typeof DATE_FACTS)[number];

export const CONSISTENCY_DOSSIER_ITEMS = [
  'application',
  'application_review',
  'duration',
  'agreement',
  'team_approval',
  'stage_1_plan',
  'stage_1_report',
  'stage_2_plan',
  'stage_2_report',
  'participant_lists',
  'findings_follow_up',
  'recommendation',
  'certificate_data',
] as const;
export type ConsistencyDossierItem = (typeof CONSISTENCY_DOSSIER_ITEMS)[number];

export const CERTIFICATE_TEXT_FIELDS = [
  'holderName',
  'address',
  'scope',
  'language',
] as const;
export type CertificateTextField = (typeof CERTIFICATE_TEXT_FIELDS)[number];

export type AuditStage = 'stage_1' | 'stage_2';

export type DiscrepancySubject =
  | { kind: 'duration_proposal' }
  | { kind: 'prior_certification_reduction' }
  | { kind: 'stage_share'; stage: AuditStage }
  | { kind: 'stage_capacity'; stage: AuditStage }
  | { kind: 'date_order'; earlier: DateFact; later: DateFact }
  | { kind: 'dossier_item'; item: ConsistencyDossierItem }
  | { kind: 'certificate_text'; language: string; field: CertificateTextField }
  | { kind: 'address_numbers'; language: string }
  | { kind: 'document_version'; documentId: string }
  | { kind: 'plan_sending'; stage: AuditStage }
  | {
      kind: 'exchange_reference';
      reference: string;
      first: number;
      second: number;
    }
  | {
      kind: 'exchange_deadline';
      deadline: 'stage_2_report_released';
      sequence: number;
    };

export interface AttachmentReference {
  attachmentId: string;
  documentId: string;
  versionId: string;
  versionNumber: number;
  sourceTitle: string;
}

export const SOURCE_STEPS = [
  'application',
  'application_review',
  'duration',
  'agreement',
  'team',
  'team_decision',
  'stage_1_plan',
  'stage_1_report',
  'stage_2_plan',
  'stage_2_report',
  'recommendation',
  'dossier_review',
  'decision',
  'certificate_data',
] as const;
export type SourceStep = (typeof SOURCE_STEPS)[number];

export type DiscrepancySource =
  | {
      kind: 'step';
      step: SourceStep;
      version: number;
      versionId: string;
      attachment: AttachmentReference | null;
    }
  | {
      kind: 'finding';
      sequence: number;
      version: number;
      attachment: AttachmentReference | null;
    }
  | {
      kind: 'certificate';
      number: string;
      attachment: AttachmentReference | null;
    }
  | {
      kind: 'exchange';
      sequence: number;
      version: number;
      attachment: AttachmentReference | null;
    }
  | { kind: 'attachment'; attachment: AttachmentReference };

export interface DiscrepancySide {
  value: DiscrepancyValue;
  detail: string | null;
  source: DiscrepancySource | null;
}

export type DiscrepancyResolution =
  | {
      kind: 'accepted';
      via: 'acceptance' | 'justification';
      reason: string;
      by: CertificationActorReference;
      at: string;
      caseRevision: number;
      source: DiscrepancySource | null;
    }
  | {
      kind: 'corrected';
      via: 'record' | 'resolution';
      reason: string | null;
      by: CertificationActorReference | null;
      at: string | null;
      caseRevision: number;
      source: DiscrepancySource | null;
    };

export type DiscrepancyBlock = 'decision' | 'certificate';

type DiscrepancyCore = {
  id: string;
  verdict: DiscrepancyVerdict;
  left: DiscrepancySide;
  right: DiscrepancySide;
  openedRevision: number;
  opened: { by: CertificationActorReference; at: string } | null;
  endedRevision: number | null;
};
type DiscrepancyOrigin =
  | { origin: 'rule'; rule: ConsistencyRule; subject: DiscrepancySubject }
  | {
      origin: 'manual';
      rule: null;
      sequence: number;
      subject: string;
      note: string | null;
    };
type DiscrepancyStatus =
  | { status: 'open'; blocks: DiscrepancyBlock | null; resolution: null }
  | { status: 'resolved'; blocks: null; resolution: DiscrepancyResolution };
export type Discrepancy = DiscrepancyCore &
  DiscrepancyOrigin &
  DiscrepancyStatus;

export interface Consistency {
  ruleSetVersion: string;
  counts: { critical: number; error: number; toClarify: number };
  open: Discrepancy[];
  resolved: Discrepancy[];
  resolvedTotal: number;
}

/** The server's bounds for the two commands. */
export const CONSISTENCY_LIMITS = {
  subject: 200,
  value: 1000,
  location: 200,
  note: 2000,
  reason: 2000,
} as const;

/** What the actor may do on the read Case's Discrepancies. */
export type ConsistencyRoles = {
  manager: boolean;
  /** Holds the approver bundle and is linked to no audit team member. */
  independentApprover: boolean;
  /** Holds the auditor bundle and is linked to an audit team member. */
  auditorOnTeam: boolean;
};

/** A programme manager, an auditor on the team or an approver outside it. */
export function canRecordDiscrepancy(roles: ConsistencyRoles): boolean {
  return roles.manager || roles.auditorOnTeam || roles.independentApprover;
}

/** "To clarify": a manager or approver; "error": the approver; critical: no one. */
export function canAccept(
  discrepancy: Discrepancy,
  roles: ConsistencyRoles,
): boolean {
  if (discrepancy.status !== 'open') return false;
  switch (discrepancy.verdict) {
    case 'critical':
      return false;
    case 'error':
      return roles.independentApprover;
    case 'to_clarify':
      return roles.manager || roles.independentApprover;
  }
  return unexpected(discrepancy.verdict);
}

/** Only a manual Discrepancy is closed as corrected by a resolution. */
export function canCorrect(
  discrepancy: Discrepancy,
  roles: ConsistencyRoles,
): boolean {
  return (
    discrepancy.status === 'open' &&
    discrepancy.origin === 'manual' &&
    (roles.manager || roles.independentApprover)
  );
}

/** The open Discrepancies the next Certification Decision would be refused for. */
export function blockingDecision(consistency: Consistency): Discrepancy[] {
  return consistency.open.filter((entry) => entry.blocks === 'decision');
}

export type ManualDraft = {
  subject: string;
  verdict: DiscrepancyVerdict | '';
  leftValue: string;
  leftAttachmentId: string;
  leftLocation: string;
  rightValue: string;
  rightAttachmentId: string;
  rightLocation: string;
  note: string;
};

export function emptyManualDraft(): ManualDraft {
  return {
    subject: '',
    verdict: '',
    leftValue: '',
    leftAttachmentId: '',
    leftLocation: '',
    rightValue: '',
    rightAttachmentId: '',
    rightLocation: '',
    note: '',
  };
}

export type ManualCheck =
  { status: 'valid'; body: Record<string, unknown> } | { status: 'invalid' };

/** The manual Discrepancy command, both PDFs attached to this Case. */
export function manualFromDraft(
  draft: ManualDraft,
  attachments: readonly { id: string }[],
): ManualCheck {
  const attached = (id: string) => attachments.some((entry) => entry.id === id);
  const bounded = (value: string, limit: number) =>
    value.trim().length > 0 && value.length <= limit;
  const optional = (value: string, limit: number) =>
    value.trim() === '' || value.length <= limit;
  if (
    draft.verdict === '' ||
    !bounded(draft.subject, CONSISTENCY_LIMITS.subject) ||
    !bounded(draft.leftValue, CONSISTENCY_LIMITS.value) ||
    !bounded(draft.rightValue, CONSISTENCY_LIMITS.value) ||
    !attached(draft.leftAttachmentId) ||
    !attached(draft.rightAttachmentId) ||
    !optional(draft.leftLocation, CONSISTENCY_LIMITS.location) ||
    !optional(draft.rightLocation, CONSISTENCY_LIMITS.location) ||
    !optional(draft.note, CONSISTENCY_LIMITS.note)
  )
    return { status: 'invalid' };
  const nullable = (value: string) => (value.trim() === '' ? null : value);
  return {
    status: 'valid',
    body: {
      verdict: draft.verdict,
      subject: draft.subject,
      left: {
        value: draft.leftValue,
        attachmentId: draft.leftAttachmentId,
        location: nullable(draft.leftLocation),
      },
      right: {
        value: draft.rightValue,
        attachmentId: draft.rightAttachmentId,
        location: nullable(draft.rightLocation),
      },
      note: nullable(draft.note),
    },
  };
}

/** The one resolution form open in the region, with its draft. */
export type ResolutionDraft = {
  discrepancyId: string;
  resolution: 'accepted' | 'corrected';
  reason: string;
  /** Acceptances only: also add an item to re-verify at the next Audit. */
  reverify: boolean;
  /** `attachment:<id>` or `step:<id>`; corrections only. */
  correctedBy: string;
};

export type ResolutionCheck =
  | { status: 'valid'; body: Record<string, unknown> }
  | { status: 'reasonRequired' | 'correctionRequired' };

export function resolutionFromDraft(
  draft: ResolutionDraft,
  options: {
    attachments: readonly { id: string }[];
    versions: readonly { id: string }[];
  },
): ResolutionCheck {
  if (!draft.reason.trim() || draft.reason.length > CONSISTENCY_LIMITS.reason)
    return { status: 'reasonRequired' };
  const base = {
    discrepancyId: draft.discrepancyId,
    resolution: draft.resolution,
    reason: draft.reason,
  };
  if (draft.resolution === 'accepted')
    return {
      status: 'valid',
      body: draft.reverify ? { ...base, reverify: true } : base,
    };
  const [kind, id = ''] = draft.correctedBy.split(':');
  if (
    kind === 'attachment' &&
    options.attachments.some((entry) => entry.id === id)
  )
    return {
      status: 'valid',
      body: { ...base, correctedBy: { attachmentId: id } },
    };
  if (kind === 'step' && options.versions.some((entry) => entry.id === id))
    return {
      status: 'valid',
      body: { ...base, correctedBy: { stepVersionId: id } },
    };
  return { status: 'correctionRequired' };
}

/**
 * The Case read's consistency section, exactly as the server publishes it.
 * An unknown rule, verdict, value or source fails the whole read.
 */
export function parseConsistency(value: unknown): Consistency {
  const body = object(value);
  const counts = object(body.counts);
  const open = list(body.open).map(discrepancy);
  const resolved = list(body.resolved).map(discrepancy);
  const consistency: Consistency = {
    ruleSetVersion: text(body.ruleSetVersion, 64),
    counts: {
      critical: count(counts.critical),
      error: count(counts.error),
      toClarify: count(counts.toClarify),
    },
    open,
    resolved,
    resolvedTotal: count(body.resolvedTotal),
  };
  if (
    open.some((entry) => entry.status !== 'open') ||
    resolved.some((entry) => entry.status !== 'resolved') ||
    consistency.resolvedTotal < resolved.length ||
    consistency.counts.critical !==
      open.filter((entry) => entry.verdict === 'critical').length ||
    consistency.counts.error !==
      open.filter((entry) => entry.verdict === 'error').length ||
    consistency.counts.toClarify !==
      open.filter((entry) => entry.verdict === 'to_clarify').length ||
    new Set(open.map((entry) => entry.id)).size !== open.length
  )
    invalid();
  return consistency;
}

/** The ids and rules the server names when a gate refuses an act. */
export function parseBlockingDiscrepancies(
  value: unknown,
): { id: string; rule: ConsistencyRule | 'manual' }[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const items: unknown[] = value;
  const parsed: { id: string; rule: ConsistencyRule | 'manual' }[] = [];
  for (const item of items) {
    if (!item || typeof item !== 'object' || Array.isArray(item))
      return undefined;
    const entry = Object.fromEntries(Object.entries(item));
    const rule =
      entry.rule === 'manual'
        ? 'manual'
        : CONSISTENCY_RULES.find((known) => known === entry.rule);
    if (typeof entry.id !== 'string' || rule === undefined) return undefined;
    parsed.push({ id: entry.id, rule });
  }
  return parsed;
}

function discrepancy(value: unknown): Discrepancy {
  const body = object(value);
  const core: DiscrepancyCore = {
    id: text(body.id, 80),
    verdict: oneOf(DISCREPANCY_VERDICTS, body.verdict),
    left: side(body.left),
    right: side(body.right),
    openedRevision: positive(body.openedRevision),
    opened: body.opened === null ? null : mark(body.opened),
    endedRevision:
      body.endedRevision === null ? null : positive(body.endedRevision),
  };
  let origin: DiscrepancyOrigin;
  if (body.origin === 'rule') {
    if (!/^R\d{2}:[0-9a-f]{32}$/u.test(core.id)) invalid();
    origin = {
      origin: 'rule',
      rule: oneOf(CONSISTENCY_RULES, body.rule),
      subject: subject(body.subject),
    };
  } else if (body.origin === 'manual') {
    if (!core.id.startsWith('manual:') || body.rule !== null) invalid();
    const manual = object(body.subject);
    if (manual.kind !== 'manual') invalid();
    origin = {
      origin: 'manual',
      rule: null,
      sequence: positive(body.sequence),
      subject: text(manual.text, CONSISTENCY_LIMITS.subject),
      note:
        body.note === null ? null : text(body.note, CONSISTENCY_LIMITS.note),
    };
  } else return invalid();
  if (body.status === 'open') {
    if (body.resolution !== null) invalid();
    const blocks =
      body.blocks === null
        ? null
        : oneOf(['decision', 'certificate'] as const, body.blocks);
    if (blocks !== null && core.verdict === 'to_clarify') invalid();
    return { ...core, ...origin, status: 'open', blocks, resolution: null };
  }
  if (body.status !== 'resolved' || body.blocks !== null) invalid();
  return {
    ...core,
    ...origin,
    status: 'resolved',
    blocks: null,
    resolution: resolution(body.resolution),
  };
}

function resolution(value: unknown): DiscrepancyResolution {
  const body = object(value);
  const source =
    body.source === undefined || body.source === null
      ? null
      : discrepancySource(body.source);
  const caseRevision = positive(body.caseRevision);
  if (body.kind === 'accepted') {
    if (body.via !== 'acceptance' && body.via !== 'justification') invalid();
    return {
      kind: 'accepted',
      via: body.via,
      reason: text(body.reason, CONSISTENCY_LIMITS.reason),
      by: actor(body.by),
      at: instant(body.at),
      caseRevision,
      source,
    };
  }
  if (body.kind !== 'corrected') return invalid();
  if (body.via !== 'record' && body.via !== 'resolution') invalid();
  return {
    kind: 'corrected',
    via: body.via,
    reason: body.reason === null ? null : text(body.reason),
    by: body.by === null ? null : actor(body.by),
    at: body.at === null ? null : instant(body.at),
    caseRevision,
    source,
  };
}

function subject(value: unknown): DiscrepancySubject {
  const body = object(value);
  switch (body.kind) {
    case 'duration_proposal':
    case 'prior_certification_reduction':
      return { kind: body.kind };
    case 'stage_share':
    case 'stage_capacity':
      return {
        kind: body.kind,
        stage: oneOf(['stage_1', 'stage_2'] as const, body.stage),
      };
    case 'date_order':
      return {
        kind: 'date_order',
        earlier: oneOf(DATE_FACTS, body.earlier),
        later: oneOf(DATE_FACTS, body.later),
      };
    case 'dossier_item':
      return {
        kind: 'dossier_item',
        item: oneOf(CONSISTENCY_DOSSIER_ITEMS, body.item),
      };
    case 'certificate_text':
      return {
        kind: 'certificate_text',
        language: text(body.language, 10),
        field: oneOf(CERTIFICATE_TEXT_FIELDS, body.field),
      };
    case 'address_numbers':
      return { kind: 'address_numbers', language: text(body.language, 10) };
    case 'document_version':
      return { kind: 'document_version', documentId: text(body.documentId) };
    case 'plan_sending':
      return {
        kind: 'plan_sending',
        stage: oneOf(['stage_1', 'stage_2'] as const, body.stage),
      };
    case 'exchange_reference':
      return {
        kind: 'exchange_reference',
        reference: text(body.reference, 64),
        first: positive(body.first),
        second: positive(body.second),
      };
    case 'exchange_deadline':
      return {
        kind: 'exchange_deadline',
        deadline: oneOf(['stage_2_report_released'] as const, body.deadline),
        sequence: positive(body.sequence),
      };
    default:
      return invalid();
  }
}

function side(value: unknown): DiscrepancySide {
  const body = object(value);
  return {
    value: discrepancyValue(body.value),
    detail: body.detail === null ? null : text(body.detail),
    source: body.source === null ? null : discrepancySource(body.source),
  };
}

function discrepancyValue(value: unknown): DiscrepancyValue {
  const body = object(value);
  switch (body.kind) {
    case 'days':
      return { kind: 'days', days: text(body.days, 16) };
    case 'capacity':
      return {
        kind: 'capacity',
        calendarDays: positive(body.calendarDays),
        auditors: count(body.auditors),
      };
    case 'percent':
      return { kind: 'percent', percent: count(body.percent) };
    case 'date':
      return { kind: 'date', date: text(body.date, 10) };
    case 'text':
      return { kind: 'text', text: text(body.text) };
    case 'numbers':
      return {
        kind: 'numbers',
        numbers: list(body.numbers).map((entry) => text(entry, 32)),
      };
    case 'version':
      return { kind: 'version', version: positive(body.version) };
    case 'state':
      return { kind: 'state', state: oneOf(DISCREPANCY_STATES, body.state) };
    default:
      return invalid();
  }
}

function discrepancySource(value: unknown): DiscrepancySource {
  const body = object(value);
  const attachment = (entry: unknown) =>
    entry === null ? null : attachmentReference(entry);
  switch (body.kind) {
    case 'step':
      return {
        kind: 'step',
        step: oneOf(SOURCE_STEPS, body.step),
        version: positive(body.version),
        versionId: text(body.versionId),
        attachment: attachment(body.attachment),
      };
    case 'finding':
      return {
        kind: 'finding',
        sequence: positive(body.sequence),
        version: positive(body.version),
        attachment: attachment(body.attachment),
      };
    case 'certificate':
      return {
        kind: 'certificate',
        number: text(body.number, 64),
        attachment: attachment(body.attachment),
      };
    case 'exchange':
      return {
        kind: 'exchange',
        sequence: positive(body.sequence),
        version: positive(body.version),
        attachment: attachment(body.attachment),
      };
    case 'attachment':
      return {
        kind: 'attachment',
        attachment: attachmentReference(body.attachment),
      };
    default:
      return invalid();
  }
}

function attachmentReference(value: unknown): AttachmentReference {
  const body = object(value);
  return {
    attachmentId: text(body.attachmentId),
    documentId: text(body.documentId),
    versionId: text(body.versionId),
    versionNumber: positive(body.versionNumber),
    sourceTitle: text(body.sourceTitle),
  };
}

function mark(value: unknown) {
  const body = object(value);
  return { by: actor(body.by), at: instant(body.at) };
}

function actor(value: unknown): CertificationActorReference {
  const body = object(value);
  return {
    workspaceMembershipId: text(body.workspaceMembershipId),
    displayName: text(body.displayName),
  };
}

function instant(value: unknown): string {
  const raw = text(value, 40);
  if (!Number.isFinite(Date.parse(raw))) invalid();
  return raw;
}

function oneOf<const T extends readonly string[]>(
  values: T,
  value: unknown,
): T[number] {
  const found = values.find((entry) => entry === value);
  if (found === undefined) invalid();
  return found;
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid();
  return Object.fromEntries(Object.entries(value));
}

function list(value: unknown): unknown[] {
  if (!Array.isArray(value) || value.length > 1000) invalid();
  return value;
}

function text(value: unknown, max = 4000): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max)
    invalid();
  return value;
}

function count(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0)
    invalid();
  return value;
}

function positive(value: unknown): number {
  const parsed = count(value);
  if (parsed < 1) invalid();
  return parsed;
}

function invalid(): never {
  throw new Error('Invalid Certification consistency response.');
}

function unexpected(value: never): never {
  throw new Error(`Unexpected consistency value: ${String(value)}`);
}
