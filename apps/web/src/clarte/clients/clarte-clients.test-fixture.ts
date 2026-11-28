import type { ActorContext } from '../../access-types';
import { companyGrants } from '../../access/company-grants.test-fixture';
import { documentGrantRequests } from '../../documents/document-grants.test-fixture';
import type { ClientLegalEntity } from '../../client/client-legal-entities-response';
import { dealSummaryFor } from '../../test/deal-responses';
import {
  buildClientRequest,
  buildRequestListItem,
} from '../../test/commercial-intake-responses';

/**
 * A small stateful API over fictional records for the Clarté Clients App
 * tests and browser journey (#1536): the Company's Clients, the Workspace
 * search and attachment, registration, one dossier with its Contacts, legal
 * entities, corrections and union history, and the Requests, deals,
 * Projects, Tasks and Documents of that Client. Every other request is
 * reported as unhandled.
 */

export const clientsCompany = {
  id: '00000000-0000-4000-8000-000000001536',
  displayName: 'PRISMA-PRIM',
};
const workspaceId = '00000000-0000-4000-8000-000000001501';
const membership = '00000000-0000-4000-8000-000000001502';
const member = {
  workspaceMembershipId: membership,
  displayName: 'Ada Ionescu',
};

type Contact = Readonly<{
  name: string;
  telephone?: string;
  email?: string;
  position?: string;
  decisionRoles?: readonly string[];
  communicationPreferences?: string;
}>;

type Dossier = {
  id: string;
  displayName: string;
  taxId: string | null;
  address: string | null;
  telephone: string | null;
  generalEmail: string | null;
  businessActivity: string | null;
  contacts: Contact[];
  version: number;
  related: boolean;
};

/** The Client the journey and most tests work with. */
export const orchardClient = {
  id: '00000000-0000-4000-8000-000000003601',
  displayName: 'Codru Orchards SRL',
};
/** A second Company Client, the canonical side of the union. */
export const bakeryClient = {
  id: '00000000-0000-4000-8000-000000003602',
  displayName: 'Nistru Bakery SA',
};
/** A Workspace Client not yet linked to the active Company. */
export const sharedClient = {
  id: '00000000-0000-4000-8000-000000003603',
  displayName: 'Prut Logistics SRL',
};
/** The Client a registration creates. */
export const registeredClient = {
  id: '00000000-0000-4000-8000-000000003604',
  displayName: 'Lumen Dairy SRL',
};

function initialDossiers(): Dossier[] {
  return [
    {
      ...orchardClient,
      taxId: '1018600012345',
      address: 'str. Livezilor 12, Orhei',
      telephone: '+373 235 20 100',
      generalEmail: 'office@codru-orchards.example',
      businessActivity: 'Fruit growing and storage',
      contacts: [
        {
          name: 'Elena Rusu',
          telephone: '+373 69 100 200',
          email: 'elena.rusu@codru-orchards.example',
          position: 'Quality manager',
          decisionRoles: ['final_decision_maker', 'technical'],
          communicationPreferences: 'Romanian, by email before 10:00',
        },
        {
          name: 'Victor Ceban',
          position: 'Chief accountant',
          decisionRoles: ['financial'],
        },
      ],
      version: 3,
      related: true,
    },
    {
      ...bakeryClient,
      taxId: '1018600054321',
      address: 'str. Morii 4, Soroca',
      telephone: null,
      generalEmail: null,
      businessActivity: 'Industrial bakery',
      contacts: [{ name: 'Ion Moraru', position: 'Director' }],
      version: 2,
      related: true,
    },
    {
      ...sharedClient,
      taxId: '1018600077777',
      address: 'str. Portului 1, Giurgiulești',
      telephone: null,
      generalEmail: null,
      businessActivity: 'Freight transport',
      contacts: [],
      version: 1,
      related: false,
    },
  ];
}

const grants = [
  { bundle: 'company_director_client_access', version: 'v2' },
  { bundle: 'company_project_access', version: 'v1' },
  { bundle: 'company_task_manager', version: 'v1' },
  { bundle: 'company_commercial_intake', version: 'v4' },
] as const;

