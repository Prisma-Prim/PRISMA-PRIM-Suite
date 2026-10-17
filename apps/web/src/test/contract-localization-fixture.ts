import type { ActorContext } from '../access-types';
import type { OfferView } from '../offer/offer-response';
import {
  buildClientRequest,
  requestListItemFor,
} from './commercial-intake-responses';

// Synthetic HTTP fixtures shared by the public App and browser journeys for #657.
export const contractLocaleIds = {
  workspace: '00000000-0000-4000-8000-000000000657',
  user: '10000000-0000-4000-8000-000000000657',
  member: '20000000-0000-4000-8000-000000000657',
  company: '30000000-0000-4000-8000-000000000657',
  client: '40000000-0000-4000-8000-000000000657',
  request: '50000000-0000-4000-8000-000000000657',
  opportunity: '60000000-0000-4000-8000-000000000657',
  contract: '70000000-0000-4000-8000-000000000657',
  version: '80000000-0000-4000-8000-000000000657',
};
export const contractLocaleCompany = {
  id: contractLocaleIds.company,
  workspaceId: contractLocaleIds.workspace,
  displayName: 'Synthetic Company {original} — Компания',
  status: 'active',
  createdAt: '2026-10-01T08:00:00.000Z',
  createdByInternalUserId: contractLocaleIds.user,
};
export const contractLocaleLiteral =
  '  Condiții {client} — Договор\nDeuxième ligne  ';
export const contractLocaleScope = 'Accepted scope {literal} — Объём';
export const contractLocaleCommercial = 'Accepted conditions {EUR} — Условия';
export const contractLocaleHtml =
  '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Original illustrative Contract</title></head><body><h1>Illustrative Contract — original bytes</h1><p>Accepted scope {literal} — Объём</p><pre>  Condiții {client} — Договор\nDeuxième ligne  </pre><p>2028-02-29 / 2028-03-01 / 345.00 EUR</p><p>ILLUSTRATIVE — clauses are placeholders; not a signed agreement.</p></body></html>';
export const contractLocaleChecksum =
  '920cb182b4a721fbf20a4f52ada75b0424ae8392a7e24a7dee694d8a486dacfe';
const offerHtml =
  '<!doctype html><html lang="en"><body><h1>Illustrative Accepted Offer</h1><p>Accepted scope {literal} — Объём</p></body></html>';
const offerChecksum =
  '4bc45c0bfe4149a48bf57f1c0af97e0a0f1a6b8cad8b78a94efed9d27077650c';

/** Exact immutable captured bundles from company-permissions.ts, without an approver grant. */
export function contractLocaleActor(hasCompany = true) {
  return {
    internalUserId: contractLocaleIds.user,
    workspaceMembershipId: contractLocaleIds.member,
    workspaceId: contractLocaleIds.workspace,
    workspaceName: 'Synthetic Workspace {original}',
    displayName: 'Synthetic Operator',
    email: 'contract-reader@example.test',
    active: true,
    workspacePermissions: [],
    ...(hasCompany
      ? {
          activeCompany: {
            id: contractLocaleCompany.id,
            displayName: contractLocaleCompany.displayName,
            commercialIntakePermissionAssignmentId: 'intake-657',
            commercialIntakePermissionSetVersion: 'v1',
            commercialIntakePermissions: [
              'commercial.request.read',
              'commercial.request.create',
              'commercial.opportunity.read',
              'commercial.opportunity.create',
            ],
            clientPermissionAssignmentId: 'client-657',
            clientPermissionSetVersion: 'v1',
            clientPermissions: [
              'client.read',
              'client.create',
              'client.update',
            ],
            contractPermissionAssignmentId: 'contract-657',
            contractPermissionSetVersion: 'v1',
            contractPermissions: [
              'commercial.contract.read',
              'commercial.contract.prepare',
              'commercial.contract.project.link',
            ],
            offerPermissionAssignmentId: 'offer-657',
            offerPermissionSetVersion: 'v1',
            offerPermissions: [
              'commercial.offer.read',
              'commercial.offer.prepare',
              'commercial.offer.transmission.record',
              'commercial.pricing.snapshot.read',
            ],
            pricingUserPermissionAssignmentId: 'pricing-657',
            pricingUserPermissionSetVersion: 'v1',
            pricingUserPermissions: [
              'commercial.offering.read',
              'commercial.pricing.configuration.read',
              'commercial.pricing.calculate',
              'commercial.pricing.snapshot.read',
            ],
            commercialActivityPermissionSetVersion: 'v1',
            commercialActivityPermissions: ['commercial.activity.read'],
          } satisfies NonNullable<ActorContext['activeCompany']>,
        }
      : {}),
  } satisfies ActorContext;
}

