import {
  documentVersionPdfQuery,
  frozenDocumentPdfPredicate,
} from './document-version-pdf-query.js';
import { Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, desc, eq } from 'drizzle-orm';
import type { ActorContext } from '../access/access.types.js';
import { CompanyContextAuthorization } from '../access/company-context-authorization.js';
import { ClientOperationalReferenceService } from '../client/client-operational-reference.service.js';
import { DatabaseContext } from '../database/database-context.js';
import {
  documentPdfs,
  documentVersions,
  workingDocuments,
} from '../database/schema/index.js';
import { requireDocumentPermission } from './document-read-boundary.js';

export interface TaskResultDocumentContext {
  companyId: string;
  projectId: string;
  clientAccountId: string;
}
export interface TaskResultDocumentReference {
  documentId: string;
  versionId: string;
  versionNumber: number;
  title: string;
  status: 'official' | 'superseded';
  representationId: string;
}

/** Documents owns qualification; no Task caller receives storage rows or bytes. */
@Injectable()
export class DocumentTaskResultReferenceService {
  constructor(
    private readonly database: DatabaseContext,
    private readonly authorization: CompanyContextAuthorization,
    private readonly clients: ClientOperationalReferenceService,
  ) {}

  async eligible(input: {
    actor: ActorContext;
    context: TaskResultDocumentContext;
  }): Promise<TaskResultDocumentReference[]> {
    await this.requireRead({ ...input, lock: false });
    const rows = await documentVersionPdfQuery(
      this.database.connection
        .select({
          documentId: workingDocuments.id,
          versionId: documentVersions.id,
        })
        .from(workingDocuments)
        .$dynamic(),
    )
      .where(
        and(
          eq(workingDocuments.workspaceId, input.actor.workspaceId),
          eq(workingDocuments.companyId, input.context.companyId),
          eq(workingDocuments.clientId, input.context.clientAccountId),
          eq(workingDocuments.projectId, input.context.projectId),
          eq(workingDocuments.type, 'mission-deliverable'),
          frozenDocumentPdfPredicate(),
        ),
      )
      .orderBy(
        asc(workingDocuments.createdAt),
        asc(workingDocuments.id),
        desc(documentVersions.number),
      );
    const versions: TaskResultDocumentReference[] = [];
    for (const row of rows)
      versions.push(
        await this.exact({
          ...input,
          ...row,
          reference: { kind: 'eligible', lock: false },
        }),
      );
    return versions;
  }

  async requireRead(input: {
    actor: ActorContext;
    context: TaskResultDocumentContext;
    lock: boolean;
  }): Promise<void> {
    if (
      requireDocumentPermission(input.actor, 'document.read') !==
      input.context.companyId
    )
      throw new NotFoundException();
    await this.authorization.requirePermissions(input.actor, {
      permissions: ['document.read'],
      lock: input.lock,
      prerequisites: [
        {
          permissions: ['client.read'],
          workspaceAlternative: 'client.manage',
        },
      ],
    });
    await this.clients.readReferenceClient(
      input.actor,
      input.context.clientAccountId,
    );
    if (
      !(await this.authorization.hasPermissions(input.actor, {
        permissions: ['document.mission_deliverable.access'],
        lock: {
          lockAssignment: input.lock,
        }.lockAssignment,
      })) ||
      !(await this.authorization.hasPermissions(input.actor, {
        permissions: ['document.content.read'],
        lock: false,
      }))
    )
      throw new NotFoundException();
    if (input.lock)
      await this.authorization.requirePermissions(input.actor, {
        permissions: ['document.content.read'],
        lock: true,
        prerequisites: [
          { permissions: ['document.read', 'document.reference.read'] },
          {
            permissions: ['client.read'],
            workspaceAlternative: 'client.manage',
          },
        ],
      });
  }

