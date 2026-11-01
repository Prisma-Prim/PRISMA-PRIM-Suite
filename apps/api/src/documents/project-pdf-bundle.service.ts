import { DocumentProjectsService } from './document-projects.service.js';
import { ClientOperationalReferenceService } from '../client/client-operational-reference.service.js';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
  PayloadTooLargeException,
} from '@nestjs/common';
import { zipSync, strToU8 } from 'fflate';
import type { ActorContext } from '../access/access.types.js';
import { requireUuid } from '../access/access-command-validation.js';
import { DatabaseContext } from '../database/database-context.js';
import { ProjectService } from '../project/project.service.js';
import { DocumentReadBoundary } from './document-read-boundary.js';
import { DocumentContentService } from './document-content.service.js';
import { DocumentVersionsService } from './document-versions.service.js';

const MAXIMUM_PDF_BYTES = 20 * 1024 * 1024;
const MAXIMUM_ZIP_BYTES = 21 * 1024 * 1024;

/** One bounded, read-only snapshot of existing exact originals and their native authorities. */
@Injectable()
export class ProjectPdfBundleService {
  constructor(
    private readonly database: DatabaseContext,
    private readonly projects: ProjectService,
    private readonly associations: DocumentProjectsService,
    private readonly clients: ClientOperationalReferenceService,
    private readonly boundary: DocumentReadBoundary,
    private readonly content: DocumentContentService,
    private readonly versions: DocumentVersionsService,
  ) {}

  async prepare(actor: ActorContext, projectIdValue: unknown, value: unknown) {
    const projectId = requireUuid(projectIdValue);
    const items = selection(value);
    return this.database.transaction(
      async () => {
        await this.clients.requireReferenceReadAuthorityWithinReadTransaction(
          actor,
        );
        const project = await this.projects.read(actor, projectId);
        const entries = [];
        const files: Record<string, Uint8Array> = {};
        let size = 0;
        for (const [position, item] of items.entries()) {
          const { document } = await this.boundary.requireVisible(
            actor,
            item.documentId,
          );
          if (document.type === 'external-invoice')
            throw new NotFoundException();
          await this.associations.requireSelectedAssociationWithinReadTransaction(
            {
              document,
              project,
              expectedRevision: item.expectedProjectRevision,
            },
          );
          const version = await this.versions.readExactWithinTransaction(
            {
              workspaceId: actor.workspaceId,
              companyId: project.companyId,
              documentId: document.id,
            },
            item.versionId,
          );
          const stored = await this.content.downloadWithinReadTransaction(
            actor,
            item,
          );
          size += stored.size;
          if (size > MAXIMUM_PDF_BYTES) throw tooLarge();
          const path = `${String(position + 1).padStart(2, '0')}-${document.id}-${version.id}.pdf`;
          files[path] = stored.bytes;
          entries.push({
            path,
            documentId: document.id,
            title: document.title,
            versionId: version.id,
            versionNumber: version.number,
            versionStatus: version.status,
            representationId: item.representationId,
            originalFileName: stored.fileName,
            byteSize: stored.size,
            sha256: stored.sha256,
          });
        }
        const manifest = {
          formatVersion: 1,
          purpose: 'SELECTED_PROJECT_PDFS',
          preparedAt: new Date().toISOString(),
          projectId: project.id,
          companyId: project.companyId,
          clientId: project.clientAccountId,
          entries,
        };
        files['manifest.json'] = strToU8(JSON.stringify(manifest, null, 2));
        const archive = zipSync(files, { level: 0 });
        if (archive.byteLength > MAXIMUM_ZIP_BYTES) throw tooLarge();
        return archive;
      },
      { isolationLevel: 'repeatable read', accessMode: 'read only' },
    );
  }
}
function selection(value: unknown) {
  if (
    !isRecord(value) ||
    Object.keys(value).length !== 1 ||
    !Array.isArray(value.items) ||
    value.items.length < 1 ||
    value.items.length > 20
  )
    throw invalid();
  const pairs = new Set<string>();
  return value.items.map((item: unknown) => {
    if (
      !isRecord(item) ||
      Object.keys(item).length !== 4 ||
      Object.keys(item).some(
        (key) =>
          ![
            'documentId',
            'versionId',
            'representationId',
            'expectedProjectRevision',
          ].includes(key),
      ) ||
      typeof item.expectedProjectRevision !== 'number' ||
      !Number.isSafeInteger(item.expectedProjectRevision) ||
      item.expectedProjectRevision < 0 ||
      item.expectedProjectRevision > 2147483647
    )
      throw invalid();
    const documentId = requireUuid(item.documentId);
    const versionId = requireUuid(item.versionId);
    const representationId = requireUuid(item.representationId);
    const pair = `${documentId}:${versionId}`;
    if (pairs.has(pair)) throw invalid();
    pairs.add(pair);
    return {
      documentId,
      versionId,
      representationId,
      expectedProjectRevision: item.expectedProjectRevision,
    };
  });
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
function invalid() {
  return new BadRequestException(
    'Choose 1–20 unique exact Document Versions with their current association revisions.',
  );
}
function tooLarge() {
  return new PayloadTooLargeException({
    code: 'project_pdf_bundle_too_large',
    message: 'Selected PDFs exceed the 20 MiB PDF or 21 MiB archive limit.',
  });
}
