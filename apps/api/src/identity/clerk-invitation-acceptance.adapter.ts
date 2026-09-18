import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'node:crypto';
import { acceptanceGateway } from './clerk-invitation-acceptance.gateway.js';
import type {
  InvitationAcceptanceProvider,
  InvitationProofRequest,
  InvitationRecipientProof,
} from '../access/workspace-invitation-acceptance-provider.js';

export interface AcceptanceGateway {
  list(input: {
    query: string;
    status: 'pending' | 'accepted' | 'revoked' | 'expired';
    limit: number;
    offset: number;
  }): Promise<unknown>;
  user(id: string): Promise<unknown>;
  client(id: string): Promise<unknown>;
  createClient(): Promise<unknown>;
  exchange(input: { token: string; ticket: string }): Promise<void>;
}

export class ClerkInvitationAcceptanceProvider implements InvitationAcceptanceProvider {
  constructor(
    private readonly gateway?: AcceptanceGateway,
    private readonly secretKey = process.env.CLERK_SECRET_KEY,
  ) {}

  async prove(
    request: InvitationProofRequest,
  ): Promise<InvitationRecipientProof> {
    if (request.principal.provider !== 'clerk') return { kind: 'denied' };
    try {
      return await bounded(async () => {
        const api = this.external();
        const invitation = await findInvitation(api, request);
        if (!invitation || !['pending', 'accepted'].includes(invitation.status))
          return { kind: 'denied' };
        const verified = {
          kind: 'verified',
          provider: 'clerk',
          subject: request.principal.subject,
          reference: request.invitation.reference,
          providerId: invitation.id,
        } satisfies InvitationRecipientProof;
        if (request.context) {
          const client = clientEvidence(
            await api.client(request.context.clientId),
            request,
          );
          if (client === 'verified') return verified;
          if (client === 'denied') return { kind: 'denied' };
        }
        if (invitation.status === 'accepted') {
          const user = await api.user(request.principal.subject);
          return record(user) &&
            user.id === request.principal.subject &&
            record(user.publicMetadata) &&
            user.publicMetadata.workspaceInvitationReference ===
              request.invitation.reference
            ? verified
            : { kind: 'denied' };
        }
        // The ticket is only an opaque capability. No decoded email or identity is trusted.
        if (
          !request.ticket ||
          !invitation.url ||
          new URL(invitation.url).searchParams.get('ticket') !== request.ticket
        )
          return { kind: 'denied' };
        if (!request.context) return { kind: 'needs-client' };
        const token = this.unseal(
          request.context.sealedToken,
          request.invitation.reference,
        );
        await api.exchange({ token, ticket: request.ticket });
        const client = clientEvidence(
          await api.client(request.context.clientId),
          request,
        );
        return client === 'verified'
          ? verified
          : { kind: client === 'empty' ? 'unavailable' : 'denied' };
      });
    } catch {
      return { kind: 'unavailable' };
    }
  }

  async prepare(reference: string) {
    try {
      const client = await bounded(() => this.external().createClient());
      if (
        !record(client) ||
        typeof client.id !== 'string' ||
        !client.id ||
        typeof client.token !== 'string' ||
        !client.token
      )
        return undefined;
      const iv = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', this.encryptionKey(), iv);
      cipher.setAAD(Buffer.from(reference));
      const encrypted = Buffer.concat([
        cipher.update(client.token, 'utf8'),
        cipher.final(),
      ]);
      return {
        clientId: client.id,
        sealedToken: [iv, cipher.getAuthTag(), encrypted]
          .map((part) => part.toString('base64url'))
          .join('.'),
      };
    } catch {
      return undefined;
    }
  }

  private encryptionKey() {
    if (!this.secretKey)
      throw new Error('Invitation proof configuration is missing.');
    return createHash('sha256')
      .update('prisma-prim:invitation-proof:v1:' + this.secretKey)
      .digest();
  }

  private unseal(value: string, reference: string) {
    const parts = value.split('.');
    if (parts.length !== 3) throw new Error('Invalid proof context.');
    const [iv, tag, encrypted] = parts.map((part) =>
      Buffer.from(part, 'base64url'),
    );
    if (!iv || iv.length !== 12 || !tag || tag.length !== 16 || !encrypted)
      throw new Error('Invalid proof context.');
    const decipher = createDecipheriv('aes-256-gcm', this.encryptionKey(), iv);
    decipher.setAAD(Buffer.from(reference));
    decipher.setAuthTag(tag);
    return Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ]).toString('utf8');
  }

  private external(): AcceptanceGateway {
    if (this.gateway) return this.gateway;
    if (!this.secretKey) throw new Error('Invitation provider is unavailable.');
    return acceptanceGateway(this.secretKey);
  }
}

function clientEvidence(
  value: unknown,
  request: InvitationProofRequest,
): 'verified' | 'empty' | 'denied' {
  if (
    !record(value) ||
    value.id !== request.context?.clientId ||
    !Array.isArray(value.sessions) ||
    !Array.isArray(value.sessionIds)
  )
    return 'denied';
  if (value.sessions.length === 0 && value.sessionIds.length === 0)
    return 'empty';
  if (value.sessions.length !== 1 || value.sessionIds.length !== 1)
    return 'denied';
  const session: unknown = value.sessions[0];
  return record(session) &&
    typeof session.id === 'string' &&
    session.id.length > 0 &&
    value.sessionIds[0] === session.id &&
    session.clientId === value.id &&
    session.userId === request.principal.subject &&
    session.status === 'active'
    ? 'verified'
    : 'denied';
}

async function findInvitation(
  api: AcceptanceGateway,
  request: InvitationProofRequest,
) {
  const matches = new Map<
    string,
    { id: string; status: string; url: string | undefined }
  >();
  const deadline = Date.now() + 10_000;
  for (const status of ['pending', 'accepted', 'revoked', 'expired'] as const) {
    let offset = 0;
    let total: number | undefined;
    do {
      if (Date.now() >= deadline) throw new Error('Invitation proof timeout.');
      const page = await api.list({
        query: request.invitation.email,
        status,
        limit: 100,
        offset,
      });
      if (
        !record(page) ||
        !Array.isArray(page.data) ||
        typeof page.totalCount !== 'number' ||
        !Number.isSafeInteger(page.totalCount) ||
        page.totalCount < 0 ||
        (total !== undefined && page.totalCount !== total) ||
        page.data.length > 100 ||
        offset + page.data.length > page.totalCount ||
        (page.data.length === 0 && offset < page.totalCount)
      )
        throw new Error('Incomplete invitation evidence.');
      total = page.totalCount;
      for (const value of page.data) {
        if (
          !record(value) ||
          !record(value.publicMetadata) ||
          value.publicMetadata.workspaceInvitationReference !==
            request.invitation.reference
        )
          continue;
        if (
          typeof value.id !== 'string' ||
          !value.id ||
          value.status !== status ||
          matches.has(value.id)
        )
          throw new Error('Ambiguous invitation evidence.');
        matches.set(value.id, {
          id: value.id,
          status,
          url: typeof value.url === 'string' ? value.url : undefined,
        });
      }
      offset += page.data.length;
    } while (offset < total);
  }
  if (matches.size !== 1) return undefined;
  const invitation = [...matches.values()][0];
  return invitation &&
    (request.invitation.providerId === null ||
      request.invitation.providerId === invitation.id)
    ? invitation
    : undefined;
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function bounded<T>(work: () => Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error('Invitation proof timeout.')),
          10_000,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
