import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { and, asc, eq, gt, sql } from 'drizzle-orm';
import type { ActorContext } from '../access/access.types.js';
import {
  requireIdempotencyKey,
  requireUuid,
} from '../access/access-command-validation.js';
import { AccountabilityService } from '../accountability/accountability.service.js';
import { SERVER_CLOCK, type ServerClock } from '../clock/server-clock.js';
import { DatabaseContext } from '../database/database-context.js';
import {
  documentVersions,
  knowledgeInteractions,
  knowledgePassages,
  knowledgeSourceCommands,
  knowledgeSourceEvents,
  knowledgeSources,
} from '../database/schema/index.js';
import { DocumentContentService } from '../documents/document-content.service.js';
import { DocumentReadBoundary } from '../documents/document-read-boundary.js';
import { KnowledgeAuthorization } from './knowledge.authorization.js';
import {
  KNOWLEDGE_CAPABILITY,
  requireKnowledgeCapability,
} from './knowledge-capability.js';
import type {
  KnowledgePassage,
  KnowledgeReceipt,
  KnowledgeSearchPage,
  KnowledgeSourcePage,
  KnowledgeSourceSummary,
} from './knowledge.types.js';
import {
  actionInput,
  draftInput,
  hash,
  invalid,
  literal,
  object,
  readQuery,
  revision,
  sha256,
  type KnowledgeMode,
} from './knowledge.validation.js';

type Source = typeof knowledgeSources.$inferSelect;
type Version = typeof documentVersions.$inferSelect;
type Passage = typeof knowledgePassages.$inferSelect;
interface Command {
  actor: ActorContext;
  body: unknown;
  key: string | undefined;
}

@Injectable()
export class KnowledgeService {
  constructor(
    private readonly database: DatabaseContext,
    private readonly authorization: KnowledgeAuthorization,
    private readonly boundary: DocumentReadBoundary,
    private readonly content: DocumentContentService,
    private readonly accountability: AccountabilityService,
    @Inject(SERVER_CLOCK) private readonly clock: ServerClock,
  ) {}

  create({ actor, body, key }: Command): Promise<KnowledgeReceipt> {
    return this.database.transaction(async () => {
      const companyId = await this.authorization.require(actor, 'admin');
      const input = draftInput(body);
      const visible = await this.requireEligibleDocument(
        actor,
        input.documentId,
        { lockFamily: true },
      );
      const version = await this.version(
        actor,
        input.documentId,
        input.documentVersionId,
      );
      if (version.status === 'draft')
        throw new ConflictException(
          'An official or explicitly historical Version is required.',
        );
      const stored = await this.content.downloadWithinReadTransaction(actor, {
        documentId: input.documentId,
        versionId: input.documentVersionId,
        representationId: input.representationId,
      });
      if (stored.sha256 !== input.sourceSha256)
        throw new ConflictException('The preserved source checksum differs.');
      const fingerprint = sha256(
        JSON.stringify({ companyId, kind: 'create', input }),
      );
      const replay = await this.replay(actor, companyId, key, fingerprint);
      if (replay) return replay;
      const projectionSha256 = projectionHash({
        ...input,
        passages: input.passages,
      });
      const [source] = await this.database.connection
        .insert(knowledgeSources)
        .values({
          workspaceId: actor.workspaceId,
          companyId,
          documentId: input.documentId,
          documentVersionId: input.documentVersionId,
          representationId: input.representationId,
          sourceSha256: input.sourceSha256,
          projectionSha256,
          language: input.language,
          ownerReference: input.ownerReference,
          provenance: input.provenance,
          rightsEvidenceReference: input.rightsEvidenceReference,
          permittedPurpose: input.permittedPurpose,
          confidentiality: visible.document.confidentiality,
          effectiveFrom: input.effectiveFrom,
          effectiveUntil: input.effectiveUntil,
          createdByMembershipId: actor.workspaceMembershipId,
          createdAt: this.now(),
        })
        .returning();
      if (!source) throw new Error('The source draft was not recorded.');
      await this.database.connection.insert(knowledgePassages).values(
        input.passages.map((passage, position) => ({
          workspaceId: actor.workspaceId,
          companyId,
          sourceId: source.id,
          position: position + 1,
          locator: passage.locator,
          text: passage.text,
          sha256: sha256(passage.text),
        })),
      );
      return this.finish(actor, source, key, fingerprint, 'drafted');
    });
  }

