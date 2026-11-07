import { BadRequestException } from '@nestjs/common';
import { requireUuid } from '../access/access-command-validation.js';
import { addDays, addMonths } from './certification-findings.js';
import {
  optionalAttribution,
  type ActAttribution,
} from './certification-attribution.js';
import { calendarDate, inputObject } from './certification.validation.js';

export interface Recommendation {
  recommendation: 'grant' | 'do_not_grant' | 'additional_audit';
  basis: string;
  recommendedOn: string | null;
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
  /** The certification body's dossier reviewer and approver, when recorded on their behalf. */
  reviewedBy: ActAttribution | null;
  approvedBy: ActAttribution | null;
  /** False only in reviews recorded before the attestation existed. */
  independenceAttested: boolean;
}

export type CertificationDecision = {
  decidedOn: string;
  /** The certification body's decision maker, when recorded on their behalf. */
  decidedBy: string;
  decidedByFunction: string | null;
  decisionFormAttachmentId: string | null;
  /** The recording member attests the decider is not on the audit team. */
  independenceAttested: true;
  rationale: string;
  additionalInformation: string | null;
} & (
  | { decision: 'granted'; grantedTexts: CertificateText[] }
  | { decision: 'refused'; grantedTexts: null }
);

/** What one Certificate language states: holder, address and scope. */
export interface CertificateText {
  language: string;
  holderName: string;
  address: string;
  scope: string;
}

export interface CertificateData {
  texts: CertificateText[];
  agreedOn: string;
  agreementAttachmentId: string;
}

export function recommendation(value: unknown): Recommendation {
  const body = inputObject(value, ['recommendation', 'basis', 'recommendedOn']);
  if (
    body.recommendation !== 'grant' &&
    body.recommendation !== 'do_not_grant' &&
    body.recommendation !== 'additional_audit'
  )
    return invalid();
  return {
    recommendation: body.recommendation,
    basis: text(body.basis, 4000),
    recommendedOn:
      body.recommendedOn === undefined || body.recommendedOn === null
        ? null
        : date(body.recommendedOn),
  };
}

/** Every item answered explicitly; a missing item needs a note. */
export function dossierReview(value: unknown): DossierReview {
  const body = inputObject(value, [
    'items',
    'conclusion',
    'reviewedBy',
    'approvedBy',
    'independenceAttested',
  ]);
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
    reviewedBy: optionalAttribution(body.reviewedBy),
    approvedBy: optionalAttribution(body.approvedBy),
    independenceAttested: body.independenceAttested === true,
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
    'decidedByFunction',
    'decisionFormAttachmentId',
    'independenceAttested',
    'grantedTexts',
    'rationale',
    'additionalInformation',
  ]);
  if (body.independenceAttested !== true)
    throw new BadRequestException({
      code: 'CERTIFICATION_INDEPENDENCE_ATTESTATION',
      message:
        'Attest that the decision maker is not a member of the audit team.',
    });
  let outcome:
    | { decision: 'granted'; grantedTexts: CertificateText[] }
    | { decision: 'refused'; grantedTexts: null };
  if (body.decision === 'granted')
    outcome = {
      decision: 'granted',
      grantedTexts: certificateTexts(body.grantedTexts),
    };
  else if (
    body.decision === 'refused' &&
    (body.grantedTexts === undefined || body.grantedTexts === null)
  )
    outcome = { decision: 'refused', grantedTexts: null };
  else return invalid();
  return {
    ...outcome,
    independenceAttested: true,
    decidedOn: date(body.decidedOn),
    decidedBy: text(body.decidedBy, 200),
    decidedByFunction:
      body.decidedByFunction === undefined || body.decidedByFunction === null
        ? null
        : text(body.decidedByFunction, 200),
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
    'texts',
    'agreedOn',
    'agreementAttachmentId',
  ]);
  return {
    texts: certificateTexts(body.texts),
    agreedOn: date(body.agreedOn),
    agreementAttachmentId: requireUuid(body.agreementAttachmentId),
  };
}

/** One to four Certificate texts, at most one per language. */
export function certificateTexts(value: unknown): CertificateText[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 4)
    return invalid();
  const texts = value.map((entry) => {
    const body = inputObject(entry, [
      'language',
      'holderName',
      'address',
      'scope',
    ]);
    return {
      language: text(body.language, 10).trim(),
      holderName: text(body.holderName, 300),
      address: text(body.address, 500),
      scope: text(body.scope, 2000),
    };
  });
  if (new Set(texts.map((entry) => entry.language)).size !== texts.length)
    return invalid();
  return texts;
}

/** Whether two sets of Certificate texts state the same, language by language. */
export function sameCertificateTexts(
  left: readonly CertificateText[],
  right: readonly CertificateText[],
): boolean {
  const normal = (value: string) => value.replace(/\s+/gu, ' ').trim();
  return (
    left.length === right.length &&
    left.every((entry) => {
      const other = right.find(
        (candidate) => candidate.language === entry.language,
      );
      return (
        other !== undefined &&
        normal(other.holderName) === normal(entry.holderName) &&
        normal(other.address) === normal(entry.address) &&
        normal(other.scope) === normal(entry.scope)
      );
    })
  );
}

export function certificateCommand(value: unknown): {
  expectedRevision: number;
  number: string;
  attachmentId: string;
  signedBy: string | null;
  signedByFunction: string | null;
} {
  const body = inputObject(value, [
    'expectedRevision',
    'number',
    'attachmentId',
    'signedBy',
    'signedByFunction',
    'independenceAttested',
  ]);
  if (body.independenceAttested !== true)
    throw new BadRequestException({
      code: 'CERTIFICATION_INDEPENDENCE_ATTESTATION',
      message: 'Attest that the signatory is not a member of the audit team.',
    });
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
    signedBy:
      body.signedBy === undefined || body.signedBy === null
        ? null
        : text(body.signedBy, 200),
    signedByFunction:
      body.signedByFunction === undefined || body.signedByFunction === null
        ? null
        : text(body.signedByFunction, 200),
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
