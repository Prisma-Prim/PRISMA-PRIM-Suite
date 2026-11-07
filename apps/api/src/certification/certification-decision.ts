import { BadRequestException } from '@nestjs/common';
import { requireUuid } from '../access/access-command-validation.js';
import { addDays, addMonths } from './certification-findings.js';
import { calendarDate, inputObject } from './certification.validation.js';

export interface Recommendation {
  recommendation: 'grant' | 'do_not_grant' | 'additional_audit';
  basis: string;
}

/** The dossier items an approver checks, in display order. */
export const DOSSIER_ITEMS = [
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
export type DossierItem = (typeof DOSSIER_ITEMS)[number];

export interface DossierAnswer {
  answer: 'present' | 'missing' | 'not_applicable';
  note: string | null;
}

export interface DossierReview {
  items: Record<DossierItem, DossierAnswer>;
  conclusion: string;
}

export interface CertificationDecision {
  decision: 'granted' | 'refused';
  decidedOn: string;
  /** The certification body's decision maker, when recorded on their behalf. */
  decidedBy: string;
  decisionFormAttachmentId: string | null;
  rationale: string;
  additionalInformation: string | null;
}

export interface CertificateScopeText {
  language: string;
  text: string;
}

export interface CertificateData {
  holderName: string;
  address: string;
  scope: CertificateScopeText[];
  agreedOn: string;
  agreementAttachmentId: string;
}

export function recommendation(value: unknown): Recommendation {
  const body = inputObject(value, ['recommendation', 'basis']);
  if (
    body.recommendation !== 'grant' &&
    body.recommendation !== 'do_not_grant' &&
    body.recommendation !== 'additional_audit'
  )
    return invalid();
  return { recommendation: body.recommendation, basis: text(body.basis, 4000) };
}

/** Every item answered explicitly; a missing item needs a note. */
export function dossierReview(value: unknown): DossierReview {
  const body = inputObject(value, ['items', 'conclusion']);
  const itemsBody = inputObject(body.items, DOSSIER_ITEMS);
  const entries = DOSSIER_ITEMS.map((item): [DossierItem, DossierAnswer] => {
    const entry = inputObject(itemsBody[item], ['answer', 'note']);
    if (
      entry.answer !== 'present' &&
      entry.answer !== 'missing' &&
      entry.answer !== 'not_applicable'
    )
      return invalid();
    const note =
      entry.note === undefined || entry.note === null
        ? null
        : text(entry.note, 1000);
    if (entry.answer === 'missing' && note === null) return invalid();
    return [item, { answer: entry.answer, note }];
  });
  return {
    items: {
      application: answerOf(entries, 'application'),
      application_review: answerOf(entries, 'application_review'),
      duration: answerOf(entries, 'duration'),
      agreement: answerOf(entries, 'agreement'),
      team_approval: answerOf(entries, 'team_approval'),
      stage_1_plan: answerOf(entries, 'stage_1_plan'),
      stage_1_report: answerOf(entries, 'stage_1_report'),
      stage_2_plan: answerOf(entries, 'stage_2_plan'),
      stage_2_report: answerOf(entries, 'stage_2_report'),
      participant_lists: answerOf(entries, 'participant_lists'),
      findings_follow_up: answerOf(entries, 'findings_follow_up'),
      recommendation: answerOf(entries, 'recommendation'),
      certificate_data: answerOf(entries, 'certificate_data'),
    },
    conclusion: text(body.conclusion, 4000),
  };
}

export function dossierComplete(review: DossierReview): boolean {
  return DOSSIER_ITEMS.every((item) => review.items[item].answer !== 'missing');
}

export function certificationDecision(value: unknown): CertificationDecision {
  const body = inputObject(value, [
    'decision',
    'decidedOn',
    'decidedBy',
    'decisionFormAttachmentId',
    'rationale',
    'additionalInformation',
  ]);
  if (body.decision !== 'granted' && body.decision !== 'refused')
    return invalid();
  return {
    decision: body.decision,
    decidedOn: date(body.decidedOn),
    decidedBy: text(body.decidedBy, 200),
    decisionFormAttachmentId:
      body.decisionFormAttachmentId === undefined ||
      body.decisionFormAttachmentId === null
        ? null
        : requireUuid(body.decisionFormAttachmentId),
    rationale: text(body.rationale, 4000),
    additionalInformation:
      body.additionalInformation === undefined ||
      body.additionalInformation === null
        ? null
        : text(body.additionalInformation, 4000),
  };
}

export function certificateData(value: unknown): CertificateData {
  const body = inputObject(value, [
    'holderName',
    'address',
    'scope',
    'agreedOn',
    'agreementAttachmentId',
  ]);
  const scope = certificateScope(body.scope);
  return {
    holderName: text(body.holderName, 300),
    address: text(body.address, 500),
    scope,
    agreedOn: date(body.agreedOn),
    agreementAttachmentId: requireUuid(body.agreementAttachmentId),
  };
}

/** One to four scope texts, at most one per Certificate language. */
export function certificateScope(value: unknown): CertificateScopeText[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 4)
    return invalid();
  const scope = value.map((entry) => {
    const scopeBody = inputObject(entry, ['language', 'text']);
    return {
      language: text(scopeBody.language, 10),
      text: text(scopeBody.text, 2000),
    };
  });
  if (new Set(scope.map((entry) => entry.language)).size !== scope.length)
    return invalid();
  return scope;
}

export function certificateCommand(value: unknown): {
  expectedRevision: number;
  number: string;
  attachmentId: string;
} {
  const body = inputObject(value, [
    'expectedRevision',
    'number',
    'attachmentId',
  ]);
  if (
    typeof body.expectedRevision !== 'number' ||
    !Number.isSafeInteger(body.expectedRevision) ||
    body.expectedRevision < 1
  )
    return invalid();
  return {
    expectedRevision: body.expectedRevision,
    number: text(body.number, 64).trim(),
    attachmentId: requireUuid(body.attachmentId),
  };
}

/** Initial validity: the decision date to three years minus one day later. */
export function certificateValidity(decidedOn: string): {
  validFrom: string;
  validUntil: string;
  firstSurveillanceBy: string;
} {
  return {
    validFrom: decidedOn,
    validUntil: addDays(addMonths(decidedOn, 36), -1),
    firstSurveillanceBy: addMonths(decidedOn, 12),
  };
}

function answerOf(
  entries: readonly [DossierItem, DossierAnswer][],
  item: DossierItem,
): DossierAnswer {
  const entry = entries.find(([key]) => key === item);
  if (!entry) return invalid();
  return entry[1];
}

function date(value: unknown): string {
  if (!calendarDate(value)) return invalid();
  return value;
}

function text(value: unknown, limit: number): string {
  if (typeof value !== 'string' || !value.trim() || value.length > limit)
    return invalid();
  return value;
}

function invalid(): never {
  throw new BadRequestException({
    code: 'INVALID_CERTIFICATION_INPUT',
    message: 'Invalid certification input.',
  });
}
