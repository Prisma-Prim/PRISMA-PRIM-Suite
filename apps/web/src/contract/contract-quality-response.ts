export type ContractQualityContext =
  { pricingSnapshotId: string | null } | { origin: 'DIRECT' };
const rules = {
  SOURCE_COMPANY_MATCHES: 'ERROR',
  PARTY_AVAILABLE: 'ERROR',
  PARTY_MATCHES_SOURCE: 'ERROR',
  PARTY_IDENTITY_MATCHES_SOURCE: 'WARNING',
  PARTY_IDENTITY_CURRENT: 'WARNING',
  PARTY_TAX_ID_RECORDED: 'ERROR',
  PRICE_MATCHES_SOURCE_OFFER: 'ERROR',
  CONDITIONS_MATCH_SOURCE_OFFER: 'ERROR',
  SOURCE_OFFER_ACCEPTED: 'ERROR',
  PRICE_MATCHES_ACCEPTED_OFFER: 'ERROR',
  PRICING_SNAPSHOT_COHERENT: 'ERROR',
  CONDITIONS_MATCH_ACCEPTED_OFFER: 'ERROR',
  ADDED_CONDITIONS_CONFIRMED: 'WARNING',
  DIRECT_ORIGIN_REVIEWED: 'WARNING',
  PARENT_EXECUTED: 'ERROR',
  CURRENCY_MATCHES_PARENT: 'WARNING',
  TERM_END_NOT_PASSED: 'WARNING',
  PROVISIONAL_MARKER_PRESENT: 'ERROR',
} satisfies Record<string, 'WARNING' | 'ERROR'>;
export type ContractQualityCode = keyof typeof rules;
/** `CONTRACT_QUALITY_ILLUSTRATIVE` versions; any other value fails closed. */
export type ContractQualityRuleSetVersion = 1 | 2 | 3;
export function isContractQualityRuleSetVersion(
  value: unknown,
): value is ContractQualityRuleSetVersion {
  return value === 1 || value === 2 || value === 3;
}
export interface ContractQualityRunView {
  id: string;
  contractVersionId: string;
  ruleSet: 'CONTRACT_QUALITY_ILLUSTRATIVE';
  ruleSetVersion: ContractQualityRuleSetVersion;
  actorWorkspaceMembershipId: string;
  evaluatedAt: string;
  results: {
    code: ContractQualityCode;
    status: 'PASS' | 'WARNING' | 'ERROR';
  }[];
}
/**
 * The exact Contract Version a run belongs to, its runtime applicability and
 * the rule set bound to the version's immutable Snapshot.
 */
export interface ContractQualityRunBinding {
  versionId: string;
  termEndsOn: string | null;
  addendum?: ContractQualityContext;
  ruleSetVersion: ContractQualityRuleSetVersion;
}
/** A new run, an approval run or a signature run names the bound rule set. */
export function readContractQualityRun(
  value: unknown,
  binding: ContractQualityRunBinding,
): ContractQualityRunView {
  return readRun(value, binding, [binding.ruleSetVersion]);
}
/**
 * A recorded run may also predate rule set v2: a pending version bound to v2
 * keeps its earlier v1 runs unchanged. A v1-bound version never names v2.
 */
export function readRecordedContractQualityRun(
  value: unknown,
  binding: ContractQualityRunBinding,
): ContractQualityRunView {
  return readRun(
    value,
    binding,
    binding.ruleSetVersion === 2 ? [1, 2] : [binding.ruleSetVersion],
  );
}
function readRun(
  value: unknown,
  { versionId, termEndsOn, addendum }: ContractQualityRunBinding,
  accepted: readonly ContractQualityRuleSetVersion[],
): ContractQualityRunView {
  const input = object(value);
  const ruleSetVersion = input.ruleSetVersion;
  if (
    input.ruleSet !== 'CONTRACT_QUALITY_ILLUSTRATIVE' ||
    !isContractQualityRuleSetVersion(ruleSetVersion) ||
    !accepted.includes(ruleSetVersion) ||
    input.contractVersionId !== versionId ||
    !Array.isArray(input.results)
  )
    throw new Error('Invalid Contract Quality Check run.');
  const codes: ContractQualityCode[] = [
    'SOURCE_COMPANY_MATCHES',
    'PARTY_AVAILABLE',
    'PARTY_MATCHES_SOURCE',
    'PARTY_IDENTITY_MATCHES_SOURCE',
    'PARTY_IDENTITY_CURRENT',
    'PARTY_TAX_ID_RECORDED',
    ruleSetVersion === 3
      ? 'PRICE_MATCHES_SOURCE_OFFER'
      : 'PRICE_MATCHES_ACCEPTED_OFFER',
    'PRICING_SNAPSHOT_COHERENT',
    ruleSetVersion === 3
      ? 'CONDITIONS_MATCH_SOURCE_OFFER'
      : 'CONDITIONS_MATCH_ACCEPTED_OFFER',
    'ADDED_CONDITIONS_CONFIRMED',
  ];
  if (ruleSetVersion === 3) codes.push('SOURCE_OFFER_ACCEPTED');
  if (addendum && 'pricingSnapshotId' in addendum) {
    codes.splice(6);
    if (addendum.pricingSnapshotId !== null)
      codes.push('PRICING_SNAPSHOT_COHERENT');
    codes.push('PARENT_EXECUTED');
    if (addendum.pricingSnapshotId !== null)
      codes.push('CURRENCY_MATCHES_PARENT');
  }
  if (addendum && 'origin' in addendum)
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
  const results: unknown[] = input.results;
  if (results.length !== codes.length)
    throw new Error('Incomplete Contract Quality Check run.');
  const evaluatedAt = text(input.evaluatedAt);
  if (
    !Number.isFinite(Date.parse(evaluatedAt)) ||
    new Date(evaluatedAt).toISOString() !== evaluatedAt
  )
    throw new Error('Invalid Contract Quality Check instant.');
  return {
    id: text(input.id),
    contractVersionId: versionId,
    ruleSet: input.ruleSet,
    ruleSetVersion,
    actorWorkspaceMembershipId: text(input.actorWorkspaceMembershipId),
    evaluatedAt,
    results: codes.map((code, index) => {
      const result = object(results[index]);
      if (
        Object.keys(result).length !== 2 ||
        result.code !== code ||
        (result.status !== 'PASS' && result.status !== rules[code]) ||
        (code === 'DIRECT_ORIGIN_REVIEWED' && result.status !== 'WARNING')
      )
        throw new Error('Invalid Contract Quality Check result.');
      return { code, status: result.status === 'PASS' ? 'PASS' : rules[code] };
    }),
  };
}
export function readContractQualityHistory(
  value: unknown,
  binding: ContractQualityRunBinding,
): { items: ContractQualityRunView[]; nextCursor: string | null } {
  const input = object(value);
  if (
    !Array.isArray(input.items) ||
    input.items.length > 25 ||
    (input.nextCursor !== null && typeof input.nextCursor !== 'string')
  )
    throw new Error('Invalid Contract Quality Check history.');
  const items = input.items.map((item: unknown) =>
    readRecordedContractQualityRun(item, binding),
  );
  if (
    new Set(items.map((item) => item.id)).size !== items.length ||
    (input.nextCursor !== null && input.nextCursor !== items.at(-1)?.id)
  )
    throw new Error('Invalid Contract Quality Check cursor.');
  return { items, nextCursor: input.nextCursor };
}
function object(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new Error('Invalid Contract Quality Check object.');
  return Object.fromEntries(Object.entries(value));
}
function text(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0)
    throw new Error('Invalid Contract Quality Check text.');
  return value;
}
