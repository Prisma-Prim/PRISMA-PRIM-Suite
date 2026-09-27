import { Test } from '@nestjs/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  SERVER_CLOCK,
  ServerClockModule,
  type ServerClock,
} from '../clock/server-clock.js';
import { decidePricingRulePublication } from '../pricing-configuration/pricing-rule-version.policy.js';
import { startDemonstrationApplication } from './demonstration-application.js';
import {
  DemonstrationSeedIdentity,
  ProviderCallLedger,
  failClosedProviderAdapters,
} from './demonstration-identity.js';
import {
  DEMONSTRATION_PERSONAS,
  DEMONSTRATION_SCENARIO,
} from './demonstration-scenario.js';

// Port 9 (discard) never serves PostgreSQL. Authentication is decided before
// any query, so the composition is observable without a database.
const UNREACHABLE_DATABASE_URL =
  'postgresql://unused:unused@127.0.0.1:9/never_test';
const OWNER = {
  provider: 'local-demo',
  subject: 'local-demonstration-user',
  displayName: 'Operator',
  email: 'operator@example.test',
};
const DETERMINISTIC_HEADERS = {
  'x-test-external-provider': OWNER.provider,
  'x-test-external-subject': OWNER.subject,
  'x-test-display-name': OWNER.displayName,
  'x-test-email': OWNER.email,
};

const originalMode = process.env.ACCESS_IDENTITY_MODE;
const originalNodeEnvironment = process.env.NODE_ENV;

afterEach(() => {
  vi.useRealTimers();
  process.env.ACCESS_IDENTITY_MODE = originalMode;
  process.env.NODE_ENV = originalNodeEnvironment;
  if (originalMode === undefined) delete process.env.ACCESS_IDENTITY_MODE;
  if (originalNodeEnvironment === undefined) delete process.env.NODE_ENV;
});

describe('demonstration application composition', () => {
  it('keeps the run instant isolated while the normal clock still rejects an expired pricing start', async () => {
    vi.setSystemTime(new Date('2026-09-26T12:00:00.000Z'));
    const identity = new DemonstrationSeedIdentity({
      token: 's'.repeat(43),
      owner: OWNER,
      personas: DEMONSTRATION_PERSONAS,
    });
    const application = await startDemonstrationApplication({
      databaseUrl: UNREACHABLE_DATABASE_URL,
      bootstrap: {
        provider: OWNER.provider,
        subject: OWNER.subject,
        workspaceId: '00000000-0000-4000-8000-000000000409',
        workspaceName: 'PRISMA DEMO Workspace',
      },
      identity,
      providers: failClosedProviderAdapters(new ProviderCallLedger()),
      scenario: DEMONSTRATION_SCENARIO,
    });
    const normal = await Test.createTestingModule({
      imports: [ServerClockModule],
    }).compile();
    try {
      vi.setSystemTime(new Date('2026-09-26T12:01:00.000Z'));
      const command = {
        label: 'DEMO illustrative rule v1',
        effectiveFrom: new Date('2026-09-26T12:00:01.000Z'),
        effectiveTo: null,
        expectedActiveVersionNumber: null,
      };
      expect(
        decidePricingRulePublication({
          head: undefined,
          command,
          now: application.now(),
        }),
      ).toMatchObject({ kind: 'publish', versionNumber: 1 });
      expect(
        decidePricingRulePublication({
          head: undefined,
          command,
          now: normal.get<ServerClock>(SERVER_CLOCK).now(),
        }),
      ).toEqual({ kind: 'rejected', code: 'EFFECTIVE_FROM_PAST' });
    } finally {
      await normal.close();
      await application.close();
    }
  });

  it('listens on loopback, accepts only the seed principals and never calls a provider', async () => {
    // An operator environment that would enable deterministic headers.
    process.env.NODE_ENV = 'test';
    process.env.ACCESS_IDENTITY_MODE = 'test';
    const ledger = new ProviderCallLedger();
    const identity = new DemonstrationSeedIdentity({
      token: 's'.repeat(43),
      owner: OWNER,
      personas: DEMONSTRATION_PERSONAS,
    });
    const application = await startDemonstrationApplication({
      databaseUrl: UNREACHABLE_DATABASE_URL,
      bootstrap: {
        provider: OWNER.provider,
        subject: OWNER.subject,
        workspaceId: '00000000-0000-4000-8000-000000000409',
        workspaceName: 'PRISMA DEMO Workspace',
      },
      identity,
      providers: failClosedProviderAdapters(ledger),
      scenario: DEMONSTRATION_SCENARIO,
    });
    const status = async (
      path: string,
      headers: Record<string, string>,
      method = 'GET',
    ) =>
      (
        await fetch(`${application.origin}/api${path}`, {
          method,
          headers: { ...headers, 'content-type': 'application/json' },
          body: method === 'GET' ? undefined : '{}',
        })
      ).status;
    try {
      expect(new URL(application.origin).hostname).toBe('127.0.0.1');
      expect(process.env.ACCESS_IDENTITY_MODE).toBeUndefined();
      expect(await status('/health', {})).toBe(200);
      expect(await status('/access/current-actor', DETERMINISTIC_HEADERS)).toBe(
        401,
      );
      expect(
        await status(
          '/access/invitations/accept',
          DETERMINISTIC_HEADERS,
          'POST',
        ),
      ).toBe(401);
      expect(
        await status('/companies', {
          ...identity.headersFor({ kind: 'owner' }),
          'x-demonstration-seed-token': 't'.repeat(43),
        }),
      ).toBe(401);
      // A seed principal passes authentication and reaches the application,
      // which then fails on the unreachable database.
      expect(
        await status(
          '/access/current-actor',
          identity.headersFor({ kind: 'owner' }),
        ),
      ).toBe(500);
      expect(ledger.attempts).toBe(0);
    } finally {
      await application.close();
    }
    expect(process.env.ACCESS_IDENTITY_MODE).toBe('test');
  }, 60_000);
});
