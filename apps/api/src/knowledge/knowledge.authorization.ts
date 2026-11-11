import type { CompanyPermission } from '../access/captured-company-permissions.js';
import { Injectable } from '@nestjs/common';
import type { ActorContext } from '../access/access.types.js';
import { CompanyContextAuthorization } from '../access/company-context-authorization.js';

type KnowledgeAccessRole = 'admin' | 'reader';
const KNOWLEDGE_REQUIRED_PERMISSION = {
  admin: 'knowledge.source.manage',
  reader: 'knowledge.evidence.read',
} satisfies Record<KnowledgeAccessRole, CompanyPermission>;

/** Knowledge's seam onto the Access-owned Knowledge authority. */
@Injectable()
export class KnowledgeAuthorization {
  constructor(private readonly access: CompanyContextAuthorization) {}

  require(actor: ActorContext, role: KnowledgeAccessRole): Promise<string> {
    return this.access
      .requirePermissions(actor, {
        permissions: [KNOWLEDGE_REQUIRED_PERMISSION[role]],
        prerequisites: [
          { permissions: ['document.read', 'document.reference.read'] },
          {
            permissions: ['client.read'],
            workspaceAlternative: 'client.manage',
          },
          { permissions: ['document.content.read'] },
        ],
        lock: true,
      })
      .then((access) => access.companyId);
  }
}
