import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import type { ActorContext } from '../access/access.types.js';
import { CompanyContextAuthorization } from '../access/company-context-authorization.js';
import { ClientUnionAccountabilityService } from '../accountability/client-union-accountability.service.js';
import { DatabaseContext } from '../database/database-context.js';
import {
  clientAccounts,
  clientCompanyRelationships,
  clientUnionCommands,
  clientUnionComparisonParticipants,
  clientUnionComparisonRelationships,
  clientUnionComparisons,
  clientUnionOperationCompanies,
  clientUnionOperationRelationships,
  clientUnionOperationSnapshots,
  clientUnionOperations,
  companies,
} from '../database/schema/index.js';
import type { ClientContact } from './client.types.js';
import {
  normalizeUnionCommand,
  requireComparedClientAccountIds,
  requireIdempotencyKey,
  requireReason,
  type NormalizedUnionCommand,
} from './client-union-validation.js';
import { reservedIdentifierTargets } from './client-union-history.js';
import {
  CLIENT_UNION_CONFIRMED_ACTION,
  CLIENT_UNION_REVERSED_ACTION,
  CLIENT_UNION_SELECTABLE_FIELDS,
  MULTIPLE_DUPLICATE_CANDIDATES_REQUIRE_DATA_REMEDIATION,
  type ClientUnionComparison,
  type ClientUnionContactSource,
  type ClientUnionOperationDetail,
  type ClientUnionSelectableField,
} from './client-union.types.js';

const MAXIMUM_CANONICAL_CONTACTS = 50;

type ClientRow = typeof clientAccounts.$inferSelect;
type RelationshipRow = {
  id: string;
  clientAccountId: string;
  companyId: string;
  status: 'active' | 'archived';
  companyStatus: 'active' | 'inactive';
  companyDisplayName: string;
};
type UnionOperationRow = typeof clientUnionOperations.$inferSelect;

interface ResolvedPair {
  participants: [ClientRow, ClientRow];
  normalizedIdentifier: string;
  relationships: RelationshipRow[];
  affectedCompanies: { id: string; displayName: string }[];
}

@Injectable()
export class ClientUnionService {
  constructor(
    private readonly databaseContext: DatabaseContext,
    private readonly companyAuthorization: CompanyContextAuthorization,
    private readonly accountability: ClientUnionAccountabilityService,
  ) {}

  async compare(
    actor: ActorContext,
    clientAccountIds: unknown,
  ): Promise<ClientUnionComparison> {
    const requested = requireComparedClientAccountIds(clientAccountIds);
    const selectedCompanyId = requireSelectedCompany(actor);
    return this.databaseContext.transaction(async () => {
      const pair = await this.resolveCandidatePair(actor, requested);
      if (pair.kind === 'remediation') {
        return {
          outcome: MULTIPLE_DUPLICATE_CANDIDATES_REQUIRE_DATA_REMEDIATION,
        };
      }
      const resolved = pair.value;
      await this.requireCompleteResolverAuthority(actor, resolved);

      const [comparison] = await this.databaseContext.connection
        .insert(clientUnionComparisons)
        .values({
          workspaceId: actor.workspaceId,
          actorWorkspaceMembershipId: actor.workspaceMembershipId,
          selectedCompanyId,
          normalizedIdentifier: resolved.normalizedIdentifier,
        })
        .returning({ reference: clientUnionComparisons.reference });
      if (!comparison) {
        throw new Error('The union comparison could not be persisted.');
      }
      await this.databaseContext.connection
        .insert(clientUnionComparisonParticipants)
        .values(
          resolved.participants.map((participant) => ({
            workspaceId: actor.workspaceId,
            comparisonReference: comparison.reference,
            clientAccountId: participant.id,
            capturedVersion: participant.version,
          })),
        );
      if (resolved.relationships.length > 0) {
        await this.databaseContext.connection
          .insert(clientUnionComparisonRelationships)
          .values(
            resolved.relationships.map((relationship) => ({
              workspaceId: actor.workspaceId,
              comparisonReference: comparison.reference,
              clientAccountId: relationship.clientAccountId,
              companyId: relationship.companyId,
              relationshipId: relationship.id,
            })),
          );
      }

      return {
        outcome: 'comparison' as const,
        comparison_reference: comparison.reference,
        normalizedIdentifier: resolved.normalizedIdentifier,
        clients: resolved.participants.map((participant) => ({
          id: participant.id,
          displayName: participant.displayName,
          taxId: participant.taxId,
          address: participant.address,
          telephone: participant.telephone,
          generalEmail: participant.generalEmail,
          contacts: participant.contacts,
          businessActivity: participant.businessActivity,
          version: participant.version,
          relatedToActiveCompany: resolved.relationships.some(
            (relationship) =>
              relationship.clientAccountId === participant.id &&
              relationship.companyId === selectedCompanyId &&
              relationship.status === 'active',
          ),
          involvedCompanyDisplayNames: resolved.relationships
            .filter(
              (relationship) =>
                relationship.clientAccountId === participant.id &&
                relationship.status === 'active',
            )
            .map((relationship) => relationship.companyDisplayName)
            .toSorted(),
          // Both compared dossiers are live participants; neither is superseded.
          unitedWithClientAccountId: null,
          contactSources: participant.contacts.map((_contact, index) => ({
            clientAccountId: participant.id,
            index,
          })),
        })),
        affectedCompanies: resolved.affectedCompanies,
        differingFields: differingSelectableFields(resolved.participants),
      };
    });
  }

