import {
  applyPricingAdjustments,
  type ValidatedFixedNetDiscount,
} from '../pricing-configuration/pricing-adjustment.js';
import { calculatePricingLines } from '../pricing-configuration/pricing-calculation.js';
import { scaledDecimal } from '../pricing-configuration/pricing-decimal.js';
import type { PricingSnapshotLineRecord } from '../pricing-configuration/pricing-snapshot.types.js';
import { ConflictException } from '@nestjs/common';
import type { OfferBinding } from './offer-binding.js';

export const OFFER_QUALITY_CODES = [
  'PRICING_SNAPSHOT_COHERENT',
  'CURRENCY_UNCHANGED',
  'VALIDITY_OPEN',
  'RECIPIENT_AVAILABLE',
  'RECIPIENT_IDENTITY_CURRENT',
  'RECIPIENT_TAX_ID_RECORDED',
  'PRICING_CLIENT_CONTEXT_COHERENT',
  'PROVISIONAL_MARKER_PRESENT',
] as const;
export const MODEL_OFFER_QUALITY_CODES = [
  'MODEL_APPROVAL_COHERENT',
  'ECONOMIC_SOURCE_COHERENT',
  'DECLARED_TOTALS_COHERENT',
  'REPRESENTATION_COHERENT',
  'VALIDITY_OPEN',
  'RECIPIENT_AVAILABLE',
  'RECIPIENT_IDENTITY_CURRENT',
  'RECIPIENT_TAX_ID_RECORDED',
  'CURRENCY_UNCHANGED',
  'NON_OFFICIAL_MARKER_PRESENT',
  'DECLARED_TAX_UNVERIFIED',
  'NON_OFFICIAL_OFFER',
  'ILLUSTRATIVE_MODEL',
] as const;
export type ModelOfferQualityCode = (typeof MODEL_OFFER_QUALITY_CODES)[number];
export type OfferQualityCode =
  (typeof OFFER_QUALITY_CODES)[number] | ModelOfferQualityCode;

export function requireHeadOfferVersion(input: {
  offerVersionId: string;
  headVersionId: string | undefined;
}): void {
  if (input.offerVersionId !== input.headVersionId)
    throw new ConflictException({
      code: 'OFFER_VERSION_SUPERSEDED',
      message: 'The Offer Version has been superseded.',
    });
}
export type OfferQualityResult = {
  readonly code: OfferQualityCode;
  readonly status: 'PASS' | 'WARNING' | 'ERROR';
};
export type OfferQualityRuleSetVersion = OfferBinding['ruleSetVersion'];
interface OfferQualityRunFacts {
  readonly id: string;
  readonly offerVersionId: string;
  readonly actorWorkspaceMembershipId: string;
  readonly evaluatedAt: string;
  readonly results: readonly OfferQualityResult[];
}
export type OfferQualityRun = OfferQualityRunFacts &
  (
    | {
        readonly ruleSet: 'OFFER_QUALITY_ILLUSTRATIVE';
        readonly ruleSetVersion: OfferQualityRuleSetVersion;
      }
    | {
        readonly ruleSet: 'OFFER_QUALITY_COMPANY_MODEL';
        readonly ruleSetVersion: 1;
      }
  );

export interface OfferQualitySnapshot {
  readonly belongsToOffer: boolean;
  readonly currency: string;
  readonly lines: readonly (Pick<
    PricingSnapshotLineRecord,
    | 'unitAmount'
    | 'quantity'
    | 'taxRatePercent'
    | 'rawLineAmount'
    | 'lineNet'
    | 'rawLineTax'
    | 'lineTax'
    | 'adjustment'
  > & { readonly currency: string })[];
  readonly subtotal: string;
  readonly taxTotal: string;
  readonly total: string;
}
/** The stored adjustment trace of Pricing PRD section 8.2, read as stored. */
export interface OfferAdjustedQualitySnapshot extends OfferQualitySnapshot {
  readonly calculatedByWorkspaceMembershipId: string;
  readonly calculatedAt: string;
  readonly lines: readonly (OfferQualitySnapshot['lines'][number] &
    Pick<
      PricingSnapshotLineRecord,
      | 'netReduction'
      | 'taxReduction'
      | 'adjustedLineNet'
      | 'adjustedRawLineTax'
      | 'adjustedLineTax'
    >)[];
}
export interface OfferQualityInput {
  readonly ruleSetVersion: OfferQualityRuleSetVersion;
  readonly instant: Date;
  readonly validUntil: Date;
  readonly snapshot: OfferAdjustedQualitySnapshot | null;
  readonly previousTransmittedCurrency: string | null;
  readonly recipientAvailable: boolean;
  readonly recipientIdentityCurrent: boolean;
  readonly recipientTaxId: string | null;
  readonly pricingClientContextCoherent: boolean;
  readonly provenance: string;
  readonly provisional: boolean;
}

