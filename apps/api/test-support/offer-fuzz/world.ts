import { randomUUID } from 'node:crypto';
import {
  createIsolatedPostgresTestDatabase,
  type IsolatedPostgresTestDatabase,
} from '../../src/database/isolated-postgres-test-database.js';
import {
  createPostgresRestTestHarness,
  type PostgresRestTestHarness,
} from '../../src/database/postgres-rest-test-harness.js';
import {
  canonical,
  InvariantViolation as ModelInvariantViolation,
  readReply,
  short,
  type Reply,
} from '../model-fuzz/checks.js';

/** Offer invariants. Authority: commercial workflow §18. */
export const INVARIANTS = {
  'company-isolation':
    'An Offer read stays inside the selected Company (ADR 0006).',
  'identical-denial':
    'A foreign or hidden Offer gets the same safe answer as a missing one.',
  'revocation-denies':
    'After a revocation, the next command that needed the capture is refused, with no effect.',
  'command-authority':
    'Preparation and transmission need Offer Preparer. Approval and the Client response need Offer Approver.',
  'history-once':
    'Each successful command adds its history facts. A refusal, a stale revision or a replay adds none.',
  'revisions-grow':
    'The Offer revision only grows. A stale expected revision is refused.',
  'step-order':
    'Transmission waits for approval. A Client response waits for transmission. A second decision or transmission is refused.',
  'replay-receipt':
    'The exact replay of a committed key returns the saved result. The same key with another body conflicts.',
  'model-agreement':
    'Every other answer is the outcome the Offer rules predict.',
} as const;
export type Invariant = keyof typeof INVARIANTS;
export class InvariantViolation extends ModelInvariantViolation<Invariant> {}

export const COMPANIES = ['A', 'B'] as const;
export type CompanyKey = (typeof COMPANIES)[number];
export const MEMBERS = ['ana', 'bogdan', 'cora'] as const;
export type MemberKey = (typeof MEMBERS)[number];
export const BUNDLES = ['preparer', 'approver'] as const;
export type Bundle = (typeof BUNDLES)[number];
export type Actor = MemberKey | 'owner';
export const MISSING_ID = '00000000-0000-4000-8000-000000001259';
const SUBJECTS: Record<Actor, string> = {
  owner: 'workspace-owner',
  ana: 'offer-ana',
  bogdan: 'offer-bogdan',
  cora: 'offer-cora',
};
const BUNDLE_PATH: Record<Bundle, string> = {
  preparer: '/company-offer-preparer-assignments',
  approver: '/company-offer-approver-assignments',
};
const BUNDLE_DB: Record<Bundle, string> = {
  preparer: 'company_offer_preparer',
  approver: 'company_offer_approver',
};
const INITIAL: Record<MemberKey, Record<CompanyKey, readonly Bundle[]>> = {
  ana: { A: ['preparer', 'approver'], B: ['preparer'] },
  bogdan: { A: ['approver'], B: ['preparer', 'approver'] },
  cora: { A: ['preparer'], B: ['approver'] },
};
const INITIAL_CONTEXT: Record<MemberKey, CompanyKey> = {
  ana: 'A',
  bogdan: 'A',
  cora: 'B',
};
const OWNER_PATHS = [
  '/company-context-assignments',
  '/company-director-client-assignments',
  '/company-service-catalogue-assignments',
  '/company-pricing-configuration-assignments',
  '/company-commercial-intake-assignments',
  '/company-pricing-user-assignments',
  '/company-offer-preparer-assignments',
  '/company-offer-approver-assignments',
] as const;
const MEMBER_PATHS = [
  '/company-context-assignments',
  '/company-director-client-assignments',
  '/company-commercial-intake-assignments',
  '/company-pricing-user-assignments',
] as const;

export interface OfferCase {
  company: CompanyKey;
  opportunityId: string;
  snapshotId: string;
  offerId?: string;
  versionId?: string;
  revision: number;
  decision: 'none' | 'pending' | 'approved';
  transmitted: boolean;
  responded: boolean;
  events: string[];
}
export interface Committed {
  member: MemberKey;
  company: CompanyKey;
  bundle: Bundle;
  key: string;
  path: string;
  body: unknown;
  receipt: unknown;
  status: number;
  kind: 'create' | 'approve' | 'transmit' | 'respond';
}
export interface ExpectedEvent {
  action: string;
  company: CompanyKey;
  member: MemberKey;
}
export interface Model {
  grants: Map<string, 'active' | 'revoked' | 'absent'>;
  context: Record<MemberKey, CompanyKey>;
  cases: OfferCase[];
  committed: Committed[];
  seenActivity: Set<string>;
}
export interface StepOutcome {
  events: ExpectedEvent[];
}
export interface OfferWorld {
  harness: PostgresRestTestHarness;
  database: IsolatedPostgresTestDatabase;
  companyIds: Record<CompanyKey, string>;
  membershipIds: Record<Actor, string>;
  fixtures: Record<CompanyKey, { opportunityId: string; snapshotId: string }>;
}

