import { vi } from 'vitest';
import type { BrowserIdentity } from '../access-composition';
import type { ActorContext } from '../access-types';
import {
  CONFIRMED_DURATION_FIELDS,
  DURATION_RULE_VERSION,
  type DurationProposal,
  type DurationRefusal,
  type DurationWarning,
} from './certification-duration';

// Fictional identifiers and a fictional dairy; never real Client data.
export const certificationIds = {
  workspace: '11310000-0000-4000-8000-000000000001',
  company: '11310000-0000-4000-8000-000000000002',
  project: '11310000-0000-4000-8000-000000000003',
  client: '11310000-0000-4000-8000-000000000004',
  entity: '11310000-0000-4000-8000-000000000005',
  otherEntity: '11310000-0000-4000-8000-000000000006',
  member: '11310000-0000-4000-8000-000000000007',
  colleague: '11310000-0000-4000-8000-000000000008',
  /** A membership that is not active in the Workspace. */
  formerMember: '11310000-0000-4000-8000-000000000010',
};

/**
 * A Certification Reader, optionally Programme Manager, Approver and
 * Auditor, optionally with the Document rights to read this Client's received
 * audit source content.
 */
export function certificationActor({
  manager,
  documents = false,
  approver = false,
  auditor = false,
}: {
  manager: boolean;
  documents?: boolean;
  approver?: boolean;
  auditor?: boolean;
}): ActorContext {
  return {
    internalUserId: 'certification-person',
    workspaceMembershipId: certificationIds.member,
    workspaceId: certificationIds.workspace,
    workspaceName: 'Synthetic Certification Workspace',
    displayName: 'Ana Demo',
    email: 'ana@example.test',
    active: true,
    workspacePermissions: [],
    activeCompany: {
      id: certificationIds.company,
      displayName: 'Synthetic Certification Body',
      clientPermissions: ['client.read'],
      clientPermissionAssignmentId: 'client-grant',
      clientPermissionSetVersion: 'v1',
      projectPermissions: ['project.read'],
      projectPermissionAssignmentId: 'project-grant',
      projectPermissionSetVersion: 'v1',
      certificationReaderPermissions: ['certification.read'],
      certificationReaderAssignmentId: 'certification-reader-grant',
      certificationReaderPermissionSetVersion: 'v1',
      ...(manager
        ? {
            certificationProgrammeManagerPermissions: [
              'certification.programme.manage',
            ],
            certificationProgrammeManagerAssignmentId:
              'certification-manager-grant',
            certificationProgrammeManagerPermissionSetVersion: 'v1',
          }
        : {}),
      ...(approver
        ? {
            certificationApproverPermissions: ['certification.approve'],
            certificationApproverAssignmentId: 'certification-approver-grant',
            certificationApproverPermissionSetVersion: 'v1',
          }
        : {}),
      ...(auditor
        ? {
            certificationAuditorPermissions: ['certification.audit.record'],
            certificationAuditorAssignmentId: 'certification-auditor-grant',
            certificationAuditorPermissionSetVersion: 'v1',
          }
        : {}),
      ...(documents
        ? {
            documentPermissions: [
              'document.read',
              'document.reference.read',
              'document.content.read',
              'document.received_audit_source.access',
            ],
            documentPermissionAssignmentId: 'document-grant',
            documentPermissionSetVersion: 'v3',
            documentContentReaderAssignmentId: 'document-content-grant',
            documentContentReaderPermissionSetVersion: 'v1',
            receivedAuditSourceAccessAssignmentId:
              '11310000-0000-4000-8000-000000000009',
            receivedAuditSourceAccessPermissionSetVersion: 'v1',
            workingEvidenceContextCapture: `working-evidence-context.v1.${'c'.repeat(64)}`,
            workingEvidenceClientReadCapture: `working-evidence-client-read.v1.${'d'.repeat(64)}`,
          }
        : {}),
    },
  };
}

export const certificationIdentity: BrowserIdentity = {
  loaded: true,
  signedIn: true,
  getToken: async () => 'token',
  rejectSession: vi.fn(async () => undefined),
  signOut: async () => undefined,
  signedOutView: null,
};

/** The fictional dairy's declared application, as the server returns it. */
export function lactisFacts(overrides: Record<string, unknown> = {}) {
  return {
    declaredLegalName: 'Lactis Demo SRL',
    declaredAddress: 'Str. Exemplu 1, Demo City',
    sites: [{ address: 'Str. Exemplu 1, Demo City', activity: 'Dairy plant' }],
    requestedScope: 'Production of pasteurised milk and yoghurt',
    foodChainSubcategories: ['CI'],
    haccpStudyCount: 2,
    totalHeadcount: 40,
    effectiveFte: 37.5,
    shiftCount: 2,
    seasonalActivity: null,
    otherCertifiedSystems: null,
    outsourcedProcesses: 'Laboratory testing',
    consultant: { used: false },
    auditLanguages: ['ro'],
    preferredAuditPeriod: 'Second quarter',
    ...overrides,
  };
}

export function reviewCriteria(answer: 'yes' | 'no' = 'yes') {
  return {
    scopeCertifiable: { answer, note: 'Scope note' },
    competentTeamAvailable: { answer, note: 'Team note' },
    competentDecisionMakerAvailable: { answer, note: 'Decision maker note' },
    risksAcceptable: { answer, note: 'Risk note' },
  };
}

/** All four impartiality declarations confirmed. */
export const NO_CONFLICT = {
  noConsultancy: true,
  noEmployment: true,
  noManagementInvolvement: true,
  confidentiality: true,
};

/** One team member as the server records it: a leader holding the category. */
export function teamMember(overrides: Record<string, unknown> = {}) {
  return {
    name: 'Elena Demo',
    role: 'team_leader',
    workspaceMembershipId: null,
    holdsCategory: true,
    competenceNote: 'ISO 22000 lead auditor, category C',
    declarations: NO_CONFLICT,
    conflictNote: null,
    ...overrides,
  };
}

/** A Stage plan as the server records it: one on-site day, as confirmed. */
export function stagePlan(
  planAttachmentId: string,
  overrides: Record<string, unknown> = {},
) {
  return {
    startDate: '2026-11-10',
    endDate: '2026-11-10',
    onSiteDays: '1',
    remoteDays: '0',
    objectives: 'Evaluate readiness of the food safety management system',
    scope: 'Production of pasteurised milk and yoghurt',
    planAttachmentId,
    sentToClientOn: '2026-11-03',
    deviationNote: null,
    ...overrides,
  };
}

/** A Stage 1 report as the server records it, concluding ready. */
export function stage1Report(
  reportAttachmentId: string,
  overrides: Record<string, unknown> = {},
) {
  return {
    reportDate: '2026-11-10',
    documentReviewCompleted: true,
    conclusion: 'ready',
    conclusionNote: 'Documented system implemented; ready for Stage 2.',
    reportAttachmentId,
    participantListAttachmentId: null,
    ...overrides,
  };
}

/** A Stage 2 report as the server records it. */
export function stage2Report(
  reportAttachmentId: string,
  overrides: Record<string, unknown> = {},
) {
  return {
    reportDate: '2026-11-21',
    summary: 'Stage 2 completed as planned.',
    reportAttachmentId,
    participantListAttachmentId: null,
    annexAttachmentId: null,
    ...overrides,
  };
}

/** A Finding statement as the server records it: a cited minor nonconformity. */
export function findingStatement(overrides: Record<string, unknown> = {}) {
  return {
    clause: '8.5.1',
    area: 'Receiving of raw milk',
    statement: 'Hazard analysis does not cover allergens at receiving.',
    evidenceAttachmentIds: [],
    ...overrides,
  };
}

/** The client's response to a nonconformity as the server records it. */
export function nonconformityResponse(overrides: Record<string, unknown> = {}) {
  return {
    correction: 'Allergen added to the receiving hazard analysis.',
    cause: 'The template omitted allergens.',
    correctiveAction: 'Template revised and staff trained.',
    receivedOn: '2026-11-12',
    plannedCompletionOn: null,
    evidenceAttachmentIds: [],
    ...overrides,
  };
}

type Actor = { workspaceMembershipId: string; displayName: string };
const STAGE_STEPS = [
  'stage_1_plan',
  'stage_1_report',
  'stage_2_plan',
  'stage_2_report',
] as const;
type Step = {
  id: string;
  step:
    | 'application'
    | 'application_review'
    | 'duration'
    | 'agreement'
    | 'team'
    | 'team_decision'
    | (typeof STAGE_STEPS)[number];
  version: number;
  caseRevision: number;
  reason: string | null;
  recordedBy: Actor;
  recordedAt: string;
  value: Record<string, unknown>;
};
type FindingRecordKind =
  | 'statement'
  | 'classification'
  | 'response'
  | 'plan_judgment'
  | 'verification';
type StoredFindingRecord = {
  id: string;
  kind: FindingRecordKind;
  version: number;
  caseRevision: number;
  reason: string | null;
  recordedBy: Actor;
  recordedAt: string;
  value: Record<string, unknown>;
};
type StoredFinding = {
  id: string;
  stage: 'stage_1' | 'stage_2';
  sequence: number;
  records: StoredFindingRecord[];
};
type FindingUpdate =
  | 'correction'
  | 'classification'
  | 'reclassification'
  | 'response'
  | 'plan_judgment'
  | 'verification';