/**
 * Pure rule sets v1 and v2, with the same eight codes and severities. Version
 * 2 differs only in reproducing the bounded adjustment trace. The owning
 * command supplies one fenced server instant and the version's bound rule set.
 */
export function evaluateOfferQuality(
  input: OfferQualityInput,
): OfferQualityResult[] {
  return [
    result(
      'PRICING_SNAPSHOT_COHERENT',
      input.ruleSetVersion === 1
        ? coherentSnapshot(input.snapshot)
        : coherentAdjustedSnapshot(input.snapshot),
      'ERROR',
    ),
    result(
      'CURRENCY_UNCHANGED',
      input.previousTransmittedCurrency === null ||
        input.snapshot?.currency === input.previousTransmittedCurrency,
      'WARNING',
    ),
    result(
      'VALIDITY_OPEN',
      input.validUntil.getTime() > input.instant.getTime(),
      'ERROR',
    ),
    result('RECIPIENT_AVAILABLE', input.recipientAvailable, 'ERROR'),
    result(
      'RECIPIENT_IDENTITY_CURRENT',
      input.recipientIdentityCurrent,
      'WARNING',
    ),
    result(
      'RECIPIENT_TAX_ID_RECORDED',
      input.recipientTaxId !== null && input.recipientTaxId.length > 0,
      'WARNING',
    ),
    result(
      'PRICING_CLIENT_CONTEXT_COHERENT',
      input.pricingClientContextCoherent,
      'WARNING',
    ),
    result(
      'PROVISIONAL_MARKER_PRESENT',
      input.provenance === 'ILLUSTRATIVE' && input.provisional,
      'ERROR',
    ),
  ];
}

function result(
  code: OfferQualityCode,
  passed: boolean,
  severity: 'ERROR' | 'WARNING',
): OfferQualityResult {
  return { code, status: passed ? 'PASS' : severity };
}

export function coherentSnapshot(
  snapshot: OfferQualitySnapshot | null,
): boolean {
  if (
    !snapshot ||
    !snapshot.belongsToOffer ||
    snapshot.lines.length === 0 ||
    snapshot.lines.some(
      (line) => line.currency !== snapshot.currency || line.adjustment !== null,
    )
  )
    return false;
  try {
    const reproduced = calculatePricingLines(snapshot.lines);
    return (
      sameDecimal(snapshot.subtotal, reproduced.subtotal, 2) &&
      sameDecimal(snapshot.taxTotal, reproduced.taxTotal, 2) &&
      sameDecimal(snapshot.total, reproduced.total, 2) &&
      snapshot.lines.every((line, index) => {
        const trace = reproduced.lines[index];
        return (
          trace !== undefined &&
          sameDecimal(line.rawLineAmount, trace.rawLineAmount, 7) &&
          sameDecimal(line.lineNet, trace.lineNet, 2) &&
          sameDecimal(line.rawLineTax, trace.rawLineTax, 7) &&
          sameDecimal(line.lineTax, trace.lineTax, 2)
        );
      })
    );
  } catch {
    return false;
  }
}

const FIXED_NET_DISCOUNT_GRAMMAR = /^(0|[1-9][0-9]{0,21})\.[0-9]{2}$/u;

/**
 * Rule set v2 coherence. Recomputing the stored strings in memory checks the
 * immutable trace (Pricing PRD sections 8.1-8.2); it never writes, applies or
 * changes an adjustment. Shared Contract coherence above stays unchanged.
 * Rule set v2 is bound only to adjusted Snapshots, so a Snapshot without any
 * adjusted line is incoherent here, mirroring Template v2.
 */
