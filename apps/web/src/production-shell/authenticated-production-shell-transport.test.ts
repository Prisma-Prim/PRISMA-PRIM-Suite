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
const documentProjectTarget = {
  type: 'document_project',
  documentId: 'document-1',
  documentTitle: 'Audit contract',
  projectId: 'project-1',
  projectTitle: 'Audit preparation',
  companyId,
};
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
const legitimateTargets: Array<[string, Record<string, unknown>]> = [
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
    'company_commercial_activity_reader_assignment',
    'company_context_assignment',
    'company_director_client_assignment',
    'company_document_project_organizer_assignment',
    'company_document_registrar_assignment',
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
  ['task.completed', taskTarget],
  ['task.reopened', taskTarget],
  [
    'document.registered',
    {
      type: 'document',
      documentId: 'document-1',
      documentTitle: 'Audit contract',
      companyId,
    },
  ],
  [
    'document.corrected',
    { type: 'document', documentId: 'document-1', companyId },
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

  it('accepts every delivered action with its own target, including historical Client scope and redacted unions', async () => {
    const events = [
      ...legitimateTargets.map(([action, target], index) =>
        event(`event-${index}`, action, target),
      ),
      unionEvent,
    ];

    const { result } = await loadActivityLog({ events });

    expect(result).toEqual({
      status: 'ok',
      value: {
        events: [
          ...legitimateTargets.map(([action, target], index) => ({
            id: `event-${index}`,
            action,
            occurredAt,
            actor,
            target,
          })),
          unionEvent,
        ],
      },
    });
  });

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