  async exact(input: {
    actor: ActorContext;
    context: TaskResultDocumentContext;
    documentId: string;
    versionId: string;
    reference:
      | { kind: 'eligible'; lock: boolean }
      | { kind: 'declared'; representationId: string };
  }): Promise<TaskResultDocumentReference> {
    const lock = input.reference.kind === 'eligible' && input.reference.lock;
    await this.requireRead({
      actor: input.actor,
      context: input.context,
      lock,
    });
    return this.resolve(input);
  }

  /** Explicit participant for a caller-owned read-only snapshot; command defaults remain locked. */
  async requireReadWithinReadTransaction(input: {
    actor: ActorContext;
    context: TaskResultDocumentContext;
  }) {
    if (
      requireDocumentPermission(input.actor, 'document.read') !==
      input.context.companyId
    )
      throw new NotFoundException();
    await this.authorization.requirePermissions(input.actor, {
      permissions: ['document.content.read'],
      lock: false,
      prerequisites: [
        { permissions: ['document.read', 'document.reference.read'] },
        {
          permissions: ['client.read'],
          workspaceAlternative: 'client.manage',
        },
      ],
    });
    await this.clients.requireReferenceReadAuthorityWithinReadTransaction(
      input.actor,
    );
    await this.clients.readReferenceClient(
      input.actor,
      input.context.clientAccountId,
    );
    if (
      !(await this.authorization.hasPermissions(input.actor, {
        permissions: ['document.mission_deliverable.access'],
        lock: false,
      }))
    )
      throw new NotFoundException();
  }

  async exactWithinReadTransaction(input: {
    actor: ActorContext;
    context: TaskResultDocumentContext;
    documentId: string;
    versionId: string;
    representationId: string;
  }): Promise<TaskResultDocumentReference> {
    await this.requireReadWithinReadTransaction(input);
    return this.resolve({
      ...input,
      reference: { kind: 'declared', representationId: input.representationId },
    });
  }

  private async resolve(
    input: Parameters<DocumentTaskResultReferenceService['exact']>[0],
  ): Promise<TaskResultDocumentReference> {
    const lock = input.reference.kind === 'eligible' && input.reference.lock;
    const query = this.database.connection
      .select({
        id: workingDocuments.id,
        projectId: workingDocuments.projectId,
      })
      .from(workingDocuments)
      .where(
        and(
          eq(workingDocuments.workspaceId, input.actor.workspaceId),
          eq(workingDocuments.companyId, input.context.companyId),
          eq(workingDocuments.clientId, input.context.clientAccountId),
          eq(workingDocuments.type, 'mission-deliverable'),
          eq(workingDocuments.id, input.documentId),
        ),
      );
    const [document] = lock ? await query.for('share') : await query;
    if (
      !document ||
      (input.reference.kind === 'eligible' &&
        document.projectId !== input.context.projectId)
    )
      throw new NotFoundException();
    const [version] = await documentVersionPdfQuery(
      this.database.connection
        .select({
          id: documentVersions.id,
          number: documentVersions.number,
          title: documentVersions.frozenTitle,
          status: documentVersions.status,
          representationId: documentPdfs.id,
        })
        .from(workingDocuments)
        .$dynamic(),
    ).where(
      and(
        eq(workingDocuments.workspaceId, input.actor.workspaceId),
        eq(workingDocuments.companyId, input.context.companyId),
        eq(workingDocuments.id, input.documentId),
        eq(documentVersions.id, input.versionId),
        frozenDocumentPdfPredicate(),
      ),
    );
    if (
      !version ||
      (version.status !== 'official' && version.status !== 'superseded') ||
      version.title === null ||
      !version.title.trim() ||
      version.title.length > 200 ||
      !Number.isInteger(version.number) ||
      version.number < 1
    )
      throw new NotFoundException();
    if (
      input.reference.kind === 'declared' &&
      version.representationId !== input.reference.representationId
    )
      throw new NotFoundException();
    return {
      documentId: document.id,
      versionId: version.id,
      versionNumber: version.number,
      title: version.title,
      status: version.status,
      representationId: version.representationId,
    };
  }
}
