import type { ActorContext } from '../../access-types';
import type { CompanyGrantBundle } from '../../access/company-grants';
import {
  companyGrants,
  type CompanyGrantRequest,
} from '../../access/company-grants.test-fixture';

/**
 * A small stateful Documents, Projects and Knowledge API over fictional
 * records, shared by the Clarté Documents App tests and browser journey
 * (#1543). It answers only what the slice reads and writes; every other
 * request is reported as unhandled.
 */

export const clarteDocumentsCompany = {
  id: '00000000-0000-4000-8000-000000001543',
  displayName: 'PRISMA-PRIM',
};
export const clarteDocumentsClient = {
  id: '00000000-0000-4000-8000-000000001601',
  displayName: 'Fictional Lumen Dairy SRL',
};
export const clarteDocumentsOtherClient = {
  id: '00000000-0000-4000-8000-000000001602',
  displayName: 'Fictional Valea Verde SA',
};
export const clarteDocumentsProject = {
  id: '00000000-0000-4000-8000-000000001951',
  companyId: clarteDocumentsCompany.id,
  clientAccountId: clarteDocumentsClient.id,
  clientDossierId: clarteDocumentsClient.id,
  clientDisplayName: clarteDocumentsClient.displayName,
  title: 'Fictional ISO 22000 certification mission',
  status: 'preparatory',
  createdAt: '2026-11-20T09:00:00.000Z',
};
export const seededDocumentIds = {
  questionnaire: '00000000-0000-4000-8000-000000002001',
  report: '00000000-0000-4000-8000-000000002002',
  contract: '00000000-0000-4000-8000-000000002003',
} as const;
/** The id the fixture gives the n-th Document registered through it, from 1. */
export function registeredDocumentId(sequence: number): string {
  return `00000000-0000-4000-8000-${String(2100 + sequence).padStart(12, '0')}`;
}

const encoder = new TextEncoder();
export const clarteDocumentPdf = encoder.encode(
  '%PDF-1.4\n% Fictional signed questionnaire, no real Client data\n%%EOF\n',
);
const clarteDocumentPdfSha256 =
  'b6f0360ae0ffa1094b9edf56e13d1a73584dd02a9eaf18eaa9d704e857d6034f';
export const clarteKnowledgePdf = encoder.encode(
  '%PDF-1.4\n% Fictional admitted procedure for the Clarté journey\n%%EOF\n',
);
export const clarteKnowledgeSource = {
  sourceId: '00000000-0000-4000-8000-000000001701',
  documentId: '00000000-0000-4000-8000-000000001702',
  documentVersionId: '00000000-0000-4000-8000-000000001703',
  representationId: '00000000-0000-4000-8000-000000001704',
  title: 'Fictional internal audit procedure v5',
  language: 'en',
  versionStatus: 'official',
  sourceSha256:
    '5c5fda6e196a05c314bf31bbf9c6ec400d18142cf37d7a87eb2e59278ddca9d3',
  projectionSha256: 'c'.repeat(64),
};
export const clartePassageText =
  'Measuring instruments are calibrated every year by an accredited laboratory.';
export const clartePassage = {
  source: clarteKnowledgeSource,
  locator: 'section 4.2',
  text: clartePassageText,
  passageSha256:
    '759b581c7a7ab547d9069f3fa40fa77fd3eb0c22ff74f33d48f783550c2c503c',
  retrievedAt: '2026-11-27T09:30:00.000Z',
};
export const clarteContractSource = {
  opportunityId: '00000000-0000-4000-8000-000000001801',
  contractId: '00000000-0000-4000-8000-000000001802',
  contractVersionId: '00000000-0000-4000-8000-000000001803',
  contractVersionNumber: 2,
  illustrativeReference: 29,
  clientId: clarteDocumentsOtherClient.id,
  clientDisplayName: clarteDocumentsOtherClient.displayName,
  opportunityTitle: 'Fictional ISO 22000 certification',
};