  async confirm(
    actor: ActorContext,
    command: {
      comparisonReference: unknown;
      canonicalClientAccountId: unknown;
      fieldSelections: unknown;
      contactConsolidations: unknown;
      reason: unknown;
      confirmedCompanyIds: unknown;
      idempotencyKey: string | undefined;
    },
  ): Promise<ClientUnionOperationDetail> {
    const normalized = normalizeUnionCommand(command);
    requireSelectedCompany(actor);
    return this.databaseContext.transaction(async () => {
      const replay = await this.replayedOperation(actor, {
        idempotencyKey: normalized.idempotencyKey,
        intent: unionIntent(normalized),
      });
      if (replay) return this.describeOperation(actor, replay);

      const comparison = await this.requireFreshComparison(actor, normalized);
      const { resolved, canonical, superseded } = comparison;
      await this.requireCompleteResolverAuthority(actor, resolved);
      requireConfirmedCompanySet(
        normalized.confirmedCompanyIds,
        resolved.affectedCompanies.map((company) => company.id),
      );
      requireReviewedDifferences(normalized, resolved.participants);

      const canonicalContacts = unionContacts({
        canonical,
        superseded,
        consolidations: normalized.contactConsolidations,
      });
      const selectedFields = selectedFieldValues({
        normalized,
        canonical,
        superseded,
      });

      await this.requireNoArchivedRelationshipCollision({
        actor,
        canonical,
        superseded,
        relationships: resolved.relationships,
        affectedCompanyIds: resolved.affectedCompanies.map(
          (company) => company.id,
        ),
      });

      const [operation] = await this.databaseContext.connection
        .insert(clientUnionOperations)
        .values({
          workspaceId: actor.workspaceId,
          canonicalClientAccountId: canonical.id,
          supersededClientAccountId: superseded.id,
          normalizedIdentifier: resolved.normalizedIdentifier,
          confirmedByInternalUserId: actor.internalUserId,
          confirmedByWorkspaceMembershipId: actor.workspaceMembershipId,
          unionReason: normalized.reason,
        })
        .returning();
      if (!operation) {
        throw new Error('The union operation could not be persisted.');
      }

      await this.databaseContext.connection
        .insert(clientUnionOperationSnapshots)
        .values(
          [
            { client: canonical, role: 'canonical' as const },
            { client: superseded, role: 'superseded' as const },
          ].map(({ client, role }) => ({
            workspaceId: actor.workspaceId,
            unionOperationId: operation.id,
            clientAccountId: client.id,
            role,
            version: client.version,
            displayName: client.displayName,
            taxId: client.taxId,
            address: client.address,
            telephone: client.telephone,
            generalEmail: client.generalEmail,
            contacts: client.contacts,
            businessActivity: client.businessActivity,
          })),
        );

      await this.databaseContext.connection
        .insert(clientUnionOperationCompanies)
        .values(
          resolved.affectedCompanies.map((company) => ({
            workspaceId: actor.workspaceId,
            unionOperationId: operation.id,
            companyId: company.id,
          })),
        );

      await this.databaseContext.connection
        .update(clientAccounts)
        .set({
          ...selectedFields,
          contacts: canonicalContacts,
          version: canonical.version + 1,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(clientAccounts.workspaceId, actor.workspaceId),
            eq(clientAccounts.id, canonical.id),
            eq(clientAccounts.version, canonical.version),
          ),
        );

      await this.projectCanonicalRelationships({
        actor,
        operationId: operation.id,
        canonical,
        superseded,
        relationships: resolved.relationships,
        affectedCompanyIds: resolved.affectedCompanies.map(
          (company) => company.id,
        ),
      });

      await this.databaseContext.connection.insert(clientUnionCommands).values({
        workspaceId: actor.workspaceId,
        actorWorkspaceMembershipId: actor.workspaceMembershipId,
        idempotencyKey: normalized.idempotencyKey,
        intent: unionIntent(normalized),
        unionOperationId: operation.id,
      });

      await this.accountability.recordProjections({
        workspaceId: actor.workspaceId,
        unionOperationId: operation.id,
        companyIds: resolved.affectedCompanies.map((company) => company.id),
        action: CLIENT_UNION_CONFIRMED_ACTION,
      });

      return this.describeOperation(actor, operation);
    });
  }

