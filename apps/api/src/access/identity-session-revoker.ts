/** Identity-provider operations never grant or restore application authority. */
export const IDENTITY_SESSION_REVOKER = Symbol('IDENTITY_SESSION_REVOKER');
export type SessionRevocationOutcome =
  { status: 'complete' } | { status: 'retry_required' };
export interface IdentitySessionRevoker {
  revoke(identity: {
    provider: string;
    subject: string;
  }): Promise<SessionRevocationOutcome>;
}
