import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { ActorContext } from '../access/access.types.js';
import type { CapturedPermissionRequest } from '../access/captured-company-permissions.js';
import {
  CompanyContextAuthorization,
  commercialIntakeRequiredPermissions,
} from '../access/company-context-authorization.js';
import { CertificationService } from '../certification/certification.service.js';
import { CommercialIntakeService } from '../commercial-intake/commercial-intake.service.js';
import type { CommercialIntakeDetail } from '../commercial-intake/commercial-intake.types.js';
import { ContractService } from '../contract/contract.service.js';
import { OfferService } from '../offer/offer.service.js';
import { OpportunityFollowUpService } from '../opportunity-follow-up/opportunity-follow-up.service.js';
import { PricingSnapshotService } from '../pricing-configuration/pricing-snapshot.service.js';
import { ProfitabilityEstimateService } from '../profitability-estimate/profitability-estimate.service.js';
import { ProjectService } from '../project/project.service.js';
import {
  AffairePresenceStore,
  type AffaireScope,
  type LatestRecordTimes,
} from './affaire-presence.store.js';
import {
  affaireThread,
  type AffaireStage,
  type AffaireStageMarker,
  type AffaireStagePresence,
} from './affaire-thread.js';
import type {
  AffaireDetail,
  AffaireListPage,
  AffaireStageView,
  AffaireSummary,
  AgreementFact,
  CertificationCaseFact,
  OfferFact,
  OwnerFact,
  ProjectFact,
} from './affaire.types.js';

type ReadableStages = Awaited<ReturnType<AffaireService['readableStages']>>;

/** A stage's latest record time; `null` for none, `undefined` when refused. */
type StageTimes = Readonly<
  Record<
    Exclude<AffaireStage, 'request' | 'collection'>,
    Date | null | undefined
  >
>;

/** The Project owner's read: `project.read` with Client read (ProjectService.read). */
const PROJECT_READ: CapturedPermissionRequest = {
  permissions: ['project.read'],
  lock: false,
  prerequisites: [
    { permissions: ['client.read'], workspaceAlternative: 'client.manage' },
  ],
};

/**
 * The read-side affaire (#1533): one Opportunity and the facts each stage
 * owner already holds around it. It adds no command and stores nothing.
 * Scope always comes from the server actor context. The Commercial Intake
 * read decides whether the affaire exists for the actor, so hidden and
 * missing affaires share the owner's single 404; every later stage is read
 * through its own owner's existing permission and is "not available" when
 * that owner refuses the actor.
 */
@Injectable()
export class AffaireService {
  constructor(
    private readonly authorization: CompanyContextAuthorization,
    private readonly presence: AffairePresenceStore,
    private readonly intake: CommercialIntakeService,
    private readonly pricing: PricingSnapshotService,
    private readonly profitability: ProfitabilityEstimateService,
    private readonly offers: OfferService,
    private readonly contracts: ContractService,
    private readonly projects: ProjectService,
    private readonly certification: CertificationService,
    private readonly followUps: OpportunityFollowUpService,
  ) {}

