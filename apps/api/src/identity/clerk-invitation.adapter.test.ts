import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ClerkAPIResponseError } from '@clerk/backend/errors';
import {
  ClerkInvitationProvider,
  type InvitationGateway,
} from './clerk-invitation.adapter.js';

const intent = {
  reference: 'local-reference',
  email: 'recipient@example.test',
  expiresInDays: 7,
};
function invitation(overrides: Record<string, unknown> = {}) {
  return {
    id: 'inv_test',
    emailAddress: intent.email,
    publicMetadata: { workspaceInvitationReference: intent.reference },
    status: 'pending',
    ...overrides,
  };
}
function gateway(): InvitationGateway {
  return {
    create: vi.fn().mockResolvedValue(invitation()),
    list: vi.fn().mockResolvedValue({ data: [], totalCount: 0 }),
    revoke: vi.fn().mockResolvedValue(invitation({ status: 'revoked' })),
  };
}

describe('Clerk invitation provider', () => {
  beforeEach(() => vi.stubEnv('WEB_ORIGIN', 'http://localhost:5173'));
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it('bounds an unresponsive provider and ignores a late successful response', async () => {
    vi.useFakeTimers();
    const external = gateway();
    let finish: ((value: unknown) => void) | undefined;
    vi.mocked(external.create).mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const result = new ClerkInvitationProvider(external).issue(intent);
    await vi.advanceTimersByTimeAsync(10_000);
    await expect(result).resolves.toEqual({ kind: 'uncertain' });
    finish?.(invitation({ url: 'https://secret.example.test/token' }));
    await expect(result).resolves.toEqual({ kind: 'uncertain' });
    expect(external.create).toHaveBeenCalledTimes(1);
  });

  it('reports a definitive rejection without returning provider payloads', async () => {
    const external = gateway();
    vi.mocked(external.create).mockRejectedValue(
      new ClerkAPIResponseError('private payload', { status: 422, data: [] }),
    );
    await expect(
      new ClerkInvitationProvider(external).issue(intent),
    ).resolves.toEqual({ kind: 'rejected' });
  });

  it('reconciles a revoked invitation without calling revoke twice', async () => {
    const external = gateway();
    vi.mocked(external.list).mockImplementation(async (parameters) => ({
      data:
        parameters?.status === 'revoked'
          ? [invitation({ status: 'revoked', url: 'secret' })]
          : [],
      totalCount: parameters?.status === 'revoked' ? 1 : 0,
    }));
    await expect(
      new ClerkInvitationProvider(external).revoke(intent),
    ).resolves.toEqual({
      ...{ kind: 'confirmed', providerId: 'inv_test' },
      status: 'revoked',
    });
    expect(external.revoke).not.toHaveBeenCalled();
  });

  it('fails closed on incomplete pages, conflicting provider IDs and malformed statuses', async () => {
    const external = gateway();
    const provider = new ClerkInvitationProvider(external);
    for (const page of [
      { data: [invitation()], totalCount: 101 },
      {
        data: [invitation(), invitation({ id: 'inv_duplicate' })],
        totalCount: 2,
      },
      { data: [invitation({ status: 'unknown' })], totalCount: 1 },
    ]) {
      vi.mocked(external.list).mockResolvedValue(page);
      await expect(provider.inspect(intent)).resolves.toEqual({
        kind: 'uncertain',
      });
    }
    expect(external.create).not.toHaveBeenCalled();
  });
  it('sends one correlated invitation without granting authority or returning its secret URL', async () => {
    const external = gateway();
    const provider = new ClerkInvitationProvider(external);
    await expect(provider.issue(intent)).resolves.toEqual({
      kind: 'confirmed',
      providerId: 'inv_test',
      status: 'pending',
    });
    expect(external.create).toHaveBeenCalledExactlyOnceWith({
      emailAddress: intent.email,
      expiresInDays: 7,
      ignoreExisting: true,
      redirectUrl:
        'http://localhost:5173/accept-invitation?invitation=local-reference',
      notify: true,
      publicMetadata: { workspaceInvitationReference: intent.reference },
    });
  });

  it('treats a timeout as uncertain and never repeats an external send', async () => {
    const external = gateway();
    vi.mocked(external.create).mockRejectedValue(
      new Error('secret provider payload'),
    );
    const provider = new ClerkInvitationProvider(external);
    await expect(provider.issue(intent)).resolves.toEqual({
      kind: 'uncertain',
    });
    expect(external.create).toHaveBeenCalledTimes(1);
  });

  it('matches the opaque reference, never email alone, when reconciling', async () => {
    const external = gateway();
    vi.mocked(external.list).mockResolvedValue({
      data: [
        invitation({
          publicMetadata: { workspaceInvitationReference: 'foreign-reference' },
        }),
      ],
      totalCount: 1,
    });
    await expect(
      new ClerkInvitationProvider(external).inspect(intent),
    ).resolves.toEqual({ kind: 'uncertain' });
    expect(external.create).not.toHaveBeenCalled();
  });
});
