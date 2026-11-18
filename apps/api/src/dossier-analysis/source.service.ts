import { commandFingerprint } from '../command/idempotent-command.js';
import { runClientReferenceTransaction } from '../client/client-reference-transaction.js';
import { createHash, randomUUID } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  PayloadTooLargeException,
} from '@nestjs/common';
import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import type { HistoricalSource } from './history.js';
import {
  requireIdempotencyKey,
  requireUuid,
} from '../access/access-command-validation.js';
import type { ActorContext } from '../access/access.types.js';
import { DatabaseContext } from '../database/database-context.js';
import {
  dossierAnalysisEvents,
  dossierAnalysisSources,
} from '../database/schema/dossier-analysis.js';
import { parseDocxSource, parseSource } from './commands.js';
import { DocumentMalwareScanner } from '../documents/document-malware-scanner.js';
import { extractDocumentText } from '../document-text-extraction/index.js';
import { DossierSourceAccess } from './source-access.js';

type IntakeSourceTarget = Pick<
  Awaited<ReturnType<DossierSourceAccess['direct']>>['document'],
  'title' | 'purpose' | 'workingRevision' | 'projectRevision'
>;

/** Native PDF selection, with scoped transaction and replay receipt. */
@Injectable()
export class DossierSourceService {
  constructor(
    private readonly database: DatabaseContext,
    private readonly access: DossierSourceAccess,
    private readonly scanner: DocumentMalwareScanner,
  ) {}

  private write<T>(work: () => Promise<T>) {
    return runClientReferenceTransaction({ database: this.database, work });
  }

  /** direct() holds the native Document/Version locks until insertion commits. */
  private requireIntakeTarget(
    live: Awaited<ReturnType<DossierSourceAccess['direct']>>,
    expected: IntakeSourceTarget | null,
  ) {
    if (
      expected !== null &&
      (live.document.type !== 'project-source' ||
        live.document.title !== expected.title ||
        live.document.purpose !== expected.purpose ||
        live.document.workingRevision !== expected.workingRevision ||
        live.document.projectRevision !== expected.projectRevision ||
        live.version.status !== 'draft')
    )
      throw new ConflictException('The admitted source target changed.');
  }

  /** All selected sources must remain visible; never disclose a hidden count. */
  private async requireSelected(
    actor: ActorContext,
    projectId: string,
    companyId: string,
    write = true,
  ) {
    const query = this.database.connection
      .select()
      .from(dossierAnalysisSources)
      .where(
        and(
          eq(dossierAnalysisSources.workspaceId, actor.workspaceId),
          eq(dossierAnalysisSources.companyId, companyId),
          eq(dossierAnalysisSources.projectId, projectId),
          isNull(dossierAnalysisSources.removedAt),
        ),
      );
    const rows = write ? await query.for('update') : await query;
    const caseAttachments = rows.some((row) => row.caseId !== null)
      ? await this.access.caseAttachmentsWithinTransaction(
          actor,
          projectId,
          write,
        )
      : undefined;
    for (const row of rows) {
      const live = await this.access.direct(actor, {
        projectId,
        documentId: row.documentId,
        versionId: row.versionId,
        representationId: row.representationId,
        caseId: row.caseId,
        attachmentId: row.attachmentId,
        write,
        ...(caseAttachments === undefined ? {} : { caseAttachments }),
      });
      if (
        row.kind === 'docx' &&
        (!row.original ||
          row.original.length !== row.size ||
          createHash('sha256').update(row.original).digest('hex') !==
            row.sha256)
      )
        throw new NotFoundException();
      if (
        row.kind === 'pdf' &&
        (!live.pdf ||
          live.pdf.sha256 !== row.sha256 ||
          live.pdf.size !== row.size)
      )
        throw new NotFoundException();
    }
    return rows;
  }

  projectWithinTransaction(
    actor: ActorContext,
    projectId: string,
    write: boolean,
  ) {
    return this.access.project(actor, projectId, write);
  }

