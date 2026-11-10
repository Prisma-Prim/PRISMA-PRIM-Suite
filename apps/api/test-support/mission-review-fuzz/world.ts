import { randomUUID } from 'node:crypto';
import { pilotKey } from '../../src/project-template/project-pilot-plan.test-support.js';
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

/** Mission-result review invariants. Authority: Project/Task PRD §29. */
export const INVARIANTS = {
  'company-isolation':
    'A review read stays inside the selected Company (ADR 0006).',
  'identical-denial':
    'A foreign Project gets the same safe answer as a missing one.',
  'revocation-denies':
    'After the reviewer capture is revoked, the next review is refused, with no effect.',
  'command-authority':
    'Recording a review needs Company Mission Result Reviewer. Reading does not.',
  'history-once':
    'Each successful review adds one history fact. A refusal, a stale revision or a replay adds none.',
  'revisions-grow':
    'Review revisions only grow. A stale expected revision is refused.',
  'review-state':
    'A review names a mapped activity whose Task is done, at the observed Task version.',
  'replay-receipt':
    'The exact replay of a committed key returns the saved result. The same key with another body conflicts.',
  'model-agreement':
    'Every other answer is the outcome the review rules predict.',
} as const;
export type Invariant = keyof typeof INVARIANTS;
export class InvariantViolation extends ModelInvariantViolation<Invariant> {}

