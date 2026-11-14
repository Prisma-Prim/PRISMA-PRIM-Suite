import type { ActorContext } from '../access-types';
import { grantOf, holds } from '../access/company-grants';

/**
 * What the captured Certification grants let this actor attempt. The server
 * rechecks every grant live; this projection only decides what to offer.
 */
export type CertificationAuthority =
  | { read: false; manage: false; approve: false; audit: false }
  | { read: true; manage: boolean; approve: boolean; audit: boolean };

/**
 * Readers consult Cases; a programme manager also records steps, an approver
 * decides on the proposed audit team and an auditor records audit results
 * when the Case links them to the approved team's leader. Like the server,
 * each role counts only alongside the reader grant. Grants are read only
 * through the Company grants accessor, whose parser refuses an unrecognized
 * bundle, permission, assignment or version.
 */
export function certificationAuthority(
  actor: ActorContext,
): CertificationAuthority {
  const company = actor.activeCompany;
  const read =
    actor.active === true &&
    nonblank(actor.internalUserId) &&
    nonblank(actor.workspaceId) &&
    nonblank(actor.workspaceMembershipId) &&
    nonblank(company?.id) &&
    holds(company, 'company_project_access', 'project.read') &&
    holds(company, 'company_certification_reader', 'certification.read');
  if (!read)
    return { read: false, manage: false, approve: false, audit: false };
  return {
    read: true,
    manage: holds(
      company,
      'company_certification_programme_manager',
      'certification.programme.manage',
    ),
    approve: holds(
      company,
      'company_certification_approver',
      'certification.approve',
    ),
    audit: holds(
      company,
      'company_certification_auditor',
      'certification.audit.record',
    ),
  };
}

/** Changes whenever identity, Company or a captured Certification grant changes. */
export function certificationContextKey(actor: ActorContext): string {
  const company = actor.activeCompany;
  return JSON.stringify([
    actor.internalUserId,
    actor.workspaceId,
    actor.workspaceMembershipId,
    actor.active,
    company?.id,
    grantOf(company, 'company_project_access') ?? null,
    grantOf(company, 'company_certification_reader') ?? null,
    grantOf(company, 'company_certification_programme_manager') ?? null,
    grantOf(company, 'company_certification_approver') ?? null,
    grantOf(company, 'company_certification_auditor') ?? null,
  ]);
}

function nonblank(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}
