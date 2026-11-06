import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createAuthenticatedApiClient,
  type ApiResult,
} from '../api/authenticated-api-client';
import { hasReceivedAddendumAccess } from '../documents/received-addendum-access';
import { contractModelAuthority } from '../contract-model/contract-model-authority';
import { missionPlanAuthority } from '../mission-plan/mission-plan-authority';
import { offerModelAuthority } from '../offer-model/offer-model-authority';
import { offerMessageReadCapture } from '../offer-message/offer-message-contract';
import { paymentAuthority } from '../payment-observation/payment-authority';
import { paymentEvidenceAuthority } from '../payment-evidence/payment-evidence-authority';
import { paymentEvidenceActor } from '../payment-evidence/payment-evidence.test-fixture';
import { browserIdentity } from '../production-shell/production-shell-context.test-fixtures';
import { readCurrentActor } from './current-actor';
import { invoiceRecordAuthority } from './invoice-record-authority';
import { completeActor } from './current-actor.test-fixture';
import {
  clearWorkspaceSelection,
  selectWorkspace,
} from './workspace-selection';

const workspaceActor = {
  internalUserId: 'User-Case-Kept',
  workspaceMembershipId: 'membership',
  workspaceId: 'workspace',
  workspaceName: '',
  displayName: '',
  email: '',
  active: true,
  workspacePermissions: [],
};

