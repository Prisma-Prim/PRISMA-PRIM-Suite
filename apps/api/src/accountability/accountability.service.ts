import { ideaEvents } from '../database/schema/ideas.js';
import type { ProjectTemplateVersion } from '../project-template/project-template.definition.js';
import type { ProjectTemplateVersionCreatedActivityEvent } from '../project-template/project-template-version.types.js';
import type { ProjectStageChangedActivityEvent } from '../project-template/project-stage.types.js';
import type { ProjectStageTaskProof } from '../project-template/project-stage.types.js';
import type { ContractQualityRuleSetVersion } from '../contract/contract-quality.js';
import type { ContractEventSource } from '../contract/contract-source.js';
import type { OfferQualityRuleSetVersion } from '../offer/offer-quality.js';
import type {
  OpportunityLossReasonCode,
  OpportunityOutcomeStatus,
} from '../commercial-intake/opportunity-outcome.js';
import type { TaskEvent, TaskEventMeaning } from '../task/task.types.js';
import type {
  ProjectResponsibleChangedActivityEvent,
  ProjectResponsibleMember,
} from '../project/project-responsibility.types.js';
import type {
  ProjectLifecycleChangedActivityEvent,
  ProjectLifecycleEventMetadata,
  ProjectLifecycleTransitionRecord,
} from '../project/project-lifecycle.types.js';
import { readTaskMeaning } from '../task/task.validation.js';
import { Injectable } from '@nestjs/common';
import {
  and,
  asc,
  desc,
  eq,
  exists,
  inArray,
  isNotNull,
  isNull,
  ne,
  notInArray,
  or,
  sql,
  type SQL,
} from 'drizzle-orm';
import { alias, type AnyPgColumn } from 'drizzle-orm/pg-core';
import { DatabaseContext } from '../database/database-context.js';
import {
  taskEvents,
  tasks,
  projectCreationEvents,
  projectResponsibilityEvents,
  projectLifecycleTransitions,
  projectStageTransitions,
  projectTemplateVersions,
  projectStartDeclarations,
  projects,
  activityLogEvents,
  documentRegistrationEvents,
  documentCorrectionCommands,
  documentProjectEvents,
  documentVersionCommands,
  workingDocuments,
  clientAccounts,
  clientCompanyRelationships,
  companies,
  internalUsers,
  workspaceMemberships,
  clientUnionOperations,
  clientUnionReversals,
  clientUnionProjections,
  commercialIntakeEvents,
  salesStageEvents,
  PRICING_PROVENANCE,
  pricingConfigurationEvents,
  offerEvents,
  offers,
  offerVersions,
  opportunities,
  clientRequests,
  contractEvents,
  contractProjectLinks,
  contracts,
  contractVersions,
  profitabilityEstimateEvents,
  operationalRiskEvents,
  type TariffCurrency,
} from '../database/schema/index.js';
import type { ActorContext } from '../access/access.types.js';
import {
  commercialActivityTarget,
  eligibleCommercialActions,
  readCommercialActivity,
  type CommercialIntakeActivityAction,
  type RecordedSalesStage,
  type RecordedOpportunityResponsible,
} from './commercial-activity-projection.js';
import {
  eligibleOfferActivityActions,
  readOfferActivity,
} from './offer-activity-projection.js';
import {
  eligibleContractActivityActions,
  readContractActivity,
} from './contract-activity-projection.js';
import { readClientCorrectionChanges } from './client-correction-history.js';
import type {
  ActivityLogPage,
  ClientCorrectionHistoryRead,
  CommercialActivityEvent,
  OfferActivityEvent,
  ContractActivityEvent,
  DocumentRegisteredActivityEvent,
  DocumentCorrectedActivityEvent,
  DocumentProjectActivityEvent,
  DocumentVersionActivityEvent,
  CanonicalActivityEvent,
  ClientUnionActivityEvent,
  ProjectCreatedActivityEvent,
} from './accountability.types.js';
import {
  CLIENT_CORRECTED_ACTION,
  COMPANY_SCOPED_CLIENT_ACTIONS,
} from './accountability.types.js';

const INITIAL_PAGE_SIZE = 50;
const CLIENT_CORRECTION_HISTORY_PAGE_SIZE = 20;

/** The exact server time, as PostgreSQL renders it, and id of a page's last row. */
interface DatedEventCursor {
  occurredAt: string;
  id: string;
}

/**
 * The rows strictly older than the cursor in the newest-first
 * `(occurredAt, id)` order of a dated event source, or every row without one.
 */
function olderThan(
  occurredAt: AnyPgColumn,
  id: AnyPgColumn,
  after: DatedEventCursor | undefined,
): SQL | undefined {
  return after === undefined
    ? undefined
    : sql`(${occurredAt}, ${id}) < (${after.occurredAt}::timestamptz, ${after.id}::uuid)`;
}

/**
 * The newest projectable events of one dated source, up to the page size. The
 * limit applies to projected events: a row rejected by its projection never
 * takes the place of an older valid event. Each read returns at most one
 * page of rows strictly older than the cursor, newest first.
 */
async function projectedPage<
  Row extends { id: string; cursorAt: string },
  Event,
>(
  read: (after: DatedEventCursor | undefined) => Promise<Row[]>,
  project: (row: Row) => Event | undefined,
): Promise<Event[]> {
  const events: Event[] = [];
  let after: DatedEventCursor | undefined;
  for (;;) {
    const rows = await read(after);
    for (const row of rows) {
      const event = project(row);
      if (event !== undefined) events.push(event);
      if (events.length === INITIAL_PAGE_SIZE) return events;
    }
    const last = rows.at(-1);
    if (!last || rows.length < INITIAL_PAGE_SIZE) return events;
    after = { occurredAt: last.cursorAt, id: last.id };
  }
}

@Injectable()
export class AccountabilityService {
  async recordOfferVersionCreated(input: {
    actor: ActorContext;
    companyId: string;
    offerId: string;
    offerVersionId: string;
    versionNumber: number;
    predecessorVersionNumber: number;
    pricingSnapshotId: string;
    recipientKind: 'PRIMARY' | 'ADDITIONAL';
    occurredAt: Date;
  }): Promise<void> {
    await this.databaseContext.connection.insert(offerEvents).values({
      workspaceId: input.actor.workspaceId,
      companyId: input.companyId,
      offerId: input.offerId,
      offerVersionId: input.offerVersionId,
      actorInternalUserId: input.actor.internalUserId,
      actorWorkspaceMembershipId: input.actor.workspaceMembershipId,
      occurredAt: input.occurredAt,
      action: 'offer_version.created',
      metadata: {
        offerId: input.offerId,
        offerVersionId: input.offerVersionId,
        versionNumber: input.versionNumber,
        predecessorVersionNumber: input.predecessorVersionNumber,
        pricingSnapshotId: input.pricingSnapshotId,
        recipientKind: input.recipientKind,
        provenance: 'ILLUSTRATIVE',
      },
    });
  }
  async recordOfferClientResponse(input: {
    actor: ActorContext;
    companyId: string;
    offerId: string;
    offerVersionId: string;
    versionNumber: number;
    occurredAt: Date;
    outcome: 'ACCEPTED' | 'REJECTED' | 'EXPIRED';
  }): Promise<void> {
    await this.databaseContext.connection.insert(offerEvents).values({
      workspaceId: input.actor.workspaceId,
      companyId: input.companyId,
      offerId: input.offerId,
      offerVersionId: input.offerVersionId,
      actorInternalUserId: input.actor.internalUserId,
      actorWorkspaceMembershipId: input.actor.workspaceMembershipId,
      occurredAt: input.occurredAt,
      action: 'offer_version.client_response_recorded',
      metadata: {
        offerId: input.offerId,
        offerVersionId: input.offerVersionId,
        versionNumber: input.versionNumber,
        evidenceKind: 'SIMULATED',
        outcome: input.outcome,
        provenance: 'ILLUSTRATIVE',
      },
    });
  }

  async recordOfferTransmission(input: {
    actor: ActorContext;
    companyId: string;
    offerId: string;
    offerVersionId: string;
    versionNumber: number;
    occurredAt: Date;
    ruleSetVersion: OfferQualityRuleSetVersion;
    acknowledgedWarningCodes: readonly string[];
  }): Promise<void> {
    await this.databaseContext.connection.insert(offerEvents).values({
      workspaceId: input.actor.workspaceId,
      companyId: input.companyId,
      offerId: input.offerId,
      offerVersionId: input.offerVersionId,
      actorInternalUserId: input.actor.internalUserId,
      actorWorkspaceMembershipId: input.actor.workspaceMembershipId,
      occurredAt: input.occurredAt,
      action: 'offer_version.transmission_recorded',
      metadata: {
        offerId: input.offerId,
        offerVersionId: input.offerVersionId,
        versionNumber: input.versionNumber,
        channel: 'SIMULATED',
        provenance: 'ILLUSTRATIVE',
        ruleSetVersion: input.ruleSetVersion,
        acknowledgedWarningCodes: input.acknowledgedWarningCodes,
      },
    });
  }

  async recordOfferDecision(input: {
    actor: ActorContext;
    companyId: string;
    offerId: string;
    offerVersionId: string;
    versionNumber: number;
    occurredAt: Date;
    decision:
      | {
          state: 'APPROVED';
          ruleSetVersion: OfferQualityRuleSetVersion;
          acknowledgedWarningCodes: readonly string[];
        }
      | { state: 'REJECTED' };
  }) {
    const { decision } = input;
    await this.databaseContext.connection.insert(offerEvents).values({
      workspaceId: input.actor.workspaceId,
      companyId: input.companyId,
      offerId: input.offerId,
      offerVersionId: input.offerVersionId,
      actorInternalUserId: input.actor.internalUserId,
      actorWorkspaceMembershipId: input.actor.workspaceMembershipId,
      occurredAt: input.occurredAt,
      action:
        decision.state === 'APPROVED'
          ? 'offer_version.approved'
          : 'offer_version.rejected',
      metadata: {
        offerId: input.offerId,
        offerVersionId: input.offerVersionId,
        versionNumber: input.versionNumber,
        outcome: decision.state,
        provenance: 'ILLUSTRATIVE',
        ...(decision.state === 'APPROVED'
          ? {
              ruleSetVersion: decision.ruleSetVersion,
              acknowledgedWarningCodes: decision.acknowledgedWarningCodes,
            }
          : {}),
      },
    });
  }
  constructor(private readonly databaseContext: DatabaseContext) {}

  async recordContractCreated(input: {
    actor: ActorContext;
    companyId: string;
    contractId: string;
    contractVersionId: string;
    illustrativeReference: number;
    source: ContractEventSource;
    pricingSnapshotId: string | null;
    occurredAt: Date;
  }): Promise<void> {
    const base = {
      workspaceId: input.actor.workspaceId,
      companyId: input.companyId,
      contractId: input.contractId,
      actorInternalUserId: input.actor.internalUserId,
      actorWorkspaceMembershipId: input.actor.workspaceMembershipId,
      occurredAt: input.occurredAt,
    };
    const metadata = {
      contractId: input.contractId,
      ...contractEventMetadata(input.source),
      provenance: 'ILLUSTRATIVE',
    };
    await this.databaseContext.connection.insert(contractEvents).values([
      {
        ...base,
        action: 'contract.created',
        contractVersionId: null,
        metadata: {
          ...metadata,
          illustrativeReference: input.illustrativeReference,
        },
      },
      {
        ...base,
        action: 'contract_version.created',
        contractVersionId: input.contractVersionId,
        metadata: {
          ...metadata,
          contractVersionId: input.contractVersionId,
          versionNumber: 1,
          ...(input.pricingSnapshotId === null
            ? {}
            : { pricingSnapshotId: input.pricingSnapshotId }),
        },
      },
    ]);
  }

  async recordContractVersionCreated(input: {
    actor: ActorContext;
    companyId: string;
    contractId: string;
    contractVersionId: string;
    versionNumber: number;
    predecessorVersionNumber: number;
    source: ContractEventSource;
    pricingSnapshotId: string | null;
    occurredAt: Date;
  }): Promise<void> {
    await this.databaseContext.connection.insert(contractEvents).values({
      workspaceId: input.actor.workspaceId,
      companyId: input.companyId,
      contractId: input.contractId,
      contractVersionId: input.contractVersionId,
      actorInternalUserId: input.actor.internalUserId,
      actorWorkspaceMembershipId: input.actor.workspaceMembershipId,
      occurredAt: input.occurredAt,
      action: 'contract_version.created',
      metadata: {
        contractId: input.contractId,
        contractVersionId: input.contractVersionId,
        versionNumber: input.versionNumber,
        predecessorVersionNumber: input.predecessorVersionNumber,
        ...contractEventMetadata(input.source),
        provenance: 'ILLUSTRATIVE',
        ...(input.pricingSnapshotId === null
          ? {}
          : { pricingSnapshotId: input.pricingSnapshotId }),
      },
    });
  }

  async recordContractDecision(input: {
    actor: ActorContext;
    companyId: string;
    contractId: string;
    contractVersionId: string;
    versionNumber: number;
    decision:
      | {
          kind: 'APPROVE';
          ruleSetVersion: ContractQualityRuleSetVersion;
          acknowledgedWarningCodes: readonly string[];
        }
      | { kind: 'REJECT' };
    source: ContractEventSource;
    pricingSnapshotId: string | null;
    occurredAt: Date;
  }): Promise<void> {
    const { decision } = input;
    await this.databaseContext.connection.insert(contractEvents).values({
      workspaceId: input.actor.workspaceId,
      companyId: input.companyId,
      contractId: input.contractId,
      contractVersionId: input.contractVersionId,
      action:
        decision.kind === 'APPROVE'
          ? 'contract_version.approved'
          : 'contract_version.rejected',
      actorInternalUserId: input.actor.internalUserId,
      actorWorkspaceMembershipId: input.actor.workspaceMembershipId,
      occurredAt: input.occurredAt,
      metadata: {
        contractId: input.contractId,
        contractVersionId: input.contractVersionId,
        versionNumber: input.versionNumber,
        ...contractEventMetadata(input.source),
        provenance: 'ILLUSTRATIVE',
        ...(input.pricingSnapshotId === null
          ? {}
          : { pricingSnapshotId: input.pricingSnapshotId }),
        ...(decision.kind === 'APPROVE'
          ? {
              ruleSetVersion: decision.ruleSetVersion,
              acknowledgedWarningCodes: decision.acknowledgedWarningCodes,
            }
          : {}),
      },
    });
  }

