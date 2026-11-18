import { BadRequestException, Injectable } from '@nestjs/common';
import { and, asc, eq, gt, ilike, inArray, isNull } from 'drizzle-orm';
import { DatabaseContext } from '../database/database-context.js';
import {
  companyRoleAssignments,
  internalUsers,
  workspaceMemberships,
} from '../database/schema/core.js';
import type { ActorContext, CompanyId } from './access.types.js';
import { requireUuid } from './access-command-validation.js';
import {
  parseCompanyId,
  parseWorkspaceMembershipId,
} from './access-identifiers.js';
import { COMPANY_CERTIFICATION_AUDITOR_BUNDLE } from './company-permissions.js';
import { memberDisplayLabel, readMemberAuthority } from './member-authority.js';

const PAGE_SIZE = 25;
const MAX_LINKED_MEMBERS = 10;

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
    const { search, after, linked } = candidateQuery(input.query);
    const companyId = parseCompanyId(input.companyId);
    const items: CertificationTeamCandidate[] = [];
    let position = after;
    // The SQL filter admits only live Company auditor assignments. Access's
    // existing evaluator rechecks their complete Project/Client prerequisites.
    while (items.length <= PAGE_SIZE) {
      const rows = await this.candidateRows({
        workspaceId: input.actor.workspaceId,
        companyId,
        filter: { kind: 'search', search, after: position },
      });
      if (rows.length === 0) break;
      for (const row of rows) {
        position = row.id;
        const candidate = await this.eligibleCandidate(
          input.actor,
          companyId,
          row,
        );
        if (candidate) items.push(candidate);
        if (items.length > PAGE_SIZE) break;
      }
      if (rows.length < PAGE_SIZE + 1 || items.length > PAGE_SIZE) break;
    }
    const draftLinks: CertificationTeamCandidate[] = [];
    if (linked.length) {
      // A name query does not establish that an existing draft link was revoked.
      const rows = await this.candidateRows({
        workspaceId: input.actor.workspaceId,
        companyId,
        filter: { kind: 'linked', ids: linked },
      });
      for (const row of rows) {
        const candidate = await this.eligibleCandidate(
          input.actor,
          companyId,
          row,
        );
        if (candidate) draftLinks.push(candidate);
      }
    }
    const shown = items.slice(0, PAGE_SIZE);
    return {
      items: shown,
      ...(linked.length ? { draftLinks } : {}),
      nextCursor:
        items.length > PAGE_SIZE
          ? (shown.at(-1)?.workspaceMembershipId ?? null)
          : null,
    };
  }

  private candidateRows(input: {
    workspaceId: ActorContext['workspaceId'];
    companyId: CompanyId;
    filter:
      | { kind: 'search'; search: string; after: string | null }
      | { kind: 'linked'; ids: string[] };
  }) {
    return this.database.connection
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
          eq(companyRoleAssignments.companyId, input.companyId),
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
          eq(workspaceMemberships.workspaceId, input.workspaceId),
          eq(workspaceMemberships.status, 'active'),
          input.filter.kind === 'linked'
            ? inArray(workspaceMemberships.id, input.filter.ids)
            : and(
                input.filter.after
                  ? gt(workspaceMemberships.id, input.filter.after)
                  : undefined,
                input.filter.search
                  ? ilike(
                      internalUsers.displayName,
                      `%${input.filter.search.replace(/[\\%_]/gu, '\\$&')}%`,
                    )
                  : undefined,
              ),
        ),
      )
      .orderBy(asc(workspaceMemberships.id))
      .limit(PAGE_SIZE + 1);
  }

  private async eligibleCandidate(
    actor: ActorContext,
    companyId: CompanyId,
    row: { id: string; name: string },
  ): Promise<CertificationTeamCandidate | undefined> {
    const authority = await readMemberAuthority(this.database.connection, {
      workspaceId: actor.workspaceId,
      companyId,
      membershipId: parseWorkspaceMembershipId(row.id),
      lock: false,
    });
    if (!authority?.certificationAuditor) return undefined;
    return {
      workspaceMembershipId: row.id,
      displayLabel: memberDisplayLabel(row.name.trim().slice(0, 200), row.id),
    };
  }
}

function candidateQuery(query: unknown): {
  search: string;
  after: string | null;
  linked: string[];
} {
  if (!query || typeof query !== 'object' || Array.isArray(query))
    throw new BadRequestException('Invalid auditor search.');
  const values = Object.fromEntries(Object.entries(query));
  if (
    Object.keys(values).some(
      (key) => !['search', 'after', 'linked'].includes(key),
    ) ||
    (values.search !== undefined && typeof values.search !== 'string') ||
    (values.linked !== undefined &&
      (typeof values.linked !== 'string' ||
        values.linked.length > MAX_LINKED_MEMBERS * 37 - 1)) ||
    (typeof values.search === 'string' && values.search.length > 100)
  )
    throw new BadRequestException('Invalid auditor search.');
  const linked =
    typeof values.linked === 'string' ? values.linked.split(',') : [];
  if (linked.length > MAX_LINKED_MEMBERS)
    throw new BadRequestException('Too many linked auditors.');
  return {
    linked: [...new Set(linked.map(requireUuid))],
    search: typeof values.search === 'string' ? values.search.trim() : '',
    after: values.after === undefined ? null : requireUuid(values.after),
  };
}
