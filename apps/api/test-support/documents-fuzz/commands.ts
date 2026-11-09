import { randomUUID } from 'node:crypto';
import * as fc from 'fast-check';
import {
  expectDenial,
  canonical,
  short,
  type Reply,
} from '../model-fuzz/checks.js';
import {
  assignmentAction,
  bundleAssignments,
  canLink,
  canRead,
  checkStep,
  COMPANIES,
  denialInvariant,
  draftOf,
  FORMS,
  granted,
  integer,
  InvariantViolation,
  list,
  MEMBERS,
  MISSING_ID,
  object,
  officialOf,
  primaryReference,
  PURPOSES,
  sameClientProjects,
  setGrant,
  text,
  TITLES,
  URLS,
  type Bundle,
  type Committed,
  type CompanyKey,
  type DocumentModel,
  type DocumentsApi,
  type ExpectedEvent,
  type Form,
  type Invariant,
  type MemberKey,
  type Model,
  type ProjectRef,
  type ReferenceModel,
  type StepOutcome,
  type VersionModel,
} from './world.js';

type FuzzCommand = fc.AsyncCommand<Model, DocumentsApi>;
const NOTHING: StepOutcome = { touched: [], events: [] };

type Requirement = 'nothing' | 'document' | 'committed';

/** Every step acts, then the world checks every invariant. */
abstract class Step implements FuzzCommand {
  protected readonly requires: Requirement = 'nothing';
  check(model: Readonly<Model>): boolean {
    switch (this.requires) {
      case 'nothing':
        return true;
      case 'document':
        return model.documents.length > 0;
      case 'committed':
        return model.committed.length > 0;
    }
  }
  async run(model: Model, api: DocumentsApi): Promise<void> {
    await checkStep(model, api, await this.act(model, api));
  }
  protected abstract act(model: Model, api: DocumentsApi): Promise<StepOutcome>;
  abstract toString(): string;
}

type Who = MemberKey | { able: number };

function describeWho(who: Who) {
  return typeof who === 'string' ? who : `able#${who.able}`;
}

function resolveWho(
  model: Readonly<Model>,
  who: Who,
  bundles: readonly Bundle[],
  company?: CompanyKey,
) {
  if (typeof who === 'string') return who;
  const able = MEMBERS.filter((member) => {
    const selected = company ?? model.context[member];
    return bundles.every((bundle) => granted(model, member, selected, bundle));
  });
  const pool = able.length > 0 ? able : MEMBERS;
  const member = pool[who.able % pool.length];
  if (!member) throw new Error('The fuzz world defines no member.');
  return member;
}

interface Aim {
  index: number;
  foreign: boolean;
  fit: boolean;
}

function aim(target: Aim, noun: string) {
  return `${target.foreign ? 'foreign ' : ''}${target.fit ? 'fit ' : ''}${noun}#${target.index}`;
}

function otherCompany(company: CompanyKey): CompanyKey {
  return company === 'A' ? 'B' : 'A';
}

function pickDocument(
  model: Readonly<Model>,
  company: CompanyKey,
  target: Aim,
  fits: (document: DocumentModel) => boolean = () => true,
) {
  const scoped = model.documents.filter(
    (document) => (document.company === company) !== target.foreign,
  );
  const fitting = scoped.filter(fits);
  const pool =
    target.fit && fitting.length > 0
      ? fitting
      : scoped.length > 0
        ? scoped
        : model.documents;
  const document = pool[target.index % pool.length];
  if (!document) throw new Error('The fuzz precondition admitted no Document.');
  return document;
}

function at<T>(values: readonly T[], index: number): T {
  const value = values[index % values.length];
  if (value === undefined)
    throw new Error('The fuzz world defines no literal.');
  return value;
}

function otherLiteral(values: readonly string[], current: string) {
  const value = values.find((item) => item.trim() !== current);
  if (value === undefined)
    throw new Error('The fuzz world defines no other literal.');
  return value;
}

interface IssuedKey {
  key: string;
  reusedRefusal: boolean;
}

function issueKey(
  model: Model,
  api: DocumentsApi,
  member: MemberKey,
  slot: number | null,
): IssuedKey {
  if (slot === null) return { key: api.nextKey(), reusedRefusal: false };
  const pool = model.refused.filter((item) => item.member === member);
  const found = pool.length === 0 ? undefined : pool[slot % pool.length];
  if (!found) return { key: api.nextKey(), reusedRefusal: false };
  return { key: found.key, reusedRefusal: true };
}

function noteRefusal(model: Model, member: MemberKey, key: string) {
  const reserved = model.committed.some(
    (item) => item.member === member && item.key === key,
  );
  if (!reserved) model.refused.push({ member, key });
}

function consumeRefusal(model: Model, member: MemberKey, key: string) {
  model.refused = model.refused.filter(
    (item) => item.member !== member || item.key !== key,
  );
}

function remember(model: Model, committed: Committed, issued: IssuedKey) {
  consumeRefusal(model, committed.member, issued.key);
  model.committed.push(committed);
}

async function refuse(input: {
  model: Model;
  reply: Reply;
  status: 403 | 404 | 409;
  invariant: Invariant;
  what: string;
  member?: MemberKey;
  key?: string;
  code?: string;
  twin?: () => Promise<Reply>;
}) {
  await expectDenial({
    reply: input.reply,
    status: input.status,
    invariant: input.invariant,
    what: input.what,
    twin: input.twin,
  });
  if (
    input.code !== undefined &&
    object(input.reply.body, input.what).code !== input.code
  )
    throw new InvariantViolation(
      input.invariant,
      `${input.what}: expected ${input.code}, got ${short(input.reply)}`,
    );
  if (input.member && input.key)
    noteRefusal(input.model, input.member, input.key);
}

function authorityDenial(
  model: Readonly<Model>,
  member: MemberKey,
  company: CompanyKey,
  bundles: readonly Bundle[],
): Invariant | undefined {
  if (bundles.every((bundle) => granted(model, member, company, bundle)))
    return undefined;
  return denialInvariant(model, member, company, bundles);
}

function event(
  action: string,
  company: CompanyKey,
  member: MemberKey,
): ExpectedEvent {
  return { action, company, member };
}

function workingTargets(document: DocumentModel) {
  const version = draftOf(document) ?? officialOf(document);
  return version;
}

