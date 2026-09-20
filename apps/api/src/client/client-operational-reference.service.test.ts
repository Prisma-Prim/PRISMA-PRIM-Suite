import { Test } from '@nestjs/testing';
import { describe, expect, it, vi } from 'vitest';
import type { ActorContext } from '../access/access.types.js';
import { DatabaseContext } from '../database/database-context.js';
import { ClientOperationalReferenceService } from './client-operational-reference.service.js';

describe('ClientOperationalReferenceService', () => {
  it('uses a fixed three-query plan for 51 readable Project references without unions', async () => {
    const clients = Array.from({ length: 51 }, (_, index) => ({
      id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
      displayName: `Client ${index}`,
    }));
    const select = vi
      .fn()
      .mockReturnValueOnce(query(clients))
      .mockReturnValueOnce(query([]))
      .mockReturnValueOnce(query(clients.map(({ id }) => ({ id }))));
    const moduleRef = await Test.createTestingModule({
      providers: [
        ClientOperationalReferenceService,
        {
          provide: DatabaseContext,
          useValue: { connection: { select } },
        },
      ],
    }).compile();
    const service = moduleRef.get(ClientOperationalReferenceService);

    const references = await service.readProjectReferences(
      actor,
      clients.map(({ id }) => id),
    );

    expect(select).toHaveBeenCalledTimes(3);
    expect(references.size).toBe(51);
    for (const client of clients)
      expect(references.get(client.id)).toEqual({
        ...client,
        clientDossierId: client.id,
      });
  });
});

function query(rows: unknown[]) {
  const chain = {
    from: vi.fn(),
    innerJoin: vi.fn(),
    leftJoin: vi.fn(),
    where: vi.fn().mockResolvedValue(rows),
  };
  chain.from.mockReturnValue(chain);
  chain.innerJoin.mockReturnValue(chain);
  chain.leftJoin.mockReturnValue(chain);
  return chain;
}

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
