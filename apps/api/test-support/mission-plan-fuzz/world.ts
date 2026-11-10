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

/** Mission-plan invariants. Authority: configurable mission plans PRD §3, §4 and §7. */
export const INVARIANTS = {
  'company-isolation':
    "A catalogue shows only the selected Company's plans (ADR 0006).",
  'identical-denial':
    'A foreign or hidden plan Version gets the same safe answer as a missing one.',
  'revocation-denies':
    'After a revocation, the next command that needed the capture is refused, with no effect.',
  'command-authority':
    'Publication needs Mission Plan Configuration. User can read and cannot publish.',
  'history-once':
    'Each successful publication adds one history fact. A refusal, a stale head or a replay adds none.',
  'versions-grow':
    'Version numbers start at 1 and only grow. A stale expected head is refused.',
  'immutable-version':
    'A successor leaves the previous Version readable and unchanged.',
  'replay-receipt':
    'The exact replay of a committed key returns the saved Version. The same key with another body conflicts.',
  'model-agreement':
    'Every other answer is the outcome the mission-plan rules predict.',
} as const;
export type Invariant = keyof typeof INVARIANTS;
export class InvariantViolation extends ModelInvariantViolation<Invariant> {}

export const COMPANIES = ['A', 'B'] as const;
export type CompanyKey = (typeof COMPANIES)[number];
export const MEMBERS = ['ana', 'bogdan', 'cora'] as const;
export type MemberKey = (typeof MEMBERS)[number];
export const BUNDLES = ['configuration', 'user'] as const;
export type Bundle = (typeof BUNDLES)[number];
export type Actor = MemberKey | 'owner';
export const MISSING_ID = '00000000-0000-4000-8000-000000001255';
const SUBJECTS: Record<Actor, string> = {
  owner: 'workspace-owner',
  ana: 'mission-plan-ana',
  bogdan: 'mission-plan-bogdan',
  cora: 'mission-plan-cora',
};
const BUNDLE_NOUNS: Record<Bundle, string> = {
  configuration: 'company-mission-plan-configuration',
  user: 'company-mission-plan-user',
};
const BUNDLE_DB: Record<Bundle, string> = {
  configuration: 'company_mission_plan_configuration',
  user: 'company_mission_plan_user',
};
const INITIAL_GRANTS: Record<
  MemberKey,
  Record<CompanyKey, readonly Bundle[]>
> = {
  ana: { A: ['configuration', 'user'], B: ['configuration'] },
  bogdan: { A: ['user'], B: ['configuration', 'user'] },
  cora: { A: ['configuration'], B: ['user'] },
};
const INITIAL_CONTEXT: Record<MemberKey, CompanyKey> = {
  ana: 'A',
  bogdan: 'A',
  cora: 'B',
};

