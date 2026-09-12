import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { CompanyContextAuthorization } from '../access/company-context-authorization.js';
import type { ActorContext } from '../access/access.types.js';
import { DatabaseContext } from '../database/database-context.js';
import {
  clientAccounts,
  clientCompanyRelationships,
  clientDuplicateReviewCandidates,
  clientDuplicateReviewRelationshipSnapshots,
  clientDuplicateReviews,
  companies,
  internalUsers,
  workspaceMemberships,
} from '../database/schema/index.js';
import type { NormalizedDossierFields } from './client-dossier-validation.js';
import { ClientIdentifierIndex } from './client-identifier-index.js';
import {
  POSSIBLE_DUPLICATE_REVIEW_REQUIRED,
  type ClientDuplicateReviewDetail,
  type ClientDuplicateReviewListItem,
  type ClientDuplicateReviewPage,
  type ClientDuplicateReviewPageRequest,
} from './client-duplicate-review.types.js';

type DuplicateCandidateVersion = Pick<
  typeof clientAccounts.$inferSelect,
  'id' | 'version'
>;

type DuplicateReview = typeof clientDuplicateReviews.$inferSelect;
type DuplicateReviewPaginationAnchor = {
  createdAt: string;
  reference: DuplicateReview['reference'];
};
type DuplicateReviewCandidate = typeof clientAccounts.$inferSelect;
type DuplicateReviewCandidateSnapshot =
  typeof clientDuplicateReviewCandidates.$inferSelect;
type DuplicateReviewRelationshipSnapshot =
  typeof clientDuplicateReviewRelationshipSnapshots.$inferSelect;
type DuplicateReviewRelationship = {
  id: string;
  clientAccountId: string;
  companyId: string;
  companyDisplayName: string;
  companyStatus: 'active' | 'inactive';
};
type AuthorizedDuplicateReview = {
  proposalKind: 'registration' | 'correction';
  proposedFields: DuplicateReview['proposedFields'];
  candidates: DuplicateReviewCandidate[];
  relationships: DuplicateReviewRelationship[];
  attemptedCompanyRelatedClientIds: ReadonlySet<string>;
};
type DuplicateReviewPendingAuthorization = AuthorizedDuplicateReview & {
  scope: readonly string[];
};

type ReviewProposal =
  | {
      kind: 'registration';
      commandId: string;
      clientAccountId: null;
      version: null;
    }
  | {
      kind: 'correction';
      commandId: string;
      clientAccountId: string;
      version: number;
    };

const DUPLICATE_REVIEW_READ_TRANSACTION = {
  isolationLevel: 'repeatable read',
  accessMode: 'read only',
} as const;

@Injectable()
export class ClientDuplicateReviewService {
  constructor(
    private readonly databaseContext: DatabaseContext,
    private readonly companyAuthorization: CompanyContextAuthorization,
    private readonly identifierIndex: ClientIdentifierIndex,
  ) {}

  async proposeRegistration(
    actor: ActorContext,
    attemptedCompanyId: string,
    commandId: string,
    fields: NormalizedDossierFields,
  ): Promise<string | undefined> {
    if (fields.taxId === null) return undefined;
    await this.lockIdentifier(actor.workspaceId, fields.taxId);
    const candidates = await this.findCandidates(
      actor.workspaceId,
      fields.taxId,
    );
    if (candidates.length === 0) return undefined;
    return this.persistReview({
      actor,
      attemptedCompanyId,
      fields,
      normalizedIdentifier: fields.taxId,
      candidates,
      proposal: {
        kind: 'registration',
        commandId,
        clientAccountId: null,
        version: null,
      },
    });
  }

  async proposeCorrection(options: {
    actor: ActorContext;
    attemptedCompanyId: string;
    commandId: string;
    clientAccountId: string;
    version: number;
    fields: NormalizedDossierFields;
  }): Promise<string | undefined> {
    const { actor, attemptedCompanyId, commandId, clientAccountId, version } =
      options;
    if (options.fields.taxId === null) return undefined;
    await this.lockIdentifier(actor.workspaceId, options.fields.taxId);
    const candidates = (
      await this.findCandidates(actor.workspaceId, options.fields.taxId)
    ).filter((candidate) => candidate.id !== clientAccountId);
    if (candidates.length === 0) return undefined;
    return this.persistReview({
      actor,
      attemptedCompanyId,
      fields: options.fields,
      normalizedIdentifier: options.fields.taxId,
      candidates,
      proposal: {
        kind: 'correction',
        commandId,
        clientAccountId,
        version,
      },
    });
  }

