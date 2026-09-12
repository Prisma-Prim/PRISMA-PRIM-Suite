import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import type { ActorContext } from '../access/access.types.js';
import { CompanyContextAuthorization } from '../access/company-context-authorization.js';
import { AccountabilityService } from '../accountability/accountability.service.js';
import { DatabaseContext } from '../database/database-context.js';
import {
  clientAccounts,
  clientCompanyRelationships,
  clientIdentifierReservations,
  clientUnionOperations,
  clientUnionProjections,
  clientUnionReviews,
  clientUnionReversals,
  companies,
  internalUsers,
  workspaceMemberships,
} from '../database/schema/index.js';
import { ClientIdentifierIndex } from './client-identifier-index.js';
import { sameJsonValue as jsonStructurallyEqual } from './json-structural-equality.js';
import {
  comparisonClient,
  dossierFields,
  readUnionSnapshot,
  snapshotClient,
  snapshotRelationship,
  type UnionSnapshot,
} from './client-union-snapshot.js';
import {
  normalizeUnionConfirmation,
  normalizeUnionReversal,
  UNION_FIELDS,
  unionCommandKey,
  unionContactResult,
  unionUuid,
  type UnionConfirmation,
} from './client-union-validation.js';

type UnionOperation = typeof clientUnionOperations.$inferSelect;
type UnionReview = typeof clientUnionReviews.$inferSelect;

@Injectable()
export class ClientUnionService {
  constructor(
    private readonly databaseContext: DatabaseContext,
    private readonly authorization: CompanyContextAuthorization,
    private readonly accountability: AccountabilityService,
    private readonly identifiers: ClientIdentifierIndex,
  ) {}

  async beginReview(actor: ActorContext, clientId: string) {
    const companyId = this.activeCompany(actor);
    return this.databaseContext.transaction(
      async () => {
        const source = await this.snapshot(actor.workspaceId, [clientId]);
        const client = source.clients[0];
        if (
          !client ||
          client.status !== 'active' ||
          !client.taxId?.trim() ||
          !source.relationships.some(
            (relationship) =>
              relationship.companyId === companyId &&
              relationship.status === 'active',
          )
        )
          throw new NotFoundException();
        const key = client.taxId.trim();
        const candidates = await this.identifiers.candidates(
          actor.workspaceId,
          [key],
        );
        const snapshot = await this.snapshot(
          actor.workspaceId,
          candidates.map((candidate) => candidate.id),
        );
        await this.authorize(
          actor,
          snapshot,
          snapshot.companies.map((company) => company.id),
        );
        if (snapshot.clients.length > 2)
          return {
            outcome:
              'multiple_duplicate_candidates_require_data_remediation' as const,
          };
        this.assertPair(snapshot, key);
        await this.requireNoActiveUnion(
          actor.workspaceId,
          snapshot.clients.map((entry) => entry.id),
        );
        const [first, second] = snapshot.clients;
        if (!first || !second) throw new NotFoundException();
        const [review] = await this.databaseContext.connection
          .insert(clientUnionReviews)
          .values({
            workspaceId: actor.workspaceId,
            actorWorkspaceMembershipId: actor.workspaceMembershipId,
            companyId,
            firstClientId: first.id,
            secondClientId: second.id,
            normalizedIdentifier: key,
            snapshot,
          })
          .returning();
        if (!review)
          throw new Error('The Client union review was not recorded.');
        return this.comparison(review, snapshot);
      },
      { isolationLevel: 'repeatable read' },
    );
  }

  review(actor: ActorContext, reference: string) {
    this.activeCompany(actor);
    return this.databaseContext.transaction(
      async () => {
        const { review, snapshot } = await this.freshReview(
          actor,
          reference,
          false,
        );
        return this.comparison(review, snapshot);
      },
      { isolationLevel: 'repeatable read', accessMode: 'read only' },
    );
  }

