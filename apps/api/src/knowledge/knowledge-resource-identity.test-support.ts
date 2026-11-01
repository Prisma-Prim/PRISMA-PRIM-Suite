import { createClerkClient } from '@clerk/backend';
import { generateKeyPairSync, sign } from 'node:crypto';

export const resourceAudience = 'https://prisma.example.test/api/knowledge';
export const resourceWebOrigin = 'https://prisma.example.test';
export const resourceSubject = 'user_fixture';

/** Real offline Clerk authentication; only its external user-profile API is fictional. */
export function createSignedKnowledgeIdentityFixture() {
  const issuerKeys = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const foreignKeys = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const sdk = createClerkClient({
    telemetry: { disabled: true },
    secretKey: 'sk_test_synthetic_knowledge_identity',
    publishableKey:
      'pk_test_' +
      Buffer.from('fixture.clerk.accounts.dev$').toString('base64'),
    jwtKey: issuerKeys.publicKey
      .export({ type: 'spki', format: 'pem' })
      .toString(),
  });

  return {
    client: {
      authenticateRequest: sdk.authenticateRequest,
      users: {
        getUser: async () => ({
          firstName: 'Synthetic',
          lastName: 'Reader',
          primaryEmailAddress: { emailAddress: 'reader@example.test' },
        }),
      },
    },
    token(overrides: Record<string, unknown> = {}, foreign = false): string {
      const now = Math.floor(Date.now() / 1000);
      const header = Buffer.from(
        JSON.stringify({ alg: 'RS256', typ: 'JWT', kid: 'fixture-key' }),
      ).toString('base64url');
      const body = Buffer.from(
        JSON.stringify({
          sub: resourceSubject,
          sid: 'sess_fixture',
          iss: 'https://fixture.clerk.accounts.dev',
          aud: resourceAudience,
          azp: resourceWebOrigin,
          iat: now,
          nbf: now - 1,
          exp: now + 300,
          ...overrides,
        }),
      ).toString('base64url');
      const unsigned = `${header}.${body}`;
      return `${unsigned}.${sign('RSA-SHA256', Buffer.from(unsigned), foreign ? foreignKeys.privateKey : issuerKeys.privateKey).toString('base64url')}`;
    },
  };
}
