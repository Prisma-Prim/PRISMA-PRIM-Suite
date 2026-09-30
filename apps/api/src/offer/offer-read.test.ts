import { Client, Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { describe, expect, it } from 'vitest';
import type { ActorContext } from '../access/access.types.js';
import { CompanyContextAuthorization } from '../access/company-context-authorization.js';
import { CommercialResponsibleAccessService } from '../access/commercial-responsible-access.service.js';
import { AccountabilityService } from '../accountability/accountability.service.js';
import { ClientOperationalReferenceService } from '../client/client-operational-reference.service.js';
import { CommercialCatalogueService } from '../commercial-catalogue/commercial-catalogue.service.js';
import { CommercialIntakeService } from '../commercial-intake/commercial-intake.service.js';
import { DatabaseContext } from '../database/database-context.js';
import { PricingSnapshotService } from '../pricing-configuration/pricing-snapshot.service.js';
import { OfferService } from './offer.service.js';

const opportunityId = '00000000-0000-4000-8000-000000000003';
const actor: ActorContext = {
  internalUserId: '00000000-0000-4000-8000-000000000001',
  workspaceMembershipId: '00000000-0000-4000-8000-000000000002',
  workspaceId: '00000000-0000-4000-8000-000000000456',
  workspaceName: 'Synthetic Workspace',
  displayName: 'Synthetic Reader',
  email: 'reader@example.test',
  active: true,
  workspacePermissions: [],
  activeCompany: {
    id: '00000000-0000-4000-8000-000000000004',
    displayName: 'Synthetic Company',
    clientPermissions: [],
    offerPermissions: ['commercial.offer.read'],
    commercialIntakePermissions: [
      'commercial.request.read',
      'commercial.opportunity.read',
    ],
  },
};

describe('Offer read transaction recovery', () => {
  it('restarts the whole coherent read after a serialization failure', async () => {
    const fixture = reader({ failures: 1, code: '40001' });
    await expect(
      fixture.service.read(actor, opportunityId),
    ).resolves.toBeNull();
    expect(fixture.transactions()).toEqual([
      'begin isolation level repeatable read',
      'rollback',
      'begin isolation level repeatable read',
      'commit',
    ]);
  });

  it('denies the retried read when current Offer authority was revoked', async () => {
    const fixture = reader({
      failures: 1,
      code: '40001',
      revokeAfterFailure: true,
    });
    await expect(
      fixture.service.read(actor, opportunityId),
    ).rejects.toMatchObject({ status: 403 });
    expect(fixture.transactions()).toEqual([
      'begin isolation level repeatable read',
      'rollback',
      'begin isolation level repeatable read',
      'rollback',
    ]);
  });

  it('stops after three failed read attempts and releases each transaction', async () => {
    const fixture = reader({ failures: 10, code: '40001' });
    await expect(
      fixture.service.read(actor, opportunityId),
    ).rejects.toMatchObject({ cause: { code: '40001' } });
    expect(fixture.transactions()).toEqual(
      Array.from({ length: 3 }, () => [
        'begin isolation level repeatable read',
        'rollback',
      ]).flat(),
    );
  });

  it('does not retry a different database failure', async () => {
    const fixture = reader({ failures: 1, code: '08006' });
    await expect(
      fixture.service.read(actor, opportunityId),
    ).rejects.toMatchObject({ cause: { code: '08006' } });
    expect(fixture.transactions()).toEqual([
      'begin isolation level repeatable read',
      'rollback',
    ]);
  });
});

// Substitute only the PostgreSQL driver boundary. Drizzle, DatabaseContext,
// Offer and its authorization/read collaborators are the real implementations.
function reader({
  failures,
  code,
  revokeAfterFailure = false,
}: {
  failures: number;
  code: string;
  revokeAfterFailure?: boolean;
}) {
  const pool = new Pool();
  const client = Object.assign(new Client(), { release: () => undefined });
  const transactions: string[] = [];
  let revoked = false;
  async function query(config: unknown) {
    const text =
      typeof config === 'string'
        ? config
        : typeof config === 'object' &&
            config !== null &&
            'text' in config &&
            typeof config.text === 'string'
          ? config.text
          : undefined;
    if (!text) throw new Error('Expected a PostgreSQL query.');
    if (/^(begin|commit|rollback)/u.test(text)) {
      transactions.push(text);
      return { rows: [] };
    }
    if (text.includes('from "company_role_assignments"')) {
      if (text.endsWith('for share') && failures > 0) {
        failures -= 1;
        revoked = revokeAfterFailure;
        throw Object.assign(new Error('Synthetic database failure'), { code });
      }
      return { rows: revoked ? [] : [['assignment']] };
    }
    if (text.includes('from "opportunities"'))
      return { rows: [[opportunityId, 'request', null, 'OPEN']] };
    if (text.includes('from "offers"')) return { rows: [] };
    throw new Error('Unexpected query at the synthetic PostgreSQL boundary.');
  }
  Object.defineProperty(pool, 'connect', { value: async () => client });
  Object.defineProperty(pool, 'query', { value: query });
  Object.defineProperty(client, 'query', { value: query });
  const context = new DatabaseContext(drizzle(pool));
  const authorization = new CompanyContextAuthorization(context);
  const accountability = new AccountabilityService(context);
  const clients = new ClientOperationalReferenceService(context);
  const catalogue = new CommercialCatalogueService(context, authorization);
  const intake = new CommercialIntakeService(
    context,
    authorization,
    clients,
    accountability,
    new CommercialResponsibleAccessService(context),
  );
  const clock = { now: () => new Date('2026-09-30T12:00:00Z') };
  const pricing = new PricingSnapshotService(
    context,
    authorization,
    catalogue,
    intake,
    accountability,
    clock,
  );
  return {
    service: new OfferService(
      context,
      authorization,
      accountability,
      clients,
      intake,
      pricing,
      clock,
    ),
    transactions: () => transactions,
  };
}
