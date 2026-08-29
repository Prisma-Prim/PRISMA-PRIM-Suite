import {
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
import {
  POSSIBLE_DUPLICATE_REVIEW_REQUIRED,
  type ClientDuplicateReviewDetail,
  type ClientDuplicateReviewListItem,
} from './client-duplicate-review.types.js';

type DuplicateCandidate = Pick<
  typeof clientAccounts.$inferSelect,
  'id' | 'version'
>;

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

  async list(actor: ActorContext): Promise<ClientDuplicateReviewListItem[]> {
    const attemptedCompanyId = actor.activeCompany?.id;
    if (!attemptedCompanyId) return [];
    return this.databaseContext.transaction(async () => {
      const reviews = await this.databaseContext.connection
        .select({ reference: clientDuplicateReviews.reference })
        .from(clientDuplicateReviews)
        .where(
          and(
            eq(clientDuplicateReviews.workspaceId, actor.workspaceId),
            eq(clientDuplicateReviews.attemptedCompanyId, attemptedCompanyId),
          ),
        )
        .orderBy(
          asc(clientDuplicateReviews.createdAt),
          asc(clientDuplicateReviews.reference),
        );
      const visible: ClientDuplicateReviewListItem[] = [];
      for (const review of reviews) {
        if (await this.resolveAuthorizedReview(actor, review.reference)) {
          visible.push({ duplicate_review_reference: review.reference });
        }
      }
      return visible;
    }, DUPLICATE_REVIEW_READ_TRANSACTION);
  }

  async read(
    actor: ActorContext,
    reference: string,
  ): Promise<ClientDuplicateReviewDetail> {
    const resolved = await this.databaseContext.transaction(
      () => this.resolveAuthorizedReview(actor, reference),
      DUPLICATE_REVIEW_READ_TRANSACTION,
    );
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
    candidates: DuplicateCandidate[];
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

  private async resolveAuthorizedReview(
    actor: ActorContext,
    reference: string,
  ) {
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
    if (!review || review.attemptedCompanyId !== actor.activeCompany?.id) {
      return undefined;
    }
    const proposalKind = duplicateReviewProposalKind(review.proposalKind);
    if (!proposalKind) return undefined;

    const [proposalActor] = await this.databaseContext.connection
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
          eq(
            workspaceMemberships.id,
            review.proposalActorWorkspaceMembershipId,
          ),
          eq(workspaceMemberships.status, 'active'),
        ),
      )
      .limit(1);
    if (!proposalActor) return undefined;

    const [attemptedCompany] = await this.databaseContext.connection
      .select({ id: companies.id })
      .from(companies)
      .where(
        and(
          eq(companies.workspaceId, actor.workspaceId),
          eq(companies.id, review.attemptedCompanyId),
          eq(companies.status, 'active'),
        ),
      )
      .limit(1);
    if (!attemptedCompany) return undefined;

    const snapshots = await this.databaseContext.connection
      .select()
      .from(clientDuplicateReviewCandidates)
      .where(
        and(
          eq(clientDuplicateReviewCandidates.workspaceId, actor.workspaceId),
          eq(clientDuplicateReviewCandidates.reviewReference, reference),
        ),
      );
    if (snapshots.length === 0) return undefined;
    const candidateIds = snapshots.map((snapshot) => snapshot.clientAccountId);
    const candidates = await this.databaseContext.connection
      .select()
      .from(clientAccounts)
      .where(
        and(
          eq(clientAccounts.workspaceId, actor.workspaceId),
          inArray(clientAccounts.id, candidateIds),
          eq(clientAccounts.status, 'active'),
          eq(clientAccounts.taxId, review.normalizedIdentifier),
        ),
      );
    if (
      candidates.length !== snapshots.length ||
      candidates.some(
        (candidate) =>
          snapshots.find(
            (snapshot) => snapshot.clientAccountId === candidate.id,
          )?.capturedVersion !== candidate.version,
      )
    ) {
      return undefined;
    }
    const currentGroup = await this.findCandidates(
      actor.workspaceId,
      review.normalizedIdentifier,
    );
    if (
      !sameStringSets(
        currentGroup.map((candidate) => candidate.id),
        snapshots.map((snapshot) => snapshot.clientAccountId),
      )
    ) {
      return undefined;
    }

    const relationshipSnapshots = await this.databaseContext.connection
      .select()
      .from(clientDuplicateReviewRelationshipSnapshots)
      .where(
        and(
          eq(
            clientDuplicateReviewRelationshipSnapshots.workspaceId,
            actor.workspaceId,
          ),
          eq(
            clientDuplicateReviewRelationshipSnapshots.reviewReference,
            reference,
          ),
        ),
      );
    const participantIds = [...candidateIds];
    if (proposalKind === 'correction') {
      if (!review.proposalClientAccountId || !review.proposalVersion) {
        return undefined;
      }
      participantIds.push(review.proposalClientAccountId);
      const [proposalClient] = await this.databaseContext.connection
        .select({ version: clientAccounts.version })
        .from(clientAccounts)
        .where(
          and(
            eq(clientAccounts.workspaceId, actor.workspaceId),
            eq(clientAccounts.id, review.proposalClientAccountId),
            eq(clientAccounts.status, 'active'),
            eq(clientAccounts.version, review.proposalVersion),
          ),
        )
        .limit(1);
      if (!proposalClient) return undefined;
    }
    const relationships = await this.databaseContext.connection
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
          eq(companies.workspaceId, clientCompanyRelationships.workspaceId),
          eq(companies.id, clientCompanyRelationships.companyId),
        ),
      )
      .where(
        and(
          eq(clientCompanyRelationships.workspaceId, actor.workspaceId),
          inArray(clientCompanyRelationships.clientAccountId, participantIds),
          eq(clientCompanyRelationships.status, 'active'),
        ),
      );
    if (
      relationships.some(
        (relationship) => relationship.companyStatus !== 'active',
      ) ||
      !sameStringSets(
        relationships.map((relationship) => relationship.id),
        relationshipSnapshots.map((snapshot) => snapshot.relationshipId),
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

    const scope = [
      review.attemptedCompanyId,
      ...relationships
        .filter((relationship) =>
          candidateIds.includes(relationship.clientAccountId),
        )
        .map((relationship) => relationship.companyId),
    ];
    if (
      !(await this.companyAuthorization.hasCompleteDuplicateReviewAuthority(
        actor,
        scope,
      ))
    ) {
      return undefined;
    }
    return {
      proposalKind,
      proposedFields: review.proposedFields,
      candidates,
      relationships,
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
    return this.databaseContext.connection
      .select({ id: clientAccounts.id, version: clientAccounts.version })
      .from(clientAccounts)
      .where(
        and(
          eq(clientAccounts.workspaceId, workspaceId),
          eq(clientAccounts.status, 'active'),
          eq(clientAccounts.taxId, normalizedIdentifier),
        ),
      )
      .orderBy(asc(clientAccounts.id));
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

export function throwDuplicateReviewConflict(reference: string): never {
  throw new ConflictException({
    statusCode: 409,
    error: 'Conflict',
    code: POSSIBLE_DUPLICATE_REVIEW_REQUIRED,
    duplicate_review_reference: reference,
  });
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
