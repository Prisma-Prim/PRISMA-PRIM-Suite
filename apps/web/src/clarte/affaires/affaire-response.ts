import {
  isOpportunityOutcomeStatus,
  type OpportunityOutcomeStatus,
} from '../../commercial-intake/opportunity-outcome';
import {
  isOpportunitySalesStage,
  type OpportunitySalesStage,
} from '../../commercial-intake/sales-stage';

/** The seven stages of an affaire's thread, in order. */
export const affaireStages = [
  'request',
  'costing',
  'offer',
  'contract',
  'delivery',
  'closure',
  'collection',
] as const;
export type AffaireStage = (typeof affaireStages)[number];

export const affaireStageMarkers = [
  'done',
  'current',
  'upcoming',
  'not_applicable',
  'not_available',
] as const;
export type AffaireStageMarker = (typeof affaireStageMarkers)[number];
type AvailableMarker = Exclude<AffaireStageMarker, 'not_available'>;

export type ClosedStatus = 'LOST' | 'DISQUALIFIED' | 'ARCHIVED';
export type AffaireThread =
  | { kind: 'in_progress'; currentStage: AffaireStage }
  | { kind: 'closed'; status: ClosedStatus };

/** A fact its owner may refuse the actor, whether or not records exist. */
export type OwnerFact<Value> =
  { readable: false } | { readable: true; value: Value };

export type AffaireSummary = {
  opportunityId: string;
  clientRequestId: string;
  title: string;
  subject: string | null;
  client: { displayName: string; clientDossierId?: string } | null;
  status: OpportunityOutcomeStatus;
  owner: { workspaceMembershipId: string; displayName: string };
  nextAction: string;
  salesStage: OpportunitySalesStage | null;
  followUpOn: OwnerFact<string | null>;
  lastChangedAt: string;
  thread: AffaireThread;
};

export type AffairePage = { items: AffaireSummary[]; nextCursor?: string };

export type DecisionState = 'PENDING' | 'APPROVED' | 'REJECTED';
export type OfferFact = {
  versionNumber: number;
  decisionState: DecisionState;
  transmissionState: 'NOT_TRANSMITTED' | 'TRANSMITTED';
  clientResponseState: 'NONE' | 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'EXPIRED';
  validUntil: string;
};
export type AgreementFact = {
  id: string;
  kind: 'CONTRACT' | 'PRECONTRACT' | 'ADDENDUM';
  versionNumber: number;
  decisionState: DecisionState;
  executionState: 'NOT_EXECUTED' | 'EXECUTED';
};
export type ProjectFact = {
  id: string;
  title: string;
  status: 'preparatory' | 'active' | 'on_hold' | 'completed' | 'cancelled';
};
export type CertificationCaseFact = {
  id: string;
  projectId: string;
  orderReference: string;
  status: 'open' | 'rejected' | 'refused' | 'certified';
};

export type AffaireStageView =
  | {
      stage: 'request';
      marker: AvailableMarker;
      capturedAt: string;
      clientAssociationStatus: 'absent' | 'hidden' | 'visible';
    }
  | {
      stage: 'costing' | 'offer' | 'contract' | 'delivery' | 'closure';
      marker: 'not_available';
    }
  | {
      stage: 'costing';
      marker: AvailableMarker;
      pricingSnapshot: OwnerFact<{
        calculatedAt: string;
        currency: string;
        total: string;
      } | null>;
      profitabilityEstimate: OwnerFact<{
        versionNumber: number;
        decision: 'APPROVE' | 'MODIFY' | 'REJECT' | null;
      } | null>;
    }
  | { stage: 'offer'; marker: AvailableMarker; offer: OfferFact | null }
  | { stage: 'contract'; marker: AvailableMarker; agreements: AgreementFact[] }
  | { stage: 'delivery'; marker: AvailableMarker; projects: ProjectFact[] }
  | {
      stage: 'closure';
      marker: AvailableMarker;
      certificationCases: CertificationCaseFact[];
    }
  | { stage: 'collection'; marker: 'not_applicable'; link: 'not_linked' };

export type AffaireDetail = AffaireSummary & {
  opportunityVersion: number;
  /** Exactly one view per stage, in thread order. */
  stages: AffaireStageView[];
};

/** Reads one page of `GET /affaires`; a malformed page fails closed. */
export function parseAffairePage(value: unknown): AffairePage {
  if (
    !isRecord(value) ||
    !Array.isArray(value.items) ||
    value.items.length > 50
  )
    throw new Error('Invalid affaire page.');
  const ids = new Set<string>();
  const items = value.items.map((item: unknown) => {
    const summary = parseSummary(item);
    if (ids.has(summary.opportunityId)) throw new Error('Duplicate affaire.');
    ids.add(summary.opportunityId);
    return summary;
  });
  if (value.nextCursor === undefined) return { items };
  if (typeof value.nextCursor !== 'string' || !value.nextCursor)
    throw new Error('Invalid affaire continuation.');
  return { items, nextCursor: value.nextCursor };
}

