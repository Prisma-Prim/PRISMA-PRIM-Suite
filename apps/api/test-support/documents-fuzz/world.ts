import { randomUUID } from 'node:crypto';
import {
  paymentRecord,
  paymentText,
  type PaymentEvidenceFixture,
  type PaymentEvidenceIdentity,
} from '../../src/documents/payment-evidence.test-support.js';
import {
  canonical,
  InvariantViolation as ModelInvariantViolation,
  readReply,
  short,
  type Reply,
} from '../model-fuzz/checks.js';

/**
 * The invariants checked after every fuzz step. Document Registry PRD §7,
 * §18, §19 and §21, and Governed Documents PRD §5 and §6, are the authority.
 * REST answers prove them. One read of `working_documents` confirms the
 * Project link the named risk is about, and it writes nothing.
 */
export const INVARIANTS = {
  'company-isolation':
    'A request reads no Document, Version, Project list or document.* event of a Company other than the one it selected, and an actor without a Document grant in a Company reads nothing of it (AGENTS.md Workspace and Company isolation; ADR 0006; Document Registry PRD §7).',
  'identical-denial':
    'A foreign or hidden Document, Version or Project gets the same safe answer as a missing one (ADR 0006; Document Registry PRD §18, §21).',
  'revocation-denies':
    "After a revocation, the member's next request relying on the revoked capture is refused, with no effect (AGENTS.md Authorization; Document Registry PRD §18, §21).",
  'command-authority':
    'Registrar is required to read, register, correct and manage Versions. Designation also needs Approver, and a Project link also needs Project Organizer. Another bundle does not stand in (Document Registry PRD §8, §18, §19, §21).',
  'history-once':
    'Each successful command adds exactly one history fact; a refusal, a no-op, a stale revision or a replay adds none (AGENTS.md Activity Log; Document Registry PRD §18, §19, §21).',
  'revisions-grow':
    'Working revisions, Project-association revisions and Version numbers never decrease (Document Registry PRD §18, §19, §21).',
  'single-project':
    "A Document is linked to at most one Project, and that Project is its own Company's and its own Client's. Linking another Project, including another Company's, is refused with no effect (Document Registry PRD §7, §18; #1205).",
  'official-versions':
    'A Document has at most one draft and at most one official Version. Designation makes the current draft official and the previous official Version superseded. A superseded Version accepts nothing. Correction applies only to the current draft, and a new draft copies the references held at designation (Governed Documents PRD §5, §6; Document Registry PRD §21).',
  'reference-bounds':
    'A draft holds at most five current references and keeps its last one. An official Version only gains references, at most ten, and an appended reference is never removed (Document Registry PRD §21).',
  'stale-or-no-op':
    'A stale expected revision is refused with no effect. A correction that changes no value records an unchanged receipt and no history fact (Document Registry PRD §19, §21).',
  'replay-receipt':
    'The exact replay of a committed key returns the same receipt under live authority. The same key with another value, target or action conflicts. A refused command reserves no key (Document Registry PRD §18, §19, §21).',
  'model-agreement':
    'Every other answer is the outcome the PRD predicts (Document Registry PRD §7, §18, §19, §21).',
} as const;
export type Invariant = keyof typeof INVARIANTS;

export class InvariantViolation extends ModelInvariantViolation<Invariant> {}

export const COMPANIES = ['A', 'B'] as const;
export type CompanyKey = (typeof COMPANIES)[number];
/** Three members, so designation and linking have someone besides the registrar. */
export const MEMBERS = ['ana', 'bogdan', 'cora'] as const;
export type MemberKey = (typeof MEMBERS)[number];
/** The three Document bundles the fuzz grants and revokes. */
export const BUNDLES = ['registrar', 'approver', 'organizer'] as const;
export type Bundle = (typeof BUNDLES)[number];
export type Actor = MemberKey | 'owner';
export type Form = 'editable' | 'rendered' | 'signed' | 'other';

export const FORMS = ['editable', 'rendered', 'signed', 'other'] as const;
/** Trimmed by the API. Repeated values make a no-op correction common. */
export const TITLES = [
  'Fictional working questionnaire',
  'Fictional corrected questionnaire',
  'Questionnaire fictif DEMO',
] as const;
export const PURPOSES = [
  'Prepare a fictional assessment',
  'Correct the fictional assessment',
  'Préparer une évaluation fictive DEMO',
] as const;
export const URLS = [
  'https://example.test/questionnaire',
  'https://example.test/questionnaire/corrected',
  'https://example.test/questionnaire/signed',
] as const;

/** A UUID no record ever has: the twin of every hidden target. */
export const MISSING_ID = '00000000-0000-4000-8000-000000001241';

const IDENTITIES: Record<Actor, PaymentEvidenceIdentity> = {
  ana: 'reader',
  bogdan: 'confirmer',
  cora: 'reverser',
  owner: 'owner',
};
const BUNDLE_NOUNS: Record<Bundle, string> = {
  registrar: 'company-document-registrar',
  approver: 'company-document-approver',
  organizer: 'company-document-project-organizer',
};
/**
 * Each run starts from these grants. Company A can register, designate and
 * link. Company B keeps a registrar who cannot designate and an organizer
 * who cannot read.
 */
