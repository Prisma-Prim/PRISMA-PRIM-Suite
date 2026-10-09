import { ConflictException } from '@nestjs/common';
import type { OfferRecipientCopy } from '../offer/offer.types.js';
import {
  coherentSnapshot,
  type OfferQualitySnapshot,
} from '../offer/offer-quality.js';

type Identity = Pick<
  OfferRecipientCopy,
  'legalName' | 'taxId' | 'legalAddress'
>;
type Source =
  | {
      readonly kind: 'ACCEPTED_OFFER';
      readonly companyId: string;
      readonly partyKey: string;
      readonly identity: Identity;
      readonly snapshotId: string;
      readonly scopeNote: string | null;
      readonly commercialConditions: string | null;
    }
  | { readonly kind: 'DIRECT'; readonly companyId: string }
  | {
      readonly kind: 'ADDENDUM';
      readonly companyId: string;
      readonly partyKey: string;
      readonly identity: Identity;
      readonly parentKind: 'CONTRACT' | 'PRECONTRACT' | 'ADDENDUM';
      readonly parentExecutionState: 'EXECUTED' | 'NOT_EXECUTED';
      readonly currency: string | null;
    };
export interface ContractQualityInput {
  readonly instant: Date;
  readonly companyId: string;
  readonly partyKey: string;
  readonly identity: Identity;
  readonly partyAvailable: boolean;
  readonly partyIdentityCurrent: boolean;
  readonly snapshotId: string | null;
  readonly snapshot: OfferQualitySnapshot | null;
  readonly scopeNote: string | null;
  readonly commercialConditions: string | null;
  readonly termStartsOn: string | null;
  readonly termEndsOn: string | null;
  readonly specialConditions: string | null;
  readonly preliminaryWork: string | null;
  readonly provenance: string;
  readonly provisional: boolean;
  readonly source: Source;
}
export const CONTRACT_QUALITY_RULES = {
  SOURCE_COMPANY_MATCHES: 'ERROR',
  PARTY_AVAILABLE: 'ERROR',
  PARTY_MATCHES_SOURCE: 'ERROR',
  PARTY_IDENTITY_MATCHES_SOURCE: 'WARNING',
  PARTY_IDENTITY_CURRENT: 'WARNING',
  PARTY_TAX_ID_RECORDED: 'ERROR',
  PRICE_MATCHES_ACCEPTED_OFFER: 'ERROR',
  PRICING_SNAPSHOT_COHERENT: 'ERROR',
  CONDITIONS_MATCH_ACCEPTED_OFFER: 'ERROR',
  ADDED_CONDITIONS_CONFIRMED: 'WARNING',
  DIRECT_ORIGIN_REVIEWED: 'WARNING',
  PARENT_EXECUTED: 'ERROR',
  CURRENCY_MATCHES_PARENT: 'WARNING',
  TERM_END_NOT_PASSED: 'WARNING',
  PROVISIONAL_MARKER_PRESENT: 'ERROR',
} satisfies Record<string, 'ERROR' | 'WARNING'>;
export type ContractQualityCode = keyof typeof CONTRACT_QUALITY_RULES;
export type ContractQualityResult = {
  readonly code: ContractQualityCode;
  readonly status: 'PASS' | 'WARNING' | 'ERROR';
};
export interface ContractQualityRun {
  readonly id: string;
  readonly contractVersionId: string;
  readonly ruleSet: 'CONTRACT_QUALITY_ILLUSTRATIVE';
  readonly ruleSetVersion: 1;
  readonly actorWorkspaceMembershipId: string;
  readonly evaluatedAt: string;
  readonly results: readonly ContractQualityResult[];
}
/** Stable pure ruleset seam for the delivered Contract origins and Addenda. */
export function evaluateContractQuality(
  input: ContractQualityInput,
): ContractQualityResult[] {
  const output: ContractQualityResult[] = [];
  const check = (code: ContractQualityCode, passed: boolean) =>
    output.push({
      code,
      status: passed ? 'PASS' : CONTRACT_QUALITY_RULES[code],
    });
  const source = input.source;
  check('SOURCE_COMPANY_MATCHES', input.companyId === source.companyId);
  check('PARTY_AVAILABLE', input.partyAvailable);
  if (source.kind !== 'DIRECT') {
    check('PARTY_MATCHES_SOURCE', input.partyKey === source.partyKey);
    check(
      'PARTY_IDENTITY_MATCHES_SOURCE',
      sameIdentity(input.identity, source.identity),
    );
  }
  check('PARTY_IDENTITY_CURRENT', input.partyIdentityCurrent);
  check(
    'PARTY_TAX_ID_RECORDED',
    input.identity.taxId !== null && input.identity.taxId.length > 0,
  );
  if (source.kind === 'ACCEPTED_OFFER')
    check(
      'PRICE_MATCHES_ACCEPTED_OFFER',
      input.snapshotId === source.snapshotId,
    );
  if (input.snapshotId !== null)
    check('PRICING_SNAPSHOT_COHERENT', coherentSnapshot(input.snapshot));
  if (source.kind === 'ACCEPTED_OFFER') {
    check(
      'CONDITIONS_MATCH_ACCEPTED_OFFER',
      input.scopeNote === source.scopeNote &&
        input.commercialConditions === source.commercialConditions,
    );
    check(
      'ADDED_CONDITIONS_CONFIRMED',
      input.termStartsOn === null &&
        input.termEndsOn === null &&
        !input.specialConditions &&
        !input.preliminaryWork,
    );
  }
  if (source.kind === 'DIRECT') check('DIRECT_ORIGIN_REVIEWED', false);
  if (source.kind === 'ADDENDUM') {
    check(
      'PARENT_EXECUTED',
      source.parentKind !== 'ADDENDUM' &&
        source.parentExecutionState === 'EXECUTED',
    );
    if (input.snapshotId !== null)
      check(
        'CURRENCY_MATCHES_PARENT',
        input.snapshot?.currency === source.currency,
      );
  }
  if (input.termEndsOn !== null)
    check(
      'TERM_END_NOT_PASSED',
      input.termEndsOn >= input.instant.toISOString().slice(0, 10),
    );
  check(
    'PROVISIONAL_MARKER_PRESENT',
    input.provenance === 'ILLUSTRATIVE' && input.provisional,
  );
  return output;
}
function sameIdentity(left: Identity, right: Identity) {
  return (
    left.legalName === right.legalName &&
    left.taxId === right.taxId &&
    left.legalAddress === right.legalAddress
  );
}
/** Runtime C3 applicability, correlated with the exact persisted C1 version. */
export function contractQualityCodes(
  termEndsOn: string | null,
  source:
    { pricingSnapshotId: string | null } | { kind: 'DIRECT' } | null = null,
): ContractQualityCode[] {
  const codes: ContractQualityCode[] = [
    'SOURCE_COMPANY_MATCHES',
    'PARTY_AVAILABLE',
    'PARTY_MATCHES_SOURCE',
    'PARTY_IDENTITY_MATCHES_SOURCE',
    'PARTY_IDENTITY_CURRENT',
    'PARTY_TAX_ID_RECORDED',
    'PRICE_MATCHES_ACCEPTED_OFFER',
    'PRICING_SNAPSHOT_COHERENT',
    'CONDITIONS_MATCH_ACCEPTED_OFFER',
    'ADDED_CONDITIONS_CONFIRMED',
  ];
  if (source && 'pricingSnapshotId' in source) {
    codes.splice(6);
    if (source.pricingSnapshotId !== null)
      codes.push('PRICING_SNAPSHOT_COHERENT');
    codes.push('PARENT_EXECUTED');
    if (source.pricingSnapshotId !== null)
      codes.push('CURRENCY_MATCHES_PARENT');
  }
  if (source && 'kind' in source)
    codes.splice(
      0,
      codes.length,
      'SOURCE_COMPANY_MATCHES',
      'PARTY_AVAILABLE',
      'PARTY_IDENTITY_CURRENT',
      'PARTY_TAX_ID_RECORDED',
      'PRICING_SNAPSHOT_COHERENT',
      'DIRECT_ORIGIN_REVIEWED',
    );
  if (termEndsOn !== null) codes.push('TERM_END_NOT_PASSED');
  codes.push('PROVISIONAL_MARKER_PRESENT');
  return codes;
}
export function readContractQualityResults(
  value: unknown,
  codes: readonly ContractQualityCode[],
): ContractQualityResult[] {
  if (!Array.isArray(value) || value.length !== codes.length)
    throw new Error('Invalid Contract Quality Check results.');
  return codes.map((code, index) => {
    const item: unknown = value[index];
    if (
      typeof item !== 'object' ||
      item === null ||
      Array.isArray(item) ||
      Object.keys(item).length !== 2 ||
      !('code' in item) ||
      item.code !== code ||
      !('status' in item) ||
      (item.status !== 'PASS' &&
        item.status !== CONTRACT_QUALITY_RULES[code]) ||
      (code === 'DIRECT_ORIGIN_REVIEWED' && item.status !== 'WARNING')
    )
      throw new Error('Invalid Contract Quality Check result.');
    return {
      code,
      status: item.status === 'PASS' ? 'PASS' : CONTRACT_QUALITY_RULES[code],
    };
  });
}

export function requireHeadContractVersion(input: {
  versionId: string;
  headVersionId: string | undefined;
}): void {
  if (input.versionId !== input.headVersionId)
    throw new ConflictException({
      code: 'CONTRACT_VERSION_SUPERSEDED',
      message: 'The Contract Version has been superseded.',
    });
}
