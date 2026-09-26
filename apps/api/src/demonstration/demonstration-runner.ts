import {
  COMPANY_COMMERCIAL_ACTIVITY_READER_BUNDLE_LABEL,
  COMPANY_COMMERCIAL_INTAKE_BUNDLE_LABEL,
  COMPANY_CONTEXT_ACCESS_BUNDLE_LABEL,
  COMPANY_DIRECTOR_CLIENT_ACCESS_BUNDLE_LABEL,
  COMPANY_DOCUMENT_PROJECT_ORGANIZER_BUNDLE_LABEL,
  COMPANY_DOCUMENT_REGISTRAR_BUNDLE_LABEL,
  COMPANY_PRICING_CONFIGURATION_BUNDLE_LABEL,
  COMPANY_PROJECT_ACCESS_BUNDLE_LABEL,
  COMPANY_SERVICE_CATALOGUE_BUNDLE_LABEL,
  COMPANY_TASK_MANAGER_BUNDLE_LABEL,
} from '../access/company-permissions.js';
import {
  DEMONSTRATION_SCENARIO,
  demonstrationIdempotencyKey,
  type DemonstrationBundle,
  type DemonstrationCompanyKey,
  type DemonstrationPersona,
  type DemonstrationPersonaKey,
  type DemonstrationRegisterId,
  type DemonstrationScenario,
  type DemonstrationStep,
} from './demonstration-scenario.js';

/**
 * A client of the public REST API that drives one scenario. It presents only
 * two kinds of principal, sends every write as the owning module's public
 * command with a stable per-step idempotency key, and validates only the ids,
 * versions and provisional markers it needs. It never touches storage.
 */

export type DemonstrationPrincipal =
  | { readonly kind: 'owner' }
  | { readonly kind: 'persona'; readonly persona: DemonstrationPersona };

/**
 * - `created`: this run's command made the change.
 * - `replayed`: the command was accepted and changed nothing (an idempotent
 *   replay, or an equivalent record already in place).
 * - `present`: the step found its target in place and sent no command.
 */
export type DemonstrationStepOutcome = 'created' | 'replayed' | 'present';

export type DemonstrationStopReason =
  | 'denied'
  | 'not-found'
  | 'conflict'
  | 'rejected'
  | 'unavailable'
  | 'unexpected-response'
  | 'grant-revoked';

export interface DemonstrationWorkspaceLine {
  readonly scenario: string;
  readonly workspace: { readonly id: string; readonly name: string };
}

export interface DemonstrationManifestEntry {
  readonly scenario: string;
  readonly step: string;
  readonly outcome: DemonstrationStepOutcome;
  readonly recordId: string;
  readonly register?: DemonstrationRegisterId;
}

export interface DemonstrationStop {
  readonly scenario: string;
  readonly result: 'stopped';
  /** The failing step key, or `workspace.owner` for the owner's bootstrap. */
  readonly step: string;
  readonly reason: DemonstrationStopReason;
  readonly status: number | null;
}

export interface DemonstrationSummary {
  readonly scenario: string;
  readonly result: 'converged';
  readonly companies: readonly {
    readonly key: DemonstrationCompanyKey;
    readonly displayName: string;
    readonly id: string;
  }[];
  readonly personas: readonly {
    readonly key: DemonstrationPersonaKey;
    readonly displayName: string;
    readonly company: string;
    readonly profile: DemonstrationPersona['profile'];
    readonly bundles: readonly string[];
  }[];
}

export type DemonstrationManifestLine =
  | DemonstrationWorkspaceLine
  | DemonstrationManifestEntry
  | DemonstrationStop
  | DemonstrationSummary;

export type DemonstrationRunResult =
  | {
      readonly kind: 'converged';
      readonly workspace: DemonstrationWorkspaceLine['workspace'];
      readonly entries: readonly DemonstrationManifestEntry[];
      readonly summary: DemonstrationSummary;
    }
  | {
      readonly kind: 'stopped';
      readonly entries: readonly DemonstrationManifestEntry[];
      readonly stop: DemonstrationStop;
    };

export interface DemonstrationRunOptions {
  /** The API origin without the `/api` prefix, e.g. `http://127.0.0.1:4174`. */
  readonly origin: string;
  readonly headersFor: (
    principal: DemonstrationPrincipal,
  ) => Readonly<Record<string, string>>;
  readonly scenario?: DemonstrationScenario;
  /** Match the seed application's fixed run clock; pricing starts just after it. */
  readonly now: () => Date;
  readonly onLine?: (line: DemonstrationManifestLine) => void;
}

