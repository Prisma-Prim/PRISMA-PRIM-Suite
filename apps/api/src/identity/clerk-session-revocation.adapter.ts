import { createClerkClient } from '@clerk/backend';
import { Injectable, Optional } from '@nestjs/common';
import type {
  IdentitySessionRevoker,
  SessionRevocationOutcome,
} from '../access/identity-session-revoker.js';

export interface ClerkSessionGateway {
  list(input: {
    userId: string;
    status: 'active';
    limit: number;
    offset: number;
  }): Promise<unknown>;
  revoke(sessionId: string): Promise<unknown>;
}

function productionGateway(): ClerkSessionGateway {
  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey) throw new Error('Session revocation is not configured.');
  const client = createClerkClient({ secretKey });
  return {
    list: (input) => client.sessions.getSessionList(input),
    revoke: (id) => client.sessions.revokeSession(id),
  };
}

@Injectable()
export class ClerkSessionRevocationAdapter implements IdentitySessionRevoker {
  constructor(@Optional() private readonly gateway?: ClerkSessionGateway) {}

  async revoke(identity: {
    provider: string;
    subject: string;
  }): Promise<SessionRevocationOutcome> {
    if (identity.provider !== 'clerk' || !identity.subject.trim())
      return { status: 'retry_required' };
    const deadline = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const timeout = new Promise<SessionRevocationOutcome>((resolve) => {
        timer = setTimeout(() => {
          deadline.abort();
          resolve({ status: 'retry_required' });
        }, 10_000);
      });
      return await Promise.race([
        this.drain(identity.subject, deadline.signal),
        timeout,
      ]);
    } catch {
      return { status: 'retry_required' };
    } finally {
      deadline.abort();
      clearTimeout(timer);
    }
  }

  private async drain(
    subject: string,
    signal: AbortSignal,
  ): Promise<SessionRevocationOutcome> {
    const gateway = this.gateway ?? productionGateway();
    // Always drain page zero: revocation shrinks the active result set, so an
    // increasing offset would skip sessions. Each attempt is bounded and resumable.
    for (let batch = 0; batch < 10; batch += 1) {
      if (signal.aborted) return { status: 'retry_required' };
      const page = await gateway.list({
        userId: subject,
        status: 'active',
        limit: 100,
        offset: 0,
      });
      if (signal.aborted) return { status: 'retry_required' };
      if (
        !isRecord(page) ||
        !Array.isArray(page.data) ||
        !Number.isSafeInteger(page.totalCount) ||
        typeof page.totalCount !== 'number' ||
        page.totalCount < page.data.length ||
        page.data.length > 100
      )
        return { status: 'retry_required' };
      if (page.totalCount === 0) return { status: 'complete' };
      if (page.data.length === 0) return { status: 'retry_required' };
      const sessions: string[] = [];
      for (const item of page.data) {
        if (
          !isRecord(item) ||
          typeof item.id !== 'string' ||
          !item.id ||
          item.userId !== subject ||
          item.status !== 'active' ||
          sessions.includes(item.id)
        )
          return { status: 'retry_required' };
        sessions.push(item.id);
      }
      for (const id of sessions) {
        if (signal.aborted) return { status: 'retry_required' };
        const result = await gateway.revoke(id);
        if (
          signal.aborted ||
          !isRecord(result) ||
          result.id !== id ||
          result.userId !== subject ||
          typeof result.status !== 'string' ||
          ![
            'revoked',
            'ended',
            'expired',
            'abandoned',
            'removed',
            'replaced',
          ].includes(result.status)
        )
          return { status: 'retry_required' };
      }
    }
    return { status: 'retry_required' };
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