  change({
    actor,
    sourceId,
    body,
    key,
    action,
  }: Command & {
    sourceId: string;
    action: 'admit' | 'revoke';
  }): Promise<KnowledgeReceipt> {
    return this.database.transaction(async () => {
      const companyId = await this.authorization.require(actor, 'admin');
      const id = requireUuid(sourceId);
      const input = actionInput(body, action);
      const fingerprint = sha256(
        JSON.stringify({ companyId, sourceId: id, input }),
      );
      const replay = await this.replay(actor, companyId, key, fingerprint);
      if (replay) return replay;
      const source = await this.source(actor, id, true);
      await this.requireEligibleDocument(actor, source.documentId, {
        lockFamily: true,
      });
      const version = await this.version(
        actor,
        source.documentId,
        source.documentVersionId,
      );
      if (version.status === 'draft')
        throw new ConflictException(
          'The source Version is unavailable for admission.',
        );
      if (source.revision !== input.expectedRevision)
        throw new ConflictException({ code: 'knowledge_revision_conflict' });
      if (
        (input.kind === 'admit' && source.state !== 'draft') ||
        (input.kind === 'revoke' && source.state === 'revoked')
      )
        throw new ConflictException('The source transition is unavailable.');
      if (input.kind === 'admit') {
        if (
          input.sourceSha256 !== source.sourceSha256 ||
          input.projectionSha256 !== source.projectionSha256
        )
          throw new ConflictException(
            'The reviewed source or projection differs.',
          );
        await this.verifiedPassages(actor, source);
      }
      const [changed] = await this.database.connection
        .update(knowledgeSources)
        .set({
          state: input.kind === 'admit' ? 'admitted' : 'revoked',
          revision: source.revision + 1,
        })
        .where(
          and(
            eq(knowledgeSources.id, source.id),
            eq(knowledgeSources.workspaceId, actor.workspaceId),
            eq(knowledgeSources.companyId, companyId),
          ),
        )
        .returning();
      if (!changed) throw new Error('The source transition was not recorded.');
      return this.finish(
        actor,
        changed,
        key,
        fingerprint,
        input.kind === 'admit' ? 'admitted' : 'revoked',
      );
    });
  }

  inspect(actor: ActorContext, sourceId: string) {
    return this.database.transaction(async () => {
      await this.authorization.require(actor, 'admin');
      const source = await this.source(actor, requireUuid(sourceId));
      const version = await this.version(
        actor,
        source.documentId,
        source.documentVersionId,
      );
      const passages = await this.verifiedPassages(actor, source);
      const history = await this.database.connection
        .select({
          revision: knowledgeSourceEvents.revision,
          action: knowledgeSourceEvents.action,
          actorMembershipId: knowledgeSourceEvents.actorMembershipId,
          actorDisplayName: knowledgeSourceEvents.actorDisplayName,
          recordedAt: knowledgeSourceEvents.recordedAt,
        })
        .from(knowledgeSourceEvents)
        .where(
          and(
            eq(knowledgeSourceEvents.workspaceId, actor.workspaceId),
            eq(knowledgeSourceEvents.companyId, source.companyId),
            eq(knowledgeSourceEvents.sourceId, source.id),
          ),
        )
        .orderBy(asc(knowledgeSourceEvents.revision));
      return {
        ...receipt(source),
        documentId: source.documentId,
        documentVersionId: source.documentVersionId,
        representationId: source.representationId,
        versionStatus: version.status,
        language: source.language,
        ownerReference: source.ownerReference,
        provenance: source.provenance,
        rightsEvidenceReference: source.rightsEvidenceReference,
        permittedPurpose: source.permittedPurpose,
        confidentiality: source.confidentiality,
        effectiveFrom: source.effectiveFrom.toISOString(),
        effectiveUntil: source.effectiveUntil.toISOString(),
        passages: passages.map(({ locator, text }) => ({ locator, text })),
        history,
      };
    });
  }

  list(actor: ActorContext, query: unknown): Promise<KnowledgeSourcePage> {
    return this.read(actor, 'list', async () => {
      const input = readQuery(query, 'list');
      const cursor = decodeCursor(input.cursor, false);
      const items: KnowledgeSourceSummary[] = [];
      let after = cursor?.sourceId;
      for (;;) {
        const batch = await this.candidates(actor, input.mode, after);
        if (batch.length === 0) break;
        for (const source of batch) {
          after = source.id;
          const eligible = await this.eligible(actor, source, input.mode);
          if (!eligible) continue;
          items.push(summary(source, eligible.version));
          if (items.length > input.limit)
            return {
              items: items.slice(0, input.limit),
              nextCursor: encodeCursor(items[input.limit - 1]),
            };
        }
        if (batch.length < 100) break;
      }
      return { items, nextCursor: null };
    });
  }