class RegisterDocument extends Step {
  constructor(
    private readonly who: Who,
    private readonly title: number,
    private readonly purpose: number,
    private readonly url: number,
    private readonly foreignClient: boolean,
    private readonly keySlot: number | null,
  ) {
    super();
  }
  protected async act(model: Model, api: DocumentsApi) {
    const member = resolveWho(model, this.who, ['registrar']);
    const company = model.context[member];
    const issued = issueKey(model, api, member, this.keySlot);
    const clientId = this.foreignClient
      ? api.world.clientIds[otherCompany(company)]
      : api.world.clientIds[company];
    const body = {
      clientId,
      title: ` ${at(TITLES, this.title)} `,
      purpose: ` ${at(PURPOSES, this.purpose)} `,
      url: at(URLS, this.url),
    };
    const reply = await api.send(member, '/documents', {
      method: 'POST',
      company,
      key: issued.key,
      body,
    });
    const what = `${member} registering in Company ${company}`;
    const denied = authorityDenial(model, member, company, ['registrar']);
    if (denied) {
      await refuse({
        model,
        reply,
        status: 403,
        invariant: denied,
        what,
        member,
        key: issued.key,
      });
      return NOTHING;
    }
    if (this.foreignClient) {
      await refuse({
        model,
        reply,
        status: 404,
        invariant: 'identical-denial',
        what,
        member,
        key: issued.key,
        twin: () =>
          api.send(member, '/documents', {
            method: 'POST',
            company,
            key: api.nextKey(),
            body: { ...body, clientId: MISSING_ID },
          }),
      });
      return NOTHING;
    }
    if (reply.status !== 201)
      throw new InvariantViolation(
        'model-agreement',
        `${what}: expected 201, got ${short(reply)}`,
      );
    const detail = object(reply.body, what);
    const version = object(detail.version, `${what}'s Version`);
    const reference = object(version.representation, `${what}'s reference`);
    const document: DocumentModel = {
      id: text(detail.id, 'Document id'),
      company,
      clientId,
      title: at(TITLES, this.title).trim(),
      purpose: at(PURPOSES, this.purpose).trim(),
      workingRevision: 1,
      projectRevision: 0,
      projectId: null,
      createdAt: text(detail.createdAt, 'createdAt'),
      corrections: [],
      versions: [
        {
          id: text(version.id, 'Version id'),
          number: 1,
          status: 'draft',
          frozenTitle: null,
          frozenPurpose: null,
          supersededByNumber: null,
          references: [
            {
              id: text(reference.id, 'reference id'),
              url: body.url,
              form: 'other',
              appended: false,
            },
          ],
        },
      ],
    };
    model.documents.push(document);
    remember(
      model,
      {
        member,
        company,
        key: issued.key,
        kind: 'register',
        method: 'POST',
        path: '/documents',
        body,
        receipt: detail,
        documentId: document.id,
      },
      issued,
    );
    return {
      touched: [document],
      events: [event('document.registered', company, member)],
    };
  }
  toString() {
    return `register(${describeWho(this.who)} title=${this.title} client=${this.foreignClient ? 'foreign' : 'own'})`;
  }
}

interface Fields {
  title: number;
  purpose: number;
  url: number;
  /** Send the current values, so the correction changes nothing. */
  noop: boolean;
  stale: boolean;
}

class CorrectDocument extends Step {
  protected override readonly requires = 'document' as const;
  constructor(
    private readonly who: Who,
    private readonly target: Aim,
    private readonly fields: Fields,
    private readonly keySlot: number | null,
  ) {
    super();
  }
  protected async act(model: Model, api: DocumentsApi) {
    const member = resolveWho(model, this.who, ['registrar']);
    const company = model.context[member];
    const document = pickDocument(
      model,
      company,
      this.target,
      (item) => draftOf(item) !== undefined,
    );
    const issued = issueKey(model, api, member, this.keySlot);
    const draft = draftOf(document);
    const current = {
      title: document.title,
      purpose: document.purpose,
      url: draft ? primaryReference(draft)?.url : undefined,
    };
    const body = {
      expectedRevision:
        this.fields.stale && document.workingRevision > 1
          ? document.workingRevision - 1
          : document.workingRevision,
      title: this.fields.noop
        ? current.title
        : otherLiteral(TITLES, current.title),
      purpose: this.fields.noop
        ? current.purpose
        : otherLiteral(PURPOSES, current.purpose),
      ...(current.url === undefined
        ? {}
        : {
            url: this.fields.noop
              ? current.url
              : otherLiteral(URLS, current.url),
          }),
    };
    const requestPath = `/documents/${document.id}`;
    const reply = await api.send(member, requestPath, {
      method: 'PATCH',
      company,
      key: issued.key,
      body,
    });
    const what = `${member} correcting ${document.id}`;
    const hidden = document.company !== company;
    const denied = authorityDenial(model, member, company, ['registrar']);
    if (denied || hidden) {
      await refuse({
        model,
        reply,
        status: denied ? 403 : 404,
        invariant: denied ?? 'identical-denial',
        what,
        member,
        key: issued.key,
        twin: () =>
          api.send(member, `/documents/${MISSING_ID}`, {
            method: 'PATCH',
            company,
            key: api.nextKey(),
            body,
          }),
      });
      return NOTHING;
    }
    // The revision is checked before the draft, so a stale correction of an
    // official-only Document is a revision conflict, not a state refusal.
    if (body.expectedRevision !== document.workingRevision) {
      await refuse({
        model,
        reply,
        status: 409,
        invariant: 'stale-or-no-op',
        what,
        member,
        key: issued.key,
      });
      if (!reply.text.includes('working Document changed'))
        throw new InvariantViolation(
          'stale-or-no-op',
          `${what}: a stale correction was not named as one, got ${short(reply)}`,
        );
      return NOTHING;
    }
    if (!draft) {
      await refuse({
        model,
        reply,
        status: 409,
        invariant: 'official-versions',
        what,
        member,
        key: issued.key,
        code: 'document_version_state_invalid',
      });
      return NOTHING;
    }
    const changed = applyCorrection(document, member, body);
    if (reply.status !== 200)
      throw new InvariantViolation(
        changed ? 'history-once' : 'stale-or-no-op',
        `${what}: expected 200, got ${short(reply)}`,
      );
    const receipt = object(reply.body, what);
    if (
      receipt.outcome !== (changed ? 'corrected' : 'unchanged') ||
      integer(receipt.revision, 'revision') !== document.workingRevision
    )
      throw new InvariantViolation(
        'history-once',
        `${what}: receipt ${canonical(receipt)} does not match revision ${document.workingRevision}`,
      );
    remember(
      model,
      {
        member,
        company,
        key: issued.key,
        kind: 'correct',
        method: 'PATCH',
        path: requestPath,
        body,
        receipt,
        documentId: document.id,
      },
      issued,
    );
    return {
      touched: [document],
      events: changed ? [event('document.corrected', company, member)] : [],
    };
  }
  toString() {
    return `correct(${describeWho(this.who)} ${aim(this.target, 'document')}${this.fields.noop ? ' noop' : ''}${this.fields.stale ? ' stale' : ''})`;
  }
}

