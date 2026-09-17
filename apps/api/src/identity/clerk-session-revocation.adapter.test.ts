import { describe, expect, it, vi } from 'vitest';
import { ClerkSessionRevocationAdapter } from './clerk-session-revocation.adapter.js';

it('revokes every active session of the verified subject, draining page zero before confirming completion', async () => {
  const list = vi
    .fn()
    .mockResolvedValueOnce({
      data: [{ id: 'sess_a', userId: 'user_target', status: 'active' }],
      totalCount: 2,
    })
    .mockResolvedValueOnce({
      data: [{ id: 'sess_b', userId: 'user_target', status: 'active' }],
      totalCount: 1,
    })
    .mockResolvedValueOnce({ data: [], totalCount: 0 });
  const revoke = vi.fn(async (id: string) => ({
    id,
    userId: 'user_target',
    status: 'revoked',
  }));
  const provider = new ClerkSessionRevocationAdapter({ list, revoke });
  expect(
    await provider.revoke({ provider: 'clerk', subject: 'user_target' }),
  ).toEqual({ status: 'complete' });
  expect(revoke.mock.calls).toEqual([['sess_a'], ['sess_b']]);
  expect(list.mock.calls).toEqual(
    Array.from({ length: 3 }, () => [
      { userId: 'user_target', status: 'active', limit: 100, offset: 0 },
    ]),
  );
});

describe('safe provider outcomes', () => {
  it('is safe to repeat after all sessions have ended', async () => {
    const revoke = vi.fn();
    const adapter = new ClerkSessionRevocationAdapter({
      list: async () => ({ data: [], totalCount: 0 }),
      revoke,
    });
    expect(
      await adapter.revoke({ provider: 'clerk', subject: 'user_a' }),
    ).toEqual({ status: 'complete' });
    expect(
      await adapter.revoke({ provider: 'clerk', subject: 'user_a' }),
    ).toEqual({ status: 'complete' });
    expect(revoke).not.toHaveBeenCalled();
  });
  it.each([
    { data: [], totalCount: 1 },
    {
      data: [{ id: 'sess_a', userId: 'other', status: 'active' }],
      totalCount: 1,
    },
    {
      data: [{ id: 'sess_a', userId: 'user_a', status: 'new_unknown_state' }],
      totalCount: 1,
    },
    { data: [], totalCount: '0' },
    null,
  ])(
    'rejects malformed, partial or foreign session listings before revoking',
    async (page) => {
      const revoke = vi.fn();
      const adapter = new ClerkSessionRevocationAdapter({
        list: async () => page,
        revoke,
      });
      expect(
        await adapter.revoke({ provider: 'clerk', subject: 'user_a' }),
      ).toEqual({ status: 'retry_required' });
      expect(revoke).not.toHaveBeenCalled();
    },
  );
  it('never sends an unsupported provider to Clerk', async () => {
    const list = vi.fn();
    const adapter = new ClerkSessionRevocationAdapter({
      list,
      revoke: vi.fn(),
    });
    expect(
      await adapter.revoke({ provider: 'other', subject: 'user_a' }),
    ).toEqual({ status: 'retry_required' });
    expect(list).not.toHaveBeenCalled();
  });
  it('keeps partial failures retryable without returning provider secrets', async () => {
    const revoke = vi
      .fn()
      .mockResolvedValueOnce({ id: 'a', userId: 'user_a', status: 'revoked' })
      .mockRejectedValueOnce(new Error('sensitive provider payload'));
    const adapter = new ClerkSessionRevocationAdapter({
      list: async () => ({
        data: ['a', 'b'].map((id) => ({
          id,
          userId: 'user_a',
          status: 'active',
        })),
        totalCount: 2,
      }),
      revoke,
    });
    expect(
      await adapter.revoke({ provider: 'clerk', subject: 'user_a' }),
    ).toEqual({ status: 'retry_required' });
    expect(revoke).toHaveBeenCalledTimes(2);
  });
  it('rejects a mismatched revocation response', async () => {
    const adapter = new ClerkSessionRevocationAdapter({
      list: async () => ({
        data: [{ id: 'a', userId: 'user_a', status: 'active' }],
        totalCount: 1,
      }),
      revoke: async () => ({ id: 'a', userId: 'other', status: 'revoked' }),
    });
    expect(
      await adapter.revoke({ provider: 'clerk', subject: 'user_a' }),
    ).toEqual({ status: 'retry_required' });
  });
  it('bounds repeated provider pages instead of looping indefinitely', async () => {
    const list = vi.fn(async () => ({
      data: [{ id: 'a', userId: 'user_a', status: 'active' }],
      totalCount: 1,
    }));
    const adapter = new ClerkSessionRevocationAdapter({
      list,
      revoke: async () => ({ id: 'a', userId: 'user_a', status: 'revoked' }),
    });
    expect(
      await adapter.revoke({ provider: 'clerk', subject: 'user_a' }),
    ).toEqual({ status: 'retry_required' });
    expect(list).toHaveBeenCalledTimes(10);
  });
  it('times out without launching more requests after a late provider response', async () => {
    vi.useFakeTimers();
    try {
      let release: (value: unknown) => void = () => undefined;
      const revoke = vi.fn();
      const adapter = new ClerkSessionRevocationAdapter({
        list: () =>
          new Promise((resolve) => {
            release = resolve;
          }),
        revoke,
      });
      const result = adapter.revoke({ provider: 'clerk', subject: 'user_a' });
      await vi.advanceTimersByTimeAsync(10_000);
      expect(await result).toEqual({ status: 'retry_required' });
      release({
        data: [{ id: 'a', userId: 'user_a', status: 'active' }],
        totalCount: 1,
      });
      await vi.runAllTimersAsync();
      expect(revoke).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
  it('reports an unavailable provider without throwing', async () => {
    const adapter = new ClerkSessionRevocationAdapter({
      list: async () => {
        throw new Error('provider unavailable');
      },
      revoke: vi.fn(),
    });
    expect(
      await adapter.revoke({ provider: 'clerk', subject: 'user_a' }),
    ).toEqual({ status: 'retry_required' });
  });
});
