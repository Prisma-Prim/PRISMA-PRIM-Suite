import {
  RequestMethod,
  type CanActivate,
  type ExecutionContext,
  type INestApplication,
  type Provider,
  type Type,
} from '@nestjs/common';
import {
  METHOD_METADATA,
  MODULE_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants.js';
import { Test } from '@nestjs/testing';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { ActivityLogController } from '../accountability/activity-log.controller.js';
import { AppController } from '../app.controller.js';
import { AppModule } from '../app.module.js';
import { CertificationController } from '../certification/certification.controller.js';
import { ClientDuplicateReviewController } from '../client/client-duplicate-review.controller.js';
import { ClientUnionController } from '../client/client-union.controller.js';
import { ClientController } from '../client/client.controller.js';
import { CommercialCatalogueController } from '../commercial-catalogue/commercial-catalogue.controller.js';
import {
  CommercialIntakeController,
  CommercialIntakeOpportunityController,
} from '../commercial-intake/commercial-intake.controller.js';
import { CompanyController } from '../company/company.controller.js';
import { ContractModelController } from '../contract-model/contract-model.adapter.js';
import { ContractAgreementsController } from '../contract/contract-agreements.controller.js';
import { ContractDecisionQueueController } from '../contract/contract-decision-queue.controller.js';
import {
  ContractController,
  ProjectContractsController,
} from '../contract/contract.controller.js';
import { DocumentContentController } from '../documents/document-content.controller.js';
import { DocumentProjectsController } from '../documents/document-projects.controller.js';
import { DocumentVersionsController } from '../documents/document-versions.controller.js';
import { DocumentsController } from '../documents/documents.controller.js';
import { ProjectPdfBundleController } from '../documents/project-pdf-bundle.controller.js';
import { IdeasController } from '../ideas/ideas.controller.js';
import { InternalTaskController } from '../internal-task/internal-task.controller.js';
import { InvoiceRecordController } from '../invoice-record/invoice-record.controller.js';
import { KnowledgeActorGuard } from '../knowledge/knowledge-identity.js';
import { KnowledgeWebController } from '../knowledge/knowledge-web.controller.js';
import {
  KnowledgeAssignmentController,
  KnowledgeController,
  KnowledgeReadController,
} from '../knowledge/knowledge.controller.js';
import { MissionPlanCopyController } from '../mission-plan/mission-plan-copy.controller.js';
import { MissionPlanController } from '../mission-plan/mission-plan.controller.js';
import { OfferModelController } from '../offer-model/offer-model.adapter.js';
import { OfferDecisionQueueController } from '../offer/offer-decision-queue.controller.js';
import { OfferController } from '../offer/offer.controller.js';
import { OperationalHomeController } from '../operational-home/operational-home.controller.js';
import { OperationalRiskController } from '../operational-risk/operational-risk.controller.js';
import {
  OpportunityFollowUpController,
  OpportunityFollowUpDiscoveryController,
} from '../opportunity-follow-up/opportunity-follow-up.controller.js';
import { PaymentController } from '../payment/payment.controller.js';
import { PricingConfigurationController } from '../pricing-configuration/pricing-configuration.controller.js';
import { PricingSnapshotController } from '../pricing-configuration/pricing-snapshot.controller.js';
import { ProfitabilityDecisionQueueController } from '../profitability-estimate/profitability-decision-queue.controller.js';
import { ProfitabilityEstimateController } from '../profitability-estimate/profitability-estimate.controller.js';
import { MissionApplicabilityController } from '../project-mission-applicability/mission-applicability.controller.js';
import { MissionResultReviewController } from '../project-mission-review/mission-result-review.controller.js';
import { ProjectNextActionController } from '../project-next-action/project-next-action.controller.js';
import { ProjectTemplateController } from '../project-template/project-template.controller.js';
import { ProjectLifecycleController } from '../project/project-lifecycle.controller.js';
import { ProjectResponsibilityController } from '../project/project-responsibility.controller.js';
import { ProjectController } from '../project/project.controller.js';
import { SalesStageController } from '../sales-stage/sales-stage.controller.js';
import { TaskResultsController } from '../task/task-results.controller.js';
import { TaskController } from '../task/task.controller.js';
import { WorkingEvidenceController } from '../working-evidence/working-evidence.controller.js';
import { AccessController } from './access.controller.js';
import { parseInternalUserId, parseWorkspaceId } from './access-identifiers.js';
import type { ActorContext } from './access.types.js';
import {
  ActorContextAdapter,
  type ActorContextRequest,
} from './actor-context.adapter.js';
import { CompanyRoleAssignmentController } from './company-role-assignment.controller.js';
import { WorkspaceInvitationAcceptanceController } from './workspace-invitation-acceptance.controller.js';
import { WorkspaceInvitationController } from './workspace-invitation.controller.js';
import { WorkspaceMembershipSuspensionController } from './workspace-membership-suspension.controller.js';
import { WorkspaceSessionRevocationController } from './workspace-session-revocation.controller.js';

const actor: ActorContext = {
  internalUserId: parseInternalUserId('11111111-1111-4111-8111-111111111111'),
  workspaceMembershipId: 'workspace-membership',
  workspaceId: parseWorkspaceId('22222222-2222-4222-8222-222222222222'),
  workspaceName: 'Workspace',
  displayName: 'Actor',
  email: 'actor@example.test',
  active: true,
  workspacePermissions: [],
};

// Every controller whose handlers read the actor through
// `requireActorContext`. Each of their handlers is exercised below.
const actorControllers: readonly Type[] = [
  AccessController,
  ActivityLogController,
  CertificationController,
  ClientController,
  ClientDuplicateReviewController,
  ClientUnionController,
  CommercialCatalogueController,
  CommercialIntakeController,
  CommercialIntakeOpportunityController,
  CompanyController,
  CompanyRoleAssignmentController,
  ContractAgreementsController,
  ContractController,
  ContractDecisionQueueController,
  ContractModelController,
  DocumentContentController,
  DocumentProjectsController,
  DocumentVersionsController,
  DocumentsController,
  IdeasController,
  InternalTaskController,
  InvoiceRecordController,
  KnowledgeAssignmentController,
  KnowledgeController,
  KnowledgeReadController,
  KnowledgeWebController,
  MissionApplicabilityController,
  MissionPlanController,
  MissionPlanCopyController,
  MissionResultReviewController,
  OfferController,
  OfferDecisionQueueController,
  OfferModelController,
  OperationalHomeController,
  OperationalRiskController,
  OpportunityFollowUpController,
  OpportunityFollowUpDiscoveryController,
  PaymentController,
  PricingConfigurationController,
  PricingSnapshotController,
  ProfitabilityDecisionQueueController,
  ProfitabilityEstimateController,
  ProjectContractsController,
  ProjectController,
  ProjectLifecycleController,
  ProjectNextActionController,
  ProjectPdfBundleController,
  ProjectResponsibilityController,
  ProjectTemplateController,
  SalesStageController,
  TaskController,
  TaskResultsController,
  WorkingEvidenceController,
  WorkspaceInvitationController,
  WorkspaceMembershipSuspensionController,
  WorkspaceSessionRevocationController,
];

// Controllers whose routes run without an actor context, each with the
// reason it stays outside this test. Every other controller of the
// application must be listed in `actorControllers`.
const exemptControllers = new Map<Type, string>([
  [AppController, 'Public health check, answered before any sign-in.'],
  [
    WorkspaceInvitationAcceptanceController,
    'An invitee accepts with a verified principal before holding any Workspace membership, so no actor context can exist yet; a missing principal is denied with 401.',
  ],
]);

// Route parameters take values their route admits, a well-formed identifier
// unless listed, so only the missing actor can deny the request.
const identifierParameter = ['66666666-6666-4666-8666-666666666666'];
const routeParameters = new Map<string, readonly string[]>([
  ['noun', ['context', 'director-client']],
  ['stage', ['stage-1', 'stage-2']],
  [
    'update',
    [
      'correction',
      'classification',
      'reclassification',
      'response',
      'plan-judgment',
      'verification',
    ],
  ],
]);

interface ActorRoute {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
}

const httpMethods = new Map<unknown, ActorRoute['method']>([
  [RequestMethod.GET, 'GET'],
  [RequestMethod.POST, 'POST'],
  [RequestMethod.PUT, 'PUT'],
  [RequestMethod.PATCH, 'PATCH'],
  [RequestMethod.DELETE, 'DELETE'],
]);

function pathSegments(metadata: unknown): readonly string[] {
  if (metadata === undefined) return ['/'];
  if (typeof metadata === 'string') return [metadata];
  if (
    Array.isArray(metadata) &&
    metadata.every((path) => typeof path === 'string')
  )
    return metadata;
  throw new Error('Unsupported route path metadata.');
}

// Every concrete path of a route template, one per admitted parameter value.
function routePaths(template: string): readonly string[] {
  const parameter = /:(\w+)/u.exec(template);
  if (!parameter) return [template];
  const [placeholder, name] = parameter;
  return (routeParameters.get(name) ?? identifierParameter).flatMap((value) =>
    routePaths(template.replace(placeholder, value)),
  );
}

function routeTemplate(...segments: readonly string[]): string {
  const path = segments
    .flatMap((segment) => segment.split('/'))
    .filter((part) => part.length > 0)
    .join('/');
  return `/${path}`;
}

// The routes Nest registers for a controller, read from its own metadata so
// that a handler added later is covered without editing this list.
function routesOf(controller: Type): ActorRoute[] {
  const bases = pathSegments(Reflect.getMetadata(PATH_METADATA, controller));
  return methodNames(controller).flatMap((name) => {
    const handler: unknown = Reflect.get(controller.prototype, name);
    if (typeof handler !== 'function') return [];
    const pathMetadata: unknown = Reflect.getMetadata(PATH_METADATA, handler);
    if (pathMetadata === undefined) return [];
    const method = httpMethods.get(
      Reflect.getMetadata(METHOD_METADATA, handler),
    );
    if (!method)
      throw new Error(`Unsupported HTTP method on ${controller.name}.${name}.`);
    return bases.flatMap((base) =>
      pathSegments(pathMetadata).flatMap((path) =>
        routePaths(routeTemplate(base, path)).map((concrete) => ({
          method,
          path: concrete,
        })),
      ),
    );
  });
}

// The methods a class declares or inherits, as Nest scans a controller: a
// handler or service method defined on a shared base class counts too.
function methodNames(type: Type): readonly string[] {
  const names = new Set<string>();
  for (
    let prototype: unknown = type.prototype;
    typeof prototype === 'object' &&
    prototype !== null &&
    prototype !== Object.prototype;
    prototype = Reflect.getPrototypeOf(prototype)
  )
    for (const name of Object.getOwnPropertyNames(prototype))
      if (name !== 'constructor') names.add(name);
  return [...names];
}

function dependenciesOf(controller: Type): readonly Type[] {
  const parameters: unknown = Reflect.getMetadata(
    'design:paramtypes',
    controller,
  );
  if (parameters === undefined) return [];
  if (
    Array.isArray(parameters) &&
    parameters.every(
      (parameter): parameter is Type => typeof parameter === 'function',
    )
  )
    return parameters;
  throw new Error(`Unresolved constructor dependency of ${controller.name}.`);
}

function isClass(value: unknown): value is Type {
  return typeof value === 'function';
}

function listOf(value: unknown, what: string): readonly unknown[] {
  if (value === undefined) return [];
  if (Array.isArray(value)) return value;
  throw new Error(`Unsupported ${what}.`);
}

function controllersOf(value: unknown, owner: string): readonly Type[] {
  const controllers = listOf(value, `controllers of ${owner}`);
  if (controllers.every(isClass)) return controllers;
  throw new Error(`Unsupported controller of ${owner}.`);
}

// Every controller Nest registers for the application, read from the module
// graph rooted at AppModule: static and dynamic modules, awaited like Nest
// awaits an asynchronous import. Any other import form fails the test.
async function applicationControllers(root: Type): Promise<readonly Type[]> {
  const modules = new Set<Type>();
  const controllers = new Set<Type>();
  const pending: unknown[] = [root];
  while (pending.length > 0) {
    const entry: unknown = await pending.pop();
    if (isClass(entry)) {
      if (modules.has(entry)) continue;
      modules.add(entry);
      pending.push(
        ...listOf(
          Reflect.getMetadata(MODULE_METADATA.IMPORTS, entry),
          `imports of ${entry.name}`,
        ),
      );
      for (const controller of controllersOf(
        Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, entry),
        entry.name,
      ))
        controllers.add(controller);
    } else if (
      typeof entry === 'object' &&
      entry !== null &&
      'module' in entry &&
      isClass(entry.module)
    ) {
      const { name } = entry.module;
      pending.push(
        entry.module,
        ...listOf(
          'imports' in entry ? entry.imports : undefined,
          `imports of ${name}`,
        ),
      );
      for (const controller of controllersOf(
        'controllers' in entry ? entry.controllers : undefined,
        name,
      ))
        controllers.add(controller);
    } else {
      throw new Error('Unsupported module import.');
    }
  }
  return [...controllers];
}

