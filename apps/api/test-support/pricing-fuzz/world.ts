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

/** Pricing-configuration invariants. Authority: illustrative pricing PRD §7 and §11. */
export const INVARIANTS = {
  'company-isolation':
    'A version list stays inside the selected Company (ADR 0006).',
  'identical-denial':
    'A foreign or hidden version gets the same safe answer as a missing one.',
  'revocation-denies':
    'After the configuration capture is revoked, the next publication is refused, with no effect.',
  'command-authority':
    'Publishing a Pricing Rule or Tariff needs Company Pricing Configuration.',
  'history-once':
    'Each material publication adds one history fact. A refusal, a stale head or a replay adds none.',
  'versions-grow':
    'Version numbers start at 1 and only grow. A stale expected head is refused.',
  'replay-receipt':
    'The exact replay returns the recorded outcome, version id and version number. The same key with another body conflicts.',
  'model-agreement':
    'Every other answer is the outcome the pricing rules predict.',
} as const;
export type Invariant = keyof typeof INVARIANTS;
export class InvariantViolation extends ModelInvariantViolation<Invariant> {}

export const COMPANIES = ['A', 'B'] as const;
export type CompanyKey = (typeof COMPANIES)[number];
export const MEMBERS = ['ana', 'bogdan', 'cora'] as const;
export type MemberKey = (typeof MEMBERS)[number];
export type Actor = MemberKey | 'owner';
export const MISSING_ID = '00000000-0000-4000-8000-000000001261';
export const CLOCK = '2026-11-10T12:00:00.000Z';
const SUBJECTS: Record<Actor, string> = {
  owner: 'workspace-owner',
  ana: 'pricing-ana',
  bogdan: 'pricing-bogdan',
  cora: 'pricing-cora',
};
const INITIAL: Record<MemberKey, Record<CompanyKey, boolean>> = {
  ana: { A: true, B: false },
  bogdan: { A: false, B: true },
  cora: { A: true, B: true },
};
const INITIAL_CONTEXT: Record<MemberKey, CompanyKey> = {
  ana: 'A',
  bogdan: 'A',
  cora: 'B',
};
const PATH = '/company-pricing-configuration-assignments';

export interface Scope {
  company: CompanyKey;
  offeringId: string;
  ruleHead: number;
  ruleIds: string[];
  tariffHead: number;
  tariffIds: string[];
  events: string[];
}
export interface Committed {
  member: MemberKey;
  company: CompanyKey;
  key: string;
  path: string;
  body: unknown;
  outcome: string;
  versionId: string;
  versionNumber: number;
  status: number;
}
export interface ExpectedEvent {
  action: string;
  company: CompanyKey;
  member: MemberKey;
}
export interface Model {
  grants: Map<string, 'active' | 'revoked' | 'absent'>;
  context: Record<MemberKey, CompanyKey>;
  scopes: Scope[];
  committed: Committed[];
  seenActivity: Set<string>;
}
export interface StepOutcome {
  events: ExpectedEvent[];
}
export interface PricingWorld {
  harness: PostgresRestTestHarness;
  database: IsolatedPostgresTestDatabase;
  companyIds: Record<CompanyKey, string>;
  membershipIds: Record<Actor, string>;
  offerings: Record<CompanyKey, string>;
}