function applyCorrection(
  document: DocumentModel,
  member: MemberKey,
  body: { title?: string; purpose?: string; url?: string },
) {
  const draft = draftOf(document);
  const primary = draft ? primaryReference(draft) : undefined;
  const title = (body.title ?? document.title).trim();
  const purpose = (body.purpose ?? document.purpose).trim();
  const url = body.url ?? primary?.url;
  const titleChange =
    title === document.title
      ? undefined
      : { before: document.title, after: title };
  const purposeChange =
    purpose === document.purpose
      ? undefined
      : { before: document.purpose, after: purpose };
  const urlChange =
    primary === undefined || url === undefined || url === primary.url
      ? undefined
      : { before: primary.url, after: url };
  if (!titleChange && !purposeChange && !urlChange) return false;
  document.title = title;
  document.purpose = purpose;
  if (primary && urlChange) primary.url = urlChange.after;
  document.workingRevision += 1;
  document.corrections.push({
    revision: document.workingRevision,
    member,
    ...(titleChange ? { title: titleChange } : {}),
    ...(purposeChange ? { purpose: purposeChange } : {}),
    ...(urlChange ? { url: urlChange } : {}),
  });
  return true;
}

type Association = 'link' | 'unlink';
type ProjectChoice = 'other' | 'current' | 'foreign' | 'other-client';

class AssociateProject extends Step {
  protected override readonly requires = 'document' as const;
  constructor(
    private readonly who: Who,
    private readonly target: Aim,
    private readonly action: Association,
    private readonly choice: ProjectChoice,
    private readonly stale: boolean,
    private readonly keySlot: number | null,
  ) {
    super();
  }
  protected async act(model: Model, api: DocumentsApi) {
    const member = resolveWho(model, this.who, ['registrar', 'organizer']);
    const company = model.context[member];
    const document = pickDocument(model, company, this.target);
    const project = chooseProject(
      api,
      document,
      this.choice,
      this.target.index,
    );
    const issued = issueKey(model, api, member, this.keySlot);
    const expectedRevision =
      this.stale && document.projectRevision > 0
        ? document.projectRevision - 1
        : document.projectRevision;
    const body = {
      action: this.action,
      projectId: project?.id ?? MISSING_ID,
      expectedRevision,
    };
    const path = `/documents/${document.id}/project-association`;
    const reply = await api.send(member, path, {
      method: 'POST',
      company,
      key: issued.key,
      body,
    });
    const what = `${member} ${this.action}s ${document.id}`;
    const hidden = document.company !== company;
    const denied = authorityDenial(model, member, company, [
      'registrar',
      'organizer',
    ]);
    if (denied || hidden || !project || project.company !== document.company) {
      await refuse({
        model,
        reply,
        status: denied ? 403 : 404,
        invariant: denied ?? (hidden ? 'identical-denial' : 'single-project'),
        what,
        member,
        key: issued.key,
        twin: () =>
          api.send(
            member,
            hidden ? `/documents/${MISSING_ID}/project-association` : path,
            {
              method: 'POST',
              company,
              key: api.nextKey(),
              body: hidden ? body : { ...body, projectId: MISSING_ID },
            },
          ),
      });
      return NOTHING;
    }
    if (project.clientId !== document.clientId) {
      await refuse({
        model,
        reply,
        status: 404,
        invariant: 'single-project',
        what,
        member,
        key: issued.key,
        twin: () =>
          api.send(member, path, {
            method: 'POST',
            company,
            key: api.nextKey(),
            body: { ...body, projectId: MISSING_ID },
          }),
      });
      return NOTHING;
    }
    const stale = expectedRevision !== document.projectRevision;
    const illegal =
      this.action === 'link'
        ? document.projectId !== null
        : document.projectId !== project.id;
    if (stale || illegal) {
      await refuse({
        model,
        reply,
        status: 409,
        invariant: stale ? 'stale-or-no-op' : 'single-project',
        what,
        member,
        key: issued.key,
      });
      return NOTHING;
    }
    if (reply.status !== 201)
      throw new InvariantViolation(
        'single-project',
        `${what}: expected 201, got ${short(reply)}`,
      );
    document.projectId = this.action === 'link' ? project.id : null;
    document.projectRevision += 1;
    const receipt = object(reply.body, what);
    if (
      receipt.action !== this.action ||
      receipt.projectId !== project.id ||
      integer(receipt.revision, 'Project revision') !== document.projectRevision
    )
      throw new InvariantViolation(
        'single-project',
        `${what}: receipt ${canonical(receipt)}`,
      );
    remember(
      model,
      {
        member,
        company,
        key: issued.key,
        kind: 'associate',
        method: 'POST',
        path,
        body,
        receipt,
        documentId: document.id,
      },
      issued,
    );
    return {
      touched: [document],
      events: [
        event(
          this.action === 'link'
            ? 'document.project.linked'
            : 'document.project.unlinked',
          company,
          member,
        ),
      ],
    };
  }
  toString() {
    return `${this.action}(${describeWho(this.who)} ${aim(this.target, 'document')} project=${this.choice}${this.stale ? ' stale' : ''})`;
  }
}

function chooseProject(
  api: DocumentsApi,
  document: DocumentModel,
  choice: ProjectChoice,
  index: number,
): ProjectRef | undefined {
  if (choice === 'foreign') {
    const pool = api.world.projects.filter(
      (project) => project.company !== document.company,
    );
    return pool[index % pool.length];
  }
  if (choice === 'other-client') {
    return api.world.projects.find(
      (project) =>
        project.company === document.company &&
        project.clientId !== document.clientId,
    );
  }
  const pool = sameClientProjects(api.world, document);
  if (choice === 'current' && document.projectId)
    return pool.find((project) => project.id === document.projectId) ?? pool[0];
  const others = pool.filter((project) => project.id !== document.projectId);
  const source = choice === 'other' && others.length > 0 ? others : pool;
  return source[index % source.length];
}

class DesignateOfficial extends Step {
  protected override readonly requires = 'document' as const;
  constructor(
    private readonly who: Who,
    private readonly target: Aim,
    private readonly stale: boolean,
    private readonly keySlot: number | null,
  ) {
    super();
  }
  protected async act(model: Model, api: DocumentsApi) {
    const member = resolveWho(model, this.who, ['registrar', 'approver']);
    const company = model.context[member];
    const document = pickDocument(
      model,
      company,
      this.target,
      (item) => draftOf(item) !== undefined,
    );
    const draft = draftOf(document) ?? document.versions[0];
    if (!draft) throw new Error('The fuzz precondition admitted no Version.');
    return versionCommand({
      model,
      api,
      member,
      company,
      document,
      version: draft,
      action: 'designated_official',
      bundles: ['registrar', 'approver'],
      stale: this.stale,
      keySlot: this.keySlot,
      path: `/documents/${document.id}/versions/${draft.id || MISSING_ID}/official-designation`,
      body: revisionBody(document, this.stale),
      status: 200,
      admit: () => admitDesignation(document, draft),
      apply: () => applyDesignation(document, draft),
    });
  }
  toString() {
    return `designate(${describeWho(this.who)} ${aim(this.target, 'document')}${this.stale ? ' stale' : ''})`;
  }
}

