import { Injectable } from '@nestjs/common';
import type { ActorContext } from '../access/access.types.js';
import { CompanyContextAuthorization } from '../access/company-context-authorization.js';

/** Knowledge's seam onto the Access-owned Knowledge authority. */
@Injectable()
export class KnowledgeAuthorization {
  constructor(private readonly access: CompanyContextAuthorization) {}

  require(actor: ActorContext, role: 'admin' | 'reader'): Promise<string> {
    return this.access.requireKnowledgeAccess(actor, role);
  }
}
