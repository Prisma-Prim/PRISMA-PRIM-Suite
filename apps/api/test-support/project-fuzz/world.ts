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

/** Project lifecycle invariants. Authority: Project/Task PRD §21, §23 and §10. */
export const INVARIANTS = {
  'company-isolation':
    'A request reads no Project of a Company other than the one it selected (ADR 0006).',
  'identical-denial':
    'A foreign or hidden Project gets the same safe answer as a missing one (ADR 0006).',
  'revocation-denies':
    'After a revocation, the next command that needed the capture is refused, with no effect.',
  'command-authority':
    'Registration and responsibility need Project access. A lifecycle transition also needs Project Approver.',
  'history-once':
    'Each successful command adds its Project history fact. A refusal, a stale revision or a replay adds none.',
  'revisions-grow':
    'Lifecycle revisions only grow. A stale expected revision is refused.',
  lifecycle:
    'A Project starts preparatory. Activation needs a responsible member. Hold, resume, complete and cancel follow section 23. A closed Project accepts nothing.',
  'replay-receipt':
    'The exact replay of a committed key returns the saved result. The same key with another body conflicts.',
  'model-agreement':
    'Every other answer is the outcome the Project rules predict.',
} as const;
export type Invariant = keyof typeof INVARIANTS;
export class InvariantViolation extends ModelInvariantViolation<Invariant> {}

export const COMPANIES = ['A', 'B'] as const;
export type CompanyKey = (typeof COMPANIES)[number];
export const MEMBERS = ['ana', 'bogdan', 'cora'] as const;
export type MemberKey = (typeof MEMBERS)[number];
export const BUNDLES = ['project', 'approver'] as const;
export type Bundle = (typeof BUNDLES)[number];
export type Actor = MemberKey | 'owner';
export type Phase =
  'created' | 'assigned' | 'active' | 'held' | 'resumed' | 'closed';
export type Status =
  'preparatory' | 'active' | 'on_hold' | 'completed' | 'cancelled';
export const MISSING_ID = '00000000-0000-4000-8000-000000001253';
const SUBJECTS: Record<Actor, string> = {
  owner: 'workspace-owner',
  ana: 'project-ana',
  bogdan: 'project-bogdan',
  cora: 'project-cora',
};
const BUNDLE_NOUNS: Record<Bundle, string> = {
  project: 'company-project',
  approver: 'company-project-approver',
};
const INITIAL_GRANTS: Record<
  MemberKey,
  Record<CompanyKey, readonly Bundle[]>
> = {
  ana: { A: ['project', 'approver'], B: ['project'] },
  bogdan: { A: ['approver'], B: ['project', 'approver'] },
  cora: { A: ['project'], B: ['approver'] },
};
const INITIAL_CONTEXT: Record<MemberKey, CompanyKey> = {
  ana: 'A',
  bogdan: 'A',
  cora: 'B',
};
const NATIVE = [
  '/company-context-assignments',
  '/company-director-client-assignments',
] as const;
const OWNER_PREP = [
  ...NATIVE,
  '/company-project-assignments',
  '/company-project-approver-assignments',
] as const;