const recordedParty = {
  kind: 'PRIMARY',
  legalName: 'Fictional Valea Verde SA',
  taxId: null,
  legalAddress: null,
};
/** An executed parent Contract Version a received Addendum can be linked to. */
export const clarteAddendumSource = {
  parentContractId: clarteContractSource.contractId,
  parentContractVersionId: clarteContractSource.contractVersionId,
  contractVersionNumber: clarteContractSource.contractVersionNumber,
  illustrativeReference: clarteContractSource.illustrativeReference,
  clientId: clarteDocumentsOtherClient.id,
  clientDisplayName: clarteDocumentsOtherClient.displayName,
  opportunityTitle: clarteContractSource.opportunityTitle,
  recordedRecipient: recordedParty,
};
/** A declared Contract Version an external Invoice can be linked to. */
export const clarteInvoiceSource = {
  ...clarteContractSource,
  recordedRecipient: recordedParty,
};

const documentsGrants: readonly CompanyGrantRequest[] = [
  {
    bundle: 'company_director_client_access',
    version: 'v1',
    assignmentId: '00000000-0000-4000-8000-000000001900',
  },
  {
    bundle: 'company_project_access',
    version: 'v1',
    assignmentId: '00000000-0000-4000-8000-000000001901',
  },
  {
    bundle: 'company_document_registrar',
    version: 'v3',
    assignmentId: '00000000-0000-4000-8000-000000001902',
  },
  {
    bundle: 'company_document_approver',
    version: 'v1',
    assignmentId: '00000000-0000-4000-8000-000000001903',
  },
  {
    bundle: 'company_document_content_reader',
    version: 'v1',
    assignmentId: '00000000-0000-4000-8000-000000001904',
  },
  {
    bundle: 'company_document_content_uploader',
    version: 'v1',
    assignmentId: '00000000-0000-4000-8000-000000001905',
  },
  {
    bundle: 'company_document_project_organizer',
    version: 'v1',
    assignmentId: '00000000-0000-4000-8000-000000001906',
  },
  {
    bundle: 'company_mission_deliverable_access',
    version: 'v1',
    assignmentId: '00000000-0000-4000-8000-000000001907',
  },
  {
    bundle: 'company_received_contract_access',
    version: 'v1',
    assignmentId: '00000000-0000-4000-8000-000000001908',
  },
  {
    bundle: 'company_contract_preparer',
    version: 'v2',
    assignmentId: '00000000-0000-4000-8000-000000001909',
  },
  {
    bundle: 'company_commercial_intake',
    version: 'v4',
    assignmentId: '00000000-0000-4000-8000-000000001910',
  },
  {
    bundle: 'company_knowledge_evidence_reader',
    version: 'v1',
    assignmentId: '00000000-0000-4000-8000-000000001911',
  },
];

/**
 * A fictional member holding every Documents and Knowledge grant, less the
 * bundles named in `without`.
 */
export function clarteDocumentsActor(
  without: readonly CompanyGrantBundle[] = [],
): ActorContext {
  return {
    internalUserId: '00000000-0000-4000-8000-000000000001',
    workspaceMembershipId: '00000000-0000-4000-8000-000000000002',
    workspaceId: '00000000-0000-4000-8000-000000000003',
    workspaceName: 'PRISMA Workspace',
    displayName: 'Ada Ionescu',
    email: 'ada@example.test',
    active: true,
    workspacePermissions: [],
    activeCompany: {
      ...clarteDocumentsCompany,
      grants: companyGrants(
        ...documentsGrants.filter((grant) => !without.includes(grant.bundle)),
      ),
    },
  };
}

const registrar = { displayName: 'Ada Ionescu' };
const at = (minute: number) =>
  `2026-11-27T${String(9 + Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}:00.000Z`;

type Row = Record<string, unknown> & {
  id: string;
  type: string;
  clientId: string;
  title: string;
  purpose: string;
  workingRevision: number;
  version: Record<string, unknown> & { id: string; status: string };
};
type Version = Record<string, unknown> & {
  id: string;
  number: number;
  status: 'draft' | 'official' | 'superseded';
  representations: Array<Record<string, unknown> & { id: string }>;
};
type Stored = { row: Row; versions: Version[]; corrections: unknown[] };

