import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { randomUUID } from 'node:crypto';
import { expect } from 'vitest';
import { createIsolatedPostgresTestDatabase } from '../database/isolated-postgres-test-database.js';
import { createPostgresRestTestHarness } from '../database/postgres-rest-test-harness.js';
import type { ServerClock } from '../clock/server-clock.js';

export const ESTIMATE_OFFER_WORKSPACE = '00000000-0000-4000-8000-000000000842';
export const ESTIMATE_OFFER_OWNER = memberHeaders('estimate-offer-owner');
export const ESTIMATE_OFFER_PREPARER = memberHeaders('estimate-offer-preparer');
export const ESTIMATE_OFFER_DIRECTOR = memberHeaders('estimate-offer-director');
export const ESTIMATE_OFFER_READER = memberHeaders('estimate-offer-reader');

// Public business commands use only isolated PostgreSQL and synthetic identities,
// prices and labels. The deterministic identity provider is the external seam.
export async function openEstimateOfferFixture(
  options: {
    migrationsFolder?: string;
    legacyPreparer?: boolean;
    historicalOfferCaptures?: { preparer: 'v1' | 'v2'; approver: 'v1' };
    serverClock?: ServerClock;
  } = {},
) {
  const baseDatabaseUrl = process.env.TEST_DATABASE_URL;
  if (!baseDatabaseUrl) throw new Error('TEST_DATABASE_URL is required.');
  const database = await createIsolatedPostgresTestDatabase({
    baseDatabaseUrl,
    namePrefix: 'estimate_offer',
  });
  const startHarness = () =>
    createPostgresRestTestHarness({
      databaseUrl: database.targetUrl,
      migrationsFolder: options.migrationsFolder,
      serverClock: options.serverClock ?? {
        now: () => new Date('2026-10-24T09:00:00.000Z'),
      },
      environment: {
        NODE_ENV: 'test',
        ACCESS_IDENTITY_MODE: 'test',
        ACCESS_BOOTSTRAP_EXTERNAL_PROVIDER: 'deterministic-test',
        ACCESS_BOOTSTRAP_EXTERNAL_SUBJECT: 'estimate-offer-owner',
        ACCESS_BOOTSTRAP_WORKSPACE_ID: ESTIMATE_OFFER_WORKSPACE,
        ACCESS_BOOTSTRAP_WORKSPACE_NAME: 'Synthetic internal Offer Workspace',
        ACCESS_ACCEPTED_INVITATIONS_JSON: JSON.stringify(
          [
            'estimate-offer-preparer',
            'estimate-offer-director',
            'estimate-offer-reader',
          ].map((subject) => ({
            provider: 'deterministic-test',
            subject,
            workspaceId: ESTIMATE_OFFER_WORKSPACE,
          })),
        ),
      },
    });
  let harness: Awaited<ReturnType<typeof startHarness>>;
  try {
    harness = await startHarness();
  } catch (error) {
    await database.close();
    throw error;
  }

  async function request({
    path,
    companyId,
    headers = ESTIMATE_OFFER_OWNER,
    init = {},
  }: {
    path: string;
    companyId?: string;
    headers?: Readonly<Record<string, string>>;
    init?: RequestInit;
  }) {
    return fetch(`${harness.origin}/api${path}`, {
      ...init,
      headers: {
        ...headers,
        'x-workspace-context-id': ESTIMATE_OFFER_WORKSPACE,
        ...(companyId ? { 'x-company-context-id': companyId } : {}),
        ...Object.fromEntries(new Headers(init.headers).entries()),
      },
    });
  }

  async function post(options: {
    path: string;
    companyId?: string;
    headers?: Readonly<Record<string, string>>;
    body: unknown;
    key?: string;
  }) {
    return request({
      ...options,
      init: {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'idempotency-key': options.key ?? randomUUID(),
        },
        body: JSON.stringify(options.body),
      },
    });
  }

  async function command(options: Parameters<typeof post>[0]) {
    const response = await post(options);
    const value: unknown = await response.json();
    expect({
      path: options.path,
      status: response.status,
      value,
    }).toMatchObject({
      status: 201,
    });
    return value;
  }

  async function read(options: Parameters<typeof request>[0]) {
    const response = await request(options);
    const value: unknown = await response.json();
    expect({
      path: options.path,
      status: response.status,
      value,
    }).toMatchObject({
      status: 200,
    });
    return value;
  }

  async function grant(options: {
    path: string;
    companyId: string;
    membershipId: string;
  }) {
    return command({
      path: options.path,
      body: {
        companyId: options.companyId,
        workspaceMembershipId: options.membershipId,
      },
    });
  }

  // Genuine old-schema fixtures seed only their explicit historical captures.
  // Runtime grants still use the live public endpoint and current default.
  async function seedHistoricalCapture(input: {
    companyId: string;
    membershipId: string;
    bundle: 'company_offer_preparer' | 'company_offer_approver';
    version: 'v1' | 'v2';
  }) {
    const owner = responseRecord(await read({ path: '/access/current-actor' }));
    await harness.pool.query(
      `WITH assignment AS (
      INSERT INTO company_role_assignments (workspace_id,company_id,workspace_membership_id,bundle,permission_set_version)
      VALUES ($1,$2,$3,$5,$6) RETURNING id
    ) INSERT INTO company_context_assignment_commands (workspace_id,actor_workspace_membership_id,bundle,idempotency_key,operation,target_workspace_membership_id,company_id,result_assignment_id)
      SELECT $1,$4,$5,$7,'grant',$3,$2,id FROM assignment`,
      [
        ESTIMATE_OFFER_WORKSPACE,
        input.companyId,
        input.membershipId,
        responseString(owner, 'workspaceMembershipId'),
        input.bundle,
        input.version,
        'historical-' + input.bundle,
      ],
    );
  }

  async function prepare(input: { clientTaxId?: string } = {}) {
    const company = responseRecord(
      await command({
        path: '/companies',
        body: { displayName: 'Synthetic internal Offer Company' },
      }),
    );
    const companyId = responseString(company, 'id');
    const identities: Record<string, unknown>[] = [];
    for (const headers of [
      ESTIMATE_OFFER_PREPARER,
      ESTIMATE_OFFER_DIRECTOR,
      ESTIMATE_OFFER_READER,
    ])
      identities.push(
        responseRecord(await read({ path: '/access/current-actor', headers })),
      );
    const [preparer, director, reader] = identities;
    if (!preparer || !director || !reader)
      throw new Error('Synthetic membership fixture is incomplete.');
    const preparerMembershipId = responseString(
      preparer,
      'workspaceMembershipId',
    );
    const directorMembershipId = responseString(
      director,
      'workspaceMembershipId',
    );
    const readerMembershipId = responseString(reader, 'workspaceMembershipId');
    for (const membershipId of [
      preparerMembershipId,
      directorMembershipId,
      readerMembershipId,
    ])
      for (const path of [
        '/company-context-assignments',
        '/company-commercial-intake-assignments',
      ])
        await grant({ path, companyId, membershipId });
    for (const path of [
      '/company-director-client-assignments',
      '/company-offer-preparer-assignments',
      '/company-profitability-contributor-assignments',
    ])
      if (
        !options.legacyPreparer ||
        path !== '/company-offer-preparer-assignments'
      )
        if (
          path === '/company-offer-preparer-assignments' &&
          options.historicalOfferCaptures
        )
          await seedHistoricalCapture({
            companyId,
            membershipId: preparerMembershipId,
            bundle: 'company_offer_preparer',
            version: options.historicalOfferCaptures.preparer,
          });
        else
          await grant({ path, companyId, membershipId: preparerMembershipId });
    if (options.legacyPreparer) {
      // A genuine pre-0078 assignment and receipt, seeded under the old CHECK.
      const owner = responseRecord(
        await read({ path: '/access/current-actor' }),
      );
      await harness.pool.query(
        `WITH assignment AS (
        INSERT INTO company_role_assignments (workspace_id,company_id,workspace_membership_id,bundle,permission_set_version)
        VALUES ($1,$2,$3,'company_offer_preparer','v1') RETURNING id
      ) INSERT INTO company_context_assignment_commands (workspace_id,actor_workspace_membership_id,bundle,idempotency_key,operation,target_workspace_membership_id,company_id,result_assignment_id)
        SELECT $1,$4,'company_offer_preparer','legacy-preparer-grant','grant',$3,$2,id FROM assignment`,
        [
          ESTIMATE_OFFER_WORKSPACE,
          companyId,
          preparerMembershipId,
          responseString(owner, 'workspaceMembershipId'),
        ],
      );
    }
    await grant({
      path: '/company-profitability-director-assignments',
      companyId,
      membershipId: directorMembershipId,
    });
    if (options.historicalOfferCaptures)
      await seedHistoricalCapture({
        companyId,
        membershipId: readerMembershipId,
        bundle: 'company_offer_approver',
        version: options.historicalOfferCaptures.approver,
      });
    else
      await grant({
        path: '/company-offer-approver-assignments',
        companyId,
        membershipId: readerMembershipId,
      });
    const client = responseRecord(
      await command({
        path: '/clients',
        companyId,
        headers: ESTIMATE_OFFER_PREPARER,
        body: {
          displayName: 'Synthetic internal Offer Client',
          taxId: input.clientTaxId ?? 'SYNTHETIC-842',
          address: '842 Example Street',
        },
      }),
    );
    const clientId = responseString(client, 'id');
    const intake = responseRecord(
      await command({
        path: '/commercial-intake/requests',
        companyId,
        headers: ESTIMATE_OFFER_PREPARER,
        body: {
          clientAccountId: clientId,
          originalText: 'Synthetic Request with no real customer facts.',
          subject: 'Synthetic approved-price handoff',
          sourceLabel: 'Synthetic REST proof',
          opportunity: {
            title: 'Synthetic internal Offer',
            scope: 'Synthetic scope',
            nextAction: 'Prepare an internal Offer from an approved estimate',
          },
        },
      }),
    );
    const opportunityId = responseString(
      responseRecord(intake.initialOpportunity),
      'id',
    );
    const source = responseRecord(
      await command({
        path: `/opportunities/${opportunityId}/profitability-estimates`,
        companyId,
        headers: ESTIMATE_OFFER_PREPARER,
        body: estimateSubmission(),
      }),
    );
    const estimateVersionId = responseString(source, 'id');
    const versionPath = `/opportunities/${opportunityId}/profitability-estimates/versions/${estimateVersionId}`;
    await command({
      path: `${versionPath}/decision`,
      companyId,
      headers: ESTIMATE_OFFER_DIRECTOR,
      body: {
        expectedVersionNumber: 1,
        expectedDecision: null,
        code: 'APPROVE',
      },
    });
    const approved = responseRecord(
      await read({
        path: versionPath,
        companyId,
        headers: ESTIMATE_OFFER_PREPARER,
      }),
    );
    return {
      companyId,
      clientId,
      opportunityId,
      preparerMembershipId,
      directorMembershipId,
      readerMembershipId,
      estimateId: responseString(source, 'estimateId'),
      estimateVersionId,
      estimateVersionNumber: 1,
      approvalDecisionId: responseString(
        responseRecord(approved.decision),
        'id',
      ),
    };
  }

  async function illustrativeSnapshot(
    source: {
      companyId: string;
      opportunityId: string;
      preparerMembershipId: string;
    },
    adjusted = false,
  ): Promise<Record<string, unknown> & { catalogue: Record<string, unknown> }> {
    for (const path of [
      '/company-service-catalogue-assignments',
      '/company-pricing-configuration-assignments',
      '/company-pricing-user-assignments',
      ...(adjusted ? ['/company-pricing-adjustment-assignments'] : []),
    ])
      await grant({
        path,
        companyId: source.companyId,
        membershipId: source.preparerMembershipId,
      });
    const invoke = (path: string, body: unknown) =>
      command({
        path,
        companyId: source.companyId,
        headers: ESTIMATE_OFFER_PREPARER,
        body,
      });
    const rule = responseRecord(
      await invoke('/pricing-configuration/rule-versions', {
        label: 'Synthetic rule',
        effectiveFrom: '2026-10-24T09:00:00.000Z',
        expectedActiveVersionNumber: null,
      }),
    );
    const definition = responseRecord(
      responseRecord(
        await invoke('/commercial-catalogue/service-definitions', {
          code: 'SYNTHETIC-842',
          name: 'Synthetic service',
          description: null,
        }),
      ).definition,
    );
    const offering = responseRecord(
      responseRecord(
        await invoke('/commercial-catalogue/offerings', {
          serviceDefinitionId: definition.id,
          commercialLabel: null,
        }),
      ).offering,
    );
    const tariff = responseRecord(
      await invoke(
        `/pricing-configuration/offerings/${offering.id}/tariff-versions`,
        {
          unit: 'synthetic-unit',
          unitAmount: '300.0000',
          currency: 'EUR',
          taxRatePercent: '15.00',
          taxLabel: 'Illustrative tax',
          effectiveFrom: '2026-10-24T09:00:00.000Z',
          expectedActiveVersionNumber: null,
        },
      ),
    );
    const snapshot = responseRecord(
      await invoke(`/pricing/opportunities/${source.opportunityId}/snapshots`, {
        pricingRuleVersionNumber: responseRecord(rule.version).versionNumber,
        lines: [
          {
            offeringId: offering.id,
            tariffVersionNumber: responseRecord(tariff.version).versionNumber,
            quantity: '1',
            ...(adjusted
              ? {
                  adjustment: {
                    type: 'FIXED_NET_DISCOUNT',
                    netReduction: '10.00',
                    reason: 'Synthetic fixed reduction',
                  },
                }
              : {}),
          },
        ],
      }),
    );
    return {
      ...snapshot,
      catalogue: {
        ruleVersionNumber: responseRecord(rule.version).versionNumber,
        offeringId: offering.id,
        tariffVersionNumber: responseRecord(tariff.version).versionNumber,
      },
    };
  }

  return {
    get pool() {
      return harness.pool;
    },
    async restart() {
      await harness.close();
      harness = await startHarness();
    },
    async applyCurrentMigrations() {
      await migrate(drizzle(harness.pool), { migrationsFolder: './drizzle' });
    },
    get origin() {
      return harness.origin;
    },
    request,
    post,
    command,
    read,
    grant,
    prepare,
    illustrativeSnapshot,
    async reset() {
      await harness.pool.query(
        'TRUNCATE activity_log_events, workspace_memberships, internal_users, workspaces CASCADE',
      );
    },
    async close() {
      await harness.close();
      await database.close();
    },
  };
}