  /** Caller owns the transaction and keeps the authorization snapshot. */
  async captureWithinTransaction(
    actor: ActorContext,
    projectId: string,
    write: boolean,
  ) {
    const project = await this.access.project(actor, projectId, write);
    const query = this.database.connection
      .select()
      .from(dossierAnalysisSources)
      .where(
        and(
          eq(dossierAnalysisSources.workspaceId, actor.workspaceId),
          eq(dossierAnalysisSources.companyId, project.companyId),
          eq(dossierAnalysisSources.projectId, projectId),
          isNull(dossierAnalysisSources.removedAt),
        ),
      );
    const rows = write ? await query.for('update') : await query;
    const caseAttachments = rows.some((row) => row.caseId !== null)
      ? await this.access.caseAttachmentsWithinTransaction(
          actor,
          projectId,
          write,
        )
      : undefined;
    if (rows.reduce((sum, row) => sum + row.size, 0) > 20 * 1024 * 1024)
      throw new ConflictException(
        'Selected sources exceed the run size limit.',
      );
    const entries = [];
    for (const row of rows) {
      const live = await this.access.direct(actor, {
        projectId,
        documentId: row.documentId,
        versionId: row.versionId,
        representationId: row.representationId,
        caseId: row.caseId,
        attachmentId: row.attachmentId,
        write,
        ...(caseAttachments === undefined ? {} : { caseAttachments }),
      });
      const bytes = row.kind === 'pdf' ? live.pdf?.bytes : row.original;
      if (
        !bytes ||
        bytes.length !== row.size ||
        createHash('sha256').update(bytes).digest('hex') !== row.sha256
      )
        throw new NotFoundException();
      entries.push({ row, live, bytes });
    }
    return entries.sort((a, b) => a.row.id.localeCompare(b.row.id));
  }

  async authorizeHistoricalWithinTransaction(
    actor: ActorContext,
    projectId: string,
    sources: readonly HistoricalSource[],
    write: boolean,
  ) {
    const project = await this.access.project(actor, projectId, write);
    const rows = await this.database.connection
      .select()
      .from(dossierAnalysisSources)
      .where(
        and(
          eq(dossierAnalysisSources.workspaceId, actor.workspaceId),
          eq(dossierAnalysisSources.companyId, project.companyId),
          eq(dossierAnalysisSources.projectId, projectId),
          inArray(
            dossierAnalysisSources.id,
            sources.map((source) => source.id),
          ),
        ),
      );
    if (
      rows.length !== sources.length ||
      new Set(sources.map((source) => source.id)).size !== sources.length
    )
      throw new NotFoundException();
    const caseAttachments = rows.some((row) => row.caseId !== null)
      ? await this.access.caseAttachmentsWithinTransaction(
          actor,
          projectId,
          write,
        )
      : undefined;
    for (const source of sources) {
      const row = rows.find((item) => item.id === source.id);
      if (
        !row ||
        row.documentId !== source.documentId ||
        row.versionId !== source.documentVersionId ||
        row.representationId !== source.representationId ||
        row.sha256 !== source.sourceSha256
      )
        throw new NotFoundException();
      const live = await this.access.direct(actor, {
        projectId,
        documentId: row.documentId,
        versionId: row.versionId,
        representationId: row.representationId,
        caseId: row.caseId,
        attachmentId: row.attachmentId,
        write,
        ...(caseAttachments === undefined ? {} : { caseAttachments }),
      });
      const bytes = row.kind === 'pdf' ? live.pdf?.bytes : row.original;
      if (
        !bytes ||
        bytes.length !== row.size ||
        createHash('sha256').update(bytes).digest('hex') !== row.sha256
      )
        throw new NotFoundException();
    }
    return { project, rows };
  }

  addPdf(
    actor: ActorContext,
    projectIdValue: unknown,
    value: unknown,
    keyValue: string | undefined,
  ) {
    return this.selectPdf({
      actor,
      projectId: requireUuid(projectIdValue),
      command: parseSource(value),
      key: requireIdempotencyKey(keyValue),
      fingerprintValue: value,
      expectedTarget: null,
    });
  }

  /** Automatic intake selection must carry its server-admitted target. */
  addPdfForIntake(input: {
    actor: ActorContext;
    projectId: unknown;
    command: unknown;
    key: string | undefined;
    expectedTarget: IntakeSourceTarget;
  }) {
    return this.selectPdf({
      actor: input.actor,
      projectId: requireUuid(input.projectId),
      command: parseSource(input.command),
      key: requireIdempotencyKey(input.key),
      fingerprintValue: input.command,
      expectedTarget: input.expectedTarget,
    });
  }