/** The later Finding version each command path records. */
const FINDING_UPDATES = new Map<string, FindingUpdate>([
  ['correction', 'correction'],
  ['classification', 'classification'],
  ['reclassification', 'reclassification'],
  ['response', 'response'],
  ['plan-judgment', 'plan_judgment'],
  ['verification', 'verification'],
]);
const FINDING_CLASSIFICATION_VALUES = [
  'major_nonconformity',
  'minor_nonconformity',
  'opportunity_for_improvement',
  'area_of_concern',
];
type StoredCase = {
  id: string;
  orderReference: string;
  entity: { id: string; legalName: string };
  status: 'open' | 'rejected';
  revision: number;
  openedAt: string;
  openedBy: Actor;
  steps: Step[];
  attachments: StoredAttachment[];
  findings: StoredFinding[];
};
/** A frozen received PDF of the Case's Client, with its exact bytes. */
export type FakeSource = {
  documentId: string;
  versionId: string;
  versionNumber: number;
  representationId: string;
  sourceTitle: string;
  fileName: string;
  bytes: Uint8Array<ArrayBuffer>;
  sha256: string;
};
type StoredAttachment = {
  id: string;
  caseRevision: number;
  role: string;
  documentId: string;
  versionId: string;
  representationId: string;
  versionNumber: number;
  sourceTitle: string;
  fileName: string;
  sizeBytes: number;
  sha256: string;
  note: string | null;
  attachedBy: Actor;
  attachedAt: string;
};
export type RecordedRequest = {
  method: string;
  path: string;
  key: string | null;
  contentType: string | null;
  company: string | null;
  body: unknown;
};

const me: Actor = {
  workspaceMembershipId: certificationIds.member,
  displayName: 'Ana Demo',
};
export const colleague: Actor = {
  workspaceMembershipId: certificationIds.colleague,
  displayName: 'Boris Demo',
};

/**
 * An in-memory stand-in for the Certification REST contract: revisions,
 * step order, exact replay and the documented refusal codes.
 */
export class FakeCertificationServer {
  readonly requests: RecordedRequest[] = [];
  readonly cases = new Map<string, StoredCase>();
  /** Replaces the next matching request's handling once. */
  readonly interceptions: {
    match: (request: RecordedRequest) => boolean;
    respond: () => Response | Promise<Response>;
  }[] = [];
  private readonly receipts = new Map<
    string,
    { body: string; response: unknown }
  >();
  private clock = Date.parse('2026-11-07T08:00:00.000Z');
  private sequence = 0;
  /** The Client's frozen received PDFs, newest first like the server. */
  readonly sources: FakeSource[] = [];
  /** Whether the actor holds the Document rights the server rechecks. */
  documentAccess = true;

  readonly actor: () => unknown;
  readonly projectId: string;
  readonly companyId: string;

  constructor({
    actor = () => certificationActor({ manager: true }),
    projectId = certificationIds.project,
    companyId = certificationIds.company,
  }: {
    actor?: () => unknown;
    projectId?: string;
    companyId?: string;
  } = {}) {
    this.actor = actor;
    this.projectId = projectId;
    this.companyId = companyId;
  }