  async detail(
    actor: ActorContext,
    opportunityId: string,
  ): Promise<AffaireDetail> {
    const scope = await this.intakeScope(actor);
    const target = await this.intake.requireReadableOfferOpportunity(
      actor,
      opportunityId,
      false,
    );
    const request = await this.intake.read(actor, target.clientRequestId);
    if (request.initialOpportunity.id !== target.id)
      throw new NotFoundException();
    const id = target.id;

    const pricingSnapshot = await ownerRead(async () => {
      const latest = (await this.pricing.list(actor, id, undefined, '1'))
        .items[0];
      return latest
        ? {
            calculatedAt: latest.calculatedAt,
            currency: latest.currency,
            total: latest.total,
          }
        : null;
    });
    const profitabilityEstimate = await ownerRead(async () => {
      const latest = (
        await this.profitability.list({
          actor,
          opportunityId: id,
          query: { limit: '1' },
        })
      ).items[0];
      return latest
        ? {
            versionNumber: latest.versionNumber,
            decision: latest.decision?.code ?? null,
          }
        : null;
    });
    const offer = await ownerRead(async (): Promise<OfferFact | null> => {
      const record = await this.offers.read(actor, id);
      if (!record) return null;
      const version = record.version;
      return {
        versionNumber: version.versionNumber,
        decisionState: version.decisionState,
        transmissionState: version.transmissionState,
        clientResponseState: version.clientResponseState,
        validUntil: version.validUntil,
      };
    });
    const agreements = await ownerRead(() => this.readAgreements(actor, id));
    const projectsReadable =
      agreements.readable &&
      (await this.authorization.hasPermissions(actor, PROJECT_READ));
    const delivery: OwnerFact<readonly ProjectFact[]> =
      agreements.readable && projectsReadable
        ? { readable: true, value: agreements.value.projects }
        : { readable: false };
    const certificationCases = delivery.readable
      ? await ownerRead(() =>
          this.readCertificationCases(actor, delivery.value),
        )
      : { readable: false as const };
    const followUpOn = await ownerRead(async () => {
      const current = await this.followUps.read(actor, id, {});
      return current.head.state === 'RECORDED' ? current.head.followUpOn : null;
    });

    const presence = {
      request: 'record',
      costing:
        !pricingSnapshot.readable && !profitabilityEstimate.readable
          ? 'not_available'
          : (pricingSnapshot.readable && pricingSnapshot.value) ||
              (profitabilityEstimate.readable && profitabilityEstimate.value)
            ? 'record'
            : 'none',
      offer: factPresence(offer, (value) => value !== null),
      contract: factPresence(agreements, (value) => value.items.length > 0),
      delivery: factPresence(delivery, (value) => value.length > 0),
      closure: factPresence(certificationCases, (value) => value.length > 0),
      collection: 'not_linked',
    } as const satisfies Record<AffaireStage, AffaireStagePresence>;
    const { thread, markers } = affaireThread({
      status: request.initialOpportunity.status,
      presence,
    });
    const changedAt = await this.presence.opportunityChangedAt(scope, id);
    if (!changedAt) throw new NotFoundException();
    // The list's own definition of the last change, under the same gates as
    // the facts shown here.
    const recorded = await this.recordTimes(actor, scope, [id], {
      pricing: pricingSnapshot.readable,
      profitability: profitabilityEstimate.readable,
      offer: offer.readable,
      contract: agreements.readable,
      project: delivery.readable,
      certification: certificationCases.readable,
      followUp: followUpOn.readable,
    });

    const available = (stage: AffaireStage) => availableMarker(markers[stage]);
    const stages: AffaireStageView[] = [
      {
        stage: 'request',
        marker: available('request') ?? 'current',
        capturedAt: request.capturedAt,
        clientAssociationStatus: request.clientAssociationStatus,
      },
      stageView('costing', available('costing'), (marker) => ({
        stage: 'costing',
        marker,
        pricingSnapshot: mapFact(pricingSnapshot, (value) =>
          value
            ? {
                calculatedAt: value.calculatedAt,
                currency: value.currency,
                total: value.total,
              }
            : null,
        ),
        profitabilityEstimate: mapFact(profitabilityEstimate, (value) =>
          value
            ? { versionNumber: value.versionNumber, decision: value.decision }
            : null,
        ),
      })),
      stageView('offer', available('offer'), (marker) => ({
        stage: 'offer',
        marker,
        offer: offer.readable ? offer.value : null,
      })),
      stageView('contract', available('contract'), (marker) => ({
        stage: 'contract',
        marker,
        agreements: agreements.readable ? agreements.value.items : [],
      })),
      stageView('delivery', available('delivery'), (marker) => ({
        stage: 'delivery',
        marker,
        projects: delivery.readable ? delivery.value : [],
      })),
      stageView('closure', available('closure'), (marker) => ({
        stage: 'closure',
        marker,
        certificationCases: certificationCases.readable
          ? certificationCases.value
          : [],
      })),
      { stage: 'collection', marker: 'not_applicable', link: 'not_linked' },
    ];
    return {
      ...summaryOf(request),
      followUpOn,
      lastChangedAt: lastChange(changedAt, recorded(id)).toISOString(),
      thread,
      opportunityVersion: request.initialOpportunity.version,
      stages,
    };
  }