  confirm({
    actor,
    reference,
    value,
    key,
  }: {
    actor: ActorContext;
    reference: string;
    value: unknown;
    key: string | undefined;
  }) {
    const companyId = this.activeCompany(actor);
    const confirmation = normalizeUnionConfirmation(value);
    const idempotencyKey = unionCommandKey(key);
    return this.databaseContext.transaction(async () => {
      await this.lockCommand(actor, idempotencyKey);
      const replay = await this.commandOperation(actor, idempotencyKey);
      if (replay) {
        if (
          replay.reviewReference !== reference ||
          replay.companyId !== companyId ||
          !jsonStructurallyEqual(replay.intent, confirmation)
        )
          throw new ConflictException();
        const original = await this.operationOriginal(replay);
        const current = await this.snapshot(
          actor.workspaceId,
          original.clients.map((client) => client.id),
          true,
        );
        await this.authorize(
          actor,
          current,
          original.companies.map((company) => company.id),
          true,
        );
        return this.confirmationResult(actor, replay);
      }
      if (await this.commandReversal(actor, idempotencyKey))
        throw new ConflictException();
      const { review, snapshot } = await this.freshReview(
        actor,
        reference,
        true,
      );
      this.assertCompanyConfirmation(confirmation.companyIds, snapshot);
      const canonical = snapshot.clients.find(
        (client) => client.id === confirmation.canonicalClientId,
      );
      const superseded = snapshot.clients.find(
        (client) => client.id !== confirmation.canonicalClientId,
      );
      if (!canonical || !superseded) throw new ConflictException();
      if (snapshot.clients.some((client) => client.version >= 2147483647))
        throw new ConflictException();
      const chosen = this.chooseFields(confirmation, snapshot);
      const contactResult = unionContactResult(
        snapshot.clients.map((client) => ({
          clientId: client.id,
          version: client.version,
          contacts: client.contacts,
        })),
      );
      const companyIds = snapshot.companies.map((company) => company.id);
      for (const affectedCompanyId of companyIds) {
        if (
          snapshot.relationships.some(
            (relationship) =>
              relationship.companyId === affectedCompanyId &&
              relationship.clientAccountId === canonical.id &&
              relationship.status === 'archived',
          )
        )
          throw new ConflictException();
      }
      const projectionSources: {
        relationshipId: string;
        sourceRelationshipId: string;
      }[] = [];
      for (const affectedCompanyId of companyIds) {
        if (
          snapshot.relationships.some(
            (relationship) =>
              relationship.companyId === affectedCompanyId &&
              relationship.clientAccountId === canonical.id &&
              relationship.status === 'active',
          )
        )
          continue;
        const source = snapshot.relationships.find(
          (relationship) =>
            relationship.companyId === affectedCompanyId &&
            relationship.status === 'active',
        );
        if (!source) throw new NotFoundException();
        const [projection] = await this.databaseContext.connection
          .insert(clientCompanyRelationships)
          .values({
            workspaceId: actor.workspaceId,
            clientAccountId: canonical.id,
            companyId: affectedCompanyId,
            createdByInternalUserId: actor.internalUserId,
            createdByWorkspaceMembershipId: actor.workspaceMembershipId,
          })
          .returning();
        if (!projection)
          throw new Error('The canonical relationship was not created.');
        projectionSources.push({
          relationshipId: projection.id,
          sourceRelationshipId: source.id,
        });
      }
      await this.databaseContext.connection
        .update(clientAccounts)
        .set({
          ...chosen,
          contacts: contactResult.contacts,
          version: canonical.version + 1,
          updatedAt: sql`now()`,
        })
        .where(
          and(
            eq(clientAccounts.workspaceId, actor.workspaceId),
            eq(clientAccounts.id, canonical.id),
          ),
        );
      await this.databaseContext.connection
        .update(clientAccounts)
        .set({
          status: 'superseded',
          version: superseded.version + 1,
          updatedAt: sql`now()`,
        })
        .where(
          and(
            eq(clientAccounts.workspaceId, actor.workspaceId),
            eq(clientAccounts.id, superseded.id),
          ),
        );
      await this.databaseContext.connection
        .insert(clientIdentifierReservations)
        .values(
          snapshot.clients.map((client) => ({
            workspaceId: actor.workspaceId,
            sourceClientId: client.id,
            normalizedIdentifier: review.normalizedIdentifier,
          })),
        )
        .onConflictDoNothing();
      const resultSnapshot = await this.snapshot(
        actor.workspaceId,
        snapshot.clients.map((client) => client.id),
      );
      const operation = await this.accountability.recordClientUnion({
        actor,
        reviewReference: reference,
        canonicalClientId: canonical.id,
        companyId,
        companyIds,
        idempotencyKey,
        reason: confirmation.reason,
        intent: confirmation,
        resultSnapshot: {
          ...resultSnapshot,
          projectionSources,
          contactSources: contactResult.sources,
        },
      });
      return this.confirmationResult(actor, operation);
    });
  }