export const DEMONSTRATION_OWNER_STEP = 'workspace.owner';

const MAXIMUM_PAGES = 1_000;

const BUNDLE_ROUTES = {
  context: '/company-context-assignments',
  'director-client': '/company-director-client-assignments',
  project: '/company-project-assignments',
  'task-manager': '/company-task-manager-assignments',
  'document-registrar': '/company-document-registrar-assignments',
  'document-project-organizer':
    '/company-document-project-organizer-assignments',
  'commercial-intake': '/company-commercial-intake-assignments',
  'commercial-activity-reader':
    '/company-commercial-activity-reader-assignments',
  'service-catalogue': '/company-service-catalogue-assignments',
  'pricing-configuration': '/company-pricing-configuration-assignments',
} as const satisfies Record<DemonstrationBundle, string>;

export const DEMONSTRATION_BUNDLE_LABELS = {
  context: COMPANY_CONTEXT_ACCESS_BUNDLE_LABEL,
  'director-client': COMPANY_DIRECTOR_CLIENT_ACCESS_BUNDLE_LABEL,
  project: COMPANY_PROJECT_ACCESS_BUNDLE_LABEL,
  'task-manager': COMPANY_TASK_MANAGER_BUNDLE_LABEL,
  'document-registrar': COMPANY_DOCUMENT_REGISTRAR_BUNDLE_LABEL,
  'document-project-organizer': COMPANY_DOCUMENT_PROJECT_ORGANIZER_BUNDLE_LABEL,
  'commercial-intake': COMPANY_COMMERCIAL_INTAKE_BUNDLE_LABEL,
  'commercial-activity-reader': COMPANY_COMMERCIAL_ACTIVITY_READER_BUNDLE_LABEL,
  'service-catalogue': COMPANY_SERVICE_CATALOGUE_BUNDLE_LABEL,
  'pricing-configuration': COMPANY_PRICING_CONFIGURATION_BUNDLE_LABEL,
} as const satisfies Record<DemonstrationBundle, string>;

const OWNER: DemonstrationPrincipal = { kind: 'owner' };

class DemonstrationStepStop extends Error {
  constructor(
    readonly reason: DemonstrationStopReason,
    readonly status: number | null,
  ) {
    super(reason);
  }
}

interface StepResult {
  readonly outcome: DemonstrationStepOutcome;
  readonly recordId: string;
}

type ApiRecord = Readonly<Record<string, unknown>>;

interface ApiRequest {
  readonly principal: DemonstrationPrincipal;
  readonly method: 'GET' | 'POST' | 'PUT';
  readonly path: string;
  readonly companyId?: string;
  readonly body?: unknown;
  readonly idempotencyKey?: string;
}

class DemonstrationApi {
  constructor(
    private readonly origin: string,
    private readonly headersFor: DemonstrationRunOptions['headersFor'],
  ) {}

  async send(request: ApiRequest): Promise<unknown> {
    const headers: Record<string, string> = {
      ...this.headersFor(request.principal),
      accept: 'application/json',
    };
    if (request.companyId) headers['x-company-context-id'] = request.companyId;
    if (request.idempotencyKey)
      headers['idempotency-key'] = request.idempotencyKey;
    if (request.body !== undefined)
      headers['content-type'] = 'application/json';
    let response: Response;
    try {
      response = await fetch(`${this.origin}/api${request.path}`, {
        method: request.method,
        headers,
        body:
          request.body === undefined ? undefined : JSON.stringify(request.body),
      });
    } catch {
      throw new DemonstrationStepStop('unavailable', null);
    }
    const payload = await response.text();
    if (!response.ok)
      throw new DemonstrationStepStop(
        stopReasonFor(response.status),
        response.status,
      );
    if (!payload) return null;
    try {
      const parsed: unknown = JSON.parse(payload);
      return parsed;
    } catch {
      throw new DemonstrationStepStop('unexpected-response', response.status);
    }
  }

  async read(
    principal: DemonstrationPrincipal,
    path: string,
    companyId?: string,
  ): Promise<unknown> {
    return this.send({ principal, method: 'GET', path, companyId });
  }