  install() {
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL, init?: RequestInit) =>
        this.fetch(input, init),
      ),
    );
  }

  /** A received PDF registered, uploaded and designated in Documents. */
  addSource(sourceTitle: string, versionNumber = 1): FakeSource {
    const number = String(++this.sequence).padStart(2, '0');
    const bytes = new TextEncoder().encode(
      `%PDF-1.4\n% Fictional ${sourceTitle}, version ${versionNumber}\n%%EOF\n`,
    );
    const source: FakeSource = {
      documentId: `11310000-0000-4000-8000-3000000000${number}`,
      versionId: `11310000-0000-4000-8000-4000000000${number}`,
      versionNumber,
      representationId: `11310000-0000-4000-8000-5000000000${number}`,
      sourceTitle,
      fileName: `${sourceTitle.toLowerCase().replace(/[^a-z0-9]+/gu, '-')}.pdf`,
      bytes,
      sha256: sha256Hex(bytes),
    };
    this.sources.unshift(source);
    return source;
  }

  /** A colleague attaches a PDF, making any earlier expected revision stale. */
  attachAsColleague(
    caseId: string,
    source: FakeSource,
    role: string,
    note: string | null = null,
  ): string {
    const stored = this.cases.get(caseId);
    if (!stored) throw new Error('Unknown Case');
    return this.attach(stored, source, role, note, colleague).id;
  }

  /** A colleague records the agreement on an attached signed original. */
  recordAgreementAsColleague(
    caseId: string,
    signedOn: string,
    attachmentId: string,
  ) {
    const stored = this.cases.get(caseId);
    if (!stored) throw new Error('Unknown Case');
    this.append(
      stored,
      'agreement',
      { signedOn, attachmentId },
      null,
      colleague,
    );
  }

  /** Commands only: the duration proposal is a read sent as a POST. */
  mutations() {
    return this.requests.filter(
      (request) =>
        request.method === 'POST' &&
        !request.path.endsWith('/duration-proposal'),
    );
  }

  proposalReads() {
    return this.requests.filter((request) =>
      request.path.endsWith('/duration-proposal'),
    );
  }

  /**
   * Seeds a Case, optionally with a colleague's application (with `facts`
   * overriding the fictional dairy's), its accepted review, a duration
   * confirmed as proposed and an agreement on an attached signed original.
   */
  seed({
    orderReference = 'CERT-SEED',
    application = false,
    facts = {},
    accepted = false,
    duration = false,
    agreement = false,
  }: {
    orderReference?: string;
    application?: boolean;
    facts?: Record<string, unknown>;
    accepted?: boolean;
    duration?: boolean;
    agreement?: boolean;
  } = {}): string {
    const stored = this.create(orderReference, colleague);
    if (application || accepted || duration || agreement)
      this.append(stored, 'application', lactisFacts(facts), null, colleague);
    if (accepted || duration || agreement)
      this.append(
        stored,
        'application_review',
        {
          criteria: reviewCriteria('yes'),
          outcome: 'accepted',
          rejectionReason: null,
        },
        null,
        colleague,
      );
    if (duration || agreement) this.confirmDurationAsColleague(stored.id);
    if (agreement) {
      const signed = this.addSource(`Signed agreement ${orderReference}`);
      const attached = this.attach(
        stored,
        signed,
        'agreement',
        null,
        colleague,
      );
      this.append(
        stored,
        'agreement',
        { signedOn: '2026-11-02', attachmentId: attached.id },
        null,
        colleague,
      );
    }
    return stored.id;
  }

  /** A colleague proposes a team version, making earlier revisions stale. */
  proposeTeamAsColleague(
    caseId: string,
    members: Record<string, unknown>[],
    reason: string | null = null,
  ) {
    const stored = this.cases.get(caseId);
    if (!stored) throw new Error('Unknown Case');
    this.append(stored, 'team', { members }, reason, colleague);
  }

  /** A colleague approver decides on the latest team version. */
  decideTeamAsColleague(
    caseId: string,
    decision: 'approved' | 'returned',
    reason: string | null = null,
  ) {
    const stored = this.cases.get(caseId);
    const team = stored && latestStep(stored, 'team');
    if (!stored || !team) throw new Error('Unknown team');
    this.append(
      stored,
      'team_decision',
      { teamVersion: team.version, decision, reason },
      null,
      colleague,
    );
  }

  /**
   * Seeds an agreed Case whose team, led by the given membership (or by an
   * unlinked person), a colleague approver approved: Stage 1 is next, at
   * revision 8.
   */
  seedApprovedTeam({
    orderReference,
    leader = null,
  }: {
    orderReference: string;
    leader?: string | null;
  }): string {
    const caseId = this.seed({ orderReference, agreement: true });
    this.proposeTeamAsColleague(caseId, [
      teamMember({ workspaceMembershipId: leader }),
      teamMember({
        name: 'Ion Demo',
        role: 'auditor',
        holdsCategory: false,
        competenceNote: 'ISO 22000 auditor',
      }),
    ]);
    this.decideTeamAsColleague(caseId, 'approved');
    return caseId;
  }

  /** A colleague records a Stage plan or report version. */
  recordStageAsColleague(
    caseId: string,
    step: (typeof STAGE_STEPS)[number],
    value: Record<string, unknown>,
    reason: string | null = null,
  ) {
    const stored = this.cases.get(caseId);
    if (!stored) throw new Error('Unknown Case');
    this.append(stored, step, value, reason, colleague);
  }

  /**
   * A colleague team leader records a Finding with its first statement and
   * classification at one revision; returns the Finding's id.
   */
  recordFindingAsColleague(
    caseId: string,
    {
      stage,
      classification,
      statement = findingStatement(),
    }: {
      stage: 'stage_1' | 'stage_2';
      classification: string;
      statement?: Record<string, unknown>;
    },
  ): string {
    const stored = this.cases.get(caseId);
    if (!stored) throw new Error('Unknown Case');
    return this.addFinding(stored, stage, classification, statement, colleague)
      .id;
  }

  /**
   * A later Finding version recorded by a colleague: a corrected statement,
   * a classification by the team leader or approver, a response, a plan
   * judgment or a verification.
   */
  recordFindingUpdateAsColleague(
    caseId: string,
    findingId: string,
    kind: FindingRecordKind,
    value: Record<string, unknown>,
    reason: string | null = null,
  ) {
    const stored = this.cases.get(caseId);
    const found = stored?.findings.find((entry) => entry.id === findingId);
    if (!stored || !found) throw new Error('Unknown Finding');
    stored.revision += 1;
    this.addFindingRecord(
      found,
      kind,
      value,
      reason,
      stored.revision,
      colleague,
    );
  }

  /**
   * A colleague confirms the proposal for CI with every declared study and no
   * factor, making any earlier expected revision stale.
   */
  confirmDurationAsColleague(caseId: string, reason: string | null = null) {
    const stored = this.cases.get(caseId);
    const application = stored && latestStep(stored, 'application');
    if (!stored || !application) throw new Error('Unknown Case');
    const facts = applicationFactsOf(application.value);
    const factors: DurationFactors = {
      primary: 'CI',
      haccpStudies: { CI: facts.haccpStudyCount },
      increases: {},
      reductions: {},
    };
    const result = computeDuration(facts, factors);
    if (result.kind !== 'proposal') throw new Error('Seed needs a proposal');
    this.append(
      stored,
      'duration',
      {
        ruleVersion: DURATION_RULE_VERSION,
        inputs: {
          ...factors,
          subcategories: facts.foodChainSubcategories,
          effectiveFte: facts.effectiveFte,
        },
        computation: result,
        confirmed: Object.fromEntries(
          CONFIRMED_DURATION_FIELDS.map((field) => [
            field,
            centsText(roundedCents(result.proposal[field])),
          ]),
        ),
        justification: null,
      },
      reason,
      colleague,
    );
  }

  /** A colleague's correction, making any earlier expected revision stale. */
  correctAsColleague(caseId: string, reason: string) {
    const stored = this.cases.get(caseId);
    if (!stored) throw new Error('Unknown Case');
    this.append(
      stored,
      'application',
      lactisFacts({ totalHeadcount: 42 }),
      reason,
      colleague,
    );
  }

  async fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const url = new URL(String(input), 'http://localhost');
    const headers = new Headers(init?.headers);
    const request: RecordedRequest = {
      method: init?.method ?? 'GET',
      path: url.pathname,
      key: headers.get('idempotency-key'),
      contentType: headers.get('content-type'),
      company: headers.get('x-company-context-id'),
      body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
    };
    this.requests.push(request);
    const index = this.interceptions.findIndex((entry) => entry.match(request));
    if (index >= 0) {
      const [interception] = this.interceptions.splice(index, 1);
      if (interception) return interception.respond();
    }
    if (request.path === '/api/access/current-actor')
      return Response.json(this.actor());
    const rawBody = typeof init?.body === 'string' ? init.body : '';
    if (request.method === 'POST' && request.key) {
      const receipt = this.receipts.get(`${request.path}:${request.key}`);
      if (receipt)
        return receipt.body === rawBody
          ? Response.json(receipt.response, { status: 201 })
          : refusal(409, 'IDEMPOTENCY_CONFLICT');
    }
    const response = this.route(request);
    if (request.method === 'POST' && request.key && response.status === 201)
      this.receipts.set(`${request.path}:${request.key}`, {
        body: rawBody,
        response: await response.clone().json(),
      });
    return response;
  }

  private route(request: RecordedRequest): Response {
    const projectPath = `/api/projects/${this.projectId}`;
    if (request.path === `${projectPath}/certification-cases`) {
      if (request.method === 'POST') return this.open(request.body);
      const cases = [...this.cases.values()]
        .reverse()
        .map((stored) => this.summary(stored));
      return Response.json({
        projectId: this.projectId,
        cases,
        total: cases.length,
      });
    }
    if (request.path === `${projectPath}/certification-legal-entities`)
      return Response.json({
        projectId: this.projectId,
        items: [
          {
            id: certificationIds.entity,
            legalName: 'Lactis Demo SRL',
            taxId: 'RO-DEMO-1',
          },
          {
            id: certificationIds.otherEntity,
            legalName: 'Lactis Demo Logistics SRL',
            taxId: null,
          },
        ],
      });
    const content =
      /^\/api\/certification-cases\/([^/]+)\/documents\/([^/]+)\/content$/u.exec(
        request.path,
      );
    if (content) return this.content(content[1], content[2]);
    const stage =
      /^\/api\/certification-cases\/([^/]+)\/stages\/([^/]+)\/(plan|report)$/u.exec(
        request.path,
      );
    const findingPath =
      /^\/api\/certification-cases\/([^/]+)\/findings(?:\/([^/]+)\/([^/]+))?$/u.exec(
        request.path,
      );
    if (findingPath) {
      const staged = findingPath[1]
        ? this.cases.get(findingPath[1])
        : undefined;
      if (!staged || request.method !== 'POST')
        return new Response(null, { status: 404 });
      const [, , findingId, update] = findingPath;
      if (findingId === undefined || update === undefined)
        return this.recordFinding(staged, request.body);
      const kind = FINDING_UPDATES.get(update);
      if (!kind) return new Response(null, { status: 404 });
      return this.updateFinding(staged, findingId, kind, request.body);
    }
    if (stage) {
      const staged = stage[1] ? this.cases.get(stage[1]) : undefined;
      const which =
        stage[2] === 'stage-1'
          ? 'stage_1'
          : stage[2] === 'stage-2'
            ? 'stage_2'
            : undefined;
      if (!staged || !which || request.method !== 'POST')
        return new Response(null, { status: 404 });
      return stage[3] === 'plan'
        ? this.planStage(staged, which, request.body)
        : this.reportStage(staged, which, request.body);
    }
    const match =
      /^\/api\/certification-cases\/([^/]+)(\/timeline|\/application|\/application-review|\/duration-proposal|\/duration|\/documents|\/eligible-documents|\/agreement|\/team|\/team-decision)?$/u.exec(
        request.path,
      );
    const stored = match?.[1] ? this.cases.get(match[1]) : undefined;
    if (!match || !stored) return new Response(null, { status: 404 });
    switch (match[2]) {
      case undefined:
        return Response.json(this.detail(stored));
      case '/timeline':
        return Response.json({ caseId: stored.id, entries: stored.steps });
      case '/application':
        return this.recordApplication(stored, request.body);
      case '/application-review':
        return this.review(stored, request.body);
      case '/duration-proposal':
        return this.proposeDuration(stored, request.body);
      case '/duration':
        return this.confirmDuration(stored, request.body);
      case '/documents':
        return request.method === 'POST'
          ? this.attachDocument(stored, request.body)
          : Response.json({ caseId: stored.id, items: stored.attachments });
      case '/eligible-documents':
        if (!this.documentAccess) return new Response(null, { status: 403 });
        return Response.json({
          caseId: stored.id,
          items: this.sources.slice(0, 25).map((source) => ({
            documentId: source.documentId,
            versionId: source.versionId,
            versionNumber: source.versionNumber,
            representationId: source.representationId,
            sourceTitle: source.sourceTitle,
          })),
          truncated: this.sources.length > 25,
        });
      case '/agreement':
        return this.recordAgreement(stored, request.body);
      case '/team':
        return this.proposeTeam(stored, request.body);
      case '/team-decision':
        return this.decideTeam(stored, request.body);
      default:
        return new Response(null, { status: 404 });
    }
  }

  /** The exact bytes of one attachment, under the Document rights. */
  private content(
    caseId: string | undefined,
    attachmentId: string | undefined,
  ): Response {
    const stored = caseId ? this.cases.get(caseId) : undefined;
    const attached = stored?.attachments.find(
      (item) => item.id === attachmentId,
    );
    if (!attached) return new Response(null, { status: 404 });
    if (!this.documentAccess) return new Response(null, { status: 403 });
    const source = this.sources.find(
      (entry) => entry.representationId === attached.representationId,
    );
    if (!source) return new Response(null, { status: 503 });
    return new Response(source.bytes, {
      headers: {
        'content-type': 'application/pdf',
        'content-length': String(source.bytes.length),
      },
    });
  }

  /** The server's checks, in its order: revision, Document rights, source, duplicate. */
  private attachDocument(stored: StoredCase, body: unknown): Response {
    const input = record(body);
    if (input.expectedRevision !== stored.revision)
      return refusal(409, 'STALE_VERSION');
    if (stored.status !== 'open')
      return refusal(409, 'CERTIFICATION_CASE_CLOSED');
    if (!this.documentAccess) return new Response(null, { status: 403 });
    const source = this.sources.find(
      (entry) =>
        entry.documentId === input.documentId &&
        entry.versionId === input.versionId &&
        entry.representationId === input.representationId,
    );
    if (!source) return new Response(null, { status: 404 });
    if (
      stored.attachments.some(
        (item) => item.representationId === source.representationId,
      )
    )
      return refusal(409, 'CERTIFICATION_DOCUMENT_ALREADY_ATTACHED');
    const note = typeof input.note === 'string' ? input.note : null;
    this.attach(stored, source, String(input.role), note, me);
    return Response.json(this.detail(stored), { status: 201 });
  }

  /** The server's checks, in its order: revision, duration, reason, date, role. */
  private recordAgreement(stored: StoredCase, body: unknown): Response {
    const input = record(body);
    if (input.expectedRevision !== stored.revision)
      return refusal(409, 'STALE_VERSION');
    if (stored.status !== 'open')
      return refusal(409, 'CERTIFICATION_CASE_CLOSED');
    if (!latestStep(stored, 'duration'))
      return refusal(409, 'CERTIFICATION_DURATION_MISSING');
    const first = !latestStep(stored, 'agreement');
    const reason = typeof input.reason === 'string' ? input.reason : null;
    if (first !== (reason === null))
      return refusal(409, 'CERTIFICATION_CORRECTION_REASON');
    const signedOn = String(input.signedOn);
    if (signedOn > new Date(this.clock).toISOString().slice(0, 10))
      return refusal(409, 'CERTIFICATION_AGREEMENT_IN_FUTURE');
    const attached = stored.attachments.find(
      (item) => item.id === input.attachmentId,
    );
    if (attached?.role !== 'agreement')
      return refusal(409, 'CERTIFICATION_AGREEMENT_DOCUMENT');
    this.append(
      stored,
      'agreement',
      { signedOn, attachmentId: attached.id },
      reason,
      me,
    );
    return Response.json(this.detail(stored), { status: 201 });
  }

  /** The server's checks, in its order: composition, revision, agreement, reason, links. */
  private proposeTeam(stored: StoredCase, body: unknown): Response {
    const input = record(body);
    const composition = teamComposition(input.members);
    if (composition !== null) return refusal(400, composition);
    const reason = input.reason === undefined ? null : input.reason;
    if (reason !== null && !nonblank(reason))
      return refusal(400, 'INVALID_CERTIFICATION_INPUT');
    if (input.expectedRevision !== stored.revision)
      return refusal(409, 'STALE_VERSION');
    if (stored.status !== 'open')
      return refusal(409, 'CERTIFICATION_CASE_CLOSED');
    if (!latestStep(stored, 'agreement'))
      return refusal(409, 'CERTIFICATION_AGREEMENT_MISSING');
    const first = !latestStep(stored, 'team');
    if (first !== (reason === null))
      return refusal(409, 'CERTIFICATION_CORRECTION_REASON');
    const members = list(input.members).map(record);
    if (
      members.some(
        (member) =>
          member.workspaceMembershipId !== null &&
          member.workspaceMembershipId !== me.workspaceMembershipId &&
          member.workspaceMembershipId !== colleague.workspaceMembershipId,
      )
    )
      return refusal(400, 'CERTIFICATION_TEAM_MEMBER_UNKNOWN');
    this.append(stored, 'team', { members }, reason, me);
    return Response.json(this.detail(stored), { status: 201 });
  }

  /**
   * The server's checks, in its order: the approver grant, the input, the
   * revision, a pending team of that version, independence, then conflicts.
   */
  private decideTeam(stored: StoredCase, body: unknown): Response {
    if (!holdsApprover(this.actor()))
      return new Response(null, { status: 403 });
    const input = record(body);
    const approved =
      input.decision === 'approved' &&
      (input.reason === undefined || input.reason === null);
    if (
      typeof input.teamVersion !== 'number' ||
      !(approved || (input.decision === 'returned' && nonblank(input.reason)))
    )
      return refusal(400, 'INVALID_CERTIFICATION_INPUT');
    if (input.expectedRevision !== stored.revision)
      return refusal(409, 'STALE_VERSION');
    if (stored.status !== 'open')
      return refusal(409, 'CERTIFICATION_CASE_CLOSED');
    const team = latestStep(stored, 'team');
    const decided = latestStep(stored, 'team_decision');
    if (!team || decided?.value.teamVersion === team.version)
      return refusal(409, 'CERTIFICATION_TEAM_NOT_PENDING');
    if (input.teamVersion !== team.version)
      return refusal(409, 'STALE_VERSION');
    const onTeam = stored.steps.some(
      (step) =>
        step.step === 'team' &&
        list(step.value.members).some(
          (member) =>
            record(member).workspaceMembershipId === me.workspaceMembershipId,
        ),
    );
    if (onTeam) return refusal(409, 'CERTIFICATION_INDEPENDENCE');
    if (
      approved &&
      list(team.value.members).some((member) => declaresConflict(member))
    )
      return refusal(409, 'CERTIFICATION_TEAM_CONFLICT_DECLARED');
    this.append(
      stored,
      'team_decision',
      {
        teamVersion: team.version,
        decision: input.decision,
        reason: approved ? null : input.reason,
      },
      null,
      me,
    );
    return Response.json(this.detail(stored), { status: 201 });
  }

  /**
   * The server's checks, in its order: the input and its dates, the
   * revision, an approved team, a ready Stage 1 before Stage 2, the deviation
   * note, the plan role, the reason, then an unchanged correction.
   */
  private planStage(
    stored: StoredCase,
    stage: 'stage_1' | 'stage_2',
    body: unknown,
  ): Response {
    const { expectedRevision, reason, ...input } = record(body);
    const fields = [
      'startDate',
      'endDate',
      'onSiteDays',
      'remoteDays',
      'objectives',
      'scope',
      'planAttachmentId',
      'sentToClientOn',
      'deviationNote',
    ];
    const {
      startDate,
      endDate,
      onSiteDays,
      remoteDays,
      objectives,
      scope,
      planAttachmentId,
      sentToClientOn,
      deviationNote,
    } = input;
    if (
      Object.keys(input).some((key) => !fields.includes(key)) ||
      !calendarDate(startDate) ||
      !calendarDate(endDate) ||
      dayCents(onSiteDays, false) === undefined ||
      dayCents(remoteDays, true) === undefined ||
      !nonblank(objectives) ||
      !nonblank(scope) ||
      !nonblank(planAttachmentId) ||
      !(sentToClientOn === null || calendarDate(sentToClientOn)) ||
      !(deviationNote === null || nonblank(deviationNote)) ||
      !optionalText(reason)
    )
      return refusal(400, 'INVALID_CERTIFICATION_INPUT');
    if (startDate > endDate) return refusal(400, 'CERTIFICATION_STAGE_DATES');
    if (expectedRevision !== stored.revision)
      return refusal(409, 'STALE_VERSION');
    if (stored.status !== 'open')
      return refusal(409, 'CERTIFICATION_CASE_CLOSED');
    if (!approvedTeamOf(stored))
      return refusal(409, 'CERTIFICATION_TEAM_NOT_APPROVED');
    if (stage === 'stage_2') {
      const report = latestStep(stored, 'stage_1_report')?.value;
      if (report?.conclusion !== 'ready')
        return refusal(409, 'CERTIFICATION_STAGE_1_NOT_READY');
      if (
        stored.findings.some((finding) => {
          const view = this.findingView(stored, finding);
          return (
            view.stage === 'stage_1' &&
            nonconformity(view.classification) &&
            view.status !== 'verified_effective'
          );
        })
      )
        return refusal(409, 'CERTIFICATION_STAGE_1_NONCONFORMITY_OPEN');
      if (startDate <= String(report.reportDate))
        return refusal(409, 'CERTIFICATION_STAGE_DATES');
    }
    const confirmed = record(latestStep(stored, 'duration')?.value.confirmed);
    const expected = dayCents(
      stage === 'stage_1' ? confirmed.stage1OnSite : confirmed.stage2OnSite,
      false,
    );
    if ((dayCents(onSiteDays, false) !== expected) !== (deviationNote !== null))
      return refusal(400, 'CERTIFICATION_STAGE_DEVIATION_NOTE');
    if (!this.hasAttachment(stored, planAttachmentId, ['plan']))
      return refusal(409, 'CERTIFICATION_ATTACHMENT_ROLE');
    return this.appendStage(
      stored,
      stage === 'stage_1' ? 'stage_1_plan' : 'stage_2_plan',
      {
        startDate,
        endDate,
        onSiteDays,
        remoteDays,
        objectives,
        scope,
        planAttachmentId,
        sentToClientOn,
        deviationNote,
      },
      reason,
    );
  }

  /**
   * The server's checks, in its order: the auditor grant, the input, the
   * revision, the leader of the approved team, the plan and its start, the
   * attachment roles, the reason, then an unchanged correction.
   */
  private reportStage(
    stored: StoredCase,
    stage: 'stage_1' | 'stage_2',
    body: unknown,
  ): Response {
    if (!holdsAuditor(this.actor())) return new Response(null, { status: 403 });
    const { expectedRevision, reason, ...input } = record(body);
    const fields =
      stage === 'stage_1'
        ? [
            'reportDate',
            'documentReviewCompleted',
            'conclusion',
            'conclusionNote',
            'reportAttachmentId',
            'participantListAttachmentId',
          ]
        : [
            'reportDate',
            'summary',
            'reportAttachmentId',
            'participantListAttachmentId',
            'annexAttachmentId',
          ];
    if (Object.keys(input).some((key) => !fields.includes(key)))
      return refusal(400, 'INVALID_CERTIFICATION_INPUT');
    if (stage === 'stage_1' && input.documentReviewCompleted !== true)
      return refusal(400, 'CERTIFICATION_DOCUMENT_REVIEW_INCOMPLETE');
    const {
      reportDate,
      reportAttachmentId,
      participantListAttachmentId = null,
      annexAttachmentId = null,
    } = input;
    const value =
      stage === 'stage_1'
        ? {
            reportDate,
            documentReviewCompleted: true,
            conclusion: input.conclusion,
            conclusionNote: input.conclusionNote,
            reportAttachmentId,
            participantListAttachmentId,
          }
        : {
            reportDate,
            summary: input.summary,
            reportAttachmentId,
            participantListAttachmentId,
            annexAttachmentId,
          };
    if (
      !calendarDate(reportDate) ||
      !nonblank(reportAttachmentId) ||
      !(
        participantListAttachmentId === null ||
        nonblank(participantListAttachmentId)
      ) ||
      !(annexAttachmentId === null || nonblank(annexAttachmentId)) ||
      (stage === 'stage_1'
        ? (input.conclusion !== 'ready' && input.conclusion !== 'not_ready') ||
          !nonblank(input.conclusionNote)
        : !nonblank(input.summary)) ||
      !optionalText(reason)
    )
      return refusal(400, 'INVALID_CERTIFICATION_INPUT');
    if (expectedRevision !== stored.revision)
      return refusal(409, 'STALE_VERSION');
    if (stored.status !== 'open')
      return refusal(409, 'CERTIFICATION_CASE_CLOSED');
    const team = approvedTeamOf(stored);
    if (
      !team ||
      !list(team.value.members)
        .map(record)
        .some(
          (member) =>
            member.role === 'team_leader' &&
            member.workspaceMembershipId === me.workspaceMembershipId,
        )
    )
      return refusal(409, 'CERTIFICATION_NOT_TEAM_LEADER');
    const plan = latestStep(
      stored,
      stage === 'stage_1' ? 'stage_1_plan' : 'stage_2_plan',
    );
    if (!plan) return refusal(409, 'CERTIFICATION_STAGE_NOT_PLANNED');
    if (reportDate < String(plan.value.startDate))
      return refusal(409, 'CERTIFICATION_STAGE_DATES');
    if (
      !this.hasAttachment(stored, reportAttachmentId, ['report']) ||
      (participantListAttachmentId !== null &&
        !this.hasAttachment(stored, participantListAttachmentId, [
          'participant_list',
        ])) ||
      (annexAttachmentId !== null &&
        !this.hasAttachment(stored, annexAttachmentId, [
          'report',
          'evidence',
          'iso22000_annex',
        ]))
    )
      return refusal(409, 'CERTIFICATION_ATTACHMENT_ROLE');
    return this.appendStage(
      stored,
      stage === 'stage_1' ? 'stage_1_report' : 'stage_2_report',
      value,
      reason,
    );
  }

  /** A first version has no reason; a correction states one and changes a value. */
  private appendStage(
    stored: StoredCase,
    step: (typeof STAGE_STEPS)[number],
    value: Record<string, unknown>,
    reason: unknown,
  ): Response {
    const previous = latestStep(stored, step);
    const stated = nonblank(reason) ? reason : null;
    if (!previous !== (stated === null))
      return refusal(409, 'CERTIFICATION_CORRECTION_REASON');
    if (previous && sameValue(previous.value, value))
      return refusal(409, 'CERTIFICATION_CORRECTION_UNCHANGED');
    this.append(stored, step, value, stated, me);
    return Response.json(this.detail(stored), { status: 201 });
  }

  /**
   * The server's checks, in its order: the auditor grant, the input, a new
   * Finding without reason, the revision, the leader of the approved team,
   * a planned and open Stage, the classification rules, then the evidence.
   */
  private recordFinding(stored: StoredCase, body: unknown): Response {
    if (!holdsAuditor(this.actor())) return new Response(null, { status: 403 });
    const { expectedRevision, reason, stage, classification, ...fields } =
      record(body);
    const statement = statementInput(fields);
    if (
      typeof expectedRevision !== 'number' ||
      (stage !== 'stage_1' && stage !== 'stage_2') ||
      !FINDING_CLASSIFICATION_VALUES.includes(String(classification)) ||
      !statement ||
      !optionalText(reason)
    )
      return refusal(400, 'INVALID_CERTIFICATION_INPUT');
    if (reason !== undefined && reason !== null)
      return refusal(409, 'CERTIFICATION_CORRECTION_REASON');
    if (expectedRevision !== stored.revision)
      return refusal(409, 'STALE_VERSION');
    if (stored.status !== 'open')
      return refusal(409, 'CERTIFICATION_CASE_CLOSED');
    if (!this.leads(stored))
      return refusal(409, 'CERTIFICATION_NOT_TEAM_LEADER');
    if (
      !latestStep(stored, stage === 'stage_1' ? 'stage_1_plan' : 'stage_2_plan')
    )
      return refusal(409, 'CERTIFICATION_STAGE_NOT_PLANNED');
    if (stage === 'stage_1' && latestStep(stored, 'stage_2_plan'))
      return refusal(409, 'CERTIFICATION_STAGE_CLOSED');
    const rule = classificationRule(String(classification), stage, statement);
    if (rule) return refusal(400, rule);
    if (!this.allAttached(stored, statement.evidenceAttachmentIds))
      return refusal(409, 'CERTIFICATION_ATTACHMENT_ROLE');
    this.addFinding(stored, stage, String(classification), statement, me);
    return Response.json(this.detail(stored), { status: 201 });
  }

  /**
   * The server's checks, in its order: the role grant, the revision, team
   * independence or leadership, the Finding, then the rules of each update.
   */
  private updateFinding(
    stored: StoredCase,
    findingId: string,
    kind: FindingUpdate,
    body: unknown,
  ): Response {
    const granted =
      kind === 'reclassification'
        ? holdsApprover(this.actor())
        : holdsAuditor(this.actor());
    if (!granted) return new Response(null, { status: 403 });
    const { expectedRevision, reason, ...payload } = record(body);
    if (typeof expectedRevision !== 'number' || !optionalText(reason))
      return refusal(400, 'INVALID_CERTIFICATION_INPUT');
    if (expectedRevision !== stored.revision)
      return refusal(409, 'STALE_VERSION');
    if (stored.status !== 'open')
      return refusal(409, 'CERTIFICATION_CASE_CLOSED');
    if (kind === 'reclassification') {
      if (this.onTeam(stored))
        return refusal(409, 'CERTIFICATION_INDEPENDENCE');
    } else if (!this.leads(stored))
      return refusal(409, 'CERTIFICATION_NOT_TEAM_LEADER');
    const found = stored.findings.find((entry) => entry.id === findingId);
    if (!found) return new Response(null, { status: 404 });
    const view = this.findingView(stored, found);
    const stated = nonblank(reason) ? reason : null;
    switch (kind) {
      case 'correction': {
        const statement = statementInput(payload);
        if (!statement) return refusal(400, 'INVALID_CERTIFICATION_INPUT');
        if (stated === null)
          return refusal(409, 'CERTIFICATION_CORRECTION_REASON');
        if (sameValue(view.statement, statement))
          return refusal(409, 'CERTIFICATION_CORRECTION_UNCHANGED');
        const rule = classificationRule(
          view.classification,
          view.stage,
          statement,
        );
        if (rule) return refusal(400, rule);
        if (!this.allAttached(stored, statement.evidenceAttachmentIds))
          return refusal(409, 'CERTIFICATION_ATTACHMENT_ROLE');
        return this.appendFindingRecord(
          stored,
          found,
          'statement',
          statement,
          stated,
        );
      }
      case 'classification':
      case 'reclassification': {
        const { classification, ...rest } = payload;
        if (
          Object.keys(rest).length > 0 ||
          !FINDING_CLASSIFICATION_VALUES.includes(String(classification))
        )
          return refusal(400, 'INVALID_CERTIFICATION_INPUT');
        if (stated === null)
          return refusal(409, 'CERTIFICATION_CORRECTION_REASON');
        if (classification === view.classification)
          return refusal(409, 'CERTIFICATION_CORRECTION_UNCHANGED');
        const rule = classificationRule(
          String(classification),
          view.stage,
          view.statement,
        );
        if (rule) return refusal(400, rule);
        return this.appendFindingRecord(
          stored,
          found,
          'classification',
          {
            classification,
            by: kind === 'reclassification' ? 'approver' : 'team_leader',
          },
          stated,
        );
      }
      case 'response': {
        const value = responseInput(payload);
        if (!value) return refusal(400, 'INVALID_CERTIFICATION_INPUT');
        if (
          !nonconformity(view.classification) ||
          view.status === 'verified_effective'
        )
          return refusal(409, 'CERTIFICATION_FINDING_NOT_OPEN');
        if (!this.allAttached(stored, value.evidenceAttachmentIds))
          return refusal(409, 'CERTIFICATION_ATTACHMENT_ROLE');
        return this.appendFindingRecord(stored, found, 'response', value, null);
      }
      case 'plan_judgment': {
        const { outcome, note, ...rest } = payload;
        if (
          Object.keys(rest).length > 0 ||
          (outcome !== 'adequate' && outcome !== 'inadequate') ||
          !nonblank(note)
        )
          return refusal(400, 'INVALID_CERTIFICATION_INPUT');
        if (view.status !== 'awaiting_plan_judgment')
          return refusal(409, 'CERTIFICATION_FINDING_NO_RESPONSE');
        return this.appendFindingRecord(
          stored,
          found,
          'plan_judgment',
          { outcome, note },
          null,
        );
      }
      case 'verification': {
        const value = verificationInput(payload);
        if (!value) return refusal(400, 'INVALID_CERTIFICATION_INPUT');
        if (view.status !== 'plan_adequate')
          return refusal(409, 'CERTIFICATION_FINDING_PLAN_NOT_ADEQUATE');
        if (!this.allAttached(stored, value.evidenceAttachmentIds))
          return refusal(409, 'CERTIFICATION_ATTACHMENT_ROLE');
        return this.appendFindingRecord(
          stored,
          found,
          'verification',
          value,
          null,
        );
      }
    }
  }

  private appendFindingRecord(
    stored: StoredCase,
    finding: StoredFinding,
    kind: FindingRecordKind,
    value: Record<string, unknown>,
    reason: string | null,
  ): Response {
    stored.revision += 1;
    this.addFindingRecord(finding, kind, value, reason, stored.revision, me);
    return Response.json(this.detail(stored), { status: 201 });
  }

  private addFinding(
    stored: StoredCase,
    stage: 'stage_1' | 'stage_2',
    classification: string,
    statement: Record<string, unknown>,
    by: Actor,
  ): StoredFinding {
    stored.revision += 1;
    const finding: StoredFinding = {
      id: `11310000-0000-4000-8000-7000000000${String(++this.sequence).padStart(2, '0')}`,
      stage,
      sequence: stored.findings.length + 1,
      records: [],
    };
    stored.findings.push(finding);
    this.addFindingRecord(
      finding,
      'statement',
      statement,
      null,
      stored.revision,
      by,
    );
    this.addFindingRecord(
      finding,
      'classification',
      { classification, by: 'team_leader' },
      null,
      stored.revision,
      by,
    );
    return finding;
  }

  private addFindingRecord(
    finding: StoredFinding,
    kind: FindingRecordKind,
    value: Record<string, unknown>,
    reason: string | null,
    caseRevision: number,
    by: Actor,
  ) {
    finding.records.push({
      id: `11310000-0000-4000-8000-8000000000${String(++this.sequence).padStart(2, '0')}`,
      kind,
      version:
        finding.records.filter((entry) => entry.kind === kind).length + 1,
      caseRevision,
      reason,
      recordedBy: by,
      recordedAt: this.tick(),
      value,
    });
  }

  /**
   * The server's derived view: the latest statement and classification, the
   * follow-up status replayed in Case order, and the dates counted from the
   * last planned day of the Finding's Stage.
   */
  private findingView(stored: StoredCase, finding: StoredFinding) {
    let statement: Record<string, unknown> = {};
    let classification = '';
    let status = 'no_action_required';
    for (const entry of finding.records)
      switch (entry.kind) {
        case 'statement':
          statement = entry.value;
          break;
        case 'classification': {
          const was = nonconformity(classification);
          classification = String(entry.value.classification);
          if (!nonconformity(classification)) status = 'no_action_required';
          else if (!was) status = 'awaiting_response';
          break;
        }
        case 'response':
          status = 'awaiting_plan_judgment';
          break;
        case 'plan_judgment':
          status =
            entry.value.outcome === 'adequate'
              ? 'plan_adequate'
              : 'plan_inadequate';
          break;
        case 'verification':
          status =
            entry.value.outcome === 'effective'
              ? 'verified_effective'
              : 'verified_not_effective';
          break;
      }
    const plan = latestStep(
      stored,
      finding.stage === 'stage_1' ? 'stage_1_plan' : 'stage_2_plan',
    );
    const stageEnd = String(plan?.value.endDate);
    const limited =
      nonconformity(classification) &&
      (finding.stage === 'stage_1' || classification === 'major_nonconformity');
    const limitOn = limited ? addMonths(stageEnd, 6) : null;
    const today = new Date(this.clock).toISOString().slice(0, 10);
    return {
      id: finding.id,
      stage: finding.stage,
      sequence: finding.sequence,
      statement,
      classification,
      status,
      responseDueOn: nonconformity(classification)
        ? addDays(stageEnd, 14)
        : null,
      limitOn,
      overdue:
        limitOn !== null && status !== 'verified_effective' && today > limitOn,
      records: finding.records,
    };
  }

  /** Whether the actor is linked to the leader of the approved team. */
  private leads(stored: StoredCase): boolean {
    const team = approvedTeamOf(stored);
    return (
      team !== undefined &&
      list(team.value.members)
        .map(record)
        .some(
          (member) =>
            member.role === 'team_leader' &&
            member.workspaceMembershipId === me.workspaceMembershipId,
        )
    );
  }

  /** Whether the actor is linked to a member of any proposed team version. */
  private onTeam(stored: StoredCase): boolean {
    return stored.steps.some(
      (step) =>
        step.step === 'team' &&
        list(step.value.members).some(
          (member) =>
            record(member).workspaceMembershipId === me.workspaceMembershipId,
        ),
    );
  }

  private allAttached(stored: StoredCase, ids: readonly string[]): boolean {
    return ids.every((id) => stored.attachments.some((item) => item.id === id));
  }

  private hasAttachment(
    stored: StoredCase,
    attachmentId: unknown,
    roles: readonly string[],
  ): boolean {
    return stored.attachments.some(
      (item) => item.id === attachmentId && roles.includes(item.role),
    );
  }

  private attach(
    stored: StoredCase,
    source: FakeSource,
    role: string,
    note: string | null,
    by: Actor,
  ): StoredAttachment {
    stored.revision += 1;
    const attached: StoredAttachment = {
      id: `11310000-0000-4000-8000-6000000000${String(++this.sequence).padStart(2, '0')}`,
      caseRevision: stored.revision,
      role,
      documentId: source.documentId,
      versionId: source.versionId,
      representationId: source.representationId,
      versionNumber: source.versionNumber,
      sourceTitle: source.sourceTitle,
      fileName: source.fileName,
      sizeBytes: source.bytes.length,
      sha256: source.sha256,
      note,
      attachedBy: by,
      attachedAt: this.tick(),
    };
    stored.attachments.push(attached);
    return attached;
  }

  /** The accepted application's facts, or undefined before an acceptance. */
  private acceptedFacts(stored: StoredCase) {
    const review = latestStep(stored, 'application_review');
    const application = latestStep(stored, 'application');
    return review?.value.outcome === 'accepted' && application
      ? applicationFactsOf(application.value)
      : undefined;
  }

  private proposeDuration(stored: StoredCase, body: unknown): Response {
    const facts = this.acceptedFacts(stored);
    if (!facts) return refusal(409, 'CERTIFICATION_APPLICATION_NOT_ACCEPTED');
    return Response.json(computeDuration(facts, durationFactors(body)));
  }

  /** The server's checks, in its order: stage sum, revision, step, rule. */
  private confirmDuration(stored: StoredCase, body: unknown): Response {
    const input = record(body);
    const confirmed = record(input.confirmed);
    const cents = (field: (typeof CONFIRMED_DURATION_FIELDS)[number]) => {
      const value = confirmed[field];
      return typeof value === 'string'
        ? Math.round(Number(value) * 100)
        : Number.NaN;
    };
    if (
      cents('stage1OnSite') + cents('stage2OnSite') !==
      cents('initialOnSite')
    )
      return refusal(400, 'CERTIFICATION_DURATION_STAGES_MISMATCH');
    if (input.expectedRevision !== stored.revision)
      return refusal(409, 'STALE_VERSION');
    if (stored.status !== 'open')
      return refusal(409, 'CERTIFICATION_CASE_CLOSED');
    const facts = this.acceptedFacts(stored);
    if (!facts) return refusal(409, 'CERTIFICATION_APPLICATION_NOT_ACCEPTED');
    const first = !stored.steps.some((step) => step.step === 'duration');
    const reason = typeof input.reason === 'string' ? input.reason : null;
    if (first !== (reason === null))
      return refusal(409, 'CERTIFICATION_CORRECTION_REASON');
    const factors = durationFactors(input.inputs);
    const result = computeDuration(facts, factors);
    if (result.kind === 'refused')
      return Response.json(
        {
          code: 'CERTIFICATION_DURATION_REFUSED',
          message: 'CERTIFICATION_DURATION_REFUSED',
          refusals: result.refusals,
        },
        { status: 400 },
      );
    const factorsUsed = [
      ...Object.values(factors.increases),
      ...Object.values(factors.reductions),
    ].some((percent) => percent > 0);
    const differs =
      result.kind === 'manual' ||
      CONFIRMED_DURATION_FIELDS.some(
        (field) => cents(field) !== roundedCents(result.proposal[field]),
      );
    const justification =
      typeof input.justification === 'string' ? input.justification : null;
    if ((factorsUsed || differs) && justification === null)
      return refusal(400, 'CERTIFICATION_DURATION_JUSTIFICATION_REQUIRED');
    this.append(
      stored,
      'duration',
      {
        ruleVersion: DURATION_RULE_VERSION,
        inputs: {
          ...record(input.inputs),
          subcategories: facts.foodChainSubcategories,
          effectiveFte: facts.effectiveFte,
        },
        computation: result,
        confirmed,
        justification,
      },
      reason,
      me,
    );
    return Response.json(this.detail(stored), { status: 201 });
  }

  private open(body: unknown): Response {
    const input = record(body);
    const reference =
      typeof input.orderReference === 'string'
        ? input.orderReference.trim()
        : '';
    if (
      input.clientLegalEntityId !== certificationIds.entity &&
      input.clientLegalEntityId !== certificationIds.otherEntity
    )
      return new Response(null, { status: 404 });
    if (
      [...this.cases.values()].some(
        (stored) => stored.orderReference === reference,
      )
    )
      return refusal(409, 'CERTIFICATION_ORDER_REFERENCE_TAKEN');
    const stored = this.create(reference, me);
    return Response.json(this.detail(stored), { status: 201 });
  }

  private recordApplication(stored: StoredCase, body: unknown): Response {
    const input = record(body);
    if (input.expectedRevision !== stored.revision)
      return refusal(409, 'STALE_VERSION');
    if (stored.status !== 'open')
      return refusal(409, 'CERTIFICATION_CASE_CLOSED');
    if (stored.steps.some((step) => step.step === 'application_review'))
      return refusal(409, 'CERTIFICATION_APPLICATION_REVIEWED');
    const first = !stored.steps.some((step) => step.step === 'application');
    const reason = typeof input.reason === 'string' ? input.reason : null;
    if (first !== (reason === null))
      return refusal(409, 'CERTIFICATION_CORRECTION_REASON');
    this.append(stored, 'application', record(input.facts), reason, me);
    return Response.json(this.detail(stored), { status: 201 });
  }

  private review(stored: StoredCase, body: unknown): Response {
    const input = record(body);
    if (input.expectedRevision !== stored.revision)
      return refusal(409, 'STALE_VERSION');
    if (stored.status !== 'open')
      return refusal(409, 'CERTIFICATION_CASE_CLOSED');
    if (!stored.steps.some((step) => step.step === 'application'))
      return refusal(409, 'CERTIFICATION_APPLICATION_MISSING');
    if (stored.steps.some((step) => step.step === 'application_review'))
      return refusal(409, 'CERTIFICATION_APPLICATION_ALREADY_REVIEWED');
    const criteria = record(input.criteria);
    const answers = Object.values(criteria).map(
      (entry) => record(entry).answer,
    );
    if (
      input.outcome === 'accepted' &&
      answers.some((value) => value !== 'yes')
    )
      return refusal(400, 'CERTIFICATION_REVIEW_CRITERIA_NOT_MET');
    const rejected = input.outcome === 'rejected';
    this.append(
      stored,
      'application_review',
      {
        criteria,
        outcome: input.outcome,
        rejectionReason: rejected ? input.rejectionReason : null,
      },
      null,
      me,
    );
    if (rejected) stored.status = 'rejected';
    return Response.json(this.detail(stored), { status: 201 });
  }

  private create(orderReference: string, by: Actor): StoredCase {
    const stored: StoredCase = {
      id: `11310000-0000-4000-8000-1000000000${String(++this.sequence).padStart(2, '0')}`,
      orderReference,
      entity: { id: certificationIds.entity, legalName: 'Lactis Demo SRL' },
      status: 'open',
      revision: 1,
      openedAt: this.tick(),
      openedBy: by,
      steps: [],
      attachments: [],
      findings: [],
    };
    this.cases.set(stored.id, stored);
    return stored;
  }

  private append(
    stored: StoredCase,
    step: Step['step'],
    value: Record<string, unknown>,
    reason: string | null,
    by: Actor,
  ) {
    stored.revision += 1;
    stored.steps.push({
      id: `11310000-0000-4000-8000-2000000000${String(++this.sequence).padStart(2, '0')}`,
      step,
      version: stored.steps.filter((entry) => entry.step === step).length + 1,
      caseRevision: stored.revision,
      reason,
      recordedBy: by,
      recordedAt: this.tick(),
      value,
    });
  }

  private summary(stored: StoredCase) {
    const latest = (step: Step['step']) => latestStep(stored, step) ?? null;
    const application = latest('application');
    const review = latest('application_review');
    const duration = latest('duration');
    const agreement = latest('agreement');
    const team = latest('team');
    const decided = latest('team_decision');
    const stagesNext = () =>
      !latest('stage_1_plan')
        ? 'stage_1_plan'
        : latest('stage_1_report')?.value.conclusion !== 'ready'
          ? 'stage_1_report'
          : !latest('stage_2_plan')
            ? 'stage_2_plan'
            : !latest('stage_2_report')
              ? 'stage_2_report'
              : stored.findings.some((finding) =>
                    findingBlocks(this.findingView(stored, finding)),
                  )
                ? 'findings_follow_up'
                : 'recommendation';
    return {
      id: stored.id,
      projectId: this.projectId,
      orderReference: stored.orderReference,
      clientLegalEntity: stored.entity,
      standard: 'iso_22000_2018',
      auditType: 'initial_certification',
      status: stored.status,
      revision: stored.revision,
      nextStep:
        stored.status !== 'open'
          ? null
          : !application
            ? 'application'
            : !review
              ? 'application_review'
              : !duration
                ? 'duration'
                : !agreement
                  ? 'agreement'
                  : !team
                    ? 'team'
                    : decided?.value.teamVersion !== team.version
                      ? 'team_decision'
                      : decided.value.decision === 'returned'
                        ? 'team'
                        : stagesNext(),
      openedBy: stored.openedBy,
      openedAt: stored.openedAt,
    };
  }

  private detail(stored: StoredCase) {
    const latest = (step: Step['step']) => latestStep(stored, step) ?? null;
    return {
      ...this.summary(stored),
      companyId: this.companyId,
      clientAccountId: certificationIds.client,
      application: latest('application'),
      applicationReview: latest('application_review'),
      duration: latest('duration'),
      agreement: latest('agreement'),
      team: latest('team'),
      teamDecision: latest('team_decision'),
      stages: STAGE_STEPS.flatMap((step) => {
        const version = latestStep(stored, step);
        return version ? [version] : [];
      }),
      findings: stored.findings.map((finding) =>
        this.findingView(stored, finding),
      ),
    };
  }

  private tick(): string {
    this.clock += 60_000;
    return new Date(this.clock).toISOString();
  }
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Expected a request record.');
  return Object.fromEntries(Object.entries(value));
}

