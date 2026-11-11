import { createHash } from 'node:crypto';
import { proposeForApplication } from './certification-duration.js';
import {
  DOSSIER_ITEMS,
  type CertificateText,
  type DossierItem,
} from './certification-decision.js';
import type { FindingRecordView } from './certification-findings.js';
import { dayCents, type AuditStage } from './certification-stages.js';
import type {
  CertificationActorReference,
  CertificationAttachment,
  CertificationStepVersion,
} from './certification.types.js';

/**
 * The Dossier Consistency Check of the dossier control PRD §8.1: a fixed,
 * versioned rule set over one Case's recorded facts. It never reads PDF
 * content and never changes a record; a person resolves what it raises.
 */
export const CONSISTENCY_RULE_SET_VERSION = 'dossier-consistency-2026-11';

export const CONSISTENCY_RULES = [
  'R01',
  'R02',
  'R03',
  'R04',
  'R05',
  'R08',
  'R09',
  'R10',
  'R11',
  'R12',
  'R14',
] as const;
export type ConsistencyRule = (typeof CONSISTENCY_RULES)[number];

export const DISCREPANCY_VERDICTS = [
  'critical',
  'error',
  'to_clarify',
] as const;
export type DiscrepancyVerdict = (typeof DISCREPANCY_VERDICTS)[number];

/** A compared value that is a state rather than a quantity or a text. */
export type DiscrepancyState =
  | 'present'
  | 'missing'
  | 'not_applicable'
  | 'recorded'
  | 'not_recorded'
  | 'not_declared'
  | 'not_computable';

/** One compared value; an acceptance is bound to these exact values. */
export type DiscrepancyValue =
  | { kind: 'days'; days: string }
  | { kind: 'capacity'; calendarDays: number; auditors: number }
  | { kind: 'percent'; percent: number }
  | { kind: 'date'; date: string }
  | { kind: 'text'; text: string }
  | { kind: 'numbers'; numbers: string[] }
  | { kind: 'version'; version: number }
  | { kind: 'state'; state: DiscrepancyState };

/** The business dates R05 orders. */
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

export type CertificateTextField =
  'holderName' | 'address' | 'scope' | 'language';

/** What a Discrepancy compares. A manual one states its subject in words. */
export type DiscrepancySubject =
  | { kind: 'duration_proposal' }
  | { kind: 'prior_certification_reduction' }
  | { kind: 'stage_share'; stage: AuditStage }
  | { kind: 'stage_capacity'; stage: AuditStage }
  | { kind: 'date_order'; earlier: DateFact; later: DateFact }
  | { kind: 'dossier_item'; item: DossierItem }
  | {
      kind: 'certificate_text';
      language: string;
      field: CertificateTextField;
    }
  | { kind: 'address_numbers'; language: string }
  | { kind: 'document_version'; documentId: string };

export interface AttachmentReference {
  attachmentId: string;
  documentId: string;
  versionId: string;
  versionNumber: number;
  sourceTitle: string;
  role: CertificationAttachment['role'];
}

type StepName = CertificationStepVersion['step'];

/** Where a compared value is recorded: a record version and its exact PDF. */
export type DiscrepancySource =
  | {
      kind: 'step';
      step: StepName;
      version: number;
      versionId: string;
      attachment: AttachmentReference | null;
    }
  | {
      kind: 'finding';
      findingId: string;
      sequence: number;
      record: FindingRecordView['kind'];
      version: number;
      attachment: AttachmentReference | null;
    }
  | {
      kind: 'certificate';
      number: string;
      attachment: AttachmentReference | null;
    }
  | { kind: 'attachment'; attachment: AttachmentReference };

/** One side of a comparison: the compared value, a fuller text, its source. */
export interface DiscrepancySide {
  value: DiscrepancyValue;
  /** The text a value was read from, shown but not compared (R12). */
  detail: string | null;
  source: DiscrepancySource | null;
}

/** A justification recorded with the record itself (R03's deviation note). */
export interface DiscrepancyJustification {
  reason: string;
  by: CertificationActorReference;
  at: string;
  caseRevision: number;
  source: DiscrepancySource;
}

export interface RuleDiscrepancy {
  rule: ConsistencyRule;
  verdict: DiscrepancyVerdict;
  subject: DiscrepancySubject;
  left: DiscrepancySide;
  right: DiscrepancySide;
  justification: DiscrepancyJustification | null;
}

export interface ConsistencyFinding {
  id: string;
  sequence: number;
  records: readonly FindingRecordView[];
}

export interface ConsistencyCertificate {
  number: string;
  attachmentId: string;
  caseRevision: number;
  recordedBy: CertificationActorReference;
  recordedAt: string;
}

/** The recorded facts of one Case as of one revision. */
export interface ConsistencySnapshot {
  steps: readonly CertificationStepVersion[];
  attachments: readonly CertificationAttachment[];
  findings: readonly ConsistencyFinding[];
  certificate: ConsistencyCertificate | null;
}

export interface ManualStatedValue {
  value: string;
  attachmentId: string;
  location: string | null;
}

/** A Discrepancy a member found by reading documents. */
export interface ManualDiscrepancyRecord {
  id: string;
  sequence: number;
  caseRevision: number;
  verdict: DiscrepancyVerdict;
  subject: string;
  left: ManualStatedValue;
  right: ManualStatedValue;
  note: string | null;
  recordedBy: CertificationActorReference;
  recordedAt: string;
}

/** The record version or Document Version a manual correction names. */
export type CorrectingReference =
  | { kind: 'attachment'; attachmentId: string }
  | { kind: 'step'; versionId: string };

