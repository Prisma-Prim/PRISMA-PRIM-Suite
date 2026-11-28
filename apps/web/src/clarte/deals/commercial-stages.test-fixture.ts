import type { ActorContext } from '../../access-types';
import { companyGrants } from '../../access/company-grants.test-fixture';
import type { CommercialPdfTarget } from '../../commercial-pdf/commercial-pdf-response';
import {
  MODEL_OFFER_COMPANY,
  MODEL_OFFER_OPPORTUNITY,
  modelOfferActor,
  modelOfferEconomicFixture,
  modelOfferFixture,
  selectedModelFixture,
} from '../../offer/model-offer.fixture';
import { internalOfferFixture } from '../../offer/offer-estimate.fixture';
import {
  isIllustrativeOffer,
  readOffer,
  type OfferReadView,
  type OfferView,
} from '../../offer/offer-response';
import type {
  EstimateInputs,
  EstimateVersion,
} from '../../profitability-estimate/profitability-contract';
import { syntheticVersion } from '../../profitability-estimate/profitability.fixture';
import { buildClientRequest } from '../../test/commercial-intake-responses';
import { commercialDealFor, dealSummaryFor } from '../../test/deal-responses';
import {
  pendingOffer,
  qualityRun,
  recordedDecision,
  withRecordedDecision,
} from '../../test/offer-quality-decision-fixture';
import {
  clientResponseRecord,
  transmissionRecord,
  withClientResponse,
  withTransmission,
} from '../../test/offer-transmission-response-fixture';
import type { OfferFact } from './deal-response';

/**
 * A small stateful API over one fictional deal for the Costing and Offer
 * App tests and browser journey (#1534): pricing snapshots, Profitability
 * Estimate versions, and one illustrative, internal or model Offer with its
 * checks, decision, simulated records, cover message read and version
 * history. Every other request is answered 404 and reported as unhandled.
 */

export const commercialCompany = {
  id: MODEL_OFFER_COMPANY,
  displayName: 'PRISMA-PRIM',
};
export const commercialClient = {
  id: '00000000-0000-4000-8000-000000001834',
  displayName: 'Fictional Codru Orchards SA',
};
const workspaceId = modelOfferActor.workspaceId;
const membership = modelOfferActor.workspaceMembershipId;
const readCapture = `offer-message-read.v1.${'c'.repeat(64)}`;

export const commercialRequest = buildClientRequest({
  id: '00000000-0000-4000-8000-000000001835',
  companyId: commercialCompany.id,
  subject: 'Food safety certification request',
  originalText: 'Fictional request for a food safety certification.',
  capturedByWorkspaceMembershipId: membership,
  capturedAt: '2026-11-09T09:00:00.000Z',
  clientAssociationStatus: 'visible',
  clientReference: {
    originalClientId: commercialClient.id,
    currentClientId: commercialClient.id,
    displayName: commercialClient.displayName,
  },
  initialOpportunity: {
    id: MODEL_OFFER_OPPORTUNITY,
    title: 'Food safety certification',
    nextAction: 'Send the Offer to the Client',
    responsibleActor: {
      workspaceMembershipId: membership,
      displayName: 'Ada Ionescu',
    },
  },
});