  /** Collects every id of a cursor-paginated `{ items, nextCursor }` list. */
  async pagedIds(
    principal: DemonstrationPrincipal,
    path: string,
    companyId: string,
    select: (item: ApiRecord) => string = (item) => text(item, 'id'),
  ): Promise<Set<string>> {
    const ids = new Set<string>();
    let cursor: string | undefined;
    for (let page = 0; page < MAXIMUM_PAGES; page += 1) {
      const query = new URLSearchParams({ limit: '50' });
      if (cursor) query.set('cursor', cursor);
      const body = record(
        await this.read(principal, `${path}?${query.toString()}`, companyId),
      );
      for (const item of list(body.items)) ids.add(select(record(item)));
      const next = body.nextCursor;
      if (next === undefined) return ids;
      if (typeof next !== 'string' || !next) throw unexpected();
      cursor = next;
    }
    throw unexpected();
  }
}

function stopReasonFor(status: number): DemonstrationStopReason {
  if (status === 401 || status === 403) return 'denied';
  if (status === 404) return 'not-found';
  if (status === 409) return 'conflict';
  if (status === 400 || status === 422) return 'rejected';
  if (status >= 500) return 'unavailable';
  return 'unexpected-response';
}

function unexpected(): DemonstrationStepStop {
  return new DemonstrationStepStop('unexpected-response', null);
}

function record(value: unknown): ApiRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw unexpected();
  return Object.fromEntries(Object.entries(value));
}

function list(value: unknown): readonly unknown[] {
  if (!Array.isArray(value)) throw unexpected();
  const items: unknown[] = value;
  return items;
}

function text(value: ApiRecord, field: string): string {
  const result = value[field];
  if (typeof result !== 'string' || !result) throw unexpected();
  return result;
}

function integer(value: ApiRecord, field: string): number {
  const result = value[field];
  if (typeof result !== 'number' || !Number.isSafeInteger(result))
    throw unexpected();
  return result;
}

/** Every catalogue and rule response the seed reads must stay provisional. */
function requireProvisional(value: ApiRecord): ApiRecord {
  if (value.provisional !== true) throw unexpected();
  return value;
}

function idsOf(value: unknown): Set<string> {
  return new Set(list(value).map((item) => text(record(item), 'id')));
}

interface Administration {
  readonly memberships: ReadonlySet<string>;
  readonly assignments: readonly {
    readonly id: string;
    readonly workspaceMembershipId: string;
    readonly companyId: string;
    readonly bundle: string;
  }[];
}

class DemonstrationRun {
  private readonly companies = new Map<DemonstrationCompanyKey, string>();
  private readonly memberships = new Map<DemonstrationPersonaKey, string>();
  private readonly records = new Map<string, string>();
  private readonly opportunities = new Map<string, string>();
  private workspaceId: string | undefined;

  constructor(
    private readonly api: DemonstrationApi,
    private readonly scenario: DemonstrationScenario,
    private readonly now: () => Date,
  ) {}

  async resolveOwner(): Promise<DemonstrationWorkspaceLine['workspace']> {
    // The owner's first request is the Access bootstrap of the configured
    // Workspace (ADR 0006); it precedes every scenario step.
    const actor = record(await this.api.read(OWNER, '/access/current-actor'));
    this.workspaceId = text(actor, 'workspaceId');
    return { id: this.workspaceId, name: text(actor, 'workspaceName') };
  }

  async execute(step: DemonstrationStep): Promise<StepResult> {
    switch (step.kind) {
      case 'company.register':
        return this.registerCompany(step);
      case 'persona.provision':
        return this.provisionPersona(step);
      case 'grant':
        return this.grant(step);
      case 'client.register':
        return this.registerClient(step);
      case 'client.relate':
        return this.relateClient(step);
      case 'project.create':
        return this.createProject(step);
      case 'project.responsible':
        return this.nameResponsible(step);
      case 'task.create':
        return this.createTask(step);
      case 'task.transition':
        return this.transitionTask(step);
      case 'document.register':
        return this.registerDocument(step);
      case 'document.link':
        return this.linkDocument(step);
      case 'request.create':
        return this.createRequest(step);
      case 'opportunity.next-action':
        return this.updateNextAction(step);
      case 'catalogue.definition':
        return this.createDefinition(step);
      case 'catalogue.offering':
        return this.createOffering(step);
      case 'pricing.rule':
        return this.publishRule(step);
      default:
        return assertNever(step);
    }
  }

