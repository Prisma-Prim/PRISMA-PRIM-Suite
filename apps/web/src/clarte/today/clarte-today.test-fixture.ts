import type { ActorContext } from '../../access-types';
import { companyGrants } from '../../access/company-grants.test-fixture';
import {
  MODEL_OFFER_COMPANY,
  modelOfferActor,
  modelOfferFixture,
} from '../../offer/model-offer.fixture';
import {
  buildClientRequest,
  buildRequestListItem,
} from '../../test/commercial-intake-responses';

/**
 * A small stateful API over fictional records for the Clarté Today App tests
 * and browser journey (#1532): the Company summary and its Task lists, the
 * three decision queues, the summaries of two Companies, the Request capture
 * and the direct Contract choice. Every other request is reported as
 * unhandled.
 */

export const todayCompany = {
  id: MODEL_OFFER_COMPANY,
  displayName: 'PRISMA-PRIM',
};
export const todayOtherCompany = {
  id: '00000000-0000-4000-8000-000000001539',
  displayName: 'BIC Consulting',
};
export const todayDate = '2026-11-28';
const workspaceId = modelOfferActor.workspaceId;
const membership = modelOfferActor.workspaceMembershipId;
const owner = {
  workspaceMembershipId: membership,
  displayLabel: 'Ada Ionescu',
};
const colleague = {
  workspaceMembershipId: '20000000-0000-4000-8000-000000001532',
  displayLabel: 'Ion Rusu',
};
const attribution = {
  internalUserId: modelOfferActor.internalUserId,
  workspaceMembershipId: membership,
  displayName: 'Ada Ionescu',
};

export const todayClient = {
  id: '00000000-0000-4000-8000-000000003101',
  displayName: 'Fictional Lumen Dairy SRL',
};
export const todayProject = {
  id: '00000000-0000-4000-8000-000000003001',
  companyId: todayCompany.id,
  clientAccountId: todayClient.id,
  clientDossierId: todayClient.id,
  clientDisplayName: todayClient.displayName,
  title: 'Fictional ISO 22000 certification',
  status: 'preparatory',
  createdAt: '2026-11-02T09:00:00.000Z',
};
const projectRef = {
  id: todayProject.id,
  title: todayProject.title,
  clientDisplayName: todayProject.clientDisplayName,
};

function task(
  id: string,
  title: string,
  dueDate: string,
  overrides: Partial<{
    priority: 'normal' | 'important' | 'critical';
    assignee: typeof owner;
    status: 'todo' | 'in_progress';
  }> = {},
) {
  return {
    description: null,
    id,
    companyId: todayCompany.id,
    projectId: todayProject.id,
    clientAccountId: todayClient.id,
    title,
    assignee: overrides.assignee ?? owner,
    dueDate,
    priority: overrides.priority ?? 'normal',
    status: overrides.status ?? 'todo',
    completion: null,
    version: 1,
    createdAt: '2026-11-10T09:00:00.000Z',
    updatedAt: '2026-11-10T09:00:00.000Z',
    createdBy: attribution,
  };
}

/** Fictional Tasks; the attention, overdue and deadline reads list some twice. */
export const todayTasks = {
  auditPlan: task(
    '00000000-0000-4000-8000-000000005001',
    'Send the audit plan to the Client',
    '2026-11-25',
  ),
  haccp: task(
    '00000000-0000-4000-8000-000000005002',
    'Review the HACCP procedure',
    '2026-11-30',
    { priority: 'critical', status: 'in_progress' },
  ),
  questionnaire: task(
    '00000000-0000-4000-8000-000000005003',
    'Collect the signed questionnaire',
    '2026-11-20',
    { assignee: colleague },
  ),
  call: task(
    '00000000-0000-4000-8000-000000005004',
    'Call the Client about the audit dates',
    '2026-11-28',
  ),
  stageOne: task(
    '00000000-0000-4000-8000-000000005005',
    'Prepare the stage 1 audit',
    '2026-12-02',
  ),
} as const;