export function grantKey(member: MemberKey, company: CompanyKey) {
  return `${member}/${company}`;
}
export function granted(
  model: Readonly<Model>,
  member: MemberKey,
  company: CompanyKey,
) {
  return model.grants.get(grantKey(member, company)) === 'active';
}
export function setGrant(
  model: Model,
  member: MemberKey,
  company: CompanyKey,
  state: 'active' | 'revoked',
) {
  model.grants.set(grantKey(member, company), state);
}
export function denialInvariant(
  model: Readonly<Model>,
  member: MemberKey,
  company: CompanyKey,
): Invariant {
  return model.grants.get(grantKey(member, company)) === 'revoked'
    ? 'revocation-denies'
    : 'command-authority';
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
export function effectiveFrom(head: number) {
  return new Date(Date.UTC(2026, 10, 10, 12 + head, 0, 0)).toISOString();
}

export class PricingApi {
  private keys = 0;
  constructor(readonly world: PricingWorld) {}
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

async function genericActivity(api: PricingApi, company: CompanyKey) {
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
  api: PricingApi,
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
    action: string;
    company_id: string;
  }>(
    `SELECT action, company_id FROM pricing_configuration_events WHERE company_id = ANY($1::uuid[])`,
    [[api.world.companyIds.A, api.world.companyIds.B]],
  );
  const recorded = rows.rows
    .map((row) => `${api.companyOf(row.company_id) ?? '?'} ${row.action}`)
    .sort();
  const expected = model.scopes
    .flatMap((scope) =>
      scope.events.map((action) => `${scope.company} ${action}`),
    )
    .sort();
  if (canonical(recorded) !== canonical(expected))
    fail(
      'history-once',
      `pricing events are [${recorded.join(', ')}], expected [${expected.join(', ')}]`,
    );
}

export async function checkEnd(model: Model, api: PricingApi) {
  await checkStep(model, api, { events: [] });
  for (const scope of model.scopes) {
    const reply = await api.send(
      'owner',
      '/pricing-configuration/rule-versions',
      { company: scope.company },
    );
    if (reply.status !== 200)
      fail('model-agreement', `rule list failed: ${short(reply)}`);
    const items = object(reply.body, 'rule page').items;
    if (!Array.isArray(items))
      fail('model-agreement', 'rule page has no items');
    const ids = items
      .map((item) => text(object(item, 'a rule').id, 'rule id'))
      .sort();
    if (canonical(ids) !== canonical([...scope.ruleIds].sort()))
      fail(
        'company-isolation',
        `Company ${scope.company} rules are [${ids.join(', ')}]`,
      );
  }
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

export async function openPricingWorld(
  databaseUrl: string,
): Promise<PricingWorld> {
  const database = await createIsolatedPostgresTestDatabase({
    baseDatabaseUrl: databaseUrl,
    namePrefix: 'pricing_fuzz',
  });
  const workspaceId = '00000000-0000-4000-8000-000000001261';
  const harness = await createPostgresRestTestHarness({
    databaseUrl: database.targetUrl,
    serverClock: { now: () => new Date(CLOCK) },
    environment: {
      NODE_ENV: 'test',
      ACCESS_IDENTITY_MODE: 'test',
      ACCESS_BOOTSTRAP_EXTERNAL_PROVIDER: 'deterministic-test',
      ACCESS_BOOTSTRAP_EXTERNAL_SUBJECT: SUBJECTS.owner,
      ACCESS_BOOTSTRAP_WORKSPACE_ID: workspaceId,
      ACCESS_BOOTSTRAP_WORKSPACE_NAME: 'Fictional Pricing Fuzz Workspace',
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
          body: { displayName: 'Fictional Pricing Company A' },
        })
      ).id,
      'A',
    );
    const companyB = text(
      (
        await must(harness, '/companies', {
          key: 'company-B',
          body: { displayName: 'Fictional Pricing Company B' },
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
    const offerings = { A: '', B: '' };
    for (const company of COMPANIES) {
      const companyId = companyIds[company];
      for (const path of [
        '/company-context-assignments',
        '/company-service-catalogue-assignments',
        PATH,
      ])
        await must(harness, path, {
          key: `owner-${company}-${path}`,
          body: { companyId, workspaceMembershipId: owner },
        });
      for (const member of MEMBERS) {
        await must(harness, '/company-context-assignments', {
          key: `context-${company}-${member}`,
          body: { companyId, workspaceMembershipId: membershipIds[member] },
        });
        await must(harness, PATH, {
          key: `issued-${company}-${member}`,
          body: { companyId, workspaceMembershipId: membershipIds[member] },
        });
      }
      const definition = object(
        (
          await must(harness, '/commercial-catalogue/service-definitions', {
            company: companyId,
            key: `definition-${company}`,
            body: {
              code: `PRICE-${company}`,
              name: 'Fictional priced service',
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
      offerings[company] = text(offering.id, 'offering');
    }
    return { harness, database, companyIds, membershipIds, offerings };
  } catch (error) {
    await harness.close();
    await database.close();
    throw error;
  }
}

export async function closePricingWorld(world: PricingWorld) {
  await world.harness.close();
  await world.database.close();
}

export async function openRun(
  world: PricingWorld,
): Promise<{ model: Model; api: PricingApi }> {
  await world.harness.pool.query(
    'TRUNCATE pricing_rule_versions, tariff_versions, pricing_configuration_commands, pricing_configuration_events CASCADE',
  );
  const active = await world.harness.pool.query<{ entries: unknown }>(
    `SELECT coalesce(jsonb_agg(jsonb_build_array(workspace_membership_id, company_id)), '[]'::jsonb) AS entries
     FROM company_role_assignments WHERE company_id = ANY($1::uuid[]) AND revoked_at IS NULL
       AND bundle::text = 'company_pricing_configuration'
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
    scopes: COMPANIES.map((company) => ({
      company,
      offeringId: world.offerings[company],
      ruleHead: 0,
      ruleIds: [],
      tariffHead: 0,
      tariffIds: [],
      events: [],
    })),
    committed: [],
    seenActivity: new Set(),
  };
  for (const member of MEMBERS)
    for (const company of COMPANIES) {
      const wanted = INITIAL[member][company];
      const isActive = activeKeys.has(
        canonical([world.membershipIds[member], world.companyIds[company]]),
      );
      if (wanted === isActive) {
        model.grants.set(
          grantKey(member, company),
          wanted ? 'active' : 'absent',
        );
        continue;
      }
      const path = wanted
        ? PATH
        : `${PATH}/${world.membershipIds[member]}/${world.companyIds[company]}`;
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
        grantKey(member, company),
        wanted ? 'active' : 'revoked',
      );
    }
  const api = new PricingApi(world);
  for (const company of COMPANIES)
    for (const event of await genericActivity(api, company))
      model.seenActivity.add(event.id);
  return { model, api };
}