/** A human resolution: an acceptance, or a manual Discrepancy's correction. */
export interface ResolutionRecord {
  id: string;
  discrepancyId: string;
  manualDiscrepancyId: string | null;
  kind: 'accepted' | 'corrected';
  verdict: DiscrepancyVerdict;
  reason: string;
  correctedBy: CorrectingReference | null;
  ruleSetVersion: string;
  caseRevision: number;
  recordedBy: CertificationActorReference;
  recordedAt: string;
}

export interface ConsistencyInput extends ConsistencySnapshot {
  revision: number;
  status: 'open' | 'rejected' | 'refused' | 'certified';
  manual: readonly ManualDiscrepancyRecord[];
  resolutions: readonly ResolutionRecord[];
}

export type DiscrepancyBlock = 'decision' | 'certificate';

export type DiscrepancyResolution =
  | {
      kind: 'accepted';
      via: 'acceptance';
      reason: string;
      by: CertificationActorReference;
      at: string;
      caseRevision: number;
      ruleSetVersion: string;
    }
  | {
      kind: 'accepted';
      via: 'justification';
      reason: string;
      by: CertificationActorReference;
      at: string;
      caseRevision: number;
      source: DiscrepancySource;
    }
  | {
      kind: 'corrected';
      via: 'record';
      reason: string | null;
      by: CertificationActorReference | null;
      at: string | null;
      caseRevision: number;
      source: DiscrepancySource | null;
    }
  | {
      kind: 'corrected';
      via: 'resolution';
      reason: string;
      by: CertificationActorReference;
      at: string;
      caseRevision: number;
      source: DiscrepancySource | null;
    };

/** Who recorded the revision a Discrepancy appeared at, and when. */
export interface RevisionMark {
  by: CertificationActorReference;
  at: string;
}

type DiscrepancyCore = {
  id: string;
  verdict: DiscrepancyVerdict;
  left: DiscrepancySide;
  right: DiscrepancySide;
  openedRevision: number;
  opened: RevisionMark | null;
  /** The revision from which the check no longer raises it, if any. */
  endedRevision: number | null;
};
type DiscrepancyOrigin =
  | { origin: 'rule'; rule: ConsistencyRule; subject: DiscrepancySubject }
  | {
      origin: 'manual';
      rule: null;
      sequence: number;
      subject: { kind: 'manual'; text: string };
      note: string | null;
    };
type DiscrepancyStatus =
  | { status: 'open'; blocks: DiscrepancyBlock | null; resolution: null }
  | { status: 'resolved'; blocks: null; resolution: DiscrepancyResolution };
export type DiscrepancyView = DiscrepancyCore &
  DiscrepancyOrigin &
  DiscrepancyStatus;

export interface ConsistencySection {
  ruleSetVersion: string;
  /** Open Discrepancies per verdict. */
  counts: { critical: number; error: number; toClarify: number };
  open: DiscrepancyView[];
  /** The latest resolved occurrences first, bounded. */
  resolved: DiscrepancyView[];
  resolvedTotal: number;
}

/** The resolved list keeps its latest entries; the total says how many exist. */
export const RESOLVED_LIMIT = 200;

/** Every Discrepancy the rule set raises over one snapshot. */
export function checkConsistency(
  snapshot: ConsistencySnapshot,
): RuleDiscrepancy[] {
  const facts = new Facts(snapshot);
  return [
    ...durationProposal(facts),
    ...priorCertification(facts),
    ...stageShares(facts),
    ...stageCapacity(facts),
    ...dateOrder(facts),
    ...dossierItems(facts),
    ...reviewedVersions(facts),
    ...certificateTexts(facts),
    ...addressNumbersRule(facts),
    ...laterDocumentVersions(facts),
  ];
}

/** The stable identity of a rule Discrepancy: rule, subject and values. */
export function discrepancyId(
  rule: ConsistencyRule,
  subject: DiscrepancySubject,
  left: DiscrepancyValue,
  right: DiscrepancyValue,
): string {
  const digest = createHash('sha256')
    .update(canonical({ rule, subject, left, right }))
    .digest('hex');
  return `${rule}:${digest.slice(0, 32)}`;
}

export function manualDiscrepancyId(id: string): string {
  return `manual:${id}`;
}

/**
 * The open and resolved Discrepancies of a Case, with their history: the
 * check replayed over every recorded revision, the acceptances bound to rule,
 * subject and values, and the manual Discrepancies with their resolutions.
 */