/** The same Company remains readable after only its Contract Preparer assignment is revoked. */
export function contractLocaleRevokedActor(hasCompany: boolean): ActorContext {
  const actor: ActorContext = contractLocaleActor(hasCompany);
  if (!actor.activeCompany) return actor;
  return {
    ...actor,
    activeCompany: {
      ...actor.activeCompany,
      contractPermissionAssignmentId: undefined,
      contractPermissionSetVersion: undefined,
      contractPermissions: [],
    },
  };
}

export const contractLocaleRequest = buildClientRequest({
  id: contractLocaleIds.request,
  companyId: contractLocaleIds.company,
  subject: 'Contract localization Request {original} — Запрос',
  originalText: 'Synthetic original evidence {literal} — Источник',
  capturedAt: '2026-10-01T08:00:00.000Z',
  capturedByWorkspaceMembershipId: contractLocaleIds.member,
  clientAssociationStatus: 'visible',
  clientReference: {
    originalClientId: contractLocaleIds.client,
    currentClientId: contractLocaleIds.client,
    displayName: 'Synthetic Client {literal} — Клиент',
  },
  initialOpportunity: {
    id: contractLocaleIds.opportunity,
    title: 'Prepare an illustrative Contract',
    nextAction: 'Prepare the first Contract from the Accepted Offer',
    responsibleActor: {
      workspaceMembershipId: contractLocaleIds.member,
      displayName: 'Synthetic Operator',
    },
  },
});
const recipient = {
  kind: 'PRIMARY' as const,
  additionalLegalEntityId: null,
  legalName: 'Recorded party {literal} — Клиент',
  taxId: 'SYNTHETIC-657',
  legalAddress: 'Str. Exemplu {literal}\nChișinău — Москва',
};
const snapshotLine = {
  position: 1,
  serviceCode: 'SYNTHETIC-657',
  serviceName: 'Service {original} — Услуга',
  offeringId: 'offering-657',
  commercialLabel: null,
  tariffVersionNumber: 1,
  unit: 'literal-unit',
  unitAmount: '120.0000',
  currency: 'EUR',
  taxRatePercent: '15.00',
  taxLabel: 'Literal tax label',
  quantity: '2.500',
  rawLineAmount: '300.0000000',
  lineNet: '300.00',
  rawLineTax: '45.0000000',
  lineTax: '45.00',
  adjustment: null,
  netReduction: '0.00',
  taxReduction: '0.00',
  adjustedLineNet: '300.00',
  adjustedRawLineTax: '45.0000000',
  adjustedLineTax: '45.00',
};
export const contractLocaleSnapshot = {
  id: 'snapshot-657',
  opportunityId: contractLocaleIds.opportunity,
  clientRequestId: contractLocaleIds.request,
  clientReference: { displayName: 'Synthetic Client {literal} — Клиент' },
  calculatedByWorkspaceMembershipId: contractLocaleIds.member,
  pricingRuleVersion: { id: 'rule-657', versionNumber: 1 },
  currency: 'EUR',
  lines: [snapshotLine],
  subtotal: '300.00',
  taxTotal: '45.00',
  total: '345.00',
  calculatedAt: '2026-10-01T08:10:00.000Z',
  committedAt: '2026-10-01T08:10:01.000Z',
  provenance: 'ILLUSTRATIVE',
  provisional: true,
};
const qualityCodes = [
  'PRICING_SNAPSHOT_COHERENT',
  'CURRENCY_UNCHANGED',
  'VALIDITY_OPEN',
  'RECIPIENT_AVAILABLE',
  'RECIPIENT_IDENTITY_CURRENT',
  'RECIPIENT_TAX_ID_RECORDED',
  'PRICING_CLIENT_CONTEXT_COHERENT',
  'PROVISIONAL_MARKER_PRESENT',
] as const;
function offerRun(id: string, evaluatedAt: string) {
  return {
    id,
    offerVersionId: 'accepted-offer-version-657',
    ruleSet: 'OFFER_QUALITY_ILLUSTRATIVE' as const,
    ruleSetVersion: 1 as const,
    actorWorkspaceMembershipId: contractLocaleIds.member,
    evaluatedAt,
    results: qualityCodes.map((code) => ({ code, status: 'PASS' as const })),
  };
}
const approvalRun = offerRun(
  'offer-approval-run-657',
  '2026-10-01T09:00:00.000Z',
);
const transmissionRun = offerRun(
  'offer-transmission-run-657',
  '2026-10-01T10:00:00.000Z',
);
/** One full response accepted by BOTH OfferPanel and the Contract source reader. */
export const contractLocaleAcceptedOffer = {
  id: 'offer-657',
  illustrativeReference: 7,
  revision: 4,
  version: {
    id: 'accepted-offer-version-657',
    versionNumber: 1,
    predecessorVersionId: null,
    supersededByVersionId: null,
    supersededAt: null,
    differences: [],
    pricingSnapshotId: 'snapshot-657',
    pricingSnapshot: contractLocaleSnapshot,
    qualityRuleSet: 'OFFER_QUALITY_ILLUSTRATIVE',
    qualityRuleSetVersion: 1,
    latestQualityRun: transmissionRun,
    recipient,
    issuingCompanyLabel: contractLocaleCompany.displayName,
    validityDays: 30,
    validityElapsed: false,
    validUntil: '2026-11-01T23:59:59.999Z',
    scopeNote: contractLocaleScope,
    commercialConditions: contractLocaleCommercial,
    decisionState: 'APPROVED',
    decision: {
      id: 'offer-approval-657',
      offerVersionId: 'accepted-offer-version-657',
      offerRevision: 2,
      actorWorkspaceMembershipId: contractLocaleIds.member,
      decidedAt: approvalRun.evaluatedAt,
      state: 'APPROVED',
      qualityRun: approvalRun,
      acknowledgedWarningCodes: [],
      representationSha256: offerChecksum,
    },
    transmissionState: 'TRANSMITTED',
    transmission: {
      id: 'offer-transmission-657',
      offerVersionId: 'accepted-offer-version-657',
      offerRevision: 3,
      actorWorkspaceMembershipId: contractLocaleIds.member,
      transmittedAt: transmissionRun.evaluatedAt,
      channel: 'SIMULATED',
      note: null,
      qualityRun: transmissionRun,
      acknowledgedWarningCodes: [],
      representationSha256: offerChecksum,
    },
    clientResponseState: 'ACCEPTED',
    clientResponse: {
      id: 'offer-acceptance-657',
      offerVersionId: 'accepted-offer-version-657',
      offerRevision: 4,
      actorWorkspaceMembershipId: contractLocaleIds.member,
      decidedAt: '2026-10-01T11:00:00.000Z',
      evidenceKind: 'SIMULATED',
      outcome: 'ACCEPTED',
      receivedAt: '2026-10-01T10:30:00.000Z',
    },
    provenance: 'ILLUSTRATIVE',
    provisional: true,
    representation: {
      templateCode: 'OFFER_ILLUSTRATIVE',
      templateVersion: 1,
      html: offerHtml,
      sha256: offerChecksum,
    },
  },
} satisfies OfferView;

