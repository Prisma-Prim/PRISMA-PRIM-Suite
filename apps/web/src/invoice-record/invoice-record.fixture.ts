import type { ActorContext } from '../access-types';
import { deterministicBrowserIdentity } from '../access-composition';
import type {
  InvoiceCurrent,
  InvoiceSource,
  InvoiceSummary,
} from './invoice-record-contract';
import type { InvoiceRevision } from './invoice-record-history';
import type { InvoiceValues } from './invoice-record-values';

export const ids = {
  company: '10000000-0000-4000-8000-000000000001',
  membership: '10000000-0000-4000-8000-000000000002',
  user: '10000000-0000-4000-8000-000000000003',
  workspace: '10000000-0000-4000-8000-000000000004',
  recorder: '10000000-0000-4000-8000-000000000005',
  family: '10000000-0000-4000-8000-000000000006',
  document: '10000000-0000-4000-8000-000000000007',
  version: '10000000-0000-4000-8000-000000000008',
  representation: '10000000-0000-4000-8000-000000000009',
  record: '10000000-0000-4000-8000-000000000010',
  command: '10000000-0000-4000-8000-000000000011',
  command2: '10000000-0000-4000-8000-000000000012',
  client: '10000000-0000-4000-8000-000000000013',
  opportunity: '10000000-0000-4000-8000-000000000014',
  contract: '10000000-0000-4000-8000-000000000015',
  contractVersion: '10000000-0000-4000-8000-000000000016',
};
export const capture = `invoice-record-read.v1.${'a'.repeat(64)}`;
const company = {
  id: ids.company,
  displayName: 'Fictional Company',
  invoiceRecordReadCapture: capture,
  clientPermissions: ['client.read'],
  clientPermissionAssignmentId: '20000000-0000-4000-8000-000000000001',
  clientPermissionSetVersion: 'v2',
  documentPermissions: [
    'document.read',
    'document.register',
    'document.reference.read',
    'document.correct',
    'document.version.manage',
    'document.version.designate_official',
    'document.content.read',
    'document.content.upload',
  ],
  documentPermissionAssignmentId: '20000000-0000-4000-8000-000000000002',
  documentPermissionSetVersion: 'v3',
  documentContentReaderAssignmentId: '20000000-0000-4000-8000-000000000003',
  documentContentReaderPermissionSetVersion: 'v1',
  documentContentUploaderAssignmentId: '20000000-0000-4000-8000-000000000004',
  documentContentUploaderPermissionSetVersion: 'v1',
  documentApproverAssignmentId: '20000000-0000-4000-8000-000000000005',
  documentApproverPermissionSetVersion: 'v1',
  contractPermissions: ['commercial.contract.read'],
  contractPermissionAssignmentId: '20000000-0000-4000-8000-000000000006',
  contractPermissionSetVersion: 'v2',
  commercialIntakePermissions: [
    'commercial.request.read',
    'commercial.opportunity.read',
  ],
  commercialIntakePermissionAssignmentId:
    '20000000-0000-4000-8000-000000000007',
  commercialIntakePermissionSetVersion: 'v4',
  externalInvoiceGrants: [
    {
      bundle: 'company_invoice_recorder',
      assignmentId: ids.recorder,
      permissionSetVersion: 'v1',
    },
    {
      bundle: 'company_external_invoice_access',
      assignmentId: ids.family,
      permissionSetVersion: 'v1',
    },
  ],
} satisfies NonNullable<ActorContext['activeCompany']> & {
  invoiceRecordReadCapture: string;
};
export const actor: ActorContext = {
  internalUserId: ids.user,
  workspaceMembershipId: ids.membership,
  workspaceId: ids.workspace,
  workspaceName: 'Fictional Workspace',
  displayName: 'Fictional recorder',
  email: 'fictional@example.test',
  active: true,
  workspacePermissions: [],
  activeCompany: company,
};
export const financeOnly: ActorContext = {
  ...actor,
  activeCompany: {
    ...company,
    clientPermissions: [],
    documentPermissions: [],
    contractPermissions: [],
    commercialIntakePermissions: [],
    externalInvoiceGrants: [
      {
        bundle: 'company_invoice_recorder',
        assignmentId: ids.recorder,
        permissionSetVersion: 'v1',
      },
    ],
  },
};
export const identity = deterministicBrowserIdentity();
export const values = {
  externalSystem: ' Fictional manual process ',
  externalNumber: 'SYN-INV-001 <script>',
  issuedOn: '2026-01-15',
  dueOn: null,
  currency: 'MDL',
  grossMinor: '125500',
  netMinor: null,
  taxMinor: '0',
} satisfies InvoiceValues;
export const copiedContext = {
  companyLabel: 'Fictional Company · copied',
  contractReference: 'Fictional Contract №17',
  contractVersionNumber: 2,
  receivingParty: {
    kind: 'ADDITIONAL',
    legalName: 'Fictional party Ș Я é <script>',
    taxIdentifier: 'FICTIONAL-TAX',
    address: null,
  },
} satisfies InvoiceSummary['copiedContext'];
export const summary: InvoiceSummary = {
  id: ids.record,
  revision: 1,
  entryState: 'RECORDED',
  values,
  copiedContext,
  createdAt: '2026-11-01T10:00:00.000Z',
  replacesWithdrawnRecordId: null,
  replacementRecordId: null,
};
export const recordedActor = {
  membershipId: ids.membership,
  displayName: 'Fictional recorder · literal',
};
export const initialFact: InvoiceRevision = {
  format: 'EXTERNAL_INVOICE_REVISION/1',
  recordId: ids.record,
  revision: 1,
  action: 'CREATE',
  commandId: ids.command,
  actor: recordedActor,
  recordedAt: summary.createdAt,
  before: null,
  after: { entryState: 'RECORDED', values },
  reason: null,
};
export const current: InvoiceCurrent = {
  format: 'EXTERNAL_INVOICE_RECORD/1',
  companyId: ids.company,
  readCapture: capture,
  record: summary,
  actor: recordedActor,
  recordedAt: summary.createdAt,
  capabilities: { canCorrect: true, canWithdraw: true },
  liveSource: {
    kind: 'AVAILABLE',
    documentId: ids.document,
    documentVersionId: ids.version,
    title: 'Fictional exact source',
    versionNumber: 2,
    versionState: 'superseded',
    content: {
      kind: 'AVAILABLE',
      representationId: ids.representation,
      fileName: 'fictional-original.pdf',
      byteLength: 27,
      sha256: 'a'.repeat(64),
    },
  },
  related: {
    contract: {
      kind: 'AVAILABLE',
      opportunityId: ids.opportunity,
      contractId: ids.contract,
      contractVersionId: ids.contractVersion,
    },
    client: {
      kind: 'AVAILABLE',
      clientId: ids.client,
      displayName: 'Fictional live Client',
    },
  },
  history: { items: [initialFact], nextCursor: null },
};
export const copiedOnly: InvoiceCurrent = {
  ...current,
  capabilities: { canCorrect: false, canWithdraw: true },
  liveSource: { kind: 'UNAVAILABLE' },
  related: {
    contract: { kind: 'UNAVAILABLE' },
    client: { kind: 'UNAVAILABLE' },
  },
};
export const source: InvoiceSource = {
  source: {
    documentId: ids.document,
    documentVersionId: ids.version,
    representationId: ids.representation,
  },
  documentTitle: 'Fictional exact source',
  versionNumber: 2,
  versionState: 'superseded',
  fileName: 'fictional-original.pdf',
  byteLength: 27,
  sha256: 'a'.repeat(64),
  copiedContext,
};
export const inventory = {
  format: 'EXTERNAL_INVOICE_INVENTORY/1',
  companyId: ids.company,
  readCapture: capture,
  items: [summary],
  nextCursor: null,
};
export function corrected(reason: string): InvoiceCurrent {
  const next = { ...values, grossMinor: '125550' };
  const fact: InvoiceRevision = {
    ...initialFact,
    revision: 2,
    action: 'CORRECT',
    commandId: ids.command2,
    recordedAt: '2026-11-01T11:00:00.000Z',
    before: initialFact.after,
    after: { entryState: 'RECORDED', values: next },
    reason,
  };
  return {
    ...current,
    record: { ...summary, revision: 2, values: next },
    recordedAt: fact.recordedAt,
    history: { items: [fact, initialFact], nextCursor: null },
  };
}
export function withdrawn(reason: string): InvoiceCurrent {
  const fact: InvoiceRevision = {
    ...initialFact,
    revision: 2,
    action: 'WITHDRAW_ENTRY',
    commandId: ids.command2,
    recordedAt: '2026-11-01T11:00:00.000Z',
    before: initialFact.after,
    after: { entryState: 'WITHDRAWN', values },
    reason,
  };
  return {
    ...copiedOnly,
    record: { ...summary, revision: 2, entryState: 'WITHDRAWN' },
    recordedAt: fact.recordedAt,
    capabilities: { canCorrect: false, canWithdraw: false },
    history: { items: [fact, initialFact], nextCursor: null },
  };
}
export function receipt(action: 'CREATE' | 'CORRECT' | 'WITHDRAW_ENTRY') {
  return {
    format: 'EXTERNAL_INVOICE_COMMAND/1',
    commandId: action === 'CREATE' ? ids.command : ids.command2,
    recordId: ids.record,
    revision: action === 'CREATE' ? 1 : 2,
    action,
    recordedAt:
      action === 'CREATE' ? summary.createdAt : '2026-11-01T11:00:00.000Z',
  };
}