  search(actor: ActorContext, query: unknown): Promise<KnowledgeSearchPage> {
    return this.read(actor, 'search', async () => {
      const input = readQuery(query, 'search');
      if (input.query === null) throw invalid();
      const cursor = decodeCursor(input.cursor, true);
      const items: KnowledgePassage[] = [];
      let after: string | undefined = cursor?.sourceId;
      let inclusive = cursor !== null;
      for (;;) {
        const batch = await this.candidates(
          actor,
          input.mode,
          after,
          inclusive,
        );
        inclusive = false;
        if (batch.length === 0) break;
        for (const source of batch) {
          after = source.id;
          const eligible = await this.eligible(actor, source, input.mode);
          if (!eligible) continue;
          for (const passage of eligible.passages) {
            if (
              cursor &&
              source.id === cursor.sourceId &&
              passage.position <= cursor.position
            )
              continue;
            if (!passage.text.includes(input.query)) continue;
            items.push(this.passage(source, eligible.version, passage));
            if (items.length === input.limit)
              return {
                items,
                nextCursor: encodeCursor({
                  sourceId: source.id,
                  position: passage.position,
                }),
              };
          }
        }
        if (batch.length < 100) break;
      }
      return { items, nextCursor: null };
    });
  }

  getPassage(
    actor: ActorContext,
    sourceId: string,
    locator: string,
    query: unknown,
  ): Promise<KnowledgePassage> {
    return this.read(actor, 'passage', async () => {
      const input = readQuery(query, 'passage');
      const source = await this.source(actor, requireUuid(sourceId));
      const eligible = await this.eligible(actor, source, input.mode);
      if (!eligible) throw new NotFoundException();
      const target = literal(locator, 120);
      const passage = eligible.passages.find(
        (passage) => passage.locator === target,
      );
      if (!passage) throw new NotFoundException();
      return this.passage(source, eligible.version, passage);
    });
  }

  private async read<
    T extends KnowledgeSourcePage | KnowledgeSearchPage | KnowledgePassage,
  >(
    actor: ActorContext,
    operation: 'list' | 'search' | 'passage',
    work: () => Promise<T>,
  ): Promise<T> {
    requireKnowledgeCapability();
    return this.database.transaction(async () => {
      const companyId = await this.authorization.require(actor, 'reader');
      const result = await work();
      const sources =
        'items' in result
          ? result.items.map((item) => ('source' in item ? item.source : item))
          : [result.source];
      await this.database.connection.insert(knowledgeInteractions).values({
        workspaceId: actor.workspaceId,
        companyId,
        actorMembershipId: actor.workspaceMembershipId,
        capabilityVersion: KNOWLEDGE_CAPABILITY.version,
        operation,
        sourceReferences: sources.map((source) => ({
          sourceId: source.sourceId,
          documentVersionId: source.documentVersionId,
          projectionSha256: source.projectionSha256,
        })),
        recordedAt: this.now(),
      });
      return result;
    });
  }

  private async candidates(
    actor: ActorContext,
    mode: KnowledgeMode,
    after: string | undefined,
    inclusive = false,
  ): Promise<Source[]> {
    const companyId = actor.activeCompany?.id;
    if (!companyId) throw new ForbiddenException();
    const now = this.now();
    return this.database.connection
      .select()
      .from(knowledgeSources)
      .where(
        and(
          eq(knowledgeSources.workspaceId, actor.workspaceId),
          eq(knowledgeSources.companyId, companyId),
          eq(knowledgeSources.state, 'admitted'),
          sql`${knowledgeSources.effectiveFrom} <= ${now}`,
          sql`${knowledgeSources.effectiveUntil} > ${now}`,
          mode.kind === 'historical'
            ? eq(knowledgeSources.documentVersionId, mode.documentVersionId)
            : undefined,
          after
            ? inclusive
              ? sql`${knowledgeSources.id} >= ${after}::uuid`
              : gt(knowledgeSources.id, after)
            : undefined,
        ),
      )
      .orderBy(asc(knowledgeSources.id))
      .limit(100)
      .for('share');
  }

