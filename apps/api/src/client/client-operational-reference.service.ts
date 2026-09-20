import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, eq, inArray, or, sql } from 'drizzle-orm';
import type { ActorContext } from '../access/access.types.js';
import { COMPANY_DIRECTOR_CLIENT_ACCESS_BUNDLE } from '../access/company-permissions.js';
import { DatabaseContext } from '../database/database-context.js';
import {
  clientAccounts,
  clientCompanyRelationships,
  clientUnionOperations,
  clientUnionReviews,
  clientUnionReversals,
  companyRoleAssignments,
  workspacePermissionGrants,
} from '../database/schema/index.js';

export interface ProjectClientReference {
  id: string;
  displayName: string;
  clientDossierId?: string;
}

/** Client owns the identity and relationship checks used by operational records. */
@Injectable()
export class ClientOperationalReferenceService {
  constructor(private readonly databaseContext: DatabaseContext) {}

  async readReferenceClient(actor: ActorContext, originalClientId: string) {
    const companyId = this.requireClientRead(actor);
    const [client] = await this.databaseContext.connection
      .select({
        id: clientAccounts.id,
        displayName: clientAccounts.displayName,
        status: clientAccounts.status,
      })
      .from(clientAccounts)
      .innerJoin(
        clientCompanyRelationships,
        and(
          eq(
            clientCompanyRelationships.workspaceId,
            clientAccounts.workspaceId,
          ),
          eq(clientCompanyRelationships.clientAccountId, clientAccounts.id),
          eq(clientCompanyRelationships.companyId, companyId),
          eq(clientCompanyRelationships.status, 'active'),
        ),
      )
      .where(
        and(
          eq(clientAccounts.workspaceId, actor.workspaceId),
          eq(clientAccounts.id, originalClientId),
          inArray(clientAccounts.status, ['active', 'superseded']),
        ),
      );
    if (!client) throw new NotFoundException();
    return client;
  }

