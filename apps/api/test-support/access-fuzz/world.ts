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

/**
 * Invariants checked after every Access fuzz step. Authority is the Access
 * PRD §7, the Tenant and authorization PRD §2–§4, and ADR 0006. REST answers
 * prove them.
 */
export const INVARIANTS = {
  'company-isolation':
    "A request reads no Company other than the one it selected, and the generic Activity Log does not show another Company's access events (ADR 0006).",
  'identical-denial':
    'A missing membership and a hidden Company get a safe refusal, not a distinct existence answer (ADR 0006).',
  'revocation-denies':
    'After a revocation or a suspension, the next request that needed the capture or the active membership is refused, with no effect (Access PRD §7).',
  'history-once':
    'Each successful grant, revocation or suspension adds one history fact. A replay adds none (Access PRD §7).',
  'actor-identity':
    'The current actor is the server membership. The caller does not choose the Workspace (Access PRD §8).',
  'replay-receipt':
    'The exact replay of a committed key returns the saved result. The same key with another body conflicts.',
  'model-agreement':
    'Every other answer is the outcome the access rules predict.',
} as const;
export type Invariant = keyof typeof INVARIANTS;
export class InvariantViolation extends ModelInvariantViolation<Invariant> {}

export const COMPANIES = ['A', 'B'] as const;
export type CompanyKey = (typeof COMPANIES)[number];
export const MEMBERS = ['ana', 'bogdan', 'cora'] as const;
export type MemberKey = (typeof MEMBERS)[number];
export const BUNDLES = ['context', 'project'] as const;
export type Bundle = (typeof BUNDLES)[number];
export type Actor = MemberKey | 'owner';
export const MISSING_ID = '00000000-0000-4000-8000-000000001249';
const SUBJECTS: Record<Actor, string> = {
  owner: 'workspace-owner',
  ana: 'access-ana',
  bogdan: 'access-bogdan',
  cora: 'access-cora',
};
const BUNDLE_NOUNS: Record<Bundle, string> = {
  context: 'company-context',
  project: 'company-project',
};
const INITIAL_GRANTS: Record<
  MemberKey,
  Record<CompanyKey, readonly Bundle[]>
> = {
  ana: { A: ['context', 'project'], B: ['context'] },
  bogdan: { A: ['context', 'project'], B: ['project'] },
  cora: { A: [], B: ['context', 'project'] },
};
const INITIAL_CONTEXT: Record<MemberKey, CompanyKey> = {
  ana: 'A',
  bogdan: 'A',
  cora: 'B',
};

export interface Committed {
  member: Actor;
  company: CompanyKey | null;
  key: string;
  path: string;
  method: 'POST' | 'DELETE';
  body: unknown;
  receipt: unknown;
  status: number;
}
export interface ExpectedEvent {
  action: string;
  company: CompanyKey | undefined;
  member: MemberKey;
}
export interface Model {
  grants: Map<string, 'active' | 'revoked' | 'absent'>;
  context: Record<MemberKey, CompanyKey>;
  suspended: Set<MemberKey>;
  committed: Committed[];
  seenActivity: Set<string>;
}
export interface StepOutcome {
  events: ExpectedEvent[];
}
export interface AccessWorld {
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

export class AccessApi {
  private keys = 0;
  constructor(readonly world: AccessWorld) {}
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
      company?: CompanyKey | null;
      key?: string;
    } = {},
  ): Promise<Reply> {
    const subject = SUBJECTS[actor];
    const company =
      options.company === undefined || options.company === null
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

async function genericActivity(api: AccessApi, company: CompanyKey) {
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
    const companyId = target.companyId;
    // Assignment and suspension facts are workspace administration. The owner
    // sees them from either Company log; the target Company stays on the event.
    return {
      id: text(event.id, 'id'),
      action,
      company:
        companyId === undefined || companyId === null
          ? undefined
          : api.companyOf(companyId),
      membershipId: target.workspaceMembershipId,
    };
  });
}

async function expectActivity(
  model: Model,
  api: AccessApi,
  expected: ExpectedEvent[],
) {
  const fresh = new Map<
    string,
    { action: string; company: CompanyKey | undefined; membershipId: unknown }
  >();
  for (const company of COMPANIES)
    for (const event of await genericActivity(api, company)) {
      if (model.seenActivity.has(event.id) || fresh.has(event.id)) continue;
      fresh.set(event.id, event);
      model.seenActivity.add(event.id);
    }
  const seen = [...fresh.values()]
    .map(
      (event) =>
        `${event.action} ${event.company ?? '-'} ${api.memberOf(event.membershipId) ?? '-'}`,
    )
    .sort();
  const wanted = expected
    .map((event) => `${event.action} ${event.company ?? '-'} ${event.member}`)
    .sort();
  if (canonical(seen) !== canonical(wanted))
    fail(
      'history-once',
      `Activity Log gained [${seen.join('; ')}], expected [${wanted.join('; ')}]`,
    );
}

