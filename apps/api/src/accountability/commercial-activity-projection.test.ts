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
    ).toEqual(['client_request.created', 'client_request.client_associated']);
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
      'opportunity.outcome.changed',
      'opportunity.stage.changed',
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
      'client_request.client_associated',
      'opportunity.created',
      'opportunity.next_action.updated',
      'opportunity.responsible.changed',
      'opportunity.outcome.changed',
      'opportunity.stage.changed',
      'sales_stage.configured',
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

  describe('the outcome status change', () => {
    it('projects the previous and new status and a loss code, not the version', () => {
      expect(
        readCommercialActivity({
          action: 'opportunity.outcome.changed',
          metadata: {
            opportunityVersion: 2,
            previousStatus: 'OPEN',
            newStatus: 'ON_HOLD',
          },
        }),
      ).toEqual({
        action: 'opportunity.outcome.changed',
        metadata: { previousStatus: 'OPEN', newStatus: 'ON_HOLD' },
      });
      expect(
        readCommercialActivity({
          action: 'opportunity.outcome.changed',
          metadata: {
            opportunityVersion: 7,
            previousStatus: 'ON_HOLD',
            newStatus: 'LOST',
            lossReasonCode: 'COMPETITOR',
          },
        }),
      ).toEqual({
        action: 'opportunity.outcome.changed',
        metadata: {
          previousStatus: 'ON_HOLD',
          newStatus: 'LOST',
          lossReasonCode: 'COMPETITOR',
        },
      });
      expect(commercialActivityTargetOf('opportunity.outcome.changed')).toBe(
        'opportunity',
      );
    });

    it.each([
      ['a missing version', { previousStatus: 'OPEN', newStatus: 'WON' }],
      [
        'the first version',
        { opportunityVersion: 1, previousStatus: 'OPEN', newStatus: 'WON' },
      ],
      [
        'the current status requested again',
        { opportunityVersion: 2, previousStatus: 'OPEN', newStatus: 'OPEN' },
      ],
      [
        'a pair outside the table',
        {
          opportunityVersion: 2,
          previousStatus: 'WON',
          newStatus: 'LOST',
          lossReasonCode: 'PRICE',
        },
      ],
      [
        'an unknown status',
        { opportunityVersion: 2, previousStatus: 'OPEN', newStatus: 'CLOSED' },
      ],
      [
        'a loss without its code',
        { opportunityVersion: 2, previousStatus: 'OPEN', newStatus: 'LOST' },
      ],
      [
        'an unknown loss code',
        {
          opportunityVersion: 2,
          previousStatus: 'OPEN',
          newStatus: 'LOST',
          lossReasonCode: 'EXPENSIVE',
        },
      ],
      [
        'a loss code on another status',
        {
          opportunityVersion: 2,
          previousStatus: 'OPEN',
          newStatus: 'WON',
          lossReasonCode: 'PRICE',
        },
      ],
      [
        'reason text',
        {
          opportunityVersion: 2,
          previousStatus: 'OPEN',
          newStatus: 'ON_HOLD',
          reason: 'Budget freeze',
        },
      ],
      [
        'note text',
        {
          opportunityVersion: 2,
          previousStatus: 'OPEN',
          newStatus: 'LOST',
          lossReasonCode: 'OTHER',
          note: 'Merged',
        },
      ],
    ])('fails closed on %s', (_case, metadata) => {
      expect(
        readCommercialActivity({
          action: 'opportunity.outcome.changed',
          metadata,
        }),
      ).toBeUndefined();
    });
  });

  describe('the Sales Stage change', () => {
    const qualification = {
      salesStageId: '00000000-0000-4000-8000-000000000501',
      label: 'Qualification',
    };
    const negotiation = {
      salesStageId: '00000000-0000-4000-8000-000000000502',
      label: 'Negotiation',
    };

    it('projects the previous and new captured labels, not the version or identifiers', () => {
      expect(
        readCommercialActivity({
          action: 'opportunity.stage.changed',
          metadata: {
            opportunityVersion: 3,
            previousStage: qualification,
            newStage: negotiation,
          },
        }),
      ).toEqual({
        action: 'opportunity.stage.changed',
        metadata: { previousLabel: 'Qualification', newLabel: 'Negotiation' },
      });
      expect(
        readCommercialActivity({
          action: 'opportunity.stage.changed',
          metadata: {
            opportunityVersion: 2,
            previousStage: null,
            newStage: qualification,
          },
        }),
      ).toEqual({
        action: 'opportunity.stage.changed',
        metadata: { previousLabel: null, newLabel: 'Qualification' },
      });
      expect(
        readCommercialActivity({
          action: 'opportunity.stage.changed',
          metadata: {
            opportunityVersion: 4,
            previousStage: negotiation,
            newStage: null,
          },
        }),
      ).toEqual({
        action: 'opportunity.stage.changed',
        metadata: { previousLabel: 'Negotiation', newLabel: null },
      });
      expect(commercialActivityTargetOf('opportunity.stage.changed')).toBe(
        'opportunity',
      );
    });

    it.each([
      ['a missing version', { previousStage: null, newStage: qualification }],
      [
        'the first version',
        { opportunityVersion: 1, previousStage: null, newStage: qualification },
      ],
      ['a missing side', { opportunityVersion: 2, newStage: qualification }],
      [
        'no stage on either side',
        { opportunityVersion: 2, previousStage: null, newStage: null },
      ],
      [
        'the same stage on both sides',
        {
          opportunityVersion: 2,
          previousStage: qualification,
          newStage: qualification,
        },
      ],
      [
        'a blank label',
        {
          opportunityVersion: 2,
          previousStage: null,
          newStage: { ...qualification, label: '  ' },
        },
      ],
      [
        'an overlong label',
        {
          opportunityVersion: 2,
          previousStage: null,
          newStage: { ...qualification, label: 'x'.repeat(81) },
        },
      ],
      [
        'an extra stage field',
        {
          opportunityVersion: 2,
          previousStage: null,
          newStage: { ...qualification, position: 1 },
        },
      ],
      [
        'an extra key',
        {
          opportunityVersion: 2,
          previousStage: null,
          newStage: qualification,
          nextAction: 'Call back',
        },
      ],
    ])('fails closed on %s', (_case, metadata) => {
      expect(
        readCommercialActivity({
          action: 'opportunity.stage.changed',
          metadata,
        }),
      ).toBeUndefined();
    });
  });

  describe('the Sales Stage configuration', () => {
    it('projects the operation and label, not the revision, for a Sales Stage list reader', () => {
      expect(
        readCommercialActivity({
          action: 'sales_stage.configured',
          metadata: {
            operation: 'CREATED',
            configurationRevision: 1,
            label: 'Qualification',
          },
        }),
      ).toEqual({
        action: 'sales_stage.configured',
        metadata: { operation: 'CREATED', label: 'Qualification' },
      });
      expect(commercialActivityTargetOf('sales_stage.configured')).toBe(
        'sales_stage',
      );
      // The stage list is read with both Commercial Intake reads.
      for (const commercialIntakePermissions of [
        ['commercial.request.read' as const],
        ['commercial.opportunity.read' as const],
      ])
        expect(
          eligibleCommercialActions(
            company({
              commercialActivityPermissions: ['commercial.activity.read'],
              commercialIntakePermissions,
            }),
          ),
        ).not.toContain('sales_stage.configured');
    });

    it('projects an 80-emoji label, counted in characters', () => {
      const label = '🚀'.repeat(80);
      expect(
        readCommercialActivity({
          action: 'sales_stage.configured',
          metadata: { operation: 'CREATED', configurationRevision: 1, label },
        }),
      ).toEqual({
        action: 'sales_stage.configured',
        metadata: { operation: 'CREATED', label },
      });
    });

    it.each([
      ['a missing revision', { operation: 'CREATED', label: 'Qualification' }],
      [
        'revision 0',
        { operation: 'CREATED', configurationRevision: 0, label: 'Q' },
      ],
      [
        'a later operation',
        {
          operation: 'RENAMED',
          configurationRevision: 2,
          label: 'Qualification',
        },
      ],
      [
        'a blank label',
        { operation: 'CREATED', configurationRevision: 1, label: ' ' },
      ],
      [
        'an extra key',
        {
          operation: 'CREATED',
          configurationRevision: 1,
          label: 'Qualification',
          position: 1,
        },
      ],
    ])('fails closed on %s', (_case, metadata) => {
      expect(
        readCommercialActivity({ action: 'sales_stage.configured', metadata }),
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
