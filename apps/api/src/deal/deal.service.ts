import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { ActorContext } from '../access/access.types.js';
import type {
  CapturedPermissionRequest,
  PermissionRequirement,
} from '../access/captured-company-permissions.js';
import {
  CompanyContextAuthorization,
  commercialIntakeRequiredPermissions,
} from '../access/company-context-authorization.js';
import { CertificationService } from '../certification/certification.service.js';
import { ClientOperationalReferenceService } from '../client/client-operational-reference.service.js';
import { CommercialIntakeService } from '../commercial-intake/commercial-intake.service.js';
import type { CommercialIntakeDetail } from '../commercial-intake/commercial-intake.types.js';
import { ContractService } from '../contract/contract.service.js';
import { readConsistently } from '../database/consistent-read.js';
import { DatabaseContext } from '../database/database-context.js';
import { OfferService } from '../offer/offer.service.js';
import { OpportunityFollowUpService } from '../opportunity-follow-up/opportunity-follow-up.service.js';
import { PricingSnapshotService } from '../pricing-configuration/pricing-snapshot.service.js';
import { ProfitabilityEstimateService } from '../profitability-estimate/profitability-estimate.service.js';
import { ProjectService } from '../project/project.service.js';
import {
  DealPresenceStore,
  type DealScope,
  type LatestRecordTimes,
} from './deal-presence.store.js';
import {
  dealThread,
  type DealStage,
  type DealStageMarker,
  type DealStagePresence,
} from './deal-thread.js';
import type {
  DealDetail,
  DealListPage,
  DealStageView,
  DealSummary,
  AgreementFact,
  CertificationCaseFact,
  OfferFact,
  OwnerFact,
  ProjectFact,
} from './deal.types.js';

type ReadableStages = Awaited<ReturnType<DealService['readableStages']>>;

/** A stage's latest record time; `null` for none, `undefined` when refused. */
type StageTimes = Readonly<
  Record<Exclude<DealStage, 'request' | 'collection'>, Date | null | undefined>
>;

/** Client read, as the Client owner requires it (ClientOperationalReferenceService). */
const CLIENT_READ: PermissionRequirement = {
  permissions: ['client.read'],
  workspaceAlternative: 'client.manage',
};

/** The Project owner's read: `project.read` with Client read (ProjectService.read). */
const PROJECT_READ: CapturedPermissionRequest = {
  permissions: ['project.read'],
  lock: false,
  prerequisites: [CLIENT_READ],
};

/**
 * The read-side deal (#1533): one Opportunity and the facts each stage
 * owner already holds around it. It adds no command and stores nothing.
 * Scope always comes from the server actor context. The Commercial Intake
 * read decides whether the deal exists for the actor, so hidden and
 * missing deals share the owner's single 404; every later stage is read
 * through its own owner's existing permission and is "not available" when
 * that owner refuses the actor. Presence reads run in one repeatable-read
 * snapshot that holds the grants proving each owner's read, so a revocation
 * is ordered before or after them, never between.
 */
@Injectable()
export class DealService {
  constructor(
    private readonly database: DatabaseContext,
    private readonly authorization: CompanyContextAuthorization,
    private readonly presence: DealPresenceStore,
    private readonly clients: ClientOperationalReferenceService,
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
  ): Promise<DealDetail> {
    await this.intakeScope(actor, false);
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
    // The Contract owner refuses an executed Company-model Contract whose
    // reference Client the actor cannot read with 403 or 404
    // (ContractVersionReader.view). The deal exists, so either refusal
    // leaves the Contract stage not available.
    const agreements = await ownerRead(() => this.readAgreements(actor, id), {
      refusesWithNotFound: true,
    });
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
    } as const satisfies Record<DealStage, DealStagePresence>;
    const { thread, markers } = dealThread({
      status: request.initialOpportunity.status,
      presence,
    });
    // The list's own definition of the last change, under the same gates as
    // the facts shown here, each still held.
    const { changedAt, recorded } = await readConsistently(
      this.database,
      async () => {
        const scope = await this.intakeScope(actor, true);
        const can = await this.readableStages(actor);
        return {
          changedAt: await this.presence.opportunityChangedAt(scope, id),
          recorded: await this.recordTimes(actor, scope, [id], {
            ...can,
            pricing: can.pricing && pricingSnapshot.readable,
            profitability: can.profitability && profitabilityEstimate.readable,
            offer: can.offer && offer.readable,
            contract: can.contract && agreements.readable,
            project: can.project && delivery.readable,
            certification: can.certification && certificationCases.readable,
            followUp: can.followUp && followUpOn.readable,
          }),
        };
      },
    );
    if (!changedAt) throw new NotFoundException();

