import { describe, expect, it } from 'vitest';
import {
  displayDecimal,
  parseEstimateHistory,
  parseEstimateVersion,
  profitabilityAuthority,
  validMoney,
  validTarget,
} from './profitability-contract';
import { profitabilityActor, syntheticVersion } from './profitability.fixture';
import { readCurrentActor } from '../access/current-actor';
import { withoutCompanyGrants } from '../access/company-grants.test-fixture';
const scope = {
  workspaceId: 'workspace-1',
  companyId: 'company-1',
  opportunityId: 'opportunity-1',
};
describe('Profitability external boundary and exact decimal display', () => {
  it('preserves very large decimal amounts without binary float', () => {
    expect(displayDecimal('900719925474099312345.01', 'fr')).toBe(
      '900\u202f719\u202f925\u202f474\u202f099\u202f312\u202f345,01',
    );
    expect(displayDecimal('-0.01', 'ro')).toBe('−0,01');
    expect(displayDecimal('125.00', 'en')).toBe('125.00');
    expect(validMoney('1.005')).toBe(false);
    expect(validMoney('0.00', true)).toBe(false);
    expect(validTarget('+20.000')).toBe(true);
  });
  it('rejects hidden scopes, unknown decisions/rules, malformed decimals, duplicate keys and mixed currencies', () => {
    const version = syntheticVersion();
    for (const candidate of [
      { ...version, workspaceId: 'another' },
      { ...version, companyId: 'another' },
      { ...version, opportunityId: 'another' },
      {
        ...version,
        decision: {
          id: 'x',
          code: 'AUTO_APPROVE',
          decidedAt: version.createdAt,
          decidedByWorkspaceMembershipId: 'x',
        },
      },
      {
        ...version,
        calculationRule: { ...version.calculationRule, version: 2 },
      },
      { ...version, results: { ...version.results, profit: 25 } },
      { ...version, inputs: { ...version.inputs, costConfirmation: false } },
      {
        ...version,
        inputs: {
          ...version.inputs,
          directCosts: [
            version.inputs.directCosts[0],
            version.inputs.directCosts[0],
          ],
        },
      },
      {
        ...version,
        inputs: {
          ...version.inputs,
          directCosts: [{ ...version.inputs.directCosts[0], currency: 'USD' }],
        },
      },
    ])
      expect(() => parseEstimateVersion(candidate, scope)).toThrow();
  });
  it('checks bounded newest-first history with known head and one estimate identity', () => {
    expect(
      parseEstimateHistory(
        {
          items: [syntheticVersion(2), syntheticVersion()],
          latestVersionNumber: 2,
          nextCursor: 'stable',
        },
        scope,
      ).items,
    ).toHaveLength(2);
    for (const page of [
      { items: [syntheticVersion()], latestVersionNumber: null },
      {
        items: [syntheticVersion(), syntheticVersion(2)],
        latestVersionNumber: 2,
      },
      {
        items: Array.from({ length: 51 }, () => syntheticVersion()),
        latestVersionNumber: 1,
      },
      { items: [], latestVersionNumber: 1, nextCursor: 4 },
    ])
      expect(() => parseEstimateHistory(page, scope)).toThrow();
  });
  it('fails closed for externally unknown captured versions or grants', async () => {
    const company = profitabilityActor.activeCompany;
    expect(profitabilityAuthority(profitabilityActor)).toEqual({
      read: true,
      create: true,
      decide: false,
    });
    expect(
      profitabilityAuthority({
        ...profitabilityActor,
        activeCompany: company && {
          ...company,
          grants: withoutCompanyGrants(
            company.grants,
            'company_profitability_contributor',
          ),
        },
      }),
    ).toEqual({ read: false, create: false, decide: false });
    // An unknown captured version, or a permission its version does not
    // confer, is refused for the whole current Actor (#1332).
    const read = (current: unknown) =>
      readCurrentActor({
        api: { request: async () => ({ status: 'ok', value: current }) },
      });
    const withContributor = (change: Record<string, unknown>) => ({
      ...profitabilityActor,
      activeCompany: {
        ...company,
        grants: company?.grants?.map((grant) =>
          grant.bundle === 'company_profitability_contributor'
            ? { ...grant, ...change }
            : grant,
        ),
      },
    });
    expect((await read(profitabilityActor)).status).toBe('ok');
    expect(
      await read(withContributor({ permissionSetVersion: 'v999' })),
    ).toEqual({ status: 'error' });
    expect(
      await read(
        withContributor({
          permissions: [
            'commercial.profitability_estimate.read',
            'commercial.profitability_estimate.create',
            'commercial.profitability_estimate.decide',
          ],
        }),
      ),
    ).toEqual({ status: 'error' });
  });
});
