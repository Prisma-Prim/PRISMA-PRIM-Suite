import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAuthenticatedProductionShellTransport } from './authenticated-production-shell-transport';
import { browserIdentity } from './production-shell-context.test-fixtures';

const companyId = 'company-a';
const occurredAt = '2026-09-24T10:05:00.000Z';
const actor = { internalUserId: 'user-1', displayName: 'Ada Ionescu' };

function event(
  id: string,
  action: string,
  target: unknown,
  metadata: Record<string, unknown> = {},
) {
  return { id, action, occurredAt, actor, target, metadata };
}

const requestTarget = {
  type: 'client_request',
  clientRequestId: 'request-358',
  companyId,
};
const opportunityTarget = {
  type: 'opportunity',
  opportunityId: 'opportunity-358',
  clientRequestId: 'request-358',
  companyId,
};
const firstOfferVersionTarget = {
  type: 'offer_version',
  offerVersionId: 'offer-version-1',
  versionNumber: 1,
  illustrativeReference: 7,
  opportunityId: 'opportunity-358',
  clientRequestId: 'request-358',
  companyId,
};
const offerVersionTarget = {
  ...firstOfferVersionTarget,
  offerVersionId: 'offer-version-2',
  versionNumber: 2,
};
const firstContractVersionTarget = {
  type: 'contract_version',
  contractId: 'contract-1',
  contractVersionId: 'contract-version-1',
  kind: 'CONTRACT',
  illustrativeReference: 4,
  versionNumber: 1,
  opportunityId: 'opportunity-358',
  clientRequestId: 'request-358',
  companyId,
};
const contractVersionTarget = {
  ...firstContractVersionTarget,
  contractVersionId: 'contract-version-2',
  versionNumber: 2,
};
const linkedProject = {
  created: true,
  project: { projectId: 'project-1', projectTitle: 'Synthetic Project' },
};
const roleAssignmentTarget = {
  type: 'company_role_assignment',
  assignmentId: 'assignment-1',
  companyId,
  companyDisplayName: 'Company A',
  workspaceMembershipId: 'membership-2',
  internalUserId: 'user-2',
  internalUserDisplayName: 'Bogdan Pop',
};
const clientTarget = {
  type: 'client_account',
  clientAccountId: 'client-1',
  displayName: 'Atlas SRL',
};
const workspaceMembershipTarget = {
  type: 'workspace_membership',
  workspaceMembershipId: 'membership-2',
  internalUserId: 'user-2',
  displayName: 'Bogdan Pop',
};
const taskTarget = {
  type: 'task',
  taskId: 'task-1',
  taskTitle: 'Collect the audit file',
  companyId,
};
const documentTarget = {
  type: 'document',
  documentId: 'document-1',
  documentTitle: 'Audit contract',
  companyId,
};
const documentProjectTarget = {
  type: 'document_project',
  documentId: 'document-1',
  documentTitle: 'Audit contract',
  projectId: 'project-1',
  projectTitle: 'Audit preparation',
  companyId,
};
const responsibleTarget = {
  type: 'project',
  projectId: 'project-1',
  projectTitle: 'Audit preparation',
  companyId,
};
const ion = { workspaceMembershipId: 'membership-2', displayLabel: 'Ion Popa' };
const maria = {
  workspaceMembershipId: 'membership-3',
  displayLabel: 'Maria Ene',
};
const responsibleChanged = event(
  'event-responsible',
  'project.responsible.changed',
  responsibleTarget,
  { revision: 2, before: ion, after: maria },
);
const opportunityResponsibleChanged = event(
  'event-opportunity-responsible',
  'opportunity.responsible.changed',
  opportunityTarget,
  { before: ion, after: maria },
);
const unionEvent = {
  action: 'client.union_confirmed',
  projectionReference: 'union-1',
  companyId,
  actor: { kind: 'authorized_resolver' },
  target: {
    type: 'client_union_operation',
    projectionReference: 'union-1',
    companyId,
  },
};

