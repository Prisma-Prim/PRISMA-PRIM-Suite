import { describe, expect, it } from 'vitest';
import type { ActorContext } from '../access-types';
import {
  certificationAuthority,
  certificationContextKey,
} from './certification-access';
import { certificationActor } from './certification.test-fixture';

type CompanyPatch = Partial<NonNullable<ActorContext['activeCompany']>>;

/** The actor with its active Company's captured grants replaced. */
function withCompany(actor: ActorContext, patch: CompanyPatch): ActorContext {
  const company = actor.activeCompany;
  if (!company) throw new Error('Expected an active Company.');
  return { ...actor, activeCompany: { ...company, ...patch } };
}

describe('Certification authority projection', () => {
  it('offers reading, managing and approving from their captured grants', () => {
    expect(
      certificationAuthority(certificationActor({ manager: false })),
    ).toEqual({ read: true, manage: false, approve: false });
    expect(
      certificationAuthority(
        certificationActor({ manager: true, approver: true }),
      ),
    ).toEqual({ read: true, manage: true, approve: true });
    expect(
      certificationAuthority(
        certificationActor({ manager: false, approver: true }),
      ),
    ).toEqual({ read: true, manage: false, approve: true });
  });

  it('counts the approver grant only alongside the reader grant', () => {
    const approver = certificationActor({ manager: false, approver: true });
    expect(
      certificationAuthority(
        withCompany(approver, {
          certificationReaderPermissions: undefined,
          certificationReaderAssignmentId: undefined,
          certificationReaderPermissionSetVersion: undefined,
        }),
      ),
    ).toEqual({ read: false, manage: false, approve: false });
  });

  const brokenApproverGrants: [string, CompanyPatch][] = [
    ['no assignment', { certificationApproverAssignmentId: undefined }],
    ['a blank assignment', { certificationApproverAssignmentId: '  ' }],
    ['no version', { certificationApproverPermissionSetVersion: undefined }],
    ['no permission', { certificationApproverPermissions: [] }],
    [
      'a duplicated permission',
      {
        certificationApproverPermissions: [
          'certification.approve',
          'certification.approve',
        ],
      },
    ],
  ];
  it.each(brokenApproverGrants)(
    'fails closed on an approver grant with %s',
    (_name, patch) => {
      const actor = withCompany(
        certificationActor({ manager: false, approver: true }),
        patch,
      );
      expect(certificationAuthority(actor)).toEqual({
        read: true,
        manage: false,
        approve: false,
      });
    },
  );

  it('changes the context key when the approver grant changes', () => {
    const approver = certificationActor({ manager: false, approver: true });
    expect(certificationContextKey(approver)).not.toBe(
      certificationContextKey(certificationActor({ manager: false })),
    );
    expect(certificationContextKey(approver)).not.toBe(
      certificationContextKey(
        withCompany(approver, {
          certificationApproverAssignmentId: 'another-approver-grant',
        }),
      ),
    );
  });
});
