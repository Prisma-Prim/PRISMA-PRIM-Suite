import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { openDocumentScannerFixture } from '../../src/documents/document-scanner.test-support.js';
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
 * Invariants checked after every Certification Case fuzz step. Authority is
 * the Certification Case PRD §5, §9, §10, §11 and §12. REST answers and a
 * read of `certification_events` prove them. The event read writes nothing.
 */
export const INVARIANTS = {
  'company-isolation':
    "A request reads no Case of a Company other than the one it selected, and the generic Activity Log does not show another Company's certification events (ADR 0006; Certification Case PRD §5, §10).",
  'identical-denial':
    'A foreign or hidden Case gets the same safe answer as a missing one (ADR 0006; Certification Case PRD §10).',
  'revocation-denies':
    'After a revocation, the next command that needed the revoked capture is refused, with no effect (Certification Case PRD §11).',
  'command-authority':
    'Opening and preparation need Programme Manager. Team approval, dossier review, the decision and the Certificate need Approver. Stage reports and the recommendation need Auditor. Reader is required as well. Another bundle does not stand in (Certification Case PRD §11).',
  'history-once':
    'Each successful command adds exactly one Certification history fact; a refusal, a stale revision or a replay adds none (Certification Case PRD §12).',
  'revisions-grow':
    'Case revisions only grow. A stale expected revision is refused (Certification Case PRD §9).',
  'step-order':
    'A step is refused until its predecessors hold. Rejecting the application closes the Case, and a closed Case accepts nothing. An order reference is unique in the Company. The Certificate follows a granting decision (Certification Case PRD §9, §10).',
  'replay-receipt':
    'The exact replay of a committed key returns the saved receipt. The same key with another body conflicts. A refused command reserves no key (Certification Case PRD §9).',
  'model-agreement':
    'Every other answer is the outcome the PRD predicts (Certification Case PRD §9–§12).',
} as const;
export type Invariant = keyof typeof INVARIANTS;
export class InvariantViolation extends ModelInvariantViolation<Invariant> {}

export const COMPANIES = ['A', 'B'] as const;
export type CompanyKey = (typeof COMPANIES)[number];
export const MEMBERS = ['ana', 'bogdan', 'cora'] as const;
export type MemberKey = (typeof MEMBERS)[number];
export const BUNDLES = ['reader', 'manager', 'approver', 'auditor'] as const;
export type Bundle = (typeof BUNDLES)[number];
export type Actor = MemberKey | 'owner';
const CLOCK = new Date('2026-11-07T08:00:00.000Z');
export const MISSING_ID = '00000000-0000-4000-8000-000000001247';
const SUBJECTS: Record<Actor, string> = {
  owner: 'workspace-owner',
  ana: 'certification-ana',
  bogdan: 'certification-bogdan',
  cora: 'certification-cora',
};
const BUNDLE_NOUNS: Record<Bundle, string> = {
  reader: 'company-certification-reader',
  manager: 'company-certification-programme-manager',
  approver: 'company-certification-approver',
  auditor: 'company-certification-auditor',
};
const INITIAL_GRANTS: Record<
  MemberKey,
  Record<CompanyKey, readonly Bundle[]>
> = {
  ana: {
    A: ['reader', 'manager', 'approver'],
    B: ['reader', 'manager'],
  },
  bogdan: {
    A: ['reader', 'approver'],
    B: ['reader', 'manager', 'approver'],
  },
  cora: { A: ['reader', 'auditor'], B: ['reader', 'auditor'] },
};
const INITIAL_CONTEXT: Record<MemberKey, CompanyKey> = {
  ana: 'A',
  bogdan: 'A',
  cora: 'B',
};
const NATIVE = [
  '/company-context-assignments',
  '/company-director-client-assignments',
  '/company-project-assignments',
  // Attaching a received audit source requires this capture in addition to
  // Programme Manager. It is not one of the four certification bundles.
  '/company-document-registrar-assignments',
  '/company-received-audit-source-access-assignments',
  '/company-document-content-reader-assignments',
] as const;
const OWNER_PREP = [
  ...NATIVE,
  '/company-document-registrar-assignments',
  '/company-received-audit-source-access-assignments',
  '/company-document-content-reader-assignments',
  '/company-document-content-uploader-assignments',
  '/company-document-approver-assignments',
  '/company-certification-reader-assignments',
  '/company-certification-programme-manager-assignments',
] as const;
const SOURCES_PER_COMPANY = 8;
const PDF = readFileSync(
  resolve('test-support/fixtures/questionnaire-demo.pdf'),
);

