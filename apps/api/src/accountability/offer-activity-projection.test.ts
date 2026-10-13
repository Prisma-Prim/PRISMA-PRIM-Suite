import { describe, expect, it } from 'vitest';
import type { ActiveCompanyContext } from '../access/access.types.js';
import {
  eligibleOfferActivityActions,
  readOfferActivity,
} from './offer-activity-projection.js';

const OFFER_ID = '00000000-0000-4000-8000-0000000000a1';
const VERSION_ID = '00000000-0000-4000-8000-0000000000b2';
const FIRST_VERSION_ID = '00000000-0000-4000-8000-0000000000b1';
const SNAPSHOT_ID = '00000000-0000-4000-8000-0000000000c3';
const OWNER = {
  illustrativeReference: 7,
  opportunityId: 'opportunity-1',
  clientRequestId: 'request-1',
  companyId: 'company-1',
};
const VERSION_TARGET = {
  type: 'offer_version',
  offerVersionId: VERSION_ID,
  versionNumber: 2,
  ...OWNER,
};

function company(
  overrides: Partial<ActiveCompanyContext> = {},
): ActiveCompanyContext {
  return {
    id: 'company-1',
    displayName: 'PRISMA-PRIM',
    clientPermissions: [],
    ...overrides,
  };
}

const completeReader = {
  commercialActivityPermissions: ['commercial.activity.read'],
  commercialIntakePermissions: [
    'commercial.request.read',
    'commercial.opportunity.read',
  ],
  offerPermissions: ['commercial.offer.read'],
} satisfies Partial<ActiveCompanyContext>;

/** A version event row joined to its own Offer Version. */
function versionRow(action: string, metadata: Record<string, unknown>) {
  return {
    action,
    offerId: OFFER_ID,
    offerVersionId: VERSION_ID,
    resolvedOfferVersionId: VERSION_ID,
    versionNumber: 2,
    ...OWNER,
    metadata: {
      offerId: OFFER_ID,
      offerVersionId: VERSION_ID,
      versionNumber: 2,
      provenance: 'ILLUSTRATIVE',
      ...metadata,
    },
  };
}

const RECORDED = {
  'offer_version.created': versionRow('offer_version.created', {
    predecessorVersionNumber: 1,
    pricingSnapshotId: SNAPSHOT_ID,
    recipientKind: 'ADDITIONAL',
  }),
  'offer_version.approved': versionRow('offer_version.approved', {
    outcome: 'APPROVED',
    ruleSetVersion: 2,
    acknowledgedWarningCodes: ['RECIPIENT_TAX_ID_RECORDED'],
  }),
  'offer_version.rejected': versionRow('offer_version.rejected', {
    outcome: 'REJECTED',
  }),
  'offer_version.transmission_recorded': versionRow(
    'offer_version.transmission_recorded',
    { channel: 'SIMULATED', ruleSetVersion: 1, acknowledgedWarningCodes: [] },
  ),
  'offer_version.client_response_recorded': versionRow(
    'offer_version.client_response_recorded',
    { evidenceKind: 'SIMULATED', outcome: 'EXPIRED' },
  ),
};

/** An Offer creation row joined to the Offer's version 1. */
const createdRow = {
  action: 'offer.created',
  offerId: OFFER_ID,
  offerVersionId: null,
  resolvedOfferVersionId: FIRST_VERSION_ID,
  versionNumber: 1,
  ...OWNER,
  metadata: {
    offerId: OFFER_ID,
    illustrativeReference: 7,
    provenance: 'ILLUSTRATIVE',
  },
};

describe('Offer Activity projection rules', () => {
  it('requires the reader bundle, Offer read and the Opportunity read together', () => {
    expect(eligibleOfferActivityActions(undefined)).toEqual([]);
    expect(eligibleOfferActivityActions(company(completeReader))).toEqual([
      'offer.created',
      'offer_version.created',
      'offer_version.approved',
      'offer_version.rejected',
      'offer_version.transmission_recorded',
      'offer_version.client_response_recorded',
    ]);
    for (const partial of [
      { ...completeReader, commercialActivityPermissions: [] },
      { ...completeReader, offerPermissions: undefined },
      {
        ...completeReader,
        offerPermissions: ['commercial.offer.prepare' as const],
      },
      { ...completeReader, commercialIntakePermissions: undefined },
      {
        ...completeReader,
        commercialIntakePermissions: ['commercial.request.read' as const],
      },
      {
        ...completeReader,
        commercialIntakePermissions: ['commercial.opportunity.read' as const],
      },
    ])
      expect(eligibleOfferActivityActions(company(partial))).toEqual([]);
  });
});