    const available = (stage: DealStage) => availableMarker(markers[stage]);
    const stages: DealStageView[] = [
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
  ): Promise<DealListPage> {
    const page = await this.intake.list(actor, query);
    // Each readability check holds its grants until the presence reads that
    // rely on it end, in one snapshot.
    const { rows, recorded, followUps } = await readConsistently(
      this.database,
      async () => {
        const scope = await this.intakeScope(actor, true);
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
        return {
          rows,
          recorded: await this.recordTimes(actor, scope, ids, can),
          followUps: can.followUp
            ? await this.presence.followUpDates(scope, ids)
            : undefined,
        };
      },
    );
    return {
      items: rows.map(({ item, opportunityId, changedAt }): DealSummary => {
        const times = recorded(opportunityId);
        const { thread } = dealThread({
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
   * The caller's transaction holds the grants behind `can`.
   */
  private async recordTimes(
    actor: ActorContext,
    scope: DealScope,
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
      ? await this.readableContractTimes(actor, scope, ids, can.client)
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

  private async intakeScope(
    actor: ActorContext,
    lock: boolean,
  ): Promise<DealScope> {
    const { companyId } = await this.authorization.requirePermissions(actor, {
      permissions: commercialIntakeRequiredPermissions('read'),
      lock,
    });
    return { workspaceId: actor.workspaceId, companyId };
  }

  /**
   * Each stage owner's own read permission, as its read enforces it. The
   * caller's transaction holds every proven grant until it ends.
   */
  private async readableStages(actor: ActorContext) {
    const holds = (request: CapturedPermissionRequest) =>
      this.authorization.hasPermissions(actor, { ...request, lock: true });
    const project = await holds(PROJECT_READ);
    return {
      pricing: await holds({
        permissions: ['commercial.pricing.snapshot.read'],
      }),
      profitability: await holds({
        permissions: ['commercial.profitability_estimate.read'],
      }),
      offer: await holds({ permissions: ['commercial.offer.read'] }),
      contract: await holds({ permissions: ['commercial.contract.read'] }),
      client: await holds(CLIENT_READ),
      project,
      certification:
        project && (await holds({ permissions: ['certification.read'] })),
      followUp: await this.authorization
        .requireOpportunityFollowUpAccess(actor, { manage: false, lock: true })
        .then(
          () => true,
          (error: unknown) => {
            if (error instanceof ForbiddenException) return false;
            throw error;
          },
        ),
    };
  }

  /**
   * Contract presence as the Contract owner shows it: an executed
   * Company-model Contract also needs its reference Client read
   * (ContractVersionReader.view), so without it that Contract counts as none.
   */
  private async readableContractTimes(
    actor: ActorContext,
    scope: DealScope,
    opportunityIds: readonly string[],
    clientRead: boolean,
  ): Promise<LatestRecordTimes> {
    const shown = new Map<string, boolean>();
    const hidden: string[] = [];
    for (const contract of await this.presence.executedCompanyModelContracts(
      scope,
      opportunityIds,
    )) {
      let readable = shown.get(contract.referenceClientId);
      if (readable === undefined) {
        readable =
          clientRead &&
          (await ownerShows(() =>
            this.clients.readReferenceClient(actor, contract.referenceClientId),
          ));
        shown.set(contract.referenceClientId, readable);
      }
      if (!readable) hidden.push(contract.contractId);
    }
    return this.presence.latestContractVersions(scope, opportunityIds, hidden);
  }

  /** Linked Projects the Project owner lets the actor read, per Opportunity. */
  private async readableLinkedProjects(
    actor: ActorContext,
    scope: DealScope,
    opportunityIds: readonly string[],
  ) {
    const links = await this.presence.linkedProjects(scope, opportunityIds);
    const readable = new Map<string, boolean>();
    for (const projectId of new Set(links.map((link) => link.projectId)))
      readable.set(
        projectId,
        await ownerShows(() => this.projects.read(actor, projectId)),
      );
    return links.filter((link) => readable.get(link.projectId));
  }

  private async latestCases(
    scope: DealScope,
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

/**
 * Reads through an owner; its refusal of the actor makes the fact unreadable.
 * An owner that hides a record it refuses answers 404, which then refuses too.
 */
async function ownerRead<Value>(
  read: () => Promise<Value>,
  options: { readonly refusesWithNotFound: boolean } = {
    refusesWithNotFound: false,
  },
): Promise<OwnerFact<Value>> {
  try {
    return { readable: true, value: await read() };
  } catch (error) {
    if (
      error instanceof ForbiddenException ||
      (options.refusesWithNotFound && error instanceof NotFoundException)
    )
      return { readable: false };
    throw error;
  }
}

/** Whether an owner's read shows the actor a record; its 403 and 404 refuse it alike. */
async function ownerShows(read: () => Promise<unknown>): Promise<boolean> {
  return (await ownerRead(read, { refusesWithNotFound: true })).readable;
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
): DealStagePresence {
  if (!fact.readable) return 'not_available';
  return holdsRecord(fact.value) ? 'record' : 'none';
}

function availableMarker(
  marker: DealStageMarker,
): Exclude<DealStageMarker, 'not_available'> | undefined {
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

function timePresence(time: Date | null | undefined): DealStagePresence {
  if (time === undefined) return 'not_available';
  return time === null ? 'none' : 'record';
}

function stageView<
  Stage extends 'costing' | 'offer' | 'contract' | 'delivery' | 'closure',
>(
  stage: Stage,
  marker: Exclude<DealStageMarker, 'not_available'> | undefined,
  view: (marker: Exclude<DealStageMarker, 'not_available'>) => DealStageView,
): DealStageView {
  return marker === undefined
    ? { stage, marker: 'not_available' }
    : view(marker);
}

function summaryOf(
  request: CommercialIntakeDetail,
): Omit<DealSummary, 'followUpOn' | 'lastChangedAt' | 'thread'> {
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
    throw new Error('A deal always has a dated change.');
  }
  return new Date(Math.max(...dated.map((time) => time.getTime())));
}