  async reverse(
    actor: ActorContext,
    command: {
      unionOperationId: string;
      reason: unknown;
      idempotencyKey: string | undefined;
    },
  ): Promise<ClientUnionOperationDetail> {
    const reason = requireReason(command.reason);
    const idempotencyKey = requireIdempotencyKey(command.idempotencyKey);
    requireSelectedCompany(actor);
    return this.databaseContext.transaction(async () => {
      const replay = await this.replayedOperation(actor, {
        idempotencyKey,
        intent: reversalIntent(command.unionOperationId, reason),
      });
      if (replay) return this.describeOperation(actor, replay);

      const operation = await this.requireOperation(
        actor,
        command.unionOperationId,
      );
      if (operation.status !== 'confirmed') {
        throw unionUnavailable();
      }
      await this.lockIdentifier(
        actor.workspaceId,
        operation.normalizedIdentifier,
      );
      const capturedCompanyIds = await this.requireCapturedCompaniesStillActive(
        actor,
        operation.id,
      );
      await this.requireResolverAuthorityForCompanies(
        actor,
        capturedCompanyIds,
      );
      await this.requireReversibleState(actor, operation);

      const snapshots = await this.operationSnapshots(actor, operation.id);
      const canonicalSnapshot = snapshots.find(
        (snapshot) => snapshot.role === 'canonical',
      );
      if (!canonicalSnapshot) throw unionUnavailable();

      const [canonical] = await this.databaseContext.connection
        .select()
        .from(clientAccounts)
        .where(
          and(
            eq(clientAccounts.workspaceId, actor.workspaceId),
            eq(clientAccounts.id, operation.canonicalClientAccountId),
          ),
        )
        .limit(1);
      if (!canonical) throw unionUnavailable();

      await this.databaseContext.connection
        .update(clientAccounts)
        .set({
          displayName: canonicalSnapshot.displayName,
          taxId: canonicalSnapshot.taxId,
          address: canonicalSnapshot.address,
          telephone: canonicalSnapshot.telephone,
          generalEmail: canonicalSnapshot.generalEmail,
          contacts: canonicalSnapshot.contacts,
          businessActivity: canonicalSnapshot.businessActivity,
          // The version keeps increasing so a reversal can never be mistaken
          // for the pre-union state by an optimistic correction.
          version: canonical.version + 1,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(clientAccounts.workspaceId, actor.workspaceId),
            eq(clientAccounts.id, canonical.id),
            eq(clientAccounts.version, canonical.version),
          ),
        );

      await this.removeUnionCreatedRelationships(actor, operation.id);

      const [reversed] = await this.databaseContext.connection
        .update(clientUnionOperations)
        .set({
          status: 'reversed',
          reversedAt: new Date(),
          reversedByInternalUserId: actor.internalUserId,
          reversedByWorkspaceMembershipId: actor.workspaceMembershipId,
          reversalReason: reason,
        })
        .where(
          and(
            eq(clientUnionOperations.workspaceId, actor.workspaceId),
            eq(clientUnionOperations.id, operation.id),
            eq(clientUnionOperations.status, 'confirmed'),
          ),
        )
        .returning();
      if (!reversed) throw unionUnavailable();

      await this.databaseContext.connection.insert(clientUnionCommands).values({
        workspaceId: actor.workspaceId,
        actorWorkspaceMembershipId: actor.workspaceMembershipId,
        idempotencyKey,
        intent: reversalIntent(command.unionOperationId, reason),
        unionOperationId: operation.id,
      });

      await this.accountability.recordProjections({
        workspaceId: actor.workspaceId,
        unionOperationId: operation.id,
        companyIds: capturedCompanyIds,
        action: CLIENT_UNION_REVERSED_ACTION,
      });

      return this.describeOperation(actor, reversed);
    });
  }

  async readOperation(
    actor: ActorContext,
    unionOperationId: string,
  ): Promise<ClientUnionOperationDetail> {
    requireSelectedCompany(actor);
    return this.databaseContext.transaction(async () => {
      const operation = await this.requireOperation(actor, unionOperationId);
      const capturedCompanyIds = await this.capturedCompanyIds(
        actor,
        operation.id,
      );
      await this.requireResolverAuthorityForCompanies(
        actor,
        capturedCompanyIds,
      );
      return this.describeOperation(actor, operation);
    });
  }

