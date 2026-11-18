import { randomUUID } from 'node:crypto';
import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, desc, eq, lt, or, sql } from 'drizzle-orm';
import type { ActorContext } from '../access/access.types.js';
import {
  requireIdempotencyKey,
  requireUuid,
} from '../access/access-command-validation.js';
import { CompanyContextAuthorization } from '../access/company-context-authorization.js';
import { commandFingerprint } from '../command/idempotent-command.js';
import { runClientReferenceTransaction } from '../client/client-reference-transaction.js';
import { DatabaseContext } from '../database/database-context.js';
import { dossierIntakeBatches } from '../database/schema/dossier-analysis.js';
import { DossierSourceService } from './source.service.js';
import { DocumentReadBoundary } from '../documents/document-read-boundary.js';
import { DocumentVersionsService } from '../documents/document-versions.service.js';
import { DocumentProjectsService } from '../documents/document-projects.service.js';
import {
  intakeAdmission,
  intakeBefore,
  intakeManifest,
  intakePhaseCommand,
  intakeRevision,
  type IntakeItem,
  type IntakeManifest,
  type IntakeProgress,
} from './intake-contract.js';

type Batch = typeof dossierIntakeBatches.$inferSelect;

/** Foreground checkpoints; native modules remain the owners of every original. */
@Injectable()
export class DossierIntakeStore {
  constructor(
    private readonly database: DatabaseContext,
    private readonly authorization: CompanyContextAuthorization,
    private readonly sources: DossierSourceService,
    private readonly documentBoundary: DocumentReadBoundary,
    private readonly versions: DocumentVersionsService,
    private readonly associations: DocumentProjectsService,
  ) {}

  private write<T>(work: () => Promise<T>) {
    return runClientReferenceTransaction({ database: this.database, work });
  }

  private async authority(
    actor: ActorContext,
    projectId: string,
    write: boolean,
  ) {
    const project = await this.sources.projectWithinTransaction(
      actor,
      projectId,
      write,
    );
    if (write)
      await this.authorization.requirePermissions(actor, {
        permissions: ['document.register'],
        prerequisites: [{ permissions: ['document.project.manage'] }],
        lock: true,
      });
    return project;
  }

  private condition(actor: ActorContext, projectId: string, companyId: string) {
    return and(
      eq(dossierIntakeBatches.workspaceId, actor.workspaceId),
      eq(dossierIntakeBatches.companyId, companyId),
      eq(dossierIntakeBatches.projectId, projectId),
      eq(dossierIntakeBatches.actorMembershipId, actor.workspaceMembershipId),
    );
  }

  private async current(
    actor: ActorContext,
    projectId: string,
    batchId: string,
    write: boolean,
  ) {
    const project = await this.authority(actor, projectId, write);
    const query = this.database.connection
      .select()
      .from(dossierIntakeBatches)
      .where(
        and(
          this.condition(actor, projectId, project.companyId),
          eq(dossierIntakeBatches.id, batchId),
        ),
      );
    const [row] = write ? await query.for('update') : await query;
    if (!row || row.clientId !== project.clientAccountId)
      throw new NotFoundException();
    return { row, project, manifest: intakeManifest(row.manifest) };
  }

  private view(row: Batch) {
    return {
      format: 'DOCUMENT_INTAKE_VIEW/1',
      id: row.id,
      companyId: row.companyId,
      projectId: row.projectId,
      clientId: row.clientId,
      revision: row.revision,
      phase: row.phase,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      items: intakeManifest(row.manifest).items,
    };
  }

  private item(manifest: IntakeManifest, itemId: string) {
    const item = manifest.items.find((item) => item.id === itemId);
    if (!item) throw new NotFoundException();
    return item;
  }

  private async save(row: Batch, manifest: IntakeManifest, phase = row.phase) {
    const checked = intakeManifest(manifest);
    const terminal = checked.items.every(
      (item) =>
        item.kind === 'invalid' ||
        item.progress.stage === 'complete' ||
        item.progress.stage === 'skipped',
    );
    const [changed] = await this.database.connection
      .update(dossierIntakeBatches)
      .set({
        manifest: checked,
        phase: terminal ? 'completed' : phase,
        revision: row.revision + 1,
        updatedAt: new Date(),
      })
      .where(eq(dossierIntakeBatches.id, row.id))
      .returning();
    if (!changed) throw new Error('The intake progress was not stored.');
    return this.view(changed);
  }

