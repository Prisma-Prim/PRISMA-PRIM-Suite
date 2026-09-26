import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { describe, expect, it, vi } from 'vitest';
import { AccountabilityService } from '../accountability/accountability.service.js';
import { DatabaseContext } from '../database/database-context.js';
import { CompanyContextAssignmentService } from './company-context-assignment.service.js';
import type { ActorContext } from './access.types.js';

describe('CompanyContextAssignmentService', () => {
  it('reads administration state from one repeatable-read snapshot', async () => {
    const select = vi
      .fn()
      .mockReturnValueOnce(query([]))
      .mockReturnValueOnce(query([]))
      .mockReturnValueOnce(query([]));
    const transactionDatabase = { select } as unknown as NodePgDatabase;
    const transaction = vi.fn(
      async (work: (database: NodePgDatabase) => Promise<unknown>) =>
        work(transactionDatabase),
    );
    const databaseContext = new DatabaseContext({
      transaction,
    } as unknown as NodePgDatabase);
    const service = new CompanyContextAssignmentService(
      databaseContext,
      new AccountabilityService(databaseContext),
      false,
    );

    await expect(service.readAdministrationState(actor)).resolves.toEqual({
      members: [],
      companies: [],
      assignments: [],
    });
    expect(select).toHaveBeenCalledTimes(3);
    expect(transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'repeatable read',
      accessMode: 'read only',
    });
  });
});

function query(rows: unknown[]) {
  const chain = {
    from: vi.fn(),
    innerJoin: vi.fn(),
    where: vi.fn(),
    orderBy: vi.fn().mockResolvedValue(rows),
  };
  chain.from.mockReturnValue(chain);
  chain.innerJoin.mockReturnValue(chain);
  chain.where.mockReturnValue(chain);
  return chain;
}

const actor: ActorContext = {
  internalUserId: '11111111-1111-4111-8111-111111111111',
  workspaceMembershipId: '22222222-2222-4222-8222-222222222222',
  workspaceId: '00000000-0000-4000-8000-000000000000',
  workspaceName: 'Workspace',
  displayName: 'Workspace Owner',
  email: 'owner@example.test',
  active: true,
  workspacePermissions: ['company.assignment.manage'],
};