export function consistencySection(
  input: ConsistencyInput,
): ConsistencySection {
  const marks = revisionMarks(input);
  const acceptances = new Map<string, ResolutionRecord>();
  for (const resolution of input.resolutions)
    if (
      resolution.manualDiscrepancyId === null &&
      resolution.kind === 'accepted'
    )
      acceptances.set(resolution.discrepancyId, resolution);
  const views: DiscrepancyView[] = [];
  for (const occurrence of replay(input)) {
    const { discrepancy, start, end } = occurrence;
    const id = discrepancyId(
      discrepancy.rule,
      discrepancy.subject,
      discrepancy.left.value,
      discrepancy.right.value,
    );
    const acceptance = acceptances.get(id);
    const accepted =
      acceptance && (end === null || acceptance.caseRevision < end)
        ? acceptance
        : undefined;
    const core: DiscrepancyCore & DiscrepancyOrigin = {
      id,
      origin: 'rule',
      rule: discrepancy.rule,
      subject: discrepancy.subject,
      verdict: discrepancy.verdict,
      left: discrepancy.left,
      right: discrepancy.right,
      openedRevision: start,
      opened: marks.get(start)?.mark ?? null,
      endedRevision: end,
    };
    let resolution: DiscrepancyResolution | null = null;
    if (accepted)
      resolution = {
        kind: 'accepted',
        via: 'acceptance',
        reason: accepted.reason,
        by: accepted.recordedBy,
        at: accepted.recordedAt,
        caseRevision: accepted.caseRevision,
        ruleSetVersion: accepted.ruleSetVersion,
      };
    else if (discrepancy.justification)
      resolution = {
        kind: 'accepted',
        via: 'justification',
        reason: discrepancy.justification.reason,
        by: discrepancy.justification.by,
        at: discrepancy.justification.at,
        caseRevision: discrepancy.justification.caseRevision,
        source: discrepancy.justification.source,
      };
    else if (end !== null) {
      const cause = marks.get(end);
      resolution = {
        kind: 'corrected',
        via: 'record',
        reason: cause?.reason ?? null,
        by: cause?.mark.by ?? null,
        at: cause?.mark.at ?? null,
        caseRevision: end,
        source: cause?.source ?? null,
      };
    }
    views.push(
      resolution
        ? { ...core, status: 'resolved', blocks: null, resolution }
        : {
            ...core,
            status: 'open',
            blocks: blockOf(discrepancy.verdict, input),
            resolution: null,
          },
    );
  }
  for (const manual of input.manual) {
    const id = manualDiscrepancyId(manual.id);
    const resolved = input.resolutions.find(
      (resolution) => resolution.manualDiscrepancyId === manual.id,
    );
    const core: DiscrepancyCore & DiscrepancyOrigin = {
      id,
      origin: 'manual',
      rule: null,
      sequence: manual.sequence,
      subject: { kind: 'manual', text: manual.subject },
      note: manual.note,
      verdict: manual.verdict,
      left: manualSide(manual.left, input),
      right: manualSide(manual.right, input),
      openedRevision: manual.caseRevision,
      opened: { by: manual.recordedBy, at: manual.recordedAt },
      endedRevision: null,
    };
    if (!resolved) {
      views.push({
        ...core,
        status: 'open',
        blocks: blockOf(manual.verdict, input),
        resolution: null,
      });
      continue;
    }
    views.push({
      ...core,
      status: 'resolved',
      blocks: null,
      resolution:
        resolved.kind === 'accepted'
          ? {
              kind: 'accepted',
              via: 'acceptance',
              reason: resolved.reason,
              by: resolved.recordedBy,
              at: resolved.recordedAt,
              caseRevision: resolved.caseRevision,
              ruleSetVersion: resolved.ruleSetVersion,
            }
          : {
              kind: 'corrected',
              via: 'resolution',
              reason: resolved.reason,
              by: resolved.recordedBy,
              at: resolved.recordedAt,
              caseRevision: resolved.caseRevision,
              source: correctingSource(resolved.correctedBy, input),
            },
    });
  }
  const open = views
    .filter((view) => view.status === 'open')
    .sort(
      (left, right) =>
        DISCREPANCY_VERDICTS.indexOf(left.verdict) -
          DISCREPANCY_VERDICTS.indexOf(right.verdict) ||
        left.openedRevision - right.openedRevision,
    );
  const resolved = views
    .filter((view) => view.status === 'resolved')
    .sort(
      (left, right) =>
        (right.resolution?.caseRevision ?? 0) -
          (left.resolution?.caseRevision ?? 0) ||
        right.openedRevision - left.openedRevision,
    );
  return {
    ruleSetVersion: CONSISTENCY_RULE_SET_VERSION,
    counts: {
      critical: open.filter((view) => view.verdict === 'critical').length,
      error: open.filter((view) => view.verdict === 'error').length,
      toClarify: open.filter((view) => view.verdict === 'to_clarify').length,
    },
    open,
    resolved: resolved.slice(0, RESOLVED_LIMIT),
    resolvedTotal: resolved.length,
  };
}

/** A Discrepancy a gate refuses an act for, named by identity, rule and verdict. */
export interface BlockingDiscrepancy {
  id: string;
  rule: ConsistencyRule | 'manual';
  verdict: Exclude<DiscrepancyVerdict, 'to_clarify'>;
}

/**
 * The open critical and unaccepted error Discrepancies of a snapshot, as a
 * gate evaluates them inside its own transaction: rule results not accepted
 * on the same values nor justified, and unresolved manual Discrepancies.
 */
export function blockingDiscrepancies(
  snapshot: ConsistencySnapshot,
  manual: readonly ManualDiscrepancyRecord[],
  resolutions: readonly ResolutionRecord[],
): BlockingDiscrepancy[] {
  const accepted = new Set(
    resolutions
      .filter((resolution) => resolution.kind === 'accepted')
      .map((resolution) => resolution.discrepancyId),
  );
  const blocking: BlockingDiscrepancy[] = [];
  for (const discrepancy of checkConsistency(snapshot)) {
    if (discrepancy.verdict === 'to_clarify' || discrepancy.justification)
      continue;
    const id = discrepancyId(
      discrepancy.rule,
      discrepancy.subject,
      discrepancy.left.value,
      discrepancy.right.value,
    );
    if (!accepted.has(id))
      blocking.push({
        id,
        rule: discrepancy.rule,
        verdict: discrepancy.verdict,
      });
  }
  for (const record of manual) {
    if (record.verdict === 'to_clarify') continue;
    if (
      resolutions.some(
        (resolution) => resolution.manualDiscrepancyId === record.id,
      )
    )
      continue;
    blocking.push({
      id: manualDiscrepancyId(record.id),
      rule: 'manual',
      verdict: record.verdict,
    });
  }
  return blocking;
}

/**
 * The house numbers and postal codes of an address: digit groups with an
 * optional one-letter suffix, after case and Latin–Cyrillic look-alike
 * folding, in a stable order so that wording and order never count.
 */
