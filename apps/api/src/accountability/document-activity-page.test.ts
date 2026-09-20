import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { expect, it, vi } from 'vitest';
import type { ActorContext } from '../access/access.types.js';
import { DatabaseContext } from '../database/database-context.js';
import { AccountabilityService } from './accountability.service.js';

it('merges Document and ordinary events into one newest-first dated page', async () => {
  // PostgreSQL is the external boundary. Its rows are already ordered within
  // each event family; the public Accountability read owns merging those pages.
  const pool = new Pool();
  const query = vi
    .spyOn(pool, 'query')
    .mockImplementation(async (query: unknown) => {
      if (
        !query ||
        typeof query !== 'object' ||
        !('text' in query) ||
        typeof query.text !== 'string'
      )
        throw new Error('Expected PostgreSQL query');
      let rows: unknown[][];
      if (query.text.includes('from "activity_log_events"'))
        rows = [
          [
            'ordinary-event',
            'company.registered',
            '2026-09-18T12:00:00.000Z',
            'user',
            'Registrar',
            'company',
            null,
            null,
            null,
            null,
            null,
            'company',
            'PRISMA-PRIM',
            null,
            null,
            null,
            {},
          ],
        ];
      else if (query.text.includes('from "document_registration_events"'))
        rows = Array.from({ length: 50 }, (_, index) => [
          `document-event-${String(50 - index).padStart(2, '0')}`,
          `document-${index}`,
          `Document ${index}`,
          'company',
          index === 49
            ? '2026-09-17T12:00:00.000Z'
            : '2026-09-19T12:00:00.000Z',
          'user',
          'Registrar',
        ]);
      else if (query.text.includes('from "document_correction_commands"'))
        rows = [];
      else if (query.text.includes('from "client_union_projections"'))
        rows = [];
      else throw new Error('Unexpected event family query');
      return {
        command: 'SELECT',
        rowCount: rows.length,
        oid: 0,
        fields: [],
        rows,
      };
    });
  const actor: ActorContext = {
    internalUserId: 'user',
    workspaceMembershipId: 'member',
    workspaceId: 'workspace',
    workspaceName: 'Workspace',
    displayName: 'Registrar',
    email: 'registrar@example.test',
    active: true,
    workspacePermissions: ['company.manage', 'client.manage'],
    activeCompany: {
      id: 'company',
      displayName: 'PRISMA-PRIM',
      clientPermissions: [],
      documentPermissions: ['document.read'],
    },
  };
  try {
    const service = new AccountabilityService(
      new DatabaseContext(drizzle(pool)),
    );
    const page = await service.listForActor(actor);
    expect(page.events).toHaveLength(50);
    expect(page.events[0]).toMatchObject({
      id: 'document-event-50',
      action: 'document.registered',
    });
    expect(page.events.at(-1)).toMatchObject({
      id: 'ordinary-event',
      action: 'company.registered',
    });
    expect(JSON.stringify(page)).not.toContain('document-event-01');
  } finally {
    query.mockRestore();
    await pool.end();
  }
});