  async recordContractSignature(input: {
    actor: ActorContext;
    companyId: string;
    contractId: string;
    contractVersionId: string;
    versionNumber: number;
    source: ContractEventSource;
    pricingSnapshotId: string | null;
    ruleSetVersion: ContractQualityRuleSetVersion;
    acknowledgedWarningCodes: readonly string[];
    occurredAt: Date;
  }): Promise<void> {
    await this.databaseContext.connection.insert(contractEvents).values({
      workspaceId: input.actor.workspaceId,
      companyId: input.companyId,
      contractId: input.contractId,
      contractVersionId: input.contractVersionId,
      action: 'contract_version.signature_recorded',
      actorInternalUserId: input.actor.internalUserId,
      actorWorkspaceMembershipId: input.actor.workspaceMembershipId,
      occurredAt: input.occurredAt,
      metadata: {
        contractId: input.contractId,
        contractVersionId: input.contractVersionId,
        versionNumber: input.versionNumber,
        ...contractEventMetadata(input.source),
        provenance: 'ILLUSTRATIVE',
        ...(input.pricingSnapshotId === null
          ? {}
          : { pricingSnapshotId: input.pricingSnapshotId }),
        ruleSetVersion: input.ruleSetVersion,
        acknowledgedWarningCodes: input.acknowledgedWarningCodes,
        evidenceKind: 'SIMULATED',
      },
    });
  }

  async recordContractProjectLinked(input: {
    actor: ActorContext;
    companyId: string;
    contractId: string;
    projectId: string;
    created: boolean;
    occurredAt: Date;
  }): Promise<void> {
    await this.databaseContext.connection.insert(contractEvents).values({
      workspaceId: input.actor.workspaceId,
      companyId: input.companyId,
      contractId: input.contractId,
      action: 'contract_project.linked',
      actorInternalUserId: input.actor.internalUserId,
      actorWorkspaceMembershipId: input.actor.workspaceMembershipId,
      occurredAt: input.occurredAt,
      metadata: {
        contractId: input.contractId,
        projectId: input.projectId,
        created: input.created,
      },
    });
  }

  async recordOfferCreated(input: {
    actor: ActorContext;
    companyId: string;
    offerId: string;
    offerVersionId: string;
    illustrativeReference: number;
    pricingSnapshotId: string;
    recipientKind: 'PRIMARY' | 'ADDITIONAL';
    occurredAt: Date;
  }): Promise<void> {
    await this.databaseContext.connection.insert(offerEvents).values([
      {
        workspaceId: input.actor.workspaceId,
        companyId: input.companyId,
        action: 'offer.created',
        offerId: input.offerId,
        offerVersionId: null,
        actorInternalUserId: input.actor.internalUserId,
        actorWorkspaceMembershipId: input.actor.workspaceMembershipId,
        occurredAt: input.occurredAt,
        metadata: {
          offerId: input.offerId,
          illustrativeReference: input.illustrativeReference,
          provenance: 'ILLUSTRATIVE',
        },
      },
      {
        workspaceId: input.actor.workspaceId,
        companyId: input.companyId,
        action: 'offer_version.created',
        offerId: input.offerId,
        offerVersionId: input.offerVersionId,
        actorInternalUserId: input.actor.internalUserId,
        actorWorkspaceMembershipId: input.actor.workspaceMembershipId,
        occurredAt: input.occurredAt,
        metadata: {
          offerId: input.offerId,
          offerVersionId: input.offerVersionId,
          versionNumber: 1,
          pricingSnapshotId: input.pricingSnapshotId,
          recipientKind: input.recipientKind,
          provenance: 'ILLUSTRATIVE',
        },
      },
    ]);
  }

  async recordTaskEvent(input: {
    actor: ActorContext;
    taskId: string;
    companyId: string;
    occurredAt: Date;
    meaning: TaskEventMeaning;
  }): Promise<void> {
    await this.databaseContext.connection.insert(taskEvents).values({
      workspaceId: input.actor.workspaceId,
      companyId: input.companyId,
      taskId: input.taskId,
      version: input.meaning.metadata.version,
      actorInternalUserId: input.actor.internalUserId,
      actorMembershipId: input.actor.workspaceMembershipId,
      actorDisplayName: input.actor.displayName,
      occurredAt: input.occurredAt,
      meaning: input.meaning,
    });
  }
  async readTaskHistory(
    actor: ActorContext,
    taskId?: string,
  ): Promise<TaskEvent[]> {
    if (
      !actor.activeCompany?.taskPermissions?.includes('task.read') ||
      !actor.activeCompany.projectPermissions?.includes('project.read') ||
      (!actor.workspacePermissions.includes('client.manage') &&
        !actor.activeCompany.clientPermissions.includes('client.read'))
    )
      return [];
    const query = this.databaseContext.connection
      .select({ event: taskEvents, taskTitle: tasks.title })
      .from(taskEvents)
      .innerJoin(
        tasks,
        and(
          eq(tasks.workspaceId, taskEvents.workspaceId),
          eq(tasks.companyId, taskEvents.companyId),
          eq(tasks.id, taskEvents.taskId),
        ),
      )
      .innerJoin(
        projects,
        and(
          eq(projects.workspaceId, tasks.workspaceId),
          eq(projects.companyId, tasks.companyId),
          eq(projects.id, tasks.projectId),
          eq(projects.clientAccountId, tasks.clientAccountId),
        ),
      )
      .innerJoin(
        clientAccounts,
        and(
          eq(clientAccounts.workspaceId, tasks.workspaceId),
          eq(clientAccounts.id, tasks.clientAccountId),
          or(
            eq(clientAccounts.status, 'active'),
            eq(clientAccounts.status, 'superseded'),
          ),
        ),
      )
      .innerJoin(
        clientCompanyRelationships,
        and(
          eq(clientCompanyRelationships.workspaceId, tasks.workspaceId),
          eq(clientCompanyRelationships.clientAccountId, tasks.clientAccountId),
          eq(clientCompanyRelationships.companyId, tasks.companyId),
          eq(clientCompanyRelationships.status, 'active'),
        ),
      )
      .where(
        and(
          eq(taskEvents.workspaceId, actor.workspaceId),
          eq(taskEvents.companyId, actor.activeCompany.id),
          taskId ? eq(taskEvents.taskId, taskId) : undefined,
        ),
      )
      .orderBy(
        taskId ? asc(taskEvents.version) : desc(taskEvents.occurredAt),
        desc(taskEvents.version),
        desc(taskEvents.id),
      );
    const rows = taskId ? await query : await query.limit(INITIAL_PAGE_SIZE);
    return rows.map(({ event, taskTitle }) => ({
      ...readTaskMeaning(event.meaning),
      id: event.id,
      occurredAt: event.occurredAt.toISOString(),
      actor: {
        internalUserId: event.actorInternalUserId,
        workspaceMembershipId: event.actorMembershipId,
        displayName: event.actorDisplayName,
      },
      target: {
        type: 'task',
        taskId: event.taskId,
        taskTitle,
        companyId: event.companyId,
      },
    }));
  }
  /** Immutable Version creation is also its single attributable event source. */
  async recordProjectTemplateVersionCreated(input: {
    actor: ActorContext;
    companyId: string;
    snapshot: ProjectTemplateVersion;
    sourceVersion: number;
  }) {
    const [row] = await this.databaseContext.connection
      .insert(projectTemplateVersions)
      .values({
        workspaceId: input.actor.workspaceId,
        companyId: input.companyId,
        templateKey: input.snapshot.templateKey,
        version: input.snapshot.version,
        sourceVersion: input.sourceVersion,
        snapshot: input.snapshot,
        actorInternalUserId: input.actor.internalUserId,
        actorMembershipId: input.actor.workspaceMembershipId,
        actorDisplayName: input.actor.displayName,
      })
      .returning();
    if (!row) throw new Error('Template Version creation was not recorded.');
    return row;
  }

  private async projectTemplateVersionEvents(
    actor: ActorContext,
  ): Promise<ProjectTemplateVersionCreatedActivityEvent[]> {
    const company = actor.activeCompany;
    if (
      !company?.projectPermissions?.includes('project.read') ||
      company.projectTemplatePermissionSetVersion !== 'v1' ||
      !company.projectTemplatePermissionAssignmentId ||
      !company.projectTemplatePermissions?.includes('project.template.read')
    )
      return [];
    const rows = await this.databaseContext.connection
      .select()
      .from(projectTemplateVersions)
      .where(
        and(
          eq(projectTemplateVersions.workspaceId, actor.workspaceId),
          eq(projectTemplateVersions.companyId, company.id),
        ),
      )
      .orderBy(
        desc(projectTemplateVersions.occurredAt),
        desc(projectTemplateVersions.id),
      )
      .limit(INITIAL_PAGE_SIZE);
    return rows.map((row) => ({
      id: row.id,
      action: 'project.template.version.created',
      occurredAt: row.occurredAt.toISOString(),
      actor: {
        internalUserId: row.actorInternalUserId,
        displayName: row.actorDisplayName,
      },
      target: {
        type: 'project_template_version',
        versionId: row.id,
        companyId: row.companyId,
      },
      metadata: {
        templateKey: row.templateKey,
        version: row.version,
        sourceVersion: row.sourceVersion,
      },
    }));
  }

  async recordProjectCreated(input: {
    actor: ActorContext;
    projectId: string;
    companyId: string;
  }): Promise<void> {
    await this.databaseContext.connection.insert(projectCreationEvents).values({
      workspaceId: input.actor.workspaceId,
      companyId: input.companyId,
      projectId: input.projectId,
      actorInternalUserId: input.actor.internalUserId,
      actorWorkspaceMembershipId: input.actor.workspaceMembershipId,
    });
  }

  // The caller commits this with the responsibility, its receipt and the
  // original Client fence. Recording grants no read of it.
  async recordProjectResponsibleChanged(input: {
    actor: ActorContext;
    companyId: string;
    projectId: string;
    occurredAt: Date;
    revision: number;
    before: ProjectResponsibleMember | null;
    after: ProjectResponsibleMember | null;
  }): Promise<void> {
    await this.databaseContext.connection
      .insert(projectResponsibilityEvents)
      .values({
        workspaceId: input.actor.workspaceId,
        companyId: input.companyId,
        projectId: input.projectId,
        revision: input.revision,
        actorInternalUserId: input.actor.internalUserId,
        actorMembershipId: input.actor.workspaceMembershipId,
        beforeMembershipId: input.before?.workspaceMembershipId ?? null,
        beforeDisplayLabel: input.before?.displayLabel ?? null,
        afterMembershipId: input.after?.workspaceMembershipId ?? null,
        afterDisplayLabel: input.after?.displayLabel ?? null,
        occurredAt: input.occurredAt,
      });
  }

  /** One immutable event/transition source; its Activity projection excludes Task proof. */
  async recordProjectStageChanged(input: {
    actor: ActorContext;
    companyId: string;
    projectId: string;
    stageRevision: number;
    fromStageKey: string;
    fromStageTitle: string;
    toStageKey: string;
    toStageTitle: string;
    requiredTasks: ProjectStageTaskProof[];
    occurredAt: Date;
  }) {
    const { actor, ...facts } = input;
    const [row] = await this.databaseContext.connection
      .insert(projectStageTransitions)
      .values({
        ...facts,
        workspaceId: actor.workspaceId,
        actorInternalUserId: actor.internalUserId,
        actorMembershipId: actor.workspaceMembershipId,
        actorDisplayName: actor.displayName,
      })
      .returning();
    if (!row) throw new Error('Project stage transition was not recorded.');
    return row;
  }

  // The append-only `project.lifecycle.changed` record. The caller commits it
  // with the status, revision, start record, receipt and original Client fence.
  async recordProjectLifecycleChanged(input: {
    actor: ActorContext;
    companyId: string;
    projectId: string;
    occurredAt: Date;
    lifecycleRevision: number;
    transition: ProjectLifecycleTransitionRecord;
  }): Promise<void> {
    const { transition } = input;
    await this.databaseContext.connection
      .insert(projectLifecycleTransitions)
      .values({
        workspaceId: input.actor.workspaceId,
        companyId: input.companyId,
        projectId: input.projectId,
        lifecycleRevision: input.lifecycleRevision,
        action: transition.action,
        fromStatus: transition.from,
        toStatus: transition.to,
        reason:
          transition.action === 'hold' || transition.action === 'cancel'
            ? transition.reason
            : null,
        note: transition.action === 'complete' ? transition.note : null,
        actorInternalUserId: input.actor.internalUserId,
        actorMembershipId: input.actor.workspaceMembershipId,
        actorDisplayName: input.actor.displayName,
        occurredAt: input.occurredAt,
      });
  }

  // Recording grants no read. The authorized Company projection requires the
  // opt-in reader bundle and current commercial target read.
  async recordCommercialIntakeCreated(input: {
    actor: ActorContext;
    companyId: string;
    clientRequestId: string;
    opportunityId: string;
  }): Promise<void> {
    const base = {
      workspaceId: input.actor.workspaceId,
      companyId: input.companyId,
      clientRequestId: input.clientRequestId,
      opportunityId: input.opportunityId,
      actorInternalUserId: input.actor.internalUserId,
      actorWorkspaceMembershipId: input.actor.workspaceMembershipId,
    };
    await this.databaseContext.connection
      .insert(commercialIntakeEvents)
      .values([
        {
          ...base,
          action: 'client_request.created',
          metadata: { requestVersion: 1 },
        },
        {
          ...base,
          action: 'opportunity.created',
          metadata: { opportunityVersion: 1 },
        },
      ]);
  }