describe('Offer Activity metadata', () => {
  it('projects the creation of an Offer as its reference and version 1 only', () => {
    expect(readOfferActivity(createdRow)).toEqual({
      action: 'offer.created',
      target: {
        type: 'offer_version',
        offerVersionId: FIRST_VERSION_ID,
        versionNumber: 1,
        ...OWNER,
      },
      metadata: {},
    });
  });

  it.each([
    ['offer_version.created', {}],
    ['offer_version.approved', {}],
    ['offer_version.rejected', {}],
    ['offer_version.transmission_recorded', { channel: 'SIMULATED' }],
    [
      'offer_version.client_response_recorded',
      { outcome: 'EXPIRED', evidenceKind: 'SIMULATED' },
    ],
  ] as const)(
    'projects %s with its exact version and nothing else',
    (action, metadata) => {
      expect(readOfferActivity(RECORDED[action])).toEqual({
        action,
        target: VERSION_TARGET,
        metadata,
      });
    },
  );

  it('projects version 1 without a predecessor', () => {
    const row = versionRow('offer_version.created', {
      versionNumber: 1,
      pricingSnapshotId: SNAPSHOT_ID,
      recipientKind: 'PRIMARY',
    });
    expect(readOfferActivity({ ...row, versionNumber: 1 })).toEqual({
      action: 'offer_version.created',
      target: { ...VERSION_TARGET, versionNumber: 1 },
      metadata: {},
    });
    expect(
      readOfferActivity({
        ...row,
        versionNumber: 1,
        metadata: { ...row.metadata, predecessorVersionNumber: 0 },
      }),
    ).toBeUndefined();
  });

  it('fails closed for unknown actions and rows that are not objects', () => {
    expect(readOfferActivity(null)).toBeUndefined();
    expect(readOfferActivity([createdRow])).toBeUndefined();
    expect(
      readOfferActivity({ ...createdRow, action: 'offer.deleted' }),
    ).toBeUndefined();
    expect(
      readOfferActivity({
        ...RECORDED['offer_version.approved'],
        action: 'contract_version.approved',
      }),
    ).toBeUndefined();
    expect(
      readOfferActivity({ ...createdRow, metadata: 'offer.created' }),
    ).toBeUndefined();
  });

  it.each(Object.entries(RECORDED))(
    'fails closed for %s metadata outside its recorded shape',
    (_action, row) => {
      const { metadata } = row;
      const variants: unknown[] = [
        { ...row, metadata: { ...metadata, amount: '300.00' } },
        { ...row, metadata: { ...metadata, reason: 'Hidden text' } },
        { ...row, metadata: { ...metadata, provenance: 'REAL' } },
        { ...row, metadata: { ...metadata, offerId: 'another-offer' } },
        { ...row, metadata: { ...metadata, offerVersionId: 'another' } },
        { ...row, metadata: { ...metadata, versionNumber: 3 } },
        { ...row, metadata: { ...metadata, versionNumber: '2' } },
        { ...row, offerVersionId: null },
        { ...row, resolvedOfferVersionId: FIRST_VERSION_ID },
        { ...row, resolvedOfferVersionId: null },
        { ...row, versionNumber: null },
        { ...row, opportunityId: null },
        { ...row, clientRequestId: '' },
        { ...row, illustrativeReference: 0 },
        ...Object.keys(metadata).map((field) => ({
          ...row,
          metadata: Object.fromEntries(
            Object.entries(metadata).filter(([name]) => name !== field),
          ),
        })),
      ];
      for (const variant of variants)
        expect(readOfferActivity(variant)).toBeUndefined();
    },
  );

  it('fails closed for decision, transmission and response values outside their contracts', () => {
    const approved = RECORDED['offer_version.approved'];
    const transmitted = RECORDED['offer_version.transmission_recorded'];
    const responded = RECORDED['offer_version.client_response_recorded'];
    const rejected = RECORDED['offer_version.rejected'];
    const created = RECORDED['offer_version.created'];
    for (const variant of [
      { ...approved, metadata: { ...approved.metadata, outcome: 'REJECTED' } },
      { ...approved, metadata: { ...approved.metadata, ruleSetVersion: 3 } },
      {
        ...approved,
        metadata: { ...approved.metadata, acknowledgedWarningCodes: [7] },
      },
      {
        ...approved,
        metadata: { ...approved.metadata, acknowledgedWarningCodes: 'NONE' },
      },
      {
        ...approved,
        metadata: {
          ...approved.metadata,
          acknowledgedWarningCodes: ['UNKNOWN_WARNING'],
        },
      },
      {
        ...approved,
        metadata: {
          ...approved.metadata,
          acknowledgedWarningCodes: [
            'RECIPIENT_TAX_ID_RECORDED',
            'RECIPIENT_TAX_ID_RECORDED',
          ],
        },
      },
      {
        ...transmitted,
        metadata: {
          ...transmitted.metadata,
          acknowledgedWarningCodes: ['UNKNOWN_WARNING'],
        },
      },
      {
        ...rejected,
        metadata: { ...rejected.metadata, ruleSetVersion: 1 },
      },
      { ...rejected, metadata: { ...rejected.metadata, outcome: 'APPROVED' } },
      {
        ...transmitted,
        metadata: { ...transmitted.metadata, channel: 'EMAIL' },
      },
      {
        ...responded,
        metadata: { ...responded.metadata, evidenceKind: 'SIGNED' },
      },
      {
        ...responded,
        metadata: { ...responded.metadata, outcome: 'WITHDRAWN' },
      },
      {
        ...created,
        metadata: { ...created.metadata, predecessorVersionNumber: 2 },
      },
      {
        ...created,
        metadata: { ...created.metadata, recipientKind: 'CONTACT' },
      },
      {
        ...created,
        metadata: { ...created.metadata, pricingSnapshotId: 'snapshot' },
      },
    ])
      expect(readOfferActivity(variant)).toBeUndefined();
  });

  it('fails closed for an Offer creation outside its recorded shape', () => {
    for (const variant of [
      { ...createdRow, offerVersionId: FIRST_VERSION_ID },
      { ...createdRow, resolvedOfferVersionId: null },
      { ...createdRow, resolvedOfferVersionId: VERSION_ID, versionNumber: 2 },
      { ...createdRow, versionNumber: null },
      { ...createdRow, illustrativeReference: 8 },
      {
        ...createdRow,
        metadata: { ...createdRow.metadata, versionNumber: 1 },
      },
      {
        ...createdRow,
        metadata: { ...createdRow.metadata, illustrativeReference: '7' },
      },
      {
        ...createdRow,
        metadata: { offerId: OFFER_ID, illustrativeReference: 7 },
      },
    ])
      expect(readOfferActivity(variant)).toBeUndefined();
  });
});