/** Every delivered action with a legitimate target of its kind. */
const legitimateTargets: Array<
  [string, Record<string, unknown>, Record<string, unknown>?]
> = [
  [
    'workspace_invitation.issued',
    { type: 'workspace_invitation', invitationId: 'invitation-1' },
  ],
  [
    'workspace_invitation.revoked',
    { type: 'workspace_invitation', invitationId: 'invitation-1' },
  ],
  [
    'workspace_invitation.accepted',
    { type: 'workspace_invitation', invitationId: 'invitation-1' },
  ],
  [
    'internal_user.provisioned',
    {
      type: 'internal_user',
      internalUserId: 'user-2',
      displayName: 'Bogdan Pop',
    },
  ],
  ['workspace_membership.suspended', workspaceMembershipTarget],
  ['workspace_sessions.revoked', workspaceMembershipTarget],
  ['workspace_sessions.revocation_retry_required', workspaceMembershipTarget],
  [
    'company.registered',
    { type: 'company', companyId, displayName: 'Company A' },
  ],
  ...[
    'company_task_manager_assignment',
    'company_project_assignment',
    'company_commercial_intake_assignment',
    'company_service_catalogue_assignment',
    'company_pricing_configuration_assignment',
    'company_pricing_user_assignment',
    'company_pricing_adjustment_assignment',
    'company_commercial_activity_reader_assignment',
    'company_opportunity_manager_assignment',
    'company_sales_stage_configuration_assignment',
    'company_context_assignment',
    'company_director_client_assignment',
    'company_document_project_organizer_assignment',
    'company_document_registrar_assignment',
    'company_document_approver_assignment',
  ].flatMap((assignment): Array<[string, Record<string, unknown>]> => [
    [`${assignment}.granted`, roleAssignmentTarget],
    [`${assignment}.revoked`, roleAssignmentTarget],
  ]),
  ['client.created', clientTarget],
  [
    'client.corrected',
    { ...clientTarget, companyId, companyDisplayName: 'Company A' },
  ],
  [
    'client_legal_entity.registered',
    { ...clientTarget, companyId, companyDisplayName: 'Company A' },
  ],
  [
    'client_legal_entity.corrected',
    { ...clientTarget, companyId, companyDisplayName: 'Company A' },
  ],
  [
    'client_company_relationship.established',
    {
      type: 'client_company_relationship',
      relationshipId: 'relationship-1',
      clientAccountId: 'client-1',
      clientDisplayName: 'Atlas SRL',
      companyId,
      companyDisplayName: 'Company A',
    },
  ],
  [
    'project.created',
    {
      type: 'project',
      projectId: 'project-1',
      projectTitle: 'Audit preparation',
      companyId,
    },
  ],
  ['task.created', taskTarget],
  ['task.updated', taskTarget],
  ['task.status.changed', taskTarget],
  ['task.completed', taskTarget],
  ['task.cancelled', taskTarget],
  ['task.reopened', taskTarget],
  ['document.registered', documentTarget],
  [
    'document.corrected',
    { type: 'document', documentId: 'document-1', companyId },
  ],
  [
    'document.version.drafted',
    documentTarget,
    { versionNumber: 2, sourceVersionNumber: 1 },
  ],
  [
    'document.version.designated_official',
    documentTarget,
    { versionNumber: 2, supersededVersionNumber: 1 },
  ],
  [
    'document.representation.added',
    documentTarget,
    { versionNumber: 2, form: 'signed', appendedAfterDesignation: true },
  ],
  [
    'document.representation.removed',
    documentTarget,
    { versionNumber: 2, form: 'editable', appendedAfterDesignation: false },
  ],
  ['document.project.linked', documentProjectTarget],
  ['document.project.unlinked', documentProjectTarget],
  ['client_request.created', requestTarget],
  ['opportunity.created', opportunityTarget],
  ['opportunity.next_action.updated', opportunityTarget],
];