  async registrationReplayReference(
    actor: ActorContext,
    commandId: string,
  ): Promise<string | undefined> {
    return this.replayReference(actor.workspaceId, {
      kind: 'registration',
      commandId,
    });
  }

  async correctionReplayReference(
    actor: ActorContext,
    commandId: string,
  ): Promise<string | undefined> {
    return this.replayReference(actor.workspaceId, {
      kind: 'correction',
      commandId,
    });
  }

  async list(
    actor: ActorContext,
    request: ClientDuplicateReviewPageRequest,
  ): Promise<ClientDuplicateReviewPage> {
    const attemptedCompanyId = actor.activeCompany?.id;
    if (!attemptedCompanyId) {
      if (request.cursor) throw invalidDuplicateReviewCursor();
      return { items: [], next_cursor: null };
    }
    return this.databaseContext.transaction(async () => {
      const anchor = request.cursor
        ? await this.resolvePaginationAnchor(
            actor.workspaceId,
            attemptedCompanyId,
            request.cursor,
          )
        : undefined;
      const afterAnchor = anchor
        ? sql<boolean>`(
            ${clientDuplicateReviews.createdAt},
            ${clientDuplicateReviews.reference}
          ) > (
            ${anchor.createdAt}::timestamptz,
            ${anchor.reference}::uuid
          )`
        : undefined;
      const reviews = await this.databaseContext.connection
        .select()
        .from(clientDuplicateReviews)
        .where(
          and(
            eq(clientDuplicateReviews.workspaceId, actor.workspaceId),
            eq(clientDuplicateReviews.attemptedCompanyId, attemptedCompanyId),
            afterAnchor,
          ),
        )
        .orderBy(
          asc(clientDuplicateReviews.createdAt),
          asc(clientDuplicateReviews.reference),
        )
        .limit(request.pageSize + 1);
      const pageReviews = reviews.slice(0, request.pageSize);
      const authorized = await this.resolveAuthorizedReviews(
        actor,
        pageReviews,
      );
      const items: ClientDuplicateReviewListItem[] = pageReviews
        .filter((review) => authorized.has(review.reference))
        .map((review) => ({
          duplicate_review_reference: review.reference,
        }));
      const lastScannedReview = pageReviews.at(-1);
      return {
        items,
        next_cursor:
          reviews.length > request.pageSize && lastScannedReview
            ? lastScannedReview.paginationCursor
            : null,
      };
    }, DUPLICATE_REVIEW_READ_TRANSACTION);
  }

  async read(
    actor: ActorContext,
    reference: string,
  ): Promise<ClientDuplicateReviewDetail> {
    const resolved = await this.databaseContext.transaction(async () => {
      const [review] = await this.databaseContext.connection
        .select()
        .from(clientDuplicateReviews)
        .where(
          and(
            eq(clientDuplicateReviews.workspaceId, actor.workspaceId),
            eq(clientDuplicateReviews.reference, reference),
          ),
        )
        .limit(1);
      if (!review) return undefined;
      return (await this.resolveAuthorizedReviews(actor, [review])).get(
        reference,
      );
    }, DUPLICATE_REVIEW_READ_TRANSACTION);
    if (!resolved) throw new NotFoundException();
    if (resolved.candidates.length > 1) {
      return {
        outcome: 'multiple_duplicate_candidates_require_data_remediation',
        duplicate_review_reference: reference,
      };
    }
    const candidate = resolved.candidates[0];
    if (!candidate) throw new NotFoundException();
    return {
      outcome: 'comparison',
      duplicate_review_reference: reference,
      proposal: {
        kind: resolved.proposalKind,
        fields: resolved.proposedFields,
      },
      candidate: {
        id: candidate.id,
        displayName: candidate.displayName,
        taxId: candidate.taxId,
        address: candidate.address,
        telephone: candidate.telephone,
        generalEmail: candidate.generalEmail,
        contacts: candidate.contacts,
        businessActivity: candidate.businessActivity,
        version: candidate.version,
        relatedToActiveCompany: resolved.attemptedCompanyRelatedClientIds.has(
          candidate.id,
        ),
        involvedCompanyDisplayNames: resolved.relationships
          .filter(
            (relationship) => relationship.clientAccountId === candidate.id,
          )
          .map((relationship) => relationship.companyDisplayName)
          .toSorted(),
      },
    };
  }