  private async resolveCandidatePair(
    actor: ActorContext,
    requested: [string, string],
  ): Promise<{ kind: 'remediation' } | { kind: 'pair'; value: ResolvedPair }> {
    const accounts = await this.databaseContext.connection
      .select()
      .from(clientAccounts)
      .where(
        and(
          eq(clientAccounts.workspaceId, actor.workspaceId),
          inArray(clientAccounts.id, [...requested]),
          eq(clientAccounts.status, 'active'),
        ),
      );
    const [first, second, ...extra] = accounts.toSorted((left, right) =>
      left.id.localeCompare(right.id),
    );
    if (!first || !second || extra.length > 0) throw unionUnavailable();
    const normalizedIdentifier = first.taxId;
    if (
      normalizedIdentifier === null ||
      normalizedIdentifier.length === 0 ||
      second.taxId !== normalizedIdentifier
    ) {
      throw unionUnavailable();
    }
    for (const participant of [first, second]) {
      if (await this.participatesInOpenUnion(actor, participant.id)) {
        throw unionUnavailable();
      }
    }

    const group = await this.completeCandidateGroup(
      actor,
      normalizedIdentifier,
    );
    if (group.length > 2) {
      // The remediation outcome is itself hidden data: it states that a third
      // dossier shares the identifier. It is released only after the complete
      // current resolver authority over the live candidate review scope passes.
      const groupRelationships = await this.participantRelationships(
        actor,
        group,
      );
      const groupCompanies = activeAffectedCompanies(groupRelationships);
      if (groupCompanies.length === 0) throw unionUnavailable();
      await this.requireResolverAuthorityForCompanies(
        actor,
        groupCompanies.map((company) => company.id),
      );
      return { kind: 'remediation' };
    }
    if (
      group.length !== 2 ||
      !group.includes(first.id) ||
      !group.includes(second.id)
    ) {
      throw unionUnavailable();
    }

    const relationships = await this.participantRelationships(actor, [
      first.id,
      second.id,
    ]);
    const affectedCompanies = activeAffectedCompanies(relationships);
    if (affectedCompanies.length === 0) throw unionUnavailable();
    return {
      kind: 'pair',
      value: {
        participants: [first, second],
        normalizedIdentifier,
        relationships,
        affectedCompanies,
      },
    };
  }

  private async completeCandidateGroup(
    actor: ActorContext,
    normalizedIdentifier: string,
  ): Promise<string[]> {
    const current = await this.databaseContext.connection
      .select({ id: clientAccounts.id })
      .from(clientAccounts)
      .where(
        and(
          eq(clientAccounts.workspaceId, actor.workspaceId),
          eq(clientAccounts.status, 'active'),
          eq(clientAccounts.taxId, normalizedIdentifier),
        ),
      );
    const reserved = await reservedIdentifierTargets(
      this.databaseContext.connection,
      actor.workspaceId,
      normalizedIdentifier,
    );
    const live = new Set<string>();
    for (const account of current) {
      if (
        !(await this.participatesInOpenUnion(actor, account.id, 'superseded'))
      )
        live.add(account.id);
    }
    for (const target of reserved) live.add(target);
    return [...live];
  }

  private async participatesInOpenUnion(
    actor: ActorContext,
    clientAccountId: string,
    role?: 'superseded',
  ): Promise<boolean> {
    const condition =
      role === 'superseded'
        ? eq(clientUnionOperations.supersededClientAccountId, clientAccountId)
        : sql<boolean>`(
            ${clientUnionOperations.canonicalClientAccountId} = ${clientAccountId}
            OR ${clientUnionOperations.supersededClientAccountId} = ${clientAccountId}
          )`;
    const [open] = await this.databaseContext.connection
      .select({ id: clientUnionOperations.id })
      .from(clientUnionOperations)
      .where(
        and(
          eq(clientUnionOperations.workspaceId, actor.workspaceId),
          eq(clientUnionOperations.status, 'confirmed'),
          condition,
        ),
      )
      .limit(1);
    return open !== undefined;
  }

  private async participantRelationships(
    actor: ActorContext,
    clientAccountIds: readonly string[],
  ): Promise<RelationshipRow[]> {
    return this.databaseContext.connection
      .select({
        id: clientCompanyRelationships.id,
        clientAccountId: clientCompanyRelationships.clientAccountId,
        companyId: clientCompanyRelationships.companyId,
        status: clientCompanyRelationships.status,
        companyStatus: companies.status,
        companyDisplayName: companies.displayName,
      })
      .from(clientCompanyRelationships)
      .innerJoin(
        companies,
        and(
          eq(companies.workspaceId, clientCompanyRelationships.workspaceId),
          eq(companies.id, clientCompanyRelationships.companyId),
        ),
      )
      .where(
        and(
          eq(clientCompanyRelationships.workspaceId, actor.workspaceId),
          inArray(clientCompanyRelationships.clientAccountId, [
            ...clientAccountIds,
          ]),
        ),
      )
      .orderBy(asc(clientCompanyRelationships.id));
  }

  private async requireCompleteResolverAuthority(
    actor: ActorContext,
    resolved: ResolvedPair,
  ): Promise<void> {
    const affectedCompanyIds = resolved.affectedCompanies.map(
      (company) => company.id,
    );
    await this.requireResolverAuthorityForCompanies(actor, affectedCompanyIds);
    // Current Client read authority: each participant must be readable inside
    // the authorized affected set rather than through Workspace ownership.
    for (const participant of resolved.participants) {
      const readable = resolved.relationships.some(
        (relationship) =>
          relationship.clientAccountId === participant.id &&
          relationship.status === 'active' &&
          affectedCompanyIds.includes(relationship.companyId),
      );
      if (!readable) throw unionUnavailable();
    }
  }

  private async requireResolverAuthorityForCompanies(
    actor: ActorContext,
    companyIds: readonly string[],
  ): Promise<void> {
    if (companyIds.length === 0) throw unionUnavailable();
    const authorized =
      await this.companyAuthorization.duplicateReviewAuthorizedCompanyIds(
        actor,
        companyIds,
      );
    if (!companyIds.every((companyId) => authorized.has(companyId))) {
      throw unionUnavailable();
    }
  }

