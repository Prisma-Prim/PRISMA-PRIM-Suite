import { BadRequestException } from '@nestjs/common';
import type { ActAttribution } from './certification-attribution.js';
import type { FindingRecordView } from './certification-findings.js';
import type { AuditStage } from './certification-stages.js';
import {
  REGISTER_LABELS,
  REGISTER_LANGUAGES,
  standardLabel,
  type RegisterLabels,
  type RegisterLanguage,
} from './certification-register.labels.js';
import type {
  CertificateRecord,
  CertificationAttachment,
  CertificationCaseSummary,
  CertificationStepVersion,
} from './certification.types.js';

/** One recorded version of the Case, in the order the Case recorded it. */
export type CertificationRegisterEntry =
  | { kind: 'step'; version: CertificationStepVersion }
  | {
      /** A stored step this release does not know; shown, never interpreted. */
      kind: 'unrecognized_step';
      code: string;
      version: number;
      reason: string | null;
      recordedBy: { displayName: string };
      recordedAt: string;
    }
  | {
      kind: 'finding_record';
      stage: AuditStage;
      sequence: number;
      record: FindingRecordView;
    }
  | { kind: 'certificate'; certificate: CertificateRecord };

/** Everything the register prints, read at one Case revision. */
export interface CertificationRegisterSource {
  caseId: string;
  orderReference: string;
  status: CertificationCaseSummary['status'];
  standard: CertificationCaseSummary['standard'];
  auditType: CertificationCaseSummary['auditType'];
  clientLegalName: string;
  revision: number;
  openedAt: string;
  /** When the Case reached this revision: its latest event. */
  revisedAt: string;
  entries: CertificationRegisterEntry[];
  documents: CertificationAttachment[];
}

export interface RegisterField {
  label: string;
  value: string;
}

export type RegisterBlock =
  | { kind: 'section'; text: string }
  | { kind: 'entry'; title: string | null; fields: RegisterField[] }
  | { kind: 'paragraph'; text: string }
  | {
      kind: 'table';
      columns: readonly [string, string, string, string];
      rows: (readonly [string, string, string, string])[];
    };

/** The laid-out content of one register; deterministic for its source. */
export interface RegisterDocument {
  language: RegisterLanguage;
  title: string;
  notice: string;
  page: string;
  /** Document metadata: identity and the instant the revision was reached. */
  subject: string;
  date: Date;
  blocks: RegisterBlock[];
}

/** The only query the register accepts: an optional closed language. */
export function registerLanguage(query: unknown): RegisterLanguage {
  if (!query || typeof query !== 'object' || Array.isArray(query))
    return invalidQuery();
  const entries = Object.entries(query);
  if (entries.length === 0) return 'en';
  const [entry] = entries;
  if (entries.length !== 1 || !entry || entry[0] !== 'language')
    return invalidQuery();
  const language = REGISTER_LANGUAGES.find((value) => value === entry[1]);
  return language ?? invalidQuery();
}

function invalidQuery(): never {
  throw new BadRequestException({
    code: 'CERTIFICATION_REGISTER_QUERY_INVALID',
    message: 'The register accepts only language=en, fr, ro or ru.',
  });
}

/** Projects the Case source into labelled register blocks in one language. */
export function certificationRegister(
  source: CertificationRegisterSource,
  language: RegisterLanguage,
): RegisterDocument {
  const labels = REGISTER_LABELS[language];
  const f = labels.fields;
  const blocks: RegisterBlock[] = [
    { kind: 'section', text: labels.sections.case },
    {
      kind: 'entry',
      title: null,
      fields: [
        { label: f.caseId, value: source.caseId },
        { label: f.orderReference, value: source.orderReference },
        { label: f.clientLegalEntity, value: source.clientLegalName },
        { label: f.standard, value: standardLabel(source.standard) },
        {
          label: f.auditType,
          value: labels.values.auditType[source.auditType],
        },
        { label: f.status, value: labels.values.status[source.status] },
        { label: f.revision, value: String(source.revision) },
        { label: f.openedAt, value: utc(source.openedAt) },
        { label: f.revisedAt, value: utc(source.revisedAt) },
      ],
    },
    { kind: 'section', text: labels.sections.history },
    ...source.entries.map((entry) => entryBlock(entry, labels)),
    { kind: 'section', text: labels.sections.documents },
  ];
  if (source.documents.length === 0)
    blocks.push({ kind: 'paragraph', text: labels.noDocuments });
  else
    blocks.push({
      kind: 'table',
      columns: [
        labels.columns.role,
        labels.columns.document,
        labels.columns.versionId,
        labels.columns.sha256,
      ],
      rows: source.documents.map(
        (document): readonly [string, string, string, string] => [
          labels.values.documentRole[document.role],
          `${document.sourceTitle}\n${document.fileName}`,
          document.versionId,
          document.sha256,
        ],
      ),
    });
  return {
    language,
    title: labels.title,
    notice: labels.notice,
    page: labels.page,
    subject: `${f.caseId}: ${source.caseId}; ${f.revision}: ${source.revision}`,
    date: new Date(source.revisedAt),
    blocks,
  };
}

