import { expect, it } from 'vitest';
import {
  readContractQualityRun,
  readContractQualityHistory,
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
it('validates complete exact-version attribution and runtime applicability', () => {
  expect(readContractQualityRun(run, 'version-one', null)).toEqual(run);
  expect(() => readContractQualityRun(run, 'version-two', null)).toThrow();
  expect(() =>
    readContractQualityRun(run, 'version-one', '2026-10-07'),
  ).toThrow();
});
it.each([
  { ...run, ruleSet: 'UNKNOWN' },
  { ...run, ruleSetVersion: 2 },
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
  expect(() => readContractQualityRun(value, 'version-one', null)).toThrow();
});
it('rejects unbounded, duplicate or cursor-mismatched history pages', () => {
  expect(
    readContractQualityHistory(
      { items: [run], nextCursor: 'run-one' },
      'version-one',
      null,
    ),
  ).toEqual({ items: [run], nextCursor: 'run-one' });
  for (const page of [
    { items: [run, run], nextCursor: null },
    { items: Array.from({ length: 26 }, () => run), nextCursor: null },
    { items: [run], nextCursor: 'other' },
  ])
    expect(() =>
      readContractQualityHistory(page, 'version-one', null),
    ).toThrow();
});