export function coherentAdjustedSnapshot(
  snapshot: OfferAdjustedQualitySnapshot | null,
): boolean {
  if (
    !snapshot ||
    !snapshot.lines.some((line) => line.adjustment !== null) ||
    !coherentOriginalTrace(snapshot)
  )
    return false;
  try {
    const adjusted = applyPricingAdjustments(
      snapshot.lines.map((line) => ({
        lineNet: line.lineNet,
        lineTax: line.lineTax,
        taxRatePercent: line.taxRatePercent,
        adjustment:
          line.adjustment === null
            ? null
            : storedDiscount(snapshot, line.adjustment),
      })),
    );
    return (
      sameDecimal(snapshot.subtotal, adjusted.subtotal, 2) &&
      sameDecimal(snapshot.taxTotal, adjusted.taxTotal, 2) &&
      sameDecimal(snapshot.total, adjusted.total, 2) &&
      snapshot.lines.every((line, index) => {
        const trace = adjusted.lines[index];
        return (
          trace !== undefined &&
          sameDecimal(line.netReduction, trace.netReduction, 2) &&
          sameDecimal(line.taxReduction, trace.taxReduction, 2) &&
          sameDecimal(line.adjustedLineNet, trace.adjustedLineNet, 2) &&
          sameDecimal(line.adjustedRawLineTax, trace.adjustedRawLineTax, 7) &&
          sameDecimal(line.adjustedLineTax, trace.adjustedLineTax, 2) &&
          (line.adjustment === null ||
            (sameDecimal(line.adjustment.netReduction, trace.netReduction, 2) &&
              sameDecimal(line.adjustment.taxReduction, trace.taxReduction, 2)))
        );
      })
    );
  } catch {
    return false;
  }
}

/**
 * Type, amount grammar, bounded reason, and the Snapshot's own calculation
 * actor and instant. Reduction bounds are enforced by the shared arithmetic.
 */
function storedDiscount(
  snapshot: OfferAdjustedQualitySnapshot,
  adjustment: NonNullable<PricingSnapshotLineRecord['adjustment']>,
): ValidatedFixedNetDiscount {
  const reasonLength = Array.from(adjustment.reason).length;
  if (
    adjustment.type !== 'FIXED_NET_DISCOUNT' ||
    !FIXED_NET_DISCOUNT_GRAMMAR.test(adjustment.netReduction) ||
    reasonLength < 1 ||
    reasonLength > 500 ||
    !/\S/u.test(adjustment.reason) ||
    adjustment.appliedByWorkspaceMembershipId !==
      snapshot.calculatedByWorkspaceMembershipId ||
    adjustment.appliedAt !== snapshot.calculatedAt
  )
    throw new Error('Incoherent adjustment trace.');
  return { netReduction: adjustment.netReduction, reason: adjustment.reason };
}

/** Original pre-adjustment amounts, currency and line count of the trace. */
function coherentOriginalTrace(snapshot: OfferQualitySnapshot): boolean {
  if (
    !snapshot.belongsToOffer ||
    snapshot.lines.length === 0 ||
    snapshot.lines.some((line) => line.currency !== snapshot.currency)
  )
    return false;
  try {
    const reproduced = calculatePricingLines(snapshot.lines);
    return snapshot.lines.every((line, index) => {
      const trace = reproduced.lines[index];
      return (
        trace !== undefined &&
        sameDecimal(line.rawLineAmount, trace.rawLineAmount, 7) &&
        sameDecimal(line.lineNet, trace.lineNet, 2) &&
        sameDecimal(line.rawLineTax, trace.rawLineTax, 7) &&
        sameDecimal(line.lineTax, trace.lineTax, 2)
      );
    });
  } catch {
    return false;
  }
}

function sameDecimal(left: string, right: string, scale: number): boolean {
  return scaledDecimal(left, scale) === scaledDecimal(right, scale);
}