/** Every Costing and Offer grant, or only the reads of the Offer stage. */
export function commercialActor(
  access: 'all' | 'reader' = 'all',
): ActorContext {
  const intake = {
    bundle: 'company_commercial_intake',
    version: access === 'reader' ? 'v1' : 'v2',
    assignmentId: '00000000-0000-4000-8000-000000001800',
  } as const;
  const client = {
    bundle: 'company_director_client_access',
    version: 'v1',
    assignmentId: '00000000-0000-4000-8000-000000001801',
  } as const;
  const grants =
    access === 'reader'
      ? companyGrants(intake, client)
      : companyGrants(
          intake,
          client,
          {
            bundle: 'company_pricing_user',
            version: 'v1',
            assignmentId: '00000000-0000-4000-8000-000000001802',
          },
          {
            bundle: 'company_profitability_contributor',
            version: 'v1',
            assignmentId: '00000000-0000-4000-8000-000000001803',
          },
          {
            bundle: 'company_profitability_director',
            version: 'v1',
            assignmentId: '00000000-0000-4000-8000-000000001804',
          },
          {
            bundle: 'company_offer_preparer',
            version: 'v3',
            assignmentId: '00000000-0000-4000-8000-000000001805',
          },
          {
            bundle: 'company_offer_approver',
            version: 'v2',
            assignmentId: '00000000-0000-4000-8000-000000001806',
          },
        );
  return {
    ...modelOfferActor,
    workspaceName: 'PRISMA Workspace',
    displayName: 'Ada Ionescu',
    email: 'ada@example.test',
    activeCompany: {
      ...commercialCompany,
      offerMessageReadCapture: readCapture,
      grants,
    },
  };
}

const offering = {
  id: '00000000-0000-4000-8000-000000001840',
  serviceDefinition: {
    code: 'ISO-22000-AUDIT',
    name: 'ISO 22000 certification audit',
  },
  commercialLabel: null,
};
const tariff = {
  id: '00000000-0000-4000-8000-000000001841',
  offeringId: offering.id,
  versionNumber: 2,
  unit: 'auditor-day',
  unitAmount: '5200.0000',
  currency: 'MDL',
  taxRatePercent: '20.00',
  taxLabel: 'VAT',
};

/** A recorded illustrative snapshot of `days` auditor-days. */
export function commercialSnapshot(number: number, days: number) {
  const net = (5200 * days).toFixed(2);
  const tax = (5200 * days * 0.2).toFixed(2);
  return {
    id: `00000000-0000-4000-8000-00000000185${number}`,
    opportunityId: MODEL_OFFER_OPPORTUNITY,
    clientRequestId: commercialRequest.id,
    clientReference: { displayName: commercialClient.displayName },
    calculatedByWorkspaceMembershipId: membership,
    pricingRuleVersion: { id: 'rule-3', versionNumber: 3 },
    currency: 'MDL',
    lines: [
      {
        position: 1,
        serviceCode: offering.serviceDefinition.code,
        serviceName: offering.serviceDefinition.name,
        offeringId: offering.id,
        commercialLabel: null,
        tariffVersionNumber: tariff.versionNumber,
        unit: tariff.unit,
        unitAmount: tariff.unitAmount,
        currency: 'MDL',
        taxRatePercent: tariff.taxRatePercent,
        taxLabel: tariff.taxLabel,
        quantity: String(days),
        rawLineAmount: `${net}00000`,
        lineNet: net,
        rawLineTax: `${tax}00000`,
        lineTax: tax,
        adjustment: null,
        netReduction: '0.00',
        taxReduction: '0.00',
        adjustedLineNet: net,
        adjustedRawLineTax: `${tax}00000`,
        adjustedLineTax: tax,
      },
    ],
    subtotal: net,
    taxTotal: tax,
    total: (Number(net) + Number(tax)).toFixed(2),
    calculatedAt: `2026-11-1${number}T10:00:00.000Z`,
    committedAt: `2026-11-1${number}T10:00:01.000Z`,
    provenance: 'ILLUSTRATIVE',
    provisional: true,
  } as const;
}
type Snapshot = ReturnType<typeof commercialSnapshot>;

/** The fictional estimate version a contributor records. */
export const estimateInputs: EstimateInputs = {
  currency: 'MDL',
  executorType: 'DIRECTOR_OR_EMPLOYEE',
  executorCost: '9800.00',
  fiscalCost: '1700.00',
  allocatedOverhead: '1200.00',
  directCosts: [],
  targetProfitability: '30',
  proposedPrice: '21000.00',
  pricingIntent: { kind: 'ORDINARY' },
  costConfirmation: true,
};

