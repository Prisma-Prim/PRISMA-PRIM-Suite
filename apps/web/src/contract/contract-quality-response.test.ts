import { expect, it } from 'vitest';
import {
  readContractQualityRun,
  readContractQualityHistory,
  readRecordedContractQualityRun,
  type ContractQualityRunBinding,
} from './contract-quality-response';
const run = {
  id: 'run-one',
  contractVersionId: 'version-one',
  ruleSet: 'CONTRACT_QUALITY_ILLUSTRATIVE',
  ruleSetVersion: 1,
  actorWorkspaceMembershipId: 'member-one',
  evaluatedAt: '2026-10-07T09:00:00.000Z',
  results: [
    { code: 'SOURCE_COMPANY_MATCHES', status: 'PASS' },
    { code: 'PARTY_AVAILABLE', status: 'PASS' },
    { code: 'PARTY_MATCHES_SOURCE', status: 'PASS' },
    { code: 'PARTY_IDENTITY_MATCHES_SOURCE', status: 'PASS' },
    { code: 'PARTY_IDENTITY_CURRENT', status: 'PASS' },
    { code: 'PARTY_TAX_ID_RECORDED', status: 'ERROR' },
    { code: 'PRICE_MATCHES_ACCEPTED_OFFER', status: 'PASS' },
    { code: 'PRICING_SNAPSHOT_COHERENT', status: 'PASS' },
    { code: 'CONDITIONS_MATCH_ACCEPTED_OFFER', status: 'PASS' },
    { code: 'ADDED_CONDITIONS_CONFIRMED', status: 'PASS' },
    { code: 'PROVISIONAL_MARKER_PRESENT', status: 'PASS' },
  ],
};
const v1: ContractQualityRunBinding = {
  versionId: 'version-one',
  termEndsOn: null,
  ruleSetVersion: 1,
};
const v2: ContractQualityRunBinding = { ...v1, ruleSetVersion: 2 };
it('validates complete exact-version attribution and runtime applicability', () => {
  expect(readContractQualityRun(run, v1)).toEqual(run);
  expect(() =>
    readContractQualityRun(run, { ...v1, versionId: 'version-two' }),
  ).toThrow();
  expect(() =>
    readContractQualityRun(run, { ...v1, termEndsOn: '2026-10-07' }),
  ).toThrow();
});
it('accepts rule set v2 with the v1 codes and severities only where the version binds it', () => {
  const adjusted = { ...run, ruleSetVersion: 2 };
  expect(readContractQualityRun(adjusted, v2)).toEqual(adjusted);
  expect(readRecordedContractQualityRun(adjusted, v2)).toEqual(adjusted);
  // A new, approval or signature run names exactly the bound rule set.
  expect(() => readContractQualityRun(adjusted, v1)).toThrow();
  expect(() => readContractQualityRun(run, v2)).toThrow();
  // An older v1 run may predate v2 on an adjusted version; never the reverse.
  expect(readRecordedContractQualityRun(run, v2)).toEqual(run);
  expect(() => readRecordedContractQualityRun(adjusted, v1)).toThrow();
});
it.each([
  { ...run, ruleSet: 'UNKNOWN' },
  { ...run, ruleSetVersion: 3 },
  { ...run, ruleSetVersion: '1' },
  { ...run, ruleSetVersion: 0 },
  { ...run, actorWorkspaceMembershipId: '' },
  { ...run, evaluatedAt: '2026-99-99' },
  { ...run, results: [] },
  {
    ...run,
    results: [{ code: 'UNKNOWN', status: 'PASS' }, ...run.results.slice(1)],
  },
  {
    ...run,
    results: [
      { code: 'SOURCE_COMPANY_MATCHES', status: 'WARNING' },
      ...run.results.slice(1),
    ],
  },
  {
    ...run,
    results: [
      { code: 'SOURCE_COMPANY_MATCHES', status: 'PASS', identity: 'hidden' },
      ...run.results.slice(1),
    ],
  },
])('rejects malformed or unknown run evidence', (value) => {
  expect(() => readContractQualityRun(value, v1)).toThrow();
  expect(() => readRecordedContractQualityRun(value, v2)).toThrow();
});
it('rejects unbounded, duplicate, cursor-mismatched or unbound history pages', () => {
  expect(
    readContractQualityHistory({ items: [run], nextCursor: 'run-one' }, v1),
  ).toEqual({ items: [run], nextCursor: 'run-one' });
  expect(
    readContractQualityHistory(
      {
        items: [{ ...run, id: 'run-two', ruleSetVersion: 2 }, run],
        nextCursor: null,
      },
      v2,
    ).items.map((item) => item.ruleSetVersion),
  ).toEqual([2, 1]);
  for (const page of [
    { items: [run, run], nextCursor: null },
    { items: Array.from({ length: 26 }, () => run), nextCursor: null },
    { items: [run], nextCursor: 'other' },
    { items: [{ ...run, ruleSetVersion: 2 }], nextCursor: null },
  ])
    expect(() => readContractQualityHistory(page, v1)).toThrow();
});