  // Records the only post-R3A1 Opportunity mutation. Metadata carries the
  // resulting version only; the caller commits it with the update itself.
  // Projection of this event is owned by the commercial Activity read slice.
  async recordOpportunityNextActionUpdated(input: {
    actor: ActorContext;
    companyId: string;
    clientRequestId: string;
    opportunityId: string;
    opportunityVersion: number;
  }): Promise<void> {
    await this.databaseContext.connection
      .insert(commercialIntakeEvents)
      .values({
        workspaceId: input.actor.workspaceId,
        companyId: input.companyId,
        clientRequestId: input.clientRequestId,
        opportunityId: input.opportunityId,
        actorInternalUserId: input.actor.internalUserId,
        actorWorkspaceMembershipId: input.actor.workspaceMembershipId,
        action: 'opportunity.next_action.updated',
        metadata: { opportunityVersion: input.opportunityVersion },
      });
  }

  async recordClientRequestClientAssociated(input: {
    actor: ActorContext;
    companyId: string;
    clientRequestId: string;
    opportunityId: string;
  }): Promise<void> {
    await this.databaseContext.connection
      .insert(commercialIntakeEvents)
      .values({
        workspaceId: input.actor.workspaceId,
        companyId: input.companyId,
        clientRequestId: input.clientRequestId,
        opportunityId: input.opportunityId,
        actorInternalUserId: input.actor.internalUserId,
        actorWorkspaceMembershipId: input.actor.workspaceMembershipId,
        action: 'client_request.client_associated',
        metadata: { requestVersion: 2 },
      });
  }

  // Records one material responsible-actor change. Metadata carries the
  // resulting version and the previous and new responsible actor, each a
  // membership identifier and the label captured now; the caller commits it
  // with the change, its version and its receipt.
  async recordOpportunityResponsibleChanged(input: {
    actor: ActorContext;
    companyId: string;
    clientRequestId: string;
    opportunityId: string;
    opportunityVersion: number;
    before: RecordedOpportunityResponsible;
    after: RecordedOpportunityResponsible;
  }): Promise<void> {
    await this.databaseContext.connection
      .insert(commercialIntakeEvents)
      .values({
        workspaceId: input.actor.workspaceId,
        companyId: input.companyId,
        clientRequestId: input.clientRequestId,
        opportunityId: input.opportunityId,
        actorInternalUserId: input.actor.internalUserId,
        actorWorkspaceMembershipId: input.actor.workspaceMembershipId,
        action: 'opportunity.responsible.changed',
        metadata: {
          opportunityVersion: input.opportunityVersion,
          before: {
            workspaceMembershipId: input.before.workspaceMembershipId,
            displayLabel: input.before.displayLabel,
          },
          after: {
            workspaceMembershipId: input.after.workspaceMembershipId,
            displayLabel: input.after.displayLabel,
          },
        },
      });
  }

  // Records one committed outcome status transition. Metadata carries exactly
  // the resulting version, the previous and new status and, for a loss, its
  // reason code; never reason or note text. The caller commits it with the
  // transition, its history entry and its receipt.
  async recordOpportunityOutcomeChanged(input: {
    actor: ActorContext;
    companyId: string;
    clientRequestId: string;
    opportunityId: string;
    opportunityVersion: number;
    previousStatus: OpportunityOutcomeStatus;
    newStatus: OpportunityOutcomeStatus;
    lossReasonCode: OpportunityLossReasonCode | null;
  }): Promise<void> {
    await this.databaseContext.connection
      .insert(commercialIntakeEvents)
      .values({
        workspaceId: input.actor.workspaceId,
        companyId: input.companyId,
        clientRequestId: input.clientRequestId,
        opportunityId: input.opportunityId,
        actorInternalUserId: input.actor.internalUserId,
        actorWorkspaceMembershipId: input.actor.workspaceMembershipId,
        action: 'opportunity.outcome.changed',
        metadata: {
          opportunityVersion: input.opportunityVersion,
          previousStatus: input.previousStatus,
          newStatus: input.newStatus,
          ...(input.lossReasonCode === null
            ? {}
            : { lossReasonCode: input.lossReasonCode }),
        },
      });
  }

  // Records one material Sales Stage assignment. Metadata carries exactly the
  // resulting version and the previous and new stage, each an identifier and
  // the label captured now, or null; the caller commits it with the change,
  // its history entry and its receipt.
  async recordOpportunityStageChanged(input: {
    actor: ActorContext;
    companyId: string;
    clientRequestId: string;
    opportunityId: string;
    opportunityVersion: number;
    previousStage: RecordedSalesStage;
    newStage: RecordedSalesStage;
  }): Promise<void> {
    await this.databaseContext.connection
      .insert(commercialIntakeEvents)
      .values({
        workspaceId: input.actor.workspaceId,
        companyId: input.companyId,
        clientRequestId: input.clientRequestId,
        opportunityId: input.opportunityId,
        actorInternalUserId: input.actor.internalUserId,
        actorWorkspaceMembershipId: input.actor.workspaceMembershipId,
        action: 'opportunity.stage.changed',
        metadata: {
          opportunityVersion: input.opportunityVersion,
          previousStage: recordedStage(input.previousStage),
          newStage: recordedStage(input.newStage),
        },
      });
  }

  // Records one committed Sales Stage configuration operation, targeting the
  // stage. Metadata carries exactly the operation, the resulting configuration
  // revision and the label after it; the caller commits it with the operation
  // and its receipt.
  async recordSalesStageConfigured(input: {
    actor: ActorContext;
    companyId: string;
    salesStageId: string;
    configurationRevision: number;
    label: string;
  }): Promise<void> {
    await this.databaseContext.connection.insert(salesStageEvents).values({
      workspaceId: input.actor.workspaceId,
      companyId: input.companyId,
      salesStageId: input.salesStageId,
      actorInternalUserId: input.actor.internalUserId,
      actorWorkspaceMembershipId: input.actor.workspaceMembershipId,
      action: 'sales_stage.configured',
      metadata: {
        operation: 'CREATED',
        configurationRevision: input.configurationRevision,
        label: input.label,
      },
    });
  }

  // Recorded but projected by no Activity read surface. Metadata carries
  // identifiers, the version number and provenance only, never the label; the
  // caller commits it with the publication itself.
  async recordPricingRuleVersionPublished(input: {
    actor: ActorContext;
    companyId: string;
    pricingRuleVersionId: string;
    versionNumber: number;
    occurredAt: Date;
  }): Promise<void> {
    await this.databaseContext.connection
      .insert(pricingConfigurationEvents)
      .values({
        workspaceId: input.actor.workspaceId,
        companyId: input.companyId,
        action: 'pricing_rule_version.published',
        pricingRuleVersionId: input.pricingRuleVersionId,
        actorInternalUserId: input.actor.internalUserId,
        actorWorkspaceMembershipId: input.actor.workspaceMembershipId,
        occurredAt: input.occurredAt,
        metadata: {
          pricingRuleVersionId: input.pricingRuleVersionId,
          versionNumber: input.versionNumber,
          provenance: PRICING_PROVENANCE,
        },
      });
  }

  // Recorded but projected by no Activity read surface. Metadata carries
  // identifiers, the version number, provenance and the currency only, never
  // an amount, rate, unit or label; the caller commits it with the
  // publication itself.
  async recordTariffVersionPublished(input: {
    actor: ActorContext;
    companyId: string;
    tariffVersionId: string;
    offeringId: string;
    versionNumber: number;
    currency: TariffCurrency;
    occurredAt: Date;
  }): Promise<void> {
    await this.databaseContext.connection
      .insert(pricingConfigurationEvents)
      .values({
        workspaceId: input.actor.workspaceId,
        companyId: input.companyId,
        action: 'tariff_version.published',
        tariffVersionId: input.tariffVersionId,
        actorInternalUserId: input.actor.internalUserId,
        actorWorkspaceMembershipId: input.actor.workspaceMembershipId,
        occurredAt: input.occurredAt,
        metadata: {
          tariffVersionId: input.tariffVersionId,
          offeringId: input.offeringId,
          versionNumber: input.versionNumber,
          provenance: PRICING_PROVENANCE,
          currency: input.currency,
        },
      });
  }

  // Recorded but projected by no Activity read surface. The metadata is a
  // correlation trace only: identifiers, bounded counts, provenance and
  // currency are safe; copied reasons, labels, quantities, rates and amounts
  // stay out of it.
  async recordPricingSnapshotCreated(input: {
    actor: ActorContext;
    companyId: string;
    pricingSnapshotId: string;
    opportunityId: string;
    lineCount: number;
    adjustmentCount: number;
    currency: TariffCurrency;
    occurredAt: Date;
  }): Promise<void> {
    await this.databaseContext.connection
      .insert(pricingConfigurationEvents)
      .values({
        workspaceId: input.actor.workspaceId,
        companyId: input.companyId,
        action: 'pricing_snapshot.created',
        pricingSnapshotId: input.pricingSnapshotId,
        actorInternalUserId: input.actor.internalUserId,
        actorWorkspaceMembershipId: input.actor.workspaceMembershipId,
        occurredAt: input.occurredAt,
        metadata: {
          pricingSnapshotId: input.pricingSnapshotId,
          opportunityId: input.opportunityId,
          lineCount: input.lineCount,
          adjustmentCount: input.adjustmentCount,
          provenance: PRICING_PROVENANCE,
          currency: input.currency,
        },
      });
  }

  async recordIdeaEvent(
    input: {
      actor: ActorContext;
      companyId: string;
      ideaId: string;
      revision: number;
      occurredAt: Date;
    } & (
      | { action: 'idea.recorded' }
      | {
          action: 'idea.disposition.recorded';
          disposition: 'deferred' | 'rejected';
        }
    ),
  ): Promise<void> {
    await this.databaseContext.connection.insert(ideaEvents).values({
      workspaceId: input.actor.workspaceId,
      companyId: input.companyId,
      ideaId: input.ideaId,
      revision: input.revision,
      action: input.action,
      actorMembershipId: input.actor.workspaceMembershipId,
      actorInternalUserId: input.actor.internalUserId,
      occurredAt: input.occurredAt,
      metadata:
        input.action === 'idea.recorded'
          ? { revision: input.revision }
          : { revision: input.revision, disposition: input.disposition },
    });
  }

  // Internal restricted recording only: no generic Activity/Home target exists.
  async recordOperationalRiskEvent(
    input: {
      actor: ActorContext;
      companyId: string;
      riskId: string;
      entryId: string;
      revision: number;
      recordedAt: Date;
    } & (
      | {
          action:
            'operational_risk.recorded' | 'operational_risk.intake.corrected';
        }
      | {
          action: 'operational_risk.journal.recorded';
          kind: 'observation' | 'reassessment';
        }
    ),
  ): Promise<void> {
    const [recorded] = await this.databaseContext.connection
      .insert(operationalRiskEvents)
      .values({
        workspaceId: input.actor.workspaceId,
        companyId: input.companyId,
        riskId: input.riskId,
        entryId: input.entryId,
        revision: input.revision,
        action: input.action,
        actorInternalUserId: input.actor.internalUserId,
        actorMembershipId: input.actor.workspaceMembershipId,
        recordedAt: input.recordedAt,
        metadata:
          input.action === 'operational_risk.journal.recorded'
            ? { revision: input.revision, kind: input.kind }
            : { revision: input.revision },
      })
      .returning({ id: operationalRiskEvents.id });
    if (!recorded)
      throw new Error('The restricted Risk event was not recorded.');
  }

  // Confidential profitability events have no Activity read projection.
  // Only these typed correlation fields enter the restricted envelope.
  async recordProfitabilityEstimateEvent(
    input: {
      actor: ActorContext;
      companyId: string;
      estimateId: string;
      versionId: string;
      versionNumber: number;
      opportunityId: string;
      clientRequestId: string;
      occurredAt: Date;
    } & (
      | { action: 'profitability_estimate_version.created' }
      | {
          action: 'profitability_estimate_version.decided';
          decisionCode: 'APPROVE' | 'MODIFY' | 'REJECT';
        }
    ),
  ): Promise<void> {
    await this.databaseContext.connection
      .insert(profitabilityEstimateEvents)
      .values({
        workspaceId: input.actor.workspaceId,
        companyId: input.companyId,
        estimateId: input.estimateId,
        versionId: input.versionId,
        versionNumber: input.versionNumber,
        opportunityId: input.opportunityId,
        clientRequestId: input.clientRequestId,
        action: input.action,
        actorInternalUserId: input.actor.internalUserId,
        actorWorkspaceMembershipId: input.actor.workspaceMembershipId,
        occurredAt: input.occurredAt,
        metadata:
          input.action === 'profitability_estimate_version.created'
            ? {
                estimateId: input.estimateId,
                versionNumber: input.versionNumber,
              }
            : {
                estimateId: input.estimateId,
                versionNumber: input.versionNumber,
                decisionCode: input.decisionCode,
              },
      });
  }

  /**
   * Commercial events are projected only inside the server-validated active
   * Company that owns them, for an actor holding the opt-in reader bundle who
   * also retains current read authority for the event's commercial target.
   * Authorization narrows the query itself, before the bounded page.
   */
  private async commercialEvents(
    actor: ActorContext,
  ): Promise<CommercialActivityEvent[]> {
    const company = actor.activeCompany;
    if (!actor.active || !company) return [];
    const actions = eligibleCommercialActions(company).filter(
      (action): action is CommercialIntakeActivityAction =>
        action !== 'sales_stage.configured',
    );
    if (actions.length === 0) return [];
    const read = (after: DatedEventCursor | undefined) =>
      this.databaseContext.connection
        .select({
          id: commercialIntakeEvents.id,
          cursorAt: sql<string>`${commercialIntakeEvents.occurredAt}::text`,
          action: commercialIntakeEvents.action,
          metadata: commercialIntakeEvents.metadata,
          companyId: commercialIntakeEvents.companyId,
          clientRequestId: commercialIntakeEvents.clientRequestId,
          opportunityId: commercialIntakeEvents.opportunityId,
          occurredAt: commercialIntakeEvents.occurredAt,
          internalUserId: internalUsers.id,
          displayName: internalUsers.displayName,
        })
        .from(commercialIntakeEvents)
        .innerJoin(
          workspaceMemberships,
          and(
            eq(
              workspaceMemberships.workspaceId,
              commercialIntakeEvents.workspaceId,
            ),
            eq(
              workspaceMemberships.id,
              commercialIntakeEvents.actorWorkspaceMembershipId,
            ),
          ),
        )
        .innerJoin(
          internalUsers,
          eq(internalUsers.id, workspaceMemberships.internalUserId),
        )
        .where(
          and(
            eq(commercialIntakeEvents.workspaceId, actor.workspaceId),
            eq(commercialIntakeEvents.companyId, company.id),
            or(
              ...actions.map((action) =>
                eq(sql<string>`${commercialIntakeEvents.action}::text`, action),
              ),
            ),
            olderThan(
              commercialIntakeEvents.occurredAt,
              commercialIntakeEvents.id,
              after,
            ),
          ),
        )
        .orderBy(
          desc(commercialIntakeEvents.occurredAt),
          desc(commercialIntakeEvents.id),
        )
        .limit(INITIAL_PAGE_SIZE);
    return projectedPage(read, (row) => {
      const recorded = readCommercialActivity(row);
      if (!recorded || recorded.action === 'sales_stage.configured')
        return undefined;
      const projected: CommercialActivityEvent = {
        ...recorded,
        id: row.id,
        occurredAt: row.occurredAt.toISOString(),
        actor: {
          internalUserId: row.internalUserId,
          displayName: row.displayName,
        },
        target: commercialActivityTarget(company, recorded.action, row),
      };
      return projected;
    });
  }

