import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, sql } from 'drizzle-orm';
import { AccountabilityService } from '../accountability/accountability.service.js';
import { INTERNAL_USER_PROVISIONED_ACTION } from '../accountability/accountability.types.js';
import { DatabaseContext } from '../database/database-context.js';
import {
  internalUsers,
  workspacePermissionGrants,
  workspaceMemberships,
  workspaces,
} from '../database/schema/index.js';
import {
  ACTIVE_COMPANY_CONTEXT_LOOKUP,
  type ActiveCompanyContextLookup,
} from './active-company-context.port.js';
import type {
  ActorContext,
  ExternalPrincipal,
  WorkspacePermission,
} from './access.types.js';
import {
  ACCESS_ADMISSION,
  type AccessAdmission,
  type AccessAdmissionDecision,
} from './access-admission.js';
import { CompanyPermissionResolver } from './company-permission-resolver.js';
import { COMPANY_CONTEXT_USE_PERMISSION } from './company-permissions.js';

@Injectable()
export class AccessService {
  constructor(
    private readonly databaseContext: DatabaseContext,
    private readonly accountability: AccountabilityService,
    @Inject(ACCESS_ADMISSION)
    private readonly admission: AccessAdmission,
    @Inject(ACTIVE_COMPANY_CONTEXT_LOOKUP)
    private readonly activeCompanyContexts: ActiveCompanyContextLookup,
    private readonly companyPermissions: CompanyPermissionResolver,
  ) {}

  async resolveActor(
    principal: ExternalPrincipal,
    requestedCompanyId?: string,
  ): Promise<ActorContext> {
    return this.databaseContext.transaction(async () => {
      const database = this.databaseContext.connection;
      const admissionDecision = this.admission.resolve(principal);
      const admissionWorkspace = admissionDecision
        ? await this.resolveAdmissionWorkspace(admissionDecision)
        : undefined;
      let internalUser = (
        await database
          .select()
          .from(internalUsers)
          .where(
            and(
              eq(internalUsers.externalProvider, principal.provider),
              eq(internalUsers.externalSubject, principal.subject),
            ),
          )
          .limit(1)
      )[0];

      let createdInternalUser = false;
      if (!internalUser) {
        if (!admissionWorkspace) throw new ForbiddenException();
        const [insertedInternalUser] = await database
          .insert(internalUsers)
          .values({
            // Compatibility for old binaries during expand/backfill only.
            workspaceId: admissionWorkspace.id,
            externalProvider: principal.provider,
            externalSubject: principal.subject,
            displayName: principal.displayName,
            email: principal.email,
          })
          .onConflictDoNothing()
          .returning();
        internalUser =
          insertedInternalUser ??
          (
            await database
              .select()
              .from(internalUsers)
              .where(
                and(
                  eq(internalUsers.externalProvider, principal.provider),
                  eq(internalUsers.externalSubject, principal.subject),
                ),
              )
              .limit(1)
          )[0];
        createdInternalUser = Boolean(insertedInternalUser);
        await database
          .insert(workspaceMemberships)
          .values({
            workspaceId: admissionWorkspace.id,
            internalUserId: internalUser.id,
          })
          .onConflictDoNothing();
      }

      if (internalUser.status !== 'active') throw new ForbiddenException();

      if (admissionWorkspace) {
        await database
          .insert(workspaceMemberships)
          .values({
            workspaceId: admissionWorkspace.id,
            internalUserId: internalUser.id,
          })
          .onConflictDoNothing();
      }
      const authority = await this.findActiveAuthority(
        internalUser.id,
        admissionWorkspace?.id,
      );
      if (!authority) throw new ForbiddenException();

      if (admissionDecision?.kind === 'bootstrap') {
        await database
          .insert(workspacePermissionGrants)
          .values(
            ['company.manage', 'company.assignment.manage'].map(
              (permission) => ({
                workspaceId: authority.workspace.id,
                workspaceMembershipId: authority.membership.id,
                permission: permission as WorkspacePermission,
              }),
            ),
          )
          .onConflictDoNothing();
      }

      if (!createdInternalUser) {
        const [updatedInternalUser] = await database
          .update(internalUsers)
          .set({
            displayName: principal.displayName,
            email: principal.email,
            updatedAt: sql`now()`,
          })
          .where(eq(internalUsers.id, internalUser.id))
          .returning();
        internalUser = updatedInternalUser;
      }

      const actor: ActorContext = {
        internalUserId: internalUser.id,
        workspaceMembershipId: authority.membership.id,
        workspaceId: authority.workspace.id,
        workspaceName: authority.workspace.name,
        displayName: internalUser.displayName,
        email: internalUser.email,
        active: true,
        workspacePermissions: await this.findWorkspacePermissions(
          authority.workspace.id,
          authority.membership.id,
        ),
      };

      if (requestedCompanyId !== undefined) {
        const canUseCompany =
          actor.workspacePermissions.includes('company.manage') ||
          (await this.companyPermissions.has(
            actor.workspaceId,
            actor.workspaceMembershipId,
            requestedCompanyId,
            COMPANY_CONTEXT_USE_PERMISSION,
          ));
        if (!canUseCompany) throw new ForbiddenException();
        const activeCompany = await this.activeCompanyContexts.findActive(
          actor.workspaceId,
          requestedCompanyId,
        );
        if (!activeCompany) throw new ForbiddenException();
        actor.activeCompany = activeCompany;
      }

      if (createdInternalUser) {
        await this.accountability.record({
          actor,
          action: INTERNAL_USER_PROVISIONED_ACTION,
          target: {
            type: 'internal_user',
            internalUserId: internalUser.id,
          },
          metadata: { identityProvider: principal.provider },
        });
      }

      return actor;
    });
  }

