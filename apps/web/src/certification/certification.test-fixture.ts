import { vi } from 'vitest';
import type { BrowserIdentity } from '../access-composition';
import type { ActorContext } from '../access-types';

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

export function certificationActor({
  manager,
}: {
  manager: boolean;
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
  step: 'application' | 'application_review';
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

  mutations() {
    return this.requests.filter((request) => request.method === 'POST');
  }

  /** Seeds a Case, optionally with an application recorded by a colleague. */
  seed({
    orderReference = 'CERT-SEED',
    application = false,
  }: { orderReference?: string; application?: boolean } = {}): string {
    const stored = this.create(orderReference, colleague);
    if (application)
      this.append(stored, 'application', lactisFacts(), null, colleague);
    return stored.id;
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
    const match =
      /^\/api\/certification-cases\/([^/]+)(\/timeline|\/application|\/application-review)?$/u.exec(
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
      default:
        return new Response(null, { status: 404 });
    }
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
    const latest = (step: Step['step']) =>
      stored.steps.filter((entry) => entry.step === step).at(-1) ?? null;
    const application = latest('application');
    const review = latest('application_review');
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
              : 'duration',
      openedBy: stored.openedBy,
      openedAt: stored.openedAt,
    };
  }

  private detail(stored: StoredCase) {
    const latest = (step: Step['step']) =>
      stored.steps.filter((entry) => entry.step === step).at(-1) ?? null;
    return {
      ...this.summary(stored),
      companyId: this.companyId,
      clientAccountId: certificationIds.client,
      application: latest('application'),
      applicationReview: latest('application_review'),
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

function refusal(status: number, code: string): Response {
  return Response.json({ code, message: code }, { status });
}