export function contractLocaleRecord() {
  return {
    id: contractLocaleIds.contract,
    companyId: contractLocaleIds.company,
    opportunityId: contractLocaleIds.opportunity,
    kind: 'CONTRACT',
    origin: 'ACCEPTED_OFFER',
    sourceOfferId: 'offer-657',
    sourceOfferVersionId: 'accepted-offer-version-657',
    sourceOffer: { illustrativeReference: 7, versionNumber: 1 },
    parent: null,
    parentContractId: null,
    precontract: null,
    addendumOrdinal: null,
    addenda: [],
    linkedProjects: [],
    illustrativeReference: 1,
    revision: 1,
    provisional: true,
    version: {
      id: contractLocaleIds.version,
      versionNumber: 1,
      createdContractRevision: 1,
      predecessorVersionId: null,
      supersededByVersionId: null,
      differences: [],
      createdAt: '2026-10-17T12:00:00.000Z',
      recipient,
      issuingCompanyLabel: contractLocaleCompany.displayName,
      qualityRuleSet: 'CONTRACT_QUALITY_ILLUSTRATIVE',
      qualityRuleSetVersion: 1,
      scopeNote: contractLocaleScope,
      commercialConditions: contractLocaleCommercial,
      termStartsOn: '2028-02-29',
      termEndsOn: '2028-03-01',
      specialConditions: contractLocaleLiteral,
      preliminaryWork: null,
      changeSummary: null,
      pricingSnapshotId: 'snapshot-657',
      pricingSnapshot: contractLocaleSnapshot,
      decisionState: 'PENDING',
      decision: null,
      executionState: 'NOT_EXECUTED',
      signature: null,
      latestQualityRun: null,
      provenance: 'ILLUSTRATIVE',
      provisional: true,
    },
  };
}
export const contractLocaleRepresentation = {
  contractId: contractLocaleIds.contract,
  contractVersionId: contractLocaleIds.version,
  templateCode: 'CONTRACT_ILLUSTRATIVE',
  templateVersion: 1,
  clauseVersions: [
    'CL_SUBJECT',
    'CL_PRICE',
    'CL_TERM',
    'CL_CONDITIONS',
    'CL_GENERAL',
  ].map((code) => ({ code, version: 1 })),
  html: contractLocaleHtml,
  sha256: contractLocaleChecksum,
};
export const contractLocalePath = `/api/contracts/opportunities/${contractLocaleIds.opportunity}`;
export const contractLocaleRepresentationPath = `${contractLocalePath}/versions/${contractLocaleIds.version}/representation`;
const rule = {
  id: 'rule-657',
  versionNumber: 1,
  label: 'Synthetic immutable rule',
  effectiveFrom: '2026-01-01T00:00:00.000Z',
  effectiveTo: null,
  ruleShape: 'UNIT_PRICE_TIMES_QUANTITY',
  roundingMode: 'HALF_UP',
  roundingScale: 2,
  taxApplication: 'PER_LINE',
  provenance: 'ILLUSTRATIVE',
  provisional: true,
  state: 'CURRENT',
  supersession: null,
  createdByWorkspaceMembershipId: contractLocaleIds.member,
  createdAt: '2026-01-01T00:00:00.000Z',
};