  /**
   * Recorded Offer events are projected under the same Company rule as the
   * other commercial events, for an actor who also holds the complete Offer
   * read prerequisite. The query resolves each event's current Offer, owning
   * Opportunity and Request and the exact Offer Version it concerns: its own
   * version, or version 1, recorded atomically with an Offer creation. An
   * event whose target cannot be resolved is omitted before the bounded page
   * and contributes no count, reference or ordering value.
   */
  private async offerActivityEvents(
    actor: ActorContext,
  ): Promise<OfferActivityEvent[]> {
    const company = actor.activeCompany;
    if (!actor.active || !company) return [];
    const actions = eligibleOfferActivityActions(company);
    if (actions.length === 0) return [];
    const read = (after: DatedEventCursor | undefined) =>
      this.databaseContext.connection
        .select({
          id: offerEvents.id,
          cursorAt: sql<string>`${offerEvents.occurredAt}::text`,
          action: offerEvents.action,
          metadata: offerEvents.metadata,
          companyId: offerEvents.companyId,
          offerId: offerEvents.offerId,
          offerVersionId: offerEvents.offerVersionId,
          occurredAt: offerEvents.occurredAt,
          illustrativeReference: offers.illustrativeReference,
          resolvedOfferVersionId: offerVersions.id,
          versionNumber: offerVersions.versionNumber,
          opportunityId: opportunities.id,
          clientRequestId: clientRequests.id,
          internalUserId: internalUsers.id,
          displayName: internalUsers.displayName,
        })
        .from(offerEvents)
        .innerJoin(
          workspaceMemberships,
          and(
            eq(workspaceMemberships.workspaceId, offerEvents.workspaceId),
            eq(workspaceMemberships.id, offerEvents.actorWorkspaceMembershipId),
          ),
        )
        .innerJoin(
          internalUsers,
          eq(internalUsers.id, workspaceMemberships.internalUserId),
        )
        .innerJoin(
          offers,
          and(
            eq(offers.workspaceId, offerEvents.workspaceId),
            eq(offers.companyId, offerEvents.companyId),
            eq(offers.id, offerEvents.offerId),
          ),
        )
        .innerJoin(
          opportunities,
          and(
            eq(opportunities.workspaceId, offers.workspaceId),
            eq(opportunities.companyId, offers.companyId),
            eq(opportunities.clientRequestId, offers.clientRequestId),
            eq(opportunities.id, offers.opportunityId),
          ),
        )
        .innerJoin(
          clientRequests,
          and(
            eq(clientRequests.workspaceId, opportunities.workspaceId),
            eq(clientRequests.companyId, opportunities.companyId),
            eq(clientRequests.id, opportunities.clientRequestId),
          ),
        )
        .leftJoin(
          offerVersions,
          and(
            eq(offerVersions.workspaceId, offerEvents.workspaceId),
            eq(offerVersions.companyId, offerEvents.companyId),
            eq(offerVersions.offerId, offerEvents.offerId),
            or(
              eq(offerVersions.id, offerEvents.offerVersionId),
              and(
                eq(offerEvents.action, 'offer.created'),
                isNull(offerEvents.offerVersionId),
                eq(offerVersions.versionNumber, 1),
              ),
            ),
          ),
        )
        .where(
          and(
            eq(offerEvents.workspaceId, actor.workspaceId),
            eq(offerEvents.companyId, company.id),
            inArray(offerEvents.action, [...actions]),
            isNotNull(offerVersions.id),
            olderThan(offerEvents.occurredAt, offerEvents.id, after),
          ),
        )
        .orderBy(desc(offerEvents.occurredAt), desc(offerEvents.id))
        .limit(INITIAL_PAGE_SIZE);
    return projectedPage(read, (row) => {
      const projected = readOfferActivity(row);
      if (!projected) return undefined;
      const event: OfferActivityEvent = {
        ...projected,
        id: row.id,
        occurredAt: row.occurredAt.toISOString(),
        actor: {
          internalUserId: row.internalUserId,
          displayName: row.displayName,
        },
      };
      return event;
    });
  }

  /**
   * Sales Stage configuration events follow the same projection rule: the
   * opt-in reader bundle and current Sales Stage list read, which is
   * Commercial Intake read, in the server-validated active Company that owns
   * them. Their target is the stage in the Company's stage settings.
   */
  private async salesStageEvents(
    actor: ActorContext,
  ): Promise<CommercialActivityEvent[]> {
    const company = actor.activeCompany;
    if (
      !actor.active ||
      !company ||
      !eligibleCommercialActions(company).includes('sales_stage.configured')
    )
      return [];
    const read = (after: DatedEventCursor | undefined) =>
      this.databaseContext.connection
        .select({
          id: salesStageEvents.id,
          cursorAt: sql<string>`${salesStageEvents.occurredAt}::text`,
          action: salesStageEvents.action,
          metadata: salesStageEvents.metadata,
          companyId: salesStageEvents.companyId,
          salesStageId: salesStageEvents.salesStageId,
          occurredAt: salesStageEvents.occurredAt,
          internalUserId: internalUsers.id,
          displayName: internalUsers.displayName,
        })
        .from(salesStageEvents)
        .innerJoin(
          workspaceMemberships,
          and(
            eq(workspaceMemberships.workspaceId, salesStageEvents.workspaceId),
            eq(
              workspaceMemberships.id,
              salesStageEvents.actorWorkspaceMembershipId,
            ),
          ),
        )
        .innerJoin(
          internalUsers,
          eq(internalUsers.id, workspaceMemberships.internalUserId),
        )
        .where(
          and(
            eq(salesStageEvents.workspaceId, actor.workspaceId),
            eq(salesStageEvents.companyId, company.id),
            olderThan(salesStageEvents.occurredAt, salesStageEvents.id, after),
          ),
        )
        .orderBy(desc(salesStageEvents.occurredAt), desc(salesStageEvents.id))
        .limit(INITIAL_PAGE_SIZE);
    return projectedPage(read, (row) => {
      const recorded = readCommercialActivity(row);
      if (recorded?.action !== 'sales_stage.configured') return undefined;
      const projected: CommercialActivityEvent = {
        ...recorded,
        id: row.id,
        occurredAt: row.occurredAt.toISOString(),
        actor: {
          internalUserId: row.internalUserId,
          displayName: row.displayName,
        },
        target: {
          type: 'sales_stage',
          salesStageId: row.salesStageId,
          companyId: row.companyId,
        },
      };
      return projected;
    });
  }

  /**
   * Recorded Contract events are projected under the same Company rule as the
   * other commercial events, for an actor who also holds the complete
   * Contract read prerequisite. The query resolves each event's current
   * Contract, owning Opportunity and Request and the exact Contract Version
   * it concerns: its own version, version 1 recorded atomically with a
   * Contract creation, or the executed version a Project link follows. A
   * Project link also resolves its Project inside the Project owner's Client
   * boundary. An event whose target cannot be resolved is omitted before the
   * bounded page and contributes no count, reference or ordering value.
   */
  private async contractActivityEvents(
    actor: ActorContext,
  ): Promise<ContractActivityEvent[]> {
    const company = actor.activeCompany;
    if (!actor.active || !company) return [];
    const actions = eligibleContractActivityActions(actor);
    if (actions.length === 0) return [];
    const isProjectLink = eq(contractEvents.action, 'contract_project.linked');
    const read = (after: DatedEventCursor | undefined) =>
      this.databaseContext.connection
        .select({
          id: contractEvents.id,
          cursorAt: sql<string>`${contractEvents.occurredAt}::text`,
          // Integrity resolves each event to exactly one version and Project;
          // an event resolving to several is ambiguous and fails closed. The
          // window counts before any page boundary.
          resolutions:
            sql<number>`count(*) over (partition by ${contractEvents.id})`.mapWith(
              Number,
            ),
          action: contractEvents.action,
          metadata: contractEvents.metadata,
          companyId: contractEvents.companyId,
          contractVersionId: contractEvents.contractVersionId,
          occurredAt: contractEvents.occurredAt,
          contractId: contracts.id,
          kind: contracts.kind,
          origin: contracts.origin,
          sourceOfferVersionId: contracts.sourceOfferVersionId,
          parentContractId: contracts.parentContractId,
          addendumOrdinal: contracts.addendumOrdinal,
          illustrativeReference: contracts.illustrativeReference,
          resolvedContractVersionId: contractVersions.id,
          versionNumber: contractVersions.versionNumber,
          executionState: contractVersions.executionState,
          pricingSnapshotId: contractVersions.pricingSnapshotId,
          opportunityId: opportunities.id,
          clientRequestId: clientRequests.id,
          projectId: projects.id,
          projectTitle: projects.title,
          linkCreated: contractProjectLinks.created,
          internalUserId: internalUsers.id,
          displayName: internalUsers.displayName,
        })
        .from(contractEvents)
        .innerJoin(
          workspaceMemberships,
          and(
            eq(workspaceMemberships.workspaceId, contractEvents.workspaceId),
            eq(
              workspaceMemberships.id,
              contractEvents.actorWorkspaceMembershipId,
            ),
          ),
        )
        .innerJoin(
          internalUsers,
          eq(internalUsers.id, workspaceMemberships.internalUserId),
        )
        .innerJoin(
          contracts,
          and(
            eq(contracts.workspaceId, contractEvents.workspaceId),
            eq(contracts.companyId, contractEvents.companyId),
            eq(contracts.id, contractEvents.contractId),
          ),
        )
        .innerJoin(
          opportunities,
          and(
            eq(opportunities.workspaceId, contracts.workspaceId),
            eq(opportunities.companyId, contracts.companyId),
            eq(opportunities.clientRequestId, contracts.clientRequestId),
            eq(opportunities.id, contracts.opportunityId),
          ),
        )
        .innerJoin(
          clientRequests,
          and(
            eq(clientRequests.workspaceId, opportunities.workspaceId),
            eq(clientRequests.companyId, opportunities.companyId),
            eq(clientRequests.id, opportunities.clientRequestId),
          ),
        )
        .leftJoin(
          contractVersions,
          and(
            eq(contractVersions.workspaceId, contractEvents.workspaceId),
            eq(contractVersions.companyId, contractEvents.companyId),
            eq(contractVersions.contractId, contractEvents.contractId),
            or(
              eq(contractVersions.id, contractEvents.contractVersionId),
              and(
                eq(contractEvents.action, 'contract.created'),
                isNull(contractEvents.contractVersionId),
                eq(contractVersions.versionNumber, 1),
              ),
              and(
                isProjectLink,
                isNull(contractEvents.contractVersionId),
                eq(contractVersions.executionState, 'EXECUTED'),
              ),
            ),
          ),
        )
        // The linked Project, readable only inside the Project owner's Client
        // boundary: its original Client active or superseded, with an active
        // relationship to the event's Company.
        .leftJoin(
          projects,
          and(
            isProjectLink,
            eq(projects.workspaceId, contractEvents.workspaceId),
            eq(projects.companyId, contractEvents.companyId),
            sql`${projects.id}::text = ${contractEvents.metadata}->>'projectId'`,
          ),
        )
        .leftJoin(
          clientAccounts,
          and(
            eq(clientAccounts.workspaceId, projects.workspaceId),
            eq(clientAccounts.id, projects.clientAccountId),
            inArray(clientAccounts.status, ['active', 'superseded']),
          ),
        )
        .leftJoin(
          clientCompanyRelationships,
          and(
            eq(clientCompanyRelationships.workspaceId, projects.workspaceId),
            eq(clientCompanyRelationships.companyId, projects.companyId),
            eq(
              clientCompanyRelationships.clientAccountId,
              projects.clientAccountId,
            ),
            eq(clientCompanyRelationships.status, 'active'),
          ),
        )
        // The recorded link itself: the event's metadata has no foreign key,
        // so only the link record proves the relationship and its creation.
        .leftJoin(
          contractProjectLinks,
          and(
            eq(contractProjectLinks.workspaceId, contractEvents.workspaceId),
            eq(contractProjectLinks.companyId, contractEvents.companyId),
            eq(contractProjectLinks.contractId, contractEvents.contractId),
            eq(contractProjectLinks.projectId, projects.id),
          ),
        )
        .where(
          and(
            eq(contractEvents.workspaceId, actor.workspaceId),
            eq(contractEvents.companyId, company.id),
            inArray(contractEvents.action, [...actions]),
            isNotNull(contractVersions.id),
            or(
              ne(contractEvents.action, 'contract_project.linked'),
              and(
                isNotNull(projects.id),
                isNotNull(clientAccounts.id),
                isNotNull(clientCompanyRelationships.id),
                isNotNull(contractProjectLinks.id),
              ),
            ),
            olderThan(contractEvents.occurredAt, contractEvents.id, after),
          ),
        )
        .orderBy(desc(contractEvents.occurredAt), desc(contractEvents.id))
        .limit(INITIAL_PAGE_SIZE);
    return projectedPage(read, (row) => {
      const projected =
        row.resolutions === 1 ? readContractActivity(row) : undefined;
      if (!projected) return undefined;
      const event: ContractActivityEvent = {
        ...projected,
        id: row.id,
        occurredAt: row.occurredAt.toISOString(),
        actor: {
          internalUserId: row.internalUserId,
          displayName: row.displayName,
        },
      };
      return event;
    });
  }

