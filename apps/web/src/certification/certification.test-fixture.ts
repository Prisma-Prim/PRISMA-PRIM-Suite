import { createHash } from 'node:crypto';
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
};

/**
 * A Certification Reader, optionally Programme Manager, optionally with the
 * Document rights to read this Client's received audit source content.
 */
export function certificationActor({
  manager,
  documents = false,
}: {
  manager: boolean;
  documents?: boolean;
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

type Actor = { workspaceMembershipId: string; displayName: string };
type Step = {
  id: string;
  step: 'application' | 'application_review' | 'duration' | 'agreement';
  version: number;
  caseRevision: number;
  reason: string | null;
  recordedBy: Actor;
  recordedAt: string;
  value: Record<string, unknown>;
};
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
      sha256: createHash('sha256').update(bytes).digest('hex'),
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
   * overriding the fictional dairy's), its accepted review and a duration
   * confirmed as proposed.
   */
  seed({
    orderReference = 'CERT-SEED',
    application = false,
    facts = {},
    accepted = false,
    duration = false,
  }: {
    orderReference?: string;
    application?: boolean;
    facts?: Record<string, unknown>;
    accepted?: boolean;
    duration?: boolean;
  } = {}): string {
    const stored = this.create(orderReference, colleague);
    if (application || accepted || duration)
      this.append(stored, 'application', lactisFacts(facts), null, colleague);
    if (accepted || duration)
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
    if (duration) this.confirmDurationAsColleague(stored.id);
    return stored.id;
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
    const match =
      /^\/api\/certification-cases\/([^/]+)(\/timeline|\/application|\/application-review|\/duration-proposal|\/duration|\/documents|\/eligible-documents|\/agreement)?$/u.exec(
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
                  : 'team',
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

function latestStep(stored: StoredCase, step: Step['step']) {
  return stored.steps.filter((entry) => entry.step === step).at(-1);
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