function list(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new Error('Expected a list.');
  return value;
}

function nonblank(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

const TEAM_ROLE_VALUES = [
  'team_leader',
  'auditor',
  'technical_expert',
  'observer',
];
const DECLARATION_NAMES = [
  'noConsultancy',
  'noEmployment',
  'noManagementInvolvement',
  'confidentiality',
];

function declaresConflict(member: unknown): boolean {
  const declarations = record(record(member).declarations);
  return DECLARATION_NAMES.some((name) => declarations[name] !== true);
}

/** The server's composition refusal code for submitted members, if any. */
function teamComposition(value: unknown): string | null {
  const invalidInput = 'INVALID_CERTIFICATION_INPUT';
  if (!Array.isArray(value) || value.length < 1 || value.length > 10)
    return invalidInput;
  const members = value.map(record);
  for (const member of members) {
    const declarations = record(member.declarations);
    if (
      !TEAM_ROLE_VALUES.includes(String(member.role)) ||
      typeof member.holdsCategory !== 'boolean' ||
      DECLARATION_NAMES.some((name) => typeof declarations[name] !== 'boolean')
    )
      return invalidInput;
    const note = member.conflictNote === undefined ? null : member.conflictNote;
    if (declaresConflict(member) !== (note !== null))
      return 'CERTIFICATION_TEAM_CONFLICT_NOTE';
    if (
      !nonblank(member.name) ||
      !nonblank(member.competenceNote) ||
      (note !== null && !nonblank(note)) ||
      (member.workspaceMembershipId !== null &&
        typeof member.workspaceMembershipId !== 'string')
    )
      return invalidInput;
  }
  const links = members.flatMap((member) =>
    typeof member.workspaceMembershipId === 'string'
      ? [member.workspaceMembershipId]
      : [],
  );
  if (new Set(links).size !== links.length) return invalidInput;
  const leaders = members.filter((member) => member.role === 'team_leader');
  const [leader] = leaders;
  if (leaders.length !== 1 || !leader) return 'CERTIFICATION_TEAM_LEADER';
  const competent = members.some(
    (member) => member.role !== 'observer' && member.holdsCategory === true,
  );
  const expert = members.some(
    (member) =>
      member.role === 'technical_expert' && member.holdsCategory === true,
  );
  if (!competent || (leader.holdsCategory !== true && !expert))
    return 'CERTIFICATION_TEAM_CATEGORY';
  return null;
}

/** Whether the current actor captures the Certification Approver grant. */
function holdsApprover(actor: unknown): boolean {
  const company = record(record(actor).activeCompany);
  const permissions = company.certificationApproverPermissions;
  return (
    Array.isArray(permissions) && permissions.includes('certification.approve')
  );
}

/** Whether the current actor captures the Certification Auditor grant. */
function holdsAuditor(actor: unknown): boolean {
  const company = record(record(actor).activeCompany);
  const permissions = company.certificationAuditorPermissions;
  return (
    Array.isArray(permissions) &&
    permissions.includes('certification.audit.record')
  );
}

function latestStep(stored: StoredCase, step: Step['step']) {
  return stored.steps.filter((entry) => entry.step === step).at(-1);
}

/** The latest team version when the latest decision approves it. */
function approvedTeamOf(stored: StoredCase) {
  const team = latestStep(stored, 'team');
  const decided = latestStep(stored, 'team_decision');
  return team &&
    decided?.value.decision === 'approved' &&
    decided.value.teamVersion === team.version
    ? team
    : undefined;
}

function calendarDate(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/u.test(value) &&
    new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) === value
  );
}