  summary(): DemonstrationSummary {
    const companyDisplayNames = new Map<DemonstrationCompanyKey, string>();
    for (const step of this.scenario.steps)
      if (step.kind === 'company.register')
        companyDisplayNames.set(step.company, step.displayName);
    return {
      scenario: this.scenario.version,
      result: 'converged',
      companies: [...companyDisplayNames].map(([key, displayName]) => ({
        key,
        displayName,
        id: this.company(key),
      })),
      personas: this.scenario.personas.map((persona) => ({
        key: persona.key,
        displayName: persona.displayName,
        company: companyDisplayNames.get(persona.company) ?? persona.company,
        profile: persona.profile,
        bundles: this.scenario.steps.flatMap((step) =>
          step.kind === 'grant' && step.persona === persona.key
            ? [DEMONSTRATION_BUNDLE_LABELS[step.bundle]]
            : [],
        ),
      })),
    };
  }

  private async registerCompany(
    step: Extract<DemonstrationStep, { kind: 'company.register' }>,
  ): Promise<StepResult> {
    const before = idsOf(await this.api.read(OWNER, '/companies'));
    const company = record(
      await this.api.send({
        principal: OWNER,
        method: 'POST',
        path: '/companies',
        body: { displayName: step.displayName },
        idempotencyKey: demonstrationIdempotencyKey(step),
      }),
    );
    if (text(company, 'displayName') !== step.displayName) throw unexpected();
    const id = text(company, 'id');
    this.companies.set(step.company, id);
    return created(!before.has(id), id);
  }

  private async provisionPersona(
    step: Extract<DemonstrationStep, { kind: 'persona.provision' }>,
  ): Promise<StepResult> {
    const before = await this.administration();
    const actor = record(
      await this.api.read(
        this.principal(step.persona),
        '/access/current-actor',
      ),
    );
    if (text(actor, 'workspaceId') !== this.workspace()) throw unexpected();
    const membershipId = text(actor, 'workspaceMembershipId');
    this.memberships.set(step.persona, membershipId);
    return before.memberships.has(membershipId)
      ? { outcome: 'present', recordId: membershipId }
      : { outcome: 'created', recordId: membershipId };
  }

  private async grant(
    step: Extract<DemonstrationStep, { kind: 'grant' }>,
  ): Promise<StepResult> {
    const workspaceMembershipId = this.membership(step.persona);
    const companyId = this.company(step.company);
    const label = DEMONSTRATION_BUNDLE_LABELS[step.bundle];
    const activeAssignment = (administration: Administration) =>
      administration.assignments.find(
        (assignment) =>
          assignment.workspaceMembershipId === workspaceMembershipId &&
          assignment.companyId === companyId &&
          assignment.bundle === label,
      );
    const before = activeAssignment(await this.administration());
    if (before) return { outcome: 'present', recordId: before.id };
    const assignment = record(
      await this.api.send({
        principal: OWNER,
        method: 'POST',
        path: BUNDLE_ROUTES[step.bundle],
        body: { workspaceMembershipId, companyId },
        idempotencyKey: demonstrationIdempotencyKey(step),
      }),
    );
    if (text(assignment, 'bundle') !== label) throw unexpected();
    const assignmentId = text(assignment, 'id');
    const after = activeAssignment(await this.administration());
    // A replay returns the recorded grant even after its revocation. The seed
    // never grants again: it stops and names this step.
    if (!after) throw new DemonstrationStepStop('grant-revoked', null);
    return created(after.id === assignmentId, assignmentId);
  }

  private async registerClient(
    step: Extract<DemonstrationStep, { kind: 'client.register' }>,
  ): Promise<StepResult> {
    const principal = this.principal(step.actor);
    const companyId = this.personaCompany(step.actor);
    const before = idsOf(await this.api.read(principal, '/clients', companyId));
    const client = record(
      await this.api.send({
        principal,
        method: 'POST',
        path: '/clients',
        companyId,
        body: step.fields,
        idempotencyKey: demonstrationIdempotencyKey(step),
      }),
    );
    const id = text(client, 'id');
    this.records.set(`client:${step.client}`, id);
    return created(!before.has(id), id);
  }