export function addressNumbers(address: string): string[] {
  const folded = Array.from(
    address.normalize('NFKC').toLocaleLowerCase('en'),
    (character) => LOOK_ALIKES.get(character) ?? character,
  ).join('');
  const numbers = Array.from(
    folded.matchAll(/(\d+)(?:([a-z])(?![a-z\d]))?/gu),
    (match) => `${match[1] ?? ''}${match[2] ?? ''}`,
  );
  return numbers.sort();
}

const LOOK_ALIKES = new Map([
  ['а', 'a'],
  ['в', 'b'],
  ['е', 'e'],
  ['к', 'k'],
  ['м', 'm'],
  ['н', 'h'],
  ['о', 'o'],
  ['р', 'p'],
  ['с', 'c'],
  ['т', 't'],
  ['у', 'y'],
  ['х', 'x'],
  ['і', 'i'],
  ['ј', 'j'],
]);

/** Read access to one snapshot's latest record versions. */
class Facts {
  readonly attachments: Map<string, CertificationAttachment>;

  constructor(readonly snapshot: ConsistencySnapshot) {
    this.attachments = new Map(
      snapshot.attachments.map((attachment) => [attachment.id, attachment]),
    );
  }

  /** The latest version of a step, optionally recorded before a revision. */
  latest<S extends StepName>(
    step: S,
    before = Number.POSITIVE_INFINITY,
  ): Extract<CertificationStepVersion, { step: S }> | undefined {
    let found: Extract<CertificationStepVersion, { step: S }> | undefined;
    for (const version of this.snapshot.steps)
      if (version.caseRevision < before && isStep(version, step))
        found = version;
    return found;
  }

  first<S extends StepName>(
    step: S,
  ): Extract<CertificationStepVersion, { step: S }> | undefined {
    for (const version of this.snapshot.steps)
      if (isStep(version, step)) return version;
    return undefined;
  }

  reference(attachmentId: string | null): AttachmentReference | null {
    if (attachmentId === null) return null;
    const attachment = this.attachments.get(attachmentId);
    return attachment ? attachmentReference(attachment) : null;
  }

  source(version: CertificationStepVersion): DiscrepancySource {
    return {
      kind: 'step',
      step: version.step,
      version: version.version,
      versionId: version.id,
      attachment: this.reference(primaryAttachment(version)),
    };
  }

  /** The revision of the first decision: what R10 compares stops there. */
  get decidedAt(): number {
    return this.first('decision')?.caseRevision ?? Number.POSITIVE_INFINITY;
  }
}

function isStep<S extends StepName>(
  version: CertificationStepVersion,
  step: S,
): version is Extract<CertificationStepVersion, { step: S }> {
  return version.step === step;
}

function side(
  value: DiscrepancyValue,
  source: DiscrepancySource | null,
  detail: string | null = null,
): DiscrepancySide {
  return { value, detail, source };
}

function raise(
  rule: ConsistencyRule,
  verdict: DiscrepancyVerdict,
  subject: DiscrepancySubject,
  left: DiscrepancySide,
  right: DiscrepancySide,
  justification: DiscrepancyJustification | null = null,
): RuleDiscrepancy {
  return { rule, verdict, subject, left, right, justification };
}

/** R01: the proposal recomputed from the current application, like with like. */
function durationProposal(facts: Facts): RuleDiscrepancy[] {
  const application = facts.latest('application');
  const duration = facts.latest('duration');
  if (!application || !duration) return [];
  const determination = duration.value;
  const recomputed = proposeForApplication(application.value, {
    primary: determination.inputs.primary,
    haccpStudies: determination.inputs.haccpStudies,
    increases: determination.inputs.increases,
    reductions: determination.inputs.reductions,
  });
  const current: DiscrepancyValue =
    recomputed.kind === 'proposal'
      ? { kind: 'days', days: recomputed.proposal.initialOnSite }
      : { kind: 'state', state: 'not_computable' };
  const confirmed: DiscrepancyValue =
    determination.computation.kind === 'proposal'
      ? { kind: 'days', days: determination.computation.proposal.initialOnSite }
      : { kind: 'state', state: 'not_computable' };
  if (canonical(current) === canonical(confirmed)) return [];
  return [
    raise(
      'R01',
      'error',
      { kind: 'duration_proposal' },
      side(current, facts.source(application)),
      side(confirmed, facts.source(duration)),
    ),
  ];
}

/** R02: a prior-certification reduction needs a declared certification. */
function priorCertification(facts: Facts): RuleDiscrepancy[] {
  const application = facts.latest('application');
  const duration = facts.latest('duration');
  if (!application || !duration) return [];
  const reduction = duration.value.inputs.reductions.priorCertification ?? 0;
  if (reduction <= 0 || application.value.otherCertifiedSystems !== null)
    return [];
  return [
    raise(
      'R02',
      'error',
      { kind: 'prior_certification_reduction' },
      side({ kind: 'percent', percent: reduction }, facts.source(duration)),
      side({ kind: 'state', state: 'not_declared' }, facts.source(application)),
    ),
  ];
}

const STAGES: readonly AuditStage[] = ['stage_1', 'stage_2'];

function stagePlanOf(facts: Facts, stage: AuditStage) {
  return stage === 'stage_1'
    ? facts.latest('stage_1_plan')
    : facts.latest('stage_2_plan');
}

