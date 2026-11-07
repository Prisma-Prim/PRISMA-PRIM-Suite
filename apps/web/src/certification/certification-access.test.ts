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

const NONE = { read: false, manage: false, approve: false, audit: false };

describe('Certification authority projection', () => {
  it('offers reading, managing, approving and auditing from their captured grants', () => {
    expect(
      certificationAuthority(certificationActor({ manager: false })),
    ).toEqual({ read: true, manage: false, approve: false, audit: false });
    expect(
      certificationAuthority(
        certificationActor({ manager: true, approver: true, auditor: true }),
      ),
    ).toEqual({ read: true, manage: true, approve: true, audit: true });
    expect(
      certificationAuthority(
        certificationActor({ manager: false, approver: true }),
      ),
    ).toEqual({ read: true, manage: false, approve: true, audit: false });
    expect(
      certificationAuthority(
        certificationActor({ manager: false, auditor: true }),
      ),
    ).toEqual({ read: true, manage: false, approve: false, audit: true });
  });

  it.each([
    ['approver', certificationActor({ manager: false, approver: true })],
    ['auditor', certificationActor({ manager: false, auditor: true })],
  ])('counts the %s grant only alongside the reader grant', (_name, actor) => {
    expect(
      certificationAuthority(
        withCompany(actor, {
          certificationReaderPermissions: undefined,
          certificationReaderAssignmentId: undefined,
          certificationReaderPermissionSetVersion: undefined,
        }),
      ),
    ).toEqual(NONE);
  });

  const brokenAuditorGrants: [string, CompanyPatch][] = [
    ['no assignment', { certificationAuditorAssignmentId: undefined }],
    ['a blank assignment', { certificationAuditorAssignmentId: ' ' }],
    ['no version', { certificationAuditorPermissionSetVersion: undefined }],
    ['no permission', { certificationAuditorPermissions: [] }],
    [
      'a duplicated permission',
      {
        certificationAuditorPermissions: [
          'certification.audit.record',
          'certification.audit.record',
        ],
      },
    ],
  ];
  it.each(brokenAuditorGrants)(
    'fails closed on an auditor grant with %s',
    (_name, patch) => {
      const actor = withCompany(
        certificationActor({ manager: false, auditor: true }),
        patch,
      );
      expect(certificationAuthority(actor)).toEqual({
        read: true,
        manage: false,
        approve: false,
        audit: false,
      });
    },
  );

  it('changes the context key when the auditor grant changes', () => {
    const auditor = certificationActor({ manager: false, auditor: true });
    expect(certificationContextKey(auditor)).not.toBe(
      certificationContextKey(certificationActor({ manager: false })),
    );
    expect(certificationContextKey(auditor)).not.toBe(
      certificationContextKey(
        withCompany(auditor, {
          certificationAuditorAssignmentId: 'another-auditor-grant',
        }),
      ),
    );
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
        audit: false,
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
