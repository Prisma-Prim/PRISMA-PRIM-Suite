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

/** Company registry invariants. Authority: Tenant PRD §2–§5 and Access PRD §7. */
export const INVARIANTS = {
  'company-isolation':
    'A member lists only the Companies whose context they hold. The owner sees every active Company (ADR 0006).',
  'identical-denial':
    'A member without company.manage is refused for a real Company and for a missing id alike.',
  'revocation-denies':
    "After context is revoked, the Company leaves that member's list.",
  'history-once':
    'Registration, grant and revocation each add one history fact. A replay adds none.',
  'replay-receipt':
    'The exact replay of a registration key returns the same Company. Another display name conflicts.',
  'model-agreement':
    'Every other answer is the outcome the Company rules predict.',
} as const;
export type Invariant = keyof typeof INVARIANTS;
export class InvariantViolation extends ModelInvariantViolation<Invariant> {}

export const MEMBERS = ['ana', 'bogdan', 'cora'] as const;
export type MemberKey = (typeof MEMBERS)[number];
export type Actor = MemberKey | 'owner';
export const MISSING_ID = '00000000-0000-4000-8000-000000001251';
const SUBJECTS: Record<Actor, string> = {
  owner: 'workspace-owner',
  ana: 'company-ana',
  bogdan: 'company-bogdan',
  cora: 'company-cora',
};