  private async relateClient(
    step: Extract<DemonstrationStep, { kind: 'client.relate' }>,
  ): Promise<StepResult> {
    // The delivered relationship command requires Workspace Client
    // management, which only the configured owner holds.
    const companyId = this.company(step.company);
    const clientId = this.record('client', step.client);
    const related = idsOf(await this.api.read(OWNER, '/clients', companyId));
    if (related.has(clientId))
      return { outcome: 'present', recordId: clientId };
    const client = record(
      await this.api.send({
        principal: OWNER,
        method: 'PUT',
        path: `/clients/${clientId}/active-company-relationship`,
        companyId,
      }),
    );
    if (text(client, 'id') !== clientId) throw unexpected();
    return { outcome: 'created', recordId: clientId };
  }

  private async createProject(
    step: Extract<DemonstrationStep, { kind: 'project.create' }>,
  ): Promise<StepResult> {
    const principal = this.principal(step.actor);
    const companyId = this.personaCompany(step.actor);
    const before = idsOf(
      await this.api.read(principal, '/projects', companyId),
    );
    const project = record(
      await this.api.send({
        principal,
        method: 'POST',
        path: '/projects',
        companyId,
        body: {
          title: step.title,
          clientAccountId: this.record('client', step.client),
        },
        idempotencyKey: demonstrationIdempotencyKey(step),
      }),
    );
    const id = text(project, 'id');
    this.records.set(`project:${step.project}`, id);
    return created(!before.has(id), id);
  }

  private async nameResponsible(
    step: Extract<DemonstrationStep, { kind: 'project.responsible' }>,
  ): Promise<StepResult> {
    const principal = this.principal(step.actor);
    const companyId = this.personaCompany(step.actor);
    const projectId = this.record('project', step.project);
    const workspaceMembershipId = this.membership(step.responsible);
    const path = `/projects/${projectId}/responsible`;
    const before = record(await this.api.read(principal, path, companyId));
    const current = before.responsible;
    if (
      current !== null &&
      text(record(current), 'workspaceMembershipId') === workspaceMembershipId
    )
      return { outcome: 'present', recordId: projectId };
    const receipt = record(
      await this.api.send({
        principal,
        method: 'PUT',
        path,
        companyId,
        body: {
          expectedRevision: step.expectedRevision,
          workspaceMembershipId,
        },
        idempotencyKey: demonstrationIdempotencyKey(step),
      }),
    );
    if (text(receipt, 'projectId') !== projectId) throw unexpected();
    return created(
      integer(receipt, 'revision') > integer(before, 'revision'),
      projectId,
    );
  }

  private async createTask(
    step: Extract<DemonstrationStep, { kind: 'task.create' }>,
  ): Promise<StepResult> {
    const principal = this.principal(step.actor);
    const companyId = this.personaCompany(step.actor);
    const projectId = this.record('project', step.project);
    const path = `/projects/${projectId}/tasks`;
    const before = idsOf(
      record(await this.api.read(principal, path, companyId)).tasks,
    );
    const task = record(
      await this.api.send({
        principal,
        method: 'POST',
        path,
        companyId,
        body: {
          title: step.title,
          assigneeMembershipId:
            step.assignee === null ? null : this.membership(step.assignee),
          dueDate: step.dueDate,
          priority: step.priority,
        },
        idempotencyKey: demonstrationIdempotencyKey(step),
      }),
    );
    const id = text(task, 'id');
    this.records.set(`task:${step.task}`, id);
    return created(!before.has(id), id);
  }

  private async transitionTask(
    step: Extract<DemonstrationStep, { kind: 'task.transition' }>,
  ): Promise<StepResult> {
    const principal = this.principal(step.actor);
    const companyId = this.personaCompany(step.actor);
    const taskId = this.record('task', step.task);
    const before = record(
      record(await this.api.read(principal, `/tasks/${taskId}`, companyId))
        .task,
    );
    const { status, path, body } = transitionCommand(taskId, step.transition);
    if (text(before, 'status') === status)
      return { outcome: 'present', recordId: taskId };
    const task = record(
      await this.api.send({
        principal,
        method: 'POST',
        path,
        companyId,
        body,
        idempotencyKey: demonstrationIdempotencyKey(step),
      }),
    );
    if (text(task, 'id') !== taskId) throw unexpected();
    return created(
      integer(task, 'version') > integer(before, 'version'),
      taskId,
    );
  }