export const COMPANIES = ['A', 'B'] as const;
export type CompanyKey = (typeof COMPANIES)[number];
export const MEMBERS = ['ana', 'bogdan', 'cora'] as const;
export type MemberKey = (typeof MEMBERS)[number];
export type Actor = MemberKey | 'owner';
export const MISSING_ID = '00000000-0000-4000-8000-000000001257';
const SUBJECTS: Record<Actor, string> = {
  owner: 'workspace-owner',
  ana: 'mission-review-ana',
  bogdan: 'mission-review-bogdan',
  cora: 'mission-review-cora',
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
const OWNER_PATHS = [
  '/company-context-assignments',
  '/company-director-client-assignments',
  '/company-project-assignments',
  '/company-task-manager-assignments',
  '/company-project-template-user-assignments',
  '/company-mission-deliverable-access-assignments',
  '/company-document-registrar-assignments',
  '/company-document-content-reader-assignments',
  '/company-mission-result-reviewer-assignments',
] as const;
const MEMBER_PATHS = [
  '/company-context-assignments',
  '/company-director-client-assignments',
  '/company-project-assignments',
  '/company-task-manager-assignments',
  '/company-project-template-user-assignments',
  '/company-mission-deliverable-access-assignments',
  '/company-document-registrar-assignments',
  '/company-document-content-reader-assignments',
] as const;

export interface ReviewCase {
  projectId: string;
  company: CompanyKey;
  taskId: string;
  done: boolean;
  revision: number;
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
  cases: ReviewCase[];
  committed: Committed[];
  seenActivity: Set<string>;
}
export interface StepOutcome {
  events: ExpectedEvent[];
}
export interface ReviewWorld {
  harness: PostgresRestTestHarness;
  database: IsolatedPostgresTestDatabase;
  companyIds: Record<CompanyKey, string>;
  clientIds: Record<CompanyKey, string>;
  membershipIds: Record<Actor, string>;
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

export class ReviewApi {
  private keys = 0;
  constructor(readonly world: ReviewWorld) {}
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

async function genericActivity(api: ReviewApi, company: CompanyKey) {
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

async function reviewEvents(api: ReviewApi) {
  const result = await api.world.harness.pool.query<{
    project_id: string;
    action: string;
    company_id: string;
  }>(
    `SELECT project_id, action, company_id FROM mission_result_review_events WHERE company_id = ANY($1::uuid[])`,
    [[api.world.companyIds.A, api.world.companyIds.B]],
  );
  return result.rows;
}

export async function checkStep(
  model: Model,
  api: ReviewApi,
  outcome: StepOutcome,
) {
  const fresh = new Map<
    string,
    {
      action: string;
      company: CompanyKey | undefined;
      member: MemberKey | undefined;
    }
  >();
  for (const company of COMPANIES)
    for (const event of await genericActivity(api, company)) {
      if (model.seenActivity.has(event.id) || fresh.has(event.id)) continue;
      if (!event.action.includes('assignment')) continue;
      model.seenActivity.add(event.id);
      fresh.set(event.id, {
        action: event.action,
        company: event.companyId ? api.companyOf(event.companyId) : undefined,
        member: api.memberOf(event.membershipId),
      });
    }
  const seen = [...fresh.values()]
    .map(
      (event) =>
        `${event.action} ${event.company ?? '-'} ${event.member ?? '-'}`,
    )
    .sort();
  const wanted = outcome.events
    .filter((event) => event.action.includes('assignment'))
    .map((event) => `${event.action} ${event.company} ${event.member}`)
    .sort();
  if (canonical(seen) !== canonical(wanted))
    fail(
      'history-once',
      `Activity Log gained [${seen.join('; ')}], expected [${wanted.join('; ')}]`,
    );
  const rows = await reviewEvents(api);
  const recorded = rows.map((row) => `${row.project_id} ${row.action}`).sort();
  const expected = model.cases
    .flatMap((item) =>
      Array.from(
        { length: item.revision },
        () => `${item.projectId} project.mission_result.reviewed`,
      ),
    )
    .sort();
  if (canonical(recorded) !== canonical(expected))
    fail(
      'history-once',
      `review events are [${recorded.join(', ')}], expected [${expected.join(', ')}]`,
    );
  for (const row of rows)
    if (
      !model.cases.some(
        (item) =>
          item.projectId === row.project_id &&
          api.companyOf(row.company_id) === item.company,
      )
    )
      fail('company-isolation', `review event stored on ${row.company_id}`);
}

export async function checkEnd(model: Model, api: ReviewApi) {
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
    actor?: Actor;
    status?: number;
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

export async function openReviewWorld(
  databaseUrl: string,
): Promise<ReviewWorld> {
  const database = await createIsolatedPostgresTestDatabase({
    baseDatabaseUrl: databaseUrl,
    namePrefix: 'mission_review_fuzz',
  });
  const workspaceId = '00000000-0000-4000-8000-000000001257';
  const harness = await createPostgresRestTestHarness({
    databaseUrl: database.targetUrl,
    environment: {
      NODE_ENV: 'test',
      ACCESS_IDENTITY_MODE: 'test',
      ACCESS_BOOTSTRAP_EXTERNAL_PROVIDER: 'deterministic-test',
      ACCESS_BOOTSTRAP_EXTERNAL_SUBJECT: SUBJECTS.owner,
      ACCESS_BOOTSTRAP_WORKSPACE_ID: workspaceId,
      ACCESS_BOOTSTRAP_WORKSPACE_NAME:
        'Fictional Mission Review Fuzz Workspace',
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
          body: { displayName: 'Fictional Review Company A' },
        })
      ).id,
      'A',
    );
    const companyB = text(
      (
        await must(harness, '/companies', {
          key: 'company-B',
          body: { displayName: 'Fictional Review Company B' },
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
    const clientIds = { A: '', B: '' };
    for (const company of COMPANIES) {
      const companyId = companyIds[company];
      for (const path of OWNER_PATHS)
        await must(harness, path, {
          key: `owner-${company}-${path}`,
          body: { companyId, workspaceMembershipId: owner },
        });
      for (const member of MEMBERS)
        for (const path of MEMBER_PATHS)
          await must(harness, path, {
            key: `member-${company}-${member}-${path}`,
            body: { companyId, workspaceMembershipId: membershipIds[member] },
          });
      for (const member of MEMBERS)
        await must(harness, '/company-mission-result-reviewer-assignments', {
          key: `issued-${company}-${member}`,
          body: { companyId, workspaceMembershipId: membershipIds[member] },
        });
      const client = await must(harness, '/clients', {
        company: companyId,
        key: `client-${company}`,
        body: { displayName: `Fictional Review Client ${company}` },
      });
      clientIds[company] = text(client.id, 'client');
    }
    return { harness, database, companyIds, clientIds, membershipIds };
  } catch (error) {
    await harness.close();
    await database.close();
    throw error;
  }
}

export async function closeReviewWorld(world: ReviewWorld) {
  await world.harness.close();
  await world.database.close();
}

export async function openRun(
  world: ReviewWorld,
): Promise<{ model: Model; api: ReviewApi }> {
  await world.harness.pool.query('TRUNCATE projects CASCADE');
  const active = await world.harness.pool.query<{ entries: unknown }>(
    `SELECT coalesce(jsonb_agg(jsonb_build_array(workspace_membership_id, company_id)), '[]'::jsonb) AS entries
     FROM company_role_assignments WHERE company_id = ANY($1::uuid[]) AND revoked_at IS NULL
       AND bundle::text = 'company_mission_result_reviewer'`,
    [[world.companyIds.A, world.companyIds.B]],
  );
  const entries = active.rows[0]?.entries;
  const activeKeys = new Set(
    (Array.isArray(entries) ? entries : []).map((row) => canonical(row)),
  );
  const model: Model = {
    grants: new Map(),
    context: { ...INITIAL_CONTEXT },
    cases: [],
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
        ? '/company-mission-result-reviewer-assignments'
        : `/company-mission-result-reviewer-assignments/${world.membershipIds[member]}/${world.companyIds[company]}`;
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
  const api = new ReviewApi(world);
  for (const company of COMPANIES) {
    const created = await must(world.harness, '/projects/from-template', {
      company: world.companyIds[company],
      key: `pilot-${company}-${randomUUID()}`,
      body: {
        clientAccountId: world.clientIds[company],
        title: `Fictional review mission ${company}`,
        templateKey: pilotKey,
        templateVersion: 1,
      },
    });
    const projectId = text(created.id, 'project');
    const review = await api.send(
      'owner',
      `/projects/${projectId}/mission-result-reviews`,
      { company },
    );
    if (review.status !== 200)
      throw new Error(`Review read failed: ${short(review)}`);
    const page = object(object(review.body, 'page').review, 'review');
    const activities = page.activities;
    if (!Array.isArray(activities) || activities.length === 0)
      throw new Error(
        `Pilot project has no activities: ${JSON.stringify(review.body).slice(0, 500)}`,
      );
    const task = object(object(activities[0], 'activity').task, 'task');
    model.cases.push({
      projectId,
      company,
      taskId: text(task.id, 'task'),
      done: false,
      revision: integer(page.revision, 'revision'),
    });
  }
  for (const company of COMPANIES)
    for (const event of await genericActivity(api, company))
      model.seenActivity.add(event.id);
  return { model, api };
}
