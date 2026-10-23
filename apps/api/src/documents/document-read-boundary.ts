import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import type { ActorContext } from '../access/access.types.js';
import { requireUuid } from '../access/access-command-validation.js';
import { CompanyContextAuthorization } from '../access/company-context-authorization.js';
import { ClientOperationalReferenceService } from '../client/client-operational-reference.service.js';
import { DatabaseContext } from '../database/database-context.js';
import { workingDocuments } from '../database/schema/index.js';

/** A Document the actor may currently read, with its original Client. */
export interface VisibleDocument {
  companyId: string;
  document: typeof workingDocuments.$inferSelect;
  client: {
    id: string;
    displayName: string;
    status: 'active' | 'archived' | 'superseded';
  };
}

/**
 * The detail read's authority and visibility boundary, with its refusals:
 * Document metadata read, the live Registrar assignment, this Workspace and
 * active Company, and the original Client's readable Company relationship,
 * which a superseded original keeps. The Document detail, its correction
 * history and its Versions share it.
 */
@Injectable()
export class DocumentReadBoundary {
  constructor(
    private readonly authorization: CompanyContextAuthorization,
    private readonly database: DatabaseContext,
    private readonly clients: ClientOperationalReferenceService,
  ) {}

  async requireVisible(
    actor: ActorContext,
    idValue: unknown,
    options: { lockFamily: boolean } = { lockFamily: false },
  ): Promise<VisibleDocument> {
    const companyId = requireDocumentPermission(actor, 'document.read');
    await this.authorization.requireDocumentAccess(actor);
    const id = requireUuid(idValue);
    const [document] = await this.database.connection
      .select()
      .from(workingDocuments)
      .where(
        and(
          eq(workingDocuments.workspaceId, actor.workspaceId),
          eq(workingDocuments.companyId, companyId),
          eq(workingDocuments.id, id),
        ),
      );
    if (!document) throw new NotFoundException();
    await this.requireFamily(actor, document.type, options.lockFamily);
    const client = await this.clients.readReferenceClient(
      actor,
      document.clientId,
    );
    return { companyId, document, client };
  }
  /** Fence a mission command before receipt inspection without changing legacy mismatch semantics. */
  async lockFamilyForCommand(
    actor: ActorContext,
    documentId: string,
  ): Promise<void> {
    const companyId = requireDocumentPermission(actor, 'document.read');
    await this.authorization.requireDocumentAccess(actor, true);
    const [document] = await this.database.connection
      .select({ type: workingDocuments.type })
      .from(workingDocuments)
      .where(
        and(
          eq(workingDocuments.workspaceId, actor.workspaceId),
          eq(workingDocuments.companyId, companyId),
          eq(workingDocuments.id, documentId),
        ),
      );
    if (document) await this.requireFamily(actor, document.type, true);
  }

  private async requireFamily(
    actor: ActorContext,
    type: unknown,
    lockAssignment: boolean,
  ): Promise<void> {
    if (type === 'questionnaire') return;
    if (
      type !== 'mission-deliverable' ||
      !(await this.authorization.hasMissionDeliverableAccess(actor, {
        lockAssignment,
      }))
    )
      throw new NotFoundException();
  }
}

/**
 * The actor's own Document permission in the active Company, together with
 * the Client-read prerequisite. It returns the active Company.
 */
export function requireDocumentPermission(
  actor: ActorContext,
  permission: 'document.read' | 'document.register',
): string {
  if (
    !actor.active ||
    !actor.activeCompany?.documentPermissions?.includes(permission) ||
    (!actor.workspacePermissions.includes('client.manage') &&
      !actor.activeCompany.clientPermissions.includes('client.read'))
  )
    throw new ForbiddenException();
  return actor.activeCompany.id;
}

/** Only a current Representation reader receives reference URLs. */
export function canReadReference(actor: ActorContext): boolean {
  return (
    actor.activeCompany?.documentPermissions?.includes(
      'document.reference.read',
    ) === true
  );
}