  private async registerDocument(
    step: Extract<DemonstrationStep, { kind: 'document.register' }>,
  ): Promise<StepResult> {
    const principal = this.principal(step.actor);
    const companyId = this.personaCompany(step.actor);
    const before = idsOf(
      await this.api.read(principal, '/documents', companyId),
    );
    const document = record(
      await this.api.send({
        principal,
        method: 'POST',
        path: '/documents',
        companyId,
        body: {
          clientId: this.record('client', step.client),
          title: step.title,
          purpose: step.purpose,
          url: step.url,
        },
        idempotencyKey: demonstrationIdempotencyKey(step),
      }),
    );
    const id = text(document, 'id');
    this.records.set(`document:${step.document}`, id);
    return created(!before.has(id), id);
  }

  private async linkDocument(
    step: Extract<DemonstrationStep, { kind: 'document.link' }>,
  ): Promise<StepResult> {
    const principal = this.principal(step.actor);
    const companyId = this.personaCompany(step.actor);
    const documentId = this.record('document', step.document);
    const projectId = this.record('project', step.project);
    const linked = async () =>
      list(
        record(
          await this.api.read(
            principal,
            `/projects/${projectId}/documents`,
            companyId,
          ),
        ).documents,
      ).some(
        (entry) => text(record(record(entry).document), 'id') === documentId,
      );
    if (await linked()) return { outcome: 'present', recordId: documentId };
    const receipt = record(
      await this.api.send({
        principal,
        method: 'POST',
        path: `/documents/${documentId}/project-association`,
        companyId,
        body: {
          action: 'link',
          projectId,
          expectedRevision: step.expectedRevision,
        },
        idempotencyKey: demonstrationIdempotencyKey(step),
      }),
    );
    if (text(receipt, 'documentId') !== documentId) throw unexpected();
    // An exact replay confirms a historical link without restoring one that a
    // user removed since.
    return created(await linked(), documentId);
  }

  private async createRequest(
    step: Extract<DemonstrationStep, { kind: 'request.create' }>,
  ): Promise<StepResult> {
    const principal = this.principal(step.actor);
    const companyId = this.personaCompany(step.actor);
    const before = await this.api.pagedIds(
      principal,
      '/commercial-intake/requests',
      companyId,
    );
    const request = record(
      await this.api.send({
        principal,
        method: 'POST',
        path: '/commercial-intake/requests',
        companyId,
        body: {
          originalText: step.originalText,
          subject: step.subject,
          sourceLabel: step.sourceLabel,
          ...(step.client === null
            ? {}
            : { clientAccountId: this.record('client', step.client) }),
          opportunity: {
            title: step.opportunity.title,
            ...(step.opportunity.scope === null
              ? {}
              : { scope: step.opportunity.scope }),
            nextAction: step.opportunity.nextAction,
          },
        },
        idempotencyKey: demonstrationIdempotencyKey(step),
      }),
    );
    const id = text(request, 'id');
    this.records.set(`request:${step.request}`, id);
    this.opportunities.set(
      step.request,
      text(record(request.initialOpportunity), 'id'),
    );
    return created(!before.has(id), id);
  }

  private async updateNextAction(
    step: Extract<DemonstrationStep, { kind: 'opportunity.next-action' }>,
  ): Promise<StepResult> {
    const principal = this.principal(step.actor);
    const companyId = this.personaCompany(step.actor);
    const requestId = this.record('request', step.request);
    const opportunityId = this.opportunities.get(step.request);
    if (!opportunityId)
      throw new Error(`Scenario Opportunity ${step.request} is unresolved.`);
    const before = record(
      record(
        await this.api.read(
          principal,
          `/commercial-intake/requests/${requestId}`,
          companyId,
        ),
      ).initialOpportunity,
    );
    if (text(before, 'id') !== opportunityId) throw unexpected();
    if (before.nextAction === step.nextAction)
      return { outcome: 'present', recordId: opportunityId };
    const result = record(
      await this.api.send({
        principal,
        method: 'POST',
        path: `/commercial-intake/opportunities/${opportunityId}/next-action`,
        companyId,
        body: {
          expectedVersion: step.expectedVersion,
          nextAction: step.nextAction,
        },
        idempotencyKey: demonstrationIdempotencyKey(step),
      }),
    );
    const receipt = record(result.receipt);
    if (text(receipt, 'opportunityId') !== opportunityId) throw unexpected();
    return created(
      integer(receipt, 'version') > integer(before, 'version'),
      opportunityId,
    );
  }