  private async targetWithinTransaction(
    actor: ActorContext,
    context: Awaited<ReturnType<DossierIntakeStore['current']>>,
    item: Extract<IntakeItem, { kind: 'file' }>,
    exactRevision: boolean,
  ) {
    const p = item.progress;
    if (!('target' in p)) return;
    const { document } = await this.documentBoundary.requireVisible(
      actor,
      p.target.documentId,
      { lockFamily: true, lockDocument: true },
    );
    if (
      document.type !== 'project-source' ||
      document.clientId !== context.row.clientId
    )
      throw new NotFoundException();
    if (
      document.title !== item.file.title ||
      document.purpose !== item.file.purpose
    )
      throw new ConflictException('The Document metadata changed.');
    const scope = {
      workspaceId: actor.workspaceId,
      companyId: context.row.companyId,
      documentId: document.id,
    };
    const version = await this.versions.workingVersion(scope, document.type);
    if (version.id !== p.target.versionId || version.status !== 'draft')
      throw new ConflictException('The Document Version changed.');
    if (p.stage !== 'registered')
      await this.associations.requireSelectedAssociationWithinReadTransaction({
        document,
        project: context.project,
        expectedRevision: 1,
      });
    const expected =
      item.file.kind === 'pdf' &&
      (p.stage === 'pdf_stored' ||
        p.stage === 'source_stored' ||
        p.stage === 'complete')
        ? 2
        : 1;
    if (exactRevision && document.workingRevision !== expected)
      throw new ConflictException('The Document changed.');
  }

  beginAttempt(input: {
    actor: ActorContext;
    projectId: string;
    batchId: string;
    itemId: string;
    expectedRevision: number;
    operation: 'advance' | 'upload';
  }) {
    return this.write(async () => {
      const context = await this.current(
        input.actor,
        requireUuid(input.projectId),
        requireUuid(input.batchId),
        true,
      );
      const item = this.item(context.manifest, requireUuid(input.itemId));
      if (
        item.kind !== 'file' ||
        item.progress.stage === 'complete' ||
        item.progress.stage === 'skipped'
      )
        return { outcome: 'settled' as const, value: this.view(context.row) };
      if (
        context.row.revision !== input.expectedRevision ||
        context.row.phase !== 'active'
      )
        throw new ConflictException('Read the current batch and resume it.');
      if (item.attempts >= 100)
        throw new ConflictException('The retry limit was reached.');
      const stage = item.progress.stage;
      if (
        (input.operation === 'upload' && stage !== 'linked') ||
        (input.operation === 'advance' &&
          !['queued', 'registered', 'pdf_stored', 'source_stored'].includes(
            stage,
          ))
      )
        throw new ConflictException('This file needs a different next action.');
      const attemptId = randomUUID();
      try {
        await this.targetWithinTransaction(
          input.actor,
          context,
          item,
          !(input.operation === 'upload' && item.file.kind === 'pdf'),
        );
      } catch (error) {
        if (!(error instanceof ConflictException)) throw error;
        const refused: typeof item = {
          ...item,
          attempts: item.attempts + 1,
          failureCount: Math.min(100, item.failureCount + 1),
          lastAttempt: {
            outcome: 'failed',
            id: attemptId,
            at: new Date().toISOString(),
            code: 'stale_target',
          },
        };
        await this.save(context.row, {
          ...context.manifest,
          items: context.manifest.items.map((i) =>
            i.id === item.id ? refused : i,
          ),
        });
        // Return the refusal so this checkpoint commits before the HTTP409.
        return { outcome: 'refused' } satisfies { outcome: 'refused' };
      }
      const next = {
        ...item,
        attempts: item.attempts + 1,
        lastAttempt: {
          outcome: 'pending' as const,
          id: attemptId,
          at: new Date().toISOString(),
        },
      };
      await this.save(context.row, {
        ...context.manifest,
        items: context.manifest.items.map((i) => (i.id === item.id ? next : i)),
      });
      return {
        outcome: 'ready' as const,
        attemptId,
        item: next,
        clientId: context.row.clientId,
        projectId: context.row.projectId,
        batchId: context.row.id,
      };
    });
  }