class StartDraft extends Step {
  protected override readonly requires = 'document' as const;
  constructor(
    private readonly who: Who,
    private readonly target: Aim,
    private readonly stale: boolean,
    private readonly keySlot: number | null,
  ) {
    super();
  }
  protected async act(model: Model, api: DocumentsApi) {
    const member = resolveWho(model, this.who, ['registrar']);
    const company = model.context[member];
    const document = pickDocument(
      model,
      company,
      this.target,
      (item) => officialOf(item) !== undefined && draftOf(item) === undefined,
    );
    return versionCommand({
      model,
      api,
      member,
      company,
      document,
      version: undefined,
      action: 'drafted',
      bundles: ['registrar'],
      stale: this.stale,
      keySlot: this.keySlot,
      path: `/documents/${document.id}/versions`,
      body: revisionBody(document, this.stale),
      status: 201,
      admit: () => admitDraft(document),
      apply: () => applyDraft(document),
    });
  }
  toString() {
    return `draft(${describeWho(this.who)} ${aim(this.target, 'document')}${this.stale ? ' stale' : ''})`;
  }
}

class AddReference extends Step {
  protected override readonly requires = 'document' as const;
  constructor(
    private readonly who: Who,
    private readonly target: Aim,
    private readonly form: number,
    private readonly url: number,
    private readonly stale: boolean,
    private readonly keySlot: number | null,
  ) {
    super();
  }
  protected async act(model: Model, api: DocumentsApi) {
    const member = resolveWho(model, this.who, ['registrar']);
    const company = model.context[member];
    const document = pickDocument(model, company, this.target);
    const version = workingTargets(document) ?? document.versions[0];
    if (!version) throw new Error('The fuzz precondition admitted no Version.');
    const form = at(FORMS, this.form);
    const url = at(URLS, this.url);
    return versionCommand({
      model,
      api,
      member,
      company,
      document,
      version,
      action: 'representation_added',
      bundles: ['registrar'],
      stale: this.stale,
      keySlot: this.keySlot,
      path: `/documents/${document.id}/versions/${version.id || MISSING_ID}/representations`,
      body: { ...revisionBody(document, this.stale), form, url },
      status: 201,
      admit: () => admitAddition(version),
      apply: (receipt) => applyAddition(document, version, form, url, receipt),
    });
  }
  toString() {
    return `add-reference(${describeWho(this.who)} ${aim(this.target, 'document')} form=${this.form})`;
  }
}

class RemoveReference extends Step {
  protected override readonly requires = 'document' as const;
  constructor(
    private readonly who: Who,
    private readonly target: Aim,
    private readonly stale: boolean,
    private readonly keySlot: number | null,
  ) {
    super();
  }
  protected async act(model: Model, api: DocumentsApi) {
    const member = resolveWho(model, this.who, ['registrar']);
    const company = model.context[member];
    const document = pickDocument(
      model,
      company,
      this.target,
      (item) => (draftOf(item)?.references.length ?? 0) > 1,
    );
    const version =
      draftOf(document) ?? workingTargets(document) ?? document.versions[0];
    if (!version) throw new Error('The fuzz precondition admitted no Version.');
    const reference = version.references[version.references.length - 1];
    return versionCommand({
      model,
      api,
      member,
      company,
      document,
      version,
      action: 'representation_removed',
      bundles: ['registrar'],
      stale: this.stale,
      keySlot: this.keySlot,
      path: `/documents/${document.id}/versions/${version.id || MISSING_ID}/representations/${reference?.id || MISSING_ID}/removal`,
      body: revisionBody(document, this.stale),
      status: 200,
      admit: () => admitRemoval(version, reference),
      apply: () => applyRemoval(document, version, reference),
    });
  }
  toString() {
    return `remove-reference(${describeWho(this.who)} ${aim(this.target, 'document')})`;
  }
}

function revisionBody(document: DocumentModel, stale: boolean) {
  return {
    expectedRevision:
      stale && document.workingRevision > 1
        ? document.workingRevision - 1
        : document.workingRevision,
  };
}

type Admission =
  { kind: 'ok' } | { kind: 'conflict'; invariant: Invariant; code: string };

function admitDesignation(
  document: DocumentModel,
  version: VersionModel,
): Admission {
  if (version.status !== 'draft')
    return {
      kind: 'conflict',
      invariant: 'official-versions',
      code: 'document_version_state_invalid',
    };
  return { kind: 'ok' };
}

function admitDraft(document: DocumentModel): Admission {
  if (!officialOf(document) || draftOf(document))
    return {
      kind: 'conflict',
      invariant: 'official-versions',
      code: 'document_version_state_invalid',
    };
  if (document.versions.length >= 50)
    return {
      kind: 'conflict',
      invariant: 'official-versions',
      code: 'document_version_capacity_exceeded',
    };
  return { kind: 'ok' };
}

function admitAddition(version: VersionModel): Admission {
  if (version.status === 'superseded')
    return {
      kind: 'conflict',
      invariant: 'official-versions',
      code: 'document_version_state_invalid',
    };
  const maximum = version.status === 'draft' ? 5 : 10;
  if (version.references.length >= maximum)
    return {
      kind: 'conflict',
      invariant: 'reference-bounds',
      code: 'document_representation_capacity_exceeded',
    };
  return { kind: 'ok' };
}

function admitRemoval(
  version: VersionModel,
  reference: ReferenceModel | undefined,
): Admission {
  if (version.status !== 'draft')
    return {
      kind: 'conflict',
      invariant: 'official-versions',
      code: 'document_version_state_invalid',
    };
  if (!reference)
    return {
      kind: 'conflict',
      invariant: 'reference-bounds',
      code: 'document_version_state_invalid',
    };
  if (version.references.length <= 1)
    return {
      kind: 'conflict',
      invariant: 'reference-bounds',
      code: 'document_version_state_invalid',
    };
  return { kind: 'ok' };
}

function applyDesignation(document: DocumentModel, version: VersionModel) {
  const official = officialOf(document);
  if (official && official !== version) {
    official.status = 'superseded';
    official.supersededByNumber = version.number;
  }
  version.status = 'official';
  version.frozenTitle = document.title;
  version.frozenPurpose = document.purpose;
  document.workingRevision += 1;
}

