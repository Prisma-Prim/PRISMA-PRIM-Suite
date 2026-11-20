import { drizzle } from 'drizzle-orm/node-postgres';
import { Client } from 'pg';
import { describe, expect, it, vi } from 'vitest';
import { AccountabilityService } from '../accountability/accountability.service.js';
import { DatabaseContext } from '../database/database-context.js';
import { CompanyContextAssignmentService } from './company-context-assignment.service.js';
import type { ActorContext } from './access.types.js';
import { parseInternalUserId, parseWorkspaceId } from './access-identifiers.js';

describe('CompanyContextAssignmentService', () => {
  it('reads administration state from one repeatable-read snapshot', async () => {
    const client = new Client();
    const query = vi
      .spyOn(client, 'query')
      .mockImplementation(async () => ({ rows: [] }));
    const database = drizzle({ client });
    const transaction = vi.spyOn(database, 'transaction');
    const databaseContext = new DatabaseContext(database);
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
    expect(query).toHaveBeenCalledTimes(5);
    expect(query).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        text: 'begin isolation level repeatable read read only',
      }),
      [],
    );
    for (const call of [2, 3, 4]) {
      expect(query.mock.calls[call - 1]?.[0]).toEqual(
        expect.objectContaining({ text: expect.stringMatching(/^select /) }),
      );
    }
    expect(query).toHaveBeenNthCalledWith(
      5,
      expect.objectContaining({ text: 'commit' }),
      [],
    );
    expect(transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'repeatable read',
      accessMode: 'read only',
    });
  });
});

const actor: ActorContext = {
  internalUserId: parseInternalUserId('11111111-1111-4111-8111-111111111111'),
  workspaceMembershipId: '22222222-2222-4222-8222-222222222222',
  workspaceId: parseWorkspaceId('00000000-0000-4000-8000-000000000000'),
  workspaceName: 'Workspace',
  displayName: 'Workspace Owner',
  email: 'owner@example.test',
  active: true,
  workspacePermissions: ['company.assignment.manage'],
};