  private async requireFreshComparison(
    actor: ActorContext,
    normalized: NormalizedUnionCommand,
  ): Promise<{
    resolved: ResolvedPair;
    canonical: ClientRow;
    superseded: ClientRow;
  }> {
    const [comparison] = await this.databaseContext.connection
      .select()
      .from(clientUnionComparisons)
      .where(
        and(
          eq(clientUnionComparisons.workspaceId, actor.workspaceId),
          eq(clientUnionComparisons.reference, normalized.comparisonReference),
          eq(
            clientUnionComparisons.actorWorkspaceMembershipId,
            actor.workspaceMembershipId,
          ),
        ),
      )
      .limit(1);
    if (!comparison) throw unionUnavailable();
    await this.lockIdentifier(
      actor.workspaceId,
      comparison.normalizedIdentifier,
    );

    const participants = await this.databaseContext.connection
      .select()
      .from(clientUnionComparisonParticipants)
      .where(
        and(
          eq(clientUnionComparisonParticipants.workspaceId, actor.workspaceId),
          eq(
            clientUnionComparisonParticipants.comparisonReference,
            comparison.reference,
          ),
        ),
      );
    if (participants.length !== 2) throw unionUnavailable();
    const requested = participants.map(
      (participant) => participant.clientAccountId,
    );
    const [first, second] = requested;
    if (!first || !second) throw unionUnavailable();

    const pair = await this.resolveCandidatePair(actor, [first, second]);
    if (pair.kind !== 'pair') throw staleComparison();
    const resolved = pair.value;
    if (resolved.normalizedIdentifier !== comparison.normalizedIdentifier) {
      throw staleComparison();
    }
    for (const participant of resolved.participants) {
      const captured = participants.find(
        (candidate) => candidate.clientAccountId === participant.id,
      );
      if (!captured || captured.capturedVersion !== participant.version) {
        throw staleComparison();
      }
    }

    const capturedRelationships = await this.databaseContext.connection
      .select({
        relationshipId: clientUnionComparisonRelationships.relationshipId,
      })
      .from(clientUnionComparisonRelationships)
      .where(
        and(
          eq(clientUnionComparisonRelationships.workspaceId, actor.workspaceId),
          eq(
            clientUnionComparisonRelationships.comparisonReference,
            comparison.reference,
          ),
        ),
      );
    if (
      !sameStringSets(
        capturedRelationships.map((row) => row.relationshipId),
        resolved.relationships.map((relationship) => relationship.id),
      )
    ) {
      throw staleComparison();
    }
    // An active relationship to an inactive Company blocks the union instead of
    // silently narrowing the affected set.
    if (
      resolved.relationships.some(
        (relationship) =>
          relationship.status === 'active' &&
          relationship.companyStatus !== 'active',
      )
    ) {
      throw unionBlocked();
    }

    const canonical = resolved.participants.find(
      (participant) => participant.id === normalized.canonicalClientAccountId,
    );
    const superseded = resolved.participants.find(
      (participant) => participant.id !== normalized.canonicalClientAccountId,
    );
    if (!canonical || !superseded) throw unionUnavailable();
    return { resolved, canonical, superseded };
  }

  private async requireNoArchivedRelationshipCollision(options: {
    actor: ActorContext;
    canonical: ClientRow;
    superseded: ClientRow;
    relationships: readonly RelationshipRow[];
    affectedCompanyIds: readonly string[];
  }): Promise<void> {
    for (const companyId of options.affectedCompanyIds) {
      const canonicalRelationship = options.relationships.find(
        (relationship) =>
          relationship.clientAccountId === options.canonical.id &&
          relationship.companyId === companyId,
      );
      const supersededIsActive = options.relationships.some(
        (relationship) =>
          relationship.clientAccountId === options.superseded.id &&
          relationship.companyId === companyId &&
          relationship.status === 'active',
      );
      if (canonicalRelationship?.status === 'archived' && supersededIsActive) {
        throw unionBlocked();
      }
    }
  }

  private async projectCanonicalRelationships(options: {
    actor: ActorContext;
    operationId: string;
    canonical: ClientRow;
    superseded: ClientRow;
    relationships: readonly RelationshipRow[];
    affectedCompanyIds: readonly string[];
  }): Promise<void> {
    for (const companyId of [...options.affectedCompanyIds].toSorted()) {
      const canonicalRelationship = options.relationships.find(
        (relationship) =>
          relationship.clientAccountId === options.canonical.id &&
          relationship.companyId === companyId &&
          relationship.status === 'active',
      );
      if (canonicalRelationship) {
        await this.databaseContext.connection
          .insert(clientUnionOperationRelationships)
          .values({
            workspaceId: options.actor.workspaceId,
            unionOperationId: options.operationId,
            companyId,
            relationshipId: canonicalRelationship.id,
            clientAccountId: options.canonical.id,
            origin: 'reused',
          });
        continue;
      }
      const sourceRelationship = options.relationships.find(
        (relationship) =>
          relationship.clientAccountId === options.superseded.id &&
          relationship.companyId === companyId &&
          relationship.status === 'active',
      );
      if (!sourceRelationship) throw unionBlocked();
      const [created] = await this.databaseContext.connection
        .insert(clientCompanyRelationships)
        .values({
          workspaceId: options.actor.workspaceId,
          clientAccountId: options.canonical.id,
          companyId,
          createdByInternalUserId: options.actor.internalUserId,
          createdByWorkspaceMembershipId: options.actor.workspaceMembershipId,
        })
        .returning({ id: clientCompanyRelationships.id });
      if (!created) throw unionBlocked();
      await this.databaseContext.connection
        .insert(clientUnionOperationRelationships)
        .values({
          workspaceId: options.actor.workspaceId,
          unionOperationId: options.operationId,
          companyId,
          relationshipId: created.id,
          clientAccountId: options.canonical.id,
          origin: 'created',
          sourceRelationshipId: sourceRelationship.id,
        });
    }
  }

