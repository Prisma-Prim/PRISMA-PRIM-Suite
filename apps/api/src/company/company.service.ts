import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { requireWorkspacePermission } from '../access/access-policy.js';
import type { ActorContext } from '../access/access.types.js';
import { CompanyPermissionResolver } from '../access/company-permission-resolver.js';
import { COMPANY_CONTEXT_USE_PERMISSION } from '../access/company-permissions.js';
import { AccountabilityService } from '../accountability/accountability.service.js';
import { COMPANY_REGISTERED_ACTION } from '../accountability/accountability.types.js';
import { DatabaseContext } from '../database/database-context.js';
import { companies } from '../database/schema/index.js';
import type { CompanyRecord, RegisterCompanyCommand } from './company.types.js';

@Injectable()
export class CompanyService {
  constructor(
    private readonly databaseContext: DatabaseContext,
    private readonly accountability: AccountabilityService,
    private readonly companyPermissions: CompanyPermissionResolver,
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
      if (!company)
        throw new Error('The idempotent Company command could not be resolved.');
      if (!inserted) assertSameRegistrationCommand(company, displayName);
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
    const canManageAll = actor.workspacePermissions.includes('company.manage');
    const assignedCompanyIds = canManageAll
      ? []
      : await this.companyPermissions.listCompanyIds(
          actor.workspaceId,
          actor.workspaceMembershipId,
          COMPANY_CONTEXT_USE_PERMISSION,
        );
    if (!canManageAll && assignedCompanyIds.length === 0) return [];
    const visibility = canManageAll
      ? and(
          eq(companies.workspaceId, actor.workspaceId),
          eq(companies.status, 'active'),
        )
      : and(
          eq(companies.workspaceId, actor.workspaceId),
          eq(companies.status, 'active'),
          inArray(companies.id, assignedCompanyIds),
        );
    const visibleCompanies = await this.databaseContext.connection
      .select()
      .from(companies)
      .where(visibility)
      .orderBy(asc(companies.displayName), asc(companies.id));
    return visibleCompanies.map(toCompanyRecord);
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

function assertSameRegistrationCommand(
  company: typeof companies.$inferSelect,
  displayName: string,
): void {
  if (company.displayName !== displayName) {
    throw new BadRequestException(
      'Idempotency-Key was already used for another command.',
    );
  }
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