/** A fictional director who manages Clients, Requests and Projects. */
export function clientsActor(): ActorContext {
  return {
    internalUserId: '00000000-0000-4000-8000-000000001503',
    workspaceMembershipId: membership,
    workspaceId,
    workspaceName: 'PRISMA Workspace',
    displayName: member.displayName,
    email: 'ada@example.test',
    active: true,
    workspacePermissions: ['client.manage'],
    activeCompany: {
      ...clientsCompany,
      grants: companyGrants(
        ...grants.map((grant, index) => ({
          ...grant,
          assignmentId: `00000000-0000-4000-8000-0000000036${String(index).padStart(2, '0')}`,
        })),
        ...documentGrantRequests(['document.read']),
      ),
    },
  };
}

export const orchardDocument = {
  id: '00000000-0000-4000-8000-000000004751',
  companyId: clientsCompany.id,
  clientId: orchardClient.id,
  clientDossierId: orchardClient.id,
  clientDisplayName: orchardClient.displayName,
  title: 'Signed certification questionnaire',
  purpose: 'Scope the certification audit',
  type: 'questionnaire',
  confidentiality: 'company-confidential',
  createdAt: '2026-11-24T08:00:00.000Z',
  workingRevision: 1,
  correction: 'allowed',
  version: {
    id: '00000000-0000-4000-8000-000000004752',
    status: 'draft',
    representation: {
      id: '00000000-0000-4000-8000-000000004753',
      kind: 'external-reference',
      verification: 'unverified',
      access: 'denied',
    },
  },
};

export const orchardRequest = buildClientRequest({
  id: '00000000-0000-4000-8000-000000004601',
  companyId: clientsCompany.id,
  subject: 'ISO 22000 certification of the packing line',
  originalText:
    'We would like to certify our packing line against ISO 22000 next spring.',
  capturedByWorkspaceMembershipId: membership,
  capturedAt: '2026-11-12T09:00:00.000Z',
  clientAssociationStatus: 'visible',
  clientReference: {
    originalClientId: orchardClient.id,
    currentClientId: orchardClient.id,
    displayName: orchardClient.displayName,
  },
  initialOpportunity: {
    id: '00000000-0000-4000-8000-000000004602',
    title: 'ISO 22000 for the packing line',
    nextAction: 'Send the questionnaire',
    responsibleWorkspaceMembershipId: membership,
    responsibleActor: member,
  },
});
const bakeryRequest = buildClientRequest({
  id: '00000000-0000-4000-8000-000000004603',
  companyId: clientsCompany.id,
  subject: 'HACCP training for the night shift',
  originalText: 'Training for twelve people on the night shift.',
  capturedByWorkspaceMembershipId: membership,
  capturedAt: '2026-11-18T09:00:00.000Z',
  clientAssociationStatus: 'visible',
  clientReference: {
    originalClientId: bakeryClient.id,
    currentClientId: bakeryClient.id,
    displayName: bakeryClient.displayName,
  },
  initialOpportunity: {
    id: '00000000-0000-4000-8000-000000004604',
    title: 'HACCP training',
    nextAction: 'Agree on the dates',
    responsibleWorkspaceMembershipId: membership,
    responsibleActor: member,
  },
});

export const orchardProject = {
  id: '00000000-0000-4000-8000-000000004701',
  companyId: clientsCompany.id,
  clientAccountId: orchardClient.id,
  clientDossierId: orchardClient.id,
  clientDisplayName: orchardClient.displayName,
  title: 'ISO 22000 certification 2027',
  status: 'active',
  createdAt: '2026-11-20T09:00:00.000Z',
  responsible: {
    workspaceMembershipId: membership,
    displayLabel: 'Ada Ionescu',
  },
};
export const orchardTask = {
  description: null,
  id: '00000000-0000-4000-8000-000000004702',
  companyId: clientsCompany.id,
  projectId: orchardProject.id,
  clientAccountId: orchardClient.id,
  title: 'Collect the signed questionnaire',
  assignee: { workspaceMembershipId: membership, displayLabel: 'Ada Ionescu' },
  dueDate: '2026-12-04',
  priority: 'normal',
  status: 'todo',
  completion: null,
  version: 1,
  createdAt: '2026-11-21T09:00:00.000Z',
  updatedAt: '2026-11-21T09:00:00.000Z',
  createdBy: {
    internalUserId: '00000000-0000-4000-8000-000000001503',
    workspaceMembershipId: membership,
    displayName: member.displayName,
  },
};

