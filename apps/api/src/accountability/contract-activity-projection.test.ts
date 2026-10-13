import { describe, expect, it } from 'vitest';
import type { ActiveCompanyContext } from '../access/access.types.js';
import {
  eligibleContractActivityActions,
  readContractActivity,
} from './contract-activity-projection.js';

const CONTRACT_ID = '00000000-0000-4000-8000-0000000000a1';
const VERSION_ID = '00000000-0000-4000-8000-0000000000b2';
const FIRST_VERSION_ID = '00000000-0000-4000-8000-0000000000b1';
const SNAPSHOT_ID = '00000000-0000-4000-8000-0000000000c3';
const OFFER_VERSION_ID = '00000000-0000-4000-8000-0000000000d4';
const PARENT_ID = '00000000-0000-4000-8000-0000000000e5';
const PROJECT_ID = '00000000-0000-4000-8000-0000000000f6';
const OWNER = {
  opportunityId: 'opportunity-1',
  clientRequestId: 'request-1',
  companyId: 'company-1',
};

const ALL_ACTIONS = [
  'contract.created',
  'contract_version.created',
  'contract_version.approved',
  'contract_version.rejected',
  'contract_version.signature_recorded',
  'contract_project.linked',
];

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

const contractReader = {
  commercialActivityPermissions: ['commercial.activity.read'],
  commercialIntakePermissions: [
    'commercial.request.read',
    'commercial.opportunity.read',
  ],
  contractPermissions: ['commercial.contract.read'],
} satisfies Partial<ActiveCompanyContext>;

const projectReader = {
  ...contractReader,
  projectPermissions: ['project.read'],
  clientPermissions: ['client.read'],
} satisfies Partial<ActiveCompanyContext>;

/** The recorded source metadata of each kind and origin (section 19.12). */
const SOURCES = {
  ACCEPTED_CONTRACT: {
    kind: 'CONTRACT',
    origin: 'ACCEPTED_OFFER',
    offerVersionId: OFFER_VERSION_ID,
  },
  DIRECT_CONTRACT: { kind: 'CONTRACT', origin: 'DIRECT' },
  PRECONTRACT: {
    kind: 'PRECONTRACT',
    origin: 'ACCEPTED_OFFER',
    offerVersionId: OFFER_VERSION_ID,
  },
  ADDENDUM: {
    kind: 'ADDENDUM',
    parentContractId: PARENT_ID,
    addendumOrdinal: 2,
  },
} as const;

type Source = (typeof SOURCES)[keyof typeof SOURCES];

/** The resolved Contract, owner and Contract Version of one row. */
function resolved(source: Source, versionId: string, versionNumber: number) {
  return {
    contractId: CONTRACT_ID,
    kind: source.kind,
    illustrativeReference: 7,
    resolvedContractVersionId: versionId,
    versionNumber,
    executionState: 'NOT_EXECUTED',
    projectId: null,
    projectTitle: null,
    ...OWNER,
  };
}

function target(source: Source, versionId: string, versionNumber: number) {
  return {
    type: 'contract_version',
    contractId: CONTRACT_ID,
    contractVersionId: versionId,
    kind: source.kind,
    illustrativeReference: 7,
    versionNumber,
    ...OWNER,
  };
}

/** A version event row joined to its own Contract Version 2. */
function versionRow(
  action: string,
  source: Source,
  metadata: Record<string, unknown>,
) {
  return {
    action,
    contractVersionId: VERSION_ID,
    ...resolved(source, VERSION_ID, 2),
    metadata: {
      contractId: CONTRACT_ID,
      contractVersionId: VERSION_ID,
      versionNumber: 2,
      ...source,
      provenance: 'ILLUSTRATIVE',
      pricingSnapshotId: SNAPSHOT_ID,
      ...metadata,
    },
  };
}

function recorded(source: Source) {
  return {
    'contract_version.created': versionRow('contract_version.created', source, {
      predecessorVersionNumber: 1,
    }),
    'contract_version.approved': versionRow(
      'contract_version.approved',
      source,
      {
        ruleSetVersion: 2,
        acknowledgedWarningCodes: [
          'ADDED_CONDITIONS_CONFIRMED',
          'DIRECT_ORIGIN_REVIEWED',
        ],
      },
    ),
    'contract_version.rejected': versionRow(
      'contract_version.rejected',
      source,
      {},
    ),
    'contract_version.signature_recorded': versionRow(
      'contract_version.signature_recorded',
      source,
      {
        ruleSetVersion: 1,
        acknowledgedWarningCodes: [],
        evidenceKind: 'SIMULATED',
      },
    ),
  };
}

