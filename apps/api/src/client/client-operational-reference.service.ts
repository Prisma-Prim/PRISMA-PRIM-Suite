import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, eq, inArray, or, sql } from 'drizzle-orm';
import type { ActorContext } from '../access/access.types.js';
import { COMPANY_DIRECTOR_CLIENT_ACCESS_BUNDLE } from '../access/company-permissions.js';
import { DatabaseContext } from '../database/database-context.js';
import { ClientReferenceStateDrift } from '../database/client-reference-state-drift.js';
import {
  clientAccounts,
  clientCompanyRelationships,
  clientLegalEntities,
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

export type ClientLegalRecipientSelection =
  | { readonly kind: 'PRIMARY' }
  | { readonly kind: 'ADDITIONAL'; readonly legalEntityId: string };

export interface LockedClientLegalRecipient {
  readonly originalClientAccountId: string;
  readonly currentClientAccountId: string;
  readonly currentClientVersion: number;
  readonly recipient:
    | {
        readonly kind: 'PRIMARY';
        readonly legalName: string;
        readonly taxId: string | null;
        readonly legalAddress: string | null;
      }
    | {
        readonly kind: 'ADDITIONAL';
        readonly additionalLegalEntityId: string;
        readonly legalName: string;
        readonly taxId: string | null;
        readonly legalAddress: string | null;
      };
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
    lockClientsForUpdate = false,
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
      (!activeCompany.clientPermissions.includes('client.read') &&
        !lockAuthority) ||
      references.size === 0
    )
      return references;

    const { currentDossierByOriginal, invalidOriginalIds, visitedByOriginal } =
      await this.resolveCurrentDossiers(actor, references.keys());

    const candidateDossierIds = [
      ...new Set(
        [...currentDossierByOriginal]
          .filter(([originalId]) => !invalidOriginalIds.has(originalId))
          .map(([, dossierId]) => dossierId),
      ),
    ];
    if (candidateDossierIds.length === 0) {
      if (!lockAuthority) return references;
      return this.lockAndRecheckReferences(
        actor,
        companyId,
        uniqueOriginalIds,
        references,
        [...visitedByOriginal.values()].flatMap((visited) => [...visited]),
        currentDossierByOriginal,
        invalidOriginalIds,
        lockClientsForUpdate,
      );
    }
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
        readableDossierIds.has(clientDossierId) &&
        activeCompany.clientPermissions.includes('client.read')
      )
        references.set(originalId, { ...reference, clientDossierId });
    }
    if (!lockAuthority) return references;
    return this.lockAndRecheckReferences(
      actor,
      companyId,
      uniqueOriginalIds,
      references,
      [...visitedByOriginal.values()].flatMap((visited) => [...visited]),
      currentDossierByOriginal,
      invalidOriginalIds,
      lockClientsForUpdate,
    );
  }

  /** Current Client identity for matching; display permissions never change the equality rule. */
  async resolveProjectLinkClients(
    actor: ActorContext,
    originalIds: readonly string[],
    lock = false,
  ): Promise<Map<string, string>> {
    const readable = await this.readProjectReferences(
      actor,
      originalIds,
      lock,
      lock,
    );
    const resolution = await this.resolveCurrentDossiers(
      actor,
      readable.keys(),
    );
    return new Map(
      [...resolution.currentDossierByOriginal].filter(
        ([id]) => !resolution.invalidOriginalIds.has(id),
      ),
    );
  }

  /** Fence an existing Project's original read boundary without imposing new-use eligibility. */
  async lockReadableProjectReferences(
    actor: ActorContext,
    originalIds: readonly string[],
  ) {
    const companyId = this.requireClientRead(actor);
    await this.lockClientReadAuthority(actor, companyId);
    const ids = [...new Set(originalIds)].sort();
    if (ids.length === 0) return new Map<string, ProjectClientReference>();
    await this.databaseContext.connection
      .select({ id: clientAccounts.id })
      .from(clientAccounts)
      .where(
        and(
          eq(clientAccounts.workspaceId, actor.workspaceId),
          inArray(clientAccounts.id, ids),
        ),
      )
      .orderBy(asc(clientAccounts.id))
      .for('share');
    await this.databaseContext.connection
      .select({ id: clientCompanyRelationships.id })
      .from(clientCompanyRelationships)
      .where(
        and(
          eq(clientCompanyRelationships.workspaceId, actor.workspaceId),
          eq(clientCompanyRelationships.companyId, companyId),
          inArray(clientCompanyRelationships.clientAccountId, ids),
        ),
      )
      .orderBy(asc(clientCompanyRelationships.id))
      .for('share');
    const references = await this.readProjectReferences(actor, ids);
    if (ids.some((id) => !references.has(id))) throw new NotFoundException();
    return references;
  }

  /** Live Company Client identity-read authority only; no current-original or relationship eligibility.
   * Authorized receipt replay uses this fence before deciding whether a new recipient binding is needed.
   */
  async lockRecipientReadAuthority(actor: ActorContext): Promise<void> {
    if (!actor.activeCompany?.clientPermissions.includes('client.read'))
      throw new ForbiddenException();
    await this.lockCompanyClientReadAuthority(actor, actor.activeCompany.id);
  }

  /**
   * Resolves and locks one legal recipient through Client's identity and
   * relationship ownership. Offer receives only the fixed copy and fence data.
   */
  async lockOfferRecipient(
    actor: ActorContext,
    originalClientAccountId: string,
    selection: ClientLegalRecipientSelection,
  ): Promise<LockedClientLegalRecipient> {
    await this.lockRecipientReadAuthority(actor);
    const references = await this.readProjectReferences(
      actor,
      [originalClientAccountId],
      true,
      true,
    );
    const reference = references.get(originalClientAccountId);
    if (!reference) throw new NotFoundException();
    const currentClientAccountId = reference.clientDossierId ?? reference.id;
    const [client] = await this.databaseContext.connection
      .select({
        id: clientAccounts.id,
        displayName: clientAccounts.displayName,
        taxId: clientAccounts.taxId,
        address: clientAccounts.address,
        version: clientAccounts.version,
        status: clientAccounts.status,
      })
      .from(clientAccounts)
      .where(
        and(
          eq(clientAccounts.workspaceId, actor.workspaceId),
          eq(clientAccounts.id, currentClientAccountId),
          eq(clientAccounts.status, 'active'),
        ),
      )
      .for('share');
    if (!client) throw new NotFoundException();
    if (selection.kind === 'PRIMARY') {
      return {
        originalClientAccountId,
        currentClientAccountId: client.id,
        currentClientVersion: client.version,
        recipient: {
          kind: 'PRIMARY',
          legalName: client.displayName,
          taxId: client.taxId,
          legalAddress: client.address,
        },
      };
    }
    const [entity] = await this.databaseContext.connection
      .select({
        id: clientLegalEntities.id,
        legalName: clientLegalEntities.legalName,
        taxId: clientLegalEntities.taxId,
        legalAddress: clientLegalEntities.legalAddress,
      })
      .from(clientLegalEntities)
      .where(
        and(
          eq(clientLegalEntities.workspaceId, actor.workspaceId),
          eq(clientLegalEntities.clientAccountId, client.id),
          eq(clientLegalEntities.id, selection.legalEntityId),
        ),
      )
      .for('share');
    if (!entity) throw new NotFoundException();
    return {
      originalClientAccountId,
      currentClientAccountId: client.id,
      currentClientVersion: client.version,
      recipient: {
        kind: 'ADDITIONAL',
        additionalLegalEntityId: entity.id,
        legalName: entity.legalName,
        taxId: entity.taxId,
        legalAddress: entity.legalAddress,
      },
    };
  }

  /**
   * Offer has its own authority to evaluate recorded content. This inspection
   * lends no Client read permission and returns no live identity or dossier id.
   * Call only inside the authorized Offer transaction. Client owns resolution
   * and uses the same identity-before-relationship fence as union and reversal.
   */
  async inspectOfferQualityContext(input: {
    actor: ActorContext;
    companyId: string;
    originalClientAccountId: string;
    snapshotOriginalClientAccountId: string | null;
    recipient: ClientLegalRecipientSelection;
    recordedIdentity: {
      legalName: string;
      taxId: string | null;
      legalAddress: string | null;
    };
  }): Promise<{
    recipientAvailable: boolean;
    recipientIdentityCurrent: boolean;
    pricingClientContextCoherent: boolean;
  }> {
    const { actor, companyId } = input;
    if (actor.activeCompany?.id !== companyId) throw new ForbiddenException();
    const originals = [
      ...new Set([
        input.originalClientAccountId,
        ...(input.snapshotOriginalClientAccountId
          ? [input.snapshotOriginalClientAccountId]
          : []),
      ]),
    ];
    const before = await this.resolveCurrentDossiers(actor, originals);
    const traversed = [
      ...new Set([
        ...originals,
        ...[...before.visitedByOriginal.values()].flatMap((ids) => [...ids]),
      ]),
    ].sort();
    const clients = await this.databaseContext.connection
      .select()
      .from(clientAccounts)
      .where(
        and(
          eq(clientAccounts.workspaceId, actor.workspaceId),
          inArray(clientAccounts.id, traversed),
        ),
      )
      .orderBy(asc(clientAccounts.id))
      .for('update');
    const relationships = await this.databaseContext.connection
      .select()
      .from(clientCompanyRelationships)
      .where(
        and(
          eq(clientCompanyRelationships.workspaceId, actor.workspaceId),
          eq(clientCompanyRelationships.companyId, companyId),
          inArray(clientCompanyRelationships.clientAccountId, traversed),
        ),
      )
      .orderBy(asc(clientCompanyRelationships.id))
      .for('share');
    const after = await this.resolveCurrentDossiers(actor, originals);
    // Reference equality and recorded identity are independent of recipient
    // availability. Archiving a relationship does not change either identity.
    const fencedClientId = (original: string): string | undefined => {
      const id = after.currentDossierByOriginal.get(original);
      if (
        !id ||
        before.invalidOriginalIds.has(original) ||
        after.invalidOriginalIds.has(original) ||
        before.currentDossierByOriginal.get(original) !== id ||
        !clients.some((client) => client.id === id)
      )
        return undefined;
      return id;
    };
    const clientId = fencedClientId(input.originalClientAccountId);
    const client = clients.find((row) => row.id === clientId);
    let identity:
      | { legalName: string; taxId: string | null; legalAddress: string | null }
      | undefined;
    if (client && input.recipient.kind === 'PRIMARY')
      identity = {
        legalName: client.displayName,
        taxId: client.taxId,
        legalAddress: client.address,
      };
    if (client && input.recipient.kind === 'ADDITIONAL') {
      const [entity] = await this.databaseContext.connection
        .select()
        .from(clientLegalEntities)
        .where(
          and(
            eq(clientLegalEntities.workspaceId, actor.workspaceId),
            eq(clientLegalEntities.clientAccountId, client.id),
            eq(clientLegalEntities.id, input.recipient.legalEntityId),
          ),
        )
        .for('share');
      identity = entity;
    }
    return {
      recipientAvailable:
        identity !== undefined &&
        client?.status === 'active' &&
        relationships.some(
          (relationship) =>
            relationship.clientAccountId === clientId &&
            relationship.status === 'active',
        ),
      recipientIdentityCurrent:
        identity !== undefined &&
        identity.legalName === input.recordedIdentity.legalName &&
        identity.taxId === input.recordedIdentity.taxId &&
        identity.legalAddress === input.recordedIdentity.legalAddress,
      pricingClientContextCoherent:
        clientId !== undefined &&
        input.snapshotOriginalClientAccountId !== null &&
        fencedClientId(input.snapshotOriginalClientAccountId) === clientId,
    };
  }

  /** Advance the union/reversal fence only after a new Offer will commit. */
  async recordLockedReferenceUse(
    actor: ActorContext,
    resolution: LockedClientLegalRecipient,
  ): Promise<void> {
    if (resolution.currentClientVersion >= 2_147_483_647)
      throw new ConflictException('Client reference version is exhausted.');
    const updated = await this.databaseContext.connection
      .update(clientAccounts)
      .set({
        version: resolution.currentClientVersion + 1,
        updatedAt: sql`now()`,
      })
      .where(
        and(
          eq(clientAccounts.workspaceId, actor.workspaceId),
          eq(clientAccounts.id, resolution.currentClientAccountId),
          eq(clientAccounts.version, resolution.currentClientVersion),
          eq(clientAccounts.status, 'active'),
        ),
      )
      .returning({ id: clientAccounts.id });
    if (updated.length !== 1) throw new NotFoundException();
  }

  private async resolveCurrentDossiers(
    actor: ActorContext,
    originalIds: Iterable<string>,
  ) {
    const currentDossierByOriginal = new Map(
      [...originalIds].map((clientId) => [clientId, clientId]),
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

    return { currentDossierByOriginal, invalidOriginalIds, visitedByOriginal };
  }

  /**
   * Exact retries use the same Client identity-before-relationship lock order
   * as union and reversal. Re-read after waiting so their latest state wins.
   */
  private async lockAndRecheckReferences(
    actor: ActorContext,
    companyId: string,
    originalIds: readonly string[],
    expected: Map<string, ProjectClientReference>,
    traversedIds: readonly string[],
    expectedHeads: ReadonlyMap<string, string>,
    invalidOriginalIds: ReadonlySet<string>,
    lockClientsForUpdate: boolean,
  ): Promise<Map<string, ProjectClientReference>> {
    const clientIds = [...new Set([...originalIds, ...traversedIds])].sort();
    const lockedClients = await this.databaseContext.connection
      .select({ id: clientAccounts.id, status: clientAccounts.status })
      .from(clientAccounts)
      .where(
        and(
          eq(clientAccounts.workspaceId, actor.workspaceId),
          inArray(clientAccounts.id, clientIds),
        ),
      )
      .orderBy(asc(clientAccounts.id))
      .for(lockClientsForUpdate ? 'update' : 'share');
    if (lockedClients.length !== clientIds.length)
      throw new NotFoundException();
    const lockedRelationships = await this.databaseContext.connection
      .select({
        id: clientCompanyRelationships.id,
        clientAccountId: clientCompanyRelationships.clientAccountId,
        status: clientCompanyRelationships.status,
      })
      .from(clientCompanyRelationships)
      .where(
        and(
          eq(clientCompanyRelationships.workspaceId, actor.workspaceId),
          eq(clientCompanyRelationships.companyId, companyId),
          inArray(clientCompanyRelationships.clientAccountId, clientIds),
        ),
      )
      .orderBy(asc(clientCompanyRelationships.id))
      .for('share');

    const currentHeads = await this.resolveCurrentDossiers(actor, originalIds);
    const current = await this.readProjectReferences(actor, originalIds);
    for (const originalId of originalIds) {
      const headId = expectedHeads.get(originalId);
      const currentHeadId =
        currentHeads.currentDossierByOriginal.get(originalId);
      const before = expected.get(originalId);
      const after = current.get(originalId);
      if (
        !headId ||
        !currentHeadId ||
        invalidOriginalIds.has(originalId) ||
        currentHeads.invalidOriginalIds.has(originalId) ||
        !before ||
        !after ||
        before.id !== after.id
      )
        throw new NotFoundException();
      // A union/reversal can win the wait without removing the original's
      // visibility. Its new head must be locked in a fresh whole transaction;
      // acquiring it here could invert Client's identity/relationship order.
      if (currentHeadId !== headId) {
        // Minimal Workspace management may read the original without a
        // canonical projection. Check head availability directly, without
        // widening that projection or taking a new out-of-order row lock.
        const [readableHead] = await this.databaseContext.connection
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
              eq(clientAccounts.id, currentHeadId),
              eq(clientAccounts.status, 'active'),
            ),
          );
        if (!readableHead) throw new NotFoundException();
        throw new ClientReferenceStateDrift();
      }
      if (
        !lockedClients.some(
          (client) => client.id === headId && client.status === 'active',
        ) ||
        !lockedRelationships.some(
          (relationship) =>
            relationship.clientAccountId === headId &&
            relationship.status === 'active',
        )
      )
        throw new NotFoundException();
      if (
        before.displayName !== after.displayName ||
        before.clientDossierId !== after.clientDossierId
      )
        throw new ClientReferenceStateDrift();
    }
    return current;
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

    await this.lockCompanyClientReadAuthority(actor, companyId);
  }

  private async lockCompanyClientReadAuthority(
    actor: ActorContext,
    companyId: string,
  ): Promise<void> {
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