/** Persisted JSON is unknown until this rule-set owner validates it. */
export function readOfferQualityResults(value: unknown): OfferQualityResult[] {
  if (!Array.isArray(value) || value.length !== OFFER_QUALITY_CODES.length)
    throw new Error('Invalid stored Offer Quality Check results.');
  return OFFER_QUALITY_CODES.map((code, index) => {
    const item: unknown = value[index];
    if (
      typeof item !== 'object' ||
      item === null ||
      !('code' in item) ||
      item.code !== code ||
      !('status' in item) ||
      (item.status !== 'PASS' &&
        item.status !== 'WARNING' &&
        item.status !== 'ERROR')
    )
      throw new Error('Invalid stored Offer Quality Check results.');
    const failingStatus =
      code === 'PRICING_SNAPSHOT_COHERENT' ||
      code === 'VALIDITY_OPEN' ||
      code === 'RECIPIENT_AVAILABLE' ||
      code === 'PROVISIONAL_MARKER_PRESENT'
        ? 'ERROR'
        : 'WARNING';
    if (item.status !== 'PASS' && item.status !== failingStatus)
      throw new Error('Invalid stored Offer Quality Check severity.');
    return { code, status: item.status };
  });
}

/** The fixed generated-model rules use frozen approvals, never live availability. */
export function evaluateModelOfferQuality(input: {
  instant: Date;
  validUntil: Date;
  modelApprovalCoherent: boolean;
  economicSourceCoherent: boolean;
  declaredTotalsCoherent: boolean;
  representationCoherent: boolean;
  recipientAvailable: boolean;
  recipientIdentityCurrent: boolean;
  recipientTaxId: string | null;
  currency: string;
  previousTransmittedCurrency: string | null;
  nonOfficialMarkerPresent: boolean;
  illustrativeModel: boolean;
}): OfferQualityResult[] {
  return [
    result('MODEL_APPROVAL_COHERENT', input.modelApprovalCoherent, 'ERROR'),
    result('ECONOMIC_SOURCE_COHERENT', input.economicSourceCoherent, 'ERROR'),
    result('DECLARED_TOTALS_COHERENT', input.declaredTotalsCoherent, 'ERROR'),
    result('REPRESENTATION_COHERENT', input.representationCoherent, 'ERROR'),
    result('VALIDITY_OPEN', input.instant < input.validUntil, 'ERROR'),
    result('RECIPIENT_AVAILABLE', input.recipientAvailable, 'ERROR'),
    result(
      'RECIPIENT_IDENTITY_CURRENT',
      input.recipientIdentityCurrent,
      'WARNING',
    ),
    result(
      'RECIPIENT_TAX_ID_RECORDED',
      input.recipientTaxId !== null && input.recipientTaxId.length > 0,
      'WARNING',
    ),
    result(
      'CURRENCY_UNCHANGED',
      input.previousTransmittedCurrency === null ||
        input.previousTransmittedCurrency === input.currency,
      'WARNING',
    ),
    result(
      'NON_OFFICIAL_MARKER_PRESENT',
      input.nonOfficialMarkerPresent,
      'ERROR',
    ),
    result('DECLARED_TAX_UNVERIFIED', false, 'WARNING'),
    result('NON_OFFICIAL_OFFER', false, 'WARNING'),
    result('ILLUSTRATIVE_MODEL', !input.illustrativeModel, 'WARNING'),
  ];
}

export function readModelOfferQualityResults(
  value: unknown,
): OfferQualityResult[] {
  if (
    !Array.isArray(value) ||
    value.length !== MODEL_OFFER_QUALITY_CODES.length
  )
    throw new Error('Invalid stored model Offer checks.');
  return MODEL_OFFER_QUALITY_CODES.map((code, index) => {
    const item: unknown = value[index];
    const warning = [
      'RECIPIENT_IDENTITY_CURRENT',
      'RECIPIENT_TAX_ID_RECORDED',
      'CURRENCY_UNCHANGED',
      'DECLARED_TAX_UNVERIFIED',
      'NON_OFFICIAL_OFFER',
      'ILLUSTRATIVE_MODEL',
    ].includes(code);
    const always =
      code === 'DECLARED_TAX_UNVERIFIED' || code === 'NON_OFFICIAL_OFFER';
    if (
      typeof item !== 'object' ||
      item === null ||
      Array.isArray(item) ||
      Object.keys(item).length !== 2 ||
      !('code' in item) ||
      item.code !== code ||
      !('status' in item) ||
      (item.status !== 'PASS' &&
        item.status !== 'WARNING' &&
        item.status !== 'ERROR') ||
      (item.status !== (warning ? 'WARNING' : 'ERROR') &&
        (always || item.status !== 'PASS'))
    )
      throw new Error('Invalid stored model Offer checks.');
    return { code, status: item.status };
  });
}