  async list(
    actor: ActorContext,
    query: {
      readonly limit: unknown;
      readonly cursor: unknown;
      readonly viewQuery: unknown;
    },
  ): Promise<AffaireListPage> {
    const page = await this.intake.list(actor, query);
    const scope = await this.intakeScope(actor);
    const initial = await this.presence.initialOpportunities(
      scope,
      page.items.map((item) => item.id),
    );
    const rows = page.items.map((item) => {
      const opportunity = initial.get(item.id);
      if (!opportunity) throw new Error('Missing initial Opportunity.');
      return { item, ...opportunity };
    });
    const ids = rows.map((row) => row.opportunityId);
    const can = await this.readableStages(actor);
    const recorded = await this.recordTimes(actor, scope, ids, can);
    const followUps = can.followUp
      ? await this.presence.followUpDates(scope, ids)
      : undefined;
    return {
      items: rows.map(({ item, opportunityId, changedAt }): AffaireSummary => {
        const times = recorded(opportunityId);
        const { thread } = affaireThread({
          status: item.initialOpportunity.status,
          presence: {
            request: 'record',
            costing: timePresence(times.costing),
            offer: timePresence(times.offer),
            contract: timePresence(times.contract),
            delivery: timePresence(times.delivery),
            closure: timePresence(times.closure),
            collection: 'not_linked',
          },
        });
        return {
          opportunityId,
          clientRequestId: item.id,
          title: item.initialOpportunity.title,
          subject: item.subject,
          client:
            item.clientDisplayName === undefined
              ? null
              : {
                  displayName: item.clientDisplayName,
                  ...(item.clientDossierId
                    ? { clientDossierId: item.clientDossierId }
                    : {}),
                },
          status: item.initialOpportunity.status,
          owner: item.initialOpportunity.responsibleActor,
          nextAction: item.initialOpportunity.nextAction,
          salesStage: item.initialOpportunity.salesStage,
          followUpOn: followUps
            ? { readable: true, value: followUps.get(opportunityId) ?? null }
            : { readable: false },
          lastChangedAt: lastChange(changedAt, times).toISOString(),
          thread,
        };
      }),
      ...(page.nextCursor ? { nextCursor: page.nextCursor } : {}),
    };
  }

  /**
   * The latest record time of each stage per Opportunity: a date, `null`
   * for none, or `undefined` when the stage's owner refuses the actor. The
   * list derives each row's stage from it; both reads derive the last change.
   */
  private async recordTimes(
    actor: ActorContext,
    scope: AffaireScope,
    ids: readonly string[],
    can: ReadableStages,
  ): Promise<(opportunityId: string) => StageTimes> {
    const pricing = can.pricing
      ? await this.presence.latestPricingSnapshots(scope, ids)
      : undefined;
    const estimates = can.profitability
      ? await this.presence.latestProfitabilityEstimates(scope, ids)
      : undefined;
    const offers = can.offer
      ? await this.presence.latestOfferVersions(scope, ids)
      : undefined;
    const agreements = can.contract
      ? await this.presence.latestContractVersions(scope, ids)
      : undefined;
    const links =
      can.contract && can.project
        ? await this.readableLinkedProjects(actor, scope, ids)
        : undefined;
    const delivery = links && latestByOpportunity(links);
    const closure =
      links && can.certification
        ? await this.latestCases(scope, links)
        : undefined;
    const at = (times: LatestRecordTimes | undefined, id: string) =>
      times ? (times.get(id) ?? null) : undefined;
    return (id) => ({
      costing:
        pricing || estimates
          ? latestOf([pricing?.get(id), estimates?.get(id)], null)
          : undefined,
      offer: at(offers, id),
      contract: at(agreements, id),
      delivery: at(delivery, id),
      closure: at(closure, id),
    });
  }

  private async intakeScope(actor: ActorContext): Promise<AffaireScope> {
    const { companyId } = await this.authorization.requirePermissions(actor, {
      permissions: commercialIntakeRequiredPermissions('read'),
      lock: false,
    });
    return { workspaceId: actor.workspaceId, companyId };
  }