export function grantKey(
  member: MemberKey,
  company: CompanyKey,
  bundle: Bundle,
) {
  return `${member}/${company}/${bundle}`;
}
export function granted(
  model: Readonly<Model>,
  member: MemberKey,
  company: CompanyKey,
  bundle: Bundle,
) {
  return model.grants.get(grantKey(member, company, bundle)) === 'active';
}
export function setGrant(
  model: Model,
  member: MemberKey,
  company: CompanyKey,
  bundle: Bundle,
  state: 'active' | 'revoked',
) {
  model.grants.set(grantKey(member, company, bundle), state);
}
export function denialInvariant(
  model: Readonly<Model>,
  member: MemberKey,
  company: CompanyKey,
  bundle: Bundle,
): Invariant {
  return model.grants.get(grantKey(member, company, bundle)) === 'revoked'
    ? 'revocation-denies'
    : 'command-authority';
}
export function bundlePath(bundle: Bundle) {
  return BUNDLE_PATH[bundle];
}
export function assignmentAction(
  bundle: Bundle,
  operation: 'granted' | 'revoked',
) {
  return `company_offer_${bundle}_assignment.${operation}`;
}
export function object(value: unknown, what: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new InvariantViolation(
      'model-agreement',
      `${what} is no object: ${canonical(value)}`,
    );
  return Object.fromEntries(Object.entries(value));
}
export function text(value: unknown, what: string) {
  if (typeof value !== 'string')
    throw new InvariantViolation(
      'model-agreement',
      `${what} is no string: ${canonical(value)}`,
    );
  return value;
}
export function integer(value: unknown, what: string) {
  if (typeof value === 'number' && Number.isInteger(value)) return value;
  if (typeof value === 'string' && /^[0-9]+$/u.test(value))
    return Number(value);
  throw new InvariantViolation(
    'model-agreement',
    `${what} is no integer: ${canonical(value)}`,
  );
}

export class OfferApi {
  private keys = 0;
  constructor(readonly world: OfferWorld) {}
  nextKey() {
    this.keys += 1;
    return `fuzz-${this.keys}`;
  }
  companyOf(id: unknown): CompanyKey | undefined {
    return COMPANIES.find((company) => this.world.companyIds[company] === id);
  }
  memberOf(id: unknown): MemberKey | undefined {
    return MEMBERS.find((member) => this.world.membershipIds[member] === id);
  }
  async send(
    actor: Actor,
    path: string,
    options: {
      method?: 'GET' | 'POST' | 'DELETE';
      body?: unknown;
      company?: CompanyKey;
      key?: string;
    } = {},
  ): Promise<Reply> {
    const subject = SUBJECTS[actor];
    const company =
      options.company === undefined
        ? null
        : this.world.companyIds[options.company];
    const response = await fetch(`${this.world.harness.origin}/api${path}`, {
      method: options.method ?? 'GET',
      headers: {
        'x-test-external-provider': 'deterministic-test',
        'x-test-external-subject': subject,
        'x-test-display-name': subject,
        'x-test-email': `${subject}@example.test`,
        ...(company ? { 'x-company-context-id': company } : {}),
        'content-type': 'application/json',
        'idempotency-key': options.key ?? randomUUID(),
      },
      ...(options.body === undefined
        ? {}
        : { body: JSON.stringify(options.body) }),
    });
    return readReply(response);
  }
}

function fail(invariant: Invariant, detail: string): never {
  throw new InvariantViolation(invariant, detail);
}

async function genericActivity(api: OfferApi, company: CompanyKey) {
  const reply = await api.send('owner', '/activity-log', { company });
  if (reply.status !== 200)
    fail('model-agreement', `Activity Log failed: ${short(reply)}`);
  const events = object(reply.body, 'Activity Log').events;
  if (!Array.isArray(events))
    fail('model-agreement', 'Activity Log has no events');
  return events.map((value) => {
    const event = object(value, 'an event');
    const target = object(event.target, 'target');
    return {
      id: text(event.id, 'id'),
      action: text(event.action, 'action'),
      companyId:
        typeof target.companyId === 'string' ? target.companyId : undefined,
      membershipId: target.workspaceMembershipId,
    };
  });
}

