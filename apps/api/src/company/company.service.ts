import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, eq, isNull } from 'drizzle-orm';
import { requireWorkspacePermission } from '../access/access-policy.js';
import type { ActorContext } from '../access/access.types.js';
import { AccountabilityService } from '../accountability/accountability.service.js';
import { COMPANY_REGISTERED_ACTION } from '../accountability/accountability.types.js';
import { DatabaseContext } from '../database/database-context.js';
import { companies, companyRoleAssignments } from '../database/schema/index.js';
import type { CompanyRecord, RegisterCompanyCommand } from './company.types.js';

@Injectable()
export class CompanyService {
  constructor(
    private readonly databaseContext: DatabaseContext,
    private readonly accountability: AccountabilityService,
  ) {}

  async register(
    actor: ActorContext,
    command: RegisterCompanyCommand,
  ): Promise<CompanyRecord> {
    requireWorkspacePermission(actor, 'company.manage');
    const displayName = requireDisplayName(command.displayName);
    const idempotencyKey = requireIdempotencyKey(command.idempotencyKey);

    return this.databaseContext.transaction(async () => {
      const [inserted] = await this.databaseContext.connection
        .insert(companies)
        .values({
          workspaceId: actor.workspaceId,
          displayName,
          createdByInternalUserId: actor.internalUserId,
          createdByWorkspaceMembershipId: actor.workspaceMembershipId,
          registrationIdempotencyKey: idempotencyKey,
        })
        .onConflictDoNothing({
          target: [companies.workspaceId, companies.registrationIdempotencyKey],
        })
        .returning();
      const company =
        inserted ??
        (
          await this.databaseContext.connection
            .select()
            .from(companies)
            .where(
              and(
                eq(companies.workspaceId, actor.workspaceId),
                eq(companies.registrationIdempotencyKey, idempotencyKey),
              ),
            )
            .limit(1)
        )[0];
      if (inserted) {
        await this.accountability.record({
          actor,
          action: COMPANY_REGISTERED_ACTION,
          target: { type: 'company', companyId: company.id },
          metadata: {},
        });
      }
      return toCompanyRecord(company);
    });
  }

  async listVisible(actor: ActorContext): Promise<CompanyRecord[]> {
    const base = this.databaseContext.connection.select().from(companies);
    const source = actor.workspacePermissions.includes('company.manage')
      ? base
      : base.innerJoin(
          companyRoleAssignments,
          and(
            eq(companyRoleAssignments.workspaceId, companies.workspaceId),
            eq(companyRoleAssignments.companyId, companies.id),
            eq(
              companyRoleAssignments.workspaceMembershipId,
              actor.workspaceMembershipId,
            ),
            eq(companyRoleAssignments.bundle, 'company_context_access'),
            isNull(companyRoleAssignments.revokedAt),
          ),
        );
    const visibleCompanies = await source
      .where(
        and(
          eq(companies.workspaceId, actor.workspaceId),
          eq(companies.status, 'active'),
        ),
      )
      .orderBy(asc(companies.displayName), asc(companies.id));
    return visibleCompanies.map((row) =>
      toCompanyRecord('companies' in row ? row.companies : row),
    );
  }

  async get(actor: ActorContext, companyId: string): Promise<CompanyRecord> {
    requireWorkspacePermission(actor, 'company.manage');
    const [company] = await this.databaseContext.connection
      .select()
      .from(companies)
      .where(
        and(
          eq(companies.workspaceId, actor.workspaceId),
          eq(companies.id, companyId),
          eq(companies.status, 'active'),
        ),
      )
      .limit(1);
    if (!company) throw new NotFoundException();
    return toCompanyRecord(company);
  }
}

function requireDisplayName(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new BadRequestException('Company display name is required.');
  }
  return value.trim();
}

function requireIdempotencyKey(value: string | undefined): string {
  if (!value?.trim()) {
    throw new BadRequestException('Idempotency-Key header is required.');
  }
  return value.trim();
}

function toCompanyRecord(
  company: typeof companies.$inferSelect,
): CompanyRecord {
  return {
    id: company.id,
    workspaceId: company.workspaceId,
    displayName: company.displayName,
    status: company.status,
    createdAt: company.createdAt.toISOString(),
    createdByInternalUserId: company.createdByInternalUserId,
  };
}