  private async selectPdf(input: {
    actor: ActorContext;
    projectId: string;
    command: ReturnType<typeof parseSource>;
    key: string;
    fingerprintValue: unknown;
    expectedTarget: IntakeSourceTarget | null;
  }) {
    const { actor, projectId, command, key } = input;
    const fingerprint = commandFingerprint([
      'pdf',
      projectId,
      input.fingerprintValue,
    ]);
    return this.write(async () => {
      const live = await this.access.direct(actor, {
        projectId,
        documentId: command.documentId,
        versionId: command.documentVersionId,
        representationId: command.representationId,
        caseId: command.caseId,
        attachmentId: command.attachmentId,
        write: true,
      });
      if (!live.pdf) throw new NotFoundException();
      const lockKey = JSON.stringify([
        'dossier-analysis',
        actor.workspaceId,
        actor.workspaceMembershipId,
        key,
      ]);
      await this.database.connection.execute(
        sql`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`,
      );
      const [receipt] = await this.database.connection
        .select()
        .from(dossierAnalysisEvents)
        .where(
          and(
            eq(dossierAnalysisEvents.workspaceId, actor.workspaceId),
            eq(
              dossierAnalysisEvents.actorMembershipId,
              actor.workspaceMembershipId,
            ),
            eq(dossierAnalysisEvents.idempotencyKey, key),
          ),
        );
      if (receipt) {
        if (
          receipt.companyId !== live.project.companyId ||
          receipt.projectId !== projectId ||
          receipt.fingerprint !== fingerprint ||
          receipt.action !== 'source.added'
        )
          throw new ConflictException('Idempotency-Key was already used.');
        return { id: receipt.targetId };
      }
      this.requireIntakeTarget(live, input.expectedTarget);
      const current = await this.requireSelected(
        actor,
        projectId,
        live.project.companyId,
      );
      if (current.length >= 25)
        throw new ConflictException('The source limit has been reached.');
      if (
        current.reduce((sum, row) => sum + row.size, 0) + live.pdf.size >
        20 * 1024 * 1024
      )
        throw new ConflictException(
          'Selected sources exceed the run size limit.',
        );
      if (
        current.some(
          (row) =>
            row.documentId === command.documentId &&
            row.versionId === command.documentVersionId &&
            row.representationId === command.representationId,
        )
      )
        throw new ConflictException('This source is already selected.');
      const id = randomUUID();
      const now = new Date();
      await this.database.connection.insert(dossierAnalysisSources).values({
        id,
        workspaceId: actor.workspaceId,
        companyId: live.project.companyId,
        projectId,
        documentId: command.documentId,
        versionId: command.documentVersionId,
        representationId: command.representationId,
        caseId: command.caseId,
        attachmentId: command.attachmentId,
        kind: 'pdf',
        fileName: live.pdf.fileName,
        language: command.language,
        sha256: live.pdf.sha256,
        size: live.pdf.size,
        createdByMembershipId: actor.workspaceMembershipId,
        createdAt: now,
      });
      await this.database.connection.insert(dossierAnalysisEvents).values({
        id: randomUUID(),
        workspaceId: actor.workspaceId,
        companyId: live.project.companyId,
        projectId,
        actorMembershipId: actor.workspaceMembershipId,
        idempotencyKey: key,
        fingerprint,
        action: 'source.added',
        targetId: id,
        receipt: { id },
        recordedAt: now,
      });
      return { id };
    });
  }
  async addDocx(
    actor: ActorContext,
    projectIdValue: unknown,
    value: unknown,
    keyValue: string | undefined,
    request: IncomingMessage,
  ) {
    const projectId = requireUuid(projectIdValue);
    const command = parseDocxSource(value);
    const key = requireIdempotencyKey(keyValue);
    const target = {
      projectId,
      documentId: command.documentId,
      versionId: command.documentVersionId,
      representationId: null,
      caseId: command.caseId,
      attachmentId: command.attachmentId,
      write: true,
    };
    await this.write(() => this.access.direct(actor, target));
    if (
      request.headers['content-type'] !==
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    )
      throw new BadRequestException('Choose a DOCX file.');
    const declared = request.headers['content-length'];
    if (
      declared !== undefined &&
      (!/^\d+$/u.test(declared) || Number(declared) > 5242880)
    )
      throw new PayloadTooLargeException();
    const parts: Buffer[] = [];
    let size = 0;
    const timer = setTimeout(
      () => request.destroy(new Error('Upload expired.')),
      10000,
    );
    try {
      for await (const part of request) {
        const item: unknown = part;
        if (!Buffer.isBuffer(item))
          throw new BadRequestException('Invalid DOCX.');
        size += item.length;
        if (size > 5242880) throw new PayloadTooLargeException();
        parts.push(item);
      }
    } finally {
      clearTimeout(timer);
    }
    return this.preserveDocx({
      actor,
      projectId,
      command,
      key,
      bytes: Buffer.concat(parts),
      fingerprintValue: value,
      expectedTarget: null,
    });
  }

