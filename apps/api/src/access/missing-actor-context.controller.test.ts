import { parseInternalUserId, parseWorkspaceId } from './access-identifiers.js';
import type {
  CanActivate,
  ExecutionContext,
  INestApplication,
} from '@nestjs/common';
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
import { AccountabilityService } from '../accountability/accountability.service.js';
import { ClientDuplicateReviewController } from '../client/client-duplicate-review.controller.js';
import { ClientDuplicateReviewService } from '../client/client-duplicate-review.service.js';
import { ClientController } from '../client/client.controller.js';
import { ClientService } from '../client/client.service.js';
import { CompanyController } from '../company/company.controller.js';
import { CompanyService } from '../company/company.service.js';
import { AccessController } from './access.controller.js';
import type { ActorContext } from './access.types.js';
import {
  ActorContextAdapter,
  type ActorContextRequest,
} from './actor-context.adapter.js';
import { CompanyContextAssignmentController } from './company-context-assignment.controller.js';
import { CompanyContextAssignmentService } from './company-context-assignment.service.js';
import { CompanyDirectorClientAssignmentController } from './company-director-client-assignment.controller.js';
import { WorkspaceMembershipSuspensionController } from './workspace-membership-suspension.controller.js';
import { WorkspaceMembershipSuspensionService } from './workspace-membership-suspension.service.js';

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

const membershipId = '11111111-1111-4111-8111-111111111111';
const companyId = '22222222-2222-4222-8222-222222222222';
const clientId = '33333333-3333-4333-8333-333333333333';
const legalEntityId = '44444444-4444-4444-8444-444444444444';
const reviewId = '55555555-5555-4555-8555-555555555555';

interface ActorRoute {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
}

// Every handler that reads the actor through `requireActorContext`.
const actorRoutes: readonly ActorRoute[] = [
  { method: 'GET', path: '/access/current-actor' },
  { method: 'GET', path: '/activity-log' },
  { method: 'GET', path: '/company-context-assignments/administration' },
  { method: 'POST', path: '/company-context-assignments' },
  {
    method: 'DELETE',
    path: `/company-context-assignments/${membershipId}/${companyId}`,
  },
  { method: 'POST', path: '/company-director-client-assignments' },
  {
    method: 'DELETE',
    path: `/company-director-client-assignments/${membershipId}/${companyId}`,
  },
  { method: 'POST', path: '/workspace-membership-suspensions' },
  { method: 'GET', path: '/client-duplicate-reviews' },
  { method: 'GET', path: `/client-duplicate-reviews/${reviewId}` },
  { method: 'GET', path: '/clients' },
  { method: 'GET', path: '/clients/search?query=Acme' },
  { method: 'POST', path: '/clients' },
  { method: 'PUT', path: `/clients/${clientId}/active-company-relationship` },
  { method: 'GET', path: `/clients/${clientId}` },
  { method: 'GET', path: `/clients/${clientId}/correction-history` },
  { method: 'GET', path: `/clients/${clientId}/legal-entities` },
  { method: 'POST', path: `/clients/${clientId}/legal-entities` },
  {
    method: 'PATCH',
    path: `/clients/${clientId}/legal-entities/${legalEntityId}`,
  },
  { method: 'PATCH', path: `/clients/${clientId}` },
  { method: 'GET', path: '/companies' },
  { method: 'POST', path: '/companies' },
  { method: 'GET', path: `/companies/${companyId}` },
];

describe('Controllers without an established actor context', () => {
  let app: INestApplication;
  let origin: string;
  let establishedActor: ActorContext | undefined;
  const serviceMethod = vi.fn<(...args: unknown[]) => Promise<object>>(
    async () => ({}),
  );

  function serviceDouble(methods: readonly string[]) {
    return Object.fromEntries(methods.map((name) => [name, serviceMethod]));
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
    // Stands in for ActorContextAdapter: it admits the request and attaches
    // the actor only when the test establishes one.
    const actorGuard: CanActivate = {
      canActivate(context: ExecutionContext) {
        const request = context
          .switchToHttp()
          .getRequest<ActorContextRequest>();
        if (establishedActor) request.actorContext = establishedActor;
        return true;
      },
    };
    const moduleRef = await Test.createTestingModule({
      controllers: [
        AccessController,
        ActivityLogController,
        ClientController,
        ClientDuplicateReviewController,
        CompanyContextAssignmentController,
        CompanyController,
        CompanyDirectorClientAssignmentController,
        WorkspaceMembershipSuspensionController,
      ],
      providers: [
        {
          provide: AccountabilityService,
          useValue: serviceDouble(['listForActor']),
        },
        {
          provide: ClientService,
          useValue: serviceDouble([
            'query',
            'execute',
            'readCorrectionHistory',
            'readLegalEntities',
            'registerLegalEntity',
            'correctLegalEntity',
          ]),
        },
        {
          provide: ClientDuplicateReviewService,
          useValue: serviceDouble(['list', 'read']),
        },
        {
          provide: CompanyContextAssignmentService,
          useValue: serviceDouble([
            'readAdministrationState',
            'grant',
            'revoke',
            'grantDirectorClientAccess',
            'revokeDirectorClientAccess',
          ]),
        },
        {
          provide: CompanyService,
          useValue: serviceDouble(['listVisible', 'register', 'get']),
        },
        {
          provide: WorkspaceMembershipSuspensionService,
          useValue: serviceDouble(['suspend']),
        },
      ],
    })
      .overrideGuard(ActorContextAdapter)
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