function reference(id: string, url: string, minute: number, position = 1) {
  return {
    id,
    kind: 'external-reference',
    verification: 'unverified',
    position,
    form: 'other',
    primary: position === 1,
    appendedAfterDesignation: false,
    addedAt: at(minute),
    addedBy: registrar,
    access: 'granted',
    url,
  };
}

function row(
  id: string,
  type: string,
  title: string,
  purpose: string,
  owner: { id: string; displayName: string },
  minute: number,
) {
  return {
    id,
    companyId: clarteDocumentsCompany.id,
    clientId: owner.id,
    clientDossierId: owner.id,
    clientDisplayName: owner.displayName,
    title,
    purpose,
    type,
    confidentiality: 'company-confidential',
    createdAt: at(minute),
    workingRevision: 1,
    correction: 'allowed',
  };
}

function relation(sourceDescription: string, minute: number) {
  return {
    access: 'granted',
    opportunityId: clarteContractSource.opportunityId,
    contractId: clarteContractSource.contractId,
    contractVersionId: clarteContractSource.contractVersionId,
    contractVersionNumber: clarteContractSource.contractVersionNumber,
    illustrativeReference: clarteContractSource.illustrativeReference,
    sourceDescription,
    receivedOn: null,
    registeredAt: at(minute),
    registeredBy: {
      workspaceMembershipId: '00000000-0000-4000-8000-000000000002',
      internalUserId: '00000000-0000-4000-8000-000000000001',
    },
  };
}

function draft(
  id: string,
  minute: number,
  representations: Version['representations'],
) {
  return {
    id,
    number: 1,
    status: 'draft' as const,
    createdAt: at(minute),
    createdBy: registrar,
    pdfContent: { state: 'absent' },
    representations,
  };
}

function seeded(): Stored[] {
  const { questionnaire, report, contract } = seededDocumentIds;
  const assessmentUrl = 'https://example.test/fictional/assessment.docx';
  return [
    {
      row: {
        ...row(
          questionnaire,
          'questionnaire',
          'Fictional initial assessment questionnaire',
          'Prepare the fictional stage 1 audit',
          clarteDocumentsClient,
          1,
        ),
        version: {
          id: `${questionnaire}-v1`,
          status: 'official',
          representation: reference(`${questionnaire}-r1`, assessmentUrl, 1),
        },
      },
      versions: [
        {
          ...draft(`${questionnaire}-v1`, 1, [
            reference(`${questionnaire}-r1`, assessmentUrl, 1),
          ]),
          status: 'official',
          designatedAt: at(2),
          designatedBy: registrar,
          frozen: {
            title: 'Fictional initial assessment questionnaire',
            purpose: 'Prepare the fictional stage 1 audit',
          },
        },
      ],
      corrections: [],
    },
    {
      row: {
        ...row(
          report,
          'mission-deliverable',
          'Fictional stage 1 audit report',
          'Preserve the fictional mission output',
          clarteDocumentsClient,
          3,
        ),
        version: { id: `${report}-v1`, status: 'draft', representation: null },
      },
      versions: [draft(`${report}-v1`, 3, [])],
      corrections: [],
    },
    {
      row: {
        ...row(
          contract,
          'received-contract',
          'Fictional signed Contract CTR-29',
          'Keep the fictional signed original',
          clarteDocumentsOtherClient,
          4,
        ),
        version: {
          id: `${contract}-v1`,
          status: 'draft',
          representation: null,
        },
        receivedContractRelation: relation('Fictional email', 4),
      },
      versions: [draft(`${contract}-v1`, 4, [])],
      corrections: [],
    },
  ];
}

export type FakeRequest = Readonly<{
  method: string;
  url: URL;
  /** The parsed JSON body, when the request sent one. */
  body: unknown;
}>;
export type FakeReply = Readonly<{
  status: number;
  json?: unknown;
  pdf?: Uint8Array<ArrayBuffer>;
}>;

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Expected a JSON object body');
  return Object.fromEntries(Object.entries(value));
}
function text(value: unknown): string {
  if (typeof value !== 'string') throw new Error('Expected a text field');
  return value;
}
function count(value: unknown): number {
  if (typeof value !== 'number') throw new Error('Expected a revision');
  return value;
}