  private async createDefinition(
    step: Extract<DemonstrationStep, { kind: 'catalogue.definition' }>,
  ): Promise<StepResult> {
    const principal = this.principal(step.actor);
    const companyId = this.personaCompany(step.actor);
    const before = await this.api.pagedIds(
      principal,
      '/commercial-catalogue/service-definitions',
      companyId,
      (item) => text(requireProvisional(item), 'id'),
    );
    const result = record(
      await this.api.send({
        principal,
        method: 'POST',
        path: '/commercial-catalogue/service-definitions',
        companyId,
        body: {
          code: step.code,
          name: step.name,
          description: step.description,
        },
        idempotencyKey: demonstrationIdempotencyKey(step),
      }),
    );
    const definition = requireProvisional(record(result.definition));
    if (text(definition, 'code') !== step.code) throw unexpected();
    const id = text(definition, 'id');
    this.records.set(`definition:${step.definition}`, id);
    return created(!before.has(id), id);
  }

  private async createOffering(
    step: Extract<DemonstrationStep, { kind: 'catalogue.offering' }>,
  ): Promise<StepResult> {
    const principal = this.principal(step.actor);
    const companyId = this.personaCompany(step.actor);
    const before = await this.api.pagedIds(
      principal,
      '/commercial-catalogue/offerings',
      companyId,
      (item) => text(requireProvisional(item), 'id'),
    );
    const result = record(
      await this.api.send({
        principal,
        method: 'POST',
        path: '/commercial-catalogue/offerings',
        companyId,
        body: {
          serviceDefinitionId: this.record('definition', step.definition),
          commercialLabel: step.commercialLabel,
        },
        idempotencyKey: demonstrationIdempotencyKey(step),
      }),
    );
    const offering = requireProvisional(record(result.offering));
    const id = text(offering, 'id');
    this.records.set(`offering:${step.offering}`, id);
    return created(!before.has(id), id);
  }

  private async publishRule(
    step: Extract<DemonstrationStep, { kind: 'pricing.rule' }>,
  ): Promise<StepResult> {
    const principal = this.principal(step.actor);
    const companyId = this.personaCompany(step.actor);
    const scope = requireProvisional(
      record(
        await this.api.read(
          principal,
          '/pricing-configuration/rule-scope',
          companyId,
        ),
      ),
    );
    if (scope.headVersionNumber !== null) {
      integer(scope, 'headVersionNumber');
      // A head exists, whoever published it: it is never superseded.
      const page = requireProvisional(
        record(
          await this.api.read(
            principal,
            '/pricing-configuration/rule-versions?limit=1',
            companyId,
          ),
        ),
      );
      const [head] = list(page.items);
      if (head === undefined) throw unexpected();
      return {
        outcome: 'present',
        recordId: text(requireProvisional(record(head)), 'id'),
      };
    }
    const start = new Date(
      // The next whole second is strictly after the shared run instant. This
      // is not a timeout margin: the seed server keeps that same clock while
      // its ordinary publication policy executes, however long locks take.
      (Math.floor(this.now().getTime() / 1_000) + 1) * 1_000,
    );
    const result = record(
      await this.api.send({
        principal,
        method: 'POST',
        path: '/pricing-configuration/rule-versions',
        companyId,
        body: {
          label: step.label,
          effectiveFrom: start.toISOString(),
          expectedActiveVersionNumber: null,
        },
        idempotencyKey: demonstrationIdempotencyKey(step),
      }),
    );
    const version = requireProvisional(record(result.version));
    return created(result.outcome === 'PUBLISHED', text(version, 'id'));
  }

  private async administration(): Promise<Administration> {
    const state = record(
      await this.api.read(OWNER, '/company-context-assignments/administration'),
    );
    return {
      memberships: new Set(
        list(state.members).map((member) =>
          text(record(member), 'workspaceMembershipId'),
        ),
      ),
      assignments: list(state.assignments).map((item) => {
        const assignment = record(item);
        return {
          id: text(assignment, 'id'),
          workspaceMembershipId: text(assignment, 'workspaceMembershipId'),
          companyId: text(assignment, 'companyId'),
          bundle: text(assignment, 'bundle'),
        };
      }),
    };
  }