  private async eligible(
    actor: ActorContext,
    source: Source,
    mode: KnowledgeMode,
  ): Promise<{ version: Version; passages: Passage[] } | null> {
    const now = this.now();
    if (
      source.state !== 'admitted' ||
      source.effectiveFrom > now ||
      source.effectiveUntil <= now ||
      source.permittedPurpose !== 'cited-evidence'
    )
      return null;
    try {
      const version = await this.version(
        actor,
        source.documentId,
        source.documentVersionId,
      );
      if (
        version.status === 'draft' ||
        (mode.kind === 'current' && version.status !== 'official') ||
        (mode.kind === 'historical' && mode.documentVersionId !== version.id)
      )
        return null;
      const passages = await this.verifiedPassages(actor, source);
      return { version, passages };
    } catch (error: unknown) {
      if (
        error instanceof ForbiddenException ||
        error instanceof NotFoundException
      )
        return null;
      throw error;
    }
  }

  private async source(
    actor: ActorContext,
    sourceId: string,
    lock = false,
  ): Promise<Source> {
    const companyId = actor.activeCompany?.id;
    if (!companyId) throw new ForbiddenException();
    const query = this.database.connection
      .select()
      .from(knowledgeSources)
      .where(
        and(
          eq(knowledgeSources.id, sourceId),
          eq(knowledgeSources.workspaceId, actor.workspaceId),
          eq(knowledgeSources.companyId, companyId),
        ),
      );
    const [source] = lock
      ? await query.for('update')
      : await query.for('share');
    if (!source) throw new NotFoundException();
    await this.requireEligibleDocument(actor, source.documentId);
    return source;
  }

  private async version(
    actor: ActorContext,
    documentId: string,
    documentVersionId: string,
  ): Promise<Version> {
    const companyId = actor.activeCompany?.id;
    if (!companyId) throw new ForbiddenException();
    await this.requireEligibleDocument(actor, documentId);
    const [version] = await this.database.connection
      .select()
      .from(documentVersions)
      .where(
        and(
          eq(documentVersions.workspaceId, actor.workspaceId),
          eq(documentVersions.companyId, companyId),
          eq(documentVersions.documentId, documentId),
          eq(documentVersions.id, documentVersionId),
        ),
      )
      .for('share');
    if (!version) throw new NotFoundException();
    return version;
  }

  private async verifiedPassages(
    actor: ActorContext,
    source: Source,
  ): Promise<Passage[]> {
    await this.requireEligibleDocument(actor, source.documentId);
    const original = await this.content.downloadWithinReadTransaction(actor, {
      documentId: source.documentId,
      versionId: source.documentVersionId,
      representationId: source.representationId,
    });
    if (original.sha256 !== source.sourceSha256)
      throw new ServiceUnavailableException('Cited evidence is unavailable.');
    const passages = await this.database.connection
      .select()
      .from(knowledgePassages)
      .where(
        and(
          eq(knowledgePassages.workspaceId, actor.workspaceId),
          eq(knowledgePassages.companyId, source.companyId),
          eq(knowledgePassages.sourceId, source.id),
        ),
      )
      .orderBy(asc(knowledgePassages.position));
    if (
      passages.length < 1 ||
      passages.length > 20 ||
      passages.some((passage) => sha256(passage.text) !== passage.sha256) ||
      projectionHash({
        ...source,
        passages: passages.map(({ locator, text }) => ({ locator, text })),
      }) !== source.projectionSha256
    )
      throw new ServiceUnavailableException('Cited evidence is unavailable.');
    return passages;
  }

  private passage(
    source: Source,
    version: Version,
    passage: Passage,
  ): KnowledgePassage {
    return {
      source: summary(source, version),
      locator: passage.locator,
      text: passage.text,
      passageSha256: passage.sha256,
      retrievedAt: this.now().toISOString(),
    };
  }

  private async requireEligibleDocument(
    actor: ActorContext,
    documentId: string,
    options: { lockFamily: boolean } = { lockFamily: false },
  ) {
    const visible = await this.boundary.requireVisible(
      actor,
      documentId,
      options,
    );
    // Financial source authority never includes permission to disclose it to
    // Knowledge. Keep this owned policy explicit, including at read boundaries
    // if a prohibited source were supplied by invalid persisted state.
    if (
      visible.document.type !== 'questionnaire' &&
      visible.document.type !== 'mission-deliverable' &&
      visible.document.type !== 'received-contract'
    )
      throw new NotFoundException();
    return visible;
  }

