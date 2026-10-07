import { BadRequestException, NotFoundException } from '@nestjs/common';
import type {
  profitabilityEstimateDecisions,
  profitabilityEstimateVersions,
} from '../database/schema/index.js';
import type {
  ProfitabilityDecisionRecord,
  ProfitabilityResults,
  ProfitabilityVersionRecord,
} from './profitability-estimate.types.js';
import { readProfitabilitySubmission } from './profitability-estimate.validation.js';

type ProfitabilityScope = Pick<
  ProfitabilityVersionRecord,
  'workspaceId' | 'companyId' | 'opportunityId'
>;
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const MONEY = /^(0|[1-9][0-9]*)\.[0-9]{2}$/u;
const SIGNED_RESULT = /^-?(0|[1-9][0-9]*)\.[0-9]{2}$/u;
const MAXIMUM_VERSION_NUMBER = 2_147_483_647;
const VERSION_FIELDS = [
  'id',
  'estimateId',
  'workspaceId',
  'companyId',
  'opportunityId',
  'clientRequestId',
  'versionNumber',
  'predecessorVersionId',
  'inputs',
  'results',
  'calculationRule',
  'createdByWorkspaceMembershipId',
  'createdAt',
  'decision',
];

/** Stored input and result bytes are validated, never recalculated. */
export function readProfitabilityVersion(
  version: typeof profitabilityEstimateVersions.$inferSelect,
  decision: typeof profitabilityEstimateDecisions.$inferSelect | null,
): ProfitabilityVersionRecord {
  if (
    decision !== null &&
    (decision.versionId !== version.id ||
      decision.versionNumber !== version.versionNumber ||
      decision.estimateId !== version.estimateId ||
      decision.workspaceId !== version.workspaceId ||
      decision.companyId !== version.companyId ||
      decision.opportunityId !== version.opportunityId ||
      decision.clientRequestId !== version.clientRequestId)
  )
    corrupt();
  return readProfitabilityReceipt({
    id: version.id,
    estimateId: version.estimateId,
    workspaceId: version.workspaceId,
    companyId: version.companyId,
    opportunityId: version.opportunityId,
    clientRequestId: version.clientRequestId,
    versionNumber: version.versionNumber,
    predecessorVersionId: version.predecessorVersionId,
    inputs: version.inputs,
    results: version.results,
    calculationRule: version.calculationRule,
    createdByWorkspaceMembershipId: version.createdByWorkspaceMembershipId,
    createdAt: storedDate(version.createdAt),
    decision:
      decision === null
        ? null
        : {
            id: decision.id,
            code: decision.code,
            decidedByWorkspaceMembershipId:
              decision.decidedByWorkspaceMembershipId,
            decidedAt: storedDate(decision.decidedAt),
          },
  });
}

/** Receipts retain the original authorized historical response on replay. */
export function readProfitabilityReceipt(
  value: unknown,
): ProfitabilityVersionRecord {
  const body = storedObject(value, VERSION_FIELDS);
  const versionNumber = storedVersionNumber(body.versionNumber);
  const predecessorVersionId =
    body.predecessorVersionId === null
      ? null
      : storedId(body.predecessorVersionId);
  if ((versionNumber === 1) !== (predecessorVersionId === null)) corrupt();
  const inputBody = storedObject(body.inputs, [
    'currency',
    'executorType',
    'executorCost',
    'fiscalCost',
    'allocatedOverhead',
    'directCosts',
    'targetProfitability',
    'proposedPrice',
    'pricingIntent',
    'costConfirmation',
  ]);
  const inputs = readStoredInputs(inputBody);
  const rule = storedObject(body.calculationRule, [
    'id',
    'version',
    'monetaryScale',
    'percentageScale',
    'rounding',
  ]);
  if (
    rule.id !== 'CONFIRMED_COST_PROFITABILITY' ||
    rule.version !== 1 ||
    rule.monetaryScale !== 2 ||
    rule.percentageScale !== 2 ||
    rule.rounding !== 'HALF_UP'
  )
    corrupt();
  return {
    id: storedId(body.id),
    estimateId: storedId(body.estimateId),
    workspaceId: storedId(body.workspaceId),
    companyId: storedId(body.companyId),
    opportunityId: storedId(body.opportunityId),
    clientRequestId: storedId(body.clientRequestId),
    versionNumber,
    predecessorVersionId,
    inputs,
    results: readStoredResults(body.results),
    calculationRule: {
      id: rule.id,
      version: rule.version,
      monetaryScale: rule.monetaryScale,
      percentageScale: rule.percentageScale,
      rounding: rule.rounding,
    },
    createdByWorkspaceMembershipId: storedId(
      body.createdByWorkspaceMembershipId,
    ),
    createdAt: storedInstant(body.createdAt),
    decision: readStoredDecision(body.decision),
  };
}