/** Whole hundredths of a day amount the server accepts, else undefined. */
function dayCents(value: unknown, zeroAllowed: boolean): number | undefined {
  if (
    typeof value !== 'string' ||
    !/^(0|[1-9]\d{0,2})(\.\d{1,2})?$/u.test(value)
  )
    return undefined;
  const [whole = '0', fraction = ''] = value.split('.');
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  return cents > 0 || zeroAllowed ? cents : undefined;
}

/** Absent, null or a non-blank text, as an optional reason. */
function optionalText(value: unknown): boolean {
  return value === undefined || value === null || nonblank(value);
}

function nonconformity(classification: unknown): boolean {
  return (
    classification === 'major_nonconformity' ||
    classification === 'minor_nonconformity'
  );
}

/** The server's rule: a Finding that still holds the next step. */
function findingBlocks(view: {
  stage: string;
  classification: string;
  status: string;
}): boolean {
  if (view.classification === 'major_nonconformity' || view.stage === 'stage_1')
    return (
      nonconformity(view.classification) && view.status !== 'verified_effective'
    );
  if (view.classification === 'minor_nonconformity')
    return (
      view.status !== 'plan_adequate' && view.status !== 'verified_effective'
    );
  return false;
}

/** The server's classification refusal code for a statement, if any. */
function classificationRule(
  classification: string,
  stage: string,
  statement: Record<string, unknown>,
): string | null {
  if (
    classification !== 'opportunity_for_improvement' &&
    (statement.clause === null || statement.area === null)
  )
    return 'CERTIFICATION_FINDING_CLAUSE_REQUIRED';
  if (classification === 'area_of_concern' && stage !== 'stage_1')
    return 'CERTIFICATION_FINDING_CLASSIFICATION_STAGE';
  if (
    nonconformity(classification) &&
    list(statement.evidenceAttachmentIds).length === 0
  )
    return 'CERTIFICATION_FINDING_EVIDENCE_REQUIRED';
  return null;
}