/** R03: a plan's on-site days against its Stage's confirmed share. */
function stageShares(facts: Facts): RuleDiscrepancy[] {
  const duration = facts.latest('duration');
  if (!duration) return [];
  return STAGES.flatMap((stage) => {
    const plan = stagePlanOf(facts, stage);
    if (!plan) return [];
    const share =
      stage === 'stage_1'
        ? duration.value.confirmed.stage1OnSite
        : duration.value.confirmed.stage2OnSite;
    if (dayCents(plan.value.onSiteDays) === dayCents(share)) return [];
    const source = facts.source(plan);
    // A deviation justified against this same duration version is accepted.
    const justified =
      plan.value.deviationNote !== null &&
      duration.caseRevision < plan.caseRevision;
    return [
      raise(
        'R03',
        'error',
        { kind: 'stage_share', stage },
        side({ kind: 'days', days: plan.value.onSiteDays }, source),
        side({ kind: 'days', days: share }, facts.source(duration)),
        justified && plan.value.deviationNote !== null
          ? {
              reason: plan.value.deviationNote,
              by: plan.recordedBy,
              at: plan.recordedAt,
              caseRevision: plan.caseRevision,
              source,
            }
          : null,
      ),
    ];
  });
}

/** R04: auditor-days beyond calendar days times the leader and auditors. */
function stageCapacity(facts: Facts): RuleDiscrepancy[] {
  const team = facts.latest('team');
  if (!team) return [];
  const auditors = team.value.members.filter(
    (member) => member.role === 'team_leader' || member.role === 'auditor',
  ).length;
  return STAGES.flatMap((stage) => {
    const plan = stagePlanOf(facts, stage);
    if (!plan) return [];
    const calendarDays =
      daysBetween(plan.value.startDate, plan.value.endDate) + 1;
    if (dayCents(plan.value.onSiteDays) <= calendarDays * auditors * 100)
      return [];
    return [
      raise(
        'R04',
        'to_clarify',
        { kind: 'stage_capacity', stage },
        side({ kind: 'days', days: plan.value.onSiteDays }, facts.source(plan)),
        side({ kind: 'capacity', calendarDays, auditors }, facts.source(team)),
      ),
    ];
  });
}

type DatedFact = {
  fact: DateFact;
  date: string;
  source: DiscrepancySource;
};

/** R05: business dates in their order; equal or unrecorded dates pass. */
function dateOrder(facts: Facts): RuleDiscrepancy[] {
  const dated = (
    fact: DateFact,
    version: CertificationStepVersion | undefined,
    date: string | null | undefined,
  ): DatedFact | null =>
    version && date ? { fact, date, source: facts.source(version) } : null;
  const agreement = facts.latest('agreement');
  const decided = facts.latest('team_decision');
  const plan1 = facts.latest('stage_1_plan');
  const report1 = facts.latest('stage_1_report');
  const plan2 = facts.latest('stage_2_plan');
  const report2 = facts.latest('stage_2_report');
  const recommendation = facts.latest('recommendation');
  const review = facts.latest('dossier_review');
  const decision = facts.latest('decision');
  const s1 = dated('stage_1_start', plan1, plan1?.value.startDate);
  const pairs: [DatedFact | null, DatedFact | null, DiscrepancyVerdict][] = [
    [
      dated('agreement_signed', agreement, agreement?.value.signedOn),
      s1,
      'error',
    ],
    [
      dated(
        'team_approved',
        decided,
        decided?.value.decision === 'approved'
          ? decided.value.onBehalf?.actedOn
          : null,
      ),
      s1,
      'error',
    ],
    [
      dated('stage_1_end', plan1, plan1?.value.endDate),
      dated('stage_1_report', report1, report1?.value.reportDate),
      'to_clarify',
    ],
    [
      dated('stage_2_end', plan2, plan2?.value.endDate),
      dated('stage_2_report', report2, report2?.value.reportDate),
      'to_clarify',
    ],
  ];
  const chain = [
    dated('stage_2_report', report2, report2?.value.reportDate),
    dated(
      'recommendation',
      recommendation,
      recommendation?.value.recommendedOn,
    ),
    dated('dossier_reviewed', review, review?.value.reviewedBy?.actedOn),
    dated('dossier_approved', review, review?.value.approvedBy?.actedOn),
    dated('decision', decision, decision?.value.decidedOn),
  ].filter((entry): entry is DatedFact => entry !== null);
  for (let index = 1; index < chain.length; index += 1)
    pairs.push([chain[index - 1] ?? null, chain[index] ?? null, 'error']);
  return pairs.flatMap(([earlier, later, verdict]) =>
    earlier && later && earlier.date > later.date
      ? [
          raise(
            'R05',
            verdict,
            { kind: 'date_order', earlier: earlier.fact, later: later.fact },
            side({ kind: 'date', date: earlier.date }, earlier.source),
            side({ kind: 'date', date: later.date }, later.source),
          ),
        ]
      : [],
  );
}

/** The record a dossier item stands for, as recorded before a revision. */
function itemRecord(
  facts: Facts,
  item: DossierItem,
  before: number,
): DiscrepancySource | null {
  const step = (version: CertificationStepVersion | undefined) =>
    version ? facts.source(version) : null;
  switch (item) {
    case 'application':
      return step(facts.latest('application', before));
    case 'application_review':
      return step(facts.latest('application_review', before));
    case 'duration':
      return step(facts.latest('duration', before));
    case 'agreement':
      return step(facts.latest('agreement', before));
    case 'team_approval': {
      const decided = facts.latest('team_decision', before);
      return decided?.value.decision === 'approved' ? step(decided) : null;
    }
    case 'stage_1_plan':
      return step(facts.latest('stage_1_plan', before));
    case 'stage_1_report':
      return step(facts.latest('stage_1_report', before));
    case 'stage_2_plan':
      return step(facts.latest('stage_2_plan', before));
    case 'stage_2_report':
      return step(facts.latest('stage_2_report', before));
    case 'participant_lists': {
      for (const report of [
        facts.latest('stage_1_report', before),
        facts.latest('stage_2_report', before),
      ])
        if (report?.value.participantListAttachmentId)
          return {
            kind: 'step',
            step: report.step,
            version: report.version,
            versionId: report.id,
            attachment: facts.reference(
              report.value.participantListAttachmentId,
            ),
          };
      const list = facts.snapshot.attachments.find(
        (attachment) =>
          attachment.role === 'participant_list' &&
          attachment.caseRevision < before,
      );
      return list
        ? { kind: 'attachment', attachment: attachmentReference(list) }
        : null;
    }
    case 'findings_follow_up':
      for (const finding of facts.snapshot.findings)
        for (const record of finding.records)
          if (record.kind === 'response' && record.caseRevision < before)
            return {
              kind: 'finding',
              findingId: finding.id,
              sequence: finding.sequence,
              record: record.kind,
              version: record.version,
              attachment: null,
            };
      return null;
    case 'recommendation':
      return step(facts.latest('recommendation', before));
    case 'certificate_data':
      return step(facts.latest('certificate_data', before));
  }
  return unexpected(item);
}