const INITIAL_GRANTS: Record<
  MemberKey,
  Record<CompanyKey, readonly Bundle[]>
> = {
  ana: {
    A: ['registrar', 'approver', 'organizer'],
    B: ['registrar', 'organizer'],
  },
  bogdan: { A: ['registrar', 'approver'], B: ['registrar', 'approver'] },
  cora: { A: ['registrar'], B: ['approver', 'organizer'] },
};
const INITIAL_CONTEXT: Record<MemberKey, CompanyKey> = {
  ana: 'A',
  bogdan: 'A',
  cora: 'B',
};
/** Native grants in Company B, matching what the fixture gives Company A. */
const NATIVE_GRANTS = [
  '/company-context-assignments',
  '/company-director-client-assignments',
  '/company-project-assignments',
] as const;
/** What the owner keeps, so the auditor can read every Company. */
const OWNER_BUNDLES = [
  '/company-document-registrar-assignments',
  '/company-document-approver-assignments',
  '/company-document-project-organizer-assignments',
  '/company-project-assignments',
] as const;

export interface ReferenceModel {
  id: string;
  url: string;
  form: Form;
  /** True only for a reference appended to an official Version. */
  appended: boolean;
}

export interface VersionModel {
  id: string;
  number: number;
  status: 'draft' | 'official' | 'superseded';
  references: ReferenceModel[];
  frozenTitle: string | null;
  frozenPurpose: string | null;
  supersededByNumber: number | null;
}

export interface CorrectionModel {
  revision: number;
  member: MemberKey;
  title?: { before: string; after: string };
  purpose?: { before: string; after: string };
  url?: { before: string; after: string };
}

export interface DocumentModel {
  id: string;
  company: CompanyKey;
  clientId: string;
  title: string;
  purpose: string;
  workingRevision: number;
  projectRevision: number;
  projectId: string | null;
  createdAt: string;
  /** Highest Version number first, as the read returns them. */
  versions: VersionModel[];
  /** Material corrections only, oldest first. */
  corrections: CorrectionModel[];
}

export interface ProjectRef {
  id: string;
  company: CompanyKey;
  clientId: string;
  /** False for the one Project of Company A's other Client. */
  sameClient: boolean;
  title: string;
}

export type CommandKind = 'register' | 'correct' | 'associate' | 'version';

/** One committed command, so a later step can replay or reuse its key. */
export interface Committed {
  member: MemberKey;
  company: CompanyKey;
  key: string;
  kind: CommandKind;
  method: 'POST' | 'PATCH';
  path: string;
  body: unknown;
  /** The receipt body. Registration stores the created Document id instead. */
  receipt: unknown;
  documentId: string;
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
  documents: DocumentModel[];
  committed: Committed[];
  refused: RefusedKey[];
  /** Highest working revision, Project revision and Version number seen. */
  revisions: Map<string, { working: number; project: number; version: number }>;
  events: Set<string>;
}

export interface StepOutcome {
  touched: DocumentModel[];
  events: ExpectedEvent[];
}

export interface DocumentsWorld {
  fixture: PaymentEvidenceFixture;
  companyIds: Readonly<Record<CompanyKey, string>>;
  clientIds: Readonly<Record<CompanyKey, string>>;
  /** A Client of Company A that is not the Documents' Client. */
  otherClientId: string;
  membershipIds: Readonly<Record<Actor, string>>;
  displayNames: Readonly<Record<Actor, string>>;
  projects: readonly ProjectRef[];
}

export function grantKey(
  member: MemberKey,
  company: CompanyKey,
  bundle: Bundle,
) {
  return `${member}/${company}/${bundle}`;
}

function grantState(
  model: Readonly<Model>,
  member: MemberKey,
  company: CompanyKey,
  bundle: Bundle,
) {
  return model.grants.get(grantKey(member, company, bundle)) ?? 'absent';
}