/** Text within a limit, as the server accepts it. */
function bounded(value: unknown, limit: number): value is string {
  return nonblank(value) && value.length <= limit;
}

/** At most ten distinct attachment identifiers. */
function evidenceInput(value: unknown): string[] | undefined {
  if (
    !Array.isArray(value) ||
    value.length > 10 ||
    !value.every(nonblank) ||
    new Set(value).size !== value.length
  )
    return undefined;
  return value.map(String);
}

/** The statement fields exactly, the clause and area optional. */
function statementInput(
  fields: Record<string, unknown>,
): (Record<string, unknown> & { evidenceAttachmentIds: string[] }) | undefined {
  const {
    clause = null,
    area = null,
    statement,
    evidenceAttachmentIds,
  } = fields;
  const evidence = evidenceInput(evidenceAttachmentIds);
  if (
    Object.keys(fields).some(
      (key) =>
        !['clause', 'area', 'statement', 'evidenceAttachmentIds'].includes(key),
    ) ||
    !(clause === null || bounded(clause, 40)) ||
    !(area === null || bounded(area, 300)) ||
    !bounded(statement, 4000) ||
    !evidence
  )
    return undefined;
  return { clause, area, statement, evidenceAttachmentIds: evidence };
}

function responseInput(
  fields: Record<string, unknown>,
): (Record<string, unknown> & { evidenceAttachmentIds: string[] }) | undefined {
  const {
    correction,
    cause,
    correctiveAction,
    receivedOn,
    plannedCompletionOn = null,
    evidenceAttachmentIds = [],
    ...rest
  } = fields;
  const evidence = evidenceInput(evidenceAttachmentIds);
  if (
    Object.keys(rest).length > 0 ||
    !bounded(correction, 4000) ||
    !bounded(cause, 4000) ||
    !bounded(correctiveAction, 4000) ||
    !calendarDate(receivedOn) ||
    !(plannedCompletionOn === null || calendarDate(plannedCompletionOn)) ||
    !evidence
  )
    return undefined;
  return {
    correction,
    cause,
    correctiveAction,
    receivedOn,
    plannedCompletionOn,
    evidenceAttachmentIds: evidence,
  };
}