export type Phase =
  | 'opened'
  | 'applied'
  | 'accepted'
  | 'duration'
  | 'agreement-doc'
  | 'agreed'
  | 'team'
  | 'approved'
  | 's1-plan-doc'
  | 's1-planned'
  | 's1-report-doc'
  | 's1-reported'
  | 's2-plan-doc'
  | 's2-planned'
  | 's2-report-doc'
  | 's2-reported'
  | 'recommended'
  | 'reviewed'
  | 'decided'
  | 'data-doc'
  | 'data'
  | 'draft-doc'
  | 'drafted'
  | 'opined'
  | 'release-approved'
  | 'certificate-doc'
  | 'certified'
  | 'rejected';

export interface AuditSource {
  documentId: string;
  versionId: string;
  representationId: string;
}
export interface CompanySetup {
  clientId: string;
  entityId: string;
  projectId: string;
  sources: AuditSource[];
}
export interface CaseModel {
  id: string;
  company: CompanyKey;
  orderReference: string;
  revision: number;
  phase: Phase;
  status: 'open' | 'rejected' | 'certified';
  nextStep: string | null;
  attachmentId: string | null;
  versions: {
    decision: string | null;
    data: string | null;
    draft: string | null;
  };
  events: string[];
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
export interface RefusedKey {
  member: MemberKey;
  key: string;
}
export interface ExpectedEvent {
  action: string;
  company: CompanyKey;
  member: MemberKey;
}
export interface Model {
  grants: Map<string, 'active' | 'revoked' | 'absent'>;
  context: Record<MemberKey, CompanyKey>;
  cases: CaseModel[];
  sourceCursor: Record<CompanyKey, number>;
  serial: Record<CompanyKey, number>;
  committed: Committed[];
  refused: RefusedKey[];
  revisions: Map<string, number>;
  seenActivity: Set<string>;
}
export interface StepOutcome {
  touched: CaseModel[];
  events: ExpectedEvent[];
}
export interface CertificationWorld {
  harness: PostgresRestTestHarness;
  database: IsolatedPostgresTestDatabase;
  scanner: { close(): Promise<void> };
  companyIds: Record<CompanyKey, string>;
  membershipIds: Record<Actor, string>;
  companies: Record<CompanyKey, CompanySetup>;
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

export class CertificationApi {
  private keys = 0;
  constructor(readonly world: CertificationWorld) {}
  nextKey() {
    this.keys += 1;
    return `fuzz-${this.keys}`;
  }
  get companyIds() {
    return this.world.companyIds;
  }
  get membershipIds() {
    return this.world.membershipIds;
  }
  companyOf(id: unknown): CompanyKey | undefined {
    const found = COMPANIES.find(
      (company) => this.world.companyIds[company] === id,
    );
    return found;
  }
  memberOf(id: unknown): MemberKey | undefined {
    const found = MEMBERS.find(
      (member) => this.world.membershipIds[member] === id,
    );
    return found;
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

export async function expectCase(
  model: Model,
  api: CertificationApi,
  item: CaseModel,
) {
  const reply = await api.send('owner', `/certification-cases/${item.id}`, {
    company: item.company,
  });
  if (reply.status !== 200)
    fail(
      'model-agreement',
      `the auditor cannot read ${item.id}: ${short(reply)}`,
    );
  const seen = object(reply.body, 'the Case');
  if (api.companyOf(seen.companyId) !== item.company)
    fail(
      'company-isolation',
      `Case ${item.id} reads as Company ${canonical(seen.companyId)}`,
    );
  const revision = integer(seen.revision, 'revision');
  const highest = model.revisions.get(item.id) ?? 0;
  if (revision < highest)
    fail(
      'revisions-grow',
      `Case ${item.id} fell from revision ${highest} to ${revision}`,
    );
  model.revisions.set(item.id, revision);
  if (
    revision !== item.revision ||
    seen.status !== item.status ||
    seen.nextStep !== item.nextStep
  )
    fail(
      'step-order',
      `Case ${item.id} reads as revision ${revision} ${canonical(seen.status)}/${canonical(seen.nextStep)}, the model has ${item.revision} ${item.status}/${canonical(item.nextStep)}`,
    );
}

async function expectEvents(model: Model, api: CertificationApi) {
  const result = await api.world.harness.pool.query<{
    case_id: string;
    action: string;
    company_id: string;
  }>(
    `SELECT case_id, action, company_id FROM certification_events
     WHERE company_id = ANY($1::uuid[]) ORDER BY occurred_at, id`,
    [[api.companyIds.A, api.companyIds.B]],
  );
  const seen = result.rows.map((row) => `${row.case_id} ${row.action}`).sort();
  const wanted = model.cases
    .flatMap((item) => item.events.map((action) => `${item.id} ${action}`))
    .sort();
  if (canonical(seen) !== canonical(wanted))
    fail(
      'history-once',
      `case events are [${seen.join(', ')}], expected [${wanted.join(', ')}]`,
    );
  for (const row of result.rows) {
    const item = model.cases.find((candidate) => candidate.id === row.case_id);
    if (!item || api.companyOf(row.company_id) !== item.company)
      fail(
        'company-isolation',
        `event ${row.action} is stored on ${row.company_id}`,
      );
  }
}

async function genericActivity(api: CertificationApi, company: CompanyKey) {
  const reply = await api.send('owner', '/activity-log', { company });
  if (reply.status !== 200)
    fail('model-agreement', `Activity Log failed: ${short(reply)}`);
  const events = object(reply.body, 'Activity Log').events;
  if (!Array.isArray(events))
    fail('model-agreement', 'Activity Log has no events');
  const page = events;
  return page.map((value) => {
    const event = object(value, 'an event');
    const action = text(event.action, 'action');
    const target = object(event.target, 'target');
    if (
      action.startsWith('certification') &&
      api.companyOf(target.companyId) !== company
    )
      fail(
        'company-isolation',
        `Company ${company} shows ${action} of ${canonical(target.companyId)}`,
      );
    return {
      id: text(event.id, 'id'),
      action,
      company: api.companyOf(target.companyId),
      membershipId: target.workspaceMembershipId,
    };
  });
}

async function expectActivity(
  model: Model,
  api: CertificationApi,
  expected: ExpectedEvent[],
) {
  const fresh = new Map<
    string,
    { action: string; company: CompanyKey | undefined; membershipId: unknown }
  >();
  for (const company of COMPANIES)
    for (const event of await genericActivity(api, company)) {
      if (model.seenActivity.has(event.id) || fresh.has(event.id)) continue;
      if (event.action.startsWith('certification')) continue;
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
    .map((event) => `${event.action} ${event.company} ${event.member}`)
    .sort();
  if (canonical(seen) !== canonical(wanted))
    fail(
      'history-once',
      `Activity Log gained [${seen.join('; ')}], expected [${wanted.join('; ')}]`,
    );
}

export async function checkStep(
  model: Model,
  api: CertificationApi,
  outcome: StepOutcome,
) {
  await expectActivity(model, api, outcome.events);
  await expectEvents(model, api);
  for (const item of new Set(outcome.touched))
    await expectCase(model, api, item);
}
export async function checkEnd(model: Model, api: CertificationApi) {
  await expectEvents(model, api);
  for (const item of model.cases) await expectCase(model, api, item);
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
function idOf(value: unknown, what: string) {
  return text(object(value, what).id, `${what} id`);
}

async function uploadPdf(
  harness: PostgresRestTestHarness,
  companyId: string,
  documentId: string,
  versionId: string,
) {
  const response = await fetch(
    `${harness.origin}/api/documents/${documentId}/versions/${versionId}/content?expectedRevision=1&fileName=signed-original.pdf`,
    {
      method: 'POST',
      headers: {
        'x-test-external-provider': 'deterministic-test',
        'x-test-external-subject': SUBJECTS.owner,
        'x-test-display-name': SUBJECTS.owner,
        'x-test-email': `${SUBJECTS.owner}@example.test`,
        'x-company-context-id': companyId,
        'content-type': 'application/pdf',
        'idempotency-key': randomUUID(),
      },
      body: new Uint8Array(PDF),
    },
  );
  const reply = await readReply(response);
  if (reply.status !== 201)
    throw new Error(`Fuzz setup upload failed: ${short(reply)}`);
  return text(object(reply.body, 'upload').representationId, 'representation');
}

async function prepareCompany(
  harness: PostgresRestTestHarness,
  companyId: string,
  company: CompanyKey,
): Promise<CompanySetup> {
  const client = await must(harness, '/clients', {
    company: companyId,
    key: `client-${company}`,
    body: { displayName: `Fictional Certification Client ${company}` },
  });
  const entity = object(
    (
      await must(harness, `/clients/${idOf(client, 'client')}/legal-entities`, {
        company: companyId,
        key: `entity-${company}`,
        body: {
          expectedClientVersion: 1,
          legalName: `Fictional Legal Entity ${company}`,
          taxId: null,
          legalAddress: '1 Example Street, Demo City',
        },
      })
    ).legalEntity,
    'legal entity',
  );
  const project = await must(harness, '/projects', {
    company: companyId,
    key: `project-${company}`,
    body: {
      title: `Fictional certification order ${company}`,
      clientAccountId: idOf(client, 'client'),
    },
  });
  const sources: AuditSource[] = [];
  for (let index = 0; index < SOURCES_PER_COMPANY; index += 1) {
    const document = await must(harness, '/documents', {
      company: companyId,
      key: `source-${company}-${index}`,
      body: {
        type: 'received-audit-source',
        clientId: idOf(client, 'client'),
        title: `Fictional signed original ${company} ${index}`,
        purpose: 'Fictional signed original for a certification fuzz',
      },
    });
    const documentId = idOf(document, 'document');
    const versionId = idOf(object(document.version, 'version'), 'version');
    const representationId = await uploadPdf(
      harness,
      companyId,
      documentId,
      versionId,
    );
    await must(
      harness,
      `/documents/${documentId}/versions/${versionId}/official-designation`,
      {
        company: companyId,
        key: `designate-${company}-${index}`,
        status: 200,
        body: { expectedRevision: 2 },
      },
    );
    sources.push({ documentId, versionId, representationId });
  }
  return {
    clientId: idOf(client, 'client'),
    entityId: text(entity.id, 'entity id'),
    projectId: idOf(project, 'project'),
    sources,
  };
}

export async function openCertificationWorld(
  databaseUrl: string,
): Promise<CertificationWorld> {
  const scanner = await openDocumentScannerFixture();
  const database = await createIsolatedPostgresTestDatabase({
    baseDatabaseUrl: databaseUrl,
    namePrefix: 'certification_fuzz',
  });
  const workspaceId = '00000000-0000-4000-8000-000000001247';
  let harness: PostgresRestTestHarness | undefined;
  try {
    harness = await createPostgresRestTestHarness({
      databaseUrl: database.targetUrl,
      serverClock: { now: () => new Date(CLOCK) },
      environment: {
        NODE_ENV: 'test',
        ACCESS_IDENTITY_MODE: 'test',
        ACCESS_BOOTSTRAP_EXTERNAL_PROVIDER: 'deterministic-test',
        ACCESS_BOOTSTRAP_EXTERNAL_SUBJECT: SUBJECTS.owner,
        ACCESS_BOOTSTRAP_WORKSPACE_ID: workspaceId,
        ACCESS_BOOTSTRAP_WORKSPACE_NAME:
          'Fictional Certification Fuzz Workspace',
        ACCESS_ACCEPTED_INVITATIONS_JSON: JSON.stringify(
          MEMBERS.map((member) => ({
            provider: 'deterministic-test',
            subject: SUBJECTS[member],
            workspaceId,
          })),
        ),
        ...scanner.environment,
      },
    });
    const companyA = idOf(
      await must(harness, '/companies', {
        key: 'company-A',
        body: { displayName: 'Fictional Certification Company A' },
      }),
      'company A',
    );
    const companyB = idOf(
      await must(harness, '/companies', {
        key: 'company-B',
        body: { displayName: 'Fictional Certification Company B' },
      }),
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
    const companies = {
      A: await prepareCompany(harness, companyA, 'A'),
      B: await prepareCompany(harness, companyB, 'B'),
    };
    return { harness, database, scanner, companyIds, membershipIds, companies };
  } catch (error) {
    await harness?.close();
    await database.close();
    await scanner.close();
    throw error;
  }
}

export async function closeCertificationWorld(world: CertificationWorld) {
  await world.harness.close();
  await world.database.close();
  await world.scanner.close();
}

export async function openRun(
  world: CertificationWorld,
): Promise<{ model: Model; api: CertificationApi }> {
  await world.harness.pool.query('TRUNCATE certification_cases CASCADE');
  const active = await world.harness.pool.query<{ entries: unknown }>(
    `SELECT coalesce(jsonb_agg(jsonb_build_array(workspace_membership_id, company_id, bundle::text)), '[]'::jsonb) AS entries
     FROM company_role_assignments
     WHERE company_id = ANY($1::uuid[]) AND revoked_at IS NULL
       AND bundle::text IN (
         'company_certification_reader',
         'company_certification_programme_manager',
         'company_certification_approver',
         'company_certification_auditor'
       )`,
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
    sourceCursor: { A: 0, B: 0 },
    serial: { A: 0, B: 0 },
    committed: [],
    refused: [],
    revisions: new Map(),
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
            BUNDLE_NOUNS[bundle].replaceAll('-', '_'),
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
  const api = new CertificationApi(world);
  for (const company of COMPANIES)
    for (const event of await genericActivity(api, company))
      model.seenActivity.add(event.id);
  return { model, api };
}
