import { describe, expect, it } from 'vitest';
import type { ActorContext } from '../access-types';
import type { CompanyGrantBundle } from '../access/company-grants';
import { readCurrentActor } from '../access/current-actor';
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

/** The actor without its live grant of `bundle`. */
function without(actor: ActorContext, bundle: CompanyGrantBundle) {
  return withCompany(actor, {
    grants: actor.activeCompany?.grants?.filter(
      (grant) => grant.bundle !== bundle,
    ),
  });
}

/** The actor with its grant of `bundle` replaced by an unparsed entry. */
function withRawGrant(
  actor: ActorContext,
  bundle: CompanyGrantBundle,
  patch: Record<string, unknown>,
): unknown {
  return {
    ...actor,
    activeCompany: {
      ...actor.activeCompany,
      grants: actor.activeCompany?.grants?.map((grant) =>
        grant.bundle === bundle ? { ...grant, ...patch } : grant,
      ),
    },
  };
}

function readActor(value: unknown) {
  return readCurrentActor({
    api: { request: async () => ({ status: 'ok', value }) },
  });
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
      certificationAuthority(without(actor, 'company_certification_reader')),
    ).toEqual(NONE);
  });

  it('reads Project read from the Project Access grant alone', () => {
    const actor = certificationActor({ manager: true });
    expect(
      certificationAuthority(without(actor, 'company_project_access')),
    ).toEqual(NONE);
    expect(
      certificationAuthority(
        withCompany(actor, {
          projectPermissions: undefined,
          projectPermissionAssignmentId: undefined,
          projectPermissionSetVersion: undefined,
        }),
      ),
    ).toEqual({ read: true, manage: true, approve: false, audit: false });
  });

  it('ignores the legacy Certification fields without their grants', () => {
    const actor = certificationActor({ manager: false });
    expect(
      certificationAuthority(
        withCompany(without(actor, 'company_certification_reader'), {
          certificationReaderPermissions: ['certification.read'],
          certificationReaderAssignmentId: 'certification-reader-grant',
          certificationReaderPermissionSetVersion: 'v1',
          certificationAuditorPermissions: ['certification.audit.record'],
          certificationAuditorAssignmentId: 'certification-auditor-grant',
          certificationAuditorPermissionSetVersion: 'v1',
        }),
      ),
    ).toEqual(NONE);
  });

  const brokenAuditorGrants: [string, Record<string, unknown>][] = [
    ['no assignment', { assignmentId: undefined }],
    ['a blank assignment', { assignmentId: ' ' }],
    ['no version', { permissionSetVersion: undefined }],
    ['no permission', { permissions: [] }],
    [
      'a duplicated permission',
      {
        permissions: [
          'certification.audit.record',
          'certification.audit.record',
        ],
      },
    ],
  ];
  it.each(brokenAuditorGrants)(
    'fails closed on an auditor grant with %s',
    async (_name, patch) => {
      const actor = certificationActor({ manager: false, auditor: true });
      expect(certificationAuthority(actor)).toEqual(
        expect.objectContaining({ audit: true }),
      );
      // The whole Actor is refused, so no Certification action is offered.
      expect(
        await readActor(
          withRawGrant(actor, 'company_certification_auditor', patch),
        ),
      ).toEqual({ status: 'error' });
      expect(
        certificationAuthority(without(actor, 'company_certification_auditor')),
      ).toEqual({
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
          grants: auditor.activeCompany?.grants?.map((grant) =>
            grant.bundle === 'company_certification_auditor'
              ? { ...grant, assignmentId: 'another-auditor-grant' }
              : grant,
          ),
        }),
      ),
    );
  });

  const brokenApproverGrants: [string, Record<string, unknown>][] = [
    ['no assignment', { assignmentId: undefined }],
    ['a blank assignment', { assignmentId: '  ' }],
    ['no version', { permissionSetVersion: undefined }],
    ['no permission', { permissions: [] }],
    [
      'a duplicated permission',
      {
        permissions: ['certification.approve', 'certification.approve'],
      },
    ],
  ];
  it.each(brokenApproverGrants)(
    'fails closed on an approver grant with %s',
    async (_name, patch) => {
      const actor = certificationActor({ manager: false, approver: true });
      expect(certificationAuthority(actor)).toEqual(
        expect.objectContaining({ approve: true }),
      );
      // The whole Actor is refused, so no Certification action is offered.
      expect(
        await readActor(
          withRawGrant(actor, 'company_certification_approver', patch),
        ),
      ).toEqual({ status: 'error' });
      expect(
        certificationAuthority(
          without(actor, 'company_certification_approver'),
        ),
      ).toEqual({
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
          grants: approver.activeCompany?.grants?.map((grant) =>
            grant.bundle === 'company_certification_approver'
              ? { ...grant, assignmentId: 'another-approver-grant' }
              : grant,
          ),
        }),
      ),
    );
  });
});