const legalEntity: ClientLegalEntity = {
  id: '00000000-0000-4000-8000-000000004801',
  legalName: 'Codru Orchards SRL — Orhei branch',
  taxId: null,
  legalAddress: 'str. Livezilor 14, Orhei',
  createdAt: '2026-11-15T09:00:00.000Z',
};
const correction = {
  id: '00000000-0000-4000-8000-000000004901',
  occurredAt: '2026-11-22T10:15:00.000Z',
  actor: { displayName: member.displayName },
  changes: {
    address: {
      before: 'str. Livezilor 10, Orhei',
      after: 'str. Livezilor 12, Orhei',
    },
  },
};
const unionReference = '00000000-0000-4000-8000-000000004951';

type FakeRequest = Readonly<{
  method: string;
  url: URL;
  body: unknown;
  companyId: string | null;
}>;
type FakeReply = Readonly<{ status: number; json: unknown }>;

export type ClientsApiOptions = Readonly<{
  /** The status the Company's Client list answers with instead of the list. */
  listStatus?: number;
  /** The Company starts without any Client. */
  empty?: boolean;
  /** The status a dossier read answers with instead of the dossier. */
  dossierStatus?: number;
}>;

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value))
    : {};
}
function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function createClarteClientsApi(options: ClientsApiOptions = {}) {
  const requests: string[] = [];
  const writes: string[] = [];
  const unhandled = new Set<string>();
  let dossiers = initialDossiers();
  if (options.empty) dossiers = dossiers.filter((dossier) => !dossier.related);
  let legalEntities = [legalEntity];
  const corrections = [correction];
  let united = false;
  const ok = (json: unknown, status = 200): FakeReply => ({ status, json });
  const account = (dossier: Dossier) => ({
    id: dossier.id,
    displayName: dossier.displayName,
    relatedToActiveCompany: dossier.related,
  });
  const visible = () =>
    dossiers.filter((dossier) => !(united && dossier.id === orchardClient.id));
  const view = (dossier: Dossier) => ({
    ...account(dossier),
    taxId: dossier.taxId,
    address: dossier.address,
    telephone: dossier.telephone,
    generalEmail: dossier.generalEmail,
    businessActivity: dossier.businessActivity,
    contacts: dossier.contacts,
    version: dossier.version,
    involvedCompanyDisplayNames: [clientsCompany.displayName],
  });
  const unionClient = (dossier: Dossier) => ({
    id: dossier.id,
    displayName: dossier.displayName,
    taxId: dossier.taxId,
    address: dossier.address,
    telephone: dossier.telephone,
    generalEmail: dossier.generalEmail,
    businessActivity: dossier.businessActivity,
    contacts: dossier.contacts,
    version: dossier.version,
  });
  const find = (id: string) => dossiers.find((dossier) => dossier.id === id);
  const requestsOf = (clientId: string) =>
    [orchardRequest, bakeryRequest].filter(
      (request) =>
        (united && request === orchardRequest
          ? bakeryClient.id
          : request.clientReference?.currentClientId) === clientId,
    );

  function reply(request: FakeRequest): FakeReply {
    const path = request.url.pathname;
    const method = request.method;
    const query = request.url.searchParams;
    requests.push(`${method} ${path}${request.url.search}`);
    if (method !== 'GET') writes.push(`${method} ${path}`);
    if (path === '/api/access/current-actor') return ok(clientsActor());
    if (path === '/api/companies') return ok([clientsCompany]);
    if (path === '/api/activity-log') return ok({ events: [] });
    if (path === '/api/clients' && method === 'GET')
      return options.listStatus
        ? { status: options.listStatus, json: {} }
        : ok(
            visible()
              .filter((dossier) => dossier.related)
              .map(account),
          );
    if (path === '/api/clients' && method === 'POST') {
      const body = record(request.body);
      const created: Dossier = {
        ...registeredClient,
        displayName: text(body.displayName) ?? registeredClient.displayName,
        taxId: text(body.taxId),
        address: text(body.address),
        telephone: text(body.telephone),
        generalEmail: text(body.generalEmail),
        businessActivity: text(body.businessActivity),
        contacts: Array.isArray(body.contacts)
          ? body.contacts.map((contact) => {
              const fields = record(contact);
              return {
                name: text(fields.name) ?? '',
                ...(text(fields.position)
                  ? { position: text(fields.position) ?? '' }
                  : {}),
              };
            })
          : [],
        version: 1,
        related: true,
      };
      dossiers = [...dossiers, created];
      return ok(account(created), 201);
    }
    if (path === '/api/clients/search') {
      const term = (query.get('query') ?? '').toLocaleLowerCase();
      return ok(
        visible()
          .filter((dossier) =>
            dossier.displayName.toLocaleLowerCase().includes(term),
          )
          .map(account),
      );
    }
    if (path === '/api/client-duplicate-reviews')
      return ok({ items: [], next_cursor: null });
    if (path === '/api/client-union-sources') return ok([]);
    if (path === `/api/client-union-reviews/${unionReference}/confirm`) {
      united = true;
      return ok(
        {
          outcome: 'united',
          canonicalClientId: bakeryClient.id,
          projectionReference: unionReference,
        },
        201,
      );
    }
    if (path === `/api/client-union-operations/${unionReference}`) {
      const orchard = find(orchardClient.id);
      const bakery = find(bakeryClient.id);
      if (!orchard || !bakery) return ok({}, 404);
      return ok({
        state: united ? 'united' : 'reversed',
        projectionReference: unionReference,
        canonicalClientId: bakeryClient.id,
        originals: [unionClient(orchard), unionClient(bakery)],
        companies: [clientsCompany],
        reason: 'Same legal identity, registered twice.',
        occurredAt: '2026-11-27T12:00:00.000Z',
        actor: { displayName: member.displayName },
        reversal: null,
        canReverse: united,
      });
    }
    if (path === `/api/client-union-operations/${unionReference}/reversal`) {
      united = false;
      return ok(
        {
          outcome: 'reversed',
          clientIds: [orchardClient.id, bakeryClient.id],
        },
        201,
      );
    }
    const clientPath = /^\/api\/clients\/([^/]+)(?:\/(.+))?$/u.exec(path);
    if (clientPath) {
      const id = decodeURIComponent(clientPath[1] ?? '');
      const rest = clientPath[2];
      const dossier = find(id);
      if (!dossier) return ok({}, 404);
      if (rest === undefined && method === 'GET')
        return options.dossierStatus
          ? { status: options.dossierStatus, json: {} }
          : ok(view(dossier));
      if (rest === undefined && method === 'PATCH') {
        const body = record(request.body);
        dossier.displayName = text(body.displayName) ?? dossier.displayName;
        dossier.taxId = text(body.taxId);
        dossier.address = text(body.address);
        dossier.telephone = text(body.telephone);
        dossier.generalEmail = text(body.generalEmail);
        dossier.businessActivity = text(body.businessActivity);
        dossier.version += 1;
        return ok(view(dossier));
      }
      if (rest === 'active-company-relationship' && method === 'PUT') {
        dossier.related = true;
        return ok(account(dossier));
      }
      if (rest === 'legal-entities' && method === 'GET')
        return ok({
          clientVersion: dossier.version,
          legalEntities: dossier.id === orchardClient.id ? legalEntities : [],
        });
      if (rest === 'legal-entities' && method === 'POST') {
        const body = record(request.body);
        const added = {
          id: '00000000-0000-4000-8000-000000004802',
          legalName: text(body.legalName) ?? '',
          taxId: text(body.taxId),
          legalAddress: text(body.legalAddress),
          createdAt: '2026-11-28T09:00:00.000Z',
        };
        legalEntities = [...legalEntities, added];
        dossier.version += 1;
        return ok({ clientVersion: dossier.version, legalEntity: added }, 201);
      }
      if (rest === 'correction-history')
        return ok({
          corrections: dossier.id === orchardClient.id ? corrections : [],
          nextCursor: null,
        });
      if (rest === 'union-reviews' && method === 'POST') {
        const bakery = find(bakeryClient.id);
        if (!bakery) return ok({}, 404);
        return ok(
          {
            outcome: 'comparison',
            reviewReference: unionReference,
            clients: [unionClient(dossier), unionClient(bakery)],
            companies: [clientsCompany],
          },
          201,
        );
      }
      if (rest === 'union-history')
        return ok({
          events: united
            ? [
                {
                  action: 'client.union_confirmed',
                  projectionReference: unionReference,
                  companyId: clientsCompany.id,
                },
              ]
            : [],
          detailReferences: united ? [unionReference] : [],
        });
    }
    if (path === '/api/commercial-intake/requests' && method === 'GET') {
      const dossierId = query.get('clientDossierId');
      const rows = (
        dossierId ? requestsOf(dossierId) : [orchardRequest, bakeryRequest]
      ).map((row) => ({
        ...buildRequestListItem({
          id: row.id,
          subject: row.subject,
          capturedAt: row.capturedAt,
          initialOpportunity: {
            title: row.initialOpportunity.title,
            nextAction: row.initialOpportunity.nextAction,
            responsibleActor: member,
          },
        }),
        clientDossierId: row.clientReference?.currentClientId,
        clientDisplayName: row.clientReference?.displayName,
      }));
      return ok({ items: rows });
    }
    for (const row of [orchardRequest, bakeryRequest]) {
      if (path === `/api/commercial-intake/requests/${row.id}`) return ok(row);
      if (path === `/api/deals/${row.initialOpportunity.id}`)
        return ok({
          ...dealSummaryFor(row),
          opportunityVersion: row.initialOpportunity.version,
          stages: [
            {
              stage: 'request',
              marker: 'current',
              capturedAt: row.capturedAt,
              clientAssociationStatus: row.clientAssociationStatus,
            },
            {
              stage: 'costing',
              marker: 'upcoming',
              pricingSnapshot: { readable: true, value: null },
              profitabilityEstimate: { readable: true, value: null },
            },
            { stage: 'offer', marker: 'upcoming', offer: null },
            { stage: 'contract', marker: 'upcoming', agreements: [] },
            { stage: 'delivery', marker: 'not_available' },
            { stage: 'closure', marker: 'not_available' },
            {
              stage: 'collection',
              marker: 'not_applicable',
              link: 'not_linked',
            },
          ],
        });
    }
    if (path === '/api/deals')
      return ok({
        items: [orchardRequest, bakeryRequest].map((row) =>
          dealSummaryFor(row),
        ),
      });
    if (path === '/api/projects') {
      const dossierId = query.get('clientDossierId');
      if (dossierId)
        return ok({
          companyId: clientsCompany.id,
          clientDossierId: dossierId,
          offset: Number(query.get('offset') ?? 0),
          pageSize: 25,
          hasMore: false,
          items: dossierId === orchardClient.id ? [orchardProject] : [],
        });
      return ok([orchardProject]);
    }
    if (path === `/api/projects/${orchardProject.id}/tasks`)
      return ok({ mutable: true, tasks: [orchardTask] });
    if (path === '/api/assigned-tasks') return ok({ tasks: [] });
    if (path === '/api/documents') return ok([orchardDocument]);
    if (path === `/api/documents/${orchardDocument.id}`)
      return ok(orchardDocument);
    unhandled.add(`${method} ${path}`);
    return { status: 404, json: {} };
  }

  return {
    reply,
    requests,
    writes,
    unhandled,
    isUnited: () => united,
  };
}