  acknowledge(input: {
    actor: ActorContext;
    projectId: string;
    batchId: string;
    itemId: string;
    attemptId: string;
    progress: IntakeProgress;
  }) {
    return this.write(async () => {
      const context = await this.current(
        input.actor,
        input.projectId,
        input.batchId,
        true,
      );
      const item = this.item(context.manifest, input.itemId);
      if (
        item.kind !== 'file' ||
        item.lastAttempt.outcome === 'none' ||
        item.lastAttempt.id !== input.attemptId
      )
        return this.view(context.row);
      const next = {
        ...item,
        progress: input.progress,
        lastAttempt: {
          outcome: 'complete' as const,
          id: input.attemptId,
          at: new Date().toISOString(),
        },
      };
      if (
        input.progress.stage === 'linked' ||
        input.progress.stage === 'complete'
      )
        await this.targetWithinTransaction(input.actor, context, next, true);
      if (input.progress.stage === 'complete') {
        const selected = await this.sources.captureWithinTransaction(
          input.actor,
          input.projectId,
          true,
        );
        const progress = input.progress;
        const source = selected.find(
          ({ row }) => row.id === progress.sourceId,
        )?.row;
        if (
          !source ||
          source.documentId !== progress.target.documentId ||
          source.versionId !== progress.target.versionId ||
          source.representationId !== progress.representationId ||
          source.sha256 !== item.file.sha256 ||
          source.size !== item.file.size ||
          source.fileName !== item.file.fileName ||
          source.language !== item.file.language ||
          source.kind !== item.file.kind
        )
          throw new ConflictException('The preserved source changed.');
      }
      return this.save(context.row, {
        ...context.manifest,
        items: context.manifest.items.map((i) => (i.id === item.id ? next : i)),
      });
    });
  }

  continueUpload(input: {
    actor: ActorContext;
    projectId: string;
    batchId: string;
    itemId: string;
    attemptId: string;
  }) {
    return this.write(async () => {
      const context = await this.current(
        input.actor,
        input.projectId,
        input.batchId,
        true,
      );
      const item = this.item(context.manifest, input.itemId);
      if (
        context.row.phase !== 'active' ||
        item.kind !== 'file' ||
        item.lastAttempt.outcome !== 'pending' ||
        item.lastAttempt.id !== input.attemptId ||
        item.progress.stage !== 'linked'
      )
        throw new ConflictException(
          'The upload was paused or replaced. Read the current batch.',
        );
      await this.targetWithinTransaction(
        input.actor,
        context,
        item,
        item.file.kind !== 'pdf',
      );
    });
  }

  failed(input: {
    actor: ActorContext;
    projectId: string;
    batchId: string;
    itemId: string;
    attemptId: string;
    code: 'invalid_file' | 'size_limit' | 'stale_target' | 'unavailable';
  }) {
    return this.write(async () => {
      const context = await this.current(
          input.actor,
          input.projectId,
          input.batchId,
          true,
        ),
        item = this.item(context.manifest, input.itemId);
      if (
        item.kind !== 'file' ||
        item.lastAttempt.outcome === 'none' ||
        item.lastAttempt.id !== input.attemptId
      )
        return;
      const next = {
        ...item,
        failureCount: Math.min(100, item.failureCount + 1),
        lastAttempt: {
          outcome: 'failed' as const,
          id: input.attemptId,
          at: new Date().toISOString(),
          code: input.code,
        },
      };
      await this.save(context.row, {
        ...context.manifest,
        items: context.manifest.items.map((i) => (i.id === item.id ? next : i)),
      });
    });
  }