function entryBlock(
  entry: CertificationRegisterEntry,
  labels: RegisterLabels,
): RegisterBlock {
  const f = labels.fields;
  switch (entry.kind) {
    case 'step': {
      const step = entry.version;
      return {
        kind: 'entry',
        title: `${labels.steps[step.step]} — ${labels.version} ${step.version}`,
        fields: [...recording(step, labels), ...stepSummary(step, labels)],
      };
    }
    case 'unrecognized_step':
      return {
        kind: 'entry',
        title: `${labels.unrecognizedStep} ${entry.code} — ${labels.version} ${entry.version}`,
        fields: recording(entry, labels),
      };
    case 'finding_record': {
      const record = entry.record;
      return {
        kind: 'entry',
        title: `${labels.finding} ${entry.sequence} (${labels.values.stage[entry.stage]}) — ${labels.findingRecords[record.kind]} — ${labels.version} ${record.version}`,
        fields: [
          ...recording(record, labels),
          ...findingSummary(record, labels),
        ],
      };
    }
    case 'certificate': {
      const certificate = entry.certificate;
      return {
        kind: 'entry',
        title: labels.certificate,
        fields: [
          { label: f.recordedAt, value: utc(certificate.recordedAt) },
          { label: f.recordedBy, value: certificate.recordedBy.displayName },
          { label: f.certificateNumber, value: certificate.number },
          {
            label: f.validity,
            value: `${certificate.validFrom} – ${certificate.validUntil}`,
          },
          {
            label: f.languages,
            value: certificate.texts.map((text) => text.language).join(', '),
          },
        ],
      };
    }
  }
  return unexpected(entry);
}

/** When, by whom and why a version was recorded. */
function recording(
  entry: {
    reason: string | null;
    recordedAt: string;
    recordedBy: { displayName: string };
  },
  labels: RegisterLabels,
): RegisterField[] {
  const f = labels.fields;
  return [
    { label: f.recordedAt, value: utc(entry.recordedAt) },
    { label: f.recordedBy, value: entry.recordedBy.displayName },
    ...optional(f.reason, entry.reason),
  ];
}