function read(value: unknown) {
  return readCurrentActor({
    api: { request: async () => ({ status: 'ok', value }) },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  clearWorkspaceSelection();
});

describe('current Actor representation', () => {
  it.each([
    undefined,
    null,
    5,
    { future: 'opaque' },
    'received-addendum-client-read.future',
    'received-addendum-client-read.v1.' + 'a'.repeat(64),
  ])(
    'preserves the opaque Addendum Client capture and delegates exact support without retiring independent families: %j',
    async (capture) => {
      const native = paymentEvidenceActor(),
        actor = {
          ...native,
          activeCompany: {
            ...native.activeCompany,
            receivedAddendumAccessAssignmentId:
              '10000000-0000-4000-8000-000000000005',
            receivedAddendumAccessPermissionSetVersion: 'v1',
            receivedAddendumClientReadCapture: capture,
            documentPermissions: [
              ...native.activeCompany.documentPermissions,
              'document.received_addendum.access',
            ],
          },
        };
      const result = await read(actor);
      expect(result).toEqual({ status: 'ok', value: actor });
      if (result.status !== 'ok')
        throw new Error('Readable additive Actor required');
      expect(paymentEvidenceAuthority(result.value)).toBeDefined();
      expect(hasReceivedAddendumAccess(result.value.activeCompany)).toBe(
        typeof capture === 'string' &&
          /^received-addendum-client-read\.v1\.[a-f0-9]{64}$/u.test(capture),
      );
    },
  );
  it.each([
    undefined,
    null,
    5,
    { future: 'opaque' },
    'payment-observation-read.future',
    'payment-observation-read.v1.' + 'a'.repeat(64),
  ])(
    'preserves the opaque Payment read capture and delegates exact support to its own consumer: %j',
    async (capture) => {
      const native = paymentEvidenceActor(),
        actor = {
          ...native,
          activeCompany: {
            ...native.activeCompany,
            paymentObservationReadCapture: capture,
          },
        };
      const result = await read(actor);
      expect(result).toEqual({ status: 'ok', value: actor });
      if (result.status !== 'ok')
        throw new Error('An additive readable Actor is required.');
      expect(paymentEvidenceAuthority(result.value)).toBeDefined();
      expect(paymentAuthority(result.value) !== undefined).toBe(
        typeof capture === 'string' &&
          capture.startsWith('payment-observation-read.v1.'),
      );
    },
  );

  it.each([
    undefined,
    null,
    5,
    { future: 'opaque' },
    'payment-observation-context.future',
    'payment-observation-context.v1.' + 'a'.repeat(64),
  ])(
    'preserves an opaque Payment Company context and enables writers only for the supported context: %j',
    async (capture) => {
      const native = paymentEvidenceActor();
      const actor = {
        ...native,
        activeCompany: {
          ...native.activeCompany,
          paymentObservationReadCapture:
            'payment-observation-read.v1.' + 'a'.repeat(64),
          paymentObservationContextCapture: capture,
        },
      };
      const result = await read(actor);
      expect(result).toEqual({ status: 'ok', value: actor });
      if (result.status !== 'ok')
        throw new Error('An additive readable Actor is required.');
      const authority = paymentAuthority(result.value);
      expect(authority).toBeDefined();
      expect(Boolean(authority?.recordKey)).toBe(
        typeof capture === 'string' &&
          capture.startsWith('payment-observation-context.v1.'),
      );
      expect(paymentEvidenceAuthority(result.value)).toBeDefined();
    },
  );

  it.each([
    { capture: undefined, expected: null },
    { capture: null, expected: null },
    { capture: 5, expected: null },
    { capture: 'offer-message-read.future', expected: null },
    {
      capture: 'offer-message-read.v1.' + 'a'.repeat(64),
      expected: 'offer-message-read.v1.' + 'a'.repeat(64),
    },
    { capture: { future: 'opaque representation' }, expected: null },
  ])(
    'preserves an additive Offer message capture without interpreting authority: %j',
    async ({ capture, expected }) => {
      const actor = {
        ...completeActor,
        activeCompany: {
          ...completeActor.activeCompany,
          offerMessageReadCapture: capture,
        },
      };
      const result = await read(actor);
      expect(result).toEqual({ status: 'ok', value: actor });
      if (result.status !== 'ok')
        throw new Error('Expected an additive readable Actor.');
      expect(offerMessageReadCapture(result.value)).toBe(expected);
    },
  );

  it('reads the complete current representation without changing any values', async () => {
    const result = await read(completeActor);
    expect(result).toEqual({ status: 'ok', value: completeActor });
    if (result.status !== 'ok') throw new Error('Expected a readable Actor');
    expect(result.value).toBe(completeActor);
  });

  it.each(['v1', 'v99'])(
    'accepts additive backend Knowledge captures %s without interpreting their authority',
    async (permissionSetVersion) => {
      const actor = {
        ...completeActor,
        activeCompany: {
          ...completeActor.activeCompany,
          knowledgeGrants: [
            {
              bundle: 'company_knowledge_source_administrator',
              assignmentId: '00000000-0000-4000-8000-000000007031',
              permissionSetVersion,
            },
            {
              bundle: 'company_knowledge_evidence_reader',
              assignmentId: '00000000-0000-4000-8000-000000007032',
              permissionSetVersion,
            },
          ],
        },
      };
      const result = await read(actor);
      expect(result).toEqual({ status: 'ok', value: actor });
      if (result.status !== 'ok') throw new Error('Expected a readable Actor');
      expect(result.value).toBe(actor);
      expect(result.value.activeCompany?.clientPermissions).toBe(
        completeActor.activeCompany.clientPermissions,
      );
    },
  );

  it('accepts Workspace-only context, additive fields and exact identifier spelling', async () => {
    const actor = {
      ...workspaceActor,
      newRootField: { future: true },
      activeCompany: {
        id: 'Company-Case-Kept',
        displayName: '',
        newCompanyField: { future: true },
        taskPermissions: ['task.read', 'task.read'],
      },
    };
    expect(await read(workspaceActor)).toEqual({
      status: 'ok',
      value: workspaceActor,
    });
    const result = await read(actor);
    expect(result).toEqual({ status: 'ok', value: actor });
    if (result.status !== 'ok') throw new Error('Expected a readable Actor');
    expect(result.value).toBe(actor);
  });

  it.each(Object.keys(workspaceActor))(
    'rejects missing or null root %s',
    async (field) => {
      const missing = Object.fromEntries(
        Object.entries(workspaceActor).filter(([key]) => key !== field),
      );
      expect(await read(missing)).toEqual({ status: 'error' });
      expect(await read({ ...workspaceActor, [field]: null })).toEqual({
        status: 'error',
      });
    },
  );

  it.each<[string, unknown]>([
    ['null', null],
    ['array', []],
    ['text', 'actor'],
    ['empty object', {}],
    ['inactive', { ...workspaceActor, active: false }],
    [
      'text permissions',
      { ...workspaceActor, workspacePermissions: 'company.manage' },
    ],
    [
      'unknown Workspace permission',
      { ...workspaceActor, workspacePermissions: ['future.permission'] },
    ],
    ['null Company', { ...workspaceActor, activeCompany: null }],
    ['array Company', { ...workspaceActor, activeCompany: [] }],
    [
      'missing Company id',
      { ...workspaceActor, activeCompany: { displayName: 'Company' } },
    ],
    [
      'missing Company name',
      { ...workspaceActor, activeCompany: { id: 'Company' } },
    ],
  ])('rejects %s as a read error', async (_name, value) => {
    expect(await read(value)).toEqual({ status: 'error' });
  });

  const typedFields = Object.entries(completeActor.activeCompany).filter(
    ([name]) =>
      ![
        'receivedAddendumClientReadCapture',
        'workingEvidenceCasePermissions',
        'workingEvidenceCaseReaderAssignmentId',
        'workingEvidenceCaseReaderPermissionSetVersion',
        'workingEvidenceCaseRecorderAssignmentId',
        'workingEvidenceCaseRecorderPermissionSetVersion',
        'receivedAuditSourceAccessAssignmentId',
        'receivedAuditSourceAccessPermissionSetVersion',
        'workingEvidenceClientReadCapture',
        'workingEvidenceContextCapture',

        'missionPlanGrants',
        'offerModelGrants',
        'contractModelGrants',
        'knowledgeGrants',
        'externalInvoiceGrants',
        'invoiceRecordReadCapture',
        'offerMessageReadCapture',
        'paymentObservationReadCapture',
        'paymentObservationContextCapture',
        'paymentGrants',
        'paymentEvidenceContextCapture',
        'paymentEvidenceReferenceReadCapture',
        'opportunityFollowUpPermissions',
        'opportunityFollowUpCoordinatorAssignmentId',
        'opportunityFollowUpCoordinatorPermissionSetVersion',
        'opportunityFollowUpReadCapture',
        'internalTaskPermissions',
        'internalTaskManagerAssignmentId',
        'internalTaskManagerPermissionSetVersion',
        'projectNextActionPermissions',
        'projectNextActionCoordinatorAssignmentId',
        'projectNextActionCoordinatorPermissionSetVersion',
      ].includes(name),
  );
  it.each(typedFields)(
    'rejects corrupt or null Company %s',
    async (name, valid) => {
      const invalid = Array.isArray(valid)
        ? ['unsupported.permission']
        : name.endsWith('Version')
          ? 'v99'
          : 5;
      for (const value of [invalid, null]) {
        expect(
          await read({
            ...completeActor,
            activeCompany: { ...completeActor.activeCompany, [name]: value },
          }),
        ).toEqual({ status: 'error' });
      }
    },
  );

  it.each([
    'paymentGrants',
    'paymentEvidenceContextCapture',
    'paymentEvidenceReferenceReadCapture',
  ])(
    'preserves opaque Payment %s while Source refuses unsupported consumed authority',
    async (field) => {
      const current = paymentEvidenceActor();
      expect(paymentEvidenceAuthority(current)).toBeDefined();
      for (const value of [
        undefined,
        null,
        5,
        'payment-evidence.future',
        { version: 'future', arbitrary: null },
      ]) {
        const actor = {
          ...current,
          activeCompany: { ...current.activeCompany, [field]: value },
        };
        const result = await read(actor);
        expect(result).toEqual({ status: 'ok', value: actor });
        if (result.status !== 'ok')
          throw new Error('Expected a readable Actor');
        expect(result.value).toBe(actor);
        expect(paymentEvidenceAuthority(result.value)).toBeUndefined();
      }
    },
  );

  it('preserves opaque Invoice captures while the feature refuses unknown authority', async () => {
    const activeCompany = {
      ...completeActor.activeCompany,
      id: '00000000-0000-4000-8000-000000001030',
      externalInvoiceGrants: [
        {
          bundle: 'company_invoice_reader',
          assignmentId: '00000000-0000-4000-8000-000000001031',
          permissionSetVersion: 'v1',
        },
      ],
    };
    const known = await read({
      ...completeActor,
      activeCompany: {
        ...activeCompany,
        invoiceRecordReadCapture: 'invoice-record-read.v1.' + 'a'.repeat(64),
      },
    });
    if (known.status !== 'ok') throw new Error('Expected a readable Actor');
    expect(invoiceRecordAuthority(known.value)).toMatchObject({
      companyId: activeCompany.id,
      manage: false,
    });
    for (const invoiceRecordReadCapture of [
      null,
      5,
      'invoice-record-read.future',
      { version: 'future', arbitrary: null },
    ]) {
      const actor = {
        ...completeActor,
        activeCompany: { ...activeCompany, invoiceRecordReadCapture },
      };
      const result = await read(actor);
      expect(result).toEqual({ status: 'ok', value: actor });
      if (result.status !== 'ok') throw new Error('Expected a readable Actor');
      expect(invoiceRecordAuthority(result.value)).toBeUndefined();
    }
  });

  it.each([
    ['projectPermissionSetVersion', 'v2'],
    ['commercialIntakePermissionSetVersion', 'v2'],
    ['commercialIntakePermissionSetVersion', 'v3'],
    ['commercialIntakePermissionSetVersion', 'v4'],
    ['contractPermissionSetVersion', 'v2'],
    ['contractApproverPermissionSetVersion', 'v2'],
    ['offerPermissionSetVersion', 'v2'],
    ['offerPermissionSetVersion', 'v3'],
    ['offerApproverPermissionSetVersion', 'v2'],
    ['opportunityManagerPermissionSetVersion', 'v2'],
    ['projectTemplatePermissionSetVersion', 'v2'],
    ['documentPermissionSetVersion', 'v2'],
    ['documentPermissionSetVersion', 'v3'],
    ['clientPermissionSetVersion', 'v2'],
  ])('preserves supported legacy %s %s', async (field, version) => {
    const value = {
      ...completeActor,
      activeCompany: { ...completeActor.activeCompany, [field]: version },
    };
    expect(await read(value)).toEqual({ status: 'ok', value });
  });

  it.each([
    'missionPlanGrants',
    'offerModelGrants',
    'contractModelGrants',
    'knowledgeGrants',
    'externalInvoiceGrants',
    'internalTaskPermissions',
    'internalTaskManagerAssignmentId',
    'internalTaskManagerPermissionSetVersion',
    'projectNextActionPermissions',
    'projectNextActionCoordinatorAssignmentId',
    'projectNextActionCoordinatorPermissionSetVersion',
  ])(
    'preserves opaque %s including unfamiliar versions and shapes',
    async (field) => {
      for (const capture of [
        null,
        'future',
        [{ permissionSetVersion: 'v99', permissions: 1 }],
      ]) {
        const value = {
          ...completeActor,
          activeCompany: { ...completeActor.activeCompany, [field]: capture },
        };
        const result = await read(value);
        expect(result).toEqual({ status: 'ok', value });
        if (result.status !== 'ok')
          throw new Error('Expected opaque capture compatibility');
        expect(result.value).toBe(value);
      }
    },
  );

  it('leaves unsupported model captures and independent Mission configuration with their feature owners', async () => {
    const grant = {
      assignmentId: '00000000-0000-4000-8000-000000000005',
      permissionSetVersion: 'v99',
    };
    const result = await read({
      ...workspaceActor,
      internalUserId: '00000000-0000-4000-8000-000000000001',
      workspaceMembershipId: '00000000-0000-4000-8000-000000000002',
      workspaceId: '00000000-0000-4000-8000-000000000003',
      activeCompany: {
        id: '00000000-0000-4000-8000-000000000004',
        displayName: 'Company',
        offerModelGrants: [
          {
            ...grant,
            bundle: 'company_offer_model_editor',
            permissions: [
              'commercial.offer.model.read',
              'commercial.offer.model.version.create',
            ],
          },
        ],
        contractModelGrants: [
          {
            ...grant,
            bundle: 'company_contract_model_editor',
            permissions: [
              'commercial.contract.model.read',
              'commercial.contract.model.version.create',
            ],
          },
        ],
        missionPlanGrants: [
          {
            ...grant,
            bundle: 'company_mission_plan_configuration',
            permissionSetVersion: 'v1',
            permissions: [
              'project.mission_plan.read',
              'project.mission_plan.publish',
            ],
          },
          {
            ...grant,
            bundle: 'company_mission_plan_user',
            permissions: [
              'project.mission_plan.read',
              'project.mission_plan.instantiate',
            ],
          },
        ],
      },
    });
    if (result.status !== 'ok') throw new Error('Expected a readable Actor');
    expect(offerModelAuthority(result.value)).toBeNull();
    expect(contractModelAuthority(result.value)).toBeNull();
    expect(missionPlanAuthority(result.value, 'configure')?.canPublish).toBe(
      true,
    );
    expect(missionPlanAuthority(result.value, 'create')).toBeNull();
  });
});

describe('current Actor transport', () => {
  it.each<ApiResult<unknown>>([
    { status: 'unauthorized' },
    { status: 'forbidden' },
    { status: 'notFound' },
    { status: 'error', code: 'service_unavailable' },
    { status: 'conflict', code: 'stale' },
    { status: 'conflict', reason: 'clientLegalEntityCapacityExceeded' },
    {
      status: 'conflict',
      reason: 'possibleDuplicateReviewRequired',
      duplicateReviewReference: 'review-1',
    },
    { status: 'validation', code: 'invalid', message: 'Invalid request' },
  ])('preserves non-success result $status', async (outcome) => {
    expect(
      await readCurrentActor({ api: { request: async () => outcome } }),
    ).toBe(outcome);
  });

  it('uses existing identity, Workspace/Company headers and AbortSignal', async () => {
    const workspaceId = '00000000-0000-4000-8000-000000000003';
    selectWorkspace(workspaceId);
    const fetch = vi.fn(async () => Response.json(completeActor));
    vi.stubGlobal('fetch', fetch);
    const controller = new AbortController();
    const api = await createAuthenticatedApiClient(browserIdentity());
    expect(
      await readCurrentActor({
        api,
        companyContextId: 'Company-Case-Kept',
        signal: controller.signal,
      }),
    ).toEqual({ status: 'ok', value: completeActor });
    expect(fetch).toHaveBeenCalledWith(
      '/api/access/current-actor',
      expect.objectContaining({
        credentials: 'include',
        signal: controller.signal,
        headers: {
          Authorization: 'Bearer token',
          'x-workspace-context-id': workspaceId,
          'x-company-context-id': 'Company-Case-Kept',
        },
      }),
    );
  });

  it('preserves transport cancellation', async () => {
    const abortion = new DOMException('Aborted', 'AbortError');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw abortion;
      }),
    );
    const api = await createAuthenticatedApiClient(browserIdentity());
    await expect(readCurrentActor({ api })).rejects.toBe(abortion);
  });
});

it.each([
  'workingEvidenceCasePermissions',
  'workingEvidenceCaseReaderAssignmentId',
  'workingEvidenceCaseReaderPermissionSetVersion',
  'workingEvidenceCaseRecorderAssignmentId',
  'workingEvidenceCaseRecorderPermissionSetVersion',
  'receivedAuditSourceAccessAssignmentId',
  'receivedAuditSourceAccessPermissionSetVersion',
  'workingEvidenceClientReadCapture',
  'workingEvidenceContextCapture',
])(
  'preserves opaque Working Evidence %s without invalidating independent native authority',
  async (field) => {
    const native = paymentEvidenceActor();
    for (const value of [
      undefined,
      null,
      7,
      { future: 'opaque' },
      'working-evidence.future',
    ]) {
      const actor = {
        ...native,
        activeCompany: { ...native.activeCompany, [field]: value },
      };
      const result = await read(actor);
      expect(result).toEqual({ status: 'ok', value: actor });
      if (result.status !== 'ok')
        throw new Error('Independent Actor must remain readable');
      expect(paymentEvidenceAuthority(result.value)).toBeDefined();
    }
  },
);