function verificationInput(
  fields: Record<string, unknown>,
): (Record<string, unknown> & { evidenceAttachmentIds: string[] }) | undefined {
  const {
    verifiedOn,
    method,
    outcome,
    note,
    evidenceAttachmentIds = [],
    ...rest
  } = fields;
  const evidence = evidenceInput(evidenceAttachmentIds);
  if (
    Object.keys(rest).length > 0 ||
    !calendarDate(verifiedOn) ||
    (method !== 'document_review' && method !== 'on_site') ||
    (outcome !== 'effective' && outcome !== 'not_effective') ||
    !bounded(note, 2000) ||
    !evidence
  )
    return undefined;
  return {
    verifiedOn,
    method,
    outcome,
    note,
    evidenceAttachmentIds: evidence,
  };
}

/** Calendar arithmetic on ISO dates in UTC, as the server counts. */
function addDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function addMonths(isoDate: string, months: number): string {
  const date = new Date(`${isoDate}T00:00:00.000Z`);
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + months);
  const last = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0),
  ).getUTCDate();
  date.setUTCDate(Math.min(day, last));
  return date.toISOString().slice(0, 10);
}

/** The same recorded value, whatever the order of its keys. */
function sameValue(
  left: Record<string, unknown>,
  right: Record<string, unknown>,
): boolean {
  const keys = [...new Set([...Object.keys(left), ...Object.keys(right)])];
  return keys.every(
    (key) => JSON.stringify(left[key]) === JSON.stringify(right[key]),
  );
}