/** A Contract creation row joined to its version 1. */
function createdRow(source: Source) {
  return {
    action: 'contract.created',
    contractVersionId: null,
    ...resolved(source, FIRST_VERSION_ID, 1),
    metadata: {
      contractId: CONTRACT_ID,
      ...source,
      provenance: 'ILLUSTRATIVE',
      illustrativeReference: 7,
    },
  };
}

/** A Project link row joined to the executed version and readable Project. */
const linkedRow = {
  action: 'contract_project.linked',
  contractVersionId: null,
  ...resolved(SOURCES.ACCEPTED_CONTRACT, VERSION_ID, 2),
  executionState: 'EXECUTED',
  projectId: PROJECT_ID,
  projectTitle: 'Synthetic Project',
  metadata: { contractId: CONTRACT_ID, projectId: PROJECT_ID, created: true },
};

describe('Contract Activity projection rules', () => {
  it('requires the reader bundle, Contract read and the Opportunity read together', () => {
    expect(
      eligibleContractActivityActions({ workspacePermissions: [] }),
    ).toEqual([]);
    expect(
      eligibleContractActivityActions({
        activeCompany: company(projectReader),
        workspacePermissions: [],
      }),
    ).toEqual(ALL_ACTIONS);
    for (const partial of [
      { ...projectReader, commercialActivityPermissions: [] },
      { ...projectReader, contractPermissions: undefined },
      {
        ...projectReader,
        contractPermissions: ['commercial.contract.prepare' as const],
      },
      { ...projectReader, commercialIntakePermissions: undefined },
      {
        ...projectReader,
        commercialIntakePermissions: ['commercial.request.read' as const],
      },
      {
        ...projectReader,
        commercialIntakePermissions: ['commercial.opportunity.read' as const],
      },
    ])
      expect(
        eligibleContractActivityActions({
          activeCompany: company(partial),
          workspacePermissions: ['client.manage'],
        }),
      ).toEqual([]);
  });

  it('adds the Project link only with Project read and Client read', () => {
    const withoutLink = ALL_ACTIONS.filter(
      (action) => action !== 'contract_project.linked',
    );
    for (const reader of [
      contractReader,
      { ...projectReader, projectPermissions: [] },
      { ...projectReader, projectPermissions: ['project.create' as const] },
      { ...projectReader, clientPermissions: [] },
    ])
      expect(
        eligibleContractActivityActions({
          activeCompany: company(reader),
          workspacePermissions: [],
        }),
      ).toEqual(withoutLink);
    expect(
      eligibleContractActivityActions({
        activeCompany: company({ ...projectReader, clientPermissions: [] }),
        workspacePermissions: ['client.manage'],
      }),
    ).toEqual(ALL_ACTIONS);
  });
});

