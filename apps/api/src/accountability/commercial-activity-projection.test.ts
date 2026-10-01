import { describe, expect, it } from 'vitest';
import type { ActiveCompanyContext } from '../access/access.types.js';
import {
  commercialActivityTarget,
  commercialActivityTargetOf,
  eligibleCommercialActions,
  readCommercialActivity,
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
    ).toEqual([
      'opportunity.created',
      'opportunity.next_action.updated',
      'opportunity.responsible.changed',
    ]);
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
      'opportunity.responsible.changed',
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

  describe('the responsible-actor change', () => {
    const before = {
      workspaceMembershipId: '00000000-0000-4000-8000-000000000401',
      displayLabel: 'Ada Ionescu · 1A',
    };
    const after = {
      workspaceMembershipId: '00000000-0000-4000-8000-000000000402',
      displayLabel: 'Ion Popa · 2B',
    };

    it('projects the previous and new responsible actor, not the version', () => {
      expect(
        readCommercialActivity({
          action: 'opportunity.responsible.changed',
          metadata: { opportunityVersion: 2, before, after },
        }),
      ).toEqual({
        action: 'opportunity.responsible.changed',
        metadata: { before, after },
      });
      expect(
        readCommercialActivity({
          action: 'opportunity.next_action.updated',
          metadata: { opportunityVersion: 3 },
        }),
      ).toEqual({ action: 'opportunity.next_action.updated', metadata: {} });
    });

    it('requires Opportunity read like every other Opportunity event', () => {
      expect(
        eligibleCommercialActions(
          company({
            commercialActivityPermissions: ['commercial.activity.read'],
            commercialIntakePermissions: ['commercial.request.read'],
          }),
        ),
      ).not.toContain('opportunity.responsible.changed');
      expect(
        commercialActivityTargetOf('opportunity.responsible.changed'),
      ).toBe('opportunity');
    });

    it.each([
      ['a missing version', { before, after }],
      ['the first version', { opportunityVersion: 1, before, after }],
      ['a text version', { opportunityVersion: '2', before, after }],
      ['a fractional version', { opportunityVersion: 2.5, before, after }],
      [
        'an extra key',
        { opportunityVersion: 2, before, after, nextAction: 'Call back' },
      ],
      ['a missing side', { opportunityVersion: 2, after }],
      ['a null side', { opportunityVersion: 2, before: null, after }],
      [
        'an extra side field',
        {
          opportunityVersion: 2,
          before: { ...before, email: 'ada@example.test' },
          after,
        },
      ],
      [
        'a blank label',
        {
          opportunityVersion: 2,
          before: { ...before, displayLabel: ' ' },
          after,
        },
      ],
      [
        'an untyped membership',
        {
          opportunityVersion: 2,
          before,
          after: { ...after, workspaceMembershipId: 402 },
        },
      ],
      [
        'the same member on both sides',
        { opportunityVersion: 2, before, after: before },
      ],
      ['version-only metadata', { opportunityVersion: 2 }],
    ])('fails closed on %s', (_case, metadata) => {
      expect(
        readCommercialActivity({
          action: 'opportunity.responsible.changed',
          metadata,
        }),
      ).toBeUndefined();
    });

    it('never accepts responsible-actor metadata for another action', () => {
      expect(
        readCommercialActivity({
          action: 'opportunity.next_action.updated',
          metadata: { opportunityVersion: 2, before, after },
        }),
      ).toBeUndefined();
    });
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
    expect(commercialActivityTargetOf('opportunity.responsible.changed')).toBe(
      'opportunity',
    );
  });
});