function applyDraft(document: DocumentModel) {
  const official = officialOf(document);
  if (!official) throw new Error('A draft needs an official Version.');
  const number =
    document.versions.reduce(
      (highest, version) => Math.max(highest, version.number),
      0,
    ) + 1;
  document.versions.unshift({
    id: '',
    number,
    status: 'draft',
    frozenTitle: null,
    frozenPurpose: null,
    supersededByNumber: null,
    references: official.references
      .filter((reference) => !reference.appended)
      .map((reference) => ({
        id: '',
        url: reference.url,
        form: reference.form,
        appended: false,
      })),
  });
  document.workingRevision += 1;
}

function applyAddition(
  document: DocumentModel,
  version: VersionModel,
  form: Form,
  url: string,
  receipt: Record<string, unknown>,
) {
  version.references.push({
    id: text(receipt.representationId, 'representation id'),
    url,
    form,
    appended: version.status === 'official',
  });
  document.workingRevision += 1;
}

function applyRemoval(
  document: DocumentModel,
  version: VersionModel,
  reference: ReferenceModel | undefined,
) {
  if (!reference) return;
  version.references = version.references.filter((item) => item !== reference);
  document.workingRevision += 1;
}

async function versionCommand(input: {
  model: Model;
  api: DocumentsApi;
  member: MemberKey;
  company: CompanyKey;
  document: DocumentModel;
  version: VersionModel | undefined;
  action: string;
  bundles: readonly Bundle[];
  stale: boolean;
  keySlot: number | null;
  path: string;
  body: Record<string, unknown>;
  status: 200 | 201;
  admit: () => Admission;
  apply: (receipt: Record<string, unknown>) => void;
}): Promise<StepOutcome> {
  const issued = issueKey(input.model, input.api, input.member, input.keySlot);
  const reply = await input.api.send(input.member, input.path, {
    method: 'POST',
    company: input.company,
    key: issued.key,
    body: input.body,
  });
  const what = `${input.member} ${input.action} on ${input.document.id}`;
  const hidden = input.document.company !== input.company;
  const denied = authorityDenial(
    input.model,
    input.member,
    input.company,
    input.bundles,
  );
  if (denied || hidden || input.version?.id === '') {
    await refuse({
      model: input.model,
      reply,
      status: denied ? 403 : 404,
      invariant: denied ?? 'identical-denial',
      what,
      member: input.member,
      key: issued.key,
      twin: () =>
        input.api.send(
          input.member,
          input.path.replace(input.document.id, MISSING_ID),
          {
            method: 'POST',
            company: input.company,
            key: input.api.nextKey(),
            body: input.body,
          },
        ),
    });
    return NOTHING;
  }
  const expected = integer(input.body.expectedRevision, 'expectedRevision');
  if (expected !== input.document.workingRevision) {
    await refuse({
      model: input.model,
      reply,
      status: 409,
      invariant: 'stale-or-no-op',
      what,
      member: input.member,
      key: issued.key,
      code: 'document_revision_conflict',
    });
    return NOTHING;
  }
  const admission = input.admit();
  if (admission.kind === 'conflict') {
    await refuse({
      model: input.model,
      reply,
      status: 409,
      invariant: admission.invariant,
      what,
      member: input.member,
      key: issued.key,
      code: admission.code,
    });
    return NOTHING;
  }
  if (reply.status !== input.status)
    throw new InvariantViolation(
      'official-versions',
      `${what}: expected ${input.status}, got ${short(reply)}`,
    );
  const receipt = object(reply.body, what);
  input.apply(receipt);
  if (
    integer(receipt.workingRevision, 'workingRevision') !==
    input.document.workingRevision
  )
    throw new InvariantViolation(
      'history-once',
      `${what}: receipt revision ${canonical(receipt.workingRevision)}, model ${input.document.workingRevision}`,
    );
  remember(
    input.model,
    {
      member: input.member,
      company: input.company,
      key: issued.key,
      kind: 'version',
      method: 'POST',
      path: input.path,
      body: input.body,
      receipt,
      documentId: input.document.id,
    },
    issued,
  );
  return {
    touched: [input.document],
    events: [event(versionEvent(input.action), input.company, input.member)],
  };
}

function versionEvent(action: string) {
  switch (action) {
    case 'designated_official':
      return 'document.version.designated_official';
    case 'drafted':
      return 'document.version.drafted';
    case 'representation_added':
      return 'document.representation.added';
    case 'representation_removed':
      return 'document.representation.removed';
    default:
      return action;
  }
}

class ReadDocument extends Step {
  protected override readonly requires = 'document' as const;
  constructor(
    private readonly member: MemberKey,
    private readonly target: Aim,
  ) {
    super();
  }
  protected async act(model: Model, api: DocumentsApi) {
    const company = model.context[this.member];
    const document = pickDocument(model, company, this.target);
    const what = `${this.member} reads ${document.id}`;
    for (const path of [
      `/documents/${document.id}`,
      `/documents/${document.id}/versions`,
      `/documents/${document.id}/correction-history`,
    ]) {
      const reply = await api.send(this.member, path, { company });
      const hidden = document.company !== company;
      const denied = authorityDenial(model, this.member, company, [
        'registrar',
      ]);
      if (denied || hidden) {
        await refuse({
          model,
          reply,
          status: denied ? 403 : 404,
          invariant: denied ?? 'identical-denial',
          what: `${what} at ${path}`,
          twin: () =>
            api.send(this.member, path.replace(document.id, MISSING_ID), {
              company,
              key: api.nextKey(),
            }),
        });
        continue;
      }
      if (reply.status !== 200)
        throw new InvariantViolation(
          'model-agreement',
          `${what} at ${path}: expected 200, got ${short(reply)}`,
        );
    }
    return {
      touched: document.company === company ? [document] : [],
      events: [],
    };
  }
  toString() {
    return `read(${this.member} ${aim(this.target, 'document')})`;
  }
}

class ListDocuments extends Step {
  constructor(private readonly member: MemberKey) {
    super();
  }
  protected async act(model: Model, api: DocumentsApi) {
    const company = model.context[this.member];
    const reply = await api.send(this.member, '/documents', { company });
    const what = `${this.member} lists Company ${company}`;
    const denied = authorityDenial(model, this.member, company, ['registrar']);
    if (denied) {
      await refuse({ model, reply, status: 403, invariant: denied, what });
      return NOTHING;
    }
    if (reply.status !== 200)
      throw new InvariantViolation(
        'model-agreement',
        `${what}: expected 200, got ${short(reply)}`,
      );
    const ids = list(reply.body, what).map((value) =>
      text(object(value, 'a Document').id, 'id'),
    );
    const expected = new Set(
      model.documents
        .filter((document) => document.company === company)
        .map((document) => document.id),
    );
    if (ids.length !== expected.size || ids.some((id) => !expected.has(id)))
      throw new InvariantViolation(
        'company-isolation',
        `${what}: lists ${canonical(ids)}`,
      );
    return NOTHING;
  }
  toString() {
    return `list(${this.member})`;
  }
}