export function readProfitabilityPagination(
  query: unknown,
  scope: ProfitabilityScope,
): {
  limit: number;
  beforeVersionNumber?: number;
} {
  if (typeof query !== 'object' || query === null || Array.isArray(query))
    invalidPage();
  const body = Object.fromEntries(Object.entries(query));
  if (Object.keys(body).some((key) => key !== 'limit' && key !== 'cursor'))
    invalidPage();
  const limit = body.limit === undefined ? 25 : readLimit(body.limit);
  if (body.cursor === undefined) return { limit };
  if (typeof body.cursor !== 'string' || !/^[A-Za-z0-9_-]+$/u.test(body.cursor))
    unavailable();
  let value: unknown;
  try {
    const bytes = Buffer.from(body.cursor, 'base64url');
    if (bytes.toString('base64url') !== body.cursor) unavailable();
    value = JSON.parse(bytes.toString('utf8'));
  } catch {
    unavailable();
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    unavailable();
  const cursor = Object.fromEntries(Object.entries(value));
  if (
    Object.keys(cursor).length !== 4 ||
    cursor.workspaceId !== scope.workspaceId ||
    cursor.companyId !== scope.companyId ||
    cursor.opportunityId !== scope.opportunityId ||
    !isVersionNumber(cursor.beforeVersionNumber)
  )
    unavailable();
  return { limit, beforeVersionNumber: cursor.beforeVersionNumber };
}

export function encodeProfitabilityCursor(
  scope: ProfitabilityScope,
  beforeVersionNumber: number,
): string {
  if (!isVersionNumber(beforeVersionNumber)) corrupt();
  return Buffer.from(
    JSON.stringify({
      workspaceId: storedId(scope.workspaceId),
      companyId: storedId(scope.companyId),
      opportunityId: storedId(scope.opportunityId),
      beforeVersionNumber,
    }),
  ).toString('base64url');
}

function readStoredInputs(value: Record<string, unknown>) {
  try {
    const { expectedLatestVersionNumber, ...inputs } =
      readProfitabilitySubmission({
        ...value,
        expectedLatestVersionNumber: null,
      });
    if (expectedLatestVersionNumber !== null) corrupt();
    return inputs;
  } catch {
    return corrupt();
  }
}
function readStoredResults(value: unknown): ProfitabilityResults {
  const body = storedObject(value, [
    'totalCost',
    'profit',
    'profitabilityPercent',
    'targetDifferencePercentagePoints',
  ]);
  return {
    totalCost: storedDecimal(body.totalCost, MONEY),
    profit: storedDecimal(body.profit, SIGNED_RESULT),
    profitabilityPercent: storedDecimal(
      body.profitabilityPercent,
      SIGNED_RESULT,
    ),
    targetDifferencePercentagePoints: storedDecimal(
      body.targetDifferencePercentagePoints,
      SIGNED_RESULT,
    ),
  };
}
function readStoredDecision(
  value: unknown,
): ProfitabilityDecisionRecord | null {
  if (value === null) return null;
  const body = storedObject(value, [
    'id',
    'code',
    'decidedByWorkspaceMembershipId',
    'decidedAt',
  ]);
  if (
    body.code !== 'APPROVE' &&
    body.code !== 'MODIFY' &&
    body.code !== 'REJECT'
  )
    corrupt();
  return {
    id: storedId(body.id),
    code: body.code,
    decidedByWorkspaceMembershipId: storedId(
      body.decidedByWorkspaceMembershipId,
    ),
    decidedAt: storedInstant(body.decidedAt),
  };
}
function storedObject(
  value: unknown,
  fields: readonly string[],
): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    corrupt();
  const body = Object.fromEntries(Object.entries(value));
  if (
    Object.keys(body).length !== fields.length ||
    fields.some((field) => !Object.hasOwn(body, field))
  )
    corrupt();
  return body;
}
function storedId(value: unknown): string {
  if (typeof value !== 'string' || !UUID.test(value)) corrupt();
  return value;
}
function storedDecimal(value: unknown, grammar: RegExp): string {
  if (typeof value !== 'string' || !grammar.test(value) || value === '-0.00')
    corrupt();
  return value;
}
function storedInstant(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value)
  )
    corrupt();
  const date = new Date(value);
  if (!Number.isFinite(date.getTime()) || date.toISOString() !== value)
    corrupt();
  return value;
}
function storedDate(value: Date): string {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) corrupt();
  return value.toISOString();
}
function isVersionNumber(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 1 &&
    value <= MAXIMUM_VERSION_NUMBER
  );
}
function storedVersionNumber(value: unknown): number {
  if (!isVersionNumber(value)) corrupt();
  return value;
}
function readLimit(value: unknown): number {
  if (typeof value !== 'string' || !/^\d+$/u.test(value)) invalidPage();
  const limit = Number(value);
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) invalidPage();
  return limit;
}
function invalidPage(): never {
  throw new BadRequestException({
    code: 'INVALID_PAGE',
    message: 'Reload profitability history and try again.',
  });
}
function unavailable(): never {
  throw new NotFoundException();
}
function corrupt(): never {
  throw new Error('Stored profitability record is invalid.');
}