export async function checkStep(
  model: Model,
  api: OfferApi,
  outcome: StepOutcome,
) {
  const fresh = new Map<string, string>();
  for (const company of COMPANIES)
    for (const event of await genericActivity(api, company)) {
      if (
        model.seenActivity.has(event.id) ||
        !event.action.includes('assignment')
      )
        continue;
      model.seenActivity.add(event.id);
      fresh.set(
        event.id,
        `${event.action} ${event.companyId ? (api.companyOf(event.companyId) ?? '?') : '-'} ${api.memberOf(event.membershipId) ?? '-'}`,
      );
    }
  const seen = [...fresh.values()].sort();
  const wanted = outcome.events
    .map((event) => `${event.action} ${event.company} ${event.member}`)
    .sort();
  if (canonical(seen) !== canonical(wanted))
    fail(
      'history-once',
      `Activity Log gained [${seen.join('; ')}], expected [${wanted.join('; ')}]`,
    );
  const rows = await api.world.harness.pool.query<{
    offer_id: string;
    action: string;
    company_id: string;
  }>(
    `SELECT offer_id, action, company_id FROM offer_events WHERE company_id = ANY($1::uuid[])`,
    [[api.world.companyIds.A, api.world.companyIds.B]],
  );
  const recorded = rows.rows
    .map((row) => `${row.offer_id} ${row.action}`)
    .sort();
  const expected = model.cases
    .flatMap((item) =>
      item.offerId
        ? item.events.map((action) => `${item.offerId} ${action}`)
        : [],
    )
    .sort();
  if (canonical(recorded) !== canonical(expected))
    fail(
      'history-once',
      `offer events are [${recorded.join(', ')}], expected [${expected.join(', ')}]`,
    );
  for (const row of rows.rows) {
    const item = model.cases.find(
      (candidate) => candidate.offerId === row.offer_id,
    );
    if (!item || api.companyOf(row.company_id) !== item.company)
      fail('company-isolation', `offer event stored on ${row.company_id}`);
  }
}

export async function checkEnd(model: Model, api: OfferApi) {
  await checkStep(model, api, { events: [] });
}

async function must(
  harness: PostgresRestTestHarness,
  path: string,
  options: {
    method?: string;
    body?: unknown;
    company?: string | null;
    key?: string;
    status?: number;
    actor?: Actor;
  } = {},
) {
  const actor = options.actor ?? 'owner';
  const response = await fetch(`${harness.origin}/api${path}`, {
    method: options.method ?? 'POST',
    headers: {
      'x-test-external-provider': 'deterministic-test',
      'x-test-external-subject': SUBJECTS[actor],
      'x-test-display-name': SUBJECTS[actor],
      'x-test-email': `${SUBJECTS[actor]}@example.test`,
      ...(options.company ? { 'x-company-context-id': options.company } : {}),
      'content-type': 'application/json',
      'idempotency-key': options.key ?? randomUUID(),
    },
    ...(options.body === undefined
      ? {}
      : { body: JSON.stringify(options.body) }),
  });
  const reply = await readReply(response);
  if (reply.status !== (options.status ?? 201))
    throw new Error(`Fuzz setup ${path} failed: ${short(reply)}`);
  return object(reply.body, path);
}