export interface PlanModel {
  id: string;
  company: CompanyKey;
  headNumber: number;
  headId: string;
  title: string;
  frozenTitle: string;
}
export interface Committed {
  member: MemberKey;
  company: CompanyKey;
  key: string;
  path: string;
  body: unknown;
  receipt: unknown;
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
  plans: PlanModel[];
  serial: number;
  committed: Committed[];
  seenActivity: Set<string>;
}
export interface StepOutcome {
  events: ExpectedEvent[];
}
export interface MissionPlanWorld {
  harness: PostgresRestTestHarness;
  database: IsolatedPostgresTestDatabase;
  companyIds: Record<CompanyKey, string>;
  membershipIds: Record<Actor, string>;
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
  required: readonly Bundle[],
): Invariant {
  if (
    required.some(
      (bundle) =>
        model.grants.get(grantKey(member, company, bundle)) === 'revoked',
    )
  )
    return 'revocation-denies';
  if (required.every((bundle) => granted(model, member, company, bundle)))
    return 'model-agreement';
  return BUNDLES.some((bundle) => granted(model, member, company, bundle))
    ? 'command-authority'
    : 'company-isolation';
}
export function bundleAssignments(bundle: Bundle) {
  return `/${BUNDLE_NOUNS[bundle]}-assignments`;
}
export function assignmentAction(
  bundle: Bundle,
  operation: 'granted' | 'revoked',
) {
  return `${BUNDLE_NOUNS[bundle].replaceAll('-', '_')}_assignment.${operation}`;
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
export function activityBody(title: string) {
  return {
    key: randomUUID(),
    title,
    activity: 'Fictional planned action',
    intendedResult: 'Fictional intended result',
  };
}

export class MissionPlanApi {
  private keys = 0;
  constructor(readonly world: MissionPlanWorld) {}
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

async function genericActivity(api: MissionPlanApi, company: CompanyKey) {
  const reply = await api.send('owner', '/activity-log', { company });
  if (reply.status !== 200)
    fail('model-agreement', `Activity Log failed: ${short(reply)}`);
  const events = object(reply.body, 'Activity Log').events;
  if (!Array.isArray(events))
    fail('model-agreement', 'Activity Log has no events');
  return events.map((value) => {
    const event = object(value, 'an event');
    const action = text(event.action, 'action');
    const target = object(event.target, 'target');
    return {
      id: text(event.id, 'id'),
      action,
      companyId:
        typeof target.companyId === 'string' ? target.companyId : undefined,
      membershipId: target.workspaceMembershipId,
    };
  });
}

export async function checkStep(
  model: Model,
  api: MissionPlanApi,
  outcome: StepOutcome,
) {
  const fresh = new Map<
    string,
    { action: string; companyId: string | undefined; membershipId: unknown }
  >();
  for (const company of COMPANIES)
    for (const event of await genericActivity(api, company)) {
      if (model.seenActivity.has(event.id) || fresh.has(event.id)) continue;
      if (
        !event.action.startsWith('mission_plan') &&
        !event.action.includes('assignment')
      )
        continue;
      fresh.set(event.id, event);
      model.seenActivity.add(event.id);
    }
  const label = (action: string, company: string, member: string) =>
    action.startsWith('mission_plan')
      ? `${action} ${company}`
      : `${action} ${company} ${member}`;
  const seen = [...fresh.values()]
    .map((event) =>
      label(
        event.action,
        event.companyId ? (api.companyOf(event.companyId) ?? '?') : '-',
        api.memberOf(event.membershipId) ?? '-',
      ),
    )
    .sort();
  const wanted = outcome.events
    .map((event) => label(event.action, event.company, event.member))
    .sort();
  if (canonical(seen) !== canonical(wanted))
    fail(
      'history-once',
      `Activity Log gained [${seen.join('; ')}], expected [${wanted.join('; ')}]`,
    );
}

export async function checkEnd(model: Model, api: MissionPlanApi) {
  await checkStep(model, api, { events: [] });
  for (const company of COMPANIES) {
    const reply = await api.send('owner', '/mission-plans', { company });
    if (reply.status !== 200)
      fail('model-agreement', `catalogue failed: ${short(reply)}`);
    const items = object(reply.body, 'catalogue').items;
    if (!Array.isArray(items))
      fail('model-agreement', 'catalogue has no items');
    const ids = items
      .map((item) => text(object(item, 'a plan').planId, 'plan id'))
      .sort();
    const wanted = model.plans
      .filter((plan) => plan.company === company)
      .map((plan) => plan.id)
      .sort();
    if (canonical(ids) !== canonical(wanted))
      fail(
        'company-isolation',
        `Company ${company} catalogue is [${ids.join(', ')}], model has [${wanted.join(', ')}]`,
      );
    for (const item of items) {
      const row = object(item, 'a plan');
      if (api.companyOf(row.companyId) !== company)
        fail(
          'company-isolation',
          `Company ${company} lists ${canonical(row.companyId)}`,
        );
    }
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
    actor?: Actor;
    status?: number;
  },
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

export async function openMissionPlanWorld(
  databaseUrl: string,
): Promise<MissionPlanWorld> {
  const database = await createIsolatedPostgresTestDatabase({
    baseDatabaseUrl: databaseUrl,
    namePrefix: 'mission_plan_fuzz',
  });
  const workspaceId = '00000000-0000-4000-8000-000000001255';
  const harness = await createPostgresRestTestHarness({
    databaseUrl: database.targetUrl,
    environment: {
      NODE_ENV: 'test',
      ACCESS_IDENTITY_MODE: 'test',
      ACCESS_BOOTSTRAP_EXTERNAL_PROVIDER: 'deterministic-test',
      ACCESS_BOOTSTRAP_EXTERNAL_SUBJECT: SUBJECTS.owner,
      ACCESS_BOOTSTRAP_WORKSPACE_ID: workspaceId,
      ACCESS_BOOTSTRAP_WORKSPACE_NAME: 'Fictional Mission Plan Fuzz Workspace',
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
          body: { displayName: 'Fictional Mission Plan Company A' },
        })
      ).id,
      'company A',
    );
    const companyB = text(
      (
        await must(harness, '/companies', {
          key: 'company-B',
          body: { displayName: 'Fictional Mission Plan Company B' },
        })
      ).id,
      'company B',
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
    for (const companyId of [companyA, companyB]) {
      for (const actor of ['owner', ...MEMBERS] as const)
        await must(harness, '/company-context-assignments', {
          key: `context-${companyId}-${actor}`,
          body: { companyId, workspaceMembershipId: membershipIds[actor] },
        });
      for (const bundle of BUNDLES)
        await must(harness, bundleAssignments(bundle), {
          key: `owner-${companyId}-${bundle}`,
          body: { companyId, workspaceMembershipId: membershipIds.owner },
        });
      for (const member of MEMBERS)
        for (const bundle of BUNDLES)
          await must(harness, bundleAssignments(bundle), {
            key: `issued-${companyId}-${member}-${bundle}`,
            body: { companyId, workspaceMembershipId: membershipIds[member] },
          });
    }
    return { harness, database, companyIds, membershipIds };
  } catch (error) {
    await harness.close();
    await database.close();
    throw error;
  }
}

export async function closeMissionPlanWorld(world: MissionPlanWorld) {
  await world.harness.close();
  await world.database.close();
}

export async function openRun(
  world: MissionPlanWorld,
): Promise<{ model: Model; api: MissionPlanApi }> {
  await world.harness.pool.query('TRUNCATE mission_plans CASCADE');
  const active = await world.harness.pool.query<{ entries: unknown }>(
    `SELECT coalesce(jsonb_agg(jsonb_build_array(workspace_membership_id, company_id, bundle::text)), '[]'::jsonb) AS entries
     FROM company_role_assignments WHERE company_id = ANY($1::uuid[]) AND revoked_at IS NULL
       AND bundle::text IN ('company_mission_plan_configuration', 'company_mission_plan_user')`,
    [[world.companyIds.A, world.companyIds.B]],
  );
  const entries = active.rows[0]?.entries;
  const activeKeys = new Set(
    (Array.isArray(entries) ? entries : []).map((row) => canonical(row)),
  );
  const model: Model = {
    grants: new Map(),
    context: { ...INITIAL_CONTEXT },
    plans: [],
    serial: 0,
    committed: [],
    seenActivity: new Set(),
  };
  for (const member of MEMBERS)
    for (const company of COMPANIES)
      for (const bundle of BUNDLES) {
        const wanted = INITIAL_GRANTS[member][company].includes(bundle);
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
        const assignments = bundleAssignments(bundle);
        const response = await fetch(
          `${world.harness.origin}/api${wanted ? assignments : `${assignments}/${world.membershipIds[member]}/${world.companyIds[company]}`}`,
          {
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
          },
        );
        if (response.status !== (wanted ? 201 : 200))
          throw new Error(
            `Grant reset failed: ${response.status} ${await response.text()}`,
          );
        model.grants.set(
          grantKey(member, company, bundle),
          wanted ? 'active' : 'revoked',
        );
      }
  const api = new MissionPlanApi(world);
  for (const company of COMPANIES)
    for (const event of await genericActivity(api, company))
      model.seenActivity.add(event.id);
  return { model, api };
}