export function estimateSubmission() {
  return {
    expectedLatestVersionNumber: null,
    currency: 'EUR',
    executorType: 'PATENT_CONSULTANT',
    executorCost: '70.00',
    fiscalCost: '10.00',
    allocatedOverhead: '10.00',
    directCosts: [
      {
        key: 'travel',
        category: 'TRAVEL',
        label: 'Synthetic internal travel',
        amount: '10.00',
        currency: 'EUR',
      },
    ],
    targetProfitability: '20',
    proposedPrice: '125.00',
    pricingIntent: { kind: 'ORDINARY' },
    costConfirmation: true,
  };
}

export function responseRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new Error('Expected an object response.');
  return Object.fromEntries(Object.entries(value));
}

export function responseString(value: Record<string, unknown>, key: string) {
  const field = value[key];
  if (typeof field !== 'string') throw new Error(`Expected ${key}.`);
  return field;
}

function memberHeaders(subject: string): Record<string, string> {
  return {
    'x-test-external-provider': 'deterministic-test',
    'x-test-external-subject': subject,
    'x-test-display-name': subject,
    'x-test-email': `${subject}@example.test`,
  };
}

export function estimateOfferIntent(source: {
  estimateVersionId: string;
  estimateVersionNumber: number;
}) {
  return {
    estimateVersionId: source.estimateVersionId,
    estimateVersionNumber: source.estimateVersionNumber,
    recipient: { kind: 'PRIMARY' },
    validityDays: 30,
    scopeNote: 'Synthetic literal scope',
    commercialConditions: null,
  };
}