export async function openOfferWorld(databaseUrl: string): Promise<OfferWorld> {
  const database = await createIsolatedPostgresTestDatabase({
    baseDatabaseUrl: databaseUrl,
    namePrefix: 'offer_fuzz',
  });
  const workspaceId = '00000000-0000-4000-8000-000000001259';
  const harness = await createPostgresRestTestHarness({
    databaseUrl: database.targetUrl,
    serverClock: { now: () => new Date('2026-11-10T12:00:00.000Z') },
    environment: {
      NODE_ENV: 'test',
      ACCESS_IDENTITY_MODE: 'test',
      ACCESS_BOOTSTRAP_EXTERNAL_PROVIDER: 'deterministic-test',
      ACCESS_BOOTSTRAP_EXTERNAL_SUBJECT: SUBJECTS.owner,
      ACCESS_BOOTSTRAP_WORKSPACE_ID: workspaceId,
      ACCESS_BOOTSTRAP_WORKSPACE_NAME: 'Fictional Offer Fuzz Workspace',
      ACCESS_ACCEPTED_INVITATIONS_JSON: JSON.stringify(
        MEMBERS.map((member) => ({
          provider: 'deterministic-test',
          subject: SUBJECTS[member],
          workspaceId,
        })),
      ),
    },
  });
  try {
    const companyA = text(
      (
        await must(harness, '/companies', {
          key: 'company-A',
          body: { displayName: 'Fictional Offer Company A' },
        })
      ).id,
      'A',
    );
    const companyB = text(
      (
        await must(harness, '/companies', {
          key: 'company-B',
          body: { displayName: 'Fictional Offer Company B' },
        })
      ).id,
      'B',
    );
    const companyIds = { A: companyA, B: companyB };
    const named = new Map<Actor, string>();
    for (const actor of ['owner', ...MEMBERS] as const) {
      const current = await must(harness, '/access/current-actor', {
        method: 'GET',
        actor,
        status: 200,
      });
      named.set(actor, text(current.workspaceMembershipId, actor));
    }
    const owner = named.get('owner');
    const ana = named.get('ana');
    const bogdan = named.get('bogdan');
    const cora = named.get('cora');
    if (!owner || !ana || !bogdan || !cora)
      throw new Error('Fuzz setup did not read every membership.');
    const membershipIds = { owner, ana, bogdan, cora };
    const fixtures = {
      A: { opportunityId: '', snapshotId: '' },
      B: { opportunityId: '', snapshotId: '' },
    };
    for (const company of COMPANIES) {
      const companyId = companyIds[company];
      for (const path of OWNER_PATHS)
        await must(harness, path, {
          key: `owner-${company}-${path}`,
          body: { companyId, workspaceMembershipId: owner },
        });
      for (const member of MEMBERS) {
        for (const path of MEMBER_PATHS)
          await must(harness, path, {
            key: `member-${company}-${member}-${path}`,
            body: { companyId, workspaceMembershipId: membershipIds[member] },
          });
        for (const bundle of BUNDLES)
          await must(harness, bundlePath(bundle), {
            key: `issued-${company}-${member}-${bundle}`,
            body: { companyId, workspaceMembershipId: membershipIds[member] },
          });
      }
      const client = await must(harness, '/clients', {
        company: companyId,
        key: `client-${company}`,
        body: {
          displayName: `Fictional Offer Client ${company}`,
          taxId: `SYNTHETIC-OFFER-${company}`,
          address: '1 Fictional Street',
        },
      });
      const intake = await must(harness, '/commercial-intake/requests', {
        company: companyId,
        key: `request-${company}`,
        body: {
          originalText: 'Fictional request for an illustrative Offer.',
          sourceLabel: 'Fictional source',
          subject: 'Fictional Offer preparation',
          clientAccountId: text(client.id, 'client'),
          opportunity: {
            title: `Fictional Offer ${company}`,
            scope: 'Fictional scope',
            nextAction: 'Prepare version 1',
          },
        },
      });
      const opportunityId = text(
        object(intake.initialOpportunity, 'opportunity').id,
        'opportunity',
      );
      const effectiveFrom = '2026-11-10T12:00:00.000Z';
      const rule = await must(harness, '/pricing-configuration/rule-versions', {
        company: companyId,
        key: `rule-${company}`,
        body: {
          label: 'Fictional rule',
          effectiveFrom,
          expectedActiveVersionNumber: null,
        },
      });
      const ruleVersion = integer(
        object(rule.version, 'rule version').versionNumber,
        'rule version',
      );
      const definition = object(
        (
          await must(harness, '/commercial-catalogue/service-definitions', {
            company: companyId,
            key: `definition-${company}`,
            body: {
              code: `OFFER-${company}`,
              name: 'Fictional service',
              description: null,
            },
          })
        ).definition,
        'definition',
      );
      const offering = object(
        (
          await must(harness, '/commercial-catalogue/offerings', {
            company: companyId,
            key: `offering-${company}`,
            body: {
              serviceDefinitionId: text(definition.id, 'definition'),
              commercialLabel: null,
            },
          })
        ).offering,
        'offering',
      );
      const tariff = await must(
        harness,
        `/pricing-configuration/offerings/${text(offering.id, 'offering')}/tariff-versions`,
        {
          company: companyId,
          key: `tariff-${company}`,
          body: {
            unit: 'fictional-unit',
            unitAmount: '300.0000',
            currency: 'EUR',
            taxRatePercent: '15.00',
            taxLabel: 'Fictional tax',
            effectiveFrom,
            expectedActiveVersionNumber: null,
          },
        },
      );
      const tariffVersion = integer(
        object(tariff.version, 'tariff').versionNumber,
        'tariff version',
      );
      const snapshot = await must(
        harness,
        `/pricing/opportunities/${opportunityId}/snapshots`,
        {
          company: companyId,
          key: `snapshot-${company}`,
          body: {
            pricingRuleVersionNumber: ruleVersion,
            lines: [
              {
                offeringId: text(offering.id, 'offering'),
                tariffVersionNumber: tariffVersion,
                quantity: '1',
              },
            ],
          },
        },
      );
      fixtures[company] = {
        opportunityId,
        snapshotId: text(snapshot.id, 'snapshot'),
      };
    }
    return { harness, database, companyIds, membershipIds, fixtures };
  } catch (error) {
    await harness.close();
    await database.close();
    throw error;
  }
}

