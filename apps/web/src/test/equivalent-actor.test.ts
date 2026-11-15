import { describe, expect, it } from 'vitest';
import { actorWithComparableCompanyGrants } from './equivalent-actor';

const permissions = ['document.read', 'document.register'];
const grant = {
  bundle: 'company_document_registrar',
  assignmentId: 'captured-registrar',
  permissionSetVersion: 'v1',
  permissions,
};
const actor = {
  internalUserId: 'user-1',
  displayName: 'Fictional member',
  activeCompany: {
    id: 'company-1',
    displayName: 'Fictional Company',
    grants: [grant],
  },
};

describe('equivalent actor evidence', () => {
  it('accepts the same captured permissions in another order', () => {
    const reordered = {
      ...actor,
      activeCompany: {
        ...actor.activeCompany,
        grants: [{ ...grant, permissions: [...permissions].reverse() }],
      },
    };
    expect(actorWithComparableCompanyGrants(reordered)).toEqual(
      actorWithComparableCompanyGrants(actor),
    );
  });

  it.each([
    ['a missing permission', permissions.slice(1)],
    ['an extra permission', [...permissions, 'document.correct']],
    ['a duplicate permission', [...permissions, permissions[0]]],
  ])('rejects %s', (_name, changed) => {
    const next = {
      ...actor,
      activeCompany: {
        ...actor.activeCompany,
        grants: [{ ...grant, permissions: changed }],
      },
    };
    expect(actorWithComparableCompanyGrants(next)).not.toEqual(
      actorWithComparableCompanyGrants(actor),
    );
  });

  it.each([
    { name: 'no grant', grants: [] },
    {
      name: 'a replaced assignment',
      grants: [{ ...grant, assignmentId: 'replacement' }],
    },
    {
      name: 'a changed version',
      grants: [{ ...grant, permissionSetVersion: 'v2' }],
    },
    {
      name: 'a changed bundle',
      grants: [{ ...grant, bundle: 'company_document_approver' }],
    },
  ])('keeps $name visible', ({ grants }) => {
    expect(
      actorWithComparableCompanyGrants({
        ...actor,
        activeCompany: { ...actor.activeCompany, grants },
      }),
    ).not.toEqual(actorWithComparableCompanyGrants(actor));
  });

  it('rejects an unrelated changed actor field', () => {
    expect(
      actorWithComparableCompanyGrants({ ...actor, displayName: 'Changed' }),
    ).not.toEqual(actorWithComparableCompanyGrants(actor));
  });
});
