import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { describe, expect, it, vi } from 'vitest';
import type { ActorContext } from '../access/access.types.js';
import { DatabaseContext } from '../database/database-context.js';
import { AccountabilityService } from './accountability.service.js';
import { CLIENT_CORRECTED_ACTION } from './accountability.types.js';

describe('AccountabilityService', () => {
  it('persists the responsible Company for a Client correction', async () => {
    const onConflictDoNothing = vi.fn().mockResolvedValue(undefined);
    const values = vi.fn().mockReturnValue({ onConflictDoNothing });
    const database = { insert: vi.fn().mockReturnValue({ values }) };
    const service = new AccountabilityService(
      new DatabaseContext(database as unknown as NodePgDatabase),
    );

    await service.record({
      actor,
      action: CLIENT_CORRECTED_ACTION,
      target: {
        type: 'client_account',
        clientAccountId: '33333333-3333-4333-8333-333333333333',
        companyId: '44444444-4444-4444-8444-444444444444',
      },
      metadata: {
        changes: { telephone: { before: null, after: '+373 60 000 000' } },
      },
      transitionId: '55555555-5555-4555-8555-555555555555',
    });

    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        action: CLIENT_CORRECTED_ACTION,
        targetClientAccountId: '33333333-3333-4333-8333-333333333333',
        targetCompanyId: '44444444-4444-4444-8444-444444444444',
      }),
    );
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
    clientPermissions: ['client.read', 'client.update'],
  },
};