  private async persistReview(options: {
    actor: ActorContext;
    attemptedCompanyId: string;
    fields: NormalizedDossierFields;
    normalizedIdentifier: string;
    candidates: DuplicateCandidateVersion[];
    proposal: ReviewProposal;
  }): Promise<string> {
    const [review] = await this.databaseContext.connection
      .insert(clientDuplicateReviews)
      .values({
        workspaceId: options.actor.workspaceId,
        proposalKind: options.proposal.kind,
        proposalActorWorkspaceMembershipId: options.actor.workspaceMembershipId,
        attemptedCompanyId: options.attemptedCompanyId,
        registrationCommandId:
          options.proposal.kind === 'registration'
            ? options.proposal.commandId
            : null,
        correctionCommandId:
          options.proposal.kind === 'correction'
            ? options.proposal.commandId
            : null,
        proposalClientAccountId: options.proposal.clientAccountId,
        proposalVersion: options.proposal.version,
        normalizedIdentifier: options.normalizedIdentifier,
        proposedFields: options.fields,
      })
      .returning({ reference: clientDuplicateReviews.reference });
    if (!review)
      throw new Error('The duplicate review could not be persisted.');

    await this.databaseContext.connection
      .insert(clientDuplicateReviewCandidates)
      .values(
        options.candidates.map((candidate) => ({
          workspaceId: options.actor.workspaceId,
          reviewReference: review.reference,
          clientAccountId: candidate.id,
          capturedVersion: candidate.version,
        })),
      );

    const participantIds = options.candidates.map((candidate) => candidate.id);
    if (options.proposal.clientAccountId) {
      participantIds.push(options.proposal.clientAccountId);
    }
    const relationships = await this.databaseContext.connection
      .select({
        id: clientCompanyRelationships.id,
        clientAccountId: clientCompanyRelationships.clientAccountId,
        companyId: clientCompanyRelationships.companyId,
      })
      .from(clientCompanyRelationships)
      .where(
        and(
          eq(clientCompanyRelationships.workspaceId, options.actor.workspaceId),
          inArray(clientCompanyRelationships.clientAccountId, participantIds),
          eq(clientCompanyRelationships.status, 'active'),
        ),
      );
    if (relationships.length > 0) {
      await this.databaseContext.connection
        .insert(clientDuplicateReviewRelationshipSnapshots)
        .values(
          relationships.map((relationship) => ({
            workspaceId: options.actor.workspaceId,
            reviewReference: review.reference,
            participantKind:
              relationship.clientAccountId === options.proposal.clientAccountId
                ? 'proposal'
                : 'candidate',
            clientAccountId: relationship.clientAccountId,
            companyId: relationship.companyId,
            relationshipId: relationship.id,
          })),
        );
    }
    return review.reference;
  }

  private async resolvePaginationAnchor(
    workspaceId: string,
    attemptedCompanyId: string,
    cursor: string,
  ): Promise<DuplicateReviewPaginationAnchor> {
    const [anchor] = await this.databaseContext.connection
      .select({
        createdAt: sql<string>`${clientDuplicateReviews.createdAt}::text`,
        reference: clientDuplicateReviews.reference,
      })
      .from(clientDuplicateReviews)
      .where(
        and(
          eq(clientDuplicateReviews.workspaceId, workspaceId),
          eq(clientDuplicateReviews.attemptedCompanyId, attemptedCompanyId),
          eq(clientDuplicateReviews.paginationCursor, cursor),
        ),
      )
      .limit(1);
    if (!anchor) throw invalidDuplicateReviewCursor();
    return anchor;
  }