export interface ProjectModel {
  id: string;
  company: CompanyKey;
  title: string;
  phase: Phase;
  status: Status;
  lifecycleRevision: number;
  responsibilityRevision: number;
}
export interface Committed {
  member: MemberKey;
  company: CompanyKey;
  key: string;
  path: string;
  method: 'POST' | 'PUT';
  body: unknown;
  receipt: unknown;
  status: number;
}
export interface ExpectedEvent {
  action: string;
  company: CompanyKey;
  member: MemberKey | 'owner';
}
export interface Model {
  grants: Map<string, 'active' | 'revoked' | 'absent'>;
  context: Record<MemberKey, CompanyKey>;
  projects: ProjectModel[];
  serial: Record<CompanyKey, number>;
  committed: Committed[];
  seenActivity: Set<string>;
}
export interface StepOutcome {
  events: ExpectedEvent[];
}
export interface ProjectWorld {
  harness: PostgresRestTestHarness;
  database: IsolatedPostgresTestDatabase;
  companyIds: Record<CompanyKey, string>;
  clientIds: Record<CompanyKey, string>;
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

export class ProjectApi {
  private keys = 0;
  constructor(readonly world: ProjectWorld) {}
  nextKey() {
    this.keys += 1;
    return `fuzz-${this.keys}`;
  }
  companyOf(id: unknown): CompanyKey | undefined {
    return COMPANIES.find((company) => this.world.companyIds[company] === id);
  }
  memberOf(id: unknown): MemberKey | 'owner' | undefined {
    if (id === this.world.membershipIds.owner) return 'owner';
    return MEMBERS.find((member) => this.world.membershipIds[member] === id);
  }
  async send(
    actor: Actor,
    path: string,
    options: {
      method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
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

async function genericActivity(api: ProjectApi, company: CompanyKey) {
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
    const actor = object(event.actor, 'actor');
    return {
      id: text(event.id, 'id'),
      action,
      companyId:
        typeof target.companyId === 'string' ? target.companyId : undefined,
      membershipId: target.workspaceMembershipId ?? actor.workspaceMembershipId,
    };
  });
}

export async function checkStep(
  model: Model,
  api: ProjectApi,
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
        !event.action.startsWith('project') &&
        !event.action.includes('assignment')
      )
        continue;
      fresh.set(event.id, event);
      model.seenActivity.add(event.id);
    }
  const label = (action: string, company: string, member: string) =>
    action.startsWith('project.')
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

export async function checkEnd(model: Model, api: ProjectApi) {
  await checkStep(model, api, { events: [] });
  for (const project of model.projects) {
    const reply = await api.send('owner', `/projects/${project.id}/lifecycle`, {
      company: project.company,
    });
    if (reply.status !== 200)
      fail(
        'model-agreement',
        `owner cannot read ${project.id}: ${short(reply)}`,
      );
    const body = object(reply.body, 'lifecycle');
    if (
      body.status !== project.status ||
      integer(body.lifecycleRevision, 'revision') !== project.lifecycleRevision
    )
      fail(
        'lifecycle',
        `${project.id} reads ${canonical(body.status)}/${canonical(body.lifecycleRevision)}, model has ${project.status}/${project.lifecycleRevision}`,
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

export async function openProjectWorld(
  databaseUrl: string,
): Promise<ProjectWorld> {
  const database = await createIsolatedPostgresTestDatabase({
    baseDatabaseUrl: databaseUrl,
    namePrefix: 'project_fuzz',
  });
  const workspaceId = '00000000-0000-4000-8000-000000001253';
  const harness = await createPostgresRestTestHarness({
    databaseUrl: database.targetUrl,
    environment: {
      NODE_ENV: 'test',
      ACCESS_IDENTITY_MODE: 'test',
      ACCESS_BOOTSTRAP_EXTERNAL_PROVIDER: 'deterministic-test',
      ACCESS_BOOTSTRAP_EXTERNAL_SUBJECT: SUBJECTS.owner,
      ACCESS_BOOTSTRAP_WORKSPACE_ID: workspaceId,
      ACCESS_BOOTSTRAP_WORKSPACE_NAME: 'Fictional Project Fuzz Workspace',
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
          body: { displayName: 'Fictional Project Company A' },
        })
      ).id,
      'company A',
    );
    const companyB = text(
      (
        await must(harness, '/companies', {
          key: 'company-B',
          body: { displayName: 'Fictional Project Company B' },
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
    for (const companyId of [companyA, companyB])
      for (const actor of ['owner', ...MEMBERS] as const)
        for (const path of actor === 'owner' ? OWNER_PREP : NATIVE)
          await must(harness, path, {
            key: `native-${companyId}-${actor}-${path}`,
            body: { companyId, workspaceMembershipId: membershipIds[actor] },
          });
    for (const companyId of [companyA, companyB])
      for (const member of MEMBERS)
        for (const bundle of BUNDLES)
          await must(harness, bundleAssignments(bundle), {
            key: `issued-${companyId}-${member}-${bundle}`,
            body: { companyId, workspaceMembershipId: membershipIds[member] },
          });
    const clientIds = { A: '', B: '' };
    for (const company of COMPANIES) {
      const client = await must(harness, '/clients', {
        company: companyIds[company],
        key: `client-${company}`,
        body: { displayName: `Fictional Project Client ${company}` },
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

export async function closeProjectWorld(world: ProjectWorld) {
  await world.harness.close();
  await world.database.close();
}

export async function openRun(
  world: ProjectWorld,
): Promise<{ model: Model; api: ProjectApi }> {
  await world.harness.pool.query('TRUNCATE projects CASCADE');
  const active = await world.harness.pool.query<{ entries: unknown }>(
    `SELECT coalesce(jsonb_agg(jsonb_build_array(workspace_membership_id, company_id, bundle::text)), '[]'::jsonb) AS entries
     FROM company_role_assignments
     WHERE company_id = ANY($1::uuid[]) AND revoked_at IS NULL
       AND bundle::text IN ('company_project_access', 'company_project_approver')`,
    [[world.companyIds.A, world.companyIds.B]],
  );
  const entries = active.rows[0]?.entries;
  const activeKeys = new Set(
    (Array.isArray(entries) ? entries : []).map((row) => canonical(row)),
  );
  const model: Model = {
    grants: new Map(),
    context: { ...INITIAL_CONTEXT },
    projects: [],
    serial: { A: 0, B: 0 },
    committed: [],
    seenActivity: new Set(),
  };
  const bundleDb: Record<Bundle, string> = {
    project: 'company_project_access',
    approver: 'company_project_approver',
  };
  for (const member of MEMBERS)
    for (const company of COMPANIES)
      for (const bundle of BUNDLES) {
        const wanted = INITIAL_GRANTS[member][company].includes(bundle);
        const isActive = activeKeys.has(
          canonical([
            world.membershipIds[member],
            world.companyIds[company],
            bundleDb[bundle],
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
  const api = new ProjectApi(world);
  for (const company of COMPANIES)
    for (const event of await genericActivity(api, company))
      model.seenActivity.add(event.id);
  return { model, api };
}