export async function checkStep(
  model: Model,
  api: AccessApi,
  outcome: StepOutcome,
) {
  await expectActivity(model, api, outcome.events);
}
export async function checkEnd(model: Model, api: AccessApi) {
  await expectActivity(model, api, []);
  for (const member of MEMBERS) {
    const reply = await api.send(member, '/access/current-actor', {
      company: model.suspended.has(member) ? null : model.context[member],
    });
    if (model.suspended.has(member)) {
      if (reply.status !== 403)
        fail(
          'revocation-denies',
          `${member} is suspended and answered ${short(reply)}`,
        );
      continue;
    }
    if (reply.status !== 200)
      fail('actor-identity', `${member} current actor failed: ${short(reply)}`);
    const body = object(reply.body, 'current actor');
    if (
      text(body.workspaceMembershipId, 'membership') !==
      api.world.membershipIds[member]
    )
      fail('actor-identity', `${member} read another membership`);
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
function namesOf(named: ReadonlyMap<Actor, string>): Record<Actor, string> {
  const owner = named.get('owner');
  const ana = named.get('ana');
  const bogdan = named.get('bogdan');
  const cora = named.get('cora');
  if (!owner || !ana || !bogdan || !cora)
    throw new Error('Fuzz setup did not read every membership.');
  return { owner, ana, bogdan, cora };
}

export async function openAccessWorld(
  databaseUrl: string,
): Promise<AccessWorld> {
  const database = await createIsolatedPostgresTestDatabase({
    baseDatabaseUrl: databaseUrl,
    namePrefix: 'access_fuzz',
  });
  const workspaceId = '00000000-0000-4000-8000-000000001249';
  const harness = await createPostgresRestTestHarness({
    databaseUrl: database.targetUrl,
    environment: {
      NODE_ENV: 'test',
      ACCESS_IDENTITY_MODE: 'test',
      ACCESS_BOOTSTRAP_EXTERNAL_PROVIDER: 'deterministic-test',
      ACCESS_BOOTSTRAP_EXTERNAL_SUBJECT: SUBJECTS.owner,
      ACCESS_BOOTSTRAP_WORKSPACE_ID: workspaceId,
      ACCESS_BOOTSTRAP_WORKSPACE_NAME: 'Fictional Access Fuzz Workspace',
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
          body: { displayName: 'Fictional Access Company A' },
        })
      ).id,
      'company A',
    );
    const companyB = text(
      (
        await must(harness, '/companies', {
          key: 'company-B',
          body: { displayName: 'Fictional Access Company B' },
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
    const membershipIds = namesOf(named);
    for (const companyId of [companyA, companyB])
      for (const actor of ['owner', ...MEMBERS] as const)
        for (const path of [
          '/company-context-assignments',
          '/company-director-client-assignments',
          '/company-project-assignments',
        ])
          await must(harness, path, {
            key: `native-${companyId}-${actor}-${path}`,
            body: { companyId, workspaceMembershipId: membershipIds[actor] },
          });
    for (const company of COMPANIES) {
      const client = await must(harness, '/clients', {
        company: companyIds[company],
        key: `client-${company}`,
        body: { displayName: `Fictional Access Client ${company}` },
      });
      await must(harness, '/projects', {
        company: companyIds[company],
        key: `project-${company}`,
        body: {
          title: `Fictional Access Project ${company}`,
          clientAccountId: text(client.id, 'client id'),
        },
      });
    }
    return { harness, database, companyIds, membershipIds };
  } catch (error) {
    await harness.close();
    await database.close();
    throw error;
  }
}

export async function closeAccessWorld(world: AccessWorld) {
  await world.harness.close();
  await world.database.close();
}

export async function openRun(
  world: AccessWorld,
): Promise<{ model: Model; api: AccessApi }> {
  await world.harness.pool.query(
    `UPDATE workspace_memberships SET status = 'active', updated_at = now() WHERE status <> 'active'`,
  );
  await world.harness.pool.query(
    'TRUNCATE workspace_membership_suspension_commands',
  );
  const active = await world.harness.pool.query<{ entries: unknown }>(
    `SELECT coalesce(jsonb_agg(jsonb_build_array(workspace_membership_id, company_id, bundle::text)), '[]'::jsonb) AS entries
     FROM company_role_assignments
     WHERE company_id = ANY($1::uuid[]) AND revoked_at IS NULL
       AND bundle::text IN ('company_context_access', 'company_project_access')`,
    [[world.companyIds.A, world.companyIds.B]],
  );
  const entries = active.rows[0]?.entries;
  const activeKeys = new Set(
    (Array.isArray(entries) ? entries : []).map((row) => canonical(row)),
  );
  const model: Model = {
    grants: new Map(),
    context: { ...INITIAL_CONTEXT },
    suspended: new Set(),
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
            BUNDLE_NOUNS[bundle].replaceAll('-', '_') + '_access',
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
          `${world.harness.origin}/api${
            wanted
              ? assignments
              : `${assignments}/${world.membershipIds[member]}/${world.companyIds[company]}`
          }`,
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
  const api = new AccessApi(world);
  for (const company of COMPANIES)
    for (const event of await genericActivity(api, company))
      model.seenActivity.add(event.id);
  return { model, api };
}