/** R08 and R09: each answer of the latest review against its record then. */
function dossierItems(facts: Facts): RuleDiscrepancy[] {
  const review = facts.latest('dossier_review');
  if (!review) return [];
  const reviewSource = facts.source(review);
  return DOSSIER_ITEMS.flatMap((item) => {
    const answer = review.value.items[item].answer;
    const record = itemRecord(facts, item, review.caseRevision);
    if (answer === 'present' && record === null)
      return [
        raise(
          'R08',
          'critical',
          { kind: 'dossier_item', item },
          side({ kind: 'state', state: 'present' }, reviewSource),
          side({ kind: 'state', state: 'not_recorded' }, null),
        ),
      ];
    if (answer !== 'present' && record !== null)
      return [
        raise(
          'R09',
          'to_clarify',
          { kind: 'dossier_item', item },
          side({ kind: 'state', state: answer }, reviewSource),
          side({ kind: 'state', state: 'recorded' }, record),
        ),
      ];
    return [];
  });
}

const VERSIONED_ITEMS: readonly [DossierItem, StepName][] = [
  ['application', 'application'],
  ['application_review', 'application_review'],
  ['duration', 'duration'],
  ['agreement', 'agreement'],
  ['team_approval', 'team_decision'],
  ['stage_1_plan', 'stage_1_plan'],
  ['stage_1_report', 'stage_1_report'],
  ['stage_2_plan', 'stage_2_plan'],
  ['stage_2_report', 'stage_2_report'],
  ['recommendation', 'recommendation'],
  ['certificate_data', 'certificate_data'],
];

/** R10: the versions the latest review saw, against those before the decision. */
function reviewedVersions(facts: Facts): RuleDiscrepancy[] {
  const until = facts.decidedAt;
  const review = facts.latest('dossier_review', until);
  if (!review) return [];
  return VERSIONED_ITEMS.flatMap(([item, step]) => {
    const seen = facts.latest(step, review.caseRevision);
    const current = facts.latest(step, until);
    if (!current || seen?.id === current.id) return [];
    return [
      raise(
        'R10',
        'error',
        { kind: 'dossier_item', item },
        side(
          seen
            ? { kind: 'version', version: seen.version }
            : { kind: 'state', state: 'not_recorded' },
          seen ? facts.source(seen) : facts.source(review),
        ),
        side(
          { kind: 'version', version: current.version },
          facts.source(current),
        ),
      ),
    ];
  });
}

const TEXT_FIELDS = ['holderName', 'address', 'scope'] as const;

function normalText(value: string): string {
  return value.replace(/\s+/gu, ' ').trim();
}

/** R11: the latest granted texts against the latest agreed Certificate data. */
function certificateTexts(facts: Facts): RuleDiscrepancy[] {
  const decision = facts.latest('decision');
  const data = facts.latest('certificate_data');
  if (!decision || !data || decision.value.decision !== 'granted') return [];
  const granted = decision.value.grantedTexts;
  const agreed = data.value.texts;
  const decided = facts.source(decision);
  const recorded = facts.source(data);
  const found: RuleDiscrepancy[] = [];
  const language = (text: CertificateText, present: 'left' | 'right') =>
    raise(
      'R11',
      'critical',
      { kind: 'certificate_text', language: text.language, field: 'language' },
      side(
        {
          kind: 'state',
          state: present === 'left' ? 'recorded' : 'not_recorded',
        },
        decided,
      ),
      side(
        {
          kind: 'state',
          state: present === 'right' ? 'recorded' : 'not_recorded',
        },
        recorded,
      ),
    );
  for (const text of granted) {
    const other = agreed.find((entry) => entry.language === text.language);
    if (!other) {
      found.push(language(text, 'left'));
      continue;
    }
    for (const field of TEXT_FIELDS) {
      const left = normalText(text[field]);
      const right = normalText(other[field]);
      if (left !== right)
        found.push(
          raise(
            'R11',
            'critical',
            { kind: 'certificate_text', language: text.language, field },
            side({ kind: 'text', text: left }, decided),
            side({ kind: 'text', text: right }, recorded),
          ),
        );
    }
  }
  for (const text of agreed)
    if (!granted.some((entry) => entry.language === text.language))
      found.push(language(text, 'right'));
  return found;
}

/** R12: the numbers of each agreed address against the declared address. */
function addressNumbersRule(facts: Facts): RuleDiscrepancy[] {
  const application = facts.latest('application');
  const data = facts.latest('certificate_data');
  if (!application || !data) return [];
  const declared = application.value.declaredAddress;
  const declaredNumbers = addressNumbers(declared);
  return data.value.texts.flatMap((text) => {
    const agreedNumbers = addressNumbers(text.address);
    if (agreedNumbers.join(' ') === declaredNumbers.join(' ')) return [];
    return [
      raise(
        'R12',
        'to_clarify',
        { kind: 'address_numbers', language: text.language },
        side(
          { kind: 'numbers', numbers: declaredNumbers },
          facts.source(application),
          declared,
        ),
        side(
          { kind: 'numbers', numbers: agreedNumbers },
          facts.source(data),
          text.address,
        ),
      ),
    ];
  });
}