/** A short closed summary of each step's business content. */
function stepSummary(
  step: CertificationStepVersion,
  labels: RegisterLabels,
): RegisterField[] {
  const f = labels.fields;
  const v = labels.values;
  switch (step.step) {
    case 'application':
      return [
        ...optional(f.submittedOn, step.value.submittedOn),
        { label: f.declaredLegalName, value: step.value.declaredLegalName },
        {
          label: f.foodChainCategories,
          value: step.value.foodChainSubcategories.join(', '),
        },
        { label: f.effectiveFte, value: String(step.value.effectiveFte) },
        { label: f.haccpStudies, value: String(step.value.haccpStudyCount) },
      ];
    case 'application_review':
      return [
        { label: f.outcome, value: v.reviewOutcome[step.value.outcome] },
        ...optional(f.rejectionReason, step.value.rejectionReason),
        ...onBehalf(f.onBehalf, step.value.onBehalf),
      ];
    case 'duration':
      return [
        {
          label: f.initialAuditDays,
          value: step.value.confirmed.initialOnSite,
        },
        { label: f.stage1Days, value: step.value.confirmed.stage1OnSite },
        { label: f.stage2Days, value: step.value.confirmed.stage2OnSite },
        { label: f.ruleVersion, value: step.value.ruleVersion },
        ...onBehalf(f.onBehalf, step.value.onBehalf),
      ];
    case 'agreement':
      return [{ label: f.signedOn, value: step.value.signedOn }];
    case 'team':
      return [
        {
          label: f.members,
          value: step.value.members
            .map((member) => `${member.name} (${v.teamRole[member.role]})`)
            .join('; '),
        },
      ];
    case 'team_decision':
      return [
        { label: f.decision, value: v.teamDecision[step.value.decision] },
        { label: f.teamVersion, value: String(step.value.teamVersion) },
        ...optional(f.returnReason, step.value.reason),
        ...onBehalf(f.onBehalf, step.value.onBehalf),
      ];
    case 'stage_1_plan':
    case 'stage_2_plan':
      return [
        {
          label: f.dates,
          value: `${step.value.startDate} – ${step.value.endDate}`,
        },
        { label: f.onSiteDays, value: step.value.onSiteDays },
      ];
    case 'stage_1_report':
      return [
        { label: f.reportDate, value: step.value.reportDate },
        {
          label: f.conclusion,
          value: v.stage1Conclusion[step.value.conclusion],
        },
        ...onBehalf(f.onBehalf, step.value.certificationBodyApproval),
      ];
    case 'stage_2_report':
      return [
        { label: f.reportDate, value: step.value.reportDate },
        ...onBehalf(f.onBehalf, step.value.certificationBodyApproval),
      ];
    case 'recommendation':
      return [
        {
          label: f.recommendation,
          value: v.recommendation[step.value.recommendation],
        },
        ...optional(f.recommendedOn, step.value.recommendedOn),
      ];
    case 'dossier_review':
      return [
        { label: f.conclusion, value: step.value.conclusion },
        ...onBehalf(f.reviewedBy, step.value.reviewedBy),
        ...onBehalf(f.approvedBy, step.value.approvedBy),
      ];
    case 'decision':
      return [
        { label: f.decision, value: v.decision[step.value.decision] },
        { label: f.decidedOn, value: step.value.decidedOn },
        {
          label: f.decidedBy,
          value:
            step.value.decidedByFunction === null
              ? step.value.decidedBy
              : `${step.value.decidedBy}, ${step.value.decidedByFunction}`,
        },
      ];
    case 'certificate_data':
      return [
        { label: f.agreedOn, value: step.value.agreedOn },
        {
          label: f.languages,
          value: step.value.texts.map((text) => text.language).join(', '),
        },
      ];
  }
  return unexpected(step);
}

function findingSummary(
  record: FindingRecordView,
  labels: RegisterLabels,
): RegisterField[] {
  const f = labels.fields;
  const v = labels.values;
  switch (record.kind) {
    case 'statement':
      return [
        ...optional(f.clause, record.value.clause),
        ...optional(f.area, record.value.area),
      ];
    case 'classification':
      return [
        {
          label: f.classification,
          value: v.classification[record.value.classification],
        },
      ];
    case 'response':
      return [{ label: f.receivedOn, value: record.value.receivedOn }];
    case 'plan_judgment':
      return [
        { label: f.outcome, value: v.planJudgment[record.value.outcome] },
      ];
    case 'verification':
      return [
        { label: f.verifiedOn, value: record.value.verifiedOn },
        { label: f.outcome, value: v.verification[record.value.outcome] },
      ];
  }
  return unexpected(record);
}

function optional(label: string, value: string | null): RegisterField[] {
  return value === null ? [] : [{ label, value }];
}

function onBehalf(label: string, act: ActAttribution | null): RegisterField[] {
  return act === null
    ? []
    : [
        {
          label,
          value: `${act.actedBy}, ${act.actedByFunction}, ${act.actedOn}`,
        },
      ];
}

/** An ISO instant as a language-independent UTC timestamp. */
function utc(instant: string): string {
  const iso = new Date(instant).toISOString();
  return `${iso.slice(0, 10)} ${iso.slice(11, 19)} UTC`;
}

function unexpected(value: never): never {
  throw new Error(`Unexpected register entry ${String(value)}`);
}