/** Reads `GET /affaires/:opportunityId` for exactly the requested affaire. */
export function parseAffaireDetail(
  value: unknown,
  opportunityId: string,
): AffaireDetail {
  const summary = parseSummary(value);
  if (
    !isRecord(value) ||
    summary.opportunityId !== opportunityId ||
    !isPositiveInteger(value.opportunityVersion) ||
    !Array.isArray(value.stages) ||
    value.stages.length !== affaireStages.length
  )
    throw new Error('Invalid affaire.');
  const stages = value.stages.map((stage: unknown, index) =>
    parseStage(stage, affaireStages[index]),
  );
  return { ...summary, opportunityVersion: value.opportunityVersion, stages };
}

function parseSummary(value: unknown): AffaireSummary {
  if (
    !isRecord(value) ||
    !isText(value.opportunityId) ||
    !isText(value.clientRequestId) ||
    typeof value.title !== 'string' ||
    !(value.subject === null || typeof value.subject === 'string') ||
    !isOpportunityOutcomeStatus(value.status) ||
    !isRecord(value.owner) ||
    !isText(value.owner.workspaceMembershipId) ||
    typeof value.owner.displayName !== 'string' ||
    typeof value.nextAction !== 'string' ||
    !isOpportunitySalesStage(value.salesStage) ||
    !isTimestamp(value.lastChangedAt)
  )
    throw new Error('Invalid affaire summary.');
  return {
    opportunityId: value.opportunityId,
    clientRequestId: value.clientRequestId,
    title: value.title,
    subject: value.subject,
    client: parseClient(value.client),
    status: value.status,
    owner: {
      workspaceMembershipId: value.owner.workspaceMembershipId,
      displayName: value.owner.displayName,
    },
    nextAction: value.nextAction,
    salesStage: value.salesStage,
    followUpOn: parseFact(value.followUpOn, (date) => {
      if (date === null || (typeof date === 'string' && isDate(date)))
        return date;
      throw new Error('Invalid follow-up date.');
    }),
    lastChangedAt: value.lastChangedAt,
    thread: parseThread(value.thread),
  };
}

function parseClient(value: unknown): AffaireSummary['client'] {
  if (value === null) return null;
  if (!isRecord(value) || typeof value.displayName !== 'string')
    throw new Error('Invalid affaire Client.');
  if (value.clientDossierId === undefined)
    return { displayName: value.displayName };
  if (!isText(value.clientDossierId)) throw new Error('Invalid dossier.');
  return {
    displayName: value.displayName,
    clientDossierId: value.clientDossierId,
  };
}

function parseThread(value: unknown): AffaireThread {
  if (!isRecord(value)) throw new Error('Invalid thread.');
  if (value.kind === 'in_progress' && isStage(value.currentStage))
    return { kind: 'in_progress', currentStage: value.currentStage };
  if (
    value.kind === 'closed' &&
    (value.status === 'LOST' ||
      value.status === 'DISQUALIFIED' ||
      value.status === 'ARCHIVED')
  )
    return { kind: 'closed', status: value.status };
  throw new Error('Invalid thread.');
}

function parseStage(
  value: unknown,
  expected: AffaireStage | undefined,
): AffaireStageView {
  if (!isRecord(value) || value.stage !== expected || !isMarker(value.marker))
    throw new Error('Invalid affaire stage.');
  const stage = value.stage;
  const marker = value.marker;
  if (marker === 'not_available') {
    if (stage === 'request' || stage === 'collection')
      throw new Error('Invalid unavailable stage.');
    return { stage, marker };
  }
  switch (stage) {
    case 'request':
      if (
        !isTimestamp(value.capturedAt) ||
        !(
          value.clientAssociationStatus === 'absent' ||
          value.clientAssociationStatus === 'hidden' ||
          value.clientAssociationStatus === 'visible'
        )
      )
        throw new Error('Invalid Request stage.');
      return {
        stage,
        marker,
        capturedAt: value.capturedAt,
        clientAssociationStatus: value.clientAssociationStatus,
      };
    case 'costing':
      return {
        stage,
        marker,
        pricingSnapshot: parseFact(value.pricingSnapshot, (snapshot) => {
          if (snapshot === null) return null;
          if (
            !isRecord(snapshot) ||
            !isTimestamp(snapshot.calculatedAt) ||
            !isText(snapshot.currency) ||
            !isText(snapshot.total)
          )
            throw new Error('Invalid pricing snapshot.');
          return {
            calculatedAt: snapshot.calculatedAt,
            currency: snapshot.currency,
            total: snapshot.total,
          };
        }),
        profitabilityEstimate: parseFact(
          value.profitabilityEstimate,
          (estimate) => {
            if (estimate === null) return null;
            if (
              !isRecord(estimate) ||
              !isPositiveInteger(estimate.versionNumber) ||
              !(
                estimate.decision === null ||
                estimate.decision === 'APPROVE' ||
                estimate.decision === 'MODIFY' ||
                estimate.decision === 'REJECT'
              )
            )
              throw new Error('Invalid Profitability Estimate.');
            return {
              versionNumber: estimate.versionNumber,
              decision: estimate.decision,
            };
          },
        ),
      };
    case 'offer':
      return {
        stage,
        marker,
        offer: value.offer === null ? null : parseOffer(value.offer),
      };
    case 'contract':
      return {
        stage,
        marker,
        agreements: list(value.agreements, parseAgreement),
      };
    case 'delivery':
      return { stage, marker, projects: list(value.projects, parseProject) };
    case 'closure':
      return {
        stage,
        marker,
        certificationCases: list(value.certificationCases, parseCase),
      };
    case 'collection':
      if (marker !== 'not_applicable' || value.link !== 'not_linked')
        throw new Error('Invalid Collection stage.');
      return { stage, marker, link: 'not_linked' };
    default: {
      const exhaustive: never = stage;
      return exhaustive;
    }
  }
}