/** Complete, explicit GET fixtures; unknown paths fail instead of returning generic success. */
export function readContractLocaleFixture({
  path,
  hasCompany,
  recorded,
}: {
  path: string;
  hasCompany: boolean;
  recorded: boolean;
}): unknown {
  if (path === '/api/access/current-actor')
    return contractLocaleActor(hasCompany);
  if (path === '/api/companies') return [contractLocaleCompany];
  if (path === '/api/operational-home')
    return {
      companyId: contractLocaleIds.company,
      today: '2026-10-17',
      summaries: [{ kind: 'active_clients', count: 1 }],
    };
  if (path === '/api/activity-log')
    return {
      events: recorded
        ? ['contract.created', 'contract_version.created'].map(
            (action, index) => ({
              id: 'contract-event-657-' + index,
              action,
              occurredAt: '2026-10-17T12:00:00.000Z',
              actor: {
                internalUserId: contractLocaleIds.user,
                displayName: 'Synthetic Operator',
              },
              target: {
                type: 'contract_version',
                contractId: contractLocaleIds.contract,
                contractVersionId: contractLocaleIds.version,
                kind: 'CONTRACT',
                illustrativeReference: 1,
                versionNumber: 1,
                opportunityId: contractLocaleIds.opportunity,
                clientRequestId: contractLocaleIds.request,
                companyId: contractLocaleIds.company,
              },
              metadata: {},
            }),
          )
        : [],
    };
  if (path === '/api/clients')
    return [
      {
        id: contractLocaleIds.client,
        displayName: 'Synthetic Client {literal} — Клиент',
        relatedToActiveCompany: true,
      },
    ];
  if (path === `/api/clients/${contractLocaleIds.client}/legal-entities`)
    return { clientVersion: 1, legalEntities: [] };
  if (path === '/api/commercial-intake/requests')
    return { items: [requestListItemFor(contractLocaleRequest)] };
  if (path === `/api/commercial-intake/requests/${contractLocaleIds.request}`)
    return contractLocaleRequest;
  if (path === '/api/pricing-configuration/rule-scope')
    return { current: rule, headVersionNumber: 1, provisional: true };
  if (path === '/api/pricing-configuration/rule-versions')
    return { items: [rule], provisional: true };
  if (path === '/api/commercial-catalogue/offerings')
    return {
      items: [
        {
          id: 'offering-657',
          serviceDefinition: {
            code: snapshotLine.serviceCode,
            name: snapshotLine.serviceName,
          },
          commercialLabel: null,
        },
      ],
    };
  if (path === '/api/pricing-configuration/offerings/offering-657/tariff-scope')
    return {
      offeringId: 'offering-657',
      current: {
        id: 'tariff-657',
        versionNumber: 1,
        unit: snapshotLine.unit,
        unitAmount: snapshotLine.unitAmount,
        currency: 'EUR',
        taxRatePercent: snapshotLine.taxRatePercent,
        taxLabel: snapshotLine.taxLabel,
      },
    };
  if (
    path ===
    `/api/pricing/opportunities/${contractLocaleIds.opportunity}/snapshots`
  )
    return { items: [contractLocaleSnapshot] };
  if (
    path ===
    `/api/pricing/opportunities/${contractLocaleIds.opportunity}/snapshots/snapshot-657`
  )
    return contractLocaleSnapshot;
  const offerPath = `/api/offers/opportunities/${contractLocaleIds.opportunity}`;
  if (path === offerPath) return { offer: contractLocaleAcceptedOffer };
  if (path === `${offerPath}/versions`)
    return {
      versions: [
        {
          id: contractLocaleAcceptedOffer.version.id,
          versionNumber: 1,
          createdAt: '2026-10-01T08:30:00.000Z',
          supersededByVersionId: null,
        },
      ],
      nextCursor: null,
    };
  if (
    path === `${offerPath}/versions/accepted-offer-version-657/quality-checks`
  )
    return { items: [transmissionRun, approvalRun], nextCursor: null };
  if (path === contractLocalePath)
    return {
      contract: recorded ? contractLocaleRecord() : null,
      precontract: null,
    };
  if (path === `${contractLocalePath}/versions`)
    return {
      items: recorded
        ? [{ id: contractLocaleIds.version, versionNumber: 1 }]
        : [],
      nextCursor: null,
    };
  if (path === `${contractLocalePath}/versions/${contractLocaleIds.version}`)
    return { contract: contractLocaleRecord() };
  if (path === contractLocaleRepresentationPath)
    return contractLocaleRepresentation;
  throw new Error('Unexpected #657 fixture GET: ' + path);
}
