import { Global, Module } from '@nestjs/common';
import { EXTERNAL_IDENTITY_VERIFIER } from '../access/external-identity-verifier.js';
import { ClerkIdentityAdapter } from './clerk-identity.adapter.js';

@Global()
@Module({
  providers: [
    ClerkIdentityAdapter,
    { provide: EXTERNAL_IDENTITY_VERIFIER, useExisting: ClerkIdentityAdapter },
  ],
  exports: [EXTERNAL_IDENTITY_VERIFIER],
})
export class IdentityModule {}
