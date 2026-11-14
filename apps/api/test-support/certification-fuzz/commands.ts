import { randomUUID } from 'node:crypto';
import * as fc from 'fast-check';
import {
  allCriteria,
  applicationFacts,
} from '../../src/certification/certification.test-support.js';
import {
  expectDenial,
  canonical,
  short,
  type Reply,
} from '../model-fuzz/checks.js';
import {
  assignmentAction,
  bundleAssignments,
  BUNDLES,
  checkStep,
  COMPANIES,
  denialInvariant,
  granted,
  integer,
  InvariantViolation,
  MEMBERS,
  MISSING_ID,
  object,
  setGrant,
  text,
  type Bundle,
  type CaseModel,
  type CompanyKey,
  type CertificationApi,
  type ExpectedEvent,
  type MemberKey,
  type Model,
  type Phase,
  type StepOutcome,
} from './world.js';

type FuzzCommand = fc.AsyncCommand<Model, CertificationApi>;
const NOTHING: StepOutcome = { touched: [], events: [] };
const FACTS = applicationFacts({
  haccpStudyCount: 1,
  effectiveFte: 10,
  totalHeadcount: 10,
});
const CRITERIA = allCriteria();
const TEXTS = [
  {
    language: 'ro',
    holderName: 'Fictional Holder SRL',
    address: '1 Example Street, Demo City',
    scope: 'Fictional pasteurised milk',
  },
  {
    language: 'en',
    holderName: 'Fictional Holder LLC',
    address: '1 Example Street, Demo City',
    scope: 'Fictional pasteurised milk',
  },
];
const DOSSIER_ITEMS = [
  'application',
  'application_review',
  'duration',
  'agreement',
  'team_approval',
  'stage_1_plan',
  'stage_1_report',
  'stage_2_plan',
  'stage_2_report',
  'participant_lists',
  'findings_follow_up',
  'recommendation',
  'certificate_data',
];

abstract class Step implements FuzzCommand {
  protected readonly needsCase: boolean = false;
  check(model: Readonly<Model>): boolean {
    return !this.needsCase || model.cases.length > 0;
  }
  async run(model: Model, api: CertificationApi): Promise<void> {
    await checkStep(model, api, await this.act(model, api));
  }
  protected abstract act(
    model: Model,
    api: CertificationApi,
  ): Promise<StepOutcome>;
  abstract toString(): string;
}

