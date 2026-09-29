import { describe, expect, it } from 'vitest';
import { actorWithComparableDocumentPermissions } from './equivalent-actor';

const documentPermissions = [
  'document.project.manage',
  'document.read',
  'document.register',
  'document.reference.read',
  'document.correct',
  'document.version.manage',
];

const actor = {
  internalUserId: 'user-1',
  displayName: 'Ada Ionescu',
  activeCompany: {
    id: 'company-1',
    displayName: 'PRISMA-PRIM',
    documentPermissionSetVersion: 'v3',
    documentPermissions,
  },
};

describe('equivalent actor evidence', () => {
  it('accepts the same document permissions in another order', () => {
    const reordered = {
      ...actor,
      activeCompany: {
        ...actor.activeCompany,
        documentPermissions: [
          ...documentPermissions.slice(1),
          documentPermissions[0],
        ],
      },
    };

    expect(actorWithComparableDocumentPermissions(reordered)).toEqual(
      actorWithComparableDocumentPermissions(actor),
    );
  });

  it.each([
    ['a missing permission', documentPermissions.slice(1)],
    [
      'an extra permission',
      [...documentPermissions, 'document.version.designate_official'],
    ],
    [
      'a duplicate permission',
      [...documentPermissions, documentPermissions[0]],
    ],
  ])('rejects %s', (_case, changedPermissions) => {
    const changed = {
      ...actor,
      activeCompany: {
        ...actor.activeCompany,
        documentPermissions: changedPermissions,
      },
    };

    expect(actorWithComparableDocumentPermissions(changed)).not.toEqual(
      actorWithComparableDocumentPermissions(actor),
    );
  });

  it('rejects an unrelated changed actor field', () => {
    const changed = { ...actor, displayName: 'Changed actor' };

    expect(actorWithComparableDocumentPermissions(changed)).not.toEqual(
      actorWithComparableDocumentPermissions(actor),
    );
  });
});
