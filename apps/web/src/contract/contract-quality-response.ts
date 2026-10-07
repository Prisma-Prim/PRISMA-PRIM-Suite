const rules = {
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
  TERM_END_NOT_PASSED: 'WARNING',
  PROVISIONAL_MARKER_PRESENT: 'ERROR',
} satisfies Record<string, 'WARNING' | 'ERROR'>;
export type ContractQualityCode = keyof typeof rules;
export interface ContractQualityRunView {
  id: string;
  contractVersionId: string;
  ruleSet: 'CONTRACT_QUALITY_ILLUSTRATIVE';
  ruleSetVersion: 1;
  actorWorkspaceMembershipId: string;
  evaluatedAt: string;
  results: {
    code: ContractQualityCode;
    status: 'PASS' | 'WARNING' | 'ERROR';
  }[];
}
export function readContractQualityRun(
  value: unknown,
  versionId: string,
  termEndsOn: string | null,
): ContractQualityRunView {
  const input = object(value);
  if (
    input.ruleSet !== 'CONTRACT_QUALITY_ILLUSTRATIVE' ||
    input.ruleSetVersion !== 1 ||
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
    'PRICE_MATCHES_ACCEPTED_OFFER',
    'PRICING_SNAPSHOT_COHERENT',
    'CONDITIONS_MATCH_ACCEPTED_OFFER',
    'ADDED_CONDITIONS_CONFIRMED',
  ];
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
    ruleSetVersion: input.ruleSetVersion,
    actorWorkspaceMembershipId: text(input.actorWorkspaceMembershipId),
    evaluatedAt,
    results: codes.map((code, index) => {
      const result = object(results[index]);
      if (
        Object.keys(result).length !== 2 ||
        result.code !== code ||
        (result.status !== 'PASS' && result.status !== rules[code])
      )
        throw new Error('Invalid Contract Quality Check result.');
      return { code, status: result.status === 'PASS' ? 'PASS' : rules[code] };
    }),
  };
}
export function readContractQualityHistory(
  value: unknown,
  versionId: string,
  termEndsOn: string | null,
): { items: ContractQualityRunView[]; nextCursor: string | null } {
  const input = object(value);
  if (
    !Array.isArray(input.items) ||
    input.items.length > 25 ||
    (input.nextCursor !== null && typeof input.nextCursor !== 'string')
  )
    throw new Error('Invalid Contract Quality Check history.');
  const items = input.items.map((item: unknown) =>
    readContractQualityRun(item, versionId, termEndsOn),
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
