import {
  Inject,
  Injectable,
  type CanActivate,
  type ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { AccessService } from './access.service.js';
import type { ActorContext, ExternalPrincipal } from './access.types.js';
import {
  EXTERNAL_IDENTITY_VERIFIER,
  type ExternalIdentityVerifier,
  type IdentityRequest,
} from './external-identity-verifier.js';

interface HeaderRequest {
  header(name: string): string | undefined;
}

export interface ActorContextRequest extends HeaderRequest, IdentityRequest {
  actorContext?: ActorContext;
}

function requiredHeader(request: HeaderRequest, name: string): string {
  const value = request.header(name)?.trim();
  if (!value) throw new UnauthorizedException();
  return value;
}

@Injectable()
export class ActorContextAdapter implements CanActivate {
  constructor(
    @Inject(EXTERNAL_IDENTITY_VERIFIER)
    private readonly externalIdentity: ExternalIdentityVerifier,
    private readonly access: AccessService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<ActorContextRequest>();
    const principal = await this.resolvePrincipal(request);
    request.actorContext = await this.access.resolveActor(
      principal,
      request.header('x-company-context-id'),
    );
    return true;
  }

  private async resolvePrincipal(
    request: ActorContextRequest,
  ): Promise<ExternalPrincipal> {
    const mode = process.env.ACCESS_IDENTITY_MODE;
    const deterministicModeAllowed =
      mode === 'test' && process.env.NODE_ENV === 'test';
    const localDemoModeAllowed =
      mode === 'local-demo' && process.env.NODE_ENV === 'development';

    if (!deterministicModeAllowed && !localDemoModeAllowed) {
      return this.externalIdentity.verify(request);
    }

    return {
      provider: requiredHeader(request, 'x-test-external-provider'),
      subject: requiredHeader(request, 'x-test-external-subject'),
      displayName: requiredHeader(request, 'x-test-display-name'),
      email: requiredHeader(request, 'x-test-email'),
    };
  }
}
