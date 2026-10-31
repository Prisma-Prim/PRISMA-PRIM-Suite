import { ForbiddenException, Injectable } from '@nestjs/common';
import { and, eq, isNull } from 'drizzle-orm';
import type { ActorContext } from '../access/access.types.js';
import { CompanyContextAuthorization } from '../access/company-context-authorization.js';
import {
  COMPANY_KNOWLEDGE_EVIDENCE_READER_BUNDLE,
  COMPANY_KNOWLEDGE_SOURCE_ADMINISTRATOR_BUNDLE,
} from '../access/company-permissions.js';
import { DatabaseContext } from '../database/database-context.js';
import { companyRoleAssignments } from '../database/schema/index.js';

@Injectable()
export class KnowledgeAuthorization {
  constructor(
    private readonly database: DatabaseContext,
    private readonly documents: CompanyContextAuthorization,
  ) {}

  async require(
    actor: ActorContext,
    role: 'admin' | 'reader',
  ): Promise<string> {
    const companyId = await this.documents.requireDocumentContentRead(actor);
    const bundle =
      role === 'admin'
        ? COMPANY_KNOWLEDGE_SOURCE_ADMINISTRATOR_BUNDLE
        : COMPANY_KNOWLEDGE_EVIDENCE_READER_BUNDLE;
    const capture = actor.activeCompany?.knowledgeGrants?.find(
      (grant) => grant.bundle === bundle && grant.permissionSetVersion === 'v1',
    );
    if (!capture) throw new ForbiddenException();
    const [live] = await this.database.connection
      .select({ id: companyRoleAssignments.id })
      .from(companyRoleAssignments)
      .where(
        and(
          eq(companyRoleAssignments.workspaceId, actor.workspaceId),
          eq(companyRoleAssignments.companyId, companyId),
          eq(
            companyRoleAssignments.workspaceMembershipId,
            actor.workspaceMembershipId,
          ),
          eq(companyRoleAssignments.id, capture.assignmentId),
          eq(companyRoleAssignments.bundle, bundle),
          eq(companyRoleAssignments.permissionSetVersion, 'v1'),
          isNull(companyRoleAssignments.revokedAt),
        ),
      )
      .for('share');
    if (!live) throw new ForbiddenException();
    return companyId;
  }
}