  private async removeUnionCreatedRelationships(
    actor: ActorContext,
    operationId: string,
  ): Promise<void> {
    const created = await this.databaseContext.connection
      .select({
        relationshipId: clientUnionOperationRelationships.relationshipId,
      })
      .from(clientUnionOperationRelationships)
      .where(
        and(
          eq(clientUnionOperationRelationships.workspaceId, actor.workspaceId),
          eq(clientUnionOperationRelationships.unionOperationId, operationId),
          eq(clientUnionOperationRelationships.origin, 'created'),
        ),
      );
    if (created.length === 0) return;
    const relationshipIds = created.map((row) => row.relationshipId);
    await this.databaseContext.connection
      .delete(clientUnionOperationRelationships)
      .where(
        and(
          eq(clientUnionOperationRelationships.workspaceId, actor.workspaceId),
          eq(clientUnionOperationRelationships.unionOperationId, operationId),
          eq(clientUnionOperationRelationships.origin, 'created'),
        ),
      );
    await this.databaseContext.connection
      .delete(clientCompanyRelationships)
      .where(
        and(
          eq(clientCompanyRelationships.workspaceId, actor.workspaceId),
          inArray(clientCompanyRelationships.id, relationshipIds),
        ),
      );
  }

  private async requireReversibleState(
    actor: ActorContext,
    operation: UnionOperationRow,
  ): Promise<void> {
    const snapshots = await this.operationSnapshots(actor, operation.id);
    const canonicalSnapshot = snapshots.find(
      (snapshot) => snapshot.role === 'canonical',
    );
    if (!canonicalSnapshot) throw unionUnavailable();
    const [canonical] = await this.databaseContext.connection
      .select()
      .from(clientAccounts)
      .where(
        and(
          eq(clientAccounts.workspaceId, actor.workspaceId),
          eq(clientAccounts.id, operation.canonicalClientAccountId),
          eq(clientAccounts.status, 'active'),
        ),
      )
      .limit(1);
    // The union committed exactly one version step; any later correction or
    // Contact change makes the pre-union state unrecoverable without guessing.
    if (!canonical || canonical.version !== canonicalSnapshot.version + 1) {
      throw reversalBlocked();
    }

    const projected = await this.databaseContext.connection
      .select({
        relationshipId: clientUnionOperationRelationships.relationshipId,
        companyId: clientUnionOperationRelationships.companyId,
      })
      .from(clientUnionOperationRelationships)
      .where(
        and(
          eq(clientUnionOperationRelationships.workspaceId, actor.workspaceId),
          eq(clientUnionOperationRelationships.unionOperationId, operation.id),
        ),
      );
    const liveRelationships = await this.participantRelationships(actor, [
      operation.canonicalClientAccountId,
      operation.supersededClientAccountId,
    ]);
    const canonicalActiveIds = liveRelationships
      .filter(
        (relationship) =>
          relationship.clientAccountId === operation.canonicalClientAccountId &&
          relationship.status === 'active',
      )
      .map((relationship) => relationship.id);
    if (
      !sameStringSets(
        canonicalActiveIds,
        projected.map((row) => row.relationshipId),
      )
    ) {
      throw reversalBlocked();
    }
    const supersededSnapshotRelationships = liveRelationships.filter(
      (relationship) =>
        relationship.clientAccountId === operation.supersededClientAccountId,
    );
    if (
      supersededSnapshotRelationships.some(
        (relationship) => relationship.status !== 'active',
      )
    ) {
      throw reversalBlocked();
    }
  }

  private async requireCapturedCompaniesStillActive(
    actor: ActorContext,
    operationId: string,
  ): Promise<string[]> {
    const capturedCompanyIds = await this.capturedCompanyIds(
      actor,
      operationId,
    );
    const active = await this.databaseContext.connection
      .select({ id: companies.id })
      .from(companies)
      .where(
        and(
          eq(companies.workspaceId, actor.workspaceId),
          inArray(companies.id, capturedCompanyIds),
          eq(companies.status, 'active'),
        ),
      );
    if (active.length !== capturedCompanyIds.length) throw reversalBlocked();
    return capturedCompanyIds;
  }