  private async resolveAuthorizedReviews(
    actor: ActorContext,
    reviews: readonly DuplicateReview[],
  ): Promise<ReadonlyMap<string, AuthorizedDuplicateReview>> {
    if (reviews.length === 0) return new Map();

    const reviewReferences = reviews.map((review) => review.reference);
    const proposalActorMembershipIds = uniqueStrings(
      reviews.map((review) => review.proposalActorWorkspaceMembershipId),
    );
    const proposalActors = await this.databaseContext.connection
      .select({ membershipId: workspaceMemberships.id })
      .from(workspaceMemberships)
      .innerJoin(
        internalUsers,
        and(
          eq(internalUsers.id, workspaceMemberships.internalUserId),
          eq(internalUsers.status, 'active'),
        ),
      )
      .where(
        and(
          eq(workspaceMemberships.workspaceId, actor.workspaceId),
          inArray(workspaceMemberships.id, proposalActorMembershipIds),
          eq(workspaceMemberships.status, 'active'),
        ),
      );
    const activeProposalActorIds = new Set(
      proposalActors.map((proposalActor) => proposalActor.membershipId),
    );

    const attemptedCompanies = await this.databaseContext.connection
      .select({ id: companies.id })
      .from(companies)
      .where(
        and(
          eq(companies.workspaceId, actor.workspaceId),
          inArray(
            companies.id,
            uniqueStrings(reviews.map((review) => review.attemptedCompanyId)),
          ),
          eq(companies.status, 'active'),
        ),
      );
    const activeAttemptedCompanyIds = new Set(
      attemptedCompanies.map((company) => company.id),
    );

    const candidateSnapshots = await this.databaseContext.connection
      .select()
      .from(clientDuplicateReviewCandidates)
      .where(
        and(
          eq(clientDuplicateReviewCandidates.workspaceId, actor.workspaceId),
          inArray(
            clientDuplicateReviewCandidates.reviewReference,
            reviewReferences,
          ),
        ),
      );
    const candidateSnapshotsByReview = groupBy(
      candidateSnapshots,
      (snapshot) => snapshot.reviewReference,
    );

    const relationshipSnapshots = await this.databaseContext.connection
      .select()
      .from(clientDuplicateReviewRelationshipSnapshots)
      .where(
        and(
          eq(
            clientDuplicateReviewRelationshipSnapshots.workspaceId,
            actor.workspaceId,
          ),
          inArray(
            clientDuplicateReviewRelationshipSnapshots.reviewReference,
            reviewReferences,
          ),
        ),
      );
    const relationshipSnapshotsByReview = groupBy(
      relationshipSnapshots,
      (snapshot) => snapshot.reviewReference,
    );

    const participantIds = uniqueStrings([
      ...candidateSnapshots.map((snapshot) => snapshot.clientAccountId),
      ...reviews.flatMap((review) =>
        review.proposalClientAccountId ? [review.proposalClientAccountId] : [],
      ),
    ]);
    const participantAccounts =
      participantIds.length === 0
        ? []
        : await this.databaseContext.connection
            .select()
            .from(clientAccounts)
            .where(
              and(
                eq(clientAccounts.workspaceId, actor.workspaceId),
                inArray(clientAccounts.id, participantIds),
                eq(clientAccounts.status, 'active'),
              ),
            );
    const participantAccountsById = new Map(
      participantAccounts.map((account) => [account.id, account]),
    );

    const currentGroupAccounts = await this.identifierIndex.candidates(
      actor.workspaceId,
      uniqueStrings(reviews.map((review) => review.normalizedIdentifier)),
    );
    const currentGroupIdsByIdentifier = groupByDefined(
      currentGroupAccounts,
      (account) => account.taxId,
      (account) => account.id,
    );

    const relationships =
      participantIds.length === 0
        ? []
        : await this.databaseContext.connection
            .select({
              id: clientCompanyRelationships.id,
              clientAccountId: clientCompanyRelationships.clientAccountId,
              companyId: clientCompanyRelationships.companyId,
              companyDisplayName: companies.displayName,
              companyStatus: companies.status,
            })
            .from(clientCompanyRelationships)
            .innerJoin(
              companies,
              and(
                eq(
                  companies.workspaceId,
                  clientCompanyRelationships.workspaceId,
                ),
                eq(companies.id, clientCompanyRelationships.companyId),
              ),
            )
            .where(
              and(
                eq(clientCompanyRelationships.workspaceId, actor.workspaceId),
                inArray(
                  clientCompanyRelationships.clientAccountId,
                  participantIds,
                ),
                eq(clientCompanyRelationships.status, 'active'),
              ),
            );
    const relationshipsByClientAccount = groupBy(
      relationships,
      (relationship) => relationship.clientAccountId,
    );

    const pendingAuthorization = new Map<
      string,
      DuplicateReviewPendingAuthorization
    >();
    for (const review of reviews) {
      const resolved = resolveFreshDuplicateReview({
        actor,
        review,
        activeProposalActorIds,
        activeAttemptedCompanyIds,
        candidateSnapshots:
          candidateSnapshotsByReview.get(review.reference) ?? [],
        relationshipSnapshots:
          relationshipSnapshotsByReview.get(review.reference) ?? [],
        participantAccountsById,
        currentGroupIds:
          currentGroupIdsByIdentifier.get(review.normalizedIdentifier) ?? [],
        relationshipsByClientAccount,
      });
      if (resolved) pendingAuthorization.set(review.reference, resolved);
    }

    const allCompanyIds = uniqueStrings(
      [...pendingAuthorization.values()].flatMap((review) => review.scope),
    );
    const authorizedCompanyIds =
      await this.companyAuthorization.duplicateReviewAuthorizedCompanyIds(
        actor,
        allCompanyIds,
      );
    const authorized = new Map<string, AuthorizedDuplicateReview>();
    for (const [reference, review] of pendingAuthorization) {
      if (
        !review.scope.every((companyId) => authorizedCompanyIds.has(companyId))
      ) {
        continue;
      }
      authorized.set(reference, {
        proposalKind: review.proposalKind,
        proposedFields: review.proposedFields,
        candidates: review.candidates,
        relationships: review.relationships,
        attemptedCompanyRelatedClientIds:
          review.attemptedCompanyRelatedClientIds,
      });
    }
    return authorized;
  }