export function createClarteDocumentsApi(
  options: Readonly<{
    actor?: ActorContext;
    documents?: 'seeded' | 'none';
    /** A status that replaces the Documents list read, such as 403 or 500. */
    listStatus?: number;
  }> = {},
) {
  const actor = options.actor ?? clarteDocumentsActor();
  const documents = options.documents === 'none' ? [] : seeded();
  const writes: string[] = [];
  const unhandled = new Set<string>();
  const associations = new Map<string, { linked: boolean; revision: number }>(
    options.documents === 'none'
      ? []
      : [[seededDocumentIds.questionnaire, { linked: true, revision: 1 }]],
  );
  let registered = 0;
  const association = (id: string) =>
    associations.get(id) ?? { linked: false, revision: 0 };
  const find = (id: string) => documents.find((entry) => entry.row.id === id);
  const detail = (entry: Stored) =>
    entry.row.type === 'questionnaire' ||
    entry.row.type === 'mission-deliverable' ||
    entry.row.type === 'received-contract'
      ? {
          ...entry.row,
          projectAssociation: association(entry.row.id).linked
            ? {
                state: 'linked',
                project: {
                  id: clarteDocumentsProject.id,
                  title: clarteDocumentsProject.title,
                },
              }
            : { state: 'unlinked' },
        }
      : entry.row;
  const projectRows = (linked: boolean) =>
    documents
      .filter(
        (entry) =>
          entry.row.clientId === clarteDocumentsProject.clientAccountId &&
          entry.row.type !== 'received-contract' &&
          association(entry.row.id).linked === linked,
      )
      .map((entry) => ({
        document: entry.row,
        revision: association(entry.row.id).revision,
      }));
  const versionReceipt = (
    entry: Stored,
    version: Version,
    action: string,
    extra: Record<string, unknown> = {},
  ) => ({
    documentId: entry.row.id,
    workingRevision: entry.row.workingRevision,
    versionId: version.id,
    versionNumber: version.number,
    action,
    ...extra,
  });
  const ok = (json: unknown, status = 200): FakeReply => ({ status, json });

  function register(body: Record<string, unknown>): FakeReply {
    registered += 1;
    const id = registeredDocumentId(registered);
    const received = body.type === 'received-contract';
    const minute = 10 + registered;
    const url = received ? '' : text(body.url);
    const entry: Stored = {
      row: {
        ...row(
          id,
          received ? 'received-contract' : 'questionnaire',
          text(body.title),
          text(body.purpose),
          received ? clarteDocumentsOtherClient : clarteDocumentsClient,
          minute,
        ),
        version: {
          id: `${id}-v1`,
          status: 'draft',
          representation: received ? null : reference(`${id}-r1`, url, minute),
        },
        ...(received
          ? {
              receivedContractRelation: relation(
                text(body.sourceDescription),
                minute,
              ),
            }
          : {}),
      },
      versions: [
        draft(
          `${id}-v1`,
          minute,
          received ? [] : [reference(`${id}-r1`, url, minute)],
        ),
      ],
      corrections: [],
    };
    documents.unshift(entry);
    return ok(detail(entry), 201);
  }

  function correct(entry: Stored, body: Record<string, unknown>): FakeReply {
    if (count(body.expectedRevision) !== entry.row.workingRevision)
      return { status: 409, json: {} };
    const changes: Record<string, { before: string; after: string }> = {};
    for (const field of ['title', 'purpose'] as const)
      if (entry.row[field] !== text(body[field]))
        changes[field] = { before: entry.row[field], after: text(body[field]) };
    entry.row.title = text(body.title);
    entry.row.purpose = text(body.purpose);
    entry.row.workingRevision += 1;
    entry.corrections.unshift({
      revision: entry.row.workingRevision,
      occurredAt: at(50),
      actor: registrar,
      changes,
    });
    return ok({
      documentId: entry.row.id,
      revision: entry.row.workingRevision,
      outcome: 'corrected',
    });
  }

  function versionCommand(
    entry: Stored,
    version: Version | undefined,
    action: string | undefined,
    item: string | undefined,
    request: FakeRequest,
  ): FakeReply | undefined {
    const body =
      request.method === 'POST' && request.body !== undefined
        ? object(request.body)
        : {};
    if (!version && request.method === 'POST') {
      // Start a new draft from the official Version.
      const official = entry.versions.find(
        (candidate) => candidate.status === 'official',
      );
      if (!official) return { status: 409, json: {} };
      entry.row.workingRevision += 1;
      const next: Version = {
        ...draft(
          `${entry.row.id}-v${entry.versions.length + 1}`,
          60,
          official.representations.map((representation, index) => ({
            ...representation,
            id: `${representation.id}-d${entry.versions.length + 1}`,
            position: index + 1,
            appendedAfterDesignation: false,
          })),
        ),
        number: entry.versions.length + 1,
      };
      entry.versions.unshift(next);
      entry.row.version = {
        id: next.id,
        status: 'draft',
        representation: next.representations[0] ?? null,
      };
      return ok(
        versionReceipt(entry, next, 'drafted', {
          sourceVersionNumber: official.number,
        }),
        201,
      );
    }
    if (!version) return undefined;
    if (action === 'official-designation') {
      const previous = entry.versions.find(
        (candidate) => candidate.status === 'official',
      );
      if (previous) previous.status = 'superseded';
      if (previous)
        Object.assign(previous, {
          supersededAt: at(40),
          supersededByVersionNumber: version.number,
        });
      Object.assign(version, {
        status: 'official',
        designatedAt: at(40),
        designatedBy: registrar,
        frozen: { title: entry.row.title, purpose: entry.row.purpose },
      });
      entry.row.workingRevision += 1;
      entry.row.version = {
        ...entry.row.version,
        id: version.id,
        status: 'official',
      };
      return ok(
        versionReceipt(entry, version, 'designated_official', {
          supersededVersionNumber: previous?.number ?? null,
        }),
      );
    }
    if (action === 'representations' && item === undefined) {
      entry.row.workingRevision += 1;
      const added = {
        ...reference(
          `${version.id}-r${version.representations.length + 1}`,
          text(body.url),
          45,
          version.representations.length + 1,
        ),
        form: text(body.form),
        appendedAfterDesignation: version.status === 'official',
      };
      version.representations.push(added);
      return ok(
        versionReceipt(entry, version, 'representation_added', {
          representationId: added.id,
          appendedAfterDesignation: added.appendedAfterDesignation,
        }),
        201,
      );
    }
    if (action === 'representations' && item) {
      version.representations = version.representations.filter(
        (representation) => representation.id !== item,
      );
      entry.row.workingRevision += 1;
      return ok(
        versionReceipt(entry, version, 'representation_removed', {
          representationId: item,
        }),
      );
    }
    if (action === 'content' && request.method === 'POST') {
      entry.row.workingRevision += 1;
      version.pdfContent = {
        state: 'stored',
        access: 'granted',
        representationId: `${version.id}-pdf`,
        revision: entry.row.workingRevision,
        fileName: request.url.searchParams.get('fileName'),
        mediaType: 'application/pdf',
        size: clarteDocumentPdf.length,
        sha256: clarteDocumentPdfSha256,
        storedAt: at(30),
        storedBy: registrar,
        scan: {
          outcome: 'clean',
          engine: 'Fictional scanner',
          scannedAt: at(30),
        },
      };
      return ok(
        versionReceipt(entry, version, 'representation_added', {
          representationId: `${version.id}-pdf`,
          appendedAfterDesignation: false,
        }),
        201,
      );
    }
    if (action === 'content' && item === 'history') {
      const stored = version.pdfContent;
      return ok({
        uploads:
          stored && typeof stored === 'object' && 'sha256' in stored
            ? [{ ...stored, current: true }]
            : [],
        nextBeforeRevision: null,
      });
    }
    if (action === 'content' && item)
      return { status: 200, pdf: clarteDocumentPdf };
    return undefined;
  }

  function documentsReply(request: FakeRequest): FakeReply | undefined {
    const path = request.url.pathname;
    const method = request.method;
    if (path === '/api/documents/received-contract-sources')
      return ok({ sources: [clarteContractSource], nextCursor: null });
    if (path === '/api/documents/received-addendum-sources')
      return ok({ sources: [clarteAddendumSource], nextCursor: null });
    if (path === '/api/documents/external-invoice-sources')
      return ok({ sources: [clarteInvoiceSource], nextCursor: null });
    if (path === '/api/documents' && method === 'GET')
      return options.listStatus
        ? { status: options.listStatus, json: {} }
        : ok(documents.map((entry) => entry.row));
    if (path === '/api/documents' && method === 'POST')
      return register(object(request.body));
    const associating =
      /^\/api\/documents\/([^/]+)\/project-association$/u.exec(path);
    if (associating?.[1] && method === 'POST') {
      const body = object(request.body);
      const revision = count(body.expectedRevision) + 1;
      associations.set(associating[1], {
        linked: body.action === 'link',
        revision,
      });
      return ok({
        documentId: associating[1],
        projectId: clarteDocumentsProject.id,
        action: body.action,
        revision,
      });
    }
    const match =
      /^\/api\/documents\/([^/]+)(?:\/(versions|correction-history)(?:\/([^/]+)(?:\/(official-designation|content|representations)(?:\/([^/]+?))?(?:\/removal)?)?)?)?$/u.exec(
        path,
      );
    const entry = match?.[1] ? find(match[1]) : undefined;
    if (!match || !entry) return undefined;
    const [, , collection, versionId, action, item] = match;
    if (!collection && method === 'PATCH')
      return correct(entry, object(request.body));
    if (!collection) return ok(detail(entry));
    if (collection === 'correction-history')
      return ok({ corrections: entry.corrections, nextBeforeRevision: null });
    if (!versionId && method === 'GET')
      return ok({
        workingRevision: entry.row.workingRevision,
        mutable: true,
        versions: entry.versions,
      });
    return versionCommand(
      entry,
      entry.versions.find((candidate) => candidate.id === versionId),
      action,
      item,
      request,
    );
  }

  function reply(request: FakeRequest): FakeReply {
    const path = request.url.pathname;
    if (request.method !== 'GET') writes.push(`${request.method} ${path}`);
    if (path === '/api/access/current-actor') return ok(actor);
    if (path === '/api/companies') return ok([clarteDocumentsCompany]);
    if (path === '/api/activity-log') return ok({ events: [] });
    if (path === '/api/operational-home')
      return ok({
        companyId: clarteDocumentsCompany.id,
        today: '2026-11-27',
        summaries: [],
      });
    if (path === '/api/clients')
      return ok(
        [clarteDocumentsClient, clarteDocumentsOtherClient].map((client) => ({
          ...client,
          relatedToActiveCompany: true,
        })),
      );
    if (path === '/api/client-duplicate-reviews')
      return ok({ items: [], next_cursor: null });
    if (path === '/api/commercial-intake/requests') return ok({ items: [] });
    if (path === '/api/assigned-tasks') return ok([]);
    if (path === '/api/projects') return ok([clarteDocumentsProject]);
    if (path === `/api/projects/${clarteDocumentsProject.id}/documents`)
      return ok({ mutable: true, documents: projectRows(true) });
    if (
      path === `/api/projects/${clarteDocumentsProject.id}/eligible-documents`
    )
      return ok({ mutable: true, documents: projectRows(false) });
    if (path === '/api/knowledge/evidence/sources')
      return ok({ items: [clarteKnowledgeSource], nextCursor: null });
    if (path === '/api/knowledge/evidence/search')
      return ok({
        items: clartePassageText.includes(
          request.url.searchParams.get('query') ?? '\u0000',
        )
          ? [clartePassage]
          : [],
        nextCursor: null,
      });
    if (path.startsWith('/api/knowledge/evidence/sources/'))
      return ok(clartePassage);
    if (
      path ===
      `/api/documents/${clarteKnowledgeSource.documentId}/versions/${clarteKnowledgeSource.documentVersionId}/content/${clarteKnowledgeSource.representationId}`
    )
      return { status: 200, pdf: clarteKnowledgePdf };
    const answer = documentsReply(request);
    if (answer) return answer;
    unhandled.add(`${request.method} ${path}`);
    return { status: 404, json: {} };
  }

  return { reply, writes, unhandled, documents };
}