const actorRoutes = actorControllers.flatMap(routesOf);

describe('Controllers without an established actor context', () => {
  let app: INestApplication;
  let origin: string;
  let establishedActor: ActorContext | undefined;
  const serviceMethod = vi.fn<(...args: unknown[]) => Promise<object>>(
    async () => ({}),
  );

  // Answers every method the service class declares through one recorder.
  function serviceDouble(service: Type): Provider {
    const methods = methodNames(service);
    return {
      provide: service,
      useValue: Object.fromEntries(
        methods.map((name) => [name, serviceMethod]),
      ),
    };
  }

  function send({ method, path }: ActorRoute): Promise<Response> {
    const body = method === 'GET' || method === 'DELETE' ? undefined : '{}';
    return fetch(`${origin}/api${path}`, {
      method,
      headers: {
        'content-type': 'application/json',
        'idempotency-key': 'missing-actor-context',
      },
      body,
    });
  }

  beforeAll(async () => {
    // Stands in for ActorContextAdapter and KnowledgeActorGuard: it admits
    // the request and attaches the actor only when the test establishes one.
    const actorGuard: CanActivate = {
      canActivate(context: ExecutionContext) {
        const request = context
          .switchToHttp()
          .getRequest<ActorContextRequest>();
        if (establishedActor) request.actorContext = establishedActor;
        return true;
      },
    };
    const services = new Set(actorControllers.flatMap(dependenciesOf));
    const moduleRef = await Test.createTestingModule({
      controllers: [...actorControllers],
      providers: [...services].map(serviceDouble),
    })
      .overrideGuard(ActorContextAdapter)
      .useValue(actorGuard)
      .overrideGuard(KnowledgeActorGuard)
      .useValue(actorGuard)
      .compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    await app.listen(0, '127.0.0.1');
    origin = await app.getUrl();
  });

  beforeEach(() => {
    establishedActor = undefined;
    serviceMethod.mockClear();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('covers every controller of the application or names why it is exempt', async () => {
    const controllers = await applicationControllers(AppModule);
    const accountedFor = [...actorControllers, ...exemptControllers.keys()];

    expect(accountedFor.map(({ name }) => name).sort()).toEqual(
      controllers.map(({ name }) => name).sort(),
    );
  });

  it('covers every handler of the actor controllers', () => {
    expect(actorRoutes).toContainEqual({
      method: 'GET',
      path: '/access/current-actor',
    });
    expect(actorRoutes.length).toBeGreaterThan(actorControllers.length);
  });

  it.each(actorRoutes)(
    'denies $method $path with 403 before any service call',
    async (route) => {
      const response = await send(route);

      expect(response.status).toBe(403);
      expect(serviceMethod).not.toHaveBeenCalled();
    },
  );

  it('returns the established actor unchanged', async () => {
    establishedActor = actor;

    const response = await send({
      method: 'GET',
      path: '/access/current-actor',
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(actor);
  });

  it('passes the established actor to the service', async () => {
    establishedActor = actor;

    const response = await send({ method: 'GET', path: '/companies' });

    expect(response.status).toBe(200);
    expect(serviceMethod).toHaveBeenCalledExactlyOnceWith(actor);
  });
});