class ReplayCommand extends Step {
  protected override readonly requires = 'committed' as const;
  constructor(private readonly pick: number) {
    super();
  }
  protected async act(model: Model, api: DocumentsApi) {
    const committed = at(model.committed, this.pick);
    const reply = await api.send(committed.member, committed.path, {
      method: committed.method,
      company: committed.company,
      key: committed.key,
      body: committed.body,
    });
    const what = `${committed.member} replays ${committed.kind}`;
    const bundles = bundlesOf(committed);
    const denied = authorityDenial(
      model,
      committed.member,
      committed.company,
      bundles,
    );
    if (denied) {
      await refuse({
        model,
        reply,
        status: 403,
        invariant: denied,
        what,
      });
      return NOTHING;
    }
    if (committed.kind === 'register') {
      if (reply.status !== 201)
        throw new InvariantViolation(
          'replay-receipt',
          `${what}: expected 201, got ${short(reply)}`,
        );
      const current = await api.send(
        committed.member,
        `/documents/${committed.documentId}`,
        { company: committed.company },
      );
      if (
        current.status !== 200 ||
        canonical(current.body) !== canonical(reply.body)
      )
        throw new InvariantViolation(
          'replay-receipt',
          `${what}: the replay is not the current Document`,
        );
      return { touched: [], events: [] };
    }
    if (
      reply.status !==
        (committed.method === 'PATCH' ? 200 : successStatus(committed)) ||
      canonical(reply.body) !== canonical(committed.receipt)
    )
      throw new InvariantViolation(
        'replay-receipt',
        `${what}: expected the saved receipt, got ${short(reply)}`,
      );
    const document = model.documents.find(
      (item) => item.id === committed.documentId,
    );
    return { touched: document ? [document] : [], events: [] };
  }
  toString() {
    return `replay(#${this.pick})`;
  }
}

/** True when the command path names an existing Version, not a new draft. */
function namesExistingVersion(committed: Committed) {
  return /\/versions\/[^/]+/u.test(committed.path);
}

function bundlesOf(committed: Committed): readonly Bundle[] {
  if (committed.kind === 'associate') return ['registrar', 'organizer'];
  if (
    committed.kind === 'version' &&
    committed.path.endsWith('/official-designation')
  )
    return ['registrar', 'approver'];
  return ['registrar'];
}

function successStatus(committed: Committed): 200 | 201 {
  if (committed.path.endsWith('/official-designation')) return 200;
  if (committed.path.endsWith('/removal')) return 200;
  return 201;
}

type Reuse = 'input' | 'company' | 'target';

class ReuseKey extends Step {
  protected override readonly requires = 'committed' as const;
  constructor(
    private readonly pick: number,
    private readonly reuse: Reuse,
  ) {
    super();
  }
  protected async act(model: Model, api: DocumentsApi) {
    const committed = at(model.committed, this.pick);
    const company =
      this.reuse === 'company'
        ? otherCompany(committed.company)
        : committed.company;
    const path =
      this.reuse === 'target' && committed.kind !== 'register'
        ? committed.path.replace(
            committed.documentId,
            otherDocument(model, committed) ?? MISSING_ID,
          )
        : committed.path;
    const body =
      this.reuse === 'input' ||
      (this.reuse === 'target' && committed.kind === 'register')
        ? changedBody(committed.body)
        : committed.body;
    const reply = await api.send(committed.member, path, {
      method: committed.method,
      company,
      key: committed.key,
      body,
    });
    const what = `${committed.member} reuses a ${committed.kind} key (${this.reuse})`;
    const bundles = bundlesOf(committed);
    const denied = authorityDenial(model, committed.member, company, bundles);
    if (denied) {
      await refuse({ model, reply, status: 403, invariant: denied, what });
      return NOTHING;
    }
    // A Version or correction aimed at another Company cannot see the
    // Document, so the refusal is the safe not-found. A command that names
    // a Version id also misses that Version on another Document. Starting
    // a draft names no Version, so the same key on another visible Document
    // conflicts (#1242 review). Association and registration compare the
    // key before visibility, and so does a changed body.
    const unseen =
      this.reuse !== 'input' &&
      committed.kind !== 'register' &&
      committed.kind !== 'associate' &&
      (this.reuse === 'company' ||
        namesExistingVersion(committed) ||
        otherDocument(model, committed) === undefined);
    if (unseen) {
      await refuse({
        model,
        reply,
        status: 404,
        invariant: 'identical-denial',
        what,
        twin: () =>
          api.send(
            committed.member,
            path.replace(committed.documentId, MISSING_ID),
            {
              method: committed.method,
              company,
              key: api.nextKey(),
              body,
            },
          ),
      });
      return NOTHING;
    }
    if (reply.status !== 409 || !reply.text.includes('Idempotency-Key'))
      throw new InvariantViolation(
        'replay-receipt',
        `${what}: expected a key conflict, got ${short(reply)}`,
      );
    return NOTHING;
  }
  toString() {
    return `reuse(#${this.pick} ${this.reuse})`;
  }
}

function otherDocument(model: Model, committed: Committed) {
  return model.documents.find(
    (document) =>
      document.company === committed.company &&
      document.id !== committed.documentId,
  )?.id;
}

function changedBody(body: unknown) {
  const record = object(body, 'a reused body');
  if (typeof record.title === 'string')
    return { ...record, title: otherLiteral(TITLES, record.title.trim()) };
  if (typeof record.expectedRevision === 'number')
    return { ...record, expectedRevision: record.expectedRevision + 1 };
  if (typeof record.url === 'string')
    return { ...record, url: otherLiteral(URLS, record.url) };
  return { ...record, purpose: 'Fictional different purpose' };
}

