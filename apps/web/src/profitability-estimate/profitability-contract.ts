import type { ActorContext } from '../access-types';
import type { InterfaceLocale } from '../localization/interface-locale';

export const executorTypes = [
  'PATENT_CONSULTANT',
  'CIVIL_CONTRACT_FREELANCER',
  'DIRECTOR_OR_EMPLOYEE',
  'EXTERNAL_SUBCONTRACTOR',
] as const;
export type ExecutorType = (typeof executorTypes)[number];
export const costCategories = [
  'PATENT',
  'TRAVEL',
  'SUBCONTRACTOR',
  'TRANSLATION_MATERIAL_CONSUMABLE',
  'OTHER',
] as const;
export type CostCategory = (typeof costCategories)[number];
export const decisionCodes = ['APPROVE', 'MODIFY', 'REJECT'] as const;
export type DecisionCode = (typeof decisionCodes)[number];
export type DirectCost = {
  key: string;
  category: CostCategory;
  label: string;
  amount: string;
  currency: string;
};
export type EstimateInputs = {
  currency: string;
  executorType: ExecutorType;
  executorCost: string;
  fiscalCost: string;
  allocatedOverhead: string;
  directCosts: DirectCost[];
  targetProfitability: string;
  proposedPrice: string;
  pricingIntent: { kind: 'ORDINARY' } | { kind: 'STRATEGIC'; reason: string };
  costConfirmation: true;
};
export type EstimateVersion = {
  id: string;
  estimateId: string;
  workspaceId: string;
  companyId: string;
  opportunityId: string;
  clientRequestId: string;
  versionNumber: number;
  predecessorVersionId: string | null;
  inputs: EstimateInputs;
  results: {
    totalCost: string;
    profit: string;
    profitabilityPercent: string;
    targetDifferencePercentagePoints: string;
  };
  calculationRule: {
    id: 'CONFIRMED_COST_PROFITABILITY';
    version: 1;
    monetaryScale: 2;
    percentageScale: 2;
    rounding: 'HALF_UP';
  };
  createdByWorkspaceMembershipId: string;
  createdAt: string;
  decision: {
    id: string;
    code: DecisionCode;
    decidedByWorkspaceMembershipId: string;
    decidedAt: string;
  } | null;
};
export type EstimateHistory = {
  items: EstimateVersion[];
  latestVersionNumber: number | null;
  nextCursor?: string;
};
const money = /^[0-9]+\.[0-9]{2}$/u;
const signedMoney = /^-?(0|[1-9][0-9]*)\.[0-9]{2}$/u;
const percentage = /^[+-]?[0-9]+(\.[0-9]+)?$/u;
export function validMoney(value: string, positive = false): boolean {
  return (
    money.test(value) && (!positive || BigInt(value.replace('.', '')) > 0n)
  );
}
export function validTarget(value: string): boolean {
  return percentage.test(value);
}
export function validCurrency(value: string): boolean {
  return Intl.supportedValuesOf('currency').includes(value);
}
function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function text(value: unknown): string {
  if (typeof value !== 'string' || !value.trim())
    throw new Error('Invalid profitability text.');
  return value;
}
function date(value: unknown): string {
  const result = text(value);
  if (!Number.isFinite(Date.parse(result)))
    throw new Error('Invalid profitability time.');
  return result;
}
function versionNumber(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0)
    throw new Error('Invalid profitability version.');
  return value;
}
export function isExecutorType(value: unknown): value is ExecutorType {
  return executorTypes.some((item) => item === value);
}
export function isCostCategory(value: unknown): value is CostCategory {
  return costCategories.some((item) => item === value);
}
export function isDecisionCode(value: unknown): value is DecisionCode {
  return decisionCodes.some((item) => item === value);
}
function decimal(value: unknown, grammar: RegExp): string {
  if (typeof value !== 'string' || !grammar.test(value))
    throw new Error('Invalid profitability decimal.');
  return value;
}
function directCost(value: unknown, currency: string): DirectCost {
  if (
    !object(value) ||
    !isCostCategory(value.category) ||
    value.currency !== currency
  )
    throw new Error('Invalid profitability cost.');
  const amount = decimal(value.amount, money);
  if (!validMoney(amount, true)) throw new Error('Invalid direct cost amount.');
  return {
    key: text(value.key),
    category: value.category,
    label: text(value.label),
    amount,
    currency,
  };
}
function inputs(value: unknown): EstimateInputs {
  if (
    !object(value) ||
    !isExecutorType(value.executorType) ||
    !Array.isArray(value.directCosts) ||
    value.costConfirmation !== true ||
    !object(value.pricingIntent)
  )
    throw new Error('Invalid profitability inputs.');
  const currency = text(value.currency);
  if (!validCurrency(currency)) throw new Error('Invalid estimate currency.');
  const directCosts = value.directCosts.map((line) =>
    directCost(line, currency),
  );
  if (new Set(directCosts.map((line) => line.key)).size !== directCosts.length)
    throw new Error('Repeated direct cost key.');
  const proposedPrice = decimal(value.proposedPrice, money);
  if (!validMoney(proposedPrice, true))
    throw new Error('Invalid estimate price.');
  const intent = value.pricingIntent;
  const pricingIntent: EstimateInputs['pricingIntent'] =
    intent.kind === 'ORDINARY' && intent.reason === undefined
      ? { kind: 'ORDINARY' }
      : intent.kind === 'STRATEGIC'
        ? { kind: 'STRATEGIC', reason: text(intent.reason) }
        : invalidIntent();
  return {
    currency,
    executorType: value.executorType,
    executorCost: decimal(value.executorCost, money),
    fiscalCost: decimal(value.fiscalCost, money),
    allocatedOverhead: decimal(value.allocatedOverhead, money),
    directCosts,
    targetProfitability: decimal(value.targetProfitability, percentage),
    proposedPrice,
    pricingIntent,
    costConfirmation: true,
  };
}
function invalidIntent(): never {
  throw new Error('Invalid estimate pricing intent.');
}
export function parseEstimateVersion(
  value: unknown,
  scope: { workspaceId: string; companyId: string; opportunityId: string },
): EstimateVersion {
  if (
    !object(value) ||
    value.workspaceId !== scope.workspaceId ||
    value.companyId !== scope.companyId ||
    value.opportunityId !== scope.opportunityId ||
    !object(value.results) ||
    !object(value.calculationRule)
  )
    throw new Error('Invalid profitability scope.');
  const rule = value.calculationRule;
  if (
    rule.id !== 'CONFIRMED_COST_PROFITABILITY' ||
    rule.version !== 1 ||
    rule.monetaryScale !== 2 ||
    rule.percentageScale !== 2 ||
    rule.rounding !== 'HALF_UP'
  )
    throw new Error('Unsupported profitability calculation rule.');
  const decision = parseDecision(value.decision);
  const version = versionNumber(value.versionNumber);
  const predecessorVersionId =
    value.predecessorVersionId === null
      ? null
      : text(value.predecessorVersionId);
  if ((version === 1) !== (predecessorVersionId === null))
    throw new Error('Invalid profitability predecessor.');
  return {
    id: text(value.id),
    estimateId: text(value.estimateId),
    workspaceId: scope.workspaceId,
    companyId: scope.companyId,
    opportunityId: scope.opportunityId,
    clientRequestId: text(value.clientRequestId),
    versionNumber: version,
    predecessorVersionId,
    inputs: inputs(value.inputs),
    results: {
      totalCost: decimal(value.results.totalCost, money),
      profit: decimal(value.results.profit, signedMoney),
      profitabilityPercent: decimal(
        value.results.profitabilityPercent,
        signedMoney,
      ),
      targetDifferencePercentagePoints: decimal(
        value.results.targetDifferencePercentagePoints,
        signedMoney,
      ),
    },
    calculationRule: {
      id: 'CONFIRMED_COST_PROFITABILITY',
      version: 1,
      monetaryScale: 2,
      percentageScale: 2,
      rounding: 'HALF_UP',
    },
    createdByWorkspaceMembershipId: text(value.createdByWorkspaceMembershipId),
    createdAt: date(value.createdAt),
    decision,
  };
}
function parseDecision(value: unknown): EstimateVersion['decision'] {
  if (value === null) return null;
  if (!object(value) || !isDecisionCode(value.code))
    throw new Error('Invalid profitability decision.');
  return {
    id: text(value.id),
    code: value.code,
    decidedByWorkspaceMembershipId: text(value.decidedByWorkspaceMembershipId),
    decidedAt: date(value.decidedAt),
  };
}
export function parseEstimateHistory(
  value: unknown,
  scope: { workspaceId: string; companyId: string; opportunityId: string },
): EstimateHistory {
  if (
    !object(value) ||
    !Array.isArray(value.items) ||
    value.items.length > 50 ||
    (value.nextCursor !== undefined &&
      (typeof value.nextCursor !== 'string' || !value.nextCursor))
  )
    throw new Error('Invalid profitability history.');
  const latestVersionNumber =
    value.latestVersionNumber === null
      ? null
      : versionNumber(value.latestVersionNumber);
  const items = value.items.map((item) => parseEstimateVersion(item, scope));
  if (
    (items.length > 0 && latestVersionNumber === null) ||
    items.some(
      (item, i) =>
        item.versionNumber > (latestVersionNumber ?? 0) ||
        (i > 0 && item.versionNumber >= (items[i - 1]?.versionNumber ?? 0)),
    ) ||
    new Set(items.map((item) => item.estimateId)).size > 1 ||
    new Set(items.map((item) => item.id)).size !== items.length
  )
    throw new Error('Invalid profitability history order.');
  return {
    items,
    latestVersionNumber,
    ...(value.nextCursor === undefined ? {} : { nextCursor: value.nextCursor }),
  };
}
/** Display uses BigInt for the integer and string fractional digits. Canonical input is never rewritten. */
export function displayDecimal(value: string, locale: InterfaceLocale): string {
  const negative = value.startsWith('-');
  const unsigned = negative ? value.slice(1) : value;
  const [integer = '0', fraction] = unsigned.split('.');
  const integerPart = new Intl.NumberFormat(locale).format(BigInt(integer));
  const separator =
    new Intl.NumberFormat(locale, { minimumFractionDigits: 1 })
      .formatToParts(1n)
      .find((part) => part.type === 'decimal')?.value ?? '.';
  return `${negative ? '−' : ''}${integerPart}${fraction === undefined ? '' : separator + fraction}`;
}
export function profitabilityAuthority(actor: ActorContext): {
  read: boolean;
  create: boolean;
  decide: boolean;
} {
  const company = actor.activeCompany;
  const actorValid =
    actor.active === true &&
    typeof actor.workspaceId === 'string' &&
    actor.workspaceId.length > 0 &&
    typeof actor.workspaceMembershipId === 'string' &&
    actor.workspaceMembershipId.length > 0 &&
    typeof company?.id === 'string' &&
    company.id.length > 0;
  const contributor = company?.profitabilityContributorPermissions;
  const director = company?.profitabilityDirectorPermissions;
  const contributorValid =
    company?.profitabilityContributorPermissionSetVersion === 'v1' &&
    typeof company.profitabilityContributorPermissionAssignmentId ===
      'string' &&
    company.profitabilityContributorPermissionAssignmentId.length > 0 &&
    Array.isArray(contributor) &&
    contributor.every(
      (permission) =>
        permission === 'commercial.profitability_estimate.read' ||
        permission === 'commercial.profitability_estimate.create',
    );
  const directorValid =
    company?.profitabilityDirectorPermissionSetVersion === 'v1' &&
    typeof company.profitabilityDirectorPermissionAssignmentId === 'string' &&
    company.profitabilityDirectorPermissionAssignmentId.length > 0 &&
    Array.isArray(director) &&
    director.every(
      (permission) =>
        permission === 'commercial.profitability_estimate.read' ||
        permission === 'commercial.profitability_estimate.decide',
    );
  const opportunityRead =
    Array.isArray(company?.commercialIntakePermissions) &&
    company.commercialIntakePermissions.includes('commercial.opportunity.read');
  const read =
    actorValid &&
    opportunityRead &&
    ((contributorValid &&
      contributor?.includes('commercial.profitability_estimate.read') ===
        true) ||
      (directorValid &&
        director?.includes('commercial.profitability_estimate.read') === true));
  return {
    read,
    create:
      read &&
      contributorValid &&
      contributor?.includes('commercial.profitability_estimate.create') ===
        true,
    decide:
      read &&
      directorValid &&
      director?.includes('commercial.profitability_estimate.decide') === true,
  };
}
export function profitabilityContextKey(actor: ActorContext): string {
  const company = actor.activeCompany;
  return JSON.stringify([
    actor.internalUserId,
    actor.workspaceId,
    actor.workspaceMembershipId,
    company?.id,
    company?.commercialIntakePermissionAssignmentId,
    company?.commercialIntakePermissionSetVersion,
    company?.commercialIntakePermissions,
    company?.profitabilityContributorPermissionAssignmentId,
    company?.profitabilityContributorPermissionSetVersion,
    company?.profitabilityContributorPermissions,
    company?.profitabilityDirectorPermissionAssignmentId,
    company?.profitabilityDirectorPermissionSetVersion,
    company?.profitabilityDirectorPermissions,
  ]);
}
