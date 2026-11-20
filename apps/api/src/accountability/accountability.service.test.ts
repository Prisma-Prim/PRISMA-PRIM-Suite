import {
  parseInternalUserId,
  parseWorkspaceId,
} from '../access/access-identifiers.js';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Client } from 'pg';
import { describe, expect, it, vi } from 'vitest';
import type { ActorContext } from '../access/access.types.js';
import { DatabaseContext } from '../database/database-context.js';
import { AccountabilityService } from './accountability.service.js';
import { CLIENT_CORRECTED_ACTION } from './accountability.types.js';

describe('AccountabilityService', () => {
  it('persists the responsible Company for a Client correction', async () => {
    const client = new Client();
    const query = vi
      .spyOn(client, 'query')
      .mockImplementation(async () => ({ rows: [] }));
    const service = new AccountabilityService(
      new DatabaseContext(drizzle({ client })),
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

    expect(query).toHaveBeenCalledOnce();
    const calls: readonly (readonly unknown[])[] = query.mock.calls;
    const [request, bindings] = calls[0] ?? [];
    if (
      typeof request !== 'object' ||
      request === null ||
      !('text' in request) ||
      typeof request.text !== 'string' ||
      !Array.isArray(bindings)
    ) {
      throw new Error('Expected the parameterized Activity Log insert.');
    }
    const insert =
      /^insert into "activity_log_events" \(([^)]+)\) values \(([^)]+)\) on conflict \("idempotency_key"\) do nothing$/.exec(
        request.text,
      );
    if (!insert?.[1] || !insert[2])
      throw new Error('Expected an idempotent Activity Log insert.');
    const parameters: readonly unknown[] = bindings;
    const columns = insert[1].split(', ');
    const values = insert[2].split(', ');
    function valueFor(column: string): unknown {
      const value = values[columns.indexOf(`"${column}"`)];
      if (!value?.startsWith('$'))
        throw new Error(`Expected a binding for ${column}.`);
      return parameters[Number(value.slice(1)) - 1];
    }
    expect(valueFor('action')).toBe(CLIENT_CORRECTED_ACTION);
    expect(valueFor('target_client_account_id')).toBe(
      '33333333-3333-4333-8333-333333333333',
    );
    expect(valueFor('target_company_id')).toBe(
      '44444444-4444-4444-8444-444444444444',
    );
  });
});

const actor: ActorContext = {
  internalUserId: parseInternalUserId('11111111-1111-4111-8111-111111111111'),
  workspaceMembershipId: '22222222-2222-4222-8222-222222222222',
  workspaceId: parseWorkspaceId('00000000-0000-4000-8000-000000000000'),
  workspaceName: 'Workspace',
  displayName: 'Director',
  email: 'director@example.test',
  active: true,
  workspacePermissions: [],
  activeCompany: {
    id: '44444444-4444-4444-8444-444444444444',
    displayName: 'BIC',
    grants: [],
    clientPermissions: ['client.read', 'client.update'],
  },
};