function estimateVersion(number: number) {
  return {
    ...syntheticVersion(number),
    id: `00000000-0000-4000-8000-00000000186${number}`,
    estimateId: '00000000-0000-4000-8000-000000001860',
    workspaceId,
    companyId: commercialCompany.id,
    opportunityId: MODEL_OFFER_OPPORTUNITY,
    clientRequestId: commercialRequest.id,
    predecessorVersionId:
      number === 1 ? null : `00000000-0000-4000-8000-00000000186${number - 1}`,
    inputs: estimateInputs,
    results: {
      totalCost: '12700.00',
      profit: '8300.00',
      profitabilityPercent: '39.52',
      targetDifferencePercentagePoints: '9.52',
    },
    createdByWorkspaceMembershipId: membership,
    createdAt: `2026-11-2${number}T15:20:00.000Z`,
  } satisfies EstimateVersion;
}

/** The illustrative Offer version 1 prepared from `snapshot`. */
function illustrativeOffer(snapshot: Snapshot): OfferView {
  const offer = pendingOffer({
    offerId: '00000000-0000-4000-8000-000000001870',
    versionId: '00000000-0000-4000-8000-000000001871',
    latestRun: false,
  });
  return {
    ...offer,
    illustrativeReference: 12,
    version: {
      ...offer.version,
      pricingSnapshotId: snapshot.id,
      pricingSnapshot: {
        id: snapshot.id,
        currency: snapshot.currency,
        total: snapshot.total,
        committedAt: snapshot.committedAt,
      },
      recipient: {
        ...offer.version.recipient,
        legalName: commercialClient.displayName,
      },
      issuingCompanyLabel: commercialCompany.displayName,
      scopeNote: 'Main plant and the northern warehouse',
      commercialConditions: 'Half on signature, half after the audit',
      representation: {
        ...offer.version.representation,
        html: `<!doctype html><html lang="en"><body style="font-family:sans-serif;padding:24px"><h1>Illustrative Offer 12 · v1</h1><p>${commercialClient.displayName}</p><p>ISO 22000 certification audit — ${snapshot.total} MDL</p></body></html>`,
      },
    },
  };
}

/** The successor version with its recorded differences. */
function successor(offer: OfferView, commercialConditions: string): OfferView {
  return {
    ...offer,
    revision: offer.revision + 1,
    version: {
      ...offer.version,
      id: '00000000-0000-4000-8000-000000001872',
      versionNumber: 2,
      createdAt: '2026-11-25T16:40:00.000Z',
      predecessorVersionId: offer.version.id,
      supersededByVersionId: null,
      supersededAt: null,
      latestQualityRun: null,
      commercialConditions,
      differences: [
        {
          field: 'commercialConditions',
          previous: offer.version.commercialConditions,
          current: commercialConditions,
          changed: true,
        },
      ],
    },
  };
}

type FakeRequest = Readonly<{
  method: string;
  url: URL;
  body: unknown;
}>;
export type FakeReply = Readonly<{ status: number; json: unknown }>;

export type CommercialApiOptions = Readonly<{
  /** `costed` starts with one snapshot and one approved estimate. */
  initial?: 'empty' | 'costed';
  /** Answers every Costing and Offer read with this status instead. */
  ownerReadStatus?: number;
}>;

