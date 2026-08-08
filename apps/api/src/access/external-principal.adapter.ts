import {
  Injectable,
  type CanActivate,
  type ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import type { ExternalPrincipal } from './access.types.js';

interface HeaderRequest {
  header(name: string): string | undefined;
}

export interface PrincipalRequest extends HeaderRequest {
  externalPrincipal?: ExternalPrincipal;
}

function requiredHeader(request: HeaderRequest, name: string): string {
  const value = request.header(name)?.trim();
  if (!value) throw new UnauthorizedException();
  return value;
}

@Injectable()
export class ExternalPrincipalAdapter implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<PrincipalRequest>();
    const mode = process.env.ACCESS_IDENTITY_MODE;
    const deterministicModeAllowed =
      mode === 'test' && process.env.NODE_ENV === 'test';
    const localDemoModeAllowed =
      mode === 'local-demo' && process.env.NODE_ENV === 'development';

    if (!deterministicModeAllowed && !localDemoModeAllowed) {
      throw new UnauthorizedException();
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