const offer = modelOfferFixture();
export const todayDecisions = {
  profitability: {
    workspaceId,
    companyId: todayCompany.id,
    versionId: '00000000-0000-4000-8000-000000004001',
    estimateId: '00000000-0000-4000-8000-000000004002',
    opportunityId: '00000000-0000-4000-8000-000000004003',
    clientRequestId: '00000000-0000-4000-8000-000000004004',
    versionNumber: 2,
    latestVersionNumber: 2,
    createdAt: '2026-11-26T09:00:00.000Z',
    opportunityTitle: 'HACCP support for Lumen Dairy',
  },
  offer: {
    workspaceId,
    companyId: todayCompany.id,
    offerId: offer.id,
    versionId: offer.version.id,
    opportunityId: offer.opportunityId,
    clientRequestId: '00000000-0000-4000-8000-000000004104',
    opportunityTitle: 'ISO 9001 certification for Valea Verde',
    illustrativeReference: offer.illustrativeReference,
    versionNumber: offer.version.versionNumber,
    provenance: 'COMPANY_MODEL_ESTIMATE',
    createdAt: '2026-11-27T10:00:00.000000Z',
  },
  contract: {
    workspaceId,
    companyId: todayCompany.id,
    contractId: '00000000-0000-4000-8000-000000004201',
    versionId: '00000000-0000-4000-8000-000000004202',
    opportunityId: '00000000-0000-4000-8000-000000004203',
    clientRequestId: '00000000-0000-4000-8000-000000004204',
    opportunityTitle: 'Surveillance audit for Nord Logistic',
    illustrativeReference: 7,
    versionNumber: 1,
    kind: 'CONTRACT',
    provenance: 'ILLUSTRATIVE',
    createdAt: '2026-11-27T15:30:00.000000Z',
  },
} as const;

/** The Request whose affaire takes the direct Contract in the journey. */
export const todayDirectRequest = buildClientRequest({
  id: '00000000-0000-4000-8000-000000006001',
  companyId: todayCompany.id,
  subject: 'Renewal agreed by telephone',
  capturedByWorkspaceMembershipId: membership,
  capturedAt: '2026-11-20T09:00:00.000Z',
  clientAssociationStatus: 'visible',
  clientReference: {
    originalClientId: todayClient.id,
    currentClientId: todayClient.id,
    displayName: todayClient.displayName,
  },
  initialOpportunity: {
    id: '00000000-0000-4000-8000-000000006002',
    title: 'Surveillance audit renewal for Lumen Dairy',
    nextAction: 'Prepare the direct Contract',
    responsibleWorkspaceMembershipId: membership,
    responsibleActor: {
      workspaceMembershipId: membership,
      displayName: 'Ada Ionescu',
    },
  },
});
const unassociatedRequest = buildRequestListItem({
  id: '00000000-0000-4000-8000-000000006011',
  subject: 'Question received by e-mail',
  capturedAt: '2026-11-21T09:00:00.000Z',
  initialOpportunity: {
    title: 'Training enquiry without a Client yet',
    responsibleActor: {
      workspaceMembershipId: membership,
      displayName: 'Ada Ionescu',
    },
  },
});
/** The id the fixture gives the Request captured through it. */
export const capturedRequestId = '00000000-0000-4000-8000-000000006101';

const grants = [
  { bundle: 'company_director_client_access', version: 'v1' },
  { bundle: 'company_project_access', version: 'v1' },
  { bundle: 'company_task_manager', version: 'v1' },
  { bundle: 'company_commercial_intake', version: 'v4' },
  { bundle: 'company_profitability_director', version: 'v1' },
  { bundle: 'company_offer_approver', version: 'v2' },
  { bundle: 'company_contract_approver', version: 'v2' },
  { bundle: 'company_contract_preparer', version: 'v2' },
  { bundle: 'company_pricing_user', version: 'v1' },
] as const;

/** A fictional director holding every grant Today offers, in one Company. */
export function todayActor(
  company: { id: string; displayName: string } = todayCompany,
): ActorContext {
  return {
    ...modelOfferActor,
    workspaceName: 'PRISMA Workspace',
    displayName: 'Ada Ionescu',
    email: 'ada@example.test',
    activeCompany: {
      ...company,
      grants: companyGrants(
        ...grants.map((grant, index) => ({
          ...grant,
          assignmentId: `00000000-0000-4000-8000-0000000019${String(index).padStart(2, '0')}`,
        })),
      ),
    },
  };
}

type FakeRequest = Readonly<{
  method: string;
  url: URL;
  body: unknown;
  companyId: string | null;
}>;
type FakeReply = Readonly<{ status: number; json: unknown }>;

