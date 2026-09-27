import { describe, expect, it } from 'vitest';
import type { ActiveCompanyContext } from '../access/access.types.js';
import {
  commercialActivityTarget,
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
    ).toEqual(['client_request.created', 'client_request.client_associated']);
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
      'client_request.client_associated',
      'opportunity.created',
      'opportunity.next_action.updated',
    ]);
  });

  it('projects the exact metadata each producer records', () => {
    expect(
      readCommercialActivityAction({
        action: 'client_request.created',
        metadata: { requestVersion: 1 },
      }),
    ).toBe('client_request.created');
    expect(
      readCommercialActivityAction({
        action: 'client_request.client_associated',
        metadata: { requestVersion: 2 },
      }),
    ).toBe('client_request.client_associated');
    expect(
      readCommercialActivityAction({
        action: 'opportunity.created',
        metadata: { opportunityVersion: 1 },
      }),
    ).toBe('opportunity.created');
    // The next-action update records its resulting Opportunity version only.
    for (const opportunityVersion of [2, 37])
      expect(
        readCommercialActivityAction({
          action: 'opportunity.next_action.updated',
          metadata: { opportunityVersion },
        }),
      ).toBe('opportunity.next_action.updated');
  });

  it('fails closed on an unknown action', () => {
    for (const row of [
      undefined,
      null,
      'client_request.created',
      ['client_request.created'],
      { action: 'client_request.deleted', metadata: { requestVersion: 1 } },
      { action: 'opportunity.archived', metadata: { opportunityVersion: 1 } },
      { action: 'CLIENT_REQUEST.CREATED', metadata: { requestVersion: 1 } },
      { action: undefined, metadata: { requestVersion: 1 } },
      { action: null, metadata: { requestVersion: 1 } },
      { metadata: { requestVersion: 1 } },
    ])
      expect(readCommercialActivityAction(row)).toBeUndefined();
  });

  it('fails closed on malformed, empty or foreign metadata', () => {
    for (const metadata of [
      undefined,
      null,
      {},
      [],
      [1],
      'opportunityVersion',
      1,
      { opportunityVersion: 1 },
      { requestVersion: 1, opportunityVersion: 1 },
      { requestVersion: 1, nextAction: 'Arrange a qualification call' },
      { RequestVersion: 1 },
    ])
      expect(
        readCommercialActivityAction({
          action: 'client_request.created',
          metadata,
        }),
      ).toBeUndefined();
  });

  it('fails closed on a wrongly typed or invalid recorded version', () => {
    for (const opportunityVersion of [
      '1',
      true,
      null,
      undefined,
      0,
      -1,
      1.5,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      [1],
      { version: 1 },
    ])
      expect(
        readCommercialActivityAction({
          action: 'opportunity.created',
          metadata: { opportunityVersion },
        }),
      ).toBeUndefined();
    // Both creation events record version 1 exactly, in the producer and in the
    // `commercial_intake_events_action_metadata_check` constraint.
    expect(
      readCommercialActivityAction({
        action: 'opportunity.created',
        metadata: { opportunityVersion: 2 },
      }),
    ).toBeUndefined();
    expect(
      readCommercialActivityAction({
        action: 'client_request.created',
        metadata: { requestVersion: 2 },
      }),
    ).toBeUndefined();
    expect(
      readCommercialActivityAction({
        action: 'opportunity.next_action.updated',
        metadata: { opportunityVersion: 1 },
      }),
    ).toBeUndefined();
  });

  describe('the disclosed target reference', () => {
    const recorded = {
      companyId: '00000000-0000-4000-8000-000000000001',
      clientRequestId: '00000000-0000-4000-8000-000000000358',
      opportunityId: '00000000-0000-4000-8000-000000000359',
    };
    const reader = (
      commercialIntakePermissions: ActiveCompanyContext['commercialIntakePermissions'],
    ) =>
      company({
        commercialActivityPermissions: ['commercial.activity.read'],
        commercialIntakePermissions,
      });

    it('carries the Request id of a Request event', () => {
      expect(
        commercialActivityTarget(
          reader(['commercial.request.read']),
          'client_request.created',
          recorded,
        ),
      ).toEqual({
        type: 'client_request',
        clientRequestId: recorded.clientRequestId,
        companyId: recorded.companyId,
      });
    });

    it('derives the containing Request id of an Opportunity event for a current Request reader', () => {
      for (const action of [
        'opportunity.created',
        'opportunity.next_action.updated',
      ] as const)
        expect(
          commercialActivityTarget(
            reader(['commercial.request.read', 'commercial.opportunity.read']),
            action,
            recorded,
          ),
        ).toEqual({
          type: 'opportunity',
          opportunityId: recorded.opportunityId,
          clientRequestId: recorded.clientRequestId,
          companyId: recorded.companyId,
        });
    });

    it('withholds the containing Request id from an Opportunity reader without Request read', () => {
      for (const action of [
        'opportunity.created',
        'opportunity.next_action.updated',
      ] as const) {
        const target = commercialActivityTarget(
          reader(['commercial.opportunity.read']),
          action,
          recorded,
        );
        expect(target).toEqual({
          type: 'opportunity',
          opportunityId: recorded.opportunityId,
          companyId: recorded.companyId,
        });
        expect(target).not.toHaveProperty('clientRequestId');
      }
    });
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
