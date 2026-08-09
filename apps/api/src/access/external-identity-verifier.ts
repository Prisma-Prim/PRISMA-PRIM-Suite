import type { ExternalPrincipal } from './access.types.js';

export const EXTERNAL_IDENTITY_VERIFIER = Symbol('EXTERNAL_IDENTITY_VERIFIER');

export interface IdentityRequest {
  protocol: string;
  originalUrl: string;
  method: string;
  headers: Record<string, string | string[] | undefined>;
  get(name: string): string | undefined;
}

export interface ExternalIdentityVerifier {
  verify(request: IdentityRequest): Promise<ExternalPrincipal>;
}