  private principal(key: DemonstrationPersonaKey): DemonstrationPrincipal {
    return { kind: 'persona', persona: this.persona(key) };
  }

  private persona(key: DemonstrationPersonaKey): DemonstrationPersona {
    const persona = this.scenario.personas.find(
      (candidate) => candidate.key === key,
    );
    if (!persona) throw new Error(`Scenario persona ${key} is undefined.`);
    return persona;
  }

  private personaCompany(key: DemonstrationPersonaKey): string {
    return this.company(this.persona(key).company);
  }

  private workspace(): string {
    if (!this.workspaceId) throw new Error('The owner is unresolved.');
    return this.workspaceId;
  }

  private company(key: DemonstrationCompanyKey): string {
    const id = this.companies.get(key);
    if (!id) throw new Error(`Scenario Company ${key} is unresolved.`);
    return id;
  }

  private membership(key: DemonstrationPersonaKey): string {
    const id = this.memberships.get(key);
    if (!id) throw new Error(`Scenario persona ${key} is unresolved.`);
    return id;
  }

  private record(
    kind: 'client' | 'project' | 'task' | 'document' | 'request' | 'definition',
    key: string,
  ): string {
    const id = this.records.get(`${kind}:${key}`);
    if (!id) throw new Error(`Scenario ${kind} ${key} is unresolved.`);
    return id;
  }
}

function created(isNew: boolean, recordId: string): StepResult {
  return { outcome: isNew ? 'created' : 'replayed', recordId };
}

function transitionCommand(
  taskId: string,
  transition: Extract<
    DemonstrationStep,
    { kind: 'task.transition' }
  >['transition'],
): {
  status: 'in_progress' | 'blocked' | 'done' | 'cancelled';
  path: string;
  body: Record<string, unknown>;
} {
  switch (transition.kind) {
    case 'start':
      return {
        status: 'in_progress',
        path: `/tasks/${taskId}/status`,
        body: {
          expectedVersion: transition.expectedVersion,
          status: 'in_progress',
        },
      };
    case 'block':
      return {
        status: 'blocked',
        path: `/tasks/${taskId}/status`,
        body: {
          expectedVersion: transition.expectedVersion,
          status: 'blocked',
          reason: transition.reason,
        },
      };
    case 'complete':
      return {
        status: 'done',
        path: `/tasks/${taskId}/complete`,
        body: { expectedVersion: transition.expectedVersion },
      };
    case 'cancel':
      return {
        status: 'cancelled',
        path: `/tasks/${taskId}/cancel`,
        body: {
          expectedVersion: transition.expectedVersion,
          reason: transition.reason,
        },
      };
    default:
      return assertNever(transition);
  }
}

function assertNever(value: never): never {
  throw new Error(`Unexpected scenario variant: ${JSON.stringify(value)}`);
}

/**
 * Runs the scenario once. Every step reports one outcome; the first refused
 * step stops the run and is named, and every earlier committed step remains.
 */
export async function runDemonstrationScenario(
  options: DemonstrationRunOptions,
): Promise<DemonstrationRunResult> {
  const scenario = options.scenario ?? DEMONSTRATION_SCENARIO;
  const run = new DemonstrationRun(
    new DemonstrationApi(options.origin, options.headersFor),
    scenario,
    options.now,
  );
  const entries: DemonstrationManifestEntry[] = [];
  let current = DEMONSTRATION_OWNER_STEP;
  try {
    const workspace = await run.resolveOwner();
    options.onLine?.({ scenario: scenario.version, workspace });
    for (const step of scenario.steps) {
      current = step.key;
      const result = await run.execute(step);
      const entry: DemonstrationManifestEntry = {
        scenario: scenario.version,
        step: step.key,
        outcome: result.outcome,
        recordId: result.recordId,
        ...(step.register ? { register: step.register } : {}),
      };
      entries.push(entry);
      options.onLine?.(entry);
    }
    const summary = run.summary();
    options.onLine?.(summary);
    return { kind: 'converged', workspace, entries, summary };
  } catch (error) {
    if (!(error instanceof DemonstrationStepStop)) throw error;
    const stop: DemonstrationStop = {
      scenario: scenario.version,
      result: 'stopped',
      step: current,
      reason: error.reason,
      status: error.status,
    };
    options.onLine?.(stop);
    return { kind: 'stopped', entries, stop };
  }
}