  private async resolveAdmissionWorkspace(
    decision: AccessAdmissionDecision,
  ): Promise<typeof workspaces.$inferSelect> {
    const database = this.databaseContext.connection;
    if (decision.kind === 'bootstrap') {
      const [workspace] = await database
        .insert(workspaces)
        .values({
          singletonKey: decision.workspaceKey,
          name: decision.workspaceName,
        })
        .onConflictDoUpdate({
          target: workspaces.singletonKey,
          set: { name: sql`excluded.name` },
        })
        .returning();
      return workspace;
    }
    const [workspace] = await database
      .select()
      .from(workspaces)
      .where(eq(workspaces.singletonKey, decision.workspaceKey))
      .limit(1);
    if (!workspace) throw new ForbiddenException();
    return workspace;
  }

  private async findActiveAuthority(
    internalUserId: string,
    workspaceId?: string,
  ) {
    const conditions = [
      eq(workspaceMemberships.internalUserId, internalUserId),
      eq(workspaceMemberships.status, 'active'),
    ];
    if (workspaceId)
      conditions.push(eq(workspaceMemberships.workspaceId, workspaceId));
    const [authority] = await this.databaseContext.connection
      .select({ membership: workspaceMemberships, workspace: workspaces })
      .from(workspaceMemberships)
      .innerJoin(
        workspaces,
        eq(workspaceMemberships.workspaceId, workspaces.id),
      )
      .where(and(...conditions))
      .orderBy(
        asc(workspaceMemberships.createdAt),
        asc(workspaceMemberships.id),
      )
      .limit(1);
    return authority;
  }

  private async findWorkspacePermissions(
    workspaceId: string,
    workspaceMembershipId: string,
  ): Promise<WorkspacePermission[]> {
    const grants = await this.databaseContext.connection
      .select({ permission: workspacePermissionGrants.permission })
      .from(workspacePermissionGrants)
      .where(
        and(
          eq(workspacePermissionGrants.workspaceId, workspaceId),
          eq(
            workspacePermissionGrants.workspaceMembershipId,
            workspaceMembershipId,
          ),
        ),
      );
    return grants.map((grant) => grant.permission);
  }
}
