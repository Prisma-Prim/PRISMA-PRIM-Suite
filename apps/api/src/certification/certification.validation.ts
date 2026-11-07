import { BadRequestException } from '@nestjs/common';
import { requireUuid } from '../access/access-command-validation.js';
import {
  FOOD_CHAIN_SUBCATEGORIES,
  REVIEW_CRITERIA,
  type ApplicationFacts,
  type ApplicationReview,
  type FoodChainSubcategory,
  type ReviewAnswer,
  type ReviewCriterion,
} from './certification.types.js';

const MAX_REVISION = 2147483646;

export function openCommand(value: unknown): {
  clientLegalEntityId: string;
  orderReference: string;
} {
  const body = inputObject(value, ['clientLegalEntityId', 'orderReference']);
  const orderReference = text(body.orderReference, 64).trim();
  return {
    clientLegalEntityId: requireUuid(body.clientLegalEntityId),
    orderReference,
  };
}

export function applicationCommand(value: unknown): {
  expectedRevision: number;
  reason: string | null;
  facts: ApplicationFacts;
} {
  const body = inputObject(value, ['expectedRevision', 'reason', 'facts']);
  return {
    expectedRevision: revision(body.expectedRevision),
    reason:
      body.reason === undefined || body.reason === null
        ? null
        : text(body.reason, 2000),
    facts: applicationFacts(body.facts),
  };
}

export function reviewCommand(value: unknown): {
  expectedRevision: number;
  review: ApplicationReview;
} {
  const body = inputObject(value, [
    'expectedRevision',
    'criteria',
    'outcome',
    'rejectionReason',
  ]);
  return {
    expectedRevision: revision(body.expectedRevision),
    review: applicationReview({
      criteria: body.criteria,
      outcome: body.outcome,
      rejectionReason: body.rejectionReason,
    }),
  };
}

/** Validates both submitted and persisted application facts. */
export function applicationFacts(value: unknown): ApplicationFacts {
  const body = inputObject(value, [
    'declaredLegalName',
    'declaredAddress',
    'sites',
    'requestedScope',
    'foodChainSubcategories',
    'haccpStudyCount',
    'totalHeadcount',
    'effectiveFte',
    'shiftCount',
    'seasonalActivity',
    'otherCertifiedSystems',
    'outsourcedProcesses',
    'consultant',
    'auditLanguages',
    'preferredAuditPeriod',
  ]);
  const sites = list(body.sites, 1, 20).map((site) => {
    const entry = inputObject(site, ['address', 'activity']);
    return {
      address: text(entry.address, 500),
      activity: text(entry.activity, 500),
    };
  });
  const subcategories = list(body.foodChainSubcategories, 1, 19).map(
    subcategory,
  );
  if (new Set(subcategories).size !== subcategories.length) invalid();
  const consultantBody = inputObject(body.consultant, ['used', 'name']);
  let consultant: ApplicationFacts['consultant'];
  if (consultantBody.used === true)
    consultant = { used: true, name: text(consultantBody.name, 300) };
  else if (
    consultantBody.used === false &&
    (consultantBody.name === undefined || consultantBody.name === null)
  )
    consultant = { used: false };
  else invalid();
  const languages = list(body.auditLanguages, 1, 5).map((language) =>
    text(language, 40),
  );
  return {
    declaredLegalName: text(body.declaredLegalName, 300),
    declaredAddress: text(body.declaredAddress, 500),
    sites,
    requestedScope: text(body.requestedScope, 2000),
    foodChainSubcategories: subcategories,
    haccpStudyCount: integer(body.haccpStudyCount, 1, 999),
    totalHeadcount: integer(body.totalHeadcount, 1, 100000),
    effectiveFte: fte(body.effectiveFte),
    shiftCount: integer(body.shiftCount, 1, 10),
    seasonalActivity: optionalText(body.seasonalActivity, 1000),
    otherCertifiedSystems: optionalText(body.otherCertifiedSystems, 1000),
    outsourcedProcesses: optionalText(body.outsourcedProcesses, 1000),
    consultant,
    auditLanguages: languages,
    preferredAuditPeriod: optionalText(body.preferredAuditPeriod, 200),
  };
}

/** Validates both submitted and persisted reviews; no answer has a default. */
export function applicationReview(value: unknown): ApplicationReview {
  const body = inputObject(value, ['criteria', 'outcome', 'rejectionReason']);
  const criteriaBody = inputObject(body.criteria, REVIEW_CRITERIA);
  const criteria = Object.fromEntries(
    REVIEW_CRITERIA.map((criterion) => [
      criterion,
      answer(criteriaBody[criterion]),
    ]),
  );
  if (!isCriteria(criteria)) return invalid();
  if (body.outcome === 'accepted') {
    if (body.rejectionReason !== undefined && body.rejectionReason !== null)
      invalid();
    if (
      REVIEW_CRITERIA.some((criterion) => criteria[criterion].answer !== 'yes')
    )
      throw new BadRequestException({
        code: 'CERTIFICATION_REVIEW_CRITERIA_NOT_MET',
        message: 'An application is accepted only when every criterion is met.',
      });
    return { criteria, outcome: 'accepted', rejectionReason: null };
  }
  if (body.outcome !== 'rejected') invalid();
  return {
    criteria,
    outcome: 'rejected',
    rejectionReason: text(body.rejectionReason, 2000),
  };
}

function isCriteria(
  value: Record<string, ReviewAnswer>,
): value is Record<ReviewCriterion, ReviewAnswer> {
  return REVIEW_CRITERIA.every((criterion) => criterion in value);
}

function answer(value: unknown): ReviewAnswer {
  const body = inputObject(value, ['answer', 'note']);
  if (body.answer !== 'yes' && body.answer !== 'no') invalid();
  return { answer: body.answer, note: text(body.note, 1000) };
}

function subcategory(value: unknown): FoodChainSubcategory {
  const match = FOOD_CHAIN_SUBCATEGORIES.find((code) => code === value);
  if (!match) return invalid();
  return match;
}

function revision(value: unknown): number {
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value < 1 ||
    value > MAX_REVISION
  )
    invalid();
  return value;
}

function integer(value: unknown, minimum: number, maximum: number): number {
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value < minimum ||
    value > maximum
  )
    invalid();
  return value;
}

/** Effective FTE with at most one decimal, as declared by the applicant. */
function fte(value: unknown): number {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value <= 0 ||
    value > 100000 ||
    Math.abs(Math.round(value * 10) - value * 10) > 1e-9
  )
    invalid();
  return value;
}

function list(value: unknown, minimum: number, maximum: number): unknown[] {
  if (!Array.isArray(value) || value.length < minimum || value.length > maximum)
    invalid();
  return value;
}

function text(value: unknown, limit: number): string {
  if (typeof value !== 'string' || !value.trim() || value.length > limit)
    invalid();
  return value;
}

function optionalText(value: unknown, limit: number): string | null {
  return value === undefined || value === null ? null : text(value, limit);
}

export function inputObject(
  value: unknown,
  fields: readonly string[],
): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid();
  const body = Object.fromEntries(Object.entries(value));
  if (Object.keys(body).some((key) => !fields.includes(key))) invalid();
  return body;
}

function invalid(): never {
  throw new BadRequestException({
    code: 'INVALID_CERTIFICATION_INPUT',
    message: 'Invalid certification input.',
  });
}
