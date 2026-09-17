import { Global, Module } from '@nestjs/common';
import { EXTERNAL_IDENTITY_VERIFIER } from '../access/external-identity-verifier.js';
import { IDENTITY_SESSION_REVOKER } from '../access/identity-session-revoker.js';
import { ClerkSessionRevocationAdapter } from './clerk-session-revocation.adapter.js';
import { ClerkIdentityAdapter } from './clerk-identity.adapter.js';

@Global()
@Module({
  providers: [
    ClerkIdentityAdapter,
    ClerkSessionRevocationAdapter,
    {
      provide: IDENTITY_SESSION_REVOKER,
      useExisting: ClerkSessionRevocationAdapter,
    },
    { provide: EXTERNAL_IDENTITY_VERIFIER, useExisting: ClerkIdentityAdapter },
  ],
  exports: [EXTERNAL_IDENTITY_VERIFIER, IDENTITY_SESSION_REVOKER],
})
export class IdentityModule {}