  private async projectEvents(
    actor: ActorContext,
  ): Promise<ProjectCreatedActivityEvent[]> {
    if (
      !actor.activeCompany?.projectPermissions?.includes('project.read') ||
      (!actor.workspacePermissions.includes('client.manage') &&
        !actor.activeCompany.clientPermissions.includes('client.read'))
    )
      return [];
    const rows = await this.databaseContext.connection
      .select({
        event: projectCreationEvents,
        actorName: internalUsers.displayName,
        projectTitle: projects.title,
      })
      .from(projectCreationEvents)
      .innerJoin(
        projects,
        and(
          eq(projects.workspaceId, projectCreationEvents.workspaceId),
          eq(projects.id, projectCreationEvents.projectId),
        ),
      )
      .innerJoin(
        internalUsers,
        eq(internalUsers.id, projectCreationEvents.actorInternalUserId),
      )
      .innerJoin(
        clientCompanyRelationships,
        and(
          eq(clientCompanyRelationships.workspaceId, projects.workspaceId),
          eq(
            clientCompanyRelationships.clientAccountId,
            projects.clientAccountId,
          ),
          eq(clientCompanyRelationships.companyId, projects.companyId),
          eq(clientCompanyRelationships.status, 'active'),
        ),
      )
      .where(
        and(
          eq(projectCreationEvents.workspaceId, actor.workspaceId),
          eq(projectCreationEvents.companyId, actor.activeCompany.id),
        ),
      )
      .orderBy(
        desc(projectCreationEvents.occurredAt),
        desc(projectCreationEvents.id),
      )
      .limit(INITIAL_PAGE_SIZE);
    return rows.map(({ event, actorName, projectTitle }) => ({
      id: event.id,
      action: 'project.created',
      occurredAt: event.occurredAt.toISOString(),
      actor: {
        internalUserId: event.actorInternalUserId,
        displayName: actorName,
      },
      target: {
        type: 'project',
        projectId: event.projectId,
        projectTitle,
        companyId: event.companyId,
      },
      metadata: {},
    }));
  }

  // The same boundary as `project.created`: current Project and Client read
  // plus the Project's original Clientâ€“Company relationship. Workspace
  // ownership or Client visibility alone discloses nothing.
  private async projectResponsibilityEvents(
    actor: ActorContext,
  ): Promise<ProjectResponsibleChangedActivityEvent[]> {
    if (
      !actor.activeCompany?.projectPermissions?.includes('project.read') ||
      (!actor.workspacePermissions.includes('client.manage') &&
        !actor.activeCompany.clientPermissions.includes('client.read'))
    )
      return [];
    const rows = await this.databaseContext.connection
      .select({
        event: projectResponsibilityEvents,
        actorName: internalUsers.displayName,
        projectTitle: projects.title,
      })
      .from(projectResponsibilityEvents)
      .innerJoin(
        projects,
        and(
          eq(projects.workspaceId, projectResponsibilityEvents.workspaceId),
          eq(projects.companyId, projectResponsibilityEvents.companyId),
          eq(projects.id, projectResponsibilityEvents.projectId),
        ),
      )
      .innerJoin(
        internalUsers,
        eq(internalUsers.id, projectResponsibilityEvents.actorInternalUserId),
      )
      .innerJoin(
        clientCompanyRelationships,
        and(
          eq(clientCompanyRelationships.workspaceId, projects.workspaceId),
          eq(
            clientCompanyRelationships.clientAccountId,
            projects.clientAccountId,
          ),
          eq(clientCompanyRelationships.companyId, projects.companyId),
          eq(clientCompanyRelationships.status, 'active'),
        ),
      )
      .where(
        and(
          eq(projectResponsibilityEvents.workspaceId, actor.workspaceId),
          eq(projectResponsibilityEvents.companyId, actor.activeCompany.id),
        ),
      )
      .orderBy(
        desc(projectResponsibilityEvents.occurredAt),
        desc(projectResponsibilityEvents.id),
      )
      .limit(INITIAL_PAGE_SIZE);
    return rows.map(({ event, actorName, projectTitle }) => ({
      id: event.id,
      action: 'project.responsible.changed',
      occurredAt: event.occurredAt.toISOString(),
      actor: {
        internalUserId: event.actorInternalUserId,
        displayName: actorName,
      },
      target: {
        type: 'project',
        projectId: event.projectId,
        projectTitle,
        companyId: event.companyId,
      },
      metadata: {
        revision: event.revision,
        before: recordedMember(
          event.beforeMembershipId,
          event.beforeDisplayLabel,
        ),
        after: recordedMember(event.afterMembershipId, event.afterDisplayLabel),
      },
    }));
  }

  // The `project.responsible.changed` boundary: the recording Company only,
  // current Project and Client read, and the original Clientâ€“Company
  // relationship. Metadata carries no reason, declaration, member or date.
  private async projectLifecycleEvents(
    actor: ActorContext,
  ): Promise<ProjectLifecycleChangedActivityEvent[]> {
    if (
      !actor.activeCompany?.projectPermissions?.includes('project.read') ||
      (!actor.workspacePermissions.includes('client.manage') &&
        !actor.activeCompany.clientPermissions.includes('client.read'))
    )
      return [];
    const rows = await this.databaseContext.connection
      .select({
        event: projectLifecycleTransitions,
        actorName: internalUsers.displayName,
        projectTitle: projects.title,
        startDeclared: projectStartDeclarations.id,
        startException: projectStartDeclarations.exceptionReason,
      })
      .from(projectLifecycleTransitions)
      .innerJoin(
        projects,
        and(
          eq(projects.workspaceId, projectLifecycleTransitions.workspaceId),
          eq(projects.companyId, projectLifecycleTransitions.companyId),
          eq(projects.id, projectLifecycleTransitions.projectId),
        ),
      )
      .innerJoin(
        internalUsers,
        eq(internalUsers.id, projectLifecycleTransitions.actorInternalUserId),
      )
      .innerJoin(
        clientCompanyRelationships,
        and(
          eq(clientCompanyRelationships.workspaceId, projects.workspaceId),
          eq(
            clientCompanyRelationships.clientAccountId,
            projects.clientAccountId,
          ),
          eq(clientCompanyRelationships.companyId, projects.companyId),
          eq(clientCompanyRelationships.status, 'active'),
        ),
      )
      .leftJoin(
        projectStartDeclarations,
        and(
          eq(
            projectStartDeclarations.workspaceId,
            projectLifecycleTransitions.workspaceId,
          ),
          eq(
            projectStartDeclarations.projectId,
            projectLifecycleTransitions.projectId,
          ),
        ),
      )
      .where(
        and(
          eq(projectLifecycleTransitions.workspaceId, actor.workspaceId),
          eq(projectLifecycleTransitions.companyId, actor.activeCompany.id),
        ),
      )
      .orderBy(
        desc(projectLifecycleTransitions.occurredAt),
        desc(projectLifecycleTransitions.id),
      )
      .limit(INITIAL_PAGE_SIZE);
    return rows.flatMap(
      ({ event, actorName, projectTitle, startDeclared, startException }) => {
        const metadata = lifecycleEventMetadata(
          event,
          startDeclared === null ? undefined : startException !== null,
        );
        if (!metadata) return [];
        const projected: ProjectLifecycleChangedActivityEvent = {
          id: event.id,
          action: 'project.lifecycle.changed',
          occurredAt: event.occurredAt.toISOString(),
          actor: {
            internalUserId: event.actorInternalUserId,
            displayName: actorName,
          },
          target: {
            type: 'project',
            projectId: event.projectId,
            projectTitle,
            companyId: event.companyId,
          },
          metadata,
        };
        return [projected];
      },
    );
  }

  /** Existing Activity endpoint authority plus independent copied-plan visibility. */
  private async projectStageEvents(
    actor: ActorContext,
  ): Promise<ProjectStageChangedActivityEvent[]> {
    const company = actor.activeCompany;
    if (
      !company?.projectPermissions?.includes('project.read') ||
      company.projectTemplatePermissionSetVersion !== 'v1' ||
      !company.projectTemplatePermissionAssignmentId ||
      !company.projectTemplatePermissions?.includes('project.template.read') ||
      !company.taskPermissions?.includes('task.read') ||
      (!actor.workspacePermissions.includes('client.manage') &&
        !company.clientPermissions.includes('client.read'))
    )
      return [];
    const rows = await this.databaseContext.connection
      .select({
        id: projectStageTransitions.id,
        projectId: projectStageTransitions.projectId,
        companyId: projectStageTransitions.companyId,
        stageRevision: projectStageTransitions.stageRevision,
        fromStageKey: projectStageTransitions.fromStageKey,
        toStageKey: projectStageTransitions.toStageKey,
        occurredAt: projectStageTransitions.occurredAt,
        actorInternalUserId: projectStageTransitions.actorInternalUserId,
        actorDisplayName: projectStageTransitions.actorDisplayName,
        projectTitle: projects.title,
      })
      .from(projectStageTransitions)
      .innerJoin(
        projects,
        and(
          eq(projects.workspaceId, projectStageTransitions.workspaceId),
          eq(projects.companyId, projectStageTransitions.companyId),
          eq(projects.id, projectStageTransitions.projectId),
        ),
      )
      .innerJoin(
        clientAccounts,
        and(
          eq(clientAccounts.workspaceId, projects.workspaceId),
          eq(clientAccounts.id, projects.clientAccountId),
          inArray(clientAccounts.status, ['active', 'superseded']),
        ),
      )
      .innerJoin(
        clientCompanyRelationships,
        and(
          eq(clientCompanyRelationships.workspaceId, projects.workspaceId),
          eq(clientCompanyRelationships.companyId, projects.companyId),
          eq(
            clientCompanyRelationships.clientAccountId,
            projects.clientAccountId,
          ),
          eq(clientCompanyRelationships.status, 'active'),
        ),
      )
      .where(
        and(
          eq(projectStageTransitions.workspaceId, actor.workspaceId),
          eq(projectStageTransitions.companyId, company.id),
        ),
      )
      .orderBy(
        desc(projectStageTransitions.occurredAt),
        desc(projectStageTransitions.id),
      )
      .limit(INITIAL_PAGE_SIZE);
    return rows.map((row) => ({
      id: row.id,
      action: 'project.stage.changed',
      occurredAt: row.occurredAt.toISOString(),
      actor: {
        internalUserId: row.actorInternalUserId,
        displayName: row.actorDisplayName,
      },
      target: {
        type: 'project',
        projectId: row.projectId,
        projectTitle: row.projectTitle,
        companyId: row.companyId,
      },
      metadata: {
        stageRevision: row.stageRevision,
        fromStageKey: row.fromStageKey,
        toStageKey: row.toStageKey,
      },
    }));
  }

  async recordClientUnion(input: {
    actor: ActorContext;
    reviewReference: string;
    canonicalClientId: string;
    companyId: string;
    companyIds: readonly string[];
    idempotencyKey: string;
    reason: string;
    intent: unknown;
    resultSnapshot: unknown;
  }) {
    const [operation] = await this.databaseContext.connection
      .insert(clientUnionOperations)
      .values({
        workspaceId: input.actor.workspaceId,
        actorWorkspaceMembershipId: input.actor.workspaceMembershipId,
        reviewReference: input.reviewReference,
        canonicalClientId: input.canonicalClientId,
        companyId: input.companyId,
        idempotencyKey: input.idempotencyKey,
        reason: input.reason,
        intent: input.intent,
        resultSnapshot: input.resultSnapshot,
      })
      .returning();
    if (!operation) throw new Error('Client union operation was not recorded.');
    await this.recordUnionProjections(
      input.actor.workspaceId,
      operation.id,
      input.companyIds,
      'client.union_confirmed',
    );
    return operation;
  }

  async recordClientUnionReversal(input: {
    actor: ActorContext;
    operationId: string;
    companyId: string;
    companyIds: readonly string[];
    idempotencyKey: string;
    reason: string;
  }): Promise<void> {
    await this.databaseContext.connection.insert(clientUnionReversals).values({
      workspaceId: input.actor.workspaceId,
      actorWorkspaceMembershipId: input.actor.workspaceMembershipId,
      operationId: input.operationId,
      companyId: input.companyId,
      idempotencyKey: input.idempotencyKey,
      reason: input.reason,
    });
    await this.recordUnionProjections(
      input.actor.workspaceId,
      input.operationId,
      input.companyIds,
      'client.union_reversed',
    );
  }

  async clientUnionEvents(
    actor: ActorContext,
    operationId?: string,
  ): Promise<ClientUnionActivityEvent[]> {
    if (!actor.activeCompany) return [];
    const rows = await this.databaseContext.connection
      .select()
      .from(clientUnionProjections)
      .where(
        and(
          eq(clientUnionProjections.workspaceId, actor.workspaceId),
          eq(clientUnionProjections.companyId, actor.activeCompany.id),
          operationId
            ? eq(clientUnionProjections.operationId, operationId)
            : undefined,
        ),
      )
      .orderBy(asc(clientUnionProjections.reference))
      .limit(INITIAL_PAGE_SIZE);
    return rows.map((row) => {
      if (
        row.action !== 'client.union_confirmed' &&
        row.action !== 'client.union_reversed'
      )
        throw new Error('Unknown Client union event.');
      return {
        action: row.action,
        projectionReference: row.reference,
        companyId: row.companyId,
        actor: { kind: 'authorized_resolver' },
        target: {
          type: 'client_union_operation',
          projectionReference: row.reference,
          companyId: row.companyId,
        },
      };
    });
  }

  private async recordUnionProjections(
    workspaceId: string,
    operationId: string,
    companyIds: readonly string[],
    action: ClientUnionActivityEvent['action'],
  ): Promise<void> {
    if (
      companyIds.length === 0 ||
      new Set(companyIds).size !== companyIds.length
    )
      throw new Error('A complete Company projection scope is required.');
    await this.databaseContext.connection.insert(clientUnionProjections).values(
      companyIds.map((companyId) => ({
        workspaceId,
        operationId,
        companyId,
        action,
      })),
    );
  }