  async readProjectReferences(
    actor: ActorContext,
    originalClientIds: readonly string[],
    lockAuthority = false,
  ): Promise<Map<string, ProjectClientReference>> {
    const companyId = this.requireClientRead(actor);
    if (lockAuthority) await this.lockClientReadAuthority(actor, companyId);
    const uniqueOriginalIds = [...new Set(originalClientIds)];
    if (uniqueOriginalIds.length === 0) return new Map();

    const visibleClients = await this.databaseContext.connection
      .select({
        id: clientAccounts.id,
        displayName: clientAccounts.displayName,
      })
      .from(clientAccounts)
      .innerJoin(
        clientCompanyRelationships,
        and(
          eq(
            clientCompanyRelationships.workspaceId,
            clientAccounts.workspaceId,
          ),
          eq(clientCompanyRelationships.clientAccountId, clientAccounts.id),
          eq(clientCompanyRelationships.companyId, companyId),
          eq(clientCompanyRelationships.status, 'active'),
        ),
      )
      .where(
        and(
          eq(clientAccounts.workspaceId, actor.workspaceId),
          inArray(clientAccounts.id, uniqueOriginalIds),
          inArray(clientAccounts.status, ['active', 'superseded']),
        ),
      );
    const references = new Map<string, ProjectClientReference>(
      visibleClients.map((client) => [client.id, client]),
    );
    const activeCompany = actor.activeCompany;
    if (
      !activeCompany ||
      !activeCompany.clientPermissions.includes('client.read') ||
      references.size === 0
    )
      return references;

    const currentDossierByOriginal = new Map(
      [...references.keys()].map((clientId) => [clientId, clientId]),
    );
    const unresolvedOriginalIds = new Set(currentDossierByOriginal.keys());
    const invalidOriginalIds = new Set<string>();
    const visitedByOriginal = new Map<string, Set<string>>();

    while (unresolvedOriginalIds.size > 0) {
      const currentDossierIds = [
        ...new Set(
          [...unresolvedOriginalIds]
            .map((originalId) => currentDossierByOriginal.get(originalId))
            .filter((dossierId) => dossierId !== undefined),
        ),
      ];
      if (currentDossierIds.length === 0) break;
      const activeUnions = await this.databaseContext.connection
        .select({
          canonicalClientId: clientUnionOperations.canonicalClientId,
          firstClientId: clientUnionReviews.firstClientId,
          secondClientId: clientUnionReviews.secondClientId,
        })
        .from(clientUnionOperations)
        .innerJoin(
          clientUnionReviews,
          and(
            eq(
              clientUnionReviews.workspaceId,
              clientUnionOperations.workspaceId,
            ),
            eq(
              clientUnionReviews.reference,
              clientUnionOperations.reviewReference,
            ),
          ),
        )
        .leftJoin(
          clientUnionReversals,
          and(
            eq(
              clientUnionReversals.workspaceId,
              clientUnionOperations.workspaceId,
            ),
            eq(clientUnionReversals.operationId, clientUnionOperations.id),
          ),
        )
        .where(
          and(
            eq(clientUnionOperations.workspaceId, actor.workspaceId),
            sql`${clientUnionReversals.operationId} IS NULL`,
            or(
              inArray(clientUnionReviews.firstClientId, currentDossierIds),
              inArray(clientUnionReviews.secondClientId, currentDossierIds),
            ),
          ),
        );

      for (const originalId of [...unresolvedOriginalIds]) {
        const currentDossierId = currentDossierByOriginal.get(originalId);
        if (!currentDossierId) {
          invalidOriginalIds.add(originalId);
          unresolvedOriginalIds.delete(originalId);
          continue;
        }
        const visited = visitedByOriginal.get(originalId) ?? new Set<string>();
        visitedByOriginal.set(originalId, visited);
        if (visited.has(currentDossierId)) {
          invalidOriginalIds.add(originalId);
          unresolvedOriginalIds.delete(originalId);
          continue;
        }
        visited.add(currentDossierId);
        const candidates = new Set(
          activeUnions
            .filter(
              (operation) =>
                operation.firstClientId === currentDossierId ||
                operation.secondClientId === currentDossierId,
            )
            .map((operation) => operation.canonicalClientId)
            .filter((candidateId) => candidateId !== currentDossierId),
        );
        if (candidates.size === 0) {
          unresolvedOriginalIds.delete(originalId);
          continue;
        }
        if (candidates.size !== 1) {
          invalidOriginalIds.add(originalId);
          unresolvedOriginalIds.delete(originalId);
          continue;
        }
        const [nextDossierId] = candidates;
        if (!nextDossierId) {
          invalidOriginalIds.add(originalId);
          unresolvedOriginalIds.delete(originalId);
          continue;
        }
        currentDossierByOriginal.set(originalId, nextDossierId);
      }
    }

    const candidateDossierIds = [
      ...new Set(
        [...currentDossierByOriginal]
          .filter(([originalId]) => !invalidOriginalIds.has(originalId))
          .map(([, dossierId]) => dossierId),
      ),
    ];
    if (candidateDossierIds.length === 0) return references;
    const readableDossiers = await this.databaseContext.connection
      .select({ id: clientAccounts.id })
      .from(clientAccounts)
      .innerJoin(
        clientCompanyRelationships,
        and(
          eq(
            clientCompanyRelationships.workspaceId,
            clientAccounts.workspaceId,
          ),
          eq(clientCompanyRelationships.clientAccountId, clientAccounts.id),
          eq(clientCompanyRelationships.companyId, companyId),
          eq(clientCompanyRelationships.status, 'active'),
        ),
      )
      .where(
        and(
          eq(clientAccounts.workspaceId, actor.workspaceId),
          inArray(clientAccounts.id, candidateDossierIds),
          eq(clientAccounts.status, 'active'),
        ),
      );
    const readableDossierIds = new Set(
      readableDossiers.map((dossier) => dossier.id),
    );
    for (const [originalId, reference] of references) {
      const clientDossierId = currentDossierByOriginal.get(originalId);
      if (
        clientDossierId &&
        !invalidOriginalIds.has(originalId) &&
        readableDossierIds.has(clientDossierId)
      )
        references.set(originalId, { ...reference, clientDossierId });
    }
    return references;
  }

