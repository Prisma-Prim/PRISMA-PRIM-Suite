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
import type { ActorContext } from '../access/access.types.js';
import {
  ActorContextAdapter,
  type ActorContextRequest,
} from '../access/actor-context.adapter.js';
import { ClientDuplicateReviewController } from './client-duplicate-review.controller.js';
import { ClientDuplicateReviewService } from './client-duplicate-review.service.js';

const actor: ActorContext = {
  internalUserId: 'internal-user',
  workspaceMembershipId: 'workspace-membership',
  workspaceId: 'workspace',
  workspaceName: 'Workspace',
  displayName: 'Resolver',
  email: 'resolver@example.test',
  active: true,
  workspacePermissions: [],
  activeCompany: {
    id: 'company',
    displayName: 'Company',
    clientPermissions: [
      'client.read',
      'client.create',
      'client.update',
      'client.duplicate.resolve',
    ],
    clientPermissionAssignmentId: 'assignment',
    clientPermissionSetVersion: 'v2',
  },
};

const cursor = '11111111-1111-4111-8111-111111111111';
const page = {
  items: [
    {
      duplicate_review_reference: '22222222-2222-4222-8222-222222222222',
    },
  ],
  next_cursor: cursor,
};

describe('Client duplicate-review pagination HTTP contract', () => {
  let app: INestApplication;
  let origin: string;
  const list = vi.fn(async () => page);

  beforeAll(async () => {
    const actorGuard: CanActivate = {
      canActivate(context: ExecutionContext) {
        const request = context
          .switchToHttp()
          .getRequest<ActorContextRequest>();
        request.actorContext = actor;
        return true;
      },
    };
    const moduleRef = await Test.createTestingModule({
      controllers: [ClientDuplicateReviewController],
      providers: [
        {
          provide: ClientDuplicateReviewService,
          useValue: { list },
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
    list.mockClear();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('passes a validated bounded page request to the service', async () => {
    const response = await fetch(
      `${origin}/api/client-duplicate-reviews?page_size=2&cursor=${cursor}`,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(page);
    expect(list).toHaveBeenCalledExactlyOnceWith(actor, {
      pageSize: 2,
      cursor,
    });
  });

  it('uses the explicit default page size for the first page', async () => {
    const response = await fetch(`${origin}/api/client-duplicate-reviews`);

    expect(response.status).toBe(200);
    expect(list).toHaveBeenCalledExactlyOnceWith(actor, {
      pageSize: 20,
      cursor: undefined,
    });
  });

  it.each([
    'page_size=0',
    'page_size=21',
    'page_size=1.5',
    'page_size=not-a-number',
    'page_size=1&page_size=2',
    'cursor=not-a-uuid',
    `cursor=${cursor}&cursor=22222222-2222-4222-8222-222222222222`,
  ])(
    'rejects unsafe query input without listing reviews: %s',
    async (query) => {
      const response = await fetch(
        `${origin}/api/client-duplicate-reviews?${query}`,
      );

      expect(response.status).toBe(400);
      expect(list).not.toHaveBeenCalled();
    },
  );
});