  async recordDocumentRegistered(input: {
    actor: ActorContext;
    companyId: string;
    documentId: string;
  }): Promise<void> {
    await this.databaseContext.connection
      .insert(documentRegistrationEvents)
      .values({
        workspaceId: input.actor.workspaceId,
        companyId: input.companyId,
        documentId: input.documentId,
        actorMembershipId: input.actor.workspaceMembershipId,
      });
  }
  async documentEvents(
    actor: ActorContext,
  ): Promise<DocumentRegisteredActivityEvent[]> {
    if (
      !actor.active ||
      !actor.activeCompany?.documentPermissions?.includes('document.read') ||
      (!actor.workspacePermissions.includes('client.manage') &&
        !actor.activeCompany.clientPermissions.includes('client.read'))
    )
      return [];
    const rows = await this.databaseContext.connection
      .select({
        id: documentRegistrationEvents.id,
        documentId: documentRegistrationEvents.documentId,
        documentTitle: workingDocuments.title,
        companyId: documentRegistrationEvents.companyId,
        occurredAt: documentRegistrationEvents.occurredAt,
        internalUserId: internalUsers.id,
        displayName: internalUsers.displayName,
      })
      .from(documentRegistrationEvents)
      .innerJoin(
        workingDocuments,
        and(
          eq(
            workingDocuments.workspaceId,
            documentRegistrationEvents.workspaceId,
          ),
          eq(workingDocuments.companyId, documentRegistrationEvents.companyId),
          eq(workingDocuments.id, documentRegistrationEvents.documentId),
        ),
      )
      .innerJoin(
        clientAccounts,
        and(
          eq(clientAccounts.workspaceId, workingDocuments.workspaceId),
          eq(clientAccounts.id, workingDocuments.clientId),
          sql`${clientAccounts.status} IN ('active','superseded')`,
        ),
      )
      .innerJoin(
        clientCompanyRelationships,
        and(
          eq(
            clientCompanyRelationships.workspaceId,
            workingDocuments.workspaceId,
          ),
          eq(clientCompanyRelationships.companyId, workingDocuments.companyId),
          eq(
            clientCompanyRelationships.clientAccountId,
            workingDocuments.clientId,
          ),
          eq(clientCompanyRelationships.status, 'active'),
        ),
      )
      .innerJoin(
        workspaceMemberships,
        and(
          eq(
            workspaceMemberships.workspaceId,
            documentRegistrationEvents.workspaceId,
          ),
          eq(
            workspaceMemberships.id,
            documentRegistrationEvents.actorMembershipId,
          ),
        ),
      )
      .innerJoin(
        internalUsers,
        eq(internalUsers.id, workspaceMemberships.internalUserId),
      )
      .where(
        and(
          eq(documentRegistrationEvents.workspaceId, actor.workspaceId),
          eq(documentRegistrationEvents.companyId, actor.activeCompany.id),
        ),
      )
      .orderBy(
        desc(documentRegistrationEvents.occurredAt),
        desc(documentRegistrationEvents.id),
      )
      .limit(INITIAL_PAGE_SIZE);
    return rows.map((row) => ({
      id: row.id,
      action: 'document.registered',
      occurredAt: row.occurredAt.toISOString(),
      actor: {
        internalUserId: row.internalUserId,
        displayName: row.displayName,
      },
      target: {
        type: 'document',
        documentId: row.documentId,
        documentTitle: row.documentTitle,
        companyId: row.companyId,
      },
      metadata: {},
    }));
  }
  private async documentCorrectionEvents(
    actor: ActorContext,
  ): Promise<DocumentCorrectedActivityEvent[]> {
    if (
      !actor.active ||
      !actor.activeCompany?.documentPermissions?.includes('document.read') ||
      (!actor.workspacePermissions.includes('client.manage') &&
        !actor.activeCompany.clientPermissions.includes('client.read'))
    )
      return [];
    const rows = await this.databaseContext.connection
      .select({
        id: documentCorrectionCommands.id,
        documentId: documentCorrectionCommands.documentId,
        companyId: documentCorrectionCommands.companyId,
        occurredAt: documentCorrectionCommands.occurredAt,
        internalUserId: internalUsers.id,
        displayName: internalUsers.displayName,
      })
      .from(documentCorrectionCommands)
      .innerJoin(
        workingDocuments,
        and(
          eq(
            workingDocuments.workspaceId,
            documentCorrectionCommands.workspaceId,
          ),
          eq(workingDocuments.companyId, documentCorrectionCommands.companyId),
          eq(workingDocuments.id, documentCorrectionCommands.documentId),
        ),
      )
      .innerJoin(
        clientAccounts,
        and(
          eq(clientAccounts.workspaceId, workingDocuments.workspaceId),
          eq(clientAccounts.id, workingDocuments.clientId),
          sql`${clientAccounts.status} IN ('active','superseded')`,
        ),
      )
      .innerJoin(
        clientCompanyRelationships,
        and(
          eq(
            clientCompanyRelationships.workspaceId,
            workingDocuments.workspaceId,
          ),
          eq(clientCompanyRelationships.companyId, workingDocuments.companyId),
          eq(
            clientCompanyRelationships.clientAccountId,
            workingDocuments.clientId,
          ),
          eq(clientCompanyRelationships.status, 'active'),
        ),
      )
      .innerJoin(
        workspaceMemberships,
        and(
          eq(
            workspaceMemberships.workspaceId,
            documentCorrectionCommands.workspaceId,
          ),
          eq(
            workspaceMemberships.id,
            documentCorrectionCommands.actorMembershipId,
          ),
        ),
      )
      .innerJoin(
        internalUsers,
        eq(internalUsers.id, workspaceMemberships.internalUserId),
      )
      .where(
        and(
          eq(documentCorrectionCommands.workspaceId, actor.workspaceId),
          eq(documentCorrectionCommands.companyId, actor.activeCompany.id),
          eq(documentCorrectionCommands.outcome, 'corrected'),
        ),
      )
      .orderBy(
        desc(documentCorrectionCommands.occurredAt),
        desc(documentCorrectionCommands.id),
      )
      .limit(INITIAL_PAGE_SIZE);
    return rows.map((row) => ({
      id: row.id,
      action: 'document.corrected',
      occurredAt: row.occurredAt.toISOString(),
      actor: {
        internalUserId: row.internalUserId,
        displayName: row.displayName,
      },
      target: {
        type: 'document',
        documentId: row.documentId,
        companyId: row.companyId,
      },
      metadata: {},
    }));
  }
  /**
   * Version commands are projected like `document.corrected`: only in the
   * recording Company, to actors with current Document metadata read and the
   * original Client/Company visibility, inside the bounded dated page.
   */
  private async documentVersionEvents(
    actor: ActorContext,
  ): Promise<DocumentVersionActivityEvent[]> {
    if (
      !actor.active ||
      !actor.activeCompany?.documentPermissions?.includes('document.read') ||
      (!actor.workspacePermissions.includes('client.manage') &&
        !actor.activeCompany.clientPermissions.includes('client.read'))
    )
      return [];
    const rows = await this.databaseContext.connection
      .select({
        id: documentVersionCommands.id,
        action: documentVersionCommands.action,
        versionNumber: documentVersionCommands.versionNumber,
        relatedVersionNumber: documentVersionCommands.relatedVersionNumber,
        representationForm: documentVersionCommands.representationForm,
        appendedAfterDesignation:
          documentVersionCommands.appendedAfterDesignation,
        documentId: documentVersionCommands.documentId,
        documentTitle: workingDocuments.title,
        companyId: documentVersionCommands.companyId,
        occurredAt: documentVersionCommands.occurredAt,
        internalUserId: internalUsers.id,
        displayName: internalUsers.displayName,
      })
      .from(documentVersionCommands)
      .innerJoin(
        workingDocuments,
        and(
          eq(workingDocuments.workspaceId, documentVersionCommands.workspaceId),
          eq(workingDocuments.companyId, documentVersionCommands.companyId),
          eq(workingDocuments.id, documentVersionCommands.documentId),
        ),
      )
      .innerJoin(
        clientAccounts,
        and(
          eq(clientAccounts.workspaceId, workingDocuments.workspaceId),
          eq(clientAccounts.id, workingDocuments.clientId),
          sql`${clientAccounts.status} IN ('active','superseded')`,
        ),
      )
      .innerJoin(
        clientCompanyRelationships,
        and(
          eq(
            clientCompanyRelationships.workspaceId,
            workingDocuments.workspaceId,
          ),
          eq(clientCompanyRelationships.companyId, workingDocuments.companyId),
          eq(
            clientCompanyRelationships.clientAccountId,
            workingDocuments.clientId,
          ),
          eq(clientCompanyRelationships.status, 'active'),
        ),
      )
      .innerJoin(
        workspaceMemberships,
        and(
          eq(
            workspaceMemberships.workspaceId,
            documentVersionCommands.workspaceId,
          ),
          eq(
            workspaceMemberships.id,
            documentVersionCommands.actorMembershipId,
          ),
        ),
      )
      .innerJoin(
        internalUsers,
        eq(internalUsers.id, workspaceMemberships.internalUserId),
      )
      .where(
        and(
          eq(documentVersionCommands.workspaceId, actor.workspaceId),
          eq(documentVersionCommands.companyId, actor.activeCompany.id),
        ),
      )
      .orderBy(
        desc(documentVersionCommands.occurredAt),
        desc(documentVersionCommands.id),
      )
      .limit(INITIAL_PAGE_SIZE);
    return rows.map((row): DocumentVersionActivityEvent => {
      const recorded = {
        id: row.id,
        occurredAt: row.occurredAt.toISOString(),
        actor: {
          internalUserId: row.internalUserId,
          displayName: row.displayName,
        },
        target: {
          type: 'document' as const,
          documentId: row.documentId,
          documentTitle: row.documentTitle,
          companyId: row.companyId,
        },
      };
      switch (row.action) {
        case 'drafted':
          if (row.relatedVersionNumber === null)
            throw new Error('A drafted Version event has no source Version.');
          return {
            ...recorded,
            action: 'document.version.drafted',
            metadata: {
              versionNumber: row.versionNumber,
              sourceVersionNumber: row.relatedVersionNumber,
            },
          };
        case 'designated_official':
          return {
            ...recorded,
            action: 'document.version.designated_official',
            metadata: {
              versionNumber: row.versionNumber,
              supersededVersionNumber: row.relatedVersionNumber,
            },
          };
        case 'representation_added':
          if (
            row.representationForm === null ||
            row.appendedAfterDesignation === null
          )
            throw new Error('An added-reference event is incomplete.');
          return {
            ...recorded,
            action: 'document.representation.added',
            metadata: {
              versionNumber: row.versionNumber,
              form: row.representationForm,
              appendedAfterDesignation: row.appendedAfterDesignation,
            },
          };
        case 'representation_removed':
          if (
            row.representationForm === null ||
            row.appendedAfterDesignation !== false
          )
            throw new Error('A removed-reference event is incomplete.');
          return {
            ...recorded,
            action: 'document.representation.removed',
            metadata: {
              versionNumber: row.versionNumber,
              form: row.representationForm,
              appendedAfterDesignation: false,
            },
          };
        default:
          return assertNever(row.action);
      }
    });
  }
  private async documentProjectEvents(
    actor: ActorContext,
  ): Promise<DocumentProjectActivityEvent[]> {
    if (
      !actor.active ||
      !actor.activeCompany?.projectPermissions?.includes('project.read') ||
      !actor.activeCompany?.documentPermissions?.includes('document.read') ||
      (!actor.workspacePermissions.includes('client.manage') &&
        !actor.activeCompany.clientPermissions.includes('client.read'))
    )
      return [];
    const rows = await this.databaseContext.connection
      .select({
        id: documentProjectEvents.id,
        documentId: documentProjectEvents.documentId,
        documentTitle: workingDocuments.title,
        projectId: documentProjectEvents.projectId,
        projectTitle: projects.title,
        action: documentProjectEvents.action,
        companyId: documentProjectEvents.companyId,
        occurredAt: documentProjectEvents.occurredAt,
        internalUserId: internalUsers.id,
        displayName: internalUsers.displayName,
      })
      .from(documentProjectEvents)
      .innerJoin(
        workingDocuments,
        and(
          eq(workingDocuments.workspaceId, documentProjectEvents.workspaceId),
          eq(workingDocuments.companyId, documentProjectEvents.companyId),
          eq(workingDocuments.id, documentProjectEvents.documentId),
        ),
      )
      .innerJoin(
        projects,
        and(
          eq(projects.workspaceId, documentProjectEvents.workspaceId),
          eq(projects.companyId, documentProjectEvents.companyId),
          eq(projects.id, documentProjectEvents.projectId),
          eq(projects.clientAccountId, workingDocuments.clientId),
        ),
      )
      .innerJoin(
        clientAccounts,
        and(
          eq(clientAccounts.workspaceId, workingDocuments.workspaceId),
          eq(clientAccounts.id, workingDocuments.clientId),
          sql`${clientAccounts.status} IN ('active','superseded')`,
        ),
      )
      .innerJoin(
        clientCompanyRelationships,
        and(
          eq(
            clientCompanyRelationships.workspaceId,
            workingDocuments.workspaceId,
          ),
          eq(clientCompanyRelationships.companyId, workingDocuments.companyId),
          eq(
            clientCompanyRelationships.clientAccountId,
            workingDocuments.clientId,
          ),
          eq(clientCompanyRelationships.status, 'active'),
        ),
      )
      .innerJoin(
        workspaceMemberships,
        and(
          eq(
            workspaceMemberships.workspaceId,
            documentProjectEvents.workspaceId,
          ),
          eq(workspaceMemberships.id, documentProjectEvents.actorMembershipId),
        ),
      )
      .innerJoin(
        internalUsers,
        eq(internalUsers.id, workspaceMemberships.internalUserId),
      )
      .where(
        and(
          eq(documentProjectEvents.workspaceId, actor.workspaceId),
          eq(documentProjectEvents.companyId, actor.activeCompany.id),
        ),
      )
      .orderBy(
        desc(documentProjectEvents.occurredAt),
        desc(documentProjectEvents.id),
      )
      .limit(INITIAL_PAGE_SIZE);
    return rows.map((row) => ({
      id: row.id,
      action:
        row.action === 'link'
          ? 'document.project.linked'
          : 'document.project.unlinked',
      occurredAt: row.occurredAt.toISOString(),
      actor: {
        internalUserId: row.internalUserId,
        displayName: row.displayName,
      },
      target: {
        type: 'document_project',
        projectId: row.projectId,
        projectTitle: row.projectTitle,
        documentId: row.documentId,
        documentTitle: row.documentTitle,
        companyId: row.companyId,
      },
      metadata: {},
    }));
  }
  /**
   * One Client's `client.corrected` page in the server-validated active
   * Company. The owning Client module has already proved dossier readability;
   * this read reapplies that boundary and the exact correction-Company scope.
   */
  async readClientCorrectionHistory(input: {
    actor: ActorContext;
    clientAccountId: string;
    cursor: string | undefined;
  }): Promise<ClientCorrectionHistoryRead> {
    const { actor, clientAccountId, cursor } = input;
    const company = actor.activeCompany;
    if (!company?.clientPermissions.includes('client.read'))
      return { kind: 'page', page: { corrections: [], nextCursor: null } };
    const visibleCorrection = and(
      eq(activityLogEvents.workspaceId, actor.workspaceId),
      eq(activityLogEvents.action, CLIENT_CORRECTED_ACTION),
      eq(activityLogEvents.targetType, 'client_account'),
      eq(activityLogEvents.targetClientAccountId, clientAccountId),
      eq(activityLogEvents.targetCompanyId, company.id),
      exists(
        this.databaseContext.connection
          .select({ id: clientCompanyRelationships.id })
          .from(clientCompanyRelationships)
          .innerJoin(
            clientAccounts,
            and(
              eq(
                clientAccounts.workspaceId,
                clientCompanyRelationships.workspaceId,
              ),
              eq(clientAccounts.id, clientCompanyRelationships.clientAccountId),
            ),
          )
          .where(
            and(
              eq(
                clientCompanyRelationships.workspaceId,
                activityLogEvents.workspaceId,
              ),
              eq(
                clientCompanyRelationships.clientAccountId,
                activityLogEvents.targetClientAccountId,
              ),
              eq(clientCompanyRelationships.companyId, company.id),
              eq(clientCompanyRelationships.status, 'active'),
              eq(clientAccounts.status, 'active'),
            ),
          ),
      ),
    );
    let cursorPosition: { id: string; occurredAt: string } | undefined;
    if (cursor !== undefined) {
      // Text keeps PostgreSQL's full timestamp precision for the keyset.
      [cursorPosition] = await this.databaseContext.connection
        .select({
          id: activityLogEvents.id,
          occurredAt: sql<string>`${activityLogEvents.occurredAt}::text`,
        })
        .from(activityLogEvents)
        .where(and(visibleCorrection, eq(activityLogEvents.id, cursor)))
        .limit(1);
      if (!cursorPosition) return { kind: 'invalid-cursor' };
    }
    const rows = await this.databaseContext.connection
      .select({
        id: activityLogEvents.id,
        occurredAt: activityLogEvents.occurredAt,
        metadata: activityLogEvents.metadata,
        actorDisplayName: internalUsers.displayName,
      })
      .from(activityLogEvents)
      .innerJoin(
        workspaceMemberships,
        and(
          eq(workspaceMemberships.workspaceId, activityLogEvents.workspaceId),
          eq(
            workspaceMemberships.id,
            activityLogEvents.actorWorkspaceMembershipId,
          ),
          eq(
            workspaceMemberships.internalUserId,
            activityLogEvents.actorInternalUserId,
          ),
        ),
      )
      .innerJoin(
        internalUsers,
        eq(internalUsers.id, workspaceMemberships.internalUserId),
      )
      .where(
        and(
          visibleCorrection,
          cursorPosition
            ? sql`(${activityLogEvents.occurredAt}, ${activityLogEvents.id}) < (${cursorPosition.occurredAt}::timestamptz, ${cursorPosition.id}::uuid)`
            : undefined,
        ),
      )
      .orderBy(desc(activityLogEvents.occurredAt), desc(activityLogEvents.id))
      .limit(CLIENT_CORRECTION_HISTORY_PAGE_SIZE + 1);
    const corrections = rows
      .slice(0, CLIENT_CORRECTION_HISTORY_PAGE_SIZE)
      .map((row) => ({
        id: row.id,
        occurredAt: row.occurredAt.toISOString(),
        actor: { displayName: row.actorDisplayName },
        changes: readClientCorrectionChanges(row.metadata),
      }));
    return {
      kind: 'page',
      page: {
        corrections,
        nextCursor:
          rows.length > CLIENT_CORRECTION_HISTORY_PAGE_SIZE
            ? (corrections.at(-1)?.id ?? null)
            : null,
      },
    };
  }