  /** Exact admitted originals; validation/scanning/receipts remain owned here. */
  addDocxBytes(input: {
    actor: ActorContext;
    projectId: unknown;
    command: unknown;
    key: string | undefined;
    bytes: Buffer;
    expectedTarget: IntakeSourceTarget;
  }) {
    return this.preserveDocx({
      actor: input.actor,
      projectId: requireUuid(input.projectId),
      command: parseDocxSource(input.command),
      key: requireIdempotencyKey(input.key),
      bytes: input.bytes,
      fingerprintValue: input.command,
      expectedTarget: input.expectedTarget,
    });
  }

  private async preserveDocx(input: {
    actor: ActorContext;
    projectId: string;
    command: ReturnType<typeof parseDocxSource>;
    key: string;
    bytes: Buffer;
    fingerprintValue: unknown;
    expectedTarget: IntakeSourceTarget | null;
  }) {
    const { actor, projectId, command, key, bytes } = input;
    const size = bytes.length;
    if (size > 5242880) throw new PayloadTooLargeException();
    const target = {
      projectId,
      documentId: command.documentId,
      versionId: command.documentVersionId,
      representationId: null,
      caseId: command.caseId,
      attachmentId: command.attachmentId,
      write: true,
    };
    await this.write(() => this.access.direct(actor, target));
    if (
      bytes.length < 4 ||
      !bytes.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]))
    )
      throw new BadRequestException('Invalid DOCX.');
    const scan = await this.scanner.scan(bytes);
    const extraction = await extractDocumentText({ bytes, kind: 'docx' });
    if (extraction.state === 'failed')
      throw new BadRequestException('The DOCX cannot be read.');
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    // Keep the existing HTTP receipt identity, including its original wire shape.
    const fingerprint = commandFingerprint([
      'docx',
      projectId,
      input.fingerprintValue,
      sha256,
    ]);
    return this.write(async () => {
      const live = await this.access.direct(actor, target);
      const lockKey = JSON.stringify([
        'dossier-analysis',
        actor.workspaceId,
        actor.workspaceMembershipId,
        key,
      ]);
      await this.database.connection.execute(
        sql`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`,
      );
      const [receipt] = await this.database.connection
        .select()
        .from(dossierAnalysisEvents)
        .where(
          and(
            eq(dossierAnalysisEvents.workspaceId, actor.workspaceId),
            eq(
              dossierAnalysisEvents.actorMembershipId,
              actor.workspaceMembershipId,
            ),
            eq(dossierAnalysisEvents.idempotencyKey, key),
          ),
        );
      if (receipt) {
        if (
          receipt.companyId !== live.project.companyId ||
          receipt.projectId !== projectId ||
          receipt.fingerprint !== fingerprint ||
          receipt.action !== 'source.added'
        )
          throw new ConflictException('Idempotency-Key was already used.');
        return { id: receipt.targetId };
      }
      this.requireIntakeTarget(live, input.expectedTarget);
      const current = await this.requireSelected(
        actor,
        projectId,
        live.project.companyId,
      );
      if (current.length >= 25)
        throw new ConflictException('The source limit has been reached.');
      if (
        current.reduce((sum, row) => sum + row.size, 0) + size >
        20 * 1024 * 1024
      )
        throw new ConflictException(
          'Selected sources exceed the run size limit.',
        );
      if (
        current.some(
          (row) =>
            row.documentId === command.documentId &&
            row.versionId === command.documentVersionId &&
            row.kind === 'docx' &&
            row.sha256 === sha256,
        )
      )
        throw new ConflictException('This source is already selected.');
      const id = randomUUID();
      const now = new Date();
      await this.database.connection.insert(dossierAnalysisSources).values({
        id,
        workspaceId: actor.workspaceId,
        companyId: live.project.companyId,
        projectId,
        documentId: command.documentId,
        versionId: command.documentVersionId,
        caseId: command.caseId,
        attachmentId: command.attachmentId,
        kind: 'docx',
        fileName: command.fileName,
        language: command.language,
        sha256,
        size,
        original: bytes,
        scanEngine: scan.engine,
        scannedAt: scan.scannedAt,
        createdByMembershipId: actor.workspaceMembershipId,
        createdAt: now,
      });
      await this.database.connection.insert(dossierAnalysisEvents).values({
        id: randomUUID(),
        workspaceId: actor.workspaceId,
        companyId: live.project.companyId,
        projectId,
        actorMembershipId: actor.workspaceMembershipId,
        idempotencyKey: key,
        fingerprint,
        action: 'source.added',
        targetId: id,
        receipt: { id },
        recordedAt: now,
      });
      return { id };
    });
  }
  async remove(
    actor: ActorContext,
    projectIdValue: unknown,
    sourceIdValue: unknown,
    keyValue: string | undefined,
  ) {
    const projectId = requireUuid(projectIdValue);
    const sourceId = requireUuid(sourceIdValue);
    const key = requireIdempotencyKey(keyValue);
    const fingerprint = commandFingerprint(['remove', projectId, sourceId]);
    return this.write(async () => {
      const project = await this.access.project(actor, projectId, true);
      const [source] = await this.database.connection
        .select()
        .from(dossierAnalysisSources)
        .where(
          and(
            eq(dossierAnalysisSources.workspaceId, actor.workspaceId),
            eq(dossierAnalysisSources.companyId, project.companyId),
            eq(dossierAnalysisSources.projectId, projectId),
            eq(dossierAnalysisSources.id, sourceId),
          ),
        )
        .for('update');
      if (!source) throw new NotFoundException();
      await this.access.direct(actor, {
        projectId,
        documentId: source.documentId,
        versionId: source.versionId,
        representationId: source.representationId,
        caseId: source.caseId,
        attachmentId: source.attachmentId,
        write: true,
      });
      const lockKey = JSON.stringify([
        'dossier-analysis',
        actor.workspaceId,
        actor.workspaceMembershipId,
        key,
      ]);
      await this.database.connection.execute(
        sql`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`,
      );
      const [receipt] = await this.database.connection
        .select()
        .from(dossierAnalysisEvents)
        .where(
          and(
            eq(dossierAnalysisEvents.workspaceId, actor.workspaceId),
            eq(
              dossierAnalysisEvents.actorMembershipId,
              actor.workspaceMembershipId,
            ),
            eq(dossierAnalysisEvents.idempotencyKey, key),
          ),
        );
      if (receipt) {
        if (
          receipt.companyId !== project.companyId ||
          receipt.projectId !== projectId ||
          receipt.fingerprint !== fingerprint ||
          receipt.action !== 'source.removed'
        )
          throw new ConflictException('Idempotency-Key was already used.');
        return { id: sourceId };
      }
      if (source.removedAt) throw new NotFoundException();
      await this.requireSelected(actor, projectId, project.companyId);
      const now = new Date();
      await this.database.connection
        .update(dossierAnalysisSources)
        .set({ removedAt: now })
        .where(
          and(
            eq(dossierAnalysisSources.workspaceId, actor.workspaceId),
            eq(dossierAnalysisSources.companyId, project.companyId),
            eq(dossierAnalysisSources.projectId, projectId),
            eq(dossierAnalysisSources.id, sourceId),
          ),
        );
      await this.database.connection.insert(dossierAnalysisEvents).values({
        id: randomUUID(),
        workspaceId: actor.workspaceId,
        companyId: project.companyId,
        projectId,
        actorMembershipId: actor.workspaceMembershipId,
        idempotencyKey: key,
        fingerprint,
        action: 'source.removed',
        targetId: sourceId,
        receipt: { id: sourceId },
        recordedAt: now,
      });
      return { id: sourceId };
    });
  }
  async original(
    actor: ActorContext,
    projectIdValue: unknown,
    sourceIdValue: unknown,
  ) {
    const projectId = requireUuid(projectIdValue);
    const sourceId = requireUuid(sourceIdValue);
    return this.database.transaction(
      async () => {
        const project = await this.access.project(actor, projectId, false);
        const [source] = await this.database.connection
          .select()
          .from(dossierAnalysisSources)
          .where(
            and(
              eq(dossierAnalysisSources.workspaceId, actor.workspaceId),
              eq(dossierAnalysisSources.companyId, project.companyId),
              eq(dossierAnalysisSources.projectId, projectId),
              eq(dossierAnalysisSources.id, sourceId),
            ),
          );
        if (!source) throw new NotFoundException();
        const live = await this.access.direct(actor, {
          projectId,
          documentId: source.documentId,
          versionId: source.versionId,
          representationId: source.representationId,
          caseId: source.caseId,
          attachmentId: source.attachmentId,
          write: false,
        });
        const bytes = source.kind === 'pdf' ? live.pdf?.bytes : source.original;
        if (
          !bytes ||
          bytes.length !== source.size ||
          createHash('sha256').update(bytes).digest('hex') !== source.sha256
        )
          throw new NotFoundException();
        return { bytes, fileName: source.fileName, kind: source.kind };
      },
      { isolationLevel: 'repeatable read', accessMode: 'read only' },
    );
  }
}