class RaceCorrection extends Step {
  protected override readonly requires = 'document' as const;
  constructor(
    private readonly left: Who,
    private readonly right: Who,
    private readonly target: Aim,
  ) {
    super();
  }
  protected async act(model: Model, api: DocumentsApi) {
    const document =
      model.documents[this.target.index % model.documents.length];
    if (!document) return NOTHING;
    const company = document.company;
    const members = [this.left, this.right].map((who) =>
      resolveWho(model, who, ['registrar'], company),
    );
    const titleA = otherLiteral(TITLES, document.title);
    const titleB = otherLiteral(
      TITLES.filter((title) => title.trim() !== titleA.trim()),
      document.title,
    );
    const revision = document.workingRevision;
    const send = (member: MemberKey, title: string) =>
      api.send(member, `/documents/${document.id}`, {
        method: 'PATCH',
        company,
        key: api.nextKey(),
        body: { expectedRevision: revision, title, purpose: document.purpose },
      });
    const first = members[0];
    const second = members[1];
    if (!first || !second) return NOTHING;
    const [left, right] = await Promise.all([
      send(first, titleA),
      send(second, titleB),
    ]);
    return settleRace({
      model,
      document,
      company,
      attempts: [
        { member: first, reply: left, title: titleA.trim() },
        { member: second, reply: right, title: titleB.trim() },
      ],
    });
  }
  toString() {
    return `race-correct(${describeWho(this.left)} ${describeWho(this.right)})`;
  }
}

async function settleRace(input: {
  model: Model;
  document: DocumentModel;
  company: CompanyKey;
  attempts: Array<{ member: MemberKey; reply: Reply; title: string }>;
}): Promise<StepOutcome> {
  const { document, company } = input;
  const winners = input.attempts.filter(
    (attempt) => attempt.reply.status === 200,
  );
  if (winners.length > 1)
    throw new InvariantViolation(
      'history-once',
      `two corrections of Document ${document.id} at one revision both committed`,
    );
  const winner = winners[0];
  const bothAble = input.attempts.every((attempt) =>
    canRead(input.model, attempt.member, company),
  );
  if (!winner) {
    if (draftOf(document) && bothAble)
      throw new InvariantViolation(
        'history-once',
        `a draft of Document ${document.id} accepted neither racing correction: ${input.attempts.map((attempt) => short(attempt.reply)).join(' | ')}`,
      );
    for (const attempt of input.attempts) {
      if (attempt.reply.status === 403 || attempt.reply.status === 409)
        continue;
      throw new InvariantViolation(
        'model-agreement',
        `${attempt.member} racing a correction got ${short(attempt.reply)}`,
      );
    }
    return { touched: [document], events: [] };
  }
  if (!canRead(input.model, winner.member, company))
    throw new InvariantViolation(
      denialInvariant(input.model, winner.member, company, ['registrar']),
      `${winner.member} corrected Document ${document.id} without Registrar`,
    );
  for (const attempt of input.attempts) {
    if (attempt === winner) continue;
    const able = canRead(input.model, attempt.member, company);
    if (able && attempt.reply.status !== 409)
      throw new InvariantViolation(
        'stale-or-no-op',
        `${attempt.member} lost a correction race with ${short(attempt.reply)}`,
      );
    if (!able && attempt.reply.status !== 403)
      throw new InvariantViolation(
        denialInvariant(input.model, attempt.member, company, ['registrar']),
        `${attempt.member} racing without Registrar got ${short(attempt.reply)}`,
      );
  }
  if (draftOf(document) === undefined)
    throw new InvariantViolation(
      'official-versions',
      `a correction race committed without a draft on ${document.id}`,
    );
  applyCorrection(document, winner.member, {
    title: winner.title,
    purpose: document.purpose,
  });
  return {
    touched: [document],
    events: [event('document.corrected', company, winner.member)],
  };
}

class RaceLink extends Step {
  protected override readonly requires = 'document' as const;
  constructor(
    private readonly left: Who,
    private readonly right: Who,
    private readonly target: Aim,
  ) {
    super();
  }
  protected async act(model: Model, api: DocumentsApi) {
    const pool = model.documents.filter(
      (document) => document.projectId === null,
    );
    const document = (pool.length > 0 ? pool : model.documents)[
      this.target.index % Math.max(model.documents.length, 1)
    ];
    if (!document) return NOTHING;
    const projects = sameClientProjects(api.world, document);
    const firstProject = projects[0];
    const secondProject = projects[1] ?? projects[0];
    if (!firstProject || !secondProject) return NOTHING;
    const company = document.company;
    const members = [this.left, this.right].map((who) =>
      resolveWho(model, who, ['registrar', 'organizer'], company),
    );
    const revision = document.projectRevision;
    const send = (member: MemberKey, project: ProjectRef) =>
      api.send(member, `/documents/${document.id}/project-association`, {
        method: 'POST',
        company,
        key: api.nextKey(),
        body: {
          action: 'link',
          projectId: project.id,
          expectedRevision: revision,
        },
      });
    const first = members[0];
    const second = members[1];
    if (!first || !second) return NOTHING;
    const [left, right] = await Promise.all([
      send(first, firstProject),
      send(second, secondProject),
    ]);
    const attempts = [
      { member: first, reply: left, project: firstProject },
      { member: second, reply: right, project: secondProject },
    ];
    const winners = attempts.filter((attempt) => attempt.reply.status === 201);
    if (winners.length > 1)
      throw new InvariantViolation(
        'single-project',
        `Document ${document.id} accepted two Project links`,
      );
    const winner = winners[0];
    const bothAble = attempts.every((attempt) =>
      canLink(model, attempt.member, company),
    );
    if (!winner) {
      if (document.projectId === null && bothAble)
        throw new InvariantViolation(
          'single-project',
          `an unlinked Document ${document.id} accepted neither racing link: ${attempts.map((attempt) => short(attempt.reply)).join(' | ')}`,
        );
      return { touched: [document], events: [] };
    }
    if (!canLink(model, winner.member, company))
      throw new InvariantViolation(
        denialInvariant(model, winner.member, company, [
          'registrar',
          'organizer',
        ]),
        `${winner.member} linked Document ${document.id} without Registrar and Project Organizer`,
      );
    if (document.projectId !== null)
      throw new InvariantViolation(
        'single-project',
        `Document ${document.id} was linked twice`,
      );
    document.projectId = winner.project.id;
    document.projectRevision += 1;
    return {
      touched: [document],
      events: [event('document.project.linked', company, winner.member)],
    };
  }
  toString() {
    return `race-link(${describeWho(this.left)} ${describeWho(this.right)})`;
  }
}

class GrantBundle extends Step {
  constructor(
    private readonly member: MemberKey,
    private readonly company: CompanyKey,
    private readonly bundle: Bundle,
  ) {
    super();
  }
  protected async act(model: Model, api: DocumentsApi) {
    const reply = await api.send('owner', bundleAssignments(this.bundle), {
      method: 'POST',
      key: randomUUID(),
      body: {
        companyId: api.companyIds[this.company],
        workspaceMembershipId: api.membershipIds[this.member],
      },
    });
    if (reply.status !== 201)
      throw new InvariantViolation(
        'model-agreement',
        `granting ${this.member} ${this.bundle} in Company ${this.company}: expected 201, got ${short(reply)}`,
      );
    const changed = !granted(model, this.member, this.company, this.bundle);
    setGrant(model, this.member, this.company, this.bundle, 'active');
    return {
      touched: [],
      events: changed
        ? [
            event(
              assignmentAction(this.bundle, 'granted'),
              this.company,
              this.member,
            ),
          ]
        : [],
    };
  }
  toString() {
    return `grant(${this.member} ${this.company} ${this.bundle})`;
  }
}