export function granted(
  model: Readonly<Model>,
  member: MemberKey,
  company: CompanyKey,
  bundle: Bundle,
) {
  return grantState(model, member, company, bundle) === 'active';
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

/** Registrar v3 is the only read, register, correct and Version grant. */
export function canRead(
  model: Readonly<Model>,
  member: MemberKey,
  company: CompanyKey,
) {
  return granted(model, member, company, 'registrar');
}

export function canDesignate(
  model: Readonly<Model>,
  member: MemberKey,
  company: CompanyKey,
) {
  return (
    canRead(model, member, company) &&
    granted(model, member, company, 'approver')
  );
}

export function canLink(
  model: Readonly<Model>,
  member: MemberKey,
  company: CompanyKey,
) {
  return (
    canRead(model, member, company) &&
    granted(model, member, company, 'organizer')
  );
}

/**
 * The invariant a wrongly admitted request breaks: a revoked required
 * bundle, another Document bundle standing in for it, or no Document
 * authority in that Company.
 */
export function denialInvariant(
  model: Readonly<Model>,
  member: MemberKey,
  company: CompanyKey,
  required: readonly Bundle[],
): Invariant {
  if (
    required.some(
      (bundle) => grantState(model, member, company, bundle) === 'revoked',
    )
  )
    return 'revocation-denies';
  if (!canRead(model, member, company)) return 'company-isolation';
  return 'command-authority';
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

export function normalized(value: string) {
  return value.trim();
}

export function draftOf(document: DocumentModel) {
  return document.versions.find((version) => version.status === 'draft');
}

export function officialOf(document: DocumentModel) {
  return document.versions.find((version) => version.status === 'official');
}

/** The draft when one exists, otherwise the official Version. */
export function workingVersion(document: DocumentModel) {
  return draftOf(document) ?? officialOf(document);
}

export function primaryReference(version: VersionModel) {
  return version.references[0];
}

export function sameClientProjects(
  world: DocumentsWorld,
  document: DocumentModel,
) {
  return world.projects.filter(
    (project) =>
      project.company === document.company &&
      project.clientId === document.clientId,
  );
}

export class DocumentsApi {
  private keys = 0;
  constructor(readonly world: DocumentsWorld) {}

  /** Deterministic keys. Each run starts from emptied Document tables. */
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
      method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
      body?: unknown;
      company?: CompanyKey;
      key?: string;
    } = {},
  ): Promise<Reply> {
    const response = await this.world.fixture.call(path, {
      method: options.method ?? 'GET',
      body: options.body,
      company:
        options.company === undefined
          ? null
          : this.world.companyIds[options.company],
      key: options.key,
      identity: IDENTITIES[actor],
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

  actorOf(displayName: unknown): Actor | undefined {
    return (['owner', ...MEMBERS] as const).find(
      (actor) => this.world.displayNames[actor] === displayName,
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

export function list(value: unknown, what: string): unknown[] {
  if (!Array.isArray(value))
    throw new InvariantViolation(
      'model-agreement',
      `${what} is no list: ${canonical(value)}`,
    );
  return value;
}

export function text(value: unknown, what: string): string {
  if (typeof value !== 'string' || value.length === 0)
    throw new InvariantViolation(
      'model-agreement',
      `${what} is no string: ${canonical(value)}`,
    );
  return value;
}

export function integer(value: unknown, what: string): number {
  if (typeof value === 'number' && Number.isSafeInteger(value)) return value;
  if (typeof value === 'string' && /^(?:0|[1-9][0-9]*)$/u.test(value))
    return Number(value);
  throw new InvariantViolation(
    'model-agreement',
    `${what} is no integer: ${canonical(value)}`,
  );
}

export function observeRevision(
  model: Model,
  document: DocumentModel,
  where: string,
) {
  const key = document.id;
  const seen = model.revisions.get(key) ?? {
    working: 0,
    project: 0,
    version: 0,
  };
  const version = document.versions.reduce(
    (highest, item) => Math.max(highest, item.number),
    0,
  );
  if (
    document.workingRevision < seen.working ||
    document.projectRevision < seen.project ||
    version < seen.version
  )
    throw new InvariantViolation(
      'revisions-grow',
      `${where} shows Document ${document.id} at working ${document.workingRevision}, Project ${document.projectRevision}, Version ${version} after ${seen.working}, ${seen.project}, ${seen.version}`,
    );
  model.revisions.set(key, {
    working: document.workingRevision,
    project: document.projectRevision,
    version,
  });
}

function fail(invariant: Invariant, detail: string): never {
  throw new InvariantViolation(invariant, detail);
}

/** The generic Activity Log read in one Company, newest page. */
async function activityIn(api: DocumentsApi, company: CompanyKey) {
  const reply = await api.send('owner', '/activity-log', { company });
  if (reply.status !== 200)
    fail(
      'model-agreement',
      `the owner cannot read Company ${company}'s Activity Log: ${short(reply)}`,
    );
  return list(object(reply.body, 'the Activity Log').events, 'events').map(
    (value) => {
      const event = object(value, 'an Activity Log event');
      const action = text(event.action, 'an Activity Log action');
      const target = object(event.target, 'an Activity Log target');
      const companyId = target.companyId;
      const eventCompany = api.companyOf(companyId);
      if (action.startsWith('document.')) {
        if (eventCompany !== company)
          fail(
            'company-isolation',
            `Company ${company}'s Activity Log shows ${action} of ${eventCompany ?? canonical(companyId)}`,
          );
      }
      return {
        id: text(event.id, 'an Activity Log id'),
        action,
        company: eventCompany,
        membershipId: target.workspaceMembershipId,
        actor: object(event.actor, 'an Activity Log actor').displayName,
        documentId: target.documentId,
      };
    },
  );
}

function eventKey(
  api: DocumentsApi,
  event: {
    action: string;
    company: CompanyKey | undefined;
    membershipId: unknown;
    actor: unknown;
  },
) {
  if (event.action.includes('_assignment.')) {
    const member = api.memberOf(event.membershipId);
    return `${event.action} ${event.company ?? '-'} ${member ?? '-'}`;
  }
  if (event.action.startsWith('document.')) {
    const actor = api.actorOf(event.actor);
    const member = actor && actor !== 'owner' ? actor : '-';
    return `${event.action} ${event.company ?? '-'} ${member}`;
  }
  return `${event.action} ${event.company ?? '-'} -`;
}

/**
 * The generic Activity Log gained exactly the step's history facts.
 * Assignment events are visible from every Company; document.* events are
 * visible only in their own.
 */
async function expectActivity(
  model: Model,
  api: DocumentsApi,
  expected: ExpectedEvent[],
) {
  const fresh = new Map<
    string,
    {
      action: string;
      company: CompanyKey | undefined;
      membershipId: unknown;
      actor: unknown;
    }
  >();
  for (const company of COMPANIES)
    for (const event of await activityIn(api, company)) {
      if (model.events.has(event.id)) continue;
      model.events.add(event.id);
      fresh.set(event.id, event);
    }
  const seen = [...fresh.values()].map((event) => eventKey(api, event)).sort();
  const wanted = expected
    .map((event) => `${event.action} ${event.company} ${event.member}`)
    .sort();
  if (canonical(seen) !== canonical(wanted))
    fail(
      'history-once',
      `the generic Activity Log gained [${seen.join('; ')}], expected [${wanted.join('; ')}]`,
    );
}

function byInstant(direction: 'asc' | 'desc') {
  return (left: DocumentModel, right: DocumentModel) => {
    const a = `${left.createdAt}/${left.id}`;
    const b = `${right.createdAt}/${right.id}`;
    if (a === b) return 0;
    const newerFirst = a < b ? 1 : -1;
    return direction === 'desc' ? newerFirst : -newerFirst;
  };
}

function requireDocument(model: Model, id: string, where: string) {
  const document = model.documents.find((item) => item.id === id);
  if (!document)
    fail('model-agreement', `${where} names unknown Document ${id}`);
  return document;
}

/** Re-reads one Document and requires the model, including its Project. */
export async function expectDocument(
  model: Model,
  api: DocumentsApi,
  document: DocumentModel,
) {
  const company = document.company;
  const detailReply = await api.send('owner', `/documents/${document.id}`, {
    company,
  });
  if (detailReply.status !== 200)
    fail(
      'model-agreement',
      `the auditor cannot read Document ${document.id}: ${short(detailReply)}`,
    );
  const detail = object(detailReply.body, 'a Document');
  if (api.companyOf(detail.companyId) !== company)
    fail(
      'company-isolation',
      `Document ${document.id} is read in Company ${company} as ${canonical(detail.companyId)}`,
    );
  if (detail.clientId !== document.clientId)
    fail(
      'single-project',
      `Document ${document.id} names Client ${canonical(detail.clientId)}, expected ${document.clientId}`,
    );
  if (detail.type !== 'questionnaire')
    fail(
      'model-agreement',
      `Document ${document.id} is ${canonical(detail.type)}`,
    );
  if (
    detail.title !== document.title ||
    detail.purpose !== document.purpose ||
    integer(detail.workingRevision, 'workingRevision') !==
      document.workingRevision
  )
    fail(
      'history-once',
      `Document ${document.id} reads as ${canonical(detail.title)} / ${canonical(detail.purpose)} at ${canonical(detail.workingRevision)}, the model has ${document.title} / ${document.purpose} at ${document.workingRevision}`,
    );
  expectAssociation(api, document, detail.projectAssociation);
  const versionBody = object(detail.version, 'the working Version');
  const working = workingVersion(document);
  if (!working)
    fail('official-versions', `Document ${document.id} has no working Version`);
  if (text(versionBody.status, 'working status') !== working.status)
    fail(
      'official-versions',
      `Document ${document.id} works on ${canonical(versionBody.status)}, expected ${working.status}`,
    );
  const primary = object(versionBody.representation, 'the primary reference');
  const reference = primaryReference(working);
  if (!reference || primary.url !== reference.url)
    fail(
      'reference-bounds',
      `Document ${document.id} shows primary ${canonical(primary.url)}, expected ${reference?.url ?? 'none'}`,
    );
  if (
    (working.status === 'draft' && detail.correction !== 'allowed') ||
    (working.status !== 'draft' && detail.correction !== 'read-only')
  )
    fail(
      'official-versions',
      `Document ${document.id} correction is ${canonical(detail.correction)} while its working Version is ${working.status}`,
    );

  const versionsReply = await api.send(
    'owner',
    `/documents/${document.id}/versions`,
    { company },
  );
  if (versionsReply.status !== 200)
    fail(
      'model-agreement',
      `the auditor cannot read Versions of ${document.id}: ${short(versionsReply)}`,
    );
  absorbVersions(document, object(versionsReply.body, 'the Versions'));
  await expectCorrections(api, document);
  observeRevision(model, document, 'the Document read');
  assertVersionRules(document);
}

function expectAssociation(
  api: DocumentsApi,
  document: DocumentModel,
  value: unknown,
) {
  const association = object(value, 'the Project association');
  if (document.projectId === null) {
    if (association.state !== 'unlinked')
      fail(
        'single-project',
        `Document ${document.id} is unlinked and reads as ${canonical(association)}`,
      );
    return;
  }
  if (association.state !== 'linked')
    fail(
      'single-project',
      `Document ${document.id} is linked to ${document.projectId} and reads as ${canonical(association)}`,
    );
  const project = object(association.project, 'the linked Project');
  const known = api.world.projects.find(
    (item) => item.id === document.projectId,
  );
  if (
    project.id !== document.projectId ||
    !known ||
    known.company !== document.company ||
    known.clientId !== document.clientId ||
    project.title !== known.title
  )
    fail(
      'single-project',
      `Document ${document.id} is linked to ${canonical(project)}, which is not its own Company's Project ${document.projectId}`,
    );
}

function absorbVersions(
  document: DocumentModel,
  page: Record<string, unknown>,
) {
  if (page.mutable !== true)
    fail('model-agreement', `Document ${document.id} is not mutable`);
  if (
    integer(page.workingRevision, 'versions workingRevision') !==
    document.workingRevision
  )
    fail(
      'history-once',
      `Versions of ${document.id} are at revision ${canonical(page.workingRevision)}, expected ${document.workingRevision}`,
    );
  const seen = list(page.versions, 'versions');
  if (seen.length !== document.versions.length)
    fail(
      'official-versions',
      `Document ${document.id} has ${seen.length} Versions, the model has ${document.versions.length}`,
    );
  const drafts = seen.filter(
    (value) => object(value, 'a Version').status === 'draft',
  ).length;
  const officials = seen.filter(
    (value) => object(value, 'a Version').status === 'official',
  ).length;
  if (drafts > 1 || officials > 1)
    fail(
      'official-versions',
      `Document ${document.id} has ${drafts} drafts and ${officials} official Versions`,
    );
  seen.forEach((value, index) => {
    const item = object(value, 'a Version');
    const version = document.versions[index];
    if (!version || integer(item.number, 'Version number') !== version.number)
      fail(
        'revisions-grow',
        `Document ${document.id} lists Version ${canonical(item.number)} where the model has ${version?.number ?? 'nothing'}`,
      );
    if (item.status !== version.status)
      fail(
        'official-versions',
        `Version ${version.number} of ${document.id} is ${canonical(item.status)}, expected ${version.status}`,
      );
    const pdf = object(item.pdfContent, 'pdf content');
    if (pdf.state !== 'absent')
      fail(
        'model-agreement',
        `Version ${version.number} of ${document.id} has stored PDF content`,
      );
    absorbFrozen(document, version, item);
    absorbReferences(document, version, item.representations);
    const id = text(item.id, 'Version id');
    if (version.id === '') version.id = id;
    else if (version.id !== id)
      fail(
        'history-once',
        `Version ${version.number} of ${document.id} changed id`,
      );
  });
}

function absorbFrozen(
  document: DocumentModel,
  version: VersionModel,
  item: Record<string, unknown>,
) {
  if (version.status === 'draft') {
    if ('frozen' in item || 'supersededByVersionNumber' in item)
      fail(
        'official-versions',
        `Draft Version ${version.number} of ${document.id} carries official facts`,
      );
    return;
  }
  const frozen = object(item.frozen, 'frozen metadata');
  if (
    frozen.title !== version.frozenTitle ||
    frozen.purpose !== version.frozenPurpose
  )
    fail(
      'official-versions',
      `Version ${version.number} of ${document.id} froze ${canonical(frozen)}, expected ${version.frozenTitle} / ${version.frozenPurpose}`,
    );
  if (version.status === 'official') return;
  if (
    integer(item.supersededByVersionNumber, 'superseding Version') !==
    version.supersededByNumber
  )
    fail(
      'official-versions',
      `Version ${version.number} of ${document.id} was superseded by ${canonical(item.supersededByVersionNumber)}, expected ${version.supersededByNumber}`,
    );
}

function absorbReferences(
  document: DocumentModel,
  version: VersionModel,
  value: unknown,
) {
  const seen = list(value, 'references')
    .map((item) => object(item, 'a reference'))
    .sort(
      (left, right) =>
        integer(left.position, 'position') -
        integer(right.position, 'position'),
    );
  if (seen.length !== version.references.length)
    fail(
      'reference-bounds',
      `Version ${version.number} of ${document.id} has ${seen.length} references, expected ${version.references.length}`,
    );
  if (version.status === 'draft' && seen.length > 5)
    fail(
      'reference-bounds',
      `Draft Version ${version.number} holds more than five references`,
    );
  if (version.status === 'official' && seen.length > 10)
    fail(
      'reference-bounds',
      `Official Version ${version.number} holds more than ten references`,
    );
  seen.forEach((item, index) => {
    const reference = version.references[index];
    if (!reference) return;
    if (
      item.url !== reference.url ||
      item.form !== reference.form ||
      item.appendedAfterDesignation !== reference.appended
    )
      fail(
        'reference-bounds',
        `Version ${version.number} reference ${index} is ${canonical(item.url)} ${canonical(item.form)} appended ${canonical(item.appendedAfterDesignation)}`,
      );
    if (version.status !== 'draft' && item.access !== 'granted')
      fail(
        'model-agreement',
        `The auditor cannot read a reference of Version ${version.number}`,
      );
    const id = text(item.id, 'reference id');
    if (reference.id === '') reference.id = id;
    else if (reference.id !== id)
      fail(
        'history-once',
        `A reference of Version ${version.number} changed id`,
      );
  });
}

function assertVersionRules(document: DocumentModel) {
  const drafts = document.versions.filter(
    (version) => version.status === 'draft',
  );
  const officials = document.versions.filter(
    (version) => version.status === 'official',
  );
  if (drafts.length > 1 || officials.length > 1)
    fail(
      'official-versions',
      `Document ${document.id} model has ${drafts.length} drafts and ${officials.length} official Versions`,
    );
  for (const version of document.versions) {
    if (version.status === 'superseded' && version.supersededByNumber === null)
      fail(
        'official-versions',
        `Superseded Version ${version.number} of ${document.id} names no successor`,
      );
    if (version.status !== 'draft' && version.references.length === 0)
      fail(
        'reference-bounds',
        `Version ${version.number} of ${document.id} has no reference`,
      );
  }
}

async function expectCorrections(api: DocumentsApi, document: DocumentModel) {
  const seen = [];
  let before: number | undefined;
  for (;;) {
    const path =
      before === undefined
        ? `/documents/${document.id}/correction-history`
        : `/documents/${document.id}/correction-history?beforeRevision=${before}`;
    const reply = await api.send('owner', path, { company: document.company });
    if (reply.status !== 200)
      fail(
        'model-agreement',
        `the auditor cannot read corrections of ${document.id}: ${short(reply)}`,
      );
    const page = object(reply.body, 'correction history');
    const entries = list(page.corrections, 'corrections');
    for (const entry of entries) seen.push(entry);
    if (page.nextBeforeRevision === null) break;
    const next = integer(page.nextBeforeRevision, 'nextBeforeRevision');
    if (before !== undefined && next >= before)
      fail(
        'revisions-grow',
        `correction history of ${document.id} did not move backward`,
      );
    before = next;
  }
  const expected = [...document.corrections].reverse();
  if (seen.length !== expected.length)
    fail(
      'history-once',
      `Document ${document.id} shows ${seen.length} corrections, expected ${expected.length}`,
    );
  seen.forEach((value, index) => {
    const entry = object(value, 'a correction');
    const correction = expected[index];
    if (!correction) return;
    const actor = object(entry.actor, 'a correction actor');
    if (
      integer(entry.revision, 'correction revision') !== correction.revision ||
      actor.displayName !== api.world.displayNames[correction.member]
    )
      fail(
        'history-once',
        `Document ${document.id} correction ${canonical(entry.revision)} does not match revision ${correction.revision}`,
      );
    const changes = object(entry.changes, 'correction changes');
    for (const field of ['title', 'purpose', 'url'] as const) {
      const wanted = correction[field];
      if (wanted === undefined) {
        if (field in changes)
          fail(
            'history-once',
            `Document ${document.id} correction ${correction.revision} shows ${field}`,
          );
        continue;
      }
      const change = object(changes[field], field);
      if (change.before !== wanted.before || change.after !== wanted.after)
        fail(
          'history-once',
          `Document ${document.id} correction ${correction.revision} ${field} is ${canonical(change)}`,
        );
    }
  });
}

/** Every Company's Document list, and every Project's linked Documents. */
async function expectLists(model: Model, api: DocumentsApi) {
  for (const company of COMPANIES) {
    const reply = await api.send('owner', '/documents', { company });
    if (reply.status !== 200)
      fail(
        'model-agreement',
        `the auditor cannot list Company ${company}: ${short(reply)}`,
      );
    const items = list(reply.body, `Company ${company}'s Documents`);
    const expected = model.documents
      .filter((document) => document.company === company)
      .sort(byInstant('desc'));
    if (items.length !== expected.length)
      fail(
        'company-isolation',
        `Company ${company} lists ${items.length} Documents, expected ${expected.length}`,
      );
    items.forEach((value, index) => {
      const item = object(value, 'a listed Document');
      const document = expected[index];
      if (
        !document ||
        item.id !== document.id ||
        api.companyOf(item.companyId) !== company
      )
        fail(
          'company-isolation',
          `Company ${company} lists ${canonical(item.id)} of ${canonical(item.companyId)}`,
        );
    });
  }
  for (const project of api.world.projects)
    await expectProjectList(model, api, project, false);
}

/** Eligible Documents, and a foreign Project's list, after a whole sequence. */
async function expectProjectBoundaries(model: Model, api: DocumentsApi) {
  for (const project of api.world.projects) {
    await expectProjectList(model, api, project, true);
    const other = project.company === 'A' ? 'B' : 'A';
    const foreign = await api.send(
      'owner',
      `/projects/${project.id}/documents`,
      {
        company: other,
      },
    );
    const missing = await api.send(
      'owner',
      `/projects/${MISSING_ID}/documents`,
      { company: other },
    );
    if (
      foreign.status !== 404 ||
      missing.status !== 404 ||
      foreign.text !== missing.text
    )
      fail(
        'identical-denial',
        `Project ${project.id} from the other Company got ${short(foreign)}, a missing Project got ${short(missing)}`,
      );
  }
}

async function expectProjectList(
  model: Model,
  api: DocumentsApi,
  project: ProjectRef,
  eligible: boolean,
) {
  const reply = await api.send(
    'owner',
    eligible
      ? `/projects/${project.id}/eligible-documents`
      : `/projects/${project.id}/documents`,
    { company: project.company },
  );
  if (reply.status !== 200)
    fail(
      'model-agreement',
      `the auditor cannot list Project ${project.id}: ${short(reply)}`,
    );
  const page = object(reply.body, 'a Project Document list');
  if (page.mutable !== true)
    fail('model-agreement', `Project ${project.id} is not mutable`);
  const items = list(page.documents, 'Project Documents');
  const expected = model.documents
    .filter((document) => {
      if (document.company !== project.company) return false;
      if (eligible)
        return (
          document.projectId === null && document.clientId === project.clientId
        );
      return document.projectId === project.id;
    })
    .sort(byInstant('asc'));
  if (items.length !== expected.length)
    fail(
      'single-project',
      `Project ${project.title} ${eligible ? 'offers' : 'lists'} ${items.length} Documents, expected ${expected.length}`,
    );
  items.forEach((value, index) => {
    const item = object(value, 'a Project Document');
    const nested = object(item.document, 'the Document');
    const document = expected[index];
    if (
      !document ||
      nested.id !== document.id ||
      integer(item.revision, 'Project revision') !== document.projectRevision ||
      api.companyOf(nested.companyId) !== project.company
    )
      fail(
        'single-project',
        `Project ${project.id} shows ${canonical(nested.id)} at revision ${canonical(item.revision)}`,
      );
  });
}

interface LinkRow {
  id: string;
  company_id: string;
  client_id: string;
  project_id: string | null;
  project_revision: number | string;
  working_revision: number | string;
}

/** The stored link, read without writing: the risk #1205 names. */
async function expectStoredLinks(model: Model, api: DocumentsApi) {
  const result = await api.world.fixture.pool.query<LinkRow>(
    `SELECT id, company_id, client_id, project_id, project_revision, working_revision
     FROM working_documents
     WHERE company_id = ANY($1::uuid[])`,
    [[api.companyIds.A, api.companyIds.B]],
  );
  if (result.rows.length !== model.documents.length)
    fail(
      'model-agreement',
      `working_documents holds ${result.rows.length} rows, the model holds ${model.documents.length}`,
    );
  for (const row of result.rows) {
    const document = requireDocument(model, row.id, 'working_documents');
    const company = api.companyOf(row.company_id);
    if (company !== document.company || row.client_id !== document.clientId)
      fail(
        'company-isolation',
        `Document ${row.id} is stored in ${canonical(row.company_id)} for Client ${row.client_id}`,
      );
    if (
      integer(row.working_revision, 'stored working revision') !==
        document.workingRevision ||
      integer(row.project_revision, 'stored Project revision') !==
        document.projectRevision
    )
      fail(
        'history-once',
        `Document ${row.id} is stored at working ${canonical(row.working_revision)} and Project ${canonical(row.project_revision)}`,
      );
    if (row.project_id === null) {
      if (document.projectId !== null)
        fail('single-project', `Document ${row.id} is stored unlinked`);
      continue;
    }
    const project = api.world.projects.find(
      (item) => item.id === row.project_id,
    );
    if (
      !project ||
      project.company !== document.company ||
      project.clientId !== document.clientId ||
      document.projectId !== row.project_id
    )
      fail(
        'single-project',
        `Document ${row.id} of Company ${document.company} is stored on Project ${row.project_id}`,
      );
  }
}

/** The checks run after every step. */
export async function checkStep(
  model: Model,
  api: DocumentsApi,
  outcome: StepOutcome,
) {
  await expectActivity(model, api, outcome.events);
  await expectLists(model, api);
  await expectStoredLinks(model, api);
  for (const document of new Set(outcome.touched))
    await expectDocument(model, api, document);
}

/** After a sequence: every Document, not only the ones the last step touched. */
export async function checkEnd(model: Model, api: DocumentsApi) {
  await expectStoredLinks(model, api);
  await expectProjectBoundaries(model, api);
  for (const document of model.documents)
    await expectDocument(model, api, document);
}

async function expectStatus(response: Response, status: number, what: string) {
  const reply = await readReply(response);
  if (reply.status !== status)
    throw new Error(`Fuzz setup ${what} failed: ${short(reply)}`);
  return reply;
}

function actorNames(named: ReadonlyMap<Actor, string>): Record<Actor, string> {
  const ana = named.get('ana');
  const bogdan = named.get('bogdan');
  const cora = named.get('cora');
  const owner = named.get('owner');
  if (!ana || !bogdan || !cora || !owner)
    throw new Error('Fuzz setup did not read every actor display name.');
  return { ana, bogdan, cora, owner };
}

async function jsonCall(
  fixture: PaymentEvidenceFixture,
  path: string,
  options: Parameters<PaymentEvidenceFixture['call']>[1],
  status: number,
  what: string,
) {
  return paymentRecord(
    (await expectStatus(await fixture.call(path, options), status, what)).body,
  );
}

/**
 * Prepares the Workspace once per test file: Companies A and B, each with
 * its own Client, two Projects on that Client, and one extra Project of
 * Company A's other Client. Members hold equal native grants. The owner
 * audits. Every fuzzed Document grant is issued once.
 */
export async function openDocumentsWorld(
  fixture: PaymentEvidenceFixture,
): Promise<DocumentsWorld> {
  const ready = await fixture.reset();
  const membershipIds: Record<Actor, string> = {
    ana: ready.membershipIds[IDENTITIES.ana],
    bogdan: ready.membershipIds[IDENTITIES.bogdan],
    cora: ready.membershipIds[IDENTITIES.cora],
    owner: ready.membershipIds.owner,
  };
  const actors: readonly Actor[] = ['owner', ...MEMBERS];
  const named = new Map<Actor, string>();
  for (const actor of actors) {
    const current = await jsonCall(
      fixture,
      '/access/current-actor',
      { identity: IDENTITIES[actor], company: null },
      200,
      `${actor} identity`,
    );
    named.set(actor, paymentText(current.displayName));
  }
  const displayNames = actorNames(named);
  const second = paymentText(
    (
      await jsonCall(
        fixture,
        '/companies',
        {
          method: 'POST',
          company: null,
          body: { displayName: 'Fictional second Company 1241' },
        },
        201,
        'Company B',
      )
    ).id,
  );
  const grant = (path: string, companyId: string, membershipId: string) =>
    jsonCall(
      fixture,
      path,
      {
        method: 'POST',
        company: null,
        body: { companyId, workspaceMembershipId: membershipId },
      },
      201,
      path,
    );
  for (const actor of ['owner', ...MEMBERS] as const)
    for (const path of NATIVE_GRANTS)
      await grant(path, second, membershipIds[actor]);
  for (const path of OWNER_BUNDLES) {
    await grant(path, second, membershipIds.owner);
    if (path === '/company-document-registrar-assignments') continue;
    await grant(path, ready.companyId, membershipIds.owner);
  }
  for (const companyId of [ready.companyId, second])
    for (const member of MEMBERS) {
      if (companyId === ready.companyId)
        await grant(
          '/company-project-assignments',
          companyId,
          membershipIds[member],
        );
      for (const bundle of BUNDLES) {
        if (companyId === ready.companyId && bundle === 'registrar') continue;
        await grant(
          bundleAssignments(bundle),
          companyId,
          membershipIds[member],
        );
      }
    }
  const clientB = paymentText(
    (
      await jsonCall(
        fixture,
        '/clients',
        {
          method: 'POST',
          company: second,
          body: {
            displayName: 'Fictional Client of Company B',
            taxId: 'FICT-CLIENT-1241-B',
            address: '1241 Fictional Street',
          },
        },
        201,
        'Client B',
      )
    ).id,
  );
  const companyIds = { A: ready.companyId, B: second };
  const clientIds = { A: ready.clientId, B: clientB };
  async function project(
    company: CompanyKey,
    clientId: string,
    title: string,
    sameClient: boolean,
  ): Promise<ProjectRef> {
    const created = await jsonCall(
      fixture,
      '/projects',
      {
        method: 'POST',
        company: companyIds[company],
        key: randomUUID(),
        body: { title, clientAccountId: clientId },
      },
      201,
      title,
    );
    return {
      id: paymentText(created.id),
      company,
      clientId,
      sameClient,
      title,
    };
  }
  const projects = [
    await project('A', clientIds.A, 'Fictional Project A1', true),
    await project('A', clientIds.A, 'Fictional Project A2', true),
    await project(
      'A',
      ready.unionSourceClientId,
      'Fictional Project A other Client',
      false,
    ),
    await project('B', clientIds.B, 'Fictional Project B1', true),
    await project('B', clientIds.B, 'Fictional Project B2', true),
  ];
  return {
    fixture,
    companyIds,
    clientIds,
    otherClientId: ready.unionSourceClientId,
    membershipIds,
    displayNames,
    projects,
  };
}

/**
 * A fresh run: Document rows are emptied, then the fuzzed grants return to
 * their initial state through the public assignment endpoints.
 */
export async function openRun(
  world: DocumentsWorld,
): Promise<{ model: Model; api: DocumentsApi }> {
  const { fixture } = world;
  await fixture.pool.query('TRUNCATE working_documents CASCADE');
  const active = await fixture.pool.query<{ entries: unknown }>(
    `SELECT coalesce(jsonb_agg(jsonb_build_array(workspace_membership_id, company_id, bundle::text)), '[]'::jsonb) AS entries
     FROM company_role_assignments
     WHERE company_id = ANY($1::uuid[]) AND revoked_at IS NULL
       AND bundle::text IN ('company_document_registrar', 'company_document_approver', 'company_document_project_organizer')`,
    [[world.companyIds.A, world.companyIds.B]],
  );
  const activeKeys = new Set(
    list(active.rows[0]?.entries, 'the active Document grants').map((row) =>
      canonical(row),
    ),
  );
  const model: Model = {
    grants: new Map(),
    context: { ...INITIAL_CONTEXT },
    documents: [],
    committed: [],
    refused: [],
    revisions: new Map(),
    events: new Set(),
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
        const response = await fixture.call(
          wanted
            ? assignments
            : `${assignments}/${world.membershipIds[member]}/${world.companyIds[company]}`,
          {
            method: wanted ? 'POST' : 'DELETE',
            company: null,
            key: randomUUID(),
            body: wanted
              ? {
                  companyId: world.companyIds[company],
                  workspaceMembershipId: world.membershipIds[member],
                }
              : undefined,
          },
        );
        await expectStatus(response, wanted ? 201 : 200, 'grant reset');
        model.grants.set(
          grantKey(member, company, bundle),
          wanted ? 'active' : 'revoked',
        );
      }
  const api = new DocumentsApi(world);
  for (const company of COMPANIES)
    for (const event of await activityIn(api, company))
      model.events.add(event.id);
  return { model, api };
}
