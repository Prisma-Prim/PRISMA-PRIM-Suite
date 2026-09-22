import { describe, expect, it } from 'vitest';
import type { ActiveCompanyContext } from '../access/access.types.js';
import {
  commercialActivityTargetOf,
  eligibleCommercialActions,
  readCommercialActivityAction,
} from './commercial-activity-projection.js';

function company(
  overrides: Partial<ActiveCompanyContext> = {},
): ActiveCompanyContext {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    displayName: 'PRISMA-PRIM',
    clientPermissions: [],
    ...overrides,
  };
}

describe('commercial Activity projection rules', () => {
  it('requires the opt-in reader bundle', () => {
    expect(eligibleCommercialActions(undefined)).toEqual([]);
    expect(
      eligibleCommercialActions(
        company({
          commercialIntakePermissions: [
            'commercial.request.read',
            'commercial.opportunity.read',
          ],
        }),
      ),
    ).toEqual([]);
  });

  it('requires current read authority for each event target', () => {
    expect(
      eligibleCommercialActions(
        company({
          commercialActivityPermissions: ['commercial.activity.read'],
        }),
      ),
    ).toEqual([]);
    expect(
      eligibleCommercialActions(
        company({
          commercialActivityPermissions: ['commercial.activity.read'],
          commercialIntakePermissions: ['commercial.request.read'],
        }),
      ),
    ).toEqual(['client_request.created']);
    expect(
      eligibleCommercialActions(
        company({
          commercialActivityPermissions: ['commercial.activity.read'],
          commercialIntakePermissions: ['commercial.opportunity.read'],
        }),
      ),
    ).toEqual(['opportunity.created', 'opportunity.next_action.updated']);
  });

  it('projects every known action for a complete reader', () => {
    expect(
      eligibleCommercialActions(
        company({
          commercialActivityPermissions: ['commercial.activity.read'],
          commercialIntakePermissions: [
            'commercial.request.read',
            'commercial.request.create',
            'commercial.opportunity.read',
            'commercial.opportunity.create',
          ],
        }),
      ),
    ).toEqual([
      'client_request.created',
      'opportunity.created',
      'opportunity.next_action.updated',
    ]);
  });

  it('fails closed on an unknown action or malformed metadata', () => {
    expect(
      readCommercialActivityAction({
        action: 'client_request.created',
        metadata: { requestVersion: 1 },
      }),
    ).toBe('client_request.created');
    for (const row of [
      undefined,
      null,
      'client_request.created',
      { action: 'client_request.deleted', metadata: {} },
      { action: 'opportunity.archived', metadata: {} },
      { action: undefined, metadata: {} },
      { action: 'opportunity.created', metadata: null },
      { action: 'opportunity.created', metadata: 'opportunityVersion' },
      { action: 'opportunity.created', metadata: [1] },
    ])
      expect(readCommercialActivityAction(row)).toBeUndefined();
  });

  it('maps every known action to the target it discloses', () => {
    expect(commercialActivityTargetOf('client_request.created')).toBe(
      'client_request',
    );
    expect(commercialActivityTargetOf('opportunity.created')).toBe(
      'opportunity',
    );
    expect(commercialActivityTargetOf('opportunity.next_action.updated')).toBe(
      'opportunity',
    );
  });
});