describe('Contract Activity metadata', () => {
  it.each(Object.entries(SOURCES))(
    'projects the creation of a %s as its kind, reference and version 1 only',
    (_name, source) => {
      expect(readContractActivity(createdRow(source))).toEqual({
        action: 'contract.created',
        target: target(source, FIRST_VERSION_ID, 1),
        metadata: {},
      });
    },
  );

  it.each(
    Object.entries(SOURCES).flatMap(([name, source]) =>
      Object.entries(recorded(source)).map(
        ([action, row]) => [action, name, source, row] as const,
      ),
    ),
  )(
    'projects %s of a %s with its exact version',
    (action, _name, source, row) => {
      expect(readContractActivity(row)).toEqual({
        action,
        target: target(source, VERSION_ID, 2),
        metadata:
          action === 'contract_version.signature_recorded'
            ? { evidenceKind: 'SIMULATED' }
            : {},
      });
    },
  );

  it('projects a version without a Snapshot and version 1 without a predecessor', () => {
    const source = SOURCES.ADDENDUM;
    const withoutSnapshot = versionRow('contract_version.rejected', source, {});
    const metadata = Object.fromEntries(
      Object.entries(withoutSnapshot.metadata).filter(
        ([field]) => field !== 'pricingSnapshotId',
      ),
    );
    expect(readContractActivity({ ...withoutSnapshot, metadata })).toEqual({
      action: 'contract_version.rejected',
      target: target(source, VERSION_ID, 2),
      metadata: {},
    });
    const first = {
      ...versionRow('contract_version.created', source, { versionNumber: 1 }),
      versionNumber: 1,
    };
    expect(readContractActivity(first)).toEqual({
      action: 'contract_version.created',
      target: target(source, VERSION_ID, 1),
      metadata: {},
    });
    expect(
      readContractActivity({
        ...first,
        metadata: { ...first.metadata, predecessorVersionNumber: 0 },
      }),
    ).toBeUndefined();
  });

  it('projects a Project link on the executed version with the creation flag and Project reference only', () => {
    expect(readContractActivity(linkedRow)).toEqual({
      action: 'contract_project.linked',
      target: target(SOURCES.ACCEPTED_CONTRACT, VERSION_ID, 2),
      metadata: {
        created: true,
        project: { projectId: PROJECT_ID, projectTitle: 'Synthetic Project' },
      },
    });
    expect(
      readContractActivity({
        ...linkedRow,
        metadata: { ...linkedRow.metadata, created: false },
      }),
    ).toMatchObject({ metadata: { created: false } });
  });

  it('fails closed for unknown actions and rows that are not objects', () => {
    const created = createdRow(SOURCES.ACCEPTED_CONTRACT);
    expect(readContractActivity(null)).toBeUndefined();
    expect(readContractActivity([created])).toBeUndefined();
    expect(
      readContractActivity({ ...created, action: 'contract.deleted' }),
    ).toBeUndefined();
    expect(
      readContractActivity({ ...created, action: 'project.created' }),
    ).toBeUndefined();
    expect(
      readContractActivity({
        ...recorded(SOURCES.ACCEPTED_CONTRACT)['contract_version.approved'],
        action: 'offer_version.approved',
      }),
    ).toBeUndefined();
    expect(
      readContractActivity({ ...created, metadata: 'contract.created' }),
    ).toBeUndefined();
  });

  it.each(
    Object.entries(SOURCES).flatMap(([name, source]) =>
      Object.entries(recorded(source)).map(
        ([action, row]) => [action, name, row] as const,
      ),
    ),
  )(
    'fails closed for %s of a %s outside its recorded shape',
    (_action, _name, row) => {
      const { metadata } = row;
      const variants: unknown[] = [
        { ...row, metadata: { ...metadata, amount: '300.00' } },
        { ...row, metadata: { ...metadata, reason: 'Hidden text' } },
        { ...row, metadata: { ...metadata, note: 'Hidden note' } },
        { ...row, metadata: { ...metadata, signatoryLabel: 'Hidden' } },
        { ...row, metadata: { ...metadata, provenance: 'REAL' } },
        { ...row, metadata: { ...metadata, contractId: PARENT_ID } },
        { ...row, metadata: { ...metadata, contractVersionId: PARENT_ID } },
        { ...row, metadata: { ...metadata, versionNumber: 3 } },
        { ...row, metadata: { ...metadata, versionNumber: '2' } },
        { ...row, metadata: { ...metadata, kind: 'LEASE' } },
        { ...row, metadata: { ...metadata, pricingSnapshotId: 'snapshot' } },
        { ...row, metadata: { ...metadata, illustrativeReference: 7 } },
        { ...row, contractVersionId: null },
        { ...row, resolvedContractVersionId: FIRST_VERSION_ID },
        { ...row, resolvedContractVersionId: null },
        { ...row, versionNumber: null },
        { ...row, kind: null },
        { ...row, illustrativeReference: 0 },
        { ...row, contractId: null },
        { ...row, opportunityId: null },
        { ...row, clientRequestId: '' },
        { ...row, companyId: undefined },
        ...Object.keys(metadata)
          .filter((field) => field !== 'pricingSnapshotId')
          .map((field) => ({
            ...row,
            metadata: Object.fromEntries(
              Object.entries(metadata).filter(([name]) => name !== field),
            ),
          })),
      ];
      for (const variant of variants)
        expect(readContractActivity(variant)).toBeUndefined();
    },
  );

  it('fails closed for sources, decisions and signatures outside their contracts', () => {
    const { ACCEPTED_CONTRACT, DIRECT_CONTRACT, PRECONTRACT, ADDENDUM } =
      SOURCES;
    const approved = recorded(ACCEPTED_CONTRACT)['contract_version.approved'];
    const rejected = recorded(ACCEPTED_CONTRACT)['contract_version.rejected'];
    const signed =
      recorded(ACCEPTED_CONTRACT)['contract_version.signature_recorded'];
    const created = recorded(ACCEPTED_CONTRACT)['contract_version.created'];
    const direct = recorded(DIRECT_CONTRACT)['contract_version.rejected'];
    const precontract = recorded(PRECONTRACT)['contract_version.rejected'];
    const addendum = recorded(ADDENDUM)['contract_version.rejected'];
    for (const variant of [
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
          acknowledgedWarningCodes: ['Any non-empty text'],
        },
      },
      {
        ...approved,
        metadata: {
          ...approved.metadata,
          // An error-severity code is never acknowledged.
          acknowledgedWarningCodes: ['PARTY_TAX_ID_RECORDED'],
        },
      },
      {
        ...approved,
        metadata: {
          ...approved.metadata,
          // An Offer warning is outside the Contract vocabulary.
          acknowledgedWarningCodes: ['RECIPIENT_TAX_ID_RECORDED'],
        },
      },
      {
        ...approved,
        metadata: {
          ...approved.metadata,
          acknowledgedWarningCodes: [
            'DIRECT_ORIGIN_REVIEWED',
            'DIRECT_ORIGIN_REVIEWED',
          ],
        },
      },
      {
        ...signed,
        metadata: {
          ...signed.metadata,
          acknowledgedWarningCodes: ['TERM_END_NOT_PASSED', 'UNKNOWN_CODE'],
        },
      },
      { ...approved, metadata: { ...approved.metadata, outcome: 'APPROVED' } },
      { ...rejected, metadata: { ...rejected.metadata, ruleSetVersion: 1 } },
      {
        ...rejected,
        metadata: { ...rejected.metadata, evidenceKind: 'SIMULATED' },
      },
      { ...signed, metadata: { ...signed.metadata, evidenceKind: 'SIGNED' } },
      {
        ...created,
        metadata: { ...created.metadata, predecessorVersionNumber: 2 },
      },
      {
        ...created,
        metadata: { ...created.metadata, ruleSetVersion: 1 },
      },
      {
        ...direct,
        metadata: { ...direct.metadata, offerVersionId: OFFER_VERSION_ID },
      },
      { ...direct, metadata: { ...direct.metadata, origin: 'IMPORTED' } },
      {
        ...precontract,
        metadata: { ...precontract.metadata, origin: 'DIRECT' },
      },
      {
        ...precontract,
        metadata: { ...precontract.metadata, offerVersionId: 'offer' },
      },
      {
        ...addendum,
        metadata: { ...addendum.metadata, origin: 'ACCEPTED_OFFER' },
      },
      {
        ...addendum,
        metadata: { ...addendum.metadata, addendumOrdinal: 0 },
      },
      {
        ...addendum,
        metadata: { ...addendum.metadata, parentContractId: 'parent' },
      },
      // The recorded kind must be the resolved Contract's kind.
      { ...addendum, kind: 'CONTRACT' },
      { ...precontract, kind: 'ADDENDUM' },
    ])
      expect(readContractActivity(variant)).toBeUndefined();
  });

  it('fails closed for a Contract creation outside its recorded shape', () => {
    const row = createdRow(SOURCES.ACCEPTED_CONTRACT);
    for (const variant of [
      { ...row, contractVersionId: FIRST_VERSION_ID },
      { ...row, resolvedContractVersionId: null },
      { ...row, resolvedContractVersionId: VERSION_ID, versionNumber: 2 },
      { ...row, versionNumber: null },
      { ...row, illustrativeReference: 8 },
      { ...row, metadata: { ...row.metadata, versionNumber: 1 } },
      { ...row, metadata: { ...row.metadata, illustrativeReference: '7' } },
      { ...row, metadata: { ...row.metadata, pricingSnapshotId: SNAPSHOT_ID } },
      {
        ...row,
        metadata: {
          contractId: CONTRACT_ID,
          ...SOURCES.ACCEPTED_CONTRACT,
          illustrativeReference: 7,
        },
      },
    ])
      expect(readContractActivity(variant)).toBeUndefined();
  });

  it('fails closed for a Project link outside its recorded shape or unresolved', () => {
    for (const variant of [
      { ...linkedRow, contractVersionId: VERSION_ID },
      { ...linkedRow, executionState: 'NOT_EXECUTED' },
      { ...linkedRow, resolvedContractVersionId: null },
      { ...linkedRow, projectId: null },
      { ...linkedRow, projectTitle: null },
      { ...linkedRow, projectId: PARENT_ID },
      { ...linkedRow, metadata: { ...linkedRow.metadata, created: 'true' } },
      {
        ...linkedRow,
        metadata: { ...linkedRow.metadata, contractId: PARENT_ID },
      },
      {
        ...linkedRow,
        metadata: { ...linkedRow.metadata, kind: 'CONTRACT' },
      },
      {
        ...linkedRow,
        metadata: { contractId: CONTRACT_ID, projectId: PROJECT_ID },
      },
      {
        ...linkedRow,
        metadata: { contractId: CONTRACT_ID, created: false },
      },
    ])
      expect(readContractActivity(variant)).toBeUndefined();
  });
});