  skip(input: {
    actor: ActorContext;
    projectId: string;
    batchId: string;
    itemId: string;
    command: unknown;
  }) {
    const expectedRevision = intakeRevision(input.command);
    return this.write(async () => {
      const context = await this.current(
          input.actor,
          requireUuid(input.projectId),
          requireUuid(input.batchId),
          true,
        ),
        item = this.item(context.manifest, requireUuid(input.itemId));
      if (context.row.revision !== expectedRevision)
        throw new ConflictException('Read the current batch.');
      if (
        item.kind !== 'file' ||
        item.progress.stage === 'complete' ||
        item.progress.stage === 'skipped'
      )
        return this.view(context.row);
      const p = item.progress;
      let progress: IntakeProgress;
      if (p.stage === 'duplicate')
        progress = {
          stage: 'skipped',
          reason: 'duplicate',
          duplicateOf: p.duplicateOf,
          retained: null,
        };
      else if (item.lastAttempt.outcome === 'failed')
        progress = {
          stage: 'skipped',
          reason: 'failed',
          duplicateOf: null,
          retained: p,
        };
      else
        throw new ConflictException(
          'Only a duplicate or failed file can be skipped.',
        );
      return this.save(context.row, {
        ...context.manifest,
        items: context.manifest.items.map((i) =>
          i.id === item.id ? { ...item, progress } : i,
        ),
      });
    });
  }

  async create(
    actor: ActorContext,
    projectIdValue: unknown,
    value: unknown,
    keyValue: string | undefined,
  ) {
    const projectId = requireUuid(projectIdValue),
      key = requireIdempotencyKey(keyValue),
      command = intakeAdmission(value);
    const fingerprint = commandFingerprint([
      'document-intake',
      projectId,
      command,
    ]);
    return this.write(async () => {
      const project = await this.authority(actor, projectId, true);
      if (project.clientAccountId !== command.expectedClientId)
        throw new ConflictException(
          'The Project Client changed. Review the batch again.',
        );
      await this.database.connection.execute(
        sql`SELECT pg_advisory_xact_lock(hashtextextended(${JSON.stringify(['document-intake', actor.workspaceId, actor.workspaceMembershipId, key])}, 0))`,
      );
      const [old] = await this.database.connection
        .select()
        .from(dossierIntakeBatches)
        .where(
          and(
            eq(dossierIntakeBatches.workspaceId, actor.workspaceId),
            eq(
              dossierIntakeBatches.actorMembershipId,
              actor.workspaceMembershipId,
            ),
            eq(dossierIntakeBatches.idempotencyKey, key),
          ),
        );
      if (old) {
        if (
          old.companyId !== project.companyId ||
          old.projectId !== projectId ||
          old.fingerprint !== fingerprint
        )
          throw new ConflictException('Idempotency-Key was already used.');
        return this.view(old);
      }
      const selected = await this.sources.captureWithinTransaction(
        actor,
        projectId,
        true,
      );
      const items: IntakeItem[] = [];
      for (const file of command.items) {
        const id = randomUUID();
        if (file.kind === 'invalid') {
          items.push({ kind: 'invalid', id, file });
          continue;
        }
        const previous = items.find(
          (item) => item.kind === 'file' && item.file.sha256 === file.sha256,
        );
        const source = selected.find(
          ({ row }) => row.sha256 === file.sha256,
        )?.row;
        const [earlier] =
          previous || source
            ? []
            : await this.database.connection
                .select()
                .from(dossierIntakeBatches)
                .where(
                  and(
                    this.condition(actor, projectId, project.companyId),
                    sql`${dossierIntakeBatches.manifest} @> ${JSON.stringify({ items: [{ kind: 'file', file: { sha256: file.sha256 } }] })}::jsonb`,
                  ),
                )
                .orderBy(
                  asc(dossierIntakeBatches.createdAt),
                  asc(dossierIntakeBatches.id),
                )
                .limit(1);
        const earlierItem = earlier
          ? intakeManifest(earlier.manifest).items.find(
              (item) =>
                item.kind === 'file' && item.file.sha256 === file.sha256,
            )
          : undefined;
        if (earlier && !earlierItem)
          throw new Error('The earlier original identity is unavailable.');
        items.push({
          kind: 'file',
          id,
          file,
          keys: {
            register: randomUUID(),
            link: randomUUID(),
            upload: randomUUID(),
            select: randomUUID(),
          },
          progress: previous
            ? {
                stage: 'duplicate',
                duplicateOf: { kind: 'item', id: previous.id },
              }
            : source
              ? {
                  stage: 'duplicate',
                  duplicateOf: { kind: 'source', id: source.id },
                }
              : earlier && earlierItem
                ? {
                    stage: 'duplicate',
                    duplicateOf: {
                      kind: 'batch',
                      id: earlier.id,
                      itemId: earlierItem.id,
                    },
                  }
                : { stage: 'queued' },
          attempts: 0,
          failureCount: 0,
          lastAttempt: { outcome: 'none' },
        });
      }
      const now = new Date(),
        manifest: IntakeManifest = { format: 'DOCUMENT_INTAKE_STATE/1', items };
      const [created] = await this.database.connection
        .insert(dossierIntakeBatches)
        .values({
          id: randomUUID(),
          workspaceId: actor.workspaceId,
          companyId: project.companyId,
          projectId,
          clientId: project.clientAccountId,
          actorMembershipId: actor.workspaceMembershipId,
          idempotencyKey: key,
          fingerprint,
          revision: 1,
          phase: items.every((item) => item.kind === 'invalid')
            ? 'completed'
            : 'paused',
          manifest,
          createdAt: now,
          updatedAt: now,
        })
        .returning();
      if (!created) throw new Error('The intake batch was not created.');
      return this.view(created);
    });
  }

