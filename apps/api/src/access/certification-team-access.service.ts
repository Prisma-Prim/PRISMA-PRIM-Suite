import { BadRequestException, Injectable } from '@nestjs/common';
import { and, asc, eq, gt, ilike, isNull } from 'drizzle-orm';
import { DatabaseContext } from '../database/database-context.js';
import {
  companyRoleAssignments,
  internalUsers,
  workspaceMemberships,
} from '../database/schema/core.js';
import type { ActorContext } from './access.types.js';
import { requireUuid } from './access-command-validation.js';
import {
  parseCompanyId,
  parseWorkspaceMembershipId,
} from './access-identifiers.js';
import { COMPANY_CERTIFICATION_AUDITOR_BUNDLE } from './company-permissions.js';
import { memberDisplayLabel, readMemberAuthority } from './member-authority.js';

const PAGE_SIZE = 25;

/** A team picker projection; no email, unrelated role or exclusion reason. */
export interface CertificationTeamCandidate {
  workspaceMembershipId: string;
  displayLabel: string;
}

/** Access owns eligibility; the caller first authorizes its exact Case. */
@Injectable()
export class CertificationTeamAccessService {
  constructor(private readonly database: DatabaseContext) {}

  async candidates(input: {
    actor: ActorContext;
    companyId: string;
    query: unknown;
  }) {
    const { search, after } = candidateQuery(input.query);
    const companyId = parseCompanyId(input.companyId);
    const items: CertificationTeamCandidate[] = [];
    let position = after;
    // The SQL filter admits only live Company auditor assignments. Access's
    // existing evaluator rechecks their complete Project/Client prerequisites.
    while (items.length <= PAGE_SIZE) {
      const rows = await this.database.connection
        .select({
          id: workspaceMemberships.id,
          name: internalUsers.displayName,
        })
        .from(workspaceMemberships)
        .innerJoin(
          internalUsers,
          and(
            eq(internalUsers.id, workspaceMemberships.internalUserId),
            eq(internalUsers.status, 'active'),
          ),
        )
        .innerJoin(
          companyRoleAssignments,
          and(
            eq(
              companyRoleAssignments.workspaceId,
              workspaceMemberships.workspaceId,
            ),
            eq(
              companyRoleAssignments.workspaceMembershipId,
              workspaceMemberships.id,
            ),
            eq(companyRoleAssignments.companyId, companyId),
            eq(
              companyRoleAssignments.bundle,
              COMPANY_CERTIFICATION_AUDITOR_BUNDLE,
            ),
            eq(companyRoleAssignments.permissionSetVersion, 'v1'),
            isNull(companyRoleAssignments.revokedAt),
          ),
        )
        .where(
          and(
            eq(workspaceMemberships.workspaceId, input.actor.workspaceId),
            eq(workspaceMemberships.status, 'active'),
            position ? gt(workspaceMemberships.id, position) : undefined,
            search
              ? ilike(
                  internalUsers.displayName,
                  `%${search.replace(/[\\%_]/gu, '\\$&')}%`,
                )
              : undefined,
          ),
        )
        .orderBy(asc(workspaceMemberships.id))
        .limit(PAGE_SIZE + 1);
      if (rows.length === 0) break;
      for (const row of rows) {
        position = row.id;
        const authority = await readMemberAuthority(this.database.connection, {
          workspaceId: input.actor.workspaceId,
          companyId,
          membershipId: parseWorkspaceMembershipId(row.id),
          lock: false,
        });
        if (authority?.certificationAuditor)
          items.push({
            workspaceMembershipId: row.id,
            displayLabel: memberDisplayLabel(
              row.name.trim().slice(0, 200),
              row.id,
            ),
          });
        if (items.length > PAGE_SIZE) break;
      }
      if (rows.length < PAGE_SIZE + 1 || items.length > PAGE_SIZE) break;
    }
    const shown = items.slice(0, PAGE_SIZE);
    return {
      items: shown,
      nextCursor:
        items.length > PAGE_SIZE
          ? (shown.at(-1)?.workspaceMembershipId ?? null)
          : null,
    };
  }
}

function candidateQuery(query: unknown): {
  search: string;
  after: string | null;
} {
  if (!query || typeof query !== 'object' || Array.isArray(query))
    throw new BadRequestException('Invalid auditor search.');
  const values = Object.fromEntries(Object.entries(query));
  if (
    Object.keys(values).some((key) => !['search', 'after'].includes(key)) ||
    (values.search !== undefined && typeof values.search !== 'string') ||
    (typeof values.search === 'string' && values.search.length > 100)
  )
    throw new BadRequestException('Invalid auditor search.');
  return {
    search: typeof values.search === 'string' ? values.search.trim() : '',
    after: values.after === undefined ? null : requireUuid(values.after),
  };
}
