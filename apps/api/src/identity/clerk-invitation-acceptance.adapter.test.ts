import { afterEach, describe, expect, it, vi } from 'vitest';
import type { InvitationProofRequest } from '../access/workspace-invitation-acceptance-provider.js';
import {
  ClerkInvitationAcceptanceProvider,
  type AcceptanceGateway,
} from './clerk-invitation-acceptance.adapter.js';

const request: InvitationProofRequest = {
  principal: {
    provider: 'clerk',
    subject: 'user_recipient',
    displayName: 'Recipient',
    email: 'recipient@example.test',
  },
  invitation: {
    reference: 'local_reference',
    providerId: 'inv_one',
    email: 'recipient@example.test',
  },
};
const receipt = {
  kind: 'verified',
  provider: 'clerk',
  subject: 'user_recipient',
  reference: 'local_reference',
  providerId: 'inv_one',
};
function gateway(status = 'accepted'): AcceptanceGateway {
  return {
    list: vi.fn().mockImplementation(async (parameters) => ({
      data:
        parameters.status === status
          ? [
              {
                id: 'inv_one',
                status,
                publicMetadata: {
                  workspaceInvitationReference: 'local_reference',
                },
                url: 'https://example.clerk.accounts.dev/v1/tickets/accept?ticket=opaque_ticket',
              },
            ]
          : [],
      totalCount: parameters.status === status ? 1 : 0,
    })),
    user: vi.fn().mockResolvedValue({
      id: 'user_recipient',
      publicMetadata: { workspaceInvitationReference: 'local_reference' },
    }),
    client: vi.fn(),
    createClient: vi.fn(),
    exchange: vi.fn(),
  };
}