  detail(actor: ActorContext, projectIdValue: unknown, batchIdValue: unknown) {
    const projectId = requireUuid(projectIdValue),
      batchId = requireUuid(batchIdValue);
    return this.database.transaction(
      async () =>
        this.view((await this.current(actor, projectId, batchId, false)).row),
      { isolationLevel: 'repeatable read', accessMode: 'read only' },
    );
  }

  list(actor: ActorContext, projectIdValue: unknown, query: unknown) {
    const projectId = requireUuid(projectIdValue),
      before = intakeBefore(query) ?? null;
    return this.database.transaction(
      async () => {
        const project = await this.authority(actor, projectId, false);
        const anchor =
          before === null
            ? null
            : (await this.current(actor, projectId, before, false)).row;
        const rows = await this.database.connection
          .select()
          .from(dossierIntakeBatches)
          .where(
            and(
              this.condition(actor, projectId, project.companyId),
              anchor
                ? or(
                    lt(dossierIntakeBatches.createdAt, anchor.createdAt),
                    and(
                      eq(dossierIntakeBatches.createdAt, anchor.createdAt),
                      lt(dossierIntakeBatches.id, anchor.id),
                    ),
                  )
                : undefined,
            ),
          )
          .orderBy(
            desc(dossierIntakeBatches.createdAt),
            desc(dossierIntakeBatches.id),
          )
          .limit(6);
        const visible = rows.slice(0, 5);
        return {
          items: visible.map((row) => this.view(row)),
          nextBefore: rows.length > 5 ? (visible.at(-1)?.id ?? null) : null,
        };
      },
      { isolationLevel: 'repeatable read', accessMode: 'read only' },
    );
  }

  phase(
    actor: ActorContext,
    projectIdValue: unknown,
    batchIdValue: unknown,
    value: unknown,
  ) {
    const projectId = requireUuid(projectIdValue),
      batchId = requireUuid(batchIdValue),
      command = intakePhaseCommand(value);
    return this.write(async () => {
      const { row } = await this.current(actor, projectId, batchId, true);
      if (
        row.revision !== command.expectedRevision ||
        row.phase === 'completed'
      )
        throw new ConflictException(
          'The intake changed. Read its current progress.',
        );
      const phase =
        command.action === 'start'
          ? 'active'
          : command.action === 'pause'
            ? 'paused'
            : 'stopped';
      if (phase === row.phase) return this.view(row);
      const [changed] = await this.database.connection
        .update(dossierIntakeBatches)
        .set({ phase, revision: row.revision + 1, updatedAt: new Date() })
        .where(eq(dossierIntakeBatches.id, row.id))
        .returning();
      if (!changed) throw new Error('The intake state was not changed.');
      return this.view(changed);
    });
  }
}