export type TodayApiOptions = Readonly<{
  /** Queues answered empty. */
  emptyQueues?: readonly ('profitability' | 'offer' | 'contract')[];
  /** Status of the Company summary read, 200 by default. */
  summaryStatus?: number;
}>;

export function createClarteTodayApi(options: TodayApiOptions = {}) {
  const writes: string[] = [];
  const unhandled = new Set<string>();
  const requests: string[] = [];
  let captured: ReturnType<typeof buildClientRequest> | undefined;
  let activeCompany = todayCompany;
  const ok = (json: unknown, status = 200): FakeReply => ({ status, json });
  const companyOf = (request: FakeRequest) =>
    request.companyId === todayOtherCompany.id
      ? todayOtherCompany
      : todayCompany;

  function summary(company: { id: string }) {
    if (company.id === todayOtherCompany.id)
      return {
        companyId: company.id,
        today: todayDate,
        summaries: [
          { kind: 'active_clients', count: 4 },
          { kind: 'open_projects', count: 2 },
          { kind: 'overdue_tasks', count: 0 },
        ],
        attention: { matchingCount: 0, tasks: [] },
      };
    return {
      companyId: company.id,
      today: todayDate,
      summaries: [
        { kind: 'active_clients', count: 9 },
        { kind: 'open_projects', count: 4 },
        { kind: 'overdue_tasks', count: 2 },
      ],
      attention: {
        matchingCount: 2,
        tasks: [
          {
            ...todayTasks.auditPlan,
            project: projectRef,
            rules: ['overdue'],
            dueInDays: -3,
          },
          {
            ...todayTasks.haccp,
            project: projectRef,
            rules: ['critical', 'due_soon'],
            dueInDays: 2,
          },
        ],
      },
    };
  }
  function page(
    companyId: string,
    offset: number,
    rows: readonly unknown[],
    extra: Record<string, unknown> = {},
  ) {
    return {
      companyId,
      today: todayDate,
      ...extra,
      total: rows.length,
      offset,
      pageSize: 25,
      tasks: rows.slice(offset, offset + 25),
    };
  }

  function reply(request: FakeRequest): FakeReply {
    const path = request.url.pathname;
    const method = request.method;
    requests.push(`${method} ${path}${request.url.search}`);
    if (method !== 'GET') writes.push(`${method} ${path}`);
    const company = companyOf(request);
    const offset = Number(request.url.searchParams.get('offset') ?? 0);
    if (path === '/api/access/current-actor') {
      if (request.companyId) activeCompany = company;
      return ok(todayActor(request.companyId ? company : activeCompany));
    }
    if (path === '/api/companies') return ok([todayCompany, todayOtherCompany]);
    if (path === '/api/activity-log') return ok({ events: [] });
    if (path === '/api/operational-home')
      return options.summaryStatus
        ? { status: options.summaryStatus, json: {} }
        : ok(summary(company));
    if (path === '/api/attention-tasks')
      return ok(
        page(
          company.id,
          offset,
          company.id === todayCompany.id
            ? summary(company).attention.tasks
            : [],
        ),
      );
    if (path === '/api/overdue-tasks')
      return ok(
        page(
          company.id,
          offset,
          company.id === todayCompany.id
            ? [
                {
                  ...todayTasks.questionnaire,
                  project: projectRef,
                  daysOverdue: 8,
                },
                {
                  ...todayTasks.auditPlan,
                  project: projectRef,
                  daysOverdue: 3,
                },
              ]
            : [],
        ),
      );
    if (path === '/api/due-soon-tasks')
      return ok(
        page(
          company.id,
          offset,
          company.id === todayCompany.id
            ? [todayTasks.call, todayTasks.haccp, todayTasks.stageOne].map(
                (row) => ({ ...row, project: projectRef }),
              )
            : [],
          { throughDate: '2026-12-05' },
        ),
      );
    if (path === '/api/profitability-estimate-decision-queue')
      return ok({
        items:
          company.id === todayCompany.id &&
          !options.emptyQueues?.includes('profitability')
            ? [todayDecisions.profitability]
            : [],
      });
    if (path === '/api/offer-decision-queue')
      return ok({
        items:
          company.id === todayCompany.id &&
          !options.emptyQueues?.includes('offer')
            ? [todayDecisions.offer]
            : [],
      });
    if (path === '/api/contract-decision-queue')
      return ok({
        items:
          company.id === todayCompany.id &&
          !options.emptyQueues?.includes('contract')
            ? [todayDecisions.contract]
            : [],
      });
    if (path.startsWith(`/api/offers/opportunities/${offer.opportunityId}`))
      return path.endsWith('/versions')
        ? ok({ versions: [offer.version], nextCursor: null })
        : ok({ offer });
    // No other affaire of the fixture has an Offer.
    if (path.startsWith('/api/offers/opportunities/'))
      return ok({ offer: null });
    if (path === '/api/commercial-intake/requests' && method === 'GET')
      return ok({
        items: [
          {
            ...buildRequestListItem({
              id: todayDirectRequest.id,
              subject: todayDirectRequest.subject,
              capturedAt: todayDirectRequest.capturedAt,
              clientDisplayName: todayClient.displayName,
              clientDossierId: todayClient.id,
              initialOpportunity: {
                title: todayDirectRequest.initialOpportunity.title,
                responsibleActor:
                  todayDirectRequest.initialOpportunity.responsibleActor,
              },
            }),
          },
          unassociatedRequest,
        ],
      });
    if (path === '/api/commercial-intake/requests' && method === 'POST') {
      const body =
        request.body && typeof request.body === 'object' ? request.body : {};
      const fields: Record<string, unknown> = Object.fromEntries(
        Object.entries(body),
      );
      const opportunity =
        fields.opportunity && typeof fields.opportunity === 'object'
          ? Object.fromEntries(Object.entries(fields.opportunity))
          : {};
      captured = buildClientRequest({
        id: capturedRequestId,
        companyId: todayCompany.id,
        subject: typeof fields.subject === 'string' ? fields.subject : null,
        originalText:
          typeof fields.originalText === 'string' ? fields.originalText : '',
        capturedByWorkspaceMembershipId: membership,
        capturedAt: '2026-11-28T09:30:00.000Z',
        initialOpportunity: {
          id: '00000000-0000-4000-8000-000000006102',
          title: typeof opportunity.title === 'string' ? opportunity.title : '',
          nextAction:
            typeof opportunity.nextAction === 'string'
              ? opportunity.nextAction
              : '',
          responsibleWorkspaceMembershipId: membership,
          responsibleActor: {
            workspaceMembershipId: membership,
            displayName: 'Ada Ionescu',
          },
        },
      });
      return ok(captured, 201);
    }
    if (
      captured &&
      path === `/api/commercial-intake/requests/${capturedRequestId}`
    )
      return ok(captured);
    if (path === `/api/commercial-intake/requests/${todayDirectRequest.id}`)
      return ok(todayDirectRequest);
    if (
      path ===
      `/api/contracts/opportunities/${todayDirectRequest.initialOpportunity.id}`
    )
      return ok({ contract: null });
    if (
      path ===
      `/api/pricing/opportunities/${todayDirectRequest.initialOpportunity.id}/snapshots`
    )
      return ok({
        items: [
          {
            id: '00000000-0000-4000-8000-000000006201',
            currency: 'MDL',
            total: '29500.00',
            committedAt: '2026-11-26T09:00:00.000Z',
          },
        ],
      });
    if (path === `/api/clients/${todayClient.id}/legal-entities`)
      return ok({ clientVersion: 1, legalEntities: [] });
    if (path === '/api/clients')
      return ok([{ ...todayClient, relatedToActiveCompany: true }]);
    if (path === '/api/clients/search')
      return ok([{ ...todayClient, relatedToActiveCompany: true }]);
    if (path === '/api/client-duplicate-reviews')
      return ok({ items: [], next_cursor: null });
    if (path === '/api/assigned-tasks') return ok({ tasks: [] });
    // The Pricing section, mounted for the pricing grant, reads its own scope.
    if (path === '/api/pricing-configuration/rule-scope')
      return ok({ current: null, headVersionNumber: null, provisional: true });
    if (path === '/api/pricing-configuration/rule-versions')
      return ok({ items: [], provisional: true });
    if (path === '/api/commercial-catalogue/offerings')
      return ok({ items: [] });
    if (path === '/api/projects')
      return ok(company.id === todayCompany.id ? [todayProject] : []);
    unhandled.add(`${method} ${path}`);
    return { status: 404, json: {} };
  }

  return {
    reply,
    writes,
    unhandled,
    requests,
    /** The Request captured through the fixture, if any. */
    get captured() {
      return captured;
    },
  };
}