  reverse({
    actor,
    reference,
    value,
    key,
  }: {
    actor: ActorContext;
    reference: string;
    value: unknown;
    key: string | undefined;
  }) {
    const companyId = this.activeCompany(actor);
    const reversal = normalizeUnionReversal(value);
    const idempotencyKey = unionCommandKey(key);
    return this.databaseContext.transaction(async () => {
      await this.lockCommand(actor, idempotencyKey);
      const operation = await this.projectionOperation(actor, reference);
      const original = await this.operationOriginal(operation);
      const clientIds = original.clients.map((client) => client.id);
      const current = await this.snapshot(actor.workspaceId, clientIds, true);
      await this.authorize(
        actor,
        current,
        original.companies.map((company) => company.id),
        true,
      );
      this.assertCompanyConfirmation(reversal.companyIds, original);
      await this.identifiers.lock({
        workspaceId: actor.workspaceId,
        normalizedIdentifier: await this.operationIdentifier(operation),
      });
      if (await this.commandOperation(actor, idempotencyKey))
        throw new ConflictException();
      const replay = await this.commandReversal(actor, idempotencyKey);
      if (replay) {
        if (
          replay.operationId !== operation.id ||
          replay.companyId !== companyId ||
          replay.reason !== reversal.reason
        )
          throw new ConflictException();
        return { outcome: 'reversed' as const, clientIds };
      }
      if (await this.reversalFor(operation)) throw new ConflictException();
      const after = readUnionSnapshot(operation.resultSnapshot);
      if (
        !jsonStructurallyEqual(current, after) ||
        current.clients.some((client) => client.version >= 2147483647)
      )
        throw new ConflictException('Client union can no longer be reversed.');
      const originalRelationshipIds = new Set(
        original.relationships.map((relationship) => relationship.id),
      );
      const createdRelationshipIds = after.relationships
        .filter((relationship) => !originalRelationshipIds.has(relationship.id))
        .map((relationship) => relationship.id);
      if (createdRelationshipIds.length > 0)
        await this.databaseContext.connection
          .delete(clientCompanyRelationships)
          .where(
            and(
              eq(clientCompanyRelationships.workspaceId, actor.workspaceId),
              inArray(clientCompanyRelationships.id, createdRelationshipIds),
            ),
          );
      for (const client of original.clients) {
        const live = current.clients.find(
          (candidate) => candidate.id === client.id,
        );
        if (!live) throw new NotFoundException();
        await this.databaseContext.connection
          .update(clientAccounts)
          .set({
            ...dossierFields(client),
            status: 'active',
            version: live.version + 1,
            updatedAt: sql`now()`,
          })
          .where(
            and(
              eq(clientAccounts.workspaceId, actor.workspaceId),
              eq(clientAccounts.id, client.id),
            ),
          );
      }
      await this.accountability.recordClientUnionReversal({
        actor,
        operationId: operation.id,
        companyId,
        companyIds: reversal.companyIds,
        idempotencyKey,
        reason: reversal.reason,
      });
      return { outcome: 'reversed' as const, clientIds };
    });
  }