describe('Clerk invitation recipient evidence', () => {
  afterEach(() => vi.useRealTimers());

  it('recovers existing-user ticket consumption from its server-owned client when the exchange response is lost', async () => {
    const external = gateway('pending');
    vi.mocked(external.user).mockResolvedValue({
      id: 'user_recipient',
      publicMetadata: { workspaceInvitationReference: 'older_invitation' },
    });
    vi.mocked(external.createClient).mockResolvedValue({
      id: 'client_private',
      token: 'private_initial_bearer',
    });
    vi.mocked(external.client).mockResolvedValue({
      id: 'client_private',
      sessions: [],
      sessionIds: [],
    });
    const provider = new ClerkInvitationAcceptanceProvider(
      external,
      'test-encryption-secret',
    );
    const withTicket = { ...request, ticket: 'opaque_ticket' };
    expect(await provider.prove(withTicket)).toEqual({ kind: 'needs-client' });
    const context = await provider.prepare(request.invitation.reference);
    expect(context?.clientId).toBe('client_private');
    expect(context?.sealedToken).not.toContain('private_initial_bearer');
    if (!context) throw new Error('Missing prepared context.');
    vi.mocked(external.exchange).mockImplementation(async () => {
      vi.mocked(external.client).mockResolvedValue({
        id: 'client_private',
        sessions: [
          {
            id: 'sess_one',
            clientId: 'client_private',
            userId: 'user_recipient',
            status: 'active',
          },
        ],
        sessionIds: ['sess_one'],
      });
      throw new Error('Response lost after provider commit.');
    });
    expect(await provider.prove({ ...withTicket, context })).toEqual({
      kind: 'unavailable',
    });
    // Recovery does not depend on updated User metadata or another token exchange.
    expect(await provider.prove({ ...withTicket, context })).toEqual(receipt);
    expect(external.exchange).toHaveBeenCalledExactlyOnceWith({
      token: 'private_initial_bearer',
      ticket: 'opaque_ticket',
    });
    expect(
      await provider.prove({ ...withTicket, ticket: 'foreign_ticket' }),
    ).toEqual({ kind: 'denied' });
  });

  it('binds new-account acceptance to server-read metadata and independently verified subject, never email', async () => {
    const external = gateway();
    const provider = new ClerkInvitationAcceptanceProvider(
      external,
      'test-encryption-secret',
    );
    expect(await provider.prove(request)).toEqual(receipt);
    vi.mocked(external.user).mockResolvedValue({
      id: 'user_foreign',
      publicMetadata: { workspaceInvitationReference: 'local_reference' },
    });
    expect(await provider.prove(request)).toEqual({ kind: 'denied' });
    vi.mocked(external.user).mockResolvedValue({
      id: 'user_recipient',
      emailAddresses: [{ emailAddress: 'recipient@example.test' }],
      publicMetadata: {},
    });
    expect(await provider.prove(request)).toEqual({ kind: 'denied' });
    expect(
      await provider.prove({
        ...request,
        principal: { ...request.principal, provider: 'forged' },
      }),
    ).toEqual({ kind: 'denied' });
    expect(external.exchange).not.toHaveBeenCalled();
  });

  it('fails closed on malformed, ambiguous, incomplete and unavailable provider evidence', async () => {
    const external = gateway();
    const provider = new ClerkInvitationAcceptanceProvider(
      external,
      'test-encryption-secret',
    );
    for (const value of [
      null,
      { data: [], totalCount: 101 },
      { data: 'invalid', totalCount: 0 },
      {
        data: [
          {
            id: 'inv_one',
            status: 'unknown',
            publicMetadata: { workspaceInvitationReference: 'local_reference' },
          },
        ],
        totalCount: 1,
      },
    ]) {
      vi.mocked(external.list).mockResolvedValue(value);
      expect(await provider.prove(request)).toEqual({ kind: 'unavailable' });
    }
    vi.mocked(external.list).mockRejectedValue(
      new Error('Private upstream details'),
    );
    expect(await provider.prove(request)).toEqual({ kind: 'unavailable' });
    expect(external.exchange).not.toHaveBeenCalled();
  });

  it('never accepts an unrelated, multiple, pending or malformed client session as a receipt', async () => {
    const external = gateway('pending');
    const provider = new ClerkInvitationAcceptanceProvider(
      external,
      'test-encryption-secret',
    );
    const session = {
      id: 'sess_one',
      clientId: 'client_private',
      userId: 'user_recipient',
      status: 'active',
    };
    const client = {
      id: 'client_private',
      sessions: [session],
      sessionIds: ['sess_one'],
    };
    for (const value of [
      null,
      { ...client, id: 'client_foreign' },
      { ...client, sessionIds: ['sess_foreign'] },
      { ...client, sessions: [session, session] },
      ...['pending', 'unknown'].map((status) => ({
        ...client,
        sessions: [{ ...session, status }],
      })),
      { ...client, sessions: [{ ...session, userId: 'user_foreign' }] },
      { ...client, sessions: [{ ...session, clientId: 'client_foreign' }] },
    ]) {
      vi.mocked(external.client).mockResolvedValue(value);
      expect(
        await provider.prove({
          ...request,
          context: { clientId: 'client_private', sealedToken: 'private' },
        }),
      ).toEqual({ kind: 'denied' });
    }
    expect(external.exchange).not.toHaveBeenCalled();
  });

  it('rejects a tampered or transferred encrypted context before exchanging any ticket', async () => {
    const external = gateway('pending');
    vi.mocked(external.createClient).mockResolvedValue({
      id: 'client_private',
      token: 'private_initial_bearer',
    });
    vi.mocked(external.client).mockResolvedValue({
      id: 'client_private',
      sessions: [],
      sessionIds: [],
    });
    const provider = new ClerkInvitationAcceptanceProvider(
      external,
      'test-encryption-secret',
    );
    const transferred = await provider.prepare('different_invitation');
    if (!transferred) throw new Error('Missing fixture context.');
    for (const context of [
      transferred,
      { ...transferred, sealedToken: 'tampered' },
    ]) {
      expect(
        await provider.prove({ ...request, ticket: 'opaque_ticket', context }),
      ).toEqual({ kind: 'unavailable' });
    }
    expect(external.exchange).not.toHaveBeenCalled();
  });

  it('bounds an unresponsive provider without leaking payloads', async () => {
    vi.useFakeTimers();
    const external = gateway();
    vi.mocked(external.list).mockImplementation(() => new Promise(() => {}));
    const pending = new ClerkInvitationAcceptanceProvider(
      external,
      'test-encryption-secret',
    ).prove(request);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(await pending).toEqual({ kind: 'unavailable' });
  });
});