type DurationFacts = {
  foodChainSubcategories: string[];
  haccpStudyCount: number;
  effectiveFte: number;
};
type DurationFactors = {
  primary: string;
  haccpStudies: Record<string, number>;
  increases: Record<string, number>;
  reductions: Record<string, number>;
};
type FakeDurationResult =
  | { kind: 'proposal'; proposal: DurationProposal }
  | { kind: 'manual'; reason: 'FTE_BAND_AMBIGUOUS' }
  | { kind: 'refused'; refusals: DurationRefusal[] };

function applicationFactsOf(value: Record<string, unknown>): DurationFacts {
  const { foodChainSubcategories, haccpStudyCount, effectiveFte } = value;
  if (
    !Array.isArray(foodChainSubcategories) ||
    typeof haccpStudyCount !== 'number' ||
    typeof effectiveFte !== 'number'
  )
    throw new Error('Expected recorded application facts.');
  return {
    foodChainSubcategories: foodChainSubcategories.map(String),
    haccpStudyCount,
    effectiveFte,
  };
}

function durationFactors(value: unknown): DurationFactors {
  const body = record(value);
  const numbers = (entry: unknown) =>
    Object.fromEntries(
      Object.entries(record(entry)).map(([key, number]) => [
        key,
        typeof number === 'number' ? number : Number.NaN,
      ]),
    );
  return {
    primary: String(body.primary),
    haccpStudies: numbers(body.haccpStudies),
    increases: numbers(body.increases),
    reductions: numbers(body.reductions),
  };
}

// The server's basic method in units of 1e-8 day, for fictional vectors only.
const UNIT = 100_000_000;
const QUARTER = UNIT / 4;
/** Basic time TD and per-additional-study time TH, in quarter days. */
const SUBCATEGORY_TIMES: Record<string, { td: number; th: number }> = {
  AI: { td: 4, th: 1 },
  AII: { td: 4, th: 1 },
  BI: { td: 4, th: 1 },
  BII: { td: 4, th: 1 },
  BIII: { td: 4, th: 1 },
  C0: { td: 8, th: 2 },
  CI: { td: 8, th: 2 },
  CII: { td: 8, th: 2 },
  CIII: { td: 8, th: 2 },
  CIV: { td: 8, th: 2 },
  D: { td: 4, th: 2 },
  E: { td: 6, th: 2 },
  FI: { td: 4, th: 2 },
  FII: { td: 4, th: 2 },
  G: { td: 6, th: 1 },
  H: { td: 6, th: 1 },
  I: { td: 6, th: 2 },
  J: { td: 6, th: 2 },
  K: { td: 8, th: 2 },
};
const FTE_BANDS = [
  { upTo: 5, tfte: 0 },
  { upTo: 49, tfte: 2 },
  { upTo: 99, tfte: 4 },
  { upTo: 199, tfte: 6 },
  { upTo: 499, tfte: 8 },
  { upTo: 999, tfte: 10 },
];

function computeDuration(
  facts: DurationFacts,
  factors: DurationFactors,
): FakeDurationResult {
  const sum = (values: number[]) =>
    values.reduce((total, value) => total + value, 0);
  const times = (code: string) =>
    SUBCATEGORY_TIMES[code] ?? { td: Number.NaN, th: Number.NaN };
  const subcategories = facts.foodChainSubcategories;
  if (sum(Object.values(factors.haccpStudies)) !== facts.haccpStudyCount)
    return { kind: 'refused', refusals: ['HACCP_STUDIES_MISMATCH'] };
  const refusals: DurationRefusal[] = [];
  const primary = times(factors.primary);
  if (!subcategories.includes(factors.primary))
    refusals.push('PRIMARY_NOT_SELECTED');
  else if (subcategories.some((code) => times(code).td > primary.td))
    refusals.push('PRIMARY_NOT_HIGHEST_BASIC_TIME');
  if (
    Object.keys(factors.haccpStudies).some(
      (code) => !subcategories.includes(code),
    ) ||
    (factors.haccpStudies[factors.primary] ?? 0) < 1
  )
    refusals.push('HACCP_STUDIES_MISMATCH');
  const reductions = Object.values(factors.reductions);
  if (reductions.some((percent) => percent > 10))
    refusals.push('REDUCTION_FACTOR_CAP');
  if (sum(reductions) > 20) refusals.push('REDUCTION_TOTAL_CAP');
  if (refusals.length) return { kind: 'refused', refusals };
  const wholeFte = Math.ceil(facts.effectiveFte);
  const band = FTE_BANDS.find((entry) => wholeFte <= entry.upTo);
  if (wholeFte >= 1000 || !band)
    return { kind: 'manual', reason: 'FTE_BAND_AMBIGUOUS' };
  const th = sum(
    subcategories.map((code) => {
      const studies = factors.haccpStudies[code] ?? 0;
      return (
        times(code).th * (code === factors.primary ? studies - 1 : studies)
      );
    }),
  );
  const base = primary.td + th + band.tfte;
  const net = sum(Object.values(factors.increases)) - sum(reductions);
  const initial = (base * (100 + net) * QUARTER) / 100;
  const surveillance = (initial * 333) / 1000;
  const recertification = (initial * 666) / 1000;
  const stage1 = Math.ceil(initial / 3 / QUARTER) * QUARTER;
  const stage2 = initial - stage1;
  const warnings: DurationWarning[] = [];
  if (surveillance < UNIT) warnings.push('SURVEILLANCE_BELOW_ONE_DAY');
  if (recertification < UNIT) warnings.push('RECERTIFICATION_BELOW_ONE_DAY');
  if (stage2 < UNIT) warnings.push('STAGE2_BELOW_ONE_DAY');
  return {
    kind: 'proposal',
    proposal: {
      ruleVersion: DURATION_RULE_VERSION,
      basicTime: days(primary.td * QUARTER),
      haccpTime: days(th * QUARTER),
      fteTime: days(band.tfte * QUARTER),
      baseDays: days(base * QUARTER),
      netAdjustmentPercent: net,
      initialOnSite: days(initial),
      initialTotal: days((initial * 6) / 5),
      stage1OnSite: days(stage1),
      stage2OnSite: days(stage2),
      surveillanceOnSite: days(surveillance),
      surveillanceTotal: days((surveillance * 6) / 5),
      recertificationOnSite: days(recertification),
      recertificationTotal: days((recertification * 6) / 5),
      warnings,
    },
  };
}

function days(units: number): string {
  if (!Number.isSafeInteger(units) || units < 0)
    throw new Error(`Inexact fictional duration ${String(units)}`);
  const fraction = String(units % UNIT)
    .padStart(8, '0')
    .replace(/0+$/u, '');
  const whole = String(Math.floor(units / UNIT));
  return fraction ? `${whole}.${fraction}` : whole;
}

/** A proposal amount rounded half up, in whole hundredths of a day. */
function roundedCents(amount: string): number {
  const [whole = '0', fraction = ''] = amount.split('.');
  const units = Number(whole) * UNIT + Number(fraction.padEnd(8, '0'));
  return Math.floor((units + UNIT / 200) / (UNIT / 100));
}

function centsText(cents: number): string {
  const fraction = String(cents % 100)
    .padStart(2, '0')
    .replace(/0+$/u, '');
  const whole = String(Math.floor(cents / 100));
  return fraction ? `${whole}.${fraction}` : whole;
}

function refusal(status: number, code: string): Response {
  return Response.json({ code, message: code }, { status });
}

function primes(count: number): number[] {
  const found: number[] = [];
  for (let candidate = 2; found.length < count; candidate += 1)
    if (found.every((prime) => candidate % prime !== 0)) found.push(candidate);
  return found;
}
const fractionBits = (value: number) =>
  ((value - Math.floor(value)) * 0x100000000) >>> 0;
const SHA256_ROUND = primes(64).map((prime) => fractionBits(Math.cbrt(prime)));
const SHA256_INITIAL = primes(8).map((prime) => fractionBits(Math.sqrt(prime)));
const rotate = (value: number, bits: number) =>
  (value >>> bits) | (value << (32 - bits));

/**
 * SHA-256 of fixture bytes, synchronous and without Node.js modules: this
 * fixture is also present in the web image, which has none.
 */
function sha256Hex(bytes: Uint8Array): string {
  const padded = new Uint8Array(Math.ceil((bytes.length + 9) / 64) * 64);
  padded.set(bytes);
  padded[bytes.length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(padded.length - 8, Math.floor(bytes.length / 0x20000000));
  view.setUint32(padded.length - 4, (bytes.length * 8) >>> 0);
  const hash = [...SHA256_INITIAL];
  const words = new Uint32Array(64);
  for (let offset = 0; offset < padded.length; offset += 64) {
    for (let i = 0; i < 16; i += 1) words[i] = view.getUint32(offset + i * 4);
    for (let i = 16; i < 64; i += 1) {
      const low = words[i - 15];
      const high = words[i - 2];
      const s0 = rotate(low, 7) ^ rotate(low, 18) ^ (low >>> 3);
      const s1 = rotate(high, 17) ^ rotate(high, 19) ^ (high >>> 10);
      words[i] = (words[i - 16] + s0 + words[i - 7] + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, h] = hash;
    for (let i = 0; i < 64; i += 1) {
      const t1 =
        (h +
          (rotate(e, 6) ^ rotate(e, 11) ^ rotate(e, 25)) +
          ((e & f) ^ (~e & g)) +
          SHA256_ROUND[i] +
          words[i]) >>>
        0;
      const t2 =
        ((rotate(a, 2) ^ rotate(a, 13) ^ rotate(a, 22)) +
          ((a & b) ^ (a & c) ^ (b & c))) >>>
        0;
      h = g;
      g = f;
      f = e;
      e = (d + t1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) >>> 0;
    }
    [a, b, c, d, e, f, g, h].forEach((value, i) => {
      hash[i] = (hash[i] + value) >>> 0;
    });
  }
  return hash.map((value) => value.toString(16).padStart(8, '0')).join('');
}