type AttachmentUse = { attachmentId: string; source: DiscrepancySource };

/** Every exact Document Version a current record relies on. */
function attachmentUses(facts: Facts): AttachmentUse[] {
  const uses: AttachmentUse[] = [];
  const latest = new Map<StepName, CertificationStepVersion>();
  for (const version of facts.snapshot.steps) latest.set(version.step, version);
  for (const version of latest.values())
    for (const attachmentId of stepAttachments(version))
      uses.push({
        attachmentId,
        source: {
          kind: 'step',
          step: version.step,
          version: version.version,
          versionId: version.id,
          attachment: facts.reference(attachmentId),
        },
      });
  for (const finding of facts.snapshot.findings) {
    const current = new Map<FindingRecordView['kind'], FindingRecordView>();
    for (const record of finding.records) current.set(record.kind, record);
    for (const record of current.values())
      for (const attachmentId of findingAttachments(record))
        uses.push({
          attachmentId,
          source: {
            kind: 'finding',
            findingId: finding.id,
            sequence: finding.sequence,
            record: record.kind,
            version: record.version,
            attachment: facts.reference(attachmentId),
          },
        });
  }
  const certificate = facts.snapshot.certificate;
  if (certificate)
    uses.push({
      attachmentId: certificate.attachmentId,
      source: {
        kind: 'certificate',
        number: certificate.number,
        attachment: facts.reference(certificate.attachmentId),
      },
    });
  return uses;
}

/** R14: a record on an older Version while a later one lies unused. */
function laterDocumentVersions(facts: Facts): RuleDiscrepancy[] {
  const uses = attachmentUses(facts);
  const used = new Set(uses.map((use) => use.attachmentId));
  const relied = new Map<string, { number: number; use: AttachmentUse }>();
  for (const use of uses) {
    const attachment = facts.attachments.get(use.attachmentId);
    if (!attachment) continue;
    const current = relied.get(attachment.documentId);
    if (!current || attachment.versionNumber > current.number)
      relied.set(attachment.documentId, {
        number: attachment.versionNumber,
        use,
      });
  }
  const found: RuleDiscrepancy[] = [];
  for (const [documentId, { number, use }] of relied) {
    let later: CertificationAttachment | undefined;
    for (const attachment of facts.snapshot.attachments)
      if (
        attachment.documentId === documentId &&
        attachment.versionNumber > number &&
        !used.has(attachment.id) &&
        (!later || attachment.versionNumber > later.versionNumber)
      )
        later = attachment;
    if (later)
      found.push(
        raise(
          'R14',
          'to_clarify',
          { kind: 'document_version', documentId },
          side({ kind: 'version', version: number }, use.source),
          side(
            { kind: 'version', version: later.versionNumber },
            { kind: 'attachment', attachment: attachmentReference(later) },
          ),
        ),
      );
  }
  return found;
}

/** The attachment a step version's value names first, shown as its source. */
function primaryAttachment(version: CertificationStepVersion): string | null {
  switch (version.step) {
    case 'agreement':
      return version.value.attachmentId;
    case 'stage_1_plan':
    case 'stage_2_plan':
      return version.value.planAttachmentId;
    case 'stage_1_report':
    case 'stage_2_report':
      return version.value.reportAttachmentId;
    case 'decision':
      return version.value.decisionFormAttachmentId;
    case 'certificate_data':
      return version.value.agreementAttachmentId;
    case 'application':
    case 'application_review':
    case 'duration':
    case 'team':
    case 'team_decision':
    case 'recommendation':
    case 'dossier_review':
      return null;
  }
  return unexpected(version);
}

/** Every attachment a step version's value relies on. */
function stepAttachments(version: CertificationStepVersion): string[] {
  const forms = (...acts: ({ formAttachmentId: string | null } | null)[]) =>
    acts.flatMap((act) =>
      act?.formAttachmentId ? [act.formAttachmentId] : [],
    );
  const ids = (...values: (string | null)[]) =>
    values.filter((value): value is string => value !== null);
  switch (version.step) {
    case 'application':
    case 'recommendation':
      return [];
    case 'application_review':
    case 'duration':
    case 'team_decision':
      return forms(version.value.onBehalf);
    case 'agreement':
      return [version.value.attachmentId];
    case 'team':
      return version.value.impartialityAnalysis?.evidenceAttachmentIds ?? [];
    case 'stage_1_plan':
    case 'stage_2_plan':
      return [version.value.planAttachmentId];
    case 'stage_1_report':
      return [
        ...ids(
          version.value.reportAttachmentId,
          version.value.participantListAttachmentId,
        ),
        ...forms(version.value.certificationBodyApproval),
      ];
    case 'stage_2_report':
      return [
        ...ids(
          version.value.reportAttachmentId,
          version.value.participantListAttachmentId,
          version.value.annexAttachmentId,
        ),
        ...forms(version.value.certificationBodyApproval),
      ];
    case 'dossier_review':
      return forms(version.value.reviewedBy, version.value.approvedBy);
    case 'decision':
      return ids(version.value.decisionFormAttachmentId);
    case 'certificate_data':
      return [version.value.agreementAttachmentId];
  }
  return unexpected(version);
}

function findingAttachments(record: FindingRecordView): string[] {
  switch (record.kind) {
    case 'statement':
    case 'response':
    case 'verification':
      return record.value.evidenceAttachmentIds;
    case 'classification':
    case 'plan_judgment':
      return [];
  }
  return unexpected(record);
}

