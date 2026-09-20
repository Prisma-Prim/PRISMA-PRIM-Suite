import { Test } from '@nestjs/testing';
import { describe, expect, it, vi } from 'vitest';
import type { ActorContext } from '../access/access.types.js';
import { CompanyContextAuthorization } from '../access/company-context-authorization.js';
import { AccountabilityService } from '../accountability/accountability.service.js';
import { ClientOperationalReferenceService } from '../client/client-operational-reference.service.js';
import { DatabaseContext } from '../database/database-context.js';
import { ProjectService } from './project.service.js';

describe('ProjectService', () => {
  it('resolves Client references once for a 51-Project list', async () => {
    const clientId = '33333333-3333-4333-8333-333333333333';
    const rows = Array.from({ length: 51 }, (_, index) => ({
      id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
      workspaceId: actor.workspaceId,
      companyId: actor.activeCompany?.id ?? '',
      clientAccountId: clientId,
      title: `Preparation ${index}`,
      status: 'preparatory',
      createdByInternalUserId: actor.internalUserId,
      createdByWorkspaceMembershipId: actor.workspaceMembershipId,
      idempotencyKey: `project-${index}`,
      createdAt: new Date('2026-09-19T00:00:00.000Z'),
    }));
    const orderBy = vi.fn().mockResolvedValue(rows);
    const query = { from: vi.fn(), where: vi.fn(), orderBy };
    query.from.mockReturnValue(query);
    query.where.mockReturnValue(query);
    const select = vi.fn().mockReturnValue(query);
    const requireProjectAccess = vi
      .fn()
      .mockResolvedValue(actor.activeCompany?.id);
    const readProjectReferences = vi.fn().mockResolvedValue(
      new Map([
        [
          clientId,
          {
            id: clientId,
            displayName: 'Synthetic Client',
            clientDossierId: clientId,
          },
        ],
      ]),
    );
    const moduleRef = await Test.createTestingModule({
      providers: [
        ProjectService,
        {
          provide: DatabaseContext,
          useValue: { connection: { select } },
        },
        {
          provide: CompanyContextAuthorization,
          useValue: { requireProjectAccess },
        },
        {
          provide: ClientOperationalReferenceService,
          useValue: { readProjectReferences },
        },
        {
          provide: AccountabilityService,
          useValue: {},
        },
      ],
    }).compile();
    const service = moduleRef.get(ProjectService);

    await expect(service.list(actor)).resolves.toHaveLength(51);
    expect(readProjectReferences).toHaveBeenCalledOnce();
    expect(readProjectReferences).toHaveBeenCalledWith(actor, [clientId]);
  });
});

const actor: ActorContext = {
  internalUserId: '11111111-1111-4111-8111-111111111111',
  workspaceMembershipId: '22222222-2222-4222-8222-222222222222',
  workspaceId: '00000000-0000-4000-8000-000000000000',
  workspaceName: 'Workspace',
  displayName: 'Director',
  email: 'director@example.test',
  active: true,
  workspacePermissions: [],
  activeCompany: {
    id: '44444444-4444-4444-8444-444444444444',
    displayName: 'BIC',
    clientPermissions: ['client.read'],
    projectPermissions: ['project.read'],
  },
};