  detail(actor: ActorContext, reference: string) {
    this.activeCompany(actor);
    return this.databaseContext.transaction(
      async () => {
        const operation = await this.projectionOperation(actor, reference);
        const original = await this.operationOriginal(operation);
        const current = await this.snapshot(
          actor.workspaceId,
          original.clients.map((client) => client.id),
        );
        await this.authorize(
          actor,
          current,
          original.companies.map((company) => company.id),
        );
        const reversal = await this.reversalFor(operation);
        return {
          operationId: operation.id,
          projectionReference: reference,
          targetType: 'client_union_operation' as const,
          state: reversal ? ('reversed' as const) : ('united' as const),
          canonicalClientId: operation.canonicalClientId,
          originals: original.clients.map(comparisonClient),
          companies: original.companies.map(({ id, displayName }) => ({
            id,
            displayName,
          })),
          identityBasis: {
            kind: 'exact_tax_identifier' as const,
            identifier: await this.operationIdentifier(operation),
          },
          reason: operation.reason,
          occurredAt: operation.createdAt.toISOString(),
          actor: await this.exactActor(
            operation.workspaceId,
            operation.actorWorkspaceMembershipId,
          ),
          contactSources: unionContactResult(
            original.clients.map((client) => ({
              clientId: client.id,
              version: client.version,
              contacts: client.contacts,
            })),
          ).sources,
          reversal: reversal
            ? {
                reason: reversal.reason,
                occurredAt: reversal.createdAt.toISOString(),
                actor: await this.exactActor(
                  operation.workspaceId,
                  reversal.actorWorkspaceMembershipId,
                ),
              }
            : null,
          canReverse:
            !reversal &&
            jsonStructurallyEqual(
              current,
              readUnionSnapshot(operation.resultSnapshot),
            ),
        };
      },
      { isolationLevel: 'repeatable read', accessMode: 'read only' },
    );
  }