  private async capturedCompanyIds(
    actor: ActorContext,
    operationId: string,
  ): Promise<string[]> {
    const captured = await this.accountability.capturedCompanyIds(
      actor.workspaceId,
      [operationId],
    );
    const companyIds = captured.get(operationId) ?? [];
    if (companyIds.length === 0) throw unionUnavailable();
    return companyIds.toSorted();
  }

  private async operationSnapshots(
    actor: ActorContext,
    operationId: string,
  ): Promise<Array<typeof clientUnionOperationSnapshots.$inferSelect>> {
    return this.databaseContext.connection
      .select()
      .from(clientUnionOperationSnapshots)
      .where(
        and(
          eq(clientUnionOperationSnapshots.workspaceId, actor.workspaceId),
          eq(clientUnionOperationSnapshots.unionOperationId, operationId),
        ),
      );
  }

  private async requireOperation(
    actor: ActorContext,
    unionOperationId: string,
  ): Promise<UnionOperationRow> {
    const [operation] = await this.databaseContext.connection
      .select()
      .from(clientUnionOperations)
      .where(
        and(
          eq(clientUnionOperations.workspaceId, actor.workspaceId),
          eq(clientUnionOperations.id, unionOperationId),
        ),
      )
      .limit(1);
    if (!operation) throw new NotFoundException();
    return operation;
  }

  private async replayedOperation(
    actor: ActorContext,
    command: { idempotencyKey: string; intent: string },
  ): Promise<UnionOperationRow | undefined> {
    const [recorded] = await this.databaseContext.connection
      .select()
      .from(clientUnionCommands)
      .where(
        and(
          eq(clientUnionCommands.workspaceId, actor.workspaceId),
          eq(
            clientUnionCommands.actorWorkspaceMembershipId,
            actor.workspaceMembershipId,
          ),
          eq(clientUnionCommands.idempotencyKey, command.idempotencyKey),
        ),
      )
      .limit(1);
    if (!recorded) return undefined;
    if (recorded.intent !== command.intent) throw changedIntent();
    return this.requireOperation(actor, recorded.unionOperationId);
  }

  private async describeOperation(
    actor: ActorContext,
    operation: UnionOperationRow,
  ): Promise<ClientUnionOperationDetail> {
    const snapshots = await this.operationSnapshots(actor, operation.id);
    const capturedCompanyIds = await this.capturedCompanyIds(
      actor,
      operation.id,
    );
    return {
      unionOperationId: operation.id,
      status: operation.status,
      canonicalClientAccountId: operation.canonicalClientAccountId,
      supersededClientAccountId: operation.supersededClientAccountId,
      normalizedIdentifier: operation.normalizedIdentifier,
      affectedCompanyIds: capturedCompanyIds,
      unionReason: operation.unionReason,
      reversalReason: operation.reversalReason,
      confirmedAt: operation.confirmedAt.toISOString(),
      confirmedByInternalUserId: operation.confirmedByInternalUserId,
      reversedAt: operation.reversedAt?.toISOString() ?? null,
      reversedByInternalUserId: operation.reversedByInternalUserId,
      snapshots: snapshots
        .toSorted((left, right) => left.role.localeCompare(right.role))
        .map((snapshot) => ({
          clientAccountId: snapshot.clientAccountId,
          role: snapshot.role,
          version: snapshot.version,
          displayName: snapshot.displayName,
          taxId: snapshot.taxId,
          address: snapshot.address,
          telephone: snapshot.telephone,
          generalEmail: snapshot.generalEmail,
          contacts: snapshot.contacts,
          businessActivity: snapshot.businessActivity,
        })),
    };
  }

  private async lockIdentifier(
    workspaceId: string,
    normalizedIdentifier: string,
  ): Promise<void> {
    const lockKey = JSON.stringify([workspaceId, normalizedIdentifier]);
    await this.databaseContext.connection.execute(
      sql`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`,
    );
  }
}

function requireSelectedCompany(actor: ActorContext): string {
  const companyId = actor.activeCompany?.id;
  if (!companyId) throw new ForbiddenException();
  return companyId;
}

function activeAffectedCompanies(
  relationships: readonly RelationshipRow[],
): { id: string; displayName: string }[] {
  const affected = new Map<string, string>();
  for (const relationship of relationships) {
    if (
      relationship.status !== 'active' ||
      relationship.companyStatus !== 'active'
    ) {
      continue;
    }
    affected.set(relationship.companyId, relationship.companyDisplayName);
  }
  return [...affected]
    .map(([id, displayName]) => ({ id, displayName }))
    .toSorted((left, right) => left.id.localeCompare(right.id));
}

function differingSelectableFields(
  participants: readonly [ClientRow, ClientRow],
): ClientUnionSelectableField[] {
  const [first, second] = participants;
  return CLIENT_UNION_SELECTABLE_FIELDS.filter(
    (field) => first[field] !== second[field],
  );
}

function requireConfirmedCompanySet(
  confirmed: readonly string[],
  affected: readonly string[],
): void {
  if (!sameStringSets(confirmed, affected)) throw staleComparison();
}