  private async replay(
    actor: ActorContext,
    companyId: string,
    key: string | undefined,
    fingerprint: string,
  ): Promise<KnowledgeReceipt | null> {
    const validKey = requireIdempotencyKey(key);
    await this.database.connection.execute(
      sql`SELECT pg_advisory_xact_lock(hashtextextended(${`knowledge:${actor.workspaceId}:${actor.workspaceMembershipId}:${validKey}`}, 0))`,
    );
    const [command] = await this.database.connection
      .select()
      .from(knowledgeSourceCommands)
      .where(
        and(
          eq(knowledgeSourceCommands.workspaceId, actor.workspaceId),
          eq(
            knowledgeSourceCommands.actorMembershipId,
            actor.workspaceMembershipId,
          ),
          eq(knowledgeSourceCommands.key, validKey),
        ),
      );
    if (!command) return null;
    if (command.companyId !== companyId || command.fingerprint !== fingerprint)
      throw new ConflictException('The command key was already used.');
    await this.source(actor, command.sourceId);
    const value = object(command.result, [
      'sourceId',
      'revision',
      'state',
      'sourceSha256',
      'projectionSha256',
    ]);
    const state = value.state;
    if (state !== 'draft' && state !== 'admitted' && state !== 'revoked')
      throw new Error('The recorded source receipt is invalid.');
    return {
      sourceId: requireUuid(value.sourceId),
      revision: revision(value.revision),
      state,
      sourceSha256: hash(value.sourceSha256),
      projectionSha256: hash(value.projectionSha256),
    };
  }

  private async finish(
    actor: ActorContext,
    source: Source,
    key: string | undefined,
    fingerprint: string,
    action: 'drafted' | 'admitted' | 'revoked',
  ): Promise<KnowledgeReceipt> {
    const result = receipt(source);
    await this.accountability.recordKnowledgeSourceEvent({
      actor,
      companyId: source.companyId,
      sourceId: source.id,
      revision: source.revision,
      action,
      commandFingerprint: fingerprint,
      recordedAt: this.now(),
    });
    await this.database.connection.insert(knowledgeSourceCommands).values({
      workspaceId: actor.workspaceId,
      companyId: source.companyId,
      actorMembershipId: actor.workspaceMembershipId,
      key: requireIdempotencyKey(key),
      fingerprint,
      sourceId: source.id,
      result,
    });
    return result;
  }

  private now(): Date {
    const now = this.clock.now();
    if (!Number.isFinite(now.getTime()))
      throw new ServiceUnavailableException('Cited evidence is unavailable.');
    return now;
  }
}

function projectionHash(input: {
  documentVersionId: string;
  representationId: string;
  sourceSha256: string;
  passages: Array<{ locator: string; text: string }>;
}): string {
  return sha256(
    JSON.stringify({
      documentVersionId: input.documentVersionId,
      representationId: input.representationId,
      sourceSha256: input.sourceSha256,
      passages: input.passages,
    }),
  );
}
function receipt(source: Source): KnowledgeReceipt {
  return {
    sourceId: source.id,
    revision: source.revision,
    state: source.state,
    sourceSha256: source.sourceSha256,
    projectionSha256: source.projectionSha256,
  };
}
function summary(source: Source, version: Version): KnowledgeSourceSummary {
  if (version.status === 'draft' || version.frozenTitle === null)
    throw new ServiceUnavailableException('Cited evidence is unavailable.');
  return {
    sourceId: source.id,
    documentId: source.documentId,
    documentVersionId: source.documentVersionId,
    representationId: source.representationId,
    sourceSha256: source.sourceSha256,
    projectionSha256: source.projectionSha256,
    title: version.frozenTitle,
    language: source.language,
    versionStatus: version.status,
  };
}
function encodeCursor(
  value: { sourceId: string; position?: number } | undefined,
): string {
  if (!value) throw new Error('The source page is incomplete.');
  return Buffer.from(
    JSON.stringify({ sourceId: value.sourceId, position: value.position ?? 0 }),
  ).toString('base64url');
}
function decodeCursor(
  value: string | null,
  search: boolean,
): { sourceId: string; position: number } | null {
  if (value === null) return null;
  try {
    if (!/^[A-Za-z0-9_-]+$/u.test(value)) throw invalid();
    const parsed: unknown = JSON.parse(
      Buffer.from(value, 'base64url').toString('utf8'),
    );
    const cursor = object(parsed, ['sourceId', 'position']);
    if (
      typeof cursor.position !== 'number' ||
      !Number.isSafeInteger(cursor.position) ||
      cursor.position < 0 ||
      cursor.position > 20 ||
      (!search && cursor.position !== 0)
    )
      throw invalid();
    return {
      sourceId: requireUuid(cursor.sourceId),
      position: cursor.position,
    };
  } catch {
    throw invalid();
  }
}