  supersededSources(actor: ActorContext) {
    const companyId = this.activeCompany(actor);
    // Only dossiers already related to this Company are discoverable here.
    // Canonical links and operation detail retain their complete-scope guard.
    return this.databaseContext.connection
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
          eq(clientAccounts.status, 'superseded'),
        ),
      )
      .orderBy(asc(clientAccounts.displayName), asc(clientAccounts.id));
  }

  history(actor: ActorContext, clientId: string) {
    const companyId = this.activeCompany(actor);
    return this.databaseContext.transaction(
      async () => {
        const snapshot = await this.snapshot(actor.workspaceId, [clientId]);
        if (
          !snapshot.clients[0] ||
          !snapshot.relationships.some(
            (relationship) =>
              relationship.companyId === companyId &&
              relationship.status === 'active',
          )
        )
          throw new NotFoundException();
        const operations = await this.databaseContext.connection
          .select({ operation: clientUnionOperations })
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
          .where(
            and(
              eq(clientUnionOperations.workspaceId, actor.workspaceId),
              or(
                eq(clientUnionReviews.firstClientId, clientId),
                eq(clientUnionReviews.secondClientId, clientId),
              ),
            ),
          )
          .orderBy(asc(clientUnionOperations.id))
          .limit(50);
        const events = [];
        const detailReferences: string[] = [];
        for (const { operation } of operations) {
          const projections = await this.accountability.clientUnionEvents(
            actor,
            operation.id,
          );
          events.push(...projections);
          const original = await this.operationOriginal(operation);
          const current = await this.snapshot(
            actor.workspaceId,
            original.clients.map((client) => client.id),
          );
          try {
            await this.authorize(
              actor,
              current,
              original.companies.map((company) => company.id),
            );
            detailReferences.push(
              ...projections.map(
                (projection) => projection.projectionReference,
              ),
            );
          } catch (error) {
            if (!(error instanceof NotFoundException)) throw error;
          }
        }
        events.sort((left, right) =>
          left.projectionReference.localeCompare(right.projectionReference),
        );
        return { events, detailReferences };
      },
      { isolationLevel: 'repeatable read', accessMode: 'read only' },
    );
  }

  private activeCompany(actor: ActorContext): string {
    if (!actor.activeCompany?.clientPermissions.includes('client.read'))
      throw new NotFoundException();
    return actor.activeCompany.id;
  }

  private async snapshot(
    workspaceId: string,
    clientIds: readonly string[],
    lock = false,
  ): Promise<UnionSnapshot> {
    if (clientIds.length === 0)
      return { clients: [], relationships: [], companies: [] };
    const query = this.databaseContext.connection
      .select()
      .from(clientAccounts)
      .where(
        and(
          eq(clientAccounts.workspaceId, workspaceId),
          inArray(clientAccounts.id, [...clientIds]),
        ),
      )
      .orderBy(asc(clientAccounts.id));
    const clients = lock ? await query.for('update') : await query;
    // These two tables have no application version column. Their PostgreSQL
    // tuple versions conservatively fence even a change later restored to the
    // same visible values. These internal tokens never enter a public view.
    const relationshipQuery = this.databaseContext.connection
      .select({
        relationship: clientCompanyRelationships,
        company: companies,
        relationshipVersion: sql<string>`${clientCompanyRelationships}.xmin::text`,
        companyVersion: sql<string>`${companies}.xmin::text`,
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
          eq(clientCompanyRelationships.workspaceId, workspaceId),
          inArray(clientCompanyRelationships.clientAccountId, [...clientIds]),
        ),
      )
      .orderBy(asc(clientCompanyRelationships.id));
    const rows = lock
      ? await relationshipQuery.for('share')
      : await relationshipQuery;
    const companyRows = new Map(
      rows
        .filter((row) => row.relationship.status === 'active')
        .map(({ company, companyVersion }) => [
          company.id,
          {
            id: company.id,
            displayName: company.displayName,
            status: company.status,
            rowVersion: companyVersion,
          },
        ]),
    );
    return readUnionSnapshot({
      clients: clients.map(snapshotClient),
      relationships: rows.map(({ relationship, relationshipVersion }) =>
        snapshotRelationship(relationship, relationshipVersion),
      ),
      companies: [...companyRows.values()].sort((left, right) =>
        left.id.localeCompare(right.id),
      ),
    });
  }

  private async authorize(
    actor: ActorContext,
    snapshot: UnionSnapshot,
    companyIds: readonly string[],
    lock = false,
  ): Promise<void> {
    if (
      companyIds.length === 0 ||
      snapshot.clients.length === 0 ||
      snapshot.clients.some(
        (client) =>
          client.status === 'archived' ||
          !snapshot.relationships.some(
            (relationship) =>
              relationship.clientAccountId === client.id &&
              relationship.status === 'active' &&
              companyIds.includes(relationship.companyId),
          ),
      )
    )
      throw new NotFoundException();
    const authorized =
      await this.authorization.duplicateReviewAuthorizedCompanyIds(
        actor,
        companyIds,
        lock,
      );
    if (companyIds.some((id) => !authorized.has(id)))
      throw new NotFoundException();
  }

  private assertPair(snapshot: UnionSnapshot, identifier: string): void {
    if (
      snapshot.clients.length !== 2 ||
      snapshot.clients.some(
        (client) =>
          client.status !== 'active' || client.taxId?.trim() !== identifier,
      ) ||
      snapshot.companies.some((company) => company.status !== 'active')
    )
      throw new NotFoundException();
  }

  private async requireNoActiveUnion(
    workspaceId: string,
    clientIds: readonly string[],
  ): Promise<void> {
    const [operation] = await this.databaseContext.connection
      .select({ id: clientUnionOperations.id })
      .from(clientUnionOperations)
      .innerJoin(
        clientUnionReviews,
        and(
          eq(clientUnionReviews.workspaceId, clientUnionOperations.workspaceId),
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
          eq(clientUnionOperations.workspaceId, workspaceId),
          isNull(clientUnionReversals.operationId),
          or(
            inArray(clientUnionReviews.firstClientId, [...clientIds]),
            inArray(clientUnionReviews.secondClientId, [...clientIds]),
          ),
        ),
      )
      .limit(1);
    if (operation) throw new NotFoundException();
  }

  private async freshReview(
    actor: ActorContext,
    reference: string,
    lock: boolean,
  ) {
    const [review] = await this.databaseContext.connection
      .select()
      .from(clientUnionReviews)
      .where(
        and(
          eq(clientUnionReviews.workspaceId, actor.workspaceId),
          eq(clientUnionReviews.reference, reference),
        ),
      )
      .limit(1);
    if (!review) throw new NotFoundException();
    const snapshot = await this.snapshot(
      actor.workspaceId,
      [review.firstClientId, review.secondClientId],
      lock,
    );
    if (
      !snapshot.companies.some(
        (company) => company.id === actor.activeCompany?.id,
      )
    )
      throw new NotFoundException();
    if (lock)
      await this.identifiers.lock({
        workspaceId: actor.workspaceId,
        normalizedIdentifier: review.normalizedIdentifier,
      });
    const candidates = await this.identifiers.candidates(actor.workspaceId, [
      review.normalizedIdentifier,
    ]);
    if (
      !jsonStructurallyEqual(
        candidates.map((candidate) => candidate.id),
        snapshot.clients.map((client) => client.id),
      )
    )
      throw new NotFoundException();
    await this.authorize(
      actor,
      snapshot,
      snapshot.companies.map((company) => company.id),
      lock,
    );
    this.assertPair(snapshot, review.normalizedIdentifier);
    if (!jsonStructurallyEqual(readUnionSnapshot(review.snapshot), snapshot))
      throw new NotFoundException();
    await this.requireNoActiveUnion(
      actor.workspaceId,
      snapshot.clients.map((client) => client.id),
    );
    return { review, snapshot };
  }

  private comparison(review: UnionReview, snapshot: UnionSnapshot) {
    return {
      outcome: 'comparison' as const,
      reviewReference: review.reference,
      clients: snapshot.clients.map(comparisonClient),
      companies: snapshot.companies.map(({ id, displayName }) => ({
        id,
        displayName,
      })),
      fields: UNION_FIELDS,
      identityBasis: {
        kind: 'exact_tax_identifier' as const,
        identifier: review.normalizedIdentifier,
      },
    };
  }

  private assertCompanyConfirmation(
    companyIds: readonly string[],
    snapshot: UnionSnapshot,
  ): void {
    if (
      !jsonStructurallyEqual(
        companyIds,
        snapshot.companies.map((company) => company.id),
      )
    )
      throw new ConflictException();
  }

  private chooseFields(
    confirmation: UnionConfirmation,
    snapshot: UnionSnapshot,
  ) {
    const choose = (field: (typeof UNION_FIELDS)[number]) => {
      const client = snapshot.clients.find(
        (candidate) => candidate.id === confirmation.fields[field],
      );
      if (!client) throw new ConflictException();
      return client;
    };
    return {
      displayName: choose('displayName').displayName,
      taxId: choose('taxId').taxId,
      address: choose('address').address,
      telephone: choose('telephone').telephone,
      generalEmail: choose('generalEmail').generalEmail,
      businessActivity: choose('businessActivity').businessActivity,
    };
  }

  private async lockCommand(actor: ActorContext, key: string): Promise<void> {
    const lockKey = JSON.stringify([
      'client-union-command',
      actor.workspaceId,
      actor.workspaceMembershipId,
      key,
    ]);
    await this.databaseContext.connection.execute(
      sql`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`,
    );
  }

  private async commandOperation(actor: ActorContext, key: string) {
    const [operation] = await this.databaseContext.connection
      .select()
      .from(clientUnionOperations)
      .where(
        and(
          eq(clientUnionOperations.workspaceId, actor.workspaceId),
          eq(
            clientUnionOperations.actorWorkspaceMembershipId,
            actor.workspaceMembershipId,
          ),
          eq(clientUnionOperations.idempotencyKey, key),
        ),
      )
      .limit(1);
    return operation;
  }

  private async commandReversal(actor: ActorContext, key: string) {
    const [reversal] = await this.databaseContext.connection
      .select()
      .from(clientUnionReversals)
      .where(
        and(
          eq(clientUnionReversals.workspaceId, actor.workspaceId),
          eq(
            clientUnionReversals.actorWorkspaceMembershipId,
            actor.workspaceMembershipId,
          ),
          eq(clientUnionReversals.idempotencyKey, key),
        ),
      )
      .limit(1);
    return reversal;
  }

  private async reversalFor(operation: UnionOperation) {
    const [reversal] = await this.databaseContext.connection
      .select()
      .from(clientUnionReversals)
      .where(
        and(
          eq(clientUnionReversals.workspaceId, operation.workspaceId),
          eq(clientUnionReversals.operationId, operation.id),
        ),
      )
      .limit(1);
    return reversal;
  }

  private async projectionOperation(actor: ActorContext, reference: string) {
    const [row] = await this.databaseContext.connection
      .select({ operation: clientUnionOperations })
      .from(clientUnionProjections)
      .innerJoin(
        clientUnionOperations,
        and(
          eq(
            clientUnionOperations.workspaceId,
            clientUnionProjections.workspaceId,
          ),
          eq(clientUnionOperations.id, clientUnionProjections.operationId),
        ),
      )
      .where(
        and(
          eq(clientUnionProjections.workspaceId, actor.workspaceId),
          eq(clientUnionProjections.companyId, actor.activeCompany?.id ?? ''),
          eq(clientUnionProjections.reference, unionUuid(reference)),
        ),
      )
      .limit(1);
    if (!row) throw new NotFoundException();
    return row.operation;
  }

  private async operationReview(operation: UnionOperation) {
    const [review] = await this.databaseContext.connection
      .select()
      .from(clientUnionReviews)
      .where(
        and(
          eq(clientUnionReviews.workspaceId, operation.workspaceId),
          eq(clientUnionReviews.reference, operation.reviewReference),
        ),
      )
      .limit(1);
    if (!review) throw new NotFoundException();
    return review;
  }

  private async operationOriginal(operation: UnionOperation) {
    return readUnionSnapshot((await this.operationReview(operation)).snapshot);
  }
  private async operationIdentifier(operation: UnionOperation) {
    return (await this.operationReview(operation)).normalizedIdentifier;
  }

  private async confirmationResult(
    actor: ActorContext,
    operation: UnionOperation,
  ) {
    const projection = (
      await this.accountability.clientUnionEvents(actor, operation.id)
    ).find((event) => event.action === 'client.union_confirmed');
    if (!projection) throw new NotFoundException();
    return {
      outcome: 'united' as const,
      canonicalClientId: operation.canonicalClientId,
      projectionReference: projection.projectionReference,
    };
  }

  private async exactActor(workspaceId: string, membershipId: string) {
    const [actor] = await this.databaseContext.connection
      .select({
        internalUserId: internalUsers.id,
        displayName: internalUsers.displayName,
      })
      .from(workspaceMemberships)
      .innerJoin(
        internalUsers,
        eq(internalUsers.id, workspaceMemberships.internalUserId),
      )
      .where(
        and(
          eq(workspaceMemberships.workspaceId, workspaceId),
          eq(workspaceMemberships.id, membershipId),
        ),
      )
      .limit(1);
    if (!actor) throw new NotFoundException();
    return actor;
  }
}