  /** Each stage owner's own read permission, as its read enforces it. */
  private async readableStages(actor: ActorContext) {
    const holds = (request: CapturedPermissionRequest) =>
      this.authorization.hasPermissions(actor, request);
    const project = await holds(PROJECT_READ);
    return {
      pricing: await holds({
        permissions: ['commercial.pricing.snapshot.read'],
        lock: false,
      }),
      profitability: await holds({
        permissions: ['commercial.profitability_estimate.read'],
        lock: false,
      }),
      offer: await holds({
        permissions: ['commercial.offer.read'],
        lock: false,
      }),
      contract: await holds({
        permissions: ['commercial.contract.read'],
        lock: false,
      }),
      project,
      certification:
        project &&
        (await holds({ permissions: ['certification.read'], lock: false })),
      followUp: await this.authorization
        .requireOpportunityFollowUpAccess(actor, { manage: false, lock: false })
        .then(
          () => true,
          (error: unknown) => {
            if (error instanceof ForbiddenException) return false;
            throw error;
          },
        ),
    };
  }

  /** Linked Projects the Project owner lets the actor read, per Opportunity. */
  private async readableLinkedProjects(
    actor: ActorContext,
    scope: AffaireScope,
    opportunityIds: readonly string[],
  ) {
    const links = await this.presence.linkedProjects(scope, opportunityIds);
    const readable = new Map<string, boolean>();
    for (const projectId of new Set(links.map((link) => link.projectId)))
      readable.set(projectId, await this.canReadProject(actor, projectId));
    return links.filter((link) => readable.get(link.projectId));
  }

  private async canReadProject(actor: ActorContext, projectId: string) {
    try {
      await this.projects.read(actor, projectId);
      return true;
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof ForbiddenException
      )
        return false;
      throw error;
    }
  }

  private async latestCases(
    scope: AffaireScope,
    links: readonly { opportunityId: string; projectId: string }[],
  ): Promise<LatestRecordTimes> {
    const cases = await this.presence.latestCertificationCases(scope, [
      ...new Set(links.map((link) => link.projectId)),
    ]);
    return latestByOpportunity(
      links.flatMap((link) => {
        const at = cases.get(link.projectId);
        return at ? [{ opportunityId: link.opportunityId, linkedAt: at }] : [];
      }),
    );
  }

  /** Main Contract with its Addenda and the Precontract, and their linked Projects. */
  private async readAgreements(actor: ActorContext, opportunityId: string) {
    const { contract, precontract } = await this.contracts.readOpportunity({
      actor,
      opportunityId,
    });
    const items: AgreementFact[] = [];
    const projects = new Map<string, ProjectFact>();
    const addProjects = (
      linked: readonly {
        id: string;
        title: string;
        status: ProjectFact['status'];
      }[],
    ) => {
      for (const project of linked)
        projects.set(project.id, {
          id: project.id,
          title: project.title,
          status: project.status,
        });
    };
    if (precontract) {
      const full = await this.contracts.read({
        actor,
        opportunityId,
        contractId: precontract.id,
      });
      items.push({
        id: precontract.id,
        kind: 'PRECONTRACT',
        versionNumber: precontract.versionNumber,
        decisionState: decisionStateOf(precontract.decisionState),
        executionState: executionStateOf(precontract.executionState),
      });
      if (full) addProjects(full.linkedProjects);
    }
    if (contract) {
      items.push({
        id: contract.id,
        kind: 'CONTRACT',
        versionNumber: contract.version.versionNumber,
        decisionState: decisionStateOf(contract.version.decisionState),
        executionState: executionStateOf(contract.version.executionState),
      });
      for (const addendum of contract.addenda)
        items.push({
          id: addendum.id,
          kind: 'ADDENDUM',
          versionNumber: addendum.versionNumber,
          decisionState: decisionStateOf(addendum.decisionState),
          executionState: executionStateOf(addendum.executionState),
        });
      addProjects(contract.linkedProjects);
    }
    return { items, projects: [...projects.values()] };
  }

  private async readCertificationCases(
    actor: ActorContext,
    projects: readonly ProjectFact[],
  ): Promise<readonly CertificationCaseFact[]> {
    const cases: CertificationCaseFact[] = [];
    for (const project of projects) {
      const list = await this.certification.list({
        actor,
        projectId: project.id,
      });
      for (const item of list.cases)
        cases.push({
          id: item.id,
          projectId: item.projectId,
          orderReference: item.orderReference,
          status: item.status,
        });
    }
    return cases;
  }
}