  async record(event: CanonicalActivityEvent): Promise<void> {
    if (
      event.target.type === 'internal_user' &&
      event.actor.internalUserId !== event.target.internalUserId
    ) {
      throw new Error(
        'An Internal User provisioning event must target its actor.',
      );
    }

    const target = persistenceFor(event);
    await this.databaseContext.connection
      .insert(activityLogEvents)
      .values({
        workspaceId: event.actor.workspaceId,
        actorInternalUserId: event.actor.internalUserId,
        actorWorkspaceMembershipId: event.actor.workspaceMembershipId,
        action: event.action,
        ...target,
        metadata: event.metadata,
      })
      .onConflictDoNothing({ target: activityLogEvents.idempotencyKey });
  }

  async listForActor(actor: ActorContext): Promise<ActivityLogPage> {
    const eventActor = alias(internalUsers, 'activity_log_actor');
    const eventTarget = alias(internalUsers, 'activity_log_target');
    const eventTargetCompany = alias(companies, 'activity_log_target_company');
    const eventTargetClient = alias(
      clientAccounts,
      'activity_log_target_client',
    );
    const actorMembership = alias(
      workspaceMemberships,
      'activity_log_actor_membership',
    );
    const targetMembership = alias(
      workspaceMemberships,
      'activity_log_target_membership',
    );
    const canManageClientsAcrossWorkspace =
      actor.workspacePermissions.includes('client.manage');
    const canReadClientsForCompany =
      actor.activeCompany?.clientPermissions.includes('client.read') ?? false;
    const canReadClients =
      canManageClientsAcrossWorkspace || canReadClientsForCompany;
    const visibleClientForCompany = actor.activeCompany
      ? exists(
          this.databaseContext.connection
            .select({ id: clientCompanyRelationships.id })
            .from(clientCompanyRelationships)
            .where(
              and(
                eq(
                  clientCompanyRelationships.workspaceId,
                  activityLogEvents.workspaceId,
                ),
                eq(
                  clientCompanyRelationships.clientAccountId,
                  activityLogEvents.targetClientAccountId,
                ),
                eq(
                  clientCompanyRelationships.companyId,
                  actor.activeCompany.id,
                ),
                eq(clientCompanyRelationships.status, 'active'),
              ),
            ),
        )
      : sql<boolean>`false`;
    const visibleClientEventsForCompanyManager =
      canReadClients && actor.activeCompany
        ? canManageClientsAcrossWorkspace
          ? or(
              and(
                eq(activityLogEvents.targetType, 'client_account'),
                eq(activityLogEvents.action, 'client.created'),
              ),
              canReadClientsForCompany
                ? and(
                    eq(activityLogEvents.targetType, 'client_account'),
                    visibleClientForCompany,
                  )
                : sql<boolean>`false`,
              and(
                eq(activityLogEvents.targetType, 'client_company_relationship'),
                eq(activityLogEvents.targetCompanyId, actor.activeCompany.id),
              ),
            )
          : and(
              or(
                eq(activityLogEvents.targetType, 'client_account'),
                and(
                  eq(
                    activityLogEvents.targetType,
                    'client_company_relationship',
                  ),
                  eq(activityLogEvents.targetCompanyId, actor.activeCompany.id),
                ),
              ),
              visibleClientForCompany,
            )
        : sql<boolean>`false`;
    const canAdministerWorkspaceAccess = actor.workspacePermissions.includes(
      'company.assignment.manage',
    );
    const isWorkspaceMembershipTarget = sql<boolean>`
      ${activityLogEvents.targetType}::text = 'workspace_membership'
    `;
    const visibleEvents = actor.workspacePermissions.includes('company.manage')
      ? and(
          eq(activityLogEvents.workspaceId, actor.workspaceId),
          or(
            and(
              notInArray(activityLogEvents.targetType, [
                'client_account',
                'client_company_relationship',
              ]),
              sql<boolean>`${activityLogEvents.targetType}::text <> 'workspace_membership'`,
            ),
            canAdministerWorkspaceAccess
              ? isWorkspaceMembershipTarget
              : sql<boolean>`false`,
            visibleClientEventsForCompanyManager,
          ),
        )
      : and(
          eq(activityLogEvents.workspaceId, actor.workspaceId),
          or(
            eq(activityLogEvents.targetType, 'internal_user'),
            canAdministerWorkspaceAccess
              ? isWorkspaceMembershipTarget
              : sql<boolean>`false`,
            canReadClients && actor.activeCompany
              ? and(
                  or(
                    and(
                      eq(activityLogEvents.targetType, 'client_account'),
                      or(
                        canManageClientsAcrossWorkspace
                          ? eq(activityLogEvents.action, 'client.created')
                          : sql<boolean>`false`,
                        canReadClientsForCompany
                          ? sql<boolean>`true`
                          : sql<boolean>`false`,
                      ),
                    ),
                    and(
                      eq(
                        activityLogEvents.targetType,
                        'client_company_relationship',
                      ),
                      eq(
                        activityLogEvents.targetCompanyId,
                        actor.activeCompany.id,
                      ),
                    ),
                  ),
                  visibleClientForCompany,
                )
              : sql<boolean>`false`,
          ),
        );
    // A shared Client does not broaden its change history: whatever grants
    // admit the Client, a dossier correction or a legal-entity registration or
    // correction appears only in the Company that made it.
    const companyScopedClientActions = [...COMPANY_SCOPED_CLIENT_ACTIONS];
    const correctionInActiveCompany = actor.activeCompany
      ? or(
          notInArray(activityLogEvents.action, companyScopedClientActions),
          and(
            eq(activityLogEvents.workspaceId, actor.workspaceId),
            eq(activityLogEvents.targetCompanyId, actor.activeCompany.id),
          ),
        )
      : notInArray(activityLogEvents.action, companyScopedClientActions);
    const rows = await this.databaseContext.connection
      .select({
        id: activityLogEvents.id,
        action: activityLogEvents.action,
        occurredAt: activityLogEvents.occurredAt,
        actorInternalUserId: eventActor.id,
        actorDisplayName: eventActor.displayName,
        targetType: activityLogEvents.targetType,
        targetWorkspaceInvitationId:
          activityLogEvents.targetWorkspaceInvitationId,
        targetCompanyRoleAssignmentId:
          activityLogEvents.targetCompanyRoleAssignmentId,
        targetWorkspaceMembershipId:
          activityLogEvents.targetWorkspaceMembershipId,
        targetInternalUserId: eventTarget.id,
        targetInternalUserDisplayName: eventTarget.displayName,
        targetCompanyId: eventTargetCompany.id,
        targetCompanyDisplayName: eventTargetCompany.displayName,
        targetClientAccountId: eventTargetClient.id,
        targetClientDisplayName: eventTargetClient.displayName,
        targetClientCompanyRelationshipId:
          activityLogEvents.targetClientCompanyRelationshipId,
        metadata: activityLogEvents.metadata,
      })
      .from(activityLogEvents)
      .innerJoin(
        actorMembership,
        and(
          eq(activityLogEvents.workspaceId, actorMembership.workspaceId),
          eq(activityLogEvents.actorWorkspaceMembershipId, actorMembership.id),
          eq(
            activityLogEvents.actorInternalUserId,
            actorMembership.internalUserId,
          ),
        ),
      )
      .innerJoin(eventActor, eq(actorMembership.internalUserId, eventActor.id))
      .leftJoin(
        targetMembership,
        and(
          eq(activityLogEvents.workspaceId, targetMembership.workspaceId),
          eq(
            activityLogEvents.targetWorkspaceMembershipId,
            targetMembership.id,
          ),
          eq(
            activityLogEvents.targetInternalUserId,
            targetMembership.internalUserId,
          ),
        ),
      )
      .leftJoin(
        eventTarget,
        eq(targetMembership.internalUserId, eventTarget.id),
      )
      .leftJoin(
        eventTargetCompany,
        and(
          eq(activityLogEvents.workspaceId, eventTargetCompany.workspaceId),
          eq(activityLogEvents.targetCompanyId, eventTargetCompany.id),
        ),
      )
      .leftJoin(
        eventTargetClient,
        and(
          eq(activityLogEvents.workspaceId, eventTargetClient.workspaceId),
          eq(activityLogEvents.targetClientAccountId, eventTargetClient.id),
        ),
      )
      .where(
        and(
          or(
            and(
              visibleEvents,
              sql`${activityLogEvents.targetType}::text <> 'workspace_invitation'`,
            ),
            actor.workspacePermissions.includes('member.invite')
              ? and(
                  eq(activityLogEvents.workspaceId, actor.workspaceId),
                  eq(activityLogEvents.targetType, 'workspace_invitation'),
                )
              : sql<boolean>`false`,
          ),
          correctionInActiveCompany,
        ),
      )
      .orderBy(desc(activityLogEvents.occurredAt), desc(activityLogEvents.id))
      .limit(INITIAL_PAGE_SIZE);

    const datedEvents = [
      ...rows.map((event) => ({
        id: event.id,
        action: event.action,
        occurredAt: event.occurredAt.toISOString(),
        actor: {
          internalUserId: event.actorInternalUserId,
          displayName: event.actorDisplayName,
        },
        target: canonicalTarget(event),
        metadata: event.metadata,
      })),
      ...(await this.readTaskHistory(actor)),
      ...(await this.projectEvents(actor)),
      ...(await this.projectResponsibilityEvents(actor)),
      ...(await this.projectLifecycleEvents(actor)),
      ...(await this.projectStageEvents(actor)),
      ...(await this.projectTemplateVersionEvents(actor)),
      ...(await this.documentEvents(actor)),
      ...(await this.documentCorrectionEvents(actor)),
      ...(await this.documentVersionEvents(actor)),
      ...(await this.documentProjectEvents(actor)),
      ...(await this.commercialEvents(actor)),
      ...(await this.offerActivityEvents(actor)),
      ...(await this.salesStageEvents(actor)),
      ...(await this.contractActivityEvents(actor)),
    ];
    datedEvents.sort(
      (left, right) =>
        right.occurredAt.localeCompare(left.occurredAt) ||
        right.id.localeCompare(left.id),
    );
    return {
      events: [
        ...datedEvents.slice(0, INITIAL_PAGE_SIZE),
        // Redacted union projections have no public time or cross-Company
        // ordering key. Preserve their independently generated Company order.
        ...(await this.clientUnionEvents(actor)),
      ],
    };
  }
}