async function loadActivityLog(body: unknown, status = 200) {
  const fetch = vi.fn(
    async () => new Response(JSON.stringify(body), { status }),
  );
  vi.stubGlobal('fetch', fetch);
  const transport =
    await createAuthenticatedProductionShellTransport(browserIdentity());
  const result = await transport.loadActivityLog({
    companyId,
    signal: new AbortController().signal,
  });
  return { result, fetch };
}

describe('the authenticated Activity Log transport', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('returns the current commercial Request and Opportunity targets it proved', async () => {
    const { result, fetch } = await loadActivityLog({
      events: [
        event(
          'event-next-action',
          'opportunity.next_action.updated',
          opportunityTarget,
        ),
        event('event-request', 'client_request.created', requestTarget, {
          requestVersion: 1,
        }),
      ],
    });

    expect(fetch).toHaveBeenCalledOnce();
    expect(result).toEqual({
      status: 'ok',
      value: {
        events: [
          {
            id: 'event-next-action',
            action: 'opportunity.next_action.updated',
            occurredAt,
            actor,
            target: opportunityTarget,
          },
          {
            id: 'event-request',
            action: 'client_request.created',
            occurredAt,
            actor,
            target: requestTarget,
          },
        ],
      },
    });
  });

  it('keeps an Opportunity without its Request id when the actor cannot read Requests', async () => {
    const { result } = await loadActivityLog({
      events: [
        event('event-opportunity', 'opportunity.created', {
          type: 'opportunity',
          opportunityId: 'opportunity-358',
          companyId,
        }),
      ],
    });

    if (result.status !== 'ok') throw new Error('Expected a proved page');
    expect(result.value.events).toHaveLength(1);
    expect(result.value.events[0]?.target).toEqual({
      type: 'opportunity',
      opportunityId: 'opportunity-358',
      companyId,
    });
    expect(result.value.events[0]?.target).not.toHaveProperty(
      'clientRequestId',
    );
  });

  it('accepts every delivered action with its own target, including historical Client scope, responsible-member changes and redacted unions', async () => {
    const events = [
      ...legitimateTargets.map(([action, target, metadata], index) =>
        event(`event-${index}`, action, target, metadata),
      ),
      responsibleChanged,
      unionEvent,
    ];

    const { result } = await loadActivityLog({ events });

    expect(result).toEqual({
      status: 'ok',
      value: {
        events: [
          ...legitimateTargets.map(([action, target, metadata], index) => ({
            id: `event-${index}`,
            action,
            occurredAt,
            actor,
            target,
            ...(metadata === undefined ? {} : { metadata }),
          })),
          responsibleChanged,
          unionEvent,
        ],
      },
    });
  });

  it.each([
    ['missing designation timing', { versionNumber: 2, form: 'editable' }],
    [
      'designation timing set to true',
      {
        versionNumber: 2,
        form: 'editable',
        appendedAfterDesignation: true,
      },
    ],
  ])(
    'fails closed on a removed-reference event with %s',
    async (_case, metadata) => {
      const { result } = await loadActivityLog({
        events: [
          event(
            'event-reference-removed',
            'document.representation.removed',
            documentTarget,
            metadata,
          ),
        ],
      });

      expect(result).toEqual({ status: 'error' });
    },
  );

  it('keeps only the revision and each side’s membership and label of a responsible-member change', async () => {
    const { result } = await loadActivityLog({
      events: [
        event(
          'event-cleared',
          'project.responsible.changed',
          responsibleTarget,
          {
            revision: 3,
            before: { ...ion, email: 'ion@example.test' },
            after: null,
            reason: 'not a delivered field',
          },
        ),
      ],
    });

    expect(result).toEqual({
      status: 'ok',
      value: {
        events: [
          {
            id: 'event-cleared',
            action: 'project.responsible.changed',
            occurredAt,
            actor,
            target: responsibleTarget,
            metadata: { revision: 3, before: ion, after: null },
          },
        ],
      },
    });
  });

  it.each<[string, unknown]>([
    ['no metadata', { ...responsibleChanged, metadata: undefined }],
    [
      'the initial revision',
      {
        ...responsibleChanged,
        metadata: { revision: 0, before: null, after: ion },
      },
    ],
    [
      'a fractional revision',
      {
        ...responsibleChanged,
        metadata: { revision: 1.5, before: null, after: ion },
      },
    ],
    [
      'a textual revision',
      {
        ...responsibleChanged,
        metadata: { revision: '1', before: null, after: ion },
      },
    ],
    [
      'a missing before side',
      { ...responsibleChanged, metadata: { revision: 1, after: ion } },
    ],
    [
      'a side without its label',
      {
        ...responsibleChanged,
        metadata: {
          revision: 1,
          before: null,
          after: { workspaceMembershipId: ion.workspaceMembershipId },
        },
      },
    ],
    [
      'a blank membership identifier',
      {
        ...responsibleChanged,
        metadata: {
          revision: 1,
          before: null,
          after: { ...ion, workspaceMembershipId: ' ' },
        },
      },
    ],
    [
      'the same member on both sides',
      {
        ...responsibleChanged,
        metadata: { revision: 2, before: ion, after: { ...ion } },
      },
    ],
    [
      'no member on either side',
      {
        ...responsibleChanged,
        metadata: { revision: 2, before: null, after: null },
      },
    ],
    ['a Task target', { ...responsibleChanged, target: taskTarget }],
    [
      'a Project target without its title',
      {
        ...responsibleChanged,
        target: { ...responsibleTarget, projectTitle: undefined },
      },
    ],
  ])(
    'fails closed on a responsible-member change with %s next to a valid one',
    async (_case, malformed) => {
      const { result } = await loadActivityLog({
        events: [responsibleChanged, malformed],
      });

      expect(result).toEqual({ status: 'error' });
    },
  );

  it('keeps exactly both responsible actors of an Opportunity change and its Request link', async () => {
    const { result } = await loadActivityLog({
      events: [
        event(
          'event-opportunity-responsible',
          'opportunity.responsible.changed',
          opportunityTarget,
          {
            before: { ...ion, email: 'ion@example.test' },
            after: maria,
            opportunityVersion: 2,
          },
        ),
      ],
    });

    expect(result).toEqual({
      status: 'ok',
      value: {
        events: [
          {
            ...opportunityResponsibleChanged,
            metadata: { before: ion, after: maria },
          },
        ],
      },
    });
  });

  it('keeps the previous and new status and a loss code of an Opportunity outcome change', async () => {
    const held = event(
      'event-outcome-held',
      'opportunity.outcome.changed',
      opportunityTarget,
      { previousStatus: 'OPEN', newStatus: 'ON_HOLD' },
    );
    const lost = event(
      'event-outcome-lost',
      'opportunity.outcome.changed',
      opportunityTarget,
      { previousStatus: 'ON_HOLD', newStatus: 'LOST', lossReasonCode: 'PRICE' },
    );
    const { result } = await loadActivityLog({ events: [lost, held] });

    expect(result).toEqual({ status: 'ok', value: { events: [lost, held] } });
  });

  it('keeps the captured stage labels of a Sales Stage change and the label of a configured stage', async () => {
    const assigned = event(
      'event-stage-assigned',
      'opportunity.stage.changed',
      opportunityTarget,
      { previousLabel: null, newLabel: 'Qualification' },
    );
    const changed = event(
      'event-stage-changed',
      'opportunity.stage.changed',
      opportunityTarget,
      { previousLabel: 'Qualification', newLabel: 'Negociere finală' },
    );
    const configured = event(
      'event-stage-configured',
      'sales_stage.configured',
      { type: 'sales_stage', salesStageId: 'stage-1', companyId },
      { operation: 'CREATED', label: 'Qualification' },
    );
    const { result } = await loadActivityLog({
      events: [changed, assigned, configured],
    });

    expect(result).toEqual({
      status: 'ok',
      value: { events: [changed, assigned, configured] },
    });
  });

  it.each<[string, Record<string, unknown>]>([
    [
      'no stage on either side',
      {
        action: 'opportunity.stage.changed',
        target: opportunityTarget,
        metadata: { previousLabel: null, newLabel: null },
      },
    ],
    [
      'a recorded version',
      {
        action: 'opportunity.stage.changed',
        target: opportunityTarget,
        metadata: {
          previousLabel: null,
          newLabel: 'Qualification',
          opportunityVersion: 2,
        },
      },
    ],
    [
      'a blank label',
      {
        action: 'opportunity.stage.changed',
        target: opportunityTarget,
        metadata: { previousLabel: ' ', newLabel: 'Qualification' },
      },
    ],
    [
      'a configured revision',
      {
        action: 'sales_stage.configured',
        target: { type: 'sales_stage', salesStageId: 'stage-1', companyId },
        metadata: {
          operation: 'CREATED',
          label: 'Q',
          configurationRevision: 1,
        },
      },
    ],
    [
      'a later configuration operation',
      {
        action: 'sales_stage.configured',
        target: { type: 'sales_stage', salesStageId: 'stage-1', companyId },
        metadata: { operation: 'RENAMED', label: 'Q' },
      },
    ],
    [
      'a configuration targeting an Opportunity',
      {
        action: 'sales_stage.configured',
        target: opportunityTarget,
        metadata: { operation: 'CREATED', label: 'Q' },
      },
    ],
  ])(
    'fails closed on a Sales Stage event with %s',
    async (_case, malformed) => {
      const { result } = await loadActivityLog({
        events: [
          {
            ...event(
              'event-stage-malformed',
              'opportunity.stage.changed',
              opportunityTarget,
              {},
            ),
            ...malformed,
          },
        ],
      });

      expect(result).toEqual({ status: 'error' });
    },
  );

  it.each<[string, Record<string, unknown> | undefined]>([
    ['no metadata', undefined],
    ['an unknown status', { previousStatus: 'OPEN', newStatus: 'CLOSED' }],
    ['the same status twice', { previousStatus: 'OPEN', newStatus: 'OPEN' }],
    ['a loss without its code', { previousStatus: 'OPEN', newStatus: 'LOST' }],
    [
      'an unknown loss code',
      { previousStatus: 'OPEN', newStatus: 'LOST', lossReasonCode: 'COST' },
    ],
    [
      'a loss code on a win',
      { previousStatus: 'OPEN', newStatus: 'WON', lossReasonCode: 'PRICE' },
    ],
    [
      'reason text',
      { previousStatus: 'OPEN', newStatus: 'ON_HOLD', reason: 'Budget' },
    ],
    [
      'a pair outside the transition table',
      { previousStatus: 'WON', newStatus: 'LOST', lossReasonCode: 'PRICE' },
    ],
    [
      'a hold of a closed status',
      { previousStatus: 'WON', newStatus: 'ON_HOLD' },
    ],
  ])(
    'fails closed on an Opportunity outcome change with %s next to a valid one',
    async (_case, metadata) => {
      const valid = event(
        'event-outcome-valid',
        'opportunity.outcome.changed',
        opportunityTarget,
        { previousStatus: 'OPEN', newStatus: 'WON' },
      );
      const { result } = await loadActivityLog({
        events: [valid, { ...valid, id: 'event-outcome-malformed', metadata }],
      });

      expect(result).toEqual({ status: 'error' });
    },
  );

  it('keeps the Offer reference, exact version, outcome and simulated marker of Offer events', async () => {
    const events = [
      event(
        'event-offer-response',
        'offer_version.client_response_recorded',
        offerVersionTarget,
        { outcome: 'ACCEPTED', evidenceKind: 'SIMULATED' },
      ),
      event(
        'event-offer-transmission',
        'offer_version.transmission_recorded',
        offerVersionTarget,
        { channel: 'SIMULATED' },
      ),
      event(
        'event-offer-approved',
        'offer_version.approved',
        offerVersionTarget,
      ),
      event(
        'event-offer-rejected',
        'offer_version.rejected',
        firstOfferVersionTarget,
      ),
      event('event-offer-version', 'offer_version.created', offerVersionTarget),
      event('event-offer', 'offer.created', firstOfferVersionTarget),
    ];
    const { result } = await loadActivityLog({ events });

    expect(result).toEqual({ status: 'ok', value: { events } });
  });

  it.each<[string, unknown]>([
    [
      'an Offer creation without its version',
      event('event-offer-malformed', 'offer.created', {
        ...firstOfferVersionTarget,
        type: 'offer',
        offerVersionId: undefined,
        versionNumber: undefined,
      }),
    ],
    [
      'an Offer creation on a later version',
      event('event-offer-malformed', 'offer.created', offerVersionTarget),
    ],
    [
      'a missing illustrative reference',
      event('event-offer-malformed', 'offer.created', {
        ...firstOfferVersionTarget,
        illustrativeReference: undefined,
      }),
    ],
    [
      'a missing Request',
      event('event-offer-malformed', 'offer_version.created', {
        ...offerVersionTarget,
        clientRequestId: undefined,
      }),
    ],
    [
      'a missing version number',
      event('event-offer-malformed', 'offer_version.created', {
        ...offerVersionTarget,
        versionNumber: 0,
      }),
    ],
    [
      'an amount',
      event(
        'event-offer-malformed',
        'offer_version.approved',
        offerVersionTarget,
        {
          amount: '345.00',
        },
      ),
    ],
    [
      'a transmission without its simulated channel',
      event(
        'event-offer-malformed',
        'offer_version.transmission_recorded',
        offerVersionTarget,
        { channel: 'EMAIL' },
      ),
    ],
    [
      'a transmission note',
      event(
        'event-offer-malformed',
        'offer_version.transmission_recorded',
        offerVersionTarget,
        { channel: 'SIMULATED', note: 'Synthetic note' },
      ),
    ],
    [
      'an unknown Client response outcome',
      event(
        'event-offer-malformed',
        'offer_version.client_response_recorded',
        offerVersionTarget,
        { outcome: 'WITHDRAWN', evidenceKind: 'SIMULATED' },
      ),
    ],
    [
      'a Client response reason',
      event(
        'event-offer-malformed',
        'offer_version.client_response_recorded',
        offerVersionTarget,
        { outcome: 'REJECTED', evidenceKind: 'SIMULATED', reason: 'Price' },
      ),
    ],
  ])(
    'fails closed on an Offer event with %s next to a valid one',
    async (_case, malformed) => {
      const { result } = await loadActivityLog({
        events: [
          event('event-offer', 'offer.created', firstOfferVersionTarget),
          malformed,
        ],
      });

      expect(result).toEqual({ status: 'error' });
    },
  );

  it('keeps the kind, reference, exact version, simulated marker and linked Project of Contract events', async () => {
    const events = [
      event(
        'event-contract-link',
        'contract_project.linked',
        contractVersionTarget,
        linkedProject,
      ),
      event(
        'event-contract-signature',
        'contract_version.signature_recorded',
        contractVersionTarget,
        { evidenceKind: 'SIMULATED' },
      ),
      event(
        'event-contract-approved',
        'contract_version.approved',
        contractVersionTarget,
      ),
      event(
        'event-contract-rejected',
        'contract_version.rejected',
        firstContractVersionTarget,
      ),
      event(
        'event-contract-version',
        'contract_version.created',
        contractVersionTarget,
      ),
      event('event-contract', 'contract.created', firstContractVersionTarget),
      event('event-precontract', 'contract.created', {
        ...firstContractVersionTarget,
        contractId: 'precontract-1',
        kind: 'PRECONTRACT',
      }),
      event('event-addendum', 'contract.created', {
        ...firstContractVersionTarget,
        contractId: 'addendum-1',
        kind: 'ADDENDUM',
      }),
    ];
    const { result } = await loadActivityLog({ events });

    expect(result).toEqual({ status: 'ok', value: { events } });
  });

  it.each<[string, unknown]>([
    [
      'a Contract creation on a later version',
      event(
        'event-contract-malformed',
        'contract.created',
        contractVersionTarget,
      ),
    ],
    [
      'an unknown kind',
      event('event-contract-malformed', 'contract_version.created', {
        ...contractVersionTarget,
        kind: 'LEASE',
      }),
    ],
    [
      'a missing Contract',
      event('event-contract-malformed', 'contract_version.created', {
        ...contractVersionTarget,
        contractId: undefined,
      }),
    ],
    [
      'a missing Request',
      event('event-contract-malformed', 'contract_version.created', {
        ...contractVersionTarget,
        clientRequestId: undefined,
      }),
    ],
    [
      'an Offer target',
      event('event-contract-malformed', 'contract_version.created', {
        ...offerVersionTarget,
      }),
    ],
    [
      'an amount',
      event(
        'event-contract-malformed',
        'contract_version.approved',
        contractVersionTarget,
        { amount: '345.00' },
      ),
    ],
    [
      'a signature without its simulated evidence',
      event(
        'event-contract-malformed',
        'contract_version.signature_recorded',
        contractVersionTarget,
        { evidenceKind: 'SIGNED' },
      ),
    ],
    [
      'a signatory label',
      event(
        'event-contract-malformed',
        'contract_version.signature_recorded',
        contractVersionTarget,
        { evidenceKind: 'SIMULATED', providerSignatoryLabel: 'Provider' },
      ),
    ],
    [
      'a Project link without its Project',
      event(
        'event-contract-malformed',
        'contract_project.linked',
        contractVersionTarget,
        { created: true },
      ),
    ],
    [
      'a Project link with a textual creation flag',
      event(
        'event-contract-malformed',
        'contract_project.linked',
        contractVersionTarget,
        { ...linkedProject, created: 'true' },
      ),
    ],
    [
      'a Project link with Project content',
      event(
        'event-contract-malformed',
        'contract_project.linked',
        contractVersionTarget,
        {
          ...linkedProject,
          project: { ...linkedProject.project, status: 'preparatory' },
        },
      ),
    ],
  ])(
    'fails closed on a Contract event with %s next to a valid one',
    async (_case, malformed) => {
      const { result } = await loadActivityLog({
        events: [
          event(
            'event-contract',
            'contract.created',
            firstContractVersionTarget,
          ),
          malformed,
        ],
      });

      expect(result).toEqual({ status: 'error' });
    },
  );

  it.each<[string, unknown]>([
    ['no metadata', { ...opportunityResponsibleChanged, metadata: undefined }],
    [
      'a cleared side',
      {
        ...opportunityResponsibleChanged,
        metadata: { before: ion, after: null },
      },
    ],
    [
      'a missing side',
      { ...opportunityResponsibleChanged, metadata: { after: maria } },
    ],
    [
      'a side without its label',
      {
        ...opportunityResponsibleChanged,
        metadata: {
          before: ion,
          after: { workspaceMembershipId: maria.workspaceMembershipId },
        },
      },
    ],
    [
      'the same member on both sides',
      {
        ...opportunityResponsibleChanged,
        metadata: { before: ion, after: { ...ion } },
      },
    ],
    [
      'a Request target',
      { ...opportunityResponsibleChanged, target: requestTarget },
    ],
  ])(
    'fails closed on an Opportunity responsible change with %s next to a valid one',
    async (_case, malformed) => {
      const { result } = await loadActivityLog({
        events: [opportunityResponsibleChanged, malformed],
      });

      expect(result).toEqual({ status: 'error' });
    },
  );

  it.each<[string, unknown]>([
    ['a non-string Request id', { ...requestTarget, clientRequestId: 358 }],
    ['a blank Request id', { ...requestTarget, clientRequestId: ' ' }],
    ['a missing Request id', { type: 'client_request', companyId }],
    ['a non-string Company', { ...requestTarget, companyId: ['company-a'] }],
    [
      'a missing Company',
      { type: 'client_request', clientRequestId: 'request-358' },
    ],
    ['an Opportunity target', opportunityTarget],
    ['a non-object target', 'request-358'],
  ])('fails closed on a Request event with %s', async (_case, target) => {
    const { result } = await loadActivityLog({
      events: [event('event-request', 'client_request.created', target)],
    });

    expect(result).toEqual({ status: 'error' });
  });

  it.each<[string, unknown]>([
    ['a non-string Request id', { ...opportunityTarget, clientRequestId: 358 }],
    ['a null Request id', { ...opportunityTarget, clientRequestId: null }],
    ['a blank Request id', { ...opportunityTarget, clientRequestId: '' }],
    [
      'a missing Opportunity id',
      { type: 'opportunity', clientRequestId: 'request-358', companyId },
    ],
    [
      'a missing Company',
      {
        type: 'opportunity',
        opportunityId: 'opportunity-358',
        clientRequestId: 'request-358',
      },
    ],
    ['a Request target', requestTarget],
  ])('fails closed on an Opportunity event with %s', async (_case, target) => {
    const { result } = await loadActivityLog({
      events: [
        event('event-opportunity', 'opportunity.next_action.updated', target),
      ],
    });

    expect(result).toEqual({ status: 'error' });
  });

  it.each<[string, unknown]>([
    [
      'a Request target under another action',
      event('event-project', 'project.created', requestTarget),
    ],
    [
      'an unknown commercial action',
      event('event-archived', 'client_request.archived', requestTarget),
    ],
    [
      'a Request target under a Task cancellation',
      event('event-task', 'task.cancelled', requestTarget),
    ],
    [
      'a Task status change without its Task id',
      event('event-task', 'task.status.changed', {
        ...taskTarget,
        taskId: ' ',
      }),
    ],
    [
      'an unknown Task action',
      event('event-task', 'task.archived', taskTarget),
    ],
    [
      'an unknown target type',
      event('event-request', 'client_request.created', {
        ...requestTarget,
        type: 'client_request_v2',
      }),
    ],
    [
      'a union whose target names another operation',
      {
        ...unionEvent,
        target: { ...unionEvent.target, projectionReference: 'union-2' },
      },
    ],
    [
      'an event without an id',
      {
        action: 'client_request.created',
        occurredAt,
        actor,
        target: requestTarget,
      },
    ],
    [
      'an event without an actor label',
      {
        ...event('event-request', 'client_request.created', requestTarget),
        actor: { internalUserId: 'user-1' },
      },
    ],
    [
      'an unreadable time',
      {
        ...event('event-request', 'client_request.created', requestTarget),
        occurredAt: 'yesterday',
      },
    ],
  ])(
    'fails closed on a page with %s next to a valid event',
    async (_case, malformed) => {
      const { result } = await loadActivityLog({
        events: [
          event('event-opportunity', 'opportunity.created', opportunityTarget),
          malformed,
        ],
      });

      expect(result).toEqual({ status: 'error' });
    },
  );

  it.each<[string, unknown]>([
    ['no events', {}],
    ['events that are not a list', { events: { 0: requestTarget } }],
    ['a list instead of a page', []],
    ['null', null],
  ])('fails closed on a successful response with %s', async (_case, body) => {
    const { result } = await loadActivityLog(body);

    expect(result).toEqual({ status: 'error' });
  });

  it('passes access outcomes through unchanged', async () => {
    const { result } = await loadActivityLog({ events: 'ignored' }, 403);

    expect(result).toEqual({ status: 'forbidden' });
  });
});