/** Reads through an owner; its refusal of the actor makes the fact unreadable. */
async function ownerRead<Value>(
  read: () => Promise<Value>,
): Promise<OwnerFact<Value>> {
  try {
    return { readable: true, value: await read() };
  } catch (error) {
    if (error instanceof ForbiddenException) return { readable: false };
    throw error;
  }
}

function mapFact<Value, Result>(
  fact: OwnerFact<Value>,
  map: (value: Value) => Result,
): OwnerFact<Result> {
  return fact.readable ? { readable: true, value: map(fact.value) } : fact;
}

function factPresence<Value>(
  fact: OwnerFact<Value>,
  holdsRecord: (value: Value) => boolean,
): AffaireStagePresence {
  if (!fact.readable) return 'not_available';
  return holdsRecord(fact.value) ? 'record' : 'none';
}

function availableMarker(
  marker: AffaireStageMarker,
): Exclude<AffaireStageMarker, 'not_available'> | undefined {
  return marker === 'not_available' ? undefined : marker;
}

/** The Contract owner stores these as checked text; an unknown value fails closed. */
function decisionStateOf(value: string): AgreementFact['decisionState'] {
  if (value === 'PENDING' || value === 'APPROVED' || value === 'REJECTED')
    return value;
  throw new Error('Invalid stored agreement decision state.');
}

function executionStateOf(value: string): AgreementFact['executionState'] {
  if (value === 'NOT_EXECUTED' || value === 'EXECUTED') return value;
  throw new Error('Invalid stored agreement execution state.');
}

/** The latest dated change of the Opportunity and its readable stage records. */
function lastChange(opportunityChangedAt: Date, times: StageTimes): Date {
  return latestOf([
    opportunityChangedAt,
    ...Object.values(times).map((time) => time ?? undefined),
  ]);
}

function timePresence(time: Date | null | undefined): AffaireStagePresence {
  if (time === undefined) return 'not_available';
  return time === null ? 'none' : 'record';
}

function stageView<
  Stage extends 'costing' | 'offer' | 'contract' | 'delivery' | 'closure',
>(
  stage: Stage,
  marker: Exclude<AffaireStageMarker, 'not_available'> | undefined,
  view: (
    marker: Exclude<AffaireStageMarker, 'not_available'>,
  ) => AffaireStageView,
): AffaireStageView {
  return marker === undefined
    ? { stage, marker: 'not_available' }
    : view(marker);
}

function summaryOf(
  request: CommercialIntakeDetail,
): Omit<AffaireSummary, 'followUpOn' | 'lastChangedAt' | 'thread'> {
  const opportunity = request.initialOpportunity;
  return {
    opportunityId: opportunity.id,
    clientRequestId: request.id,
    title: opportunity.title,
    subject: request.subject,
    client: request.clientReference
      ? {
          displayName: request.clientReference.displayName,
          ...(request.clientReference.currentClientId
            ? { clientDossierId: request.clientReference.currentClientId }
            : {}),
        }
      : null,
    status: opportunity.status,
    owner: opportunity.responsibleActor,
    nextAction: opportunity.nextAction,
    salesStage: opportunity.salesStage,
  };
}

function latestByOpportunity(
  links: readonly { opportunityId: string; linkedAt: Date }[],
): LatestRecordTimes {
  const latest = new Map<string, Date>();
  for (const link of links) {
    const known = latest.get(link.opportunityId);
    if (!known || link.linkedAt > known)
      latest.set(link.opportunityId, link.linkedAt);
  }
  return latest;
}

function latestOf(times: readonly (Date | undefined)[]): Date;
function latestOf(
  times: readonly (Date | undefined)[],
  none: null,
): Date | null;
function latestOf(
  times: readonly (Date | undefined)[],
  none?: null,
): Date | null {
  const dated = times.filter((time): time is Date => time !== undefined);
  if (dated.length === 0) {
    if (none === null) return null;
    throw new Error('An affaire always has a dated change.');
  }
  return new Date(Math.max(...dated.map((time) => time.getTime())));
}