class RevokeBundle extends Step {
  constructor(
    private readonly member: MemberKey,
    private readonly company: CompanyKey,
    private readonly bundle: Bundle,
  ) {
    super();
  }
  protected async act(model: Model, api: DocumentsApi) {
    const reply = await api.send(
      'owner',
      `${bundleAssignments(this.bundle)}/${api.membershipIds[this.member]}/${api.companyIds[this.company]}`,
      { method: 'DELETE', key: randomUUID() },
    );
    const what = `revoking ${this.member} ${this.bundle} in Company ${this.company}`;
    if (reply.status !== 200)
      throw new InvariantViolation(
        'model-agreement',
        `${what}: expected 200, got ${short(reply)}`,
      );
    const changed = granted(model, this.member, this.company, this.bundle);
    if (changed)
      setGrant(model, this.member, this.company, this.bundle, 'revoked');
    const next = await api.send(this.member, '/documents', {
      company: this.company,
    });
    const allowed = canRead(model, this.member, this.company);
    if (next.status !== (allowed ? 200 : 403))
      throw new InvariantViolation(
        allowed
          ? 'command-authority'
          : denialInvariant(model, this.member, this.company, ['registrar']),
        `${this.member}'s next list after ${what}: expected ${allowed ? 200 : 403}, got ${short(next)}`,
      );
    return {
      touched: [],
      events: changed
        ? [
            event(
              assignmentAction(this.bundle, 'revoked'),
              this.company,
              this.member,
            ),
          ]
        : [],
    };
  }
  toString() {
    return `revoke(${this.member} ${this.company} ${this.bundle})`;
  }
}

class SwitchCompany extends Step {
  constructor(
    private readonly member: MemberKey,
    private readonly company: CompanyKey,
  ) {
    super();
  }
  protected async act(model: Model, api: DocumentsApi) {
    const reply = await api.send(this.member, '/access/current-actor', {
      company: this.company,
    });
    if (reply.status !== 200)
      throw new InvariantViolation(
        'model-agreement',
        `${this.member} selecting Company ${this.company}: expected 200, got ${short(reply)}`,
      );
    model.context[this.member] = this.company;
    return NOTHING;
  }
  toString() {
    return `company(${this.member} ${this.company})`;
  }
}

/** The command arbitraries, repeated by weight. */
export function fuzzCommands(options: {
  steps: number;
  replayPath: string | undefined;
}) {
  const member = fc.constantFrom(...MEMBERS);
  const who: fc.Arbitrary<Who> = fc.oneof(
    member,
    fc.record({ able: fc.nat({ max: 2 }) }),
  );
  const company = fc.constantFrom(...COMPANIES);
  const bundle = fc.constantFrom(
    ...(['registrar', 'approver', 'organizer'] as const),
  );
  const pick = fc.nat({ max: 7 });
  const oneIn = (n: number) => fc.nat({ max: n - 1 }).map((roll) => roll === 0);
  const target: fc.Arbitrary<Aim> = fc.record({
    index: pick,
    foreign: oneIn(4),
    fit: oneIn(4).map((roll) => !roll),
  });
  const keySlot: fc.Arbitrary<number | null> = fc.oneof(
    { arbitrary: fc.constant(null), weight: 3 },
    { arbitrary: pick, weight: 1 },
  );
  const choice = fc.constantFrom<ProjectChoice>(
    'other',
    'current',
    'foreign',
    'other-client',
  );
  const weighted: Array<[number, fc.Arbitrary<FuzzCommand>]> = [
    [
      4,
      fc
        .tuple(
          who,
          fc.nat({ max: 2 }),
          fc.nat({ max: 2 }),
          fc.nat({ max: 2 }),
          oneIn(4),
          keySlot,
        )
        .map((args) => new RegisterDocument(...args)),
    ],
    [
      4,
      fc
        .tuple(
          who,
          target,
          fc.record({
            title: fc.nat({ max: 2 }),
            purpose: fc.nat({ max: 2 }),
            url: fc.nat({ max: 2 }),
            noop: oneIn(4),
            stale: oneIn(5),
          }),
          keySlot,
        )
        .map((args) => new CorrectDocument(...args)),
    ],
    [
      4,
      fc
        .tuple(
          who,
          target,
          fc.constantFrom<Association>('link', 'unlink'),
          choice,
          oneIn(5),
          keySlot,
        )
        .map((args) => new AssociateProject(...args)),
    ],
    [
      3,
      fc
        .tuple(who, target, oneIn(5), keySlot)
        .map((args) => new DesignateOfficial(...args)),
    ],
    [
      2,
      fc
        .tuple(who, target, oneIn(5), keySlot)
        .map((args) => new StartDraft(...args)),
    ],
    [
      2,
      fc
        .tuple(
          who,
          target,
          fc.nat({ max: 3 }),
          fc.nat({ max: 2 }),
          oneIn(5),
          keySlot,
        )
        .map((args) => new AddReference(...args)),
    ],
    [
      2,
      fc
        .tuple(who, target, oneIn(5), keySlot)
        .map((args) => new RemoveReference(...args)),
    ],
    [2, fc.tuple(member, target).map((args) => new ReadDocument(...args))],
    [1, member.map((who) => new ListDocuments(who))],
    [2, fc.tuple(member, company).map((args) => new SwitchCompany(...args))],
    [
      2,
      fc.tuple(member, company, bundle).map((args) => new GrantBundle(...args)),
    ],
    [
      2,
      fc
        .tuple(member, company, bundle)
        .map((args) => new RevokeBundle(...args)),
    ],
    [2, pick.map((index) => new ReplayCommand(index))],
    [
      2,
      fc
        .tuple(pick, fc.constantFrom<Reuse>('input', 'company', 'target'))
        .map((args) => new ReuseKey(...args)),
    ],
    [1, fc.tuple(who, who, target).map((args) => new RaceCorrection(...args))],
    [1, fc.tuple(who, who, target).map((args) => new RaceLink(...args))],
  ];
  const steps = weighted.flatMap(([weight, step]) =>
    Array.from({ length: weight }, () => step),
  );
  return fc.commands(steps, {
    size: 'max',
    maxCommands: options.steps,
    ...(options.replayPath === undefined
      ? {}
      : { replayPath: options.replayPath }),
  });
}
