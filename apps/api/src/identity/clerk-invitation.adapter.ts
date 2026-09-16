import { createClerkClient } from '@clerk/backend';
import { isClerkAPIResponseError } from '@clerk/backend/errors';
import type {
  InvitationIntent,
  ProviderInvitationResult,
  WorkspaceInvitationProvider,
} from '../access/workspace-invitation-provider.js';

type CreateParameters = Parameters<
  ReturnType<typeof createClerkClient>['invitations']['createInvitation']
>[0];
type ListParameters = Parameters<
  ReturnType<typeof createClerkClient>['invitations']['getInvitationList']
>[0];

// Only the external provider is replaceable; admission remains application-owned.
export interface InvitationGateway {
  create(parameters: CreateParameters): Promise<unknown>;
  list(parameters: ListParameters): Promise<unknown>;
  revoke(id: string): Promise<unknown>;
}

class InvitationConfigurationError extends Error {}

function productionGateway(): InvitationGateway {
  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey)
    throw new InvitationConfigurationError(
      'Invitation provider is not configured.',
    );
  const api = createClerkClient({ secretKey }).invitations;
  return {
    create: (parameters) => api.createInvitation(parameters),
    list: (parameters) => api.getInvitationList(parameters),
    revoke: (id) => api.revokeInvitation(id),
  };
}

export class ClerkInvitationProvider implements WorkspaceInvitationProvider {
  constructor(private readonly gateway?: InvitationGateway) {}

  async issue(intent: InvitationIntent): Promise<ProviderInvitationResult> {
    try {
      const value = await bounded(() =>
        this.external().create({
          emailAddress: intent.email,
          expiresInDays: intent.expiresInDays,
          ignoreExisting: false,
          notify: true,
          publicMetadata: { workspaceInvitationReference: intent.reference },
        }),
      );
      return confirmed(value, intent) ?? { kind: 'uncertain' };
    } catch (error: unknown) {
      if (error instanceof InvitationConfigurationError)
        return { kind: 'rejected' };
      // A definitive 4xx is a rejection, not permission to retry the send.
      if (
        isClerkAPIResponseError(error) &&
        error.status >= 400 &&
        error.status < 500 &&
        error.status !== 408
      )
        return { kind: 'rejected' };
      return { kind: 'uncertain' };
    }
  }

  async inspect(intent: InvitationIntent): Promise<ProviderInvitationResult> {
    try {
      const api = this.external();
      // Explicit statuses include revoked records, omitted by Clerk's default list.
      // A capped/incomplete result is uncertain, never grounds for another send.
      const pages = await bounded(() =>
        Promise.all(
          (['pending', 'accepted', 'revoked', 'expired'] as const).map(
            (status) =>
              api.list({ query: intent.email, status, limit: 100, offset: 0 }),
          ),
        ),
      );
      const matches = new Map<
        string,
        Extract<ProviderInvitationResult, { kind: 'confirmed' }>
      >();
      for (const page of pages) {
        if (
          !record(page) ||
          !Array.isArray(page.data) ||
          typeof page.totalCount !== 'number' ||
          page.totalCount > page.data.length
        )
          return { kind: 'uncertain' };
        for (const candidate of page.data) {
          const match = confirmed(candidate, intent);
          if (match) {
            const previous = matches.get(match.providerId);
            if (previous && previous.status !== match.status)
              return { kind: 'uncertain' };
            matches.set(match.providerId, match);
          }
        }
      }
      return matches.size === 1
        ? ([...matches.values()][0] ?? { kind: 'uncertain' })
        : { kind: 'uncertain' };
    } catch {
      return { kind: 'uncertain' };
    }
  }

  async revoke(intent: InvitationIntent): Promise<ProviderInvitationResult> {
    const found = await this.inspect(intent);
    if (found.kind !== 'confirmed' || found.status !== 'pending') return found;
    try {
      const value = await bounded(() =>
        this.external().revoke(found.providerId),
      );
      const result = confirmed(value, intent);
      return result?.providerId === found.providerId &&
        result.status === 'revoked'
        ? result
        : { kind: 'uncertain' };
    } catch {
      return { kind: 'uncertain' };
    }
  }

  private external(): InvitationGateway {
    return this.gateway ?? productionGateway();
  }
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function confirmed(
  value: unknown,
  intent: InvitationIntent,
): Extract<ProviderInvitationResult, { kind: 'confirmed' }> | undefined {
  if (
    !record(value) ||
    typeof value.id !== 'string' ||
    !value.id ||
    typeof value.emailAddress !== 'string' ||
    value.emailAddress.toLowerCase() !== intent.email ||
    !record(value.publicMetadata) ||
    value.publicMetadata.workspaceInvitationReference !== intent.reference
  )
    return undefined;
  const status = value.status;
  if (
    status !== 'pending' &&
    status !== 'accepted' &&
    status !== 'revoked' &&
    status !== 'expired'
  )
    return undefined;
  return { kind: 'confirmed', providerId: value.id, status };
}

async function bounded<T>(work: () => Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error('Invitation provider timeout.')),
          10_000,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