export interface CompanyModel {
  id: string;
  displayName: string;
  holders: MemberKey[];
}
export interface Committed {
  key: string;
  path: string;
  method: 'POST' | 'DELETE';
  body: unknown;
  receipt: unknown;
  status: number;
}
export interface ExpectedEvent {
  action: string;
  companyId: string | undefined;
  member: Actor | undefined;
}
export interface Model {
  companies: CompanyModel[];
  serial: number;
  committed: Committed[];
  seenActivity: Set<string>;
}
export interface StepOutcome {
  events: ExpectedEvent[];
}
export interface CompanyWorld {
  harness: PostgresRestTestHarness;
  database: IsolatedPostgresTestDatabase;
  membershipIds: Record<Actor, string>;
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

export class CompanyApi {
  private keys = 0;
  constructor(readonly world: CompanyWorld) {}
  nextKey() {
    this.keys += 1;
    return `fuzz-${this.keys}`;
  }
  actorOf(id: unknown): Actor | undefined {
    const actors: Actor[] = ['owner', ...MEMBERS];
    return actors.find((actor) => this.world.membershipIds[actor] === id);
  }
  async send(
    actor: Actor,
    path: string,
    options: {
      method?: 'GET' | 'POST' | 'DELETE';
      body?: unknown;
      key?: string;
    } = {},
  ): Promise<Reply> {
    const subject = SUBJECTS[actor];
    const response = await fetch(`${this.world.harness.origin}/api${path}`, {
      method: options.method ?? 'GET',
      headers: {
        'x-test-external-provider': 'deterministic-test',
        'x-test-external-subject': subject,
        'x-test-display-name': subject,
        'x-test-email': `${subject}@example.test`,
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

async function activity(api: CompanyApi) {
  const reply = await api.send('owner', '/activity-log');
  if (reply.status !== 200)
    fail('model-agreement', `Activity Log failed: ${short(reply)}`);
  const events = object(reply.body, 'Activity Log').events;
  if (!Array.isArray(events))
    fail('model-agreement', 'Activity Log has no events');
  return events.map((value) => {
    const event = object(value, 'an event');
    const target = object(event.target, 'target');
    const actor = object(event.actor, 'actor');
    return {
      id: text(event.id, 'id'),
      action: text(event.action, 'action'),
      companyId:
        typeof target.companyId === 'string' ? target.companyId : undefined,
      member: api.actorOf(
        target.workspaceMembershipId ?? actor.workspaceMembershipId,
      ),
    };
  });
}

export async function checkStep(
  model: Model,
  api: CompanyApi,
  outcome: StepOutcome,
) {
  const fresh = new Map<
    string,
    { action: string; companyId: string | undefined; member: Actor | undefined }
  >();
  for (const event of await activity(api)) {
    if (model.seenActivity.has(event.id) || fresh.has(event.id)) continue;
    if (!event.action.startsWith('company')) continue;
    fresh.set(event.id, event);
    model.seenActivity.add(event.id);
  }
  const seen = [...fresh.values()]
    .map(
      (event) =>
        `${event.action} ${event.companyId ?? '-'} ${event.member ?? '-'}`,
    )
    .sort();
  const wanted = outcome.events
    .map(
      (event) =>
        `${event.action} ${event.companyId ?? '-'} ${event.member ?? '-'}`,
    )
    .sort();
  if (canonical(seen) !== canonical(wanted))
    fail(
      'history-once',
      `Activity Log gained [${seen.join('; ')}], expected [${wanted.join('; ')}]`,
    );
}

export async function checkEnd(model: Model, api: CompanyApi) {
  await checkStep(model, api, { events: [] });
  const owner = await api.send('owner', '/companies');
  if (owner.status !== 200)
    fail('model-agreement', `owner list failed: ${short(owner)}`);
  if (!Array.isArray(owner.body))
    fail('model-agreement', 'owner list is not a list');
  const ids = owner.body
    .map((item) => text(object(item, 'a company').id, 'id'))
    .sort();
  const wanted = model.companies.map((company) => company.id).sort();
  if (canonical(ids) !== canonical(wanted))
    fail(
      'company-isolation',
      `owner sees [${ids.join(', ')}], model has [${wanted.join(', ')}]`,
    );
}

async function must(
  harness: PostgresRestTestHarness,
  path: string,
  options: { method?: string; actor?: Actor; status?: number } = {},
) {
  const actor = options.actor ?? 'owner';
  const response = await fetch(`${harness.origin}/api${path}`, {
    method: options.method ?? 'GET',
    headers: {
      'x-test-external-provider': 'deterministic-test',
      'x-test-external-subject': SUBJECTS[actor],
      'x-test-display-name': SUBJECTS[actor],
      'x-test-email': `${actor}@example.test`,
      'idempotency-key': randomUUID(),
    },
  });
  const reply = await readReply(response);
  if (reply.status !== (options.status ?? 200))
    throw new Error(`Fuzz setup ${path} failed: ${short(reply)}`);
  return object(reply.body, path);
}

export async function openCompanyWorld(
  databaseUrl: string,
): Promise<CompanyWorld> {
  const database = await createIsolatedPostgresTestDatabase({
    baseDatabaseUrl: databaseUrl,
    namePrefix: 'company_fuzz',
  });
  const workspaceId = '00000000-0000-4000-8000-000000001251';
  const harness = await createPostgresRestTestHarness({
    databaseUrl: database.targetUrl,
    environment: {
      NODE_ENV: 'test',
      ACCESS_IDENTITY_MODE: 'test',
      ACCESS_BOOTSTRAP_EXTERNAL_PROVIDER: 'deterministic-test',
      ACCESS_BOOTSTRAP_EXTERNAL_SUBJECT: SUBJECTS.owner,
      ACCESS_BOOTSTRAP_WORKSPACE_ID: workspaceId,
      ACCESS_BOOTSTRAP_WORKSPACE_NAME: 'Fictional Company Fuzz Workspace',
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
    const named = new Map<Actor, string>();
    for (const actor of ['owner', ...MEMBERS] as const) {
      const current = await must(harness, '/access/current-actor', { actor });
      named.set(actor, text(current.workspaceMembershipId, actor));
    }
    const owner = named.get('owner');
    const ana = named.get('ana');
    const bogdan = named.get('bogdan');
    const cora = named.get('cora');
    if (!owner || !ana || !bogdan || !cora)
      throw new Error('Fuzz setup did not read every membership.');
    return {
      harness,
      database,
      membershipIds: { owner, ana, bogdan, cora },
    };
  } catch (error) {
    await harness.close();
    await database.close();
    throw error;
  }
}

export async function closeCompanyWorld(world: CompanyWorld) {
  await world.harness.close();
  await world.database.close();
}

export async function openRun(
  world: CompanyWorld,
): Promise<{ model: Model; api: CompanyApi }> {
  await world.harness.pool.query('TRUNCATE companies CASCADE');
  const model: Model = {
    companies: [],
    serial: 0,
    committed: [],
    seenActivity: new Set(),
  };
  const api = new CompanyApi(world);
  for (const event of await activity(api)) model.seenActivity.add(event.id);
  return { model, api };
}