export function createDealCommercialApi(options: CommercialApiOptions = {}) {
  const writes: string[] = [];
  const unhandled = new Set<string>();
  let dealReads = 0;
  let actor = commercialActor();
  let snapshots: Snapshot[] =
    options.initial === 'costed' ? [commercialSnapshot(1, 4)] : [];
  const approved = modelOfferEconomicFixture();
  let estimates: EstimateVersion[] =
    options.initial === 'costed'
      ? [
          {
            ...approved,
            clientRequestId: commercialRequest.id,
            decision: { ...approved.decision, code: 'APPROVE' },
          },
        ]
      : [];
  // The Offer as the server sends it, and as the browser reads it.
  let offerWire: unknown = null;
  let offer: OfferReadView | null = null;
  /** Earlier illustrative versions of the Offer, by id. */
  const versions = new Map<string, OfferView>();
  function store(next: unknown) {
    offerWire = next;
    offer = readOffer(next);
  }
  const ok = (json: unknown, status = 200): FakeReply => ({ status, json });
  const missing: FakeReply = { status: 404, json: {} };

  function offerFact(): OfferFact | null {
    if (!offer) return null;
    const version = offer.version;
    return {
      versionNumber: version.versionNumber,
      decisionState: version.decisionState,
      transmissionState: version.transmissionState,
      clientResponseState: version.clientResponseState,
      validUntil: version.validUntil,
    };
  }
  function deal() {
    const latestSnapshot = snapshots[0];
    const latestEstimate = estimates[0];
    return commercialDealFor(commercialRequest, {
      pricingSnapshot: {
        readable: true,
        value: latestSnapshot
          ? {
              calculatedAt: latestSnapshot.calculatedAt,
              currency: latestSnapshot.currency,
              total: latestSnapshot.total,
            }
          : null,
      },
      profitabilityEstimate: {
        readable: true,
        value: latestEstimate
          ? {
              versionNumber: latestEstimate.versionNumber,
              decision: latestEstimate.decision?.code ?? null,
            }
          : null,
      },
      offer: offerFact(),
    });
  }
  function illustrative(): OfferView {
    if (!offer || !isIllustrativeOffer(offer))
      throw new Error('The fixture has no illustrative Offer.');
    return offer;
  }
  function record(body: unknown, key: string): string {
    const value: unknown =
      typeof body === 'object' && body !== null
        ? Reflect.get(body, key)
        : undefined;
    return typeof value === 'string' || typeof value === 'number'
      ? String(value)
      : '';
  }
  /** The version content a preparation command asked for, echoed back. */
  function preparedContent(body: unknown) {
    return {
      validityDays: Number(record(body, 'validityDays')) || 30,
      scopeNote: record(body, 'scopeNote') || null,
      commercialConditions: record(body, 'commercialConditions') || null,
    };
  }

  function reply(request: FakeRequest): FakeReply {
    const path = request.url.pathname;
    const method = request.method;
    if (method !== 'GET') writes.push(`${method} ${path}`);
    const opportunity = `/api/pricing/opportunities/${MODEL_OFFER_OPPORTUNITY}`;
    const estimatesPath = `/api/opportunities/${MODEL_OFFER_OPPORTUNITY}/profitability-estimates`;
    const offerPath = `/api/offers/opportunities/${MODEL_OFFER_OPPORTUNITY}`;
    if (path === '/api/access/current-actor') return ok(actor);
    if (path === '/api/companies') return ok([commercialCompany]);
    if (path === '/api/activity-log') return ok({ events: [] });
    if (path === '/api/deals')
      return ok({ items: [dealSummaryFor(commercialRequest, deal())] });
    if (path === `/api/deals/${MODEL_OFFER_OPPORTUNITY}`) {
      dealReads += 1;
      return ok(deal());
    }
    if (path === `/api/commercial-intake/requests/${commercialRequest.id}`)
      return ok(commercialRequest);
    if (
      options.ownerReadStatus &&
      method === 'GET' &&
      [opportunity, estimatesPath, offerPath].some((owner) =>
        path.startsWith(owner),
      )
    )
      return { status: options.ownerReadStatus, json: {} };

    // Pricing (EX-078, EX-079).
    if (path === '/api/pricing-configuration/rule-scope')
      return ok({ current: { id: 'rule-3', versionNumber: 3 } });
    if (path === '/api/commercial-catalogue/offerings')
      return ok({ items: [offering] });
    if (
      path ===
      `/api/pricing-configuration/offerings/${offering.id}/tariff-scope`
    )
      return ok({ offeringId: offering.id, current: tariff });
    if (path === `${opportunity}/snapshots` && method === 'GET')
      return ok({ items: snapshots });
    if (path === `${opportunity}/snapshots` && method === 'POST') {
      const lines: unknown = Reflect.get(Object(request.body), 'lines');
      const quantity = Array.isArray(lines)
        ? Number(Reflect.get(Object(lines[0]), 'quantity'))
        : 1;
      const recorded = commercialSnapshot(snapshots.length + 1, quantity);
      snapshots = [recorded, ...snapshots];
      return ok(recorded, 201);
    }
    if (path.startsWith(`${opportunity}/snapshots/`)) {
      const found = snapshots.find((item) => path.endsWith(`/${item.id}`));
      return found ? ok(found) : missing;
    }

    // Profitability Estimate (EX-080 to EX-082).
    if (path === estimatesPath && method === 'GET')
      return ok({
        items: estimates,
        latestVersionNumber: estimates[0]?.versionNumber ?? null,
      });
    if (path === estimatesPath && method === 'POST') {
      const created = estimateVersion(estimates.length + 1);
      estimates = [created, ...estimates];
      return ok(created, 201);
    }
    if (path.startsWith(`${estimatesPath}/versions/`)) {
      const found = estimates.find((item) =>
        path.startsWith(`${estimatesPath}/versions/${item.id}`),
      );
      if (!found) return missing;
      if (method === 'GET') return ok(found);
      const decided: EstimateVersion = {
        ...found,
        decision: {
          id: `00000000-0000-4000-8000-00000000187${found.versionNumber}`,
          code:
            record(request.body, 'code') === 'REJECT'
              ? 'REJECT'
              : record(request.body, 'code') === 'MODIFY'
                ? 'MODIFY'
                : 'APPROVE',
          decidedByWorkspaceMembershipId: membership,
          decidedAt: '2026-11-28T16:00:00.000Z',
        },
      };
      estimates = estimates.map((item) =>
        item.id === decided.id ? decided : item,
      );
      return ok(decided);
    }

    // Offer (EX-084 to EX-094).
    if (path === `/api/clients/${commercialClient.id}/legal-entities`)
      return ok({ clientVersion: 1, legalEntities: [] });
    if (path === '/api/offer-models/consulting-ro/for-offer')
      return ok({ selection: selectedModelFixture });
    if (path === offerPath && method === 'GET') return ok({ offer: offerWire });
    if (path === offerPath && method === 'POST') {
      const snapshot =
        snapshots.find(
          (item) => item.id === record(request.body, 'pricingSnapshotId'),
        ) ?? snapshots[0];
      if (!snapshot) return { status: 422, json: {} };
      store(illustrativeOffer(snapshot));
      return ok(offerWire, 201);
    }
    if (path === `${offerPath}/from-approved-estimate` && method === 'POST') {
      const internal = internalOfferFixture();
      store({
        ...internal,
        companyId: commercialCompany.id,
        opportunityId: MODEL_OFFER_OPPORTUNITY,
        version: { ...internal.version, ...preparedContent(request.body) },
      });
      return ok(offerWire, 201);
    }
    if (path === `${offerPath}/from-approved-model` && method === 'POST') {
      const model = modelOfferFixture();
      store({
        ...model,
        version: { ...model.version, ...preparedContent(request.body) },
      });
      return ok(offerWire, 201);
    }
    if (path === `${offerPath}/versions` && method === 'GET') {
      const all = [...(offer ? [offer] : []), ...versions.values()];
      return ok({
        versions: all.map((item) => ({
          id: item.version.id,
          versionNumber: item.version.versionNumber,
          createdAt:
            'createdAt' in item.version && item.version.createdAt
              ? item.version.createdAt
              : '2026-11-24T11:00:00.000Z',
          supersededByVersionId: item.version.supersededByVersionId,
        })),
        nextCursor: null,
      });
    }
    if (path === `${offerPath}/versions` && method === 'POST') {
      const head = illustrative();
      const next = successor(
        head,
        record(request.body, 'commercialConditions') ||
          'Changed commercial conditions',
      );
      versions.set(head.version.id, {
        ...head,
        revision: next.revision,
        version: {
          ...head.version,
          supersededByVersionId: next.version.id,
          supersededAt: next.version.createdAt,
        },
      });
      store(next);
      return ok(offerWire, 201);
    }
    const versionMatch = path.match(
      new RegExp(`^${offerPath}/versions/([^/]+)(?:/(.+))?$`, 'u'),
    );
    if (versionMatch && offer) {
      const [, versionId, command] = versionMatch;
      if (!command && method === 'GET') {
        if (offer.version.id === versionId) return ok({ offer: offerWire });
        const earlier = versions.get(versionId ?? '');
        return earlier ? ok({ offer: earlier }) : missing;
      }
      if (offer.version.id !== versionId) return { status: 409, json: {} };
      const head = illustrative();
      switch (command) {
        case 'quality-checks': {
          const run = qualityRun({
            versionId: head.version.id,
            id: `00000000-0000-4000-8000-00000000188${head.version.versionNumber}`,
            warning: false,
          });
          store({
            ...head,
            version: { ...head.version, latestQualityRun: run },
          });
          return ok(run, 201);
        }
        case 'approve': {
          const decision = recordedDecision({
            offer: head,
            kind: 'approve',
            warning: false,
          });
          store(
            withRecordedDecision({
              offer: head,
              kind: 'approve',
              warning: false,
            }),
          );
          return ok(decision, 201);
        }
        case 'transmission': {
          const note = record(request.body, 'note') || null;
          const transmission = transmissionRecord({
            offer: head,
            note,
            warning: false,
          });
          store(withTransmission({ offer: head, note, warning: false }));
          return ok(transmission, 201);
        }
        case 'client-response': {
          const response = clientResponseRecord({
            offer: head,
            outcome: 'ACCEPTED',
          });
          store(withClientResponse({ offer: head, outcome: 'ACCEPTED' }));
          return ok(response, 201);
        }
        default:
          if (command?.startsWith('message-preparation'))
            return ok(messageObservation(head));
      }
    }
    unhandled.add(`${method} ${path}`);
    return missing;
  }

  function messageObservation(head: OfferView) {
    return {
      format: 'offer-message-preparation.v1',
      readCapture,
      source: pdfTarget(head),
      party: {
        kind: 'PRIMARY',
        legalName: commercialClient.displayName,
        taxId: null,
        legalAddress: null,
      },
      actor: { workspaceMembershipId: membership, displayName: 'Ada Ionescu' },
    };
  }

  return {
    reply,
    writes,
    unhandled,
    dealReads: () => dealReads,
    /** The PDF identity of the head illustrative Offer version. */
    pdfTarget: () => pdfTarget(illustrative()),
    setActor(next: ActorContext) {
      actor = next;
    },
  };
}

/** The exact PDF source of an illustrative Offer version. */
function pdfTarget(head: OfferView): CommercialPdfTarget {
  return {
    kind: 'offer',
    workspaceId,
    companyId: commercialCompany.id,
    opportunityId: MODEL_OFFER_OPPORTUNITY,
    rootId: head.id,
    reference: head.illustrativeReference,
    versionId: head.version.id,
    versionNumber: head.version.versionNumber,
    provenance: 'ILLUSTRATIVE',
    language: 'en',
    createdAt: head.version.createdAt ?? '2026-11-24T11:00:00.000Z',
    sourceRendererCode: 'OFFER_ILLUSTRATIVE',
    sourceRendererVersion: 1,
    sourceHtmlSha256: head.version.representation.sha256,
  };
}