function holders(
  model: Readonly<Model>,
  company: CompanyKey,
  role: Bundle,
  exclude?: MemberKey,
): MemberKey[] {
  return MEMBERS.filter(
    (member) =>
      member !== exclude &&
      // Every generated team names Cora as its only leader. Stage reports
      // and the recommendation refuse anyone else, even with the Auditor bundle.
      (role !== 'auditor' || member === 'cora') &&
      granted(model, member, company, 'reader') &&
      granted(model, member, company, role),
  );
}
function event(
  action: string,
  company: CompanyKey,
  member: MemberKey,
): ExpectedEvent {
  return { action, company, member };
}
function codeOf(reply: Reply) {
  if (
    !reply.body ||
    typeof reply.body !== 'object' ||
    Array.isArray(reply.body)
  )
    return undefined;
  const code = Object.fromEntries(Object.entries(reply.body)).code;
  return typeof code === 'string' ? code : undefined;
}
function remember(
  model: Model,
  member: MemberKey,
  company: CompanyKey,
  key: string,
  path: string,
  body: unknown,
  receipt: unknown,
  status: number,
) {
  model.refused = model.refused.filter(
    (item) => item.member !== member || item.key !== key,
  );
  model.committed.push({ member, company, key, path, body, receipt, status });
}
function noteRefusal(model: Model, member: MemberKey, key: string) {
  if (
    !model.committed.some((item) => item.member === member && item.key === key)
  )
    model.refused.push({ member, key });
}
function issueKey(
  model: Model,
  api: CertificationApi,
  member: MemberKey,
  slot: number | null,
) {
  if (slot === null) return api.nextKey();
  const pool = model.refused.filter((item) => item.member === member);
  const found = pool.length === 0 ? undefined : pool[slot % pool.length];
  return found?.key ?? api.nextKey();
}
function adopt(
  item: CaseModel,
  reply: Reply,
  next: {
    phase: Phase;
    status: CaseModel['status'];
    nextStep: string | null;
    action: string;
  },
) {
  if (reply.status !== 201)
    throw new InvariantViolation(
      'step-order',
      `expected 201, got ${short(reply)}`,
    );
  const body = object(reply.body, 'the Case');
  const revision = integer(body.revision, 'revision');
  if (revision !== item.revision + 1)
    throw new InvariantViolation(
      'revisions-grow',
      `revision became ${revision}, expected ${item.revision + 1}`,
    );
  if (body.status !== next.status || body.nextStep !== next.nextStep)
    throw new InvariantViolation(
      'step-order',
      `head is ${canonical(body.status)}/${canonical(body.nextStep)}, expected ${next.status}/${canonical(next.nextStep)}`,
    );
  item.revision = revision;
  item.phase = next.phase;
  item.status = next.status;
  item.nextStep = next.nextStep;
  item.events.push(next.action);
  if (body.decision !== null)
    item.versions.decision = text(
      object(body.decision, 'decision').id,
      'decision version',
    );
  if (body.certificateData !== null)
    item.versions.data = text(
      object(body.certificateData, 'data').id,
      'data version',
    );
  item.versions.draft =
    object(body.release, 'release').currentDraftId === null
      ? null
      : text(object(body.release, 'release').currentDraftId, 'draft version');
  return body;
}
async function refuse(input: {
  model: Model;
  reply: Reply;
  status: 403 | 404 | 409;
  invariant:
    | ReturnType<typeof denialInvariant>
    | 'step-order'
    | 'revisions-grow'
    | 'replay-receipt';
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
  if (input.code !== undefined && codeOf(input.reply) !== input.code)
    throw new InvariantViolation(
      input.invariant,
      `${input.what}: expected ${input.code}, got ${short(input.reply)}`,
    );
  if (input.member && input.key)
    noteRefusal(input.model, input.member, input.key);
}

function needsSource(phase: Phase) {
  return (
    phase === 'duration' ||
    phase === 'approved' ||
    phase === 's1-planned' ||
    phase === 's1-reported' ||
    phase === 's2-planned' ||
    phase === 'recommended' ||
    phase === 'decided' ||
    phase === 'release-approved'
  );
}
function roleFor(phase: Phase): Bundle {
  if (
    phase === 'team' ||
    phase === 'data' ||
    phase === 'reviewed' ||
    phase === 'opined' ||
    phase === 'certificate-doc'
  )
    return 'approver';
  if (
    phase === 's1-report-doc' ||
    phase === 's2-report-doc' ||
    phase === 's2-reported'
  )
    return 'auditor';
  return 'manager';
}
function canAdvance(model: Readonly<Model>, item: CaseModel) {
  if (item.phase === 'certified' || item.phase === 'rejected') return false;
  const role = roleFor(item.phase);
  return (
    holders(model, item.company, role, role === 'approver' ? 'cora' : undefined)
      .length > 0
  );
}

class OpenCase extends Step {
  constructor(
    private readonly company: CompanyKey,
    private readonly slot: number | null,
  ) {
    super();
  }
  override check(model: Readonly<Model>): boolean {
    return (
      model.cases.filter((item) => item.company === this.company).length < 3 &&
      holders(model, this.company, 'manager').length > 0
    );
  }
  protected async act(model: Model, api: CertificationApi) {
    const member = holders(model, this.company, 'manager')[0];
    if (!member) return NOTHING;
    const setup = api.world.companies[this.company];
    model.serial[this.company] += 1;
    const orderReference = `R-${this.company}-${model.serial[this.company]}`;
    const key = issueKey(model, api, member, this.slot);
    const path = `/projects/${setup.projectId}/certification-cases`;
    const body = { clientLegalEntityId: setup.entityId, orderReference };
    const reply = await api.send(member, path, {
      method: 'POST',
      company: this.company,
      key,
      body,
    });
    if (reply.status !== 201)
      throw new InvariantViolation(
        'model-agreement',
        `open failed: ${short(reply)}`,
      );
    const created = object(reply.body, 'the opened Case');
    const item: CaseModel = {
      id: text(created.id, 'id'),
      company: this.company,
      orderReference,
      revision: 1,
      phase: 'opened',
      status: 'open',
      nextStep: 'application',
      attachmentId: null,
      versions: { decision: null, data: null, draft: null },
      events: ['certification_case.opened'],
    };
    if (
      created.status !== 'open' ||
      created.nextStep !== 'application' ||
      integer(created.revision, 'revision') !== 1
    )
      throw new InvariantViolation(
        'step-order',
        `open returned ${short(reply)}`,
      );
    model.cases.push(item);
    remember(model, member, this.company, key, path, body, reply.body, 201);
    return { touched: [item], events: [] };
  }
  toString() {
    return `open(${this.company})`;
  }
}

class Advance extends Step {
  protected override readonly needsCase = true;
  constructor(private readonly index: number) {
    super();
  }
  override check(model: Readonly<Model>): boolean {
    return model.cases.some(
      (item) => canAdvance(model, item) && sourceReady(model, item),
    );
  }
  protected async act(model: Model, api: CertificationApi) {
    const ready = model.cases.filter(
      (item) => canAdvance(model, item) && sourceReady(model, item),
    );
    const item = ready[this.index % ready.length];
    if (!item) return NOTHING;
    const role = roleFor(item.phase);
    const member = holders(
      model,
      item.company,
      role,
      role === 'approver' ? 'cora' : undefined,
    )[0];
    if (!member) return NOTHING;
    if (needsSource(item.phase)) return attach(model, api, item, member);
    return step(model, api, item, member);
  }
  toString() {
    return `advance(#${this.index})`;
  }
}

function sourceReady(model: Readonly<Model>, item: CaseModel) {
  if (!needsSource(item.phase)) return true;
  return model.sourceCursor[item.company] < 8;
}

async function attach(
  model: Model,
  api: CertificationApi,
  item: CaseModel,
  member: MemberKey,
) {
  const setup = api.world.companies[item.company];
  const source = setup.sources[model.sourceCursor[item.company]];
  if (!source) return NOTHING;
  model.sourceCursor[item.company] += 1;
  const role = attachRole(item.phase);
  const key = api.nextKey();
  const path = `/certification-cases/${item.id}/documents`;
  const body = {
    expectedRevision: item.revision,
    role,
    documentId: source.documentId,
    versionId: source.versionId,
    representationId: source.representationId,
    note: null,
  };
  const reply = await api.send(member, path, {
    method: 'POST',
    company: item.company,
    key,
    body,
  });
  adopt(item, reply, {
    phase: docPhase(item.phase),
    status: 'open',
    nextStep: item.nextStep,
    action: 'certification_case.document_attached',
  });
  const listed = await api.send(member, path, { company: item.company });
  if (listed.status !== 200)
    throw new InvariantViolation(
      'model-agreement',
      `document list failed: ${short(listed)}`,
    );
  const items = object(listed.body, 'documents').items;
  if (!Array.isArray(items))
    throw new InvariantViolation(
      'model-agreement',
      'document list has no items',
    );
  const match = items
    .map((value) => object(value, 'an attachment'))
    .find((row) => row.documentId === source.documentId);
  if (!match)
    throw new InvariantViolation(
      'model-agreement',
      'the attached document is not listed',
    );
  item.attachmentId = text(match.id, 'attachment id');
  remember(model, member, item.company, key, path, body, reply.body, 201);
  return { touched: [item], events: [] };
}
function attachRole(phase: Phase) {
  if (phase === 'duration') return 'agreement';
  if (phase === 'approved' || phase === 's1-reported') return 'plan';
  if (phase === 's1-planned' || phase === 's2-planned') return 'report';
  if (phase === 'recommended') return 'certificate_data';
  if (phase === 'decided') return 'certificate_draft';
  return 'certificate';
}
function docPhase(phase: Phase): Phase {
  if (phase === 'duration') return 'agreement-doc';
  if (phase === 'approved') return 's1-plan-doc';
  if (phase === 's1-planned') return 's1-report-doc';
  if (phase === 's1-reported') return 's2-plan-doc';
  if (phase === 's2-planned') return 's2-report-doc';
  if (phase === 'recommended') return 'data-doc';
  if (phase === 'decided') return 'draft-doc';
  return 'certificate-doc';
}

async function step(
  model: Model,
  api: CertificationApi,
  item: CaseModel,
  member: MemberKey,
) {
  const built = commandFor(item, api);
  const key = api.nextKey();
  const reply = await api.send(member, built.path, {
    method: 'POST',
    company: item.company,
    key,
    body: built.body,
  });
  adopt(item, reply, built.next);
  if (built.consumeAttachment) item.attachmentId = null;
  remember(
    model,
    member,
    item.company,
    key,
    built.path,
    built.body,
    reply.body,
    201,
  );
  return { touched: [item], events: [] };
}

function commandFor(
  item: CaseModel,
  api: CertificationApi,
): {
  path: string;
  body: Record<string, unknown>;
  next: {
    phase: Phase;
    status: CaseModel['status'];
    nextStep: string | null;
    action: string;
  };
  consumeAttachment: boolean;
} {
  const base = `/certification-cases/${item.id}`;
  const expectedRevision = item.revision;
  const attachmentId = item.attachmentId;
  switch (item.phase) {
    case 'opened':
      return {
        path: `${base}/application`,
        body: { expectedRevision, facts: FACTS },
        next: {
          phase: 'applied',
          status: 'open',
          nextStep: 'application_review',
          action: 'certification_case.application_recorded',
        },
        consumeAttachment: false,
      };
    case 'applied':
      return {
        path: `${base}/application-review`,
        body: { expectedRevision, criteria: CRITERIA, outcome: 'accepted' },
        next: {
          phase: 'accepted',
          status: 'open',
          nextStep: 'duration',
          action: 'certification_case.application_reviewed',
        },
        consumeAttachment: false,
      };
    case 'accepted':
      return {
        path: `${base}/duration`,
        body: {
          expectedRevision,
          inputs: {
            primary: 'CI',
            haccpStudies: { CI: 1 },
            increases: {},
            reductions: {},
          },
          confirmed: {
            initialOnSite: '2.5',
            stage1OnSite: '1',
            stage2OnSite: '1.5',
            surveillanceOnSite: '0.83',
            recertificationOnSite: '1.67',
          },
        },
        next: {
          phase: 'duration',
          status: 'open',
          nextStep: 'agreement',
          action: 'certification_case.duration_confirmed',
        },
        consumeAttachment: false,
      };
    case 'agreement-doc':
      return {
        path: `${base}/agreement`,
        body: { expectedRevision, signedOn: '2026-11-02', attachmentId },
        next: {
          phase: 'agreed',
          status: 'open',
          nextStep: 'team',
          action: 'certification_case.agreement_recorded',
        },
        consumeAttachment: true,
      };
    case 'agreed':
      return {
        path: `${base}/team`,
        body: {
          expectedRevision,
          members: [
            {
              name: 'Auditor Demo',
              role: 'team_leader',
              workspaceMembershipId: api.membershipIds.cora,
              holdsCategory: true,
              competenceNote: 'ISO 22000 lead auditor, category C',
              declarations: {
                noConsultancy: 'confirmed',
                noEmployment: 'confirmed',
                noManagementInvolvement: 'confirmed',
                confidentiality: 'confirmed',
              },
              conflictNote: null,
            },
          ],
        },
        next: {
          phase: 'team',
          status: 'open',
          nextStep: 'team_decision',
          action: 'certification_case.team_proposed',
        },
        consumeAttachment: false,
      };
    case 'team':
      return {
        path: `${base}/team-decision`,
        body: {
          expectedRevision,
          teamVersion: 1,
          decision: 'approved',
          independenceAttested: true,
        },
        next: {
          phase: 'approved',
          status: 'open',
          nextStep: 'stage_1_plan',
          action: 'certification_case.team_decided',
        },
        consumeAttachment: false,
      };
    case 's1-plan-doc':
      return {
        path: `${base}/stages/stage-1/plan`,
        body: plan(expectedRevision, attachmentId, '2026-10-01', '1'),
        next: {
          phase: 's1-planned',
          status: 'open',
          nextStep: 'stage_1_report',
          action: 'certification_case.stage_planned',
        },
        consumeAttachment: true,
      };
    case 's1-report-doc':
      return {
        path: `${base}/stages/stage-1/report`,
        body: {
          expectedRevision,
          reportDate: '2026-10-01',
          documentReviewCompleted: true,
          conclusion: 'ready',
          conclusionNote: 'Ready.',
          reportAttachmentId: attachmentId,
        },
        next: {
          phase: 's1-reported',
          status: 'open',
          nextStep: 'stage_2_plan',
          action: 'certification_case.stage_reported',
        },
        consumeAttachment: true,
      };
    case 's2-plan-doc':
      return {
        path: `${base}/stages/stage-2/plan`,
        body: plan(expectedRevision, attachmentId, '2026-10-20', '1.5'),
        next: {
          phase: 's2-planned',
          status: 'open',
          nextStep: 'stage_2_report',
          action: 'certification_case.stage_planned',
        },
        consumeAttachment: true,
      };
    case 's2-report-doc':
      return {
        path: `${base}/stages/stage-2/report`,
        body: {
          expectedRevision,
          reportDate: '2026-10-21',
          summary: 'Stage 2 completed.',
          reportAttachmentId: attachmentId,
        },
        next: {
          phase: 's2-reported',
          status: 'open',
          nextStep: 'recommendation',
          action: 'certification_case.stage_reported',
        },
        consumeAttachment: true,
      };
    case 's2-reported':
      return {
        path: `${base}/recommendation`,
        body: {
          expectedRevision,
          recommendation: 'grant',
          basis: 'No nonconformity; system effectively implemented.',
        },
        next: {
          phase: 'recommended',
          status: 'open',
          nextStep: 'certificate_data',
          action: 'certification_case.recommendation_recorded',
        },
        consumeAttachment: false,
      };
    case 'data':
      return {
        path: `${base}/dossier-review`,
        body: { expectedRevision, ...dossier() },
        next: {
          phase: 'reviewed',
          status: 'open',
          nextStep: 'decision',
          action: 'certification_case.dossier_reviewed',
        },
        consumeAttachment: false,
      };
    case 'reviewed':
      return {
        path: `${base}/decision`,
        body: {
          expectedRevision,
          decision: 'granted',
          decidedOn: '2026-11-06',
          decidedBy: 'Decision Maker Demo',
          decidedByFunction: 'Head of the certification body',
          decisionFormAttachmentId: null,
          independenceAttested: true,
          grantedTexts: TEXTS,
          rationale: 'Recommendation accepted after the dossier review.',
          additionalInformation: null,
        },
        next: {
          phase: 'decided',
          status: 'open',
          nextStep: 'certificate',
          action: 'certification_case.decision_recorded',
        },
        consumeAttachment: false,
      };
    case 'data-doc':
      return {
        path: `${base}/certificate-data`,
        body: {
          expectedRevision,
          texts: TEXTS,
          agreedOn: '2026-10-21',
          agreementAttachmentId: attachmentId,
        },
        next: {
          phase: 'data',
          status: 'open',
          nextStep: 'dossier_review',
          action: 'certification_case.certificate_data_agreed',
        },
        consumeAttachment: true,
      };
    case 'draft-doc':
      return {
        path: `${base}/certificate-draft`,
        body: {
          expectedRevision,
          attachmentId,
          number: `C-${item.company}-${item.orderReference}`,
          draftedOn: '2026-11-06',
          decisionVersionId: item.versions.decision,
          certificateDataVersionId: item.versions.data,
        },
        next: {
          phase: 'drafted',
          status: 'open',
          nextStep: 'certificate',
          action: 'certification_case.certificate_draft_recorded',
        },
        consumeAttachment: true,
      };
    case 'drafted':
      return {
        path: `${base}/client-opinion`,
        body: {
          expectedRevision,
          draftVersionId: item.versions.draft,
          businessDate: '2026-11-06',
          outcome: 'skipped',
          skipReason: 'texts_already_agreed',
          note: null,
        },
        next: {
          phase: 'opined',
          status: 'open',
          nextStep: 'certificate',
          action: 'certification_case.client_opinion_recorded',
        },
        consumeAttachment: false,
      };
    case 'opined':
      return {
        path: `${base}/certificate-draft-approval`,
        body: {
          expectedRevision,
          draftVersionId: item.versions.draft,
          approvedOn: '2026-11-06',
          textsConfirmed: true,
          numberConfirmed: true,
          validityConfirmed: true,
          independenceAttested: true,
        },
        next: {
          phase: 'release-approved',
          status: 'open',
          nextStep: 'certificate',
          action: 'certification_case.certificate_draft_approved',
        },
        consumeAttachment: false,
      };
    case 'certificate-doc':
      return {
        path: `${base}/certificate`,
        body: {
          expectedRevision,
          number: `C-${item.company}-${item.orderReference}`,
          issuedOn: '2026-11-06',
          attachmentId,
          signedBy: 'Decision Maker Demo',
          signedByFunction: 'Head of the certification body',
          independenceAttested: true,
        },
        next: {
          phase: 'certified',
          status: 'certified',
          nextStep: null,
          action: 'certification_case.certificate_recorded',
        },
        consumeAttachment: true,
      };
    default:
      throw new InvariantViolation(
        'model-agreement',
        `no command for ${item.phase}`,
      );
  }
}
function plan(
  expectedRevision: number,
  planAttachmentId: string | null,
  startDate: string,
  onSiteDays: string,
) {
  return {
    expectedRevision,
    startDate,
    endDate: startDate,
    onSiteDays,
    remoteDays: '0',
    objectives: 'Audit objectives',
    scope: 'Fictional pasteurised milk',
    planAttachmentId,
    sentToClientOn: null,
    deviationNote: null,
  };
}
function dossier() {
  return {
    items: Object.fromEntries(
      DOSSIER_ITEMS.map((entry) => [
        entry,
        {
          answer: entry === 'findings_follow_up' ? 'not_applicable' : 'present',
          note: null,
        },
      ]),
    ),
    conclusion: 'Dossier complete; recommendation supported.',
    independenceAttested: true,
  };
}

class RejectApplication extends Step {
  protected override readonly needsCase = true;
  constructor(private readonly index: number) {
    super();
  }
  override check(model: Readonly<Model>): boolean {
    return model.cases.some(
      (item) =>
        item.phase === 'applied' &&
        holders(model, item.company, 'manager').length > 0,
    );
  }
  protected async act(model: Model, api: CertificationApi) {
    const ready = model.cases.filter(
      (item) =>
        item.phase === 'applied' &&
        holders(model, item.company, 'manager').length > 0,
    );
    const item = ready[this.index % ready.length];
    if (!item) return NOTHING;
    const member = holders(model, item.company, 'manager')[0];
    if (!member) return NOTHING;
    const key = api.nextKey();
    const path = `/certification-cases/${item.id}/application-review`;
    const body = {
      expectedRevision: item.revision,
      criteria: CRITERIA,
      outcome: 'rejected',
      rejectionReason: 'Fictional scope is not certifiable.',
    };
    const reply = await api.send(member, path, {
      method: 'POST',
      company: item.company,
      key,
      body,
    });
    adopt(item, reply, {
      phase: 'rejected',
      status: 'rejected',
      nextStep: null,
      action: 'certification_case.application_reviewed',
    });
    remember(model, member, item.company, key, path, body, reply.body, 201);
    return { touched: [item], events: [] };
  }
  toString() {
    return `reject(#${this.index})`;
  }
}

class DuplicateOrder extends Step {
  protected override readonly needsCase = true;
  constructor(private readonly index: number) {
    super();
  }
  override check(model: Readonly<Model>): boolean {
    return model.cases.some(
      (item) => holders(model, item.company, 'manager').length > 0,
    );
  }
  protected async act(model: Model, api: CertificationApi) {
    const ready = model.cases.filter(
      (item) => holders(model, item.company, 'manager').length > 0,
    );
    const item = ready[this.index % ready.length];
    if (!item) return NOTHING;
    const member = holders(model, item.company, 'manager')[0];
    if (!member) return NOTHING;
    const setup = api.world.companies[item.company];
    const key = api.nextKey();
    const reply = await api.send(
      member,
      `/projects/${setup.projectId}/certification-cases`,
      {
        method: 'POST',
        company: item.company,
        key,
        body: {
          clientLegalEntityId: setup.entityId,
          orderReference: item.orderReference,
        },
      },
    );
    await refuse({
      model,
      reply,
      status: 409,
      invariant: 'step-order',
      what: 'duplicate order',
      member,
      key,
      code: 'CERTIFICATION_ORDER_REFERENCE_TAKEN',
    });
    return NOTHING;
  }
  toString() {
    return `duplicate(#${this.index})`;
  }
}

class Premature extends Step {
  protected override readonly needsCase = true;
  constructor(private readonly index: number) {
    super();
  }
  override check(model: Readonly<Model>): boolean {
    return model.cases.some((item) => prematureReady(model, item));
  }
  protected async act(model: Model, api: CertificationApi) {
    const ready = model.cases.filter((item) => prematureReady(model, item));
    const item = ready[this.index % ready.length];
    if (!item) return NOTHING;
    const closed = item.status !== 'open';
    const member = holders(
      model,
      item.company,
      closed ? 'manager' : 'approver',
      closed ? undefined : 'cora',
    )[0];
    if (!member) return NOTHING;
    const key = api.nextKey();
    const path = closed
      ? `/certification-cases/${item.id}/application`
      : `/certification-cases/${item.id}/dossier-review`;
    const body = closed
      ? { expectedRevision: item.revision, facts: FACTS }
      : { expectedRevision: item.revision, ...dossier() };
    const reply = await api.send(member, path, {
      method: 'POST',
      company: item.company,
      key,
      body,
    });
    await refuse({
      model,
      reply,
      status: 409,
      invariant: 'step-order',
      what: 'premature step',
      member,
      key,
      code: closed
        ? 'CERTIFICATION_CASE_CLOSED'
        : 'CERTIFICATION_RECOMMENDATION_MISSING',
    });
    return NOTHING;
  }
  toString() {
    return `early(#${this.index})`;
  }
}
function prematureReady(model: Model, item: CaseModel) {
  if (item.status !== 'open')
    return holders(model, item.company, 'manager').length > 0;
  if (
    item.phase === 'recommended' ||
    item.phase === 'reviewed' ||
    item.phase === 'decided' ||
    item.phase === 'data-doc' ||
    item.phase === 'data' ||
    item.phase === 'certificate-doc' ||
    item.phase === 'draft-doc' ||
    item.phase === 'drafted' ||
    item.phase === 'opined' ||
    item.phase === 'release-approved'
  )
    return false;
  return holders(model, item.company, 'approver', 'cora').length > 0;
}

class StaleRevision extends Step {
  protected override readonly needsCase = true;
  constructor(private readonly index: number) {
    super();
  }
  override check(model: Readonly<Model>): boolean {
    return model.cases.some(
      (item) =>
        item.revision > 1 && holders(model, item.company, 'manager').length > 0,
    );
  }
  protected async act(model: Model, api: CertificationApi) {
    const ready = model.cases.filter(
      (item) =>
        item.revision > 1 && holders(model, item.company, 'manager').length > 0,
    );
    const item = ready[this.index % ready.length];
    if (!item) return NOTHING;
    const member = holders(model, item.company, 'manager')[0];
    if (!member) return NOTHING;
    const key = api.nextKey();
    const reply = await api.send(
      member,
      `/certification-cases/${item.id}/application`,
      {
        method: 'POST',
        company: item.company,
        key,
        body: { expectedRevision: item.revision - 1, facts: FACTS },
      },
    );
    await refuse({
      model,
      reply,
      status: 409,
      invariant: 'revisions-grow',
      what: 'stale revision',
      member,
      key,
      code: 'STALE_VERSION',
    });
    return NOTHING;
  }
  toString() {
    return `stale(#${this.index})`;
  }
}

class ReadCase extends Step {
  protected override readonly needsCase = true;
  constructor(
    private readonly member: MemberKey,
    private readonly index: number,
  ) {
    super();
  }
  protected async act(model: Model, api: CertificationApi) {
    const item = model.cases[this.index % model.cases.length];
    if (!item) return NOTHING;
    const company = model.context[this.member];
    const reply = await api.send(
      this.member,
      `/certification-cases/${item.id}`,
      { company },
    );
    const hidden = item.company !== company;
    const denied = !granted(model, this.member, company, 'reader');
    if (denied || hidden) {
      await refuse({
        model,
        reply,
        status: denied ? 403 : 404,
        invariant: denied
          ? denialInvariant(model, this.member, company, ['reader'])
          : 'identical-denial',
        what: `${this.member} reads ${item.id}`,
        twin: () =>
          api.send(this.member, `/certification-cases/${MISSING_ID}`, {
            company,
            key: api.nextKey(),
          }),
      });
      return NOTHING;
    }
    if (reply.status !== 200)
      throw new InvariantViolation(
        'model-agreement',
        `read failed: ${short(reply)}`,
      );
    return { touched: [item], events: [] };
  }
  toString() {
    return `read(${this.member} #${this.index})`;
  }
}

class Replay extends Step {
  constructor(private readonly pick: number) {
    super();
  }
  override check(model: Readonly<Model>): boolean {
    return model.committed.length > 0;
  }
  protected async act(model: Model, api: CertificationApi) {
    const committed = model.committed[this.pick % model.committed.length];
    if (!committed) return NOTHING;
    const reply = await api.send(committed.member, committed.path, {
      method: 'POST',
      company: committed.company,
      key: committed.key,
      body: committed.body,
    });
    const role = roleOf(committed.path);
    const denied = denialOf(model, committed.member, committed.company, role);
    if (denied) {
      await refuse({
        model,
        reply,
        status: 403,
        invariant: denied,
        what: 'replay',
      });
      return NOTHING;
    }
    if (
      reply.status !== committed.status ||
      canonical(reply.body) !== canonical(committed.receipt)
    )
      throw new InvariantViolation(
        'replay-receipt',
        `replay returned ${short(reply)}`,
      );
    return NOTHING;
  }
  toString() {
    return `replay(#${this.pick})`;
  }
}

class ReuseKey extends Step {
  constructor(private readonly pick: number) {
    super();
  }
  override check(model: Readonly<Model>): boolean {
    return model.committed.length > 0;
  }
  protected async act(model: Model, api: CertificationApi) {
    const committed = model.committed[this.pick % model.committed.length];
    if (!committed) return NOTHING;
    const body = object(committed.body, 'body');
    const next =
      'expectedRevision' in body
        ? {
            ...body,
            expectedRevision: integer(body.expectedRevision, 'revision') + 1,
          }
        : { ...body, orderReference: 'Fictional other reference' };
    const reply = await api.send(committed.member, committed.path, {
      method: 'POST',
      company: committed.company,
      key: committed.key,
      body: next,
    });
    const denied = denialOf(
      model,
      committed.member,
      committed.company,
      roleOf(committed.path),
    );
    if (denied) {
      await refuse({
        model,
        reply,
        status: 403,
        invariant: denied,
        what: 'key reuse',
      });
      return NOTHING;
    }
    if (reply.status !== 409 || codeOf(reply) !== 'IDEMPOTENCY_CONFLICT')
      throw new InvariantViolation(
        'replay-receipt',
        `key reuse returned ${short(reply)}`,
      );
    return NOTHING;
  }
  toString() {
    return `reuse(#${this.pick})`;
  }
}
function roleOf(path: string): Bundle {
  if (
    path.endsWith('/team-decision') ||
    path.endsWith('/dossier-review') ||
    path.endsWith('/decision') ||
    path.endsWith('/certificate')
  )
    return 'approver';
  if (path.endsWith('/report') || path.endsWith('/recommendation'))
    return 'auditor';
  return 'manager';
}
function denialOf(
  model: Model,
  member: MemberKey,
  company: CompanyKey,
  role: Bundle,
) {
  const reader = granted(model, member, company, 'reader')
    ? undefined
    : denialInvariant(model, member, company, ['reader']);
  const specific = granted(model, member, company, role)
    ? undefined
    : denialInvariant(model, member, company, ['reader', role]);
  return reader ?? specific;
}

class GrantBundle extends Step {
  constructor(
    private readonly member: MemberKey,
    private readonly company: CompanyKey,
    private readonly bundle: Bundle,
  ) {
    super();
  }
  protected async act(model: Model, api: CertificationApi) {
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
        `grant failed: ${short(reply)}`,
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
  protected async act(model: Model, api: CertificationApi) {
    const reply = await api.send(
      'owner',
      `${bundleAssignments(this.bundle)}/${api.membershipIds[this.member]}/${api.companyIds[this.company]}`,
      { method: 'DELETE', key: randomUUID() },
    );
    if (reply.status !== 200)
      throw new InvariantViolation(
        'model-agreement',
        `revoke failed: ${short(reply)}`,
      );
    const changed = granted(model, this.member, this.company, this.bundle);
    if (changed)
      setGrant(model, this.member, this.company, this.bundle, 'revoked');
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
  protected async act(model: Model) {
    model.context[this.member] = this.company;
    return NOTHING;
  }
  toString() {
    return `company(${this.member} ${this.company})`;
  }
}

export function fuzzCommands(options: {
  steps: number;
  replayPath: string | undefined;
}) {
  const member = fc.constantFrom(...MEMBERS);
  const company = fc.constantFrom(...COMPANIES);
  const bundle = fc.constantFrom(...BUNDLES);
  const slot = fc.oneof(
    { arbitrary: fc.constant(null), weight: 3 },
    { arbitrary: fc.nat({ max: 4 }), weight: 1 },
  );
  const weighted: Array<[number, fc.Arbitrary<FuzzCommand>]> = [
    [3, fc.tuple(company, slot).map((args) => new OpenCase(...args))],
    [5, fc.nat({ max: 5 }).map((index) => new Advance(index))],
    [1, fc.nat({ max: 5 }).map((index) => new RejectApplication(index))],
    [1, fc.nat({ max: 5 }).map((index) => new DuplicateOrder(index))],
    [2, fc.nat({ max: 5 }).map((index) => new Premature(index))],
    [1, fc.nat({ max: 5 }).map((index) => new StaleRevision(index))],
    [
      1,
      fc.tuple(member, fc.nat({ max: 5 })).map((args) => new ReadCase(...args)),
    ],
    [2, fc.nat({ max: 5 }).map((index) => new Replay(index))],
    [1, fc.nat({ max: 5 }).map((index) => new ReuseKey(index))],
    [1, fc.tuple(member, company).map((args) => new SwitchCompany(...args))],
    [
      1,
      fc.tuple(member, company, bundle).map((args) => new GrantBundle(...args)),
    ],
    [
      1,
      fc
        .tuple(member, company, bundle)
        .map((args) => new RevokeBundle(...args)),
    ],
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