function attachmentReference(
  attachment: CertificationAttachment,
): AttachmentReference {
  return {
    attachmentId: attachment.id,
    documentId: attachment.documentId,
    versionId: attachment.versionId,
    versionNumber: attachment.versionNumber,
    sourceTitle: attachment.sourceTitle,
    role: attachment.role,
  };
}

type Occurrence = {
  discrepancy: RuleDiscrepancy;
  start: number;
  end: number | null;
};

/** The check over every recorded revision: when each Discrepancy appeared and ended. */
function replay(input: ConsistencyInput): Occurrence[] {
  const revisions = new Set<number>();
  for (const version of input.steps) revisions.add(version.caseRevision);
  for (const attachment of input.attachments)
    revisions.add(attachment.caseRevision);
  for (const finding of input.findings)
    for (const record of finding.records) revisions.add(record.caseRevision);
  if (input.certificate) revisions.add(input.certificate.caseRevision);
  const occurrences: Occurrence[] = [];
  const current = new Map<string, Occurrence>();
  for (const revision of [...revisions].sort((left, right) => left - right)) {
    if (revision > input.revision) break;
    const seen = new Set<string>();
    for (const discrepancy of checkConsistency(asOf(input, revision))) {
      const id = discrepancyId(
        discrepancy.rule,
        discrepancy.subject,
        discrepancy.left.value,
        discrepancy.right.value,
      );
      seen.add(id);
      const occurrence = current.get(id);
      if (occurrence) occurrence.discrepancy = discrepancy;
      else {
        const opened = { discrepancy, start: revision, end: null };
        current.set(id, opened);
        occurrences.push(opened);
      }
    }
    for (const [id, occurrence] of current)
      if (!seen.has(id)) {
        occurrence.end = revision;
        current.delete(id);
      }
  }
  return occurrences;
}

function asOf(
  input: ConsistencySnapshot,
  revision: number,
): ConsistencySnapshot {
  return {
    steps: input.steps.filter((version) => version.caseRevision <= revision),
    attachments: input.attachments.filter(
      (attachment) => attachment.caseRevision <= revision,
    ),
    findings: input.findings.map((finding) => ({
      ...finding,
      records: finding.records.filter(
        (record) => record.caseRevision <= revision,
      ),
    })),
    certificate:
      input.certificate && input.certificate.caseRevision <= revision
        ? input.certificate
        : null,
  };
}

type RevisionCause = {
  mark: RevisionMark;
  reason: string | null;
  source: DiscrepancySource | null;
};

/** What each recorded revision of the Case was, for a Discrepancy's history. */
function revisionMarks(input: ConsistencyInput): Map<number, RevisionCause> {
  const facts = new Facts(input);
  const marks = new Map<number, RevisionCause>();
  for (const version of input.steps)
    marks.set(version.caseRevision, {
      mark: { by: version.recordedBy, at: version.recordedAt },
      reason: version.reason,
      source: facts.source(version),
    });
  for (const attachment of input.attachments)
    marks.set(attachment.caseRevision, {
      mark: { by: attachment.attachedBy, at: attachment.attachedAt },
      reason: null,
      source: {
        kind: 'attachment',
        attachment: attachmentReference(attachment),
      },
    });
  for (const finding of input.findings)
    for (const record of finding.records)
      marks.set(record.caseRevision, {
        mark: { by: record.recordedBy, at: record.recordedAt },
        reason: record.reason,
        source: {
          kind: 'finding',
          findingId: finding.id,
          sequence: finding.sequence,
          record: record.kind,
          version: record.version,
          attachment: null,
        },
      });
  if (input.certificate)
    marks.set(input.certificate.caseRevision, {
      mark: {
        by: input.certificate.recordedBy,
        at: input.certificate.recordedAt,
      },
      reason: null,
      source: {
        kind: 'certificate',
        number: input.certificate.number,
        attachment: facts.reference(input.certificate.attachmentId),
      },
    });
  return marks;
}

function manualSide(
  stated: ManualStatedValue,
  input: ConsistencySnapshot,
): DiscrepancySide {
  const attachment = input.attachments.find(
    (entry) => entry.id === stated.attachmentId,
  );
  return {
    value: { kind: 'text', text: stated.value },
    detail: stated.location,
    source: attachment
      ? { kind: 'attachment', attachment: attachmentReference(attachment) }
      : null,
  };
}

function correctingSource(
  reference: CorrectingReference | null,
  input: ConsistencySnapshot,
): DiscrepancySource | null {
  if (!reference) return null;
  const facts = new Facts(input);
  if (reference.kind === 'attachment') {
    const attachment = facts.attachments.get(reference.attachmentId);
    return attachment
      ? { kind: 'attachment', attachment: attachmentReference(attachment) }
      : null;
  }
  const version = input.steps.find((entry) => entry.id === reference.versionId);
  return version ? facts.source(version) : null;
}

/** The next gate an open critical or error Discrepancy holds, if any. */
function blockOf(
  verdict: DiscrepancyVerdict,
  input: ConsistencyInput,
): DiscrepancyBlock | null {
  if (verdict === 'to_clarify' || input.status !== 'open') return null;
  const decision = new Facts(input).latest('decision');
  if (!decision) return 'decision';
  return decision.value.decision === 'granted' && input.certificate === null
    ? 'certificate'
    : null;
}

function daysBetween(start: string, end: string): number {
  return Math.round(
    (Date.parse(`${end}T00:00:00.000Z`) -
      Date.parse(`${start}T00:00:00.000Z`)) /
      86_400_000,
  );
}

/** JSON with object keys in a fixed order, so equal values hash equally. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object')
    return `{${Object.entries(value)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonical(entry)}`)
      .join(',')}}`;
  return JSON.stringify(value);
}

function unexpected(value: never): never {
  throw new Error(`Unexpected consistency value ${String(value)}`);
}