export async function closeOfferWorld(world: OfferWorld) {
  await world.harness.close();
  await world.database.close();
}

export async function openRun(
  world: OfferWorld,
): Promise<{ model: Model; api: OfferApi }> {
  await world.harness.pool.query('TRUNCATE offers CASCADE');
  const active = await world.harness.pool.query<{ entries: unknown }>(
    `SELECT coalesce(jsonb_agg(jsonb_build_array(workspace_membership_id, company_id, bundle::text)), '[]'::jsonb) AS entries
     FROM company_role_assignments WHERE company_id = ANY($1::uuid[]) AND revoked_at IS NULL
       AND bundle::text IN ('company_offer_preparer', 'company_offer_approver')
       AND workspace_membership_id = ANY($2::uuid[])`,
    [
      [world.companyIds.A, world.companyIds.B],
      [
        world.membershipIds.ana,
        world.membershipIds.bogdan,
        world.membershipIds.cora,
      ],
    ],
  );
  const entries = active.rows[0]?.entries;
  const activeKeys = new Set(
    (Array.isArray(entries) ? entries : []).map((row) => canonical(row)),
  );
  const model: Model = {
    grants: new Map(),
    context: { ...INITIAL_CONTEXT },
    cases: COMPANIES.map((company) => ({
      company,
      opportunityId: world.fixtures[company].opportunityId,
      snapshotId: world.fixtures[company].snapshotId,
      revision: 0,
      decision: 'none' as const,
      transmitted: false,
      responded: false,
      events: [],
    })),
    committed: [],
    seenActivity: new Set(),
  };
  for (const member of MEMBERS)
    for (const company of COMPANIES)
      for (const bundle of BUNDLES) {
        const wanted = INITIAL[member][company].includes(bundle);
        const isActive = activeKeys.has(
          canonical([
            world.membershipIds[member],
            world.companyIds[company],
            BUNDLE_DB[bundle],
          ]),
        );
        if (wanted === isActive) {
          model.grants.set(
            grantKey(member, company, bundle),
            wanted ? 'active' : 'absent',
          );
          continue;
        }
        const path = wanted
          ? bundlePath(bundle)
          : `${bundlePath(bundle)}/${world.membershipIds[member]}/${world.companyIds[company]}`;
        const response = await fetch(`${world.harness.origin}/api${path}`, {
          method: wanted ? 'POST' : 'DELETE',
          headers: {
            'x-test-external-provider': 'deterministic-test',
            'x-test-external-subject': SUBJECTS.owner,
            'x-test-display-name': SUBJECTS.owner,
            'x-test-email': `${SUBJECTS.owner}@example.test`,
            'content-type': 'application/json',
            'idempotency-key': randomUUID(),
          },
          ...(wanted
            ? {
                body: JSON.stringify({
                  companyId: world.companyIds[company],
                  workspaceMembershipId: world.membershipIds[member],
                }),
              }
            : {}),
        });
        if (response.status !== (wanted ? 201 : 200))
          throw new Error(
            `Grant reset failed: ${response.status} ${await response.text()}`,
          );
        model.grants.set(
          grantKey(member, company, bundle),
          wanted ? 'active' : 'revoked',
        );
      }
  const api = new OfferApi(world);
  for (const company of COMPANIES)
    for (const event of await genericActivity(api, company))
      model.seenActivity.add(event.id);
  return { model, api };
}
