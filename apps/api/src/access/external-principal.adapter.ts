import {
  Inject,
  Injectable,
  type CanActivate,
  type ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import type { ExternalPrincipal } from './access.types.js';
import {
  EXTERNAL_IDENTITY_VERIFIER,
  type ExternalIdentityVerifier,
  type IdentityRequest,
} from './external-identity-verifier.js';

interface HeaderRequest {
  header(name: string): string | undefined;
}

export interface PrincipalRequest extends HeaderRequest, IdentityRequest {
  externalPrincipal?: ExternalPrincipal;
}

function requiredHeader(request: HeaderRequest, name: string): string {
  const value = request.header(name)?.trim();
  if (!value) throw new UnauthorizedException();
  return value;
}

@Injectable()
export class ExternalPrincipalAdapter implements CanActivate {
  constructor(
    @Inject(EXTERNAL_IDENTITY_VERIFIER)
    private readonly externalIdentity: ExternalIdentityVerifier,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<PrincipalRequest>();
    const mode = process.env.ACCESS_IDENTITY_MODE;
    const deterministicModeAllowed =
      mode === 'test' && process.env.NODE_ENV === 'test';
    const localDemoModeAllowed =
      mode === 'local-demo' && process.env.NODE_ENV === 'development';

    if (!deterministicModeAllowed && !localDemoModeAllowed) {
      request.externalPrincipal = await this.externalIdentity.verify(request);
      return true;
    }

    request.externalPrincipal = {
      provider: requiredHeader(request, 'x-test-external-provider'),
      subject: requiredHeader(request, 'x-test-external-subject'),
      displayName: requiredHeader(request, 'x-test-display-name'),
      email: requiredHeader(request, 'x-test-email'),
    };
    return true;
  }
}
