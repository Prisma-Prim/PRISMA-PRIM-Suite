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
 * Invariants checked after every Contract fuzz step. Authority is Contract
 * execution PRD §19.3–§19.13. REST answers and a read of `contract_events`
 * prove them. The event read writes nothing.
 */
export const INVARIANTS = {
  'company-isolation':
    "A request reads no Contract or Opportunity of a Company other than the one it selected, and the generic Activity Log does not show another Company's contract events (ADR 0006; Contract PRD §19.6, §19.12).",
  'identical-denial':
    'A foreign or hidden Contract or Opportunity gets the same safe answer as a missing one (ADR 0006; Contract PRD §19.13).',
  'revocation-denies':
    'After a revocation, the next command that needed the revoked capture is refused, with no effect (Contract PRD §19.6).',
  'command-authority':
    'Preparation needs Company Contract Preparer. Approval, rejection and signature need Company Contract Approver. The other bundle does not stand in (Contract PRD §19.6).',
  'history-once':
    'Each successful command adds exactly the §19.12 events; a refusal, a quality run, a stale revision or a replay adds none (Contract PRD §19.12, §19.13).',
  'revisions-grow':
    'Contract revisions only grow (Contract PRD §19.4, §19.13).',
  'one-contract':
    'An Opportunity has at most one Contract of a kind. A second create is refused. Direct creation is refused once an Accepted Offer exists, and creation from an Offer is refused when that Offer is not accepted (Contract PRD §19.3, §19.4).',
  'version-state':
    'The head starts PENDING and NOT_EXECUTED. Approve and Reject apply only to a PENDING head. Signature applies only to an APPROVED, NOT_EXECUTED head and yields EXECUTED. A new version is refused once any version is EXECUTED, and a superseded version accepts no decision (Contract PRD §19.4, §19.8, §19.9).',
  'project-link':
    'A Project link is refused until the Contract is executed (Contract PRD §19.11).',
  'replay-receipt':
    'The exact replay of a committed key returns the same result. The same key with another body conflicts. A refused command reserves no key (Contract PRD §19.13).',
  'model-agreement':
    'Every other answer is the outcome the PRD predicts (Contract PRD §19.4–§19.13).',
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
const CLOCK = new Date('2026-11-09T12:00:00.000Z');
export const SIGNED_ON = '2026-11-09';
export const MISSING_ID = '00000000-0000-4000-8000-000000001245';
const SUBJECTS: Record<Actor, string> = {
  owner: 'workspace-owner',
  ana: 'contract-ana',
  bogdan: 'contract-bogdan',
  cora: 'contract-cora',
};
const BUNDLE_NOUNS: Record<Bundle, string> = {
  preparer: 'company-contract-preparer',
  approver: 'company-contract-approver',
};
const INITIAL_GRANTS: Record<
  MemberKey,
  Record<CompanyKey, readonly Bundle[]>
> = {
  ana: { A: ['preparer', 'approver'], B: ['preparer'] },
  bogdan: { A: ['approver'], B: ['preparer', 'approver'] },
  cora: { A: ['preparer'], B: ['approver'] },
};
const INITIAL_CONTEXT: Record<MemberKey, CompanyKey> = {
  ana: 'A',
  bogdan: 'A',
  cora: 'B',
};
/** Native grants the Contract commands also require, and which the fuzz does not revoke. */
const NATIVE = [
  '/company-context-assignments',
  '/company-director-client-assignments',
  '/company-commercial-intake-assignments',
  '/company-offer-preparer-assignments',
  '/company-project-assignments',
] as const;
const OWNER_PREP = [
  ...NATIVE,
  '/company-service-catalogue-assignments',
  '/company-pricing-configuration-assignments',
  '/company-pricing-user-assignments',
  '/company-offer-approver-assignments',
  '/company-contract-preparer-assignments',
] as const;

export type Origin = 'DIRECT' | 'ACCEPTED_OFFER';
export type Decision = 'PENDING' | 'APPROVED' | 'REJECTED';
export type Execution = 'NOT_EXECUTED' | 'EXECUTED';

export interface SourceModel {
  company: CompanyKey;
  opportunityId: string;
  clientId: string;
  snapshotId: string;
  acceptedOfferVersionId: string | null;
  /** An Offer version that exists and is not accepted. */
  pendingOfferVersionId: string | null;
  projectId: string;
}

export interface ContractModel {
  id: string;
  company: CompanyKey;
  opportunityId: string;
  origin: Origin;
  snapshotId: string;
  revision: number;
  headVersionId: string;
  headNumber: number;
  decision: Decision;
  execution: Execution;
  linked: boolean;
  /** Actions recorded for this Contract, oldest first. */
  events: string[];
}

export interface Committed {
  member: MemberKey;
  company: CompanyKey;
  key: string;
  method: 'POST';
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
  contracts: ContractModel[];
  committed: Committed[];
  refused: RefusedKey[];
  revisions: Map<string, number>;
  seenActivity: Set<string>;
}
export interface StepOutcome {
  touched: ContractModel[];
  events: ExpectedEvent[];
}
export interface ContractWorld {
  harness: PostgresRestTestHarness;
  database: IsolatedPostgresTestDatabase;
  companyIds: Record<CompanyKey, string>;
  membershipIds: Record<Actor, string>;
  sources: SourceModel[];
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
  return (
    (model.grants.get(grantKey(member, company, bundle)) ?? 'absent') ===
    'active'
  );
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
export function warningsFor(origin: Origin): string[] {
  return origin === 'DIRECT' ? ['DIRECT_ORIGIN_REVIEWED'] : [];
}

export class ContractApi {
  private keys = 0;
  constructor(readonly world: ContractWorld) {}
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
  companyOf(companyId: unknown): CompanyKey | undefined {
    return COMPANIES.find((company) => this.companyIds[company] === companyId);
  }
  memberOf(membershipId: unknown): MemberKey | undefined {
    return MEMBERS.find(
      (member) => this.membershipIds[member] === membershipId,
    );
  }
}

export function object(value: unknown, what: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new InvariantViolation(
      'model-agreement',
      `${what} is no object: ${canonical(value)}`,
    );
  return Object.fromEntries(Object.entries(value));
}
export function text(value: unknown, what: string): string {
  if (typeof value !== 'string' || value.length === 0)
    throw new InvariantViolation('model-agreement', `${what} is no string`);
  return value;
}
export function integer(value: unknown, what: string): number {
  if (typeof value === 'number' && Number.isSafeInteger(value)) return value;
  throw new InvariantViolation('model-agreement', `${what} is no integer`);
}

function fail(invariant: Invariant, detail: string): never {
  throw new InvariantViolation(invariant, detail);
}

export async function expectContract(
  model: Model,
  api: ContractApi,
  contract: ContractModel,
) {
  const reply = await api.send(
    'owner',
    `/contracts/opportunities/${contract.opportunityId}`,
    { company: contract.company },
  );
  if (reply.status !== 200)
    fail(
      'model-agreement',
      `the auditor cannot read ${contract.id}: ${short(reply)}`,
    );
  const page = object(reply.body, 'the Opportunity contracts');
  const seen =
    page.contract === null ? null : object(page.contract, 'the Contract');
  if (!seen)
    fail(
      'one-contract',
      `Contract ${contract.id} is missing from its Opportunity`,
    );
  if (
    text(seen.id, 'id') !== contract.id ||
    api.companyOf(seen.companyId) !== contract.company
  )
    fail(
      'company-isolation',
      `Opportunity read returned ${canonical(seen.id)} for ${contract.company}`,
    );
  const version = object(seen.version, 'the head version');
  const revision = integer(seen.revision, 'revision');
  const highest = model.revisions.get(contract.id) ?? 0;
  if (revision < highest)
    fail(
      'revisions-grow',
      `Contract ${contract.id} fell from revision ${highest} to ${revision}`,
    );
  model.revisions.set(contract.id, revision);
  if (
    revision !== contract.revision ||
    text(version.id, 'version id') !== contract.headVersionId ||
    version.decisionState !== contract.decision ||
    version.executionState !== contract.execution ||
    seen.origin !== contract.origin
  )
    fail(
      'version-state',
      `Contract ${contract.id} reads as revision ${revision} ${canonical(version.decisionState)}/${canonical(version.executionState)}, the model has ${contract.revision} ${contract.decision}/${contract.execution}`,
    );
}

async function expectEvents(model: Model, api: ContractApi) {
  const result = await api.world.harness.pool.query<{
    contract_id: string;
    action: string;
    company_id: string;
  }>(
    `SELECT contract_id, action, company_id FROM contract_events
     WHERE company_id = ANY($1::uuid[]) ORDER BY occurred_at, id`,
    [[api.companyIds.A, api.companyIds.B]],
  );
  const seen = result.rows
    .map((row) => `${row.contract_id} ${row.action}`)
    .sort();
  const wanted = model.contracts
    .flatMap((contract) =>
      contract.events.map((action) => `${contract.id} ${action}`),
    )
    .sort();
  if (canonical(seen) !== canonical(wanted))
    fail(
      'history-once',
      `contract events are [${seen.join(', ')}], expected [${wanted.join(', ')}]`,
    );
  for (const row of result.rows) {
    const contract = model.contracts.find(
      (item) => item.id === row.contract_id,
    );
    if (!contract || api.companyOf(row.company_id) !== contract.company)
      fail(
        'company-isolation',
        `event ${row.action} is stored on ${row.company_id}`,
      );
  }
}

async function genericActivity(api: ContractApi, company: CompanyKey) {
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
    if (
      action.startsWith('contract') &&
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
  api: ContractApi,
  expected: ExpectedEvent[],
) {
  const fresh = new Map<
    string,
    { action: string; company: CompanyKey | undefined; membershipId: unknown }
  >();
  for (const company of COMPANIES)
    for (const event of await genericActivity(api, company)) {
      if (model.seenActivity.has(event.id) || fresh.has(event.id)) continue;
      if (event.action.startsWith('contract')) continue;
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
  api: ContractApi,
  outcome: StepOutcome,
) {
  await expectActivity(model, api, outcome.events);
  await expectEvents(model, api);
  for (const contract of new Set(outcome.touched))
    await expectContract(model, api, contract);
}
export async function checkEnd(model: Model, api: ContractApi) {
  await expectEvents(model, api);
  for (const contract of model.contracts)
    await expectContract(model, api, contract);
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
function published(value: Record<string, unknown>, what: string) {
  if (value.outcome !== 'PUBLISHED')
    throw new Error(`${what} was not published.`);
  const version = object(value.version, what);
  const versionNumber = version.versionNumber;
  if (typeof versionNumber !== 'number')
    throw new Error(`${what} has no version.`);
  return versionNumber;
}

interface Catalogue {
  ruleVersion: number;
  offeringId: string;
  tariffVersion: number;
}

async function prepareCatalogue(
  harness: PostgresRestTestHarness,
  companyId: string,
  company: CompanyKey,
): Promise<Catalogue> {
  const rule = await must(harness, '/pricing-configuration/rule-versions', {
    company: companyId,
    key: `rule-${company}`,
    body: {
      label: `Fictional rule ${company}`,
      effectiveFrom: CLOCK.toISOString(),
      expectedActiveVersionNumber: null,
    },
  });
  const definition = object(
    (
      await must(harness, '/commercial-catalogue/service-definitions', {
        company: companyId,
        key: `definition-${company}`,
        body: {
          code: `FUZZ${company}`,
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
          serviceDefinitionId: idOf(definition, 'definition'),
          commercialLabel: null,
        },
      })
    ).offering,
    'offering',
  );
  const tariff = await must(
    harness,
    `/pricing-configuration/offerings/${idOf(offering, 'offering')}/tariff-versions`,
    {
      company: companyId,
      key: `tariff-${company}`,
      body: {
        unit: 'unit',
        unitAmount: '100.0000',
        currency: 'EUR',
        taxRatePercent: '19.00',
        taxLabel: 'Fictional tax',
        effectiveFrom: CLOCK.toISOString(),
        expectedActiveVersionNumber: null,
      },
    },
  );
  return {
    ruleVersion: published(rule, 'rule'),
    offeringId: idOf(offering, 'offering'),
    tariffVersion: published(tariff, 'tariff'),
  };
}

async function prepareSource(
  harness: PostgresRestTestHarness,
  companyId: string,
  company: CompanyKey,
  index: number,
  offerState: 'none' | 'pending' | 'accepted',
  catalogue: Catalogue,
): Promise<SourceModel> {
  const suffix = `${company}${index}`;
  const client = await must(harness, '/clients', {
    company: companyId,
    key: `client-${suffix}`,
    body: {
      displayName: `Fictional Contract Client ${suffix}`,
      taxId: `FICT-C-${suffix}`,
      address: '1245 Fictional Street',
    },
  });
  const intake = await must(harness, '/commercial-intake/requests', {
    company: companyId,
    key: `request-${suffix}`,
    body: {
      originalText: `Fictional request ${suffix}.`,
      sourceLabel: 'Fictional source',
      subject: `Fictional opportunity ${suffix}`,
      clientAccountId: idOf(client, 'client'),
      opportunity: {
        title: `Fictional opportunity ${suffix}`,
        scope: 'Fictional scope',
        nextAction: 'Prepare a Contract',
      },
    },
  });
  const opportunityId = idOf(
    object(intake.initialOpportunity, 'opportunity'),
    'opportunity',
  );
  const snapshot = await must(
    harness,
    `/pricing/opportunities/${opportunityId}/snapshots`,
    {
      company: companyId,
      key: `snapshot-${suffix}`,
      body: {
        pricingRuleVersionNumber: catalogue.ruleVersion,
        lines: [
          {
            offeringId: catalogue.offeringId,
            tariffVersionNumber: catalogue.tariffVersion,
            quantity: '1',
          },
        ],
      },
    },
  );
  let acceptedOfferVersionId: string | null = null;
  let pendingOfferVersionId: string | null = null;
  if (offerState !== 'none') {
    const createdOffer = await must(
      harness,
      `/offers/opportunities/${opportunityId}`,
      {
        company: companyId,
        key: `offer-${suffix}`,
        body: {
          pricingSnapshotId: idOf(snapshot, 'snapshot'),
          recipient: { kind: 'PRIMARY' },
          scopeNote: 'Fictional accepted scope',
          commercialConditions: 'Fictional accepted conditions',
        },
      },
    );
    const versionId = idOf(
      object(createdOffer.version, 'offer version'),
      'offer version',
    );
    if (offerState === 'pending') pendingOfferVersionId = versionId;
    const base = `/offers/opportunities/${opportunityId}/versions/${versionId}`;
    if (offerState === 'accepted') {
      await must(harness, `${base}/approve`, {
        company: companyId,
        key: `offer-approve-${suffix}`,
        body: { expectedOfferRevision: 1, acknowledgedWarningCodes: [] },
      });
      await must(harness, `${base}/transmission`, {
        company: companyId,
        key: `offer-send-${suffix}`,
        body: { expectedOfferRevision: 2, acknowledgedWarningCodes: [] },
      });
      await must(harness, `${base}/client-response`, {
        company: companyId,
        key: `offer-accept-${suffix}`,
        body: {
          expectedOfferRevision: 3,
          outcome: 'ACCEPTED',
          receivedAt: CLOCK.toISOString(),
        },
      });
      acceptedOfferVersionId = versionId;
    }
  }
  const project = await must(harness, '/projects', {
    company: companyId,
    key: `project-${suffix}`,
    body: {
      title: `Fictional Project ${suffix}`,
      clientAccountId: idOf(client, 'client'),
    },
  });
  return {
    company,
    opportunityId,
    clientId: idOf(client, 'client'),
    snapshotId: idOf(snapshot, 'snapshot'),
    acceptedOfferVersionId,
    pendingOfferVersionId,
    projectId: idOf(project, 'project'),
  };
}

export async function openContractWorld(
  databaseUrl: string,
): Promise<ContractWorld> {
  const database = await createIsolatedPostgresTestDatabase({
    baseDatabaseUrl: databaseUrl,
    namePrefix: 'contract_fuzz',
  });
  const workspaceId = '00000000-0000-4000-8000-000000001245';
  const harness = await createPostgresRestTestHarness({
    databaseUrl: database.targetUrl,
    serverClock: { now: () => new Date(CLOCK) },
    environment: {
      NODE_ENV: 'test',
      ACCESS_IDENTITY_MODE: 'test',
      ACCESS_BOOTSTRAP_EXTERNAL_PROVIDER: 'deterministic-test',
      ACCESS_BOOTSTRAP_EXTERNAL_SUBJECT: SUBJECTS.owner,
      ACCESS_BOOTSTRAP_WORKSPACE_ID: workspaceId,
      ACCESS_BOOTSTRAP_WORKSPACE_NAME: 'Fictional Contract Fuzz Workspace',
      ACCESS_ACCEPTED_INVITATIONS_JSON: JSON.stringify(
        MEMBERS.map((member) => ({
          provider: 'deterministic-test',
          subject: SUBJECTS[member],
          workspaceId,
        })),
      ),
    },
  });
  const companyA = idOf(
    await must(harness, '/companies', {
      key: 'company-A',
      body: { displayName: 'Fictional Contract Company A' },
    }),
    'company A',
  );
  const companyB = idOf(
    await must(harness, '/companies', {
      key: 'company-B',
      body: { displayName: 'Fictional Contract Company B' },
    }),
    'company B',
  );
  const companyIds = { A: companyA, B: companyB };
  const named = new Map<Actor, string>();
  const actors: readonly Actor[] = ['owner', ...MEMBERS];
  for (const actor of actors) {
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
  const sources: SourceModel[] = [];
  for (const company of COMPANIES) {
    const catalogue = await prepareCatalogue(
      harness,
      companyIds[company],
      company,
    );
    for (const [index, offer] of (
      ['none', 'pending', 'accepted'] as const
    ).entries())
      sources.push(
        await prepareSource(
          harness,
          companyIds[company],
          company,
          index,
          offer,
          catalogue,
        ),
      );
  }
  return { harness, database, companyIds, membershipIds, sources };
}

export async function closeContractWorld(world: ContractWorld) {
  await world.harness.close();
  await world.database.close();
}

export async function openRun(
  world: ContractWorld,
): Promise<{ model: Model; api: ContractApi }> {
  await world.harness.pool.query('TRUNCATE contracts CASCADE');
  const active = await world.harness.pool.query<{ entries: unknown }>(
    `SELECT coalesce(jsonb_agg(jsonb_build_array(workspace_membership_id, company_id, bundle::text)), '[]'::jsonb) AS entries
     FROM company_role_assignments
     WHERE company_id = ANY($1::uuid[]) AND revoked_at IS NULL
       AND bundle::text IN ('company_contract_preparer', 'company_contract_approver')`,
    [[world.companyIds.A, world.companyIds.B]],
  );
  const entries = active.rows[0]?.entries;
  const activeKeys = new Set(
    (Array.isArray(entries) ? entries : []).map((row) => canonical(row)),
  );
  const model: Model = {
    grants: new Map(),
    context: { ...INITIAL_CONTEXT },
    contracts: [],
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
  const api = new ContractApi(world);
  for (const company of COMPANIES)
    for (const event of await genericActivity(api, company))
      model.seenActivity.add(event.id);
  return { model, api };
}
