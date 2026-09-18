import {
  Inject,
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import type { ExternalPrincipal } from './access.types.js';
import {
  EXTERNAL_IDENTITY_VERIFIER,
  type ExternalIdentityVerifier,
  type IdentityRequest,
} from './external-identity-verifier.js';

export interface VerifiedPrincipalRequest extends IdentityRequest {
  header(name: string): string | undefined;
  principal?: ExternalPrincipal;
}

@Injectable()
export class VerifiedPrincipalAdapter implements CanActivate {
  constructor(
    @Inject(EXTERNAL_IDENTITY_VERIFIER)
    private readonly identity: ExternalIdentityVerifier,
  ) {}

  async canActivate(context: ExecutionContext) {
    const request = context
      .switchToHttp()
      .getRequest<VerifiedPrincipalRequest>();
    request.principal = await this.resolve(request);
    return true;
  }

  async resolve(request: VerifiedPrincipalRequest): Promise<ExternalPrincipal> {
    const mode = process.env.ACCESS_IDENTITY_MODE;
    const deterministic =
      (mode === 'test' && process.env.NODE_ENV === 'test') ||
      (mode === 'local-demo' && process.env.NODE_ENV === 'development');
    if (!deterministic) return this.identity.verify(request);
    return {
      provider: requiredHeader(request, 'x-test-external-provider'),
      subject: requiredHeader(request, 'x-test-external-subject'),
      displayName: requiredHeader(request, 'x-test-display-name'),
      email: requiredHeader(request, 'x-test-email'),
    };
  }
}

function requiredHeader(request: VerifiedPrincipalRequest, name: string) {
  const value = request.header(name)?.trim();
  if (!value) throw new UnauthorizedException();
  return value;
}
