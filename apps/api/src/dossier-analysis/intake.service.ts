import { createHash } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import {
  BadRequestException,
  ConflictException,
  HttpException,
  Injectable,
  PayloadTooLargeException,
} from '@nestjs/common';
import type { ActorContext } from '../access/access.types.js';
import { requireUuid } from '../access/access-command-validation.js';
import { DocumentContentService } from '../documents/document-content.service.js';
import { DocumentProjectsService } from '../documents/document-projects.service.js';
import { DocumentsService } from '../documents/documents.service.js';
import {
  INTAKE_LIMITS,
  intakeRevision,
  intakeUploadRevision,
  type IntakeFile,
  type IntakeProgress,
} from './intake-contract.js';
import { DossierIntakeStore } from './intake-store.service.js';
import { DossierSourceService } from './source.service.js';

type Location = {
  actor: ActorContext;
  projectId: string;
  batchId: string;
  itemId: string;
};

/** One foreground step per request. Native commands commit independently and replay their frozen keys. */
@Injectable()
export class DossierIntakeService {
  constructor(
    private readonly store: DossierIntakeStore,
    private readonly documents: DocumentsService,
    private readonly associations: DocumentProjectsService,
    private readonly content: DocumentContentService,
    private readonly sources: DossierSourceService,
  ) {}

  private location(input: Location): Location {
    return {
      actor: input.actor,
      projectId: requireUuid(input.projectId),
      batchId: requireUuid(input.batchId),
      itemId: requireUuid(input.itemId),
    };
  }

  private async failure(location: Location, attemptId: string, error: unknown) {
    const status = error instanceof HttpException ? error.getStatus() : 503;
    const code =
      status === 400
        ? 'invalid_file'
        : status === 413
          ? 'size_limit'
          : status === 409
            ? 'stale_target'
            : 'unavailable';
    try {
      await this.store.failed({ ...location, attemptId, code });
    } catch {
      // A lost grant/connection can prevent the checkpoint too. The prior pending
      // intent and immutable native command keys remain the recovery authority.
    }
  }

  async advance(input: Location & { command: unknown }) {
    const location = this.location(input);
    const begun = await this.store.beginAttempt({
      ...location,
      expectedRevision: intakeRevision(input.command),
      operation: 'advance',
    });
    if (begun.outcome === 'settled') return begun.value;
    const { item, attemptId } = begun;
    try {
      const current = item.progress;
      let progress: IntakeProgress;
      switch (current.stage) {
        case 'queued': {
          const document = await this.documents.register(
            input.actor,
            {
              type: 'project-source',
              clientId: begun.clientId,
              title: item.file.title,
              purpose: item.file.purpose,
            },
            item.keys.register,
          );
          if (document.type !== 'project-source')
            throw new ConflictException('The native Document changed.');
          progress = {
            stage: 'registered',
            target: { documentId: document.id, versionId: document.version.id },
          };
          break;
        }
        case 'registered':
          await this.associations.mutate(
            input.actor,
            current.target.documentId,
            { action: 'link', projectId: begun.projectId, expectedRevision: 0 },
            item.keys.link,
          );
          progress = { ...current, stage: 'linked' };
          break;
        case 'pdf_stored': {
          const source = await this.sources.addPdf(
            input.actor,
            begun.projectId,
            {
              documentId: current.target.documentId,
              documentVersionId: current.target.versionId,
              representationId: current.representationId,
              language: item.file.language,
            },
            item.keys.select,
          );
          progress = {
            ...current,
            stage: 'source_stored',
            sourceId: source.id,
          };
          break;
        }
        case 'source_stored':
          progress = { ...current, stage: 'complete' };
          break;
        default:
          throw new ConflictException(
            'This file needs a different next action.',
          );
      }
      return await this.store.acknowledge({ ...location, attemptId, progress });
    } catch (error) {
      await this.failure(location, attemptId, error);
      throw error;
    }
  }

  async upload(input: Location & { query: unknown; request: IncomingMessage }) {
    const location = this.location(input);
    const begun = await this.store.beginAttempt({
      ...location,
      expectedRevision: intakeUploadRevision(input.query),
      operation: 'upload',
    });
    if (begun.outcome === 'settled') return begun.value;
    const { item, attemptId } = begun;
    try {
      if (item.progress.stage !== 'linked')
        throw new ConflictException('The file is not ready for upload.');
      const bytes = await readOriginal(input.request, item.file);
      await this.store.continueUpload({ ...location, attemptId });
      let progress: IntakeProgress;
      if (item.file.kind === 'pdf') {
        const receipt = await this.content.uploadBytes(input.actor, {
          ...item.progress.target,
          expectedRevision: 1,
          fileName: item.file.fileName,
          key: item.keys.upload,
          bytes,
        });
        if (receipt.action !== 'representation_added')
          throw new ConflictException('The native upload receipt changed.');
        progress = {
          stage: 'pdf_stored',
          target: item.progress.target,
          representationId: receipt.representationId,
        };
      } else {
        const source = await this.sources.addDocxBytes({
          actor: input.actor,
          projectId: begun.projectId,
          command: {
            documentId: item.progress.target.documentId,
            documentVersionId: item.progress.target.versionId,
            fileName: item.file.fileName,
            language: item.file.language,
          },
          key: item.keys.upload,
          bytes,
        });
        progress = {
          stage: 'source_stored',
          target: item.progress.target,
          sourceId: source.id,
          representationId: null,
        };
      }
      return await this.store.acknowledge({ ...location, attemptId, progress });
    } catch (error) {
      await this.failure(location, attemptId, error);
      throw error;
    }
  }
}

async function readOriginal(request: IncomingMessage, file: IntakeFile) {
  const mime =
    file.kind === 'pdf'
      ? 'application/pdf'
      : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  if (request.headers['content-type'] !== mime)
    throw new BadRequestException('Choose the admitted original.');
  const declared = request.headers['content-length'];
  if (
    declared !== undefined &&
    (!/^\d+$/u.test(declared) || Number(declared) > INTAKE_LIMITS.fileBytes)
  )
    throw new PayloadTooLargeException();
  const parts: Buffer[] = [];
  let size = 0;
  const timer = setTimeout(
    () => request.destroy(new Error('Upload expired.')),
    10_000,
  );
  try {
    for await (const chunk of request) {
      const part: unknown = chunk;
      if (!Buffer.isBuffer(part))
        throw new BadRequestException('Invalid original.');
      size += part.length;
      if (size > INTAKE_LIMITS.fileBytes) throw new PayloadTooLargeException();
      parts.push(part);
    }
  } finally {
    clearTimeout(timer);
  }
  const bytes = Buffer.concat(parts);
  if (
    size !== file.size ||
    createHash('sha256').update(bytes).digest('hex') !== file.sha256
  )
    throw new BadRequestException(
      'The original bytes do not match this batch. Reselect the admitted file.',
    );
  return bytes;
}