  /** Call inside the owning command transaction, once for a new reference. */
  async lockActiveReferenceClient(actor: ActorContext, clientId: string) {
    const companyId = this.requireClientRead(actor);
    await this.lockClientReadAuthority(actor, companyId);
    // Union and reversal lock Client identities before relationships. Use the same
    // order and recheck status after waiting, so a concurrent reversal cannot pass
    // its snapshot fence after a successful new operational reference.
    const [client] = await this.databaseContext.connection
      .select()
      .from(clientAccounts)
      .where(
        and(
          eq(clientAccounts.workspaceId, actor.workspaceId),
          eq(clientAccounts.id, clientId),
        ),
      )
      .for('update');
    if (!client || client.status !== 'active') throw new NotFoundException();
    const [relationship] = await this.databaseContext.connection
      .select({ id: clientCompanyRelationships.id })
      .from(clientCompanyRelationships)
      .where(
        and(
          eq(clientCompanyRelationships.workspaceId, actor.workspaceId),
          eq(clientCompanyRelationships.clientAccountId, clientId),
          eq(clientCompanyRelationships.companyId, companyId),
          eq(clientCompanyRelationships.status, 'active'),
        ),
      )
      .for('share');
    if (!relationship) throw new NotFoundException();
    return client;
  }

  /** Advance the reversal fence only for a material operation in this transaction. */
  async recordReferenceUse(actor: ActorContext, clientId: string) {
    const client = await this.lockActiveReferenceClient(actor, clientId);
    if (client.version >= 2147483647)
      throw new ConflictException('Client reference version is exhausted.');
    await this.databaseContext.connection
      .update(clientAccounts)
      .set({ version: client.version + 1, updatedAt: sql`now()` })
      .where(
        and(
          eq(clientAccounts.workspaceId, actor.workspaceId),
          eq(clientAccounts.id, clientId),
        ),
      );
    return { id: client.id, displayName: client.displayName };
  }

  private requireClientRead(actor: ActorContext): string {
    if (
      !actor.activeCompany ||
      (!actor.workspacePermissions.includes('client.manage') &&
        !actor.activeCompany.clientPermissions.includes('client.read'))
    )
      throw new ForbiddenException();
    return actor.activeCompany.id;
  }

  private async lockClientReadAuthority(
    actor: ActorContext,
    companyId: string,
  ): Promise<void> {
    if (actor.workspacePermissions.includes('client.manage')) {
      const managerGrants = await this.databaseContext.connection
        .select({ id: workspacePermissionGrants.id })
        .from(workspacePermissionGrants)
        .where(
          and(
            eq(workspacePermissionGrants.workspaceId, actor.workspaceId),
            eq(
              workspacePermissionGrants.workspaceMembershipId,
              actor.workspaceMembershipId,
            ),
            eq(workspacePermissionGrants.permission, 'client.manage'),
          ),
        )
        .for('share');
      if (managerGrants.length > 0) return;
    }

    const assignmentId = actor.activeCompany?.clientPermissionAssignmentId;
    if (
      assignmentId &&
      actor.activeCompany?.clientPermissions.includes('client.read')
    ) {
      const assignments = await this.databaseContext.connection
        .select({ id: companyRoleAssignments.id })
        .from(companyRoleAssignments)
        .where(
          and(
            eq(companyRoleAssignments.id, assignmentId),
            eq(companyRoleAssignments.workspaceId, actor.workspaceId),
            eq(
              companyRoleAssignments.workspaceMembershipId,
              actor.workspaceMembershipId,
            ),
            eq(companyRoleAssignments.companyId, companyId),
            eq(
              companyRoleAssignments.bundle,
              COMPANY_DIRECTOR_CLIENT_ACCESS_BUNDLE,
            ),
            inArray(companyRoleAssignments.permissionSetVersion, ['v1', 'v2']),
            sql`${companyRoleAssignments.revokedAt} IS NULL`,
          ),
        )
        .for('share');
      if (assignments.length > 0) return;
    }

    throw new ForbiddenException();
  }
}
