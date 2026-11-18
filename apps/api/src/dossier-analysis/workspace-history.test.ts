import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { describe, expect, it, vi } from 'vitest';
import {
  parseInternalUserId,
  parseWorkspaceId,
} from '../access/access-identifiers.js';
import type { ActorContext } from '../access/access.types.js';
import { DatabaseContext } from '../database/database-context.js';
import { DossierAnalysisService } from './dossier-analysis.service.js';
import { DossierHistoryService } from './history.service.js';
import { DossierInventoryService } from './inventory.service.js';
import { DossierRunService } from './run.service.js';
import { DossierSourceService } from './source.service.js';
import { DossierSuggestionService } from './suggestion.service.js';

const actor: ActorContext = {
  internalUserId: parseInternalUserId('11111111-1111-4111-8111-111111111111'),
  workspaceMembershipId: 'membership',
  workspaceId: parseWorkspaceId('22222222-2222-4222-8222-222222222222'),
  workspaceName: 'Workspace',
  displayName: 'Reader',
  email: 'reader@example.test',
  active: true,
  workspacePermissions: [],
};
const projectId = '33333333-3333-4333-8333-333333333333';
describe('workspace history orchestration', () => {
  it('captures the current source set once for the whole history page', async () => {
    const current = {
      selected: [],
      missing: [],
      documents: [],
      identity: 'a'.repeat(64),
    };
    const capture = vi.fn(async () => current);
    const runs = Array.from({ length: 5 }, (_, i) => ({
      id: String(i),
      snapshotHash: 'b'.repeat(64),
      createdAt: '2025-01-01T00:00:00.000Z',
      stale: false,
    }));
    const page = vi.fn(async () => ({ runs, runsNextCursor: 'continuation' }));
    const module = await Test.createTestingModule({
      providers: [
        DossierAnalysisService,
        {
          provide: DatabaseContext,
          useValue: {
            transaction: async (work: () => Promise<unknown>) => work(),
          },
        },
        {
          provide: DossierRunService,
          useValue: { captureWithinTransaction: capture },
        },
        {
          provide: DossierHistoryService,
          useValue: { pageWithinTransaction: page },
        },
        { provide: DossierSourceService, useValue: {} },
        { provide: DossierSuggestionService, useValue: {} },
        { provide: DossierInventoryService, useValue: {} },
      ],
    }).compile();
    const service = module.get(DossierAnalysisService);
    const result = await service.workspace(actor, projectId);
    expect(result.runs).toHaveLength(5);
    expect(capture).toHaveBeenCalledTimes(1);
    expect(page).toHaveBeenCalledExactlyOnceWith(
      actor,
      projectId,
      null,
      current,
    );
    page.mockRejectedValueOnce(new NotFoundException());
    await expect(service.workspace(actor, projectId)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await module.close();
  });
});