  private async replayReference(
    workspaceId: string,
    source:
      | { kind: 'registration'; commandId: string }
      | { kind: 'correction'; commandId: string },
  ): Promise<string | undefined> {
    const condition =
      source.kind === 'registration'
        ? eq(clientDuplicateReviews.registrationCommandId, source.commandId)
        : eq(clientDuplicateReviews.correctionCommandId, source.commandId);
    const [review] = await this.databaseContext.connection
      .select({ reference: clientDuplicateReviews.reference })
      .from(clientDuplicateReviews)
      .where(
        and(eq(clientDuplicateReviews.workspaceId, workspaceId), condition),
      )
      .limit(1);
    return review?.reference;
  }

  private findCandidates(workspaceId: string, normalizedIdentifier: string) {
    return this.identifierIndex.candidates(workspaceId, [normalizedIdentifier]);
  }

  private async lockIdentifier(
    workspaceId: string,
    normalizedIdentifier: string,
  ): Promise<void> {
    await this.identifierIndex.lock({ workspaceId, normalizedIdentifier });
  }
}

export function throwDuplicateReviewConflict(reference: string): never {
  throw new ConflictException({
    statusCode: 409,
    error: 'Conflict',
    code: POSSIBLE_DUPLICATE_REVIEW_REQUIRED,
    duplicate_review_reference: reference,
  });
}

