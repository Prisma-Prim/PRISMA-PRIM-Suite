import {
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { AccessService } from './access.service.js';
import type { ActorContext } from './access.types.js';
import {
  VerifiedPrincipalAdapter,
  type VerifiedPrincipalRequest,
} from './verified-principal.adapter.js';

export interface ActorContextRequest extends VerifiedPrincipalRequest {
  actorContext?: ActorContext;
}

@Injectable()
export class ActorContextAdapter implements CanActivate {
  constructor(
    private readonly identity: VerifiedPrincipalAdapter,
    private readonly access: AccessService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<ActorContextRequest>();
    const principal = await this.identity.resolve(request);
    request.actorContext = await this.access.resolveActor(principal, {
      companyId: request.header('x-company-context-id'),
      workspaceId: request.header('x-workspace-context-id'),
    });
    return true;
  }
}