function parseOffer(value: unknown): OfferFact {
  if (
    !isRecord(value) ||
    !isPositiveInteger(value.versionNumber) ||
    !isDecision(value.decisionState) ||
    !(
      value.transmissionState === 'NOT_TRANSMITTED' ||
      value.transmissionState === 'TRANSMITTED'
    ) ||
    !(
      value.clientResponseState === 'NONE' ||
      value.clientResponseState === 'PENDING' ||
      value.clientResponseState === 'ACCEPTED' ||
      value.clientResponseState === 'REJECTED' ||
      value.clientResponseState === 'EXPIRED'
    ) ||
    !isTimestamp(value.validUntil)
  )
    throw new Error('Invalid Offer.');
  return {
    versionNumber: value.versionNumber,
    decisionState: value.decisionState,
    transmissionState: value.transmissionState,
    clientResponseState: value.clientResponseState,
    validUntil: value.validUntil,
  };
}

function parseAgreement(value: unknown): AgreementFact {
  if (
    !isRecord(value) ||
    !isText(value.id) ||
    !(
      value.kind === 'CONTRACT' ||
      value.kind === 'PRECONTRACT' ||
      value.kind === 'ADDENDUM'
    ) ||
    !isPositiveInteger(value.versionNumber) ||
    !isDecision(value.decisionState) ||
    !(
      value.executionState === 'NOT_EXECUTED' ||
      value.executionState === 'EXECUTED'
    )
  )
    throw new Error('Invalid agreement.');
  return {
    id: value.id,
    kind: value.kind,
    versionNumber: value.versionNumber,
    decisionState: value.decisionState,
    executionState: value.executionState,
  };
}

function parseProject(value: unknown): ProjectFact {
  if (
    !isRecord(value) ||
    !isText(value.id) ||
    typeof value.title !== 'string' ||
    !(
      value.status === 'preparatory' ||
      value.status === 'active' ||
      value.status === 'on_hold' ||
      value.status === 'completed' ||
      value.status === 'cancelled'
    )
  )
    throw new Error('Invalid Project.');
  return { id: value.id, title: value.title, status: value.status };
}

function parseCase(value: unknown): CertificationCaseFact {
  if (
    !isRecord(value) ||
    !isText(value.id) ||
    !isText(value.projectId) ||
    typeof value.orderReference !== 'string' ||
    !(
      value.status === 'open' ||
      value.status === 'rejected' ||
      value.status === 'refused' ||
      value.status === 'certified'
    )
  )
    throw new Error('Invalid Certification Case.');
  return {
    id: value.id,
    projectId: value.projectId,
    orderReference: value.orderReference,
    status: value.status,
  };
}

function parseFact<Value>(
  value: unknown,
  parse: (value: unknown) => Value,
): OwnerFact<Value> {
  if (!isRecord(value)) throw new Error('Invalid owner fact.');
  if (value.readable === false) return { readable: false };
  if (value.readable !== true || !('value' in value))
    throw new Error('Invalid owner fact.');
  return { readable: true, value: parse(value.value) };
}

function list<Value>(value: unknown, parse: (item: unknown) => Value): Value[] {
  if (!Array.isArray(value)) throw new Error('Invalid list.');
  return value.map((item: unknown) => parse(item));
}

function isStage(value: unknown): value is AffaireStage {
  return affaireStages.some((stage) => stage === value);
}

function isMarker(value: unknown): value is AffaireStageMarker {
  return affaireStageMarkers.some((marker) => marker === value);
}

function isDecision(value: unknown): value is DecisionState {
  return value === 'PENDING' || value === 'APPROVED' || value === 'REJECTED';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isText(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

function isTimestamp(value: unknown): value is string {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

function isDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/u.test(value);
}