function resolveFreshDuplicateReview(options: {
  actor: ActorContext;
  review: DuplicateReview;
  activeProposalActorIds: ReadonlySet<string>;
  activeAttemptedCompanyIds: ReadonlySet<string>;
  candidateSnapshots: readonly DuplicateReviewCandidateSnapshot[];
  relationshipSnapshots: readonly DuplicateReviewRelationshipSnapshot[];
  participantAccountsById: ReadonlyMap<string, DuplicateReviewCandidate>;
  currentGroupIds: readonly string[];
  relationshipsByClientAccount: ReadonlyMap<
    string,
    readonly DuplicateReviewRelationship[]
  >;
}): DuplicateReviewPendingAuthorization | undefined {
  const { review } = options;
  if (review.attemptedCompanyId !== options.actor.activeCompany?.id) {
    return undefined;
  }
  const proposalKind = duplicateReviewProposalKind(review.proposalKind);
  if (
    !proposalKind ||
    !options.activeProposalActorIds.has(
      review.proposalActorWorkspaceMembershipId,
    ) ||
    !options.activeAttemptedCompanyIds.has(review.attemptedCompanyId) ||
    options.candidateSnapshots.length === 0
  ) {
    return undefined;
  }

  const sortedSnapshots = options.candidateSnapshots.toSorted((left, right) =>
    left.clientAccountId.localeCompare(right.clientAccountId),
  );
  const candidates: DuplicateReviewCandidate[] = [];
  for (const snapshot of sortedSnapshots) {
    const candidate = options.participantAccountsById.get(
      snapshot.clientAccountId,
    );
    if (!candidate || candidate.version !== snapshot.capturedVersion) {
      return undefined;
    }
    candidates.push(candidate);
  }
  const candidateIds = sortedSnapshots.map(
    (snapshot) => snapshot.clientAccountId,
  );
  if (!sameStringSets(options.currentGroupIds, candidateIds)) return undefined;

  const participantIds = new Set(candidateIds);
  if (proposalKind === 'correction') {
    if (
      review.proposalClientAccountId === null ||
      review.proposalVersion === null
    ) {
      return undefined;
    }
    const proposalClient = options.participantAccountsById.get(
      review.proposalClientAccountId,
    );
    if (!proposalClient || proposalClient.version !== review.proposalVersion) {
      return undefined;
    }
    participantIds.add(review.proposalClientAccountId);
  }

  const relationshipsById = new Map<string, DuplicateReviewRelationship>();
  for (const participantId of participantIds) {
    for (const relationship of options.relationshipsByClientAccount.get(
      participantId,
    ) ?? []) {
      relationshipsById.set(relationship.id, relationship);
    }
  }
  const relationships = [...relationshipsById.values()];
  if (
    relationships.some(
      (relationship) => relationship.companyStatus !== 'active',
    ) ||
    !sameStringSets(
      relationships.map((relationship) => relationship.id),
      options.relationshipSnapshots.map((snapshot) => snapshot.relationshipId),
    )
  ) {
    return undefined;
  }
  for (const candidateId of candidateIds) {
    if (
      !relationships.some(
        (relationship) => relationship.clientAccountId === candidateId,
      )
    ) {
      return undefined;
    }
  }

  const candidateIdSet = new Set(candidateIds);
  const scope = uniqueStrings([
    review.attemptedCompanyId,
    ...relationships
      .filter((relationship) =>
        candidateIdSet.has(relationship.clientAccountId),
      )
      .map((relationship) => relationship.companyId),
  ]);
  return {
    proposalKind,
    proposedFields: review.proposedFields,
    candidates,
    relationships,
    scope,
    attemptedCompanyRelatedClientIds: new Set(
      relationships
        .filter(
          (relationship) =>
            relationship.companyId === review.attemptedCompanyId,
        )
        .map((relationship) => relationship.clientAccountId),
    ),
  };
}

function groupBy<Value>(
  values: readonly Value[],
  keyFor: (value: Value) => string,
): Map<string, Value[]> {
  const grouped = new Map<string, Value[]>();
  for (const value of values) {
    const key = keyFor(value);
    const group = grouped.get(key) ?? [];
    group.push(value);
    grouped.set(key, group);
  }
  return grouped;
}

function groupByDefined<Value, Item>(
  values: readonly Value[],
  keyFor: (value: Value) => string | null,
  itemFor: (value: Value) => Item,
): Map<string, Item[]> {
  const grouped = new Map<string, Item[]>();
  for (const value of values) {
    const key = keyFor(value);
    if (key === null) continue;
    const group = grouped.get(key) ?? [];
    group.push(itemFor(value));
    grouped.set(key, group);
  }
  return grouped;
}

function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function invalidDuplicateReviewCursor(): BadRequestException {
  return new BadRequestException('Invalid duplicate-review pagination query.');
}

function sameStringSets(
  left: readonly string[],
  right: readonly string[],
): boolean {
  const leftIds = left.toSorted();
  const rightIds = right.toSorted();
  return (
    leftIds.length === rightIds.length &&
    leftIds.every((value, index) => value === rightIds[index])
  );
}

function duplicateReviewProposalKind(
  value: string,
): 'registration' | 'correction' | undefined {
  switch (value) {
    case 'registration':
    case 'correction':
      return value;
    default:
      return undefined;
  }
}