function persistenceFor(event: CanonicalActivityEvent) {
  switch (event.action) {
    case 'workspace_invitation.issued':
    case 'workspace_invitation.revoked':
    case 'workspace_invitation.accepted':
      return {
        targetType: event.target.type,
        targetWorkspaceInvitationId: event.target.invitationId,
        idempotencyKey: `${event.action}:${event.target.invitationId}`,
      };
    case 'internal_user.provisioned':
      return {
        targetType: event.target.type,
        targetInternalUserId: event.target.internalUserId,
        targetWorkspaceMembershipId: event.actor.workspaceMembershipId,
        targetCompanyId: null,
        targetCompanyRoleAssignmentId: null,
        targetClientAccountId: null,
        targetClientCompanyRelationshipId: null,
        idempotencyKey: `${event.action}:${event.target.internalUserId}`,
      };
    case 'workspace_membership.suspended':
    case 'workspace_sessions.revoked':
    case 'workspace_sessions.revocation_retry_required':
      return {
        targetType: event.target.type,
        targetInternalUserId: event.target.internalUserId,
        targetWorkspaceMembershipId: event.target.workspaceMembershipId,
        targetCompanyId: null,
        targetCompanyRoleAssignmentId: null,
        targetClientAccountId: null,
        targetClientCompanyRelationshipId: null,
        idempotencyKey: `${event.action}:${event.target.workspaceMembershipId}:${event.transitionId}`,
      };
    case 'company.registered':
      return {
        targetType: event.target.type,
        targetInternalUserId: null,
        targetWorkspaceMembershipId: null,
        targetCompanyId: event.target.companyId,
        targetCompanyRoleAssignmentId: null,
        targetClientAccountId: null,
        targetClientCompanyRelationshipId: null,
        idempotencyKey: `${event.action}:${event.target.companyId}`,
      };
    case 'company_task_manager_assignment.granted':
    case 'company_task_manager_assignment.revoked':
    case 'company_document_project_organizer_assignment.granted':
    case 'company_document_project_organizer_assignment.revoked':
    case 'company_document_registrar_assignment.granted':
    case 'company_document_registrar_assignment.revoked':
    case 'company_document_approver_assignment.granted':
    case 'company_document_approver_assignment.revoked':
    case 'company_document_content_reader_assignment.granted':
    case 'company_document_content_reader_assignment.revoked':
    case 'company_document_content_uploader_assignment.granted':
    case 'company_document_content_uploader_assignment.revoked':
    case 'company_project_assignment.granted':
    case 'company_project_assignment.revoked':
    case 'company_context_assignment.granted':
    case 'company_context_assignment.revoked':
    case 'company_director_client_assignment.granted':
    case 'company_director_client_assignment.revoked':
    case 'company_commercial_intake_assignment.granted':
    case 'company_commercial_intake_assignment.revoked':
    case 'company_service_catalogue_assignment.granted':
    case 'company_service_catalogue_assignment.revoked':
    case 'company_pricing_configuration_assignment.granted':
    case 'company_pricing_configuration_assignment.revoked':
    case 'company_pricing_user_assignment.granted':
    case 'company_pricing_user_assignment.revoked':
    case 'company_offer_preparer_assignment.granted':
    case 'company_contract_approver_assignment.granted':
    case 'company_contract_preparer_assignment.granted':
    case 'company_offer_approver_assignment.granted':
    case 'company_offer_preparer_assignment.revoked':
    case 'company_contract_approver_assignment.revoked':
    case 'company_contract_preparer_assignment.revoked':
    case 'company_offer_approver_assignment.revoked':
    case 'company_pricing_adjustment_assignment.granted':
    case 'company_pricing_adjustment_assignment.revoked':
    case 'company_commercial_activity_reader_assignment.granted':
    case 'company_commercial_activity_reader_assignment.revoked':
    case 'company_opportunity_manager_assignment.granted':
    case 'company_opportunity_manager_assignment.revoked':
    case 'company_ideas_reader_assignment.granted':
    case 'company_ideas_reader_assignment.revoked':
    case 'company_ideas_recorder_assignment.granted':
    case 'company_ideas_recorder_assignment.revoked':
    case 'company_ideas_reviewer_assignment.granted':
    case 'company_ideas_reviewer_assignment.revoked':
    case 'company_profitability_contributor_assignment.granted':
    case 'company_profitability_contributor_assignment.revoked':
    case 'company_profitability_director_assignment.granted':
    case 'company_profitability_director_assignment.revoked':
    case 'company_operational_risk_reader_assignment.granted':
    case 'company_operational_risk_reader_assignment.revoked':
    case 'company_operational_risk_recorder_assignment.granted':
    case 'company_operational_risk_recorder_assignment.revoked':
    case 'company_project_approver_assignment.granted':
    case 'company_project_approver_assignment.revoked':
    case 'company_sales_stage_configuration_assignment.granted':
    case 'company_sales_stage_configuration_assignment.revoked':
    case 'company_project_template_user_assignment.granted':
    case 'company_project_template_user_assignment.revoked':
    case 'company_project_stage_advancer_assignment.granted':
    case 'company_project_stage_advancer_assignment.revoked':
    case 'company_project_template_configuration_assignment.granted':
    case 'company_project_template_configuration_assignment.revoked':
      return {
        targetType: event.target.type,
        targetInternalUserId: event.target.internalUserId,
        targetWorkspaceMembershipId: event.target.workspaceMembershipId,
        targetCompanyId: event.target.companyId,
        targetCompanyRoleAssignmentId: event.target.assignmentId,
        targetClientAccountId: null,
        targetClientCompanyRelationshipId: null,
        idempotencyKey: `${event.action}:${event.target.assignmentId}:${event.transitionId}`,
      };
    case 'client.created':
      return {
        targetType: event.target.type,
        targetInternalUserId: null,
        targetWorkspaceMembershipId: null,
        targetCompanyId: null,
        targetCompanyRoleAssignmentId: null,
        targetClientAccountId: event.target.clientAccountId,
        targetClientCompanyRelationshipId: null,
        idempotencyKey: `${event.action}:${event.target.clientAccountId}`,
      };
    case 'client.corrected':
    case 'client_legal_entity.registered':
    case 'client_legal_entity.corrected':
      return {
        targetType: event.target.type,
        targetInternalUserId: null,
        targetWorkspaceMembershipId: null,
        targetCompanyId: event.target.companyId,
        targetCompanyRoleAssignmentId: null,
        targetClientAccountId: event.target.clientAccountId,
        targetClientCompanyRelationshipId: null,
        idempotencyKey: `${event.action}:${event.target.clientAccountId}:${event.transitionId}`,
      };
    case 'client_company_relationship.established':
      return {
        targetType: event.target.type,
        targetInternalUserId: null,
        targetWorkspaceMembershipId: null,
        targetCompanyId: event.target.companyId,
        targetCompanyRoleAssignmentId: null,
        targetClientAccountId: event.target.clientAccountId,
        targetClientCompanyRelationshipId: event.target.relationshipId,
        idempotencyKey: `${event.action}:${event.target.relationshipId}`,
      };
    default:
      return assertNever(event);
  }
}

interface PersistedActivityTarget {
  targetType:
    | 'workspace_invitation'
    | 'internal_user'
    | 'workspace_membership'
    | 'company'
    | 'company_role_assignment'
    | 'client_account'
    | 'client_company_relationship';
  targetCompanyRoleAssignmentId: string | null;
  targetWorkspaceInvitationId: string | null;
  targetWorkspaceMembershipId: string | null;
  targetInternalUserId: string | null;
  targetInternalUserDisplayName: string | null;
  targetCompanyId: string | null;
  targetCompanyDisplayName: string | null;
  targetClientAccountId: string | null;
  targetClientDisplayName: string | null;
  targetClientCompanyRelationshipId: string | null;
}

function canonicalTarget(event: PersistedActivityTarget) {
  switch (event.targetType) {
    case 'workspace_invitation':
      return {
        type: event.targetType,
        invitationId: required(
          event.targetWorkspaceInvitationId,
          'Invitation id',
        ),
      };
    case 'internal_user':
      return {
        type: event.targetType,
        internalUserId: required(
          event.targetInternalUserId,
          'Internal User id',
        ),
        displayName: required(
          event.targetInternalUserDisplayName,
          'Internal User display name',
        ),
      };
    case 'workspace_membership':
      return {
        type: event.targetType,
        workspaceMembershipId: required(
          event.targetWorkspaceMembershipId,
          'Workspace Membership id',
        ),
        internalUserId: required(
          event.targetInternalUserId,
          'Internal User id',
        ),
        displayName: required(
          event.targetInternalUserDisplayName,
          'Internal User display name',
        ),
      };
    case 'company':
      return {
        type: event.targetType,
        companyId: required(event.targetCompanyId, 'Company id'),
        displayName: required(event.targetCompanyDisplayName, 'Company name'),
      };
    case 'company_role_assignment':
      return {
        type: event.targetType,
        assignmentId: required(
          event.targetCompanyRoleAssignmentId,
          'Company Role Assignment id',
        ),
        companyId: required(event.targetCompanyId, 'Company id'),
        companyDisplayName: required(
          event.targetCompanyDisplayName,
          'Company name',
        ),
        workspaceMembershipId: required(
          event.targetWorkspaceMembershipId,
          'Workspace Membership id',
        ),
        internalUserId: required(
          event.targetInternalUserId,
          'Internal User id',
        ),
        internalUserDisplayName: required(
          event.targetInternalUserDisplayName,
          'Internal User display name',
        ),
      };
    case 'client_account':
      return event.targetCompanyId === null
        ? {
            type: event.targetType,
            clientAccountId: required(event.targetClientAccountId, 'Client id'),
            displayName: required(
              event.targetClientDisplayName,
              'Client display name',
            ),
          }
        : {
            type: event.targetType,
            clientAccountId: required(event.targetClientAccountId, 'Client id'),
            displayName: required(
              event.targetClientDisplayName,
              'Client display name',
            ),
            companyId: event.targetCompanyId,
            companyDisplayName: required(
              event.targetCompanyDisplayName,
              'Company name',
            ),
          };
    case 'client_company_relationship':
      return {
        type: event.targetType,
        relationshipId: required(
          event.targetClientCompanyRelationshipId,
          'Clientâ€“Company Relationship id',
        ),
        clientAccountId: required(event.targetClientAccountId, 'Client id'),
        clientDisplayName: required(
          event.targetClientDisplayName,
          'Client display name',
        ),
        companyId: required(event.targetCompanyId, 'Company id'),
        companyDisplayName: required(
          event.targetCompanyDisplayName,
          'Company name',
        ),
      };
    default:
      return assertNever(event.targetType);
  }
}

/**
 * A stored transition is an external boundary: a pair that is not exactly one
 * section 23 transition, or an activation without its start record, is
 * omitted rather than projected.
 */
function lifecycleEventMetadata(
  event: Pick<
    typeof projectLifecycleTransitions.$inferSelect,
    'action' | 'fromStatus' | 'toStatus' | 'lifecycleRevision'
  >,
  withStartException: boolean | undefined,
): ProjectLifecycleEventMetadata | undefined {
  const { fromStatus: from, toStatus: to, lifecycleRevision } = event;
  switch (event.action) {
    case 'activate':
      return from === 'preparatory' &&
        to === 'active' &&
        withStartException !== undefined
        ? { lifecycleRevision, from, to, withStartException }
        : undefined;
    case 'hold':
      return from === 'active' && to === 'on_hold'
        ? { lifecycleRevision, from, to }
        : undefined;
    case 'resume':
      return from === 'on_hold' && to === 'active'
        ? { lifecycleRevision, from, to }
        : undefined;
    case 'complete':
      return from === 'active' && to === 'completed'
        ? { lifecycleRevision, from, to }
        : undefined;
    case 'cancel':
      return (from === 'preparatory' ||
        from === 'active' ||
        from === 'on_hold') &&
        to === 'cancelled'
        ? { lifecycleRevision, from, to }
        : undefined;
    default:
      return assertNever(event.action);
  }
}

function recordedMember(
  workspaceMembershipId: string | null,
  displayLabel: string | null,
): ProjectResponsibleMember | null {
  if (workspaceMembershipId === null && displayLabel === null) return null;
  if (workspaceMembershipId === null || displayLabel === null)
    throw new Error('Activity Log event has an incomplete responsible member.');
  return { workspaceMembershipId, displayLabel };
}

function required(value: string | null, field: string): string {
  if (value === null)
    throw new Error(`Activity Log event is missing ${field}.`);
  return value;
}

function assertNever(value: never): never {
  throw new Error(`Unexpected Activity Log variant: ${JSON.stringify(value)}`);
}

function contractEventMetadata(
  source: ContractEventSource,
): Record<string, string | number> {
  switch (source.kind) {
    case 'DIRECT':
      return { kind: 'CONTRACT', origin: 'DIRECT' };
    case 'ACCEPTED_OFFER':
      return {
        kind: source.contractKind,
        origin: 'ACCEPTED_OFFER',
        offerVersionId: source.offerVersionId,
      };
    case 'ADDENDUM':
      return {
        kind: 'ADDENDUM',
        parentContractId: source.parentContractId,
        addendumOrdinal: source.addendumOrdinal,
      };
    default: {
      const unreachable: never = source;
      return unreachable;
    }
  }
}

function recordedStage(
  stage: RecordedSalesStage,
): { salesStageId: string; label: string } | null {
  return stage === null
    ? null
    : { salesStageId: stage.salesStageId, label: stage.label };
}