function requireReviewedDifferences(
  normalized: NormalizedUnionCommand,
  participants: readonly [ClientRow, ClientRow],
): void {
  const participantIds = participants.map((participant) => participant.id);
  for (const [, selected] of normalized.fieldSelections) {
    if (!participantIds.includes(selected)) throw unionUnavailable();
  }
  for (const field of differingSelectableFields(participants)) {
    if (!normalized.fieldSelections.has(field)) {
      throw new ConflictException({
        statusCode: 409,
        error: 'Conflict',
        code: 'client_union_differences_require_review',
      });
    }
  }
}

interface SelectedUnionFields {
  displayName: string;
  address: string | null;
  telephone: string | null;
  generalEmail: string | null;
  businessActivity: string | null;
}

function selectedFieldValues(options: {
  normalized: NormalizedUnionCommand;
  canonical: ClientRow;
  superseded: ClientRow;
}): SelectedUnionFields {
  const sources = new Map<string, ClientRow>([
    [options.canonical.id, options.canonical],
    [options.superseded.id, options.superseded],
  ]);
  const sourceFor = (field: ClientUnionSelectableField): ClientRow => {
    const selectedId = options.normalized.fieldSelections.get(field);
    const source = selectedId ? sources.get(selectedId) : options.canonical;
    if (!source) throw unionUnavailable();
    return source;
  };
  return {
    displayName: sourceFor('displayName').displayName,
    address: sourceFor('address').address,
    telephone: sourceFor('telephone').telephone,
    generalEmail: sourceFor('generalEmail').generalEmail,
    businessActivity: sourceFor('businessActivity').businessActivity,
  };
}

function unionContacts(options: {
  canonical: ClientRow;
  superseded: ClientRow;
  consolidations: NormalizedUnionCommand['contactConsolidations'];
}): ClientContact[] {
  const sourcesByClient = new Map<string, ClientContact[]>([
    [options.canonical.id, options.canonical.contacts],
    [options.superseded.id, options.superseded.contacts],
  ]);
  const absorbed = new Set<string>();
  const referenced = new Set<string>();
  for (const consolidation of options.consolidations) {
    for (const source of [consolidation.retain, ...consolidation.absorb]) {
      const contacts = sourcesByClient.get(source.clientAccountId);
      if (!contacts || source.index >= contacts.length) {
        throw unionUnavailable();
      }
      const key = contactKey(source);
      if (referenced.has(key)) throw unionUnavailable();
      referenced.add(key);
    }
    for (const source of consolidation.absorb) {
      absorbed.add(contactKey(source));
    }
  }

  const result: ClientContact[] = [];
  for (const client of [options.canonical, options.superseded]) {
    client.contacts.forEach((contact, index) => {
      if (absorbed.has(contactKey({ clientAccountId: client.id, index }))) {
        return;
      }
      result.push(contact);
    });
  }
  if (result.length > MAXIMUM_CANONICAL_CONTACTS) {
    throw new ConflictException({
      statusCode: 409,
      error: 'Conflict',
      code: 'client_union_contact_capacity_exceeded',
    });
  }
  return result;
}

function contactKey(source: ClientUnionContactSource): string {
  return `${source.clientAccountId}:${source.index}`;
}

function unionIntent(normalized: NormalizedUnionCommand): string {
  return JSON.stringify({
    kind: 'union',
    comparisonReference: normalized.comparisonReference,
    canonicalClientAccountId: normalized.canonicalClientAccountId,
    fieldSelections: [...normalized.fieldSelections].toSorted(
      ([left], [right]) => left.localeCompare(right),
    ),
    contactConsolidations: normalized.contactConsolidations,
    reason: normalized.reason,
    confirmedCompanyIds: [...normalized.confirmedCompanyIds].toSorted(),
  });
}

function reversalIntent(unionOperationId: string, reason: string): string {
  return JSON.stringify({ kind: 'reversal', unionOperationId, reason });
}

function sameStringSets(
  left: readonly string[],
  right: readonly string[],
): boolean {
  const leftIds = [...left].toSorted();
  const rightIds = [...right].toSorted();
  return (
    leftIds.length === rightIds.length &&
    leftIds.every((value, index) => value === rightIds[index])
  );
}

function unionUnavailable(): NotFoundException {
  return new NotFoundException();
}

function staleComparison(): ConflictException {
  return new ConflictException({
    statusCode: 409,
    error: 'Conflict',
    code: 'client_union_comparison_stale',
  });
}

function unionBlocked(): ConflictException {
  return new ConflictException({
    statusCode: 409,
    error: 'Conflict',
    code: 'client_union_blocked',
  });
}

function reversalBlocked(): ConflictException {
  return new ConflictException({
    statusCode: 409,
    error: 'Conflict',
    code: 'client_union_reversal_blocked',
  });
}

function changedIntent(): ConflictException {
  return new ConflictException({
    statusCode: 409,
    error: 'Conflict',
    code: 'client_union_changed_intent',
  });
}
