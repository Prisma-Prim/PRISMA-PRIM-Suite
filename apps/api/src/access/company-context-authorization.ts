import { readWorkingEvidenceCaptures } from './working-evidence-captures.js';
import {
  receivedAddendumAssignment,
  receivedAddendumClientReadCapture,
} from './received-addendum-access.js';
import {
  capturePaymentGrant,
  paymentCapturedGrant,
  paymentReadGrant,
} from './payment-captured-grants.js';
import { readPaymentEvidenceCaptures } from './payment-evidence-captures.js';
import { readOfferMessageReadCapture } from './offer-message-read-capture.js';
import { createHash } from 'node:crypto';
import {
  captureExternalInvoiceGrant,
  invoiceFinanceCapturedGrant,
  externalInvoiceCapturedAuthority,
} from './external-invoice-captured-grants.js';
import { captureKnowledgeGrant } from './knowledge-captured-grants.js';
import {
  opportunityFollowUpCapturedAuthority,
  opportunityFollowUpReadCapture,
} from './opportunity-follow-up-captured-grants.js';
import {
  COMPANY_PROJECT_NEXT_ACTION_COORDINATOR_BUNDLE,
  COMPANY_MISSION_APPLICABILITY_COORDINATOR_BUNDLE,
  COMPANY_MISSION_APPLICABILITY_APPROVER_BUNDLE,
} from './company-permissions.js';
import { captureMissionPlanGrant } from './mission-plan-captured-grants.js';

import {
  COMPANY_CONTRACT_EARLY_PREPARATION_BUNDLE,
  contractEarlyPreparationPermissionsFor,
} from './company-permissions.js';

import {
  COMPANY_CONTRACT_PREPARER_BUNDLE,
  contractPreparerPermissionsFor,
  contractApproverPermissionsFor,
  COMPANY_CONTRACT_APPROVER_BUNDLE,
} from './company-permissions.js';
import { Injectable, ForbiddenException } from '@nestjs/common';
import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { DatabaseContext } from '../database/database-context.js';
import {
  companies,
  companyRoleAssignments,
  internalUsers,
  workspacePermissionGrants,
  workspaceMemberships,
} from '../database/schema/index.js';
import type { ActiveCompanyContext, ActorContext } from './access.types.js';
import {
  COMPANY_CONTEXT_CONFERRING_BUNDLES,
  companyRolePermissionsFor,
  COMPANY_WORKING_EVIDENCE_CASE_READER_BUNDLE,
  COMPANY_WORKING_EVIDENCE_CASE_RECORDER_BUNDLE,
  COMPANY_RECEIVED_AUDIT_SOURCE_ACCESS_BUNDLE,
  workingEvidenceCaseReaderPermissionsFor,
  workingEvidenceCaseRecorderPermissionsFor,
  receivedAuditSourcePermissionsFor,
  COMPANY_OPPORTUNITY_FOLLOW_UP_COORDINATOR_BUNDLE,
  opportunityFollowUpPermissionsFor,
  COMPANY_INTERNAL_TASK_MANAGER_BUNDLE,
  internalTaskPermissionsFor,
  COMPANY_TASK_MANAGER_BUNDLE,
  taskPermissionsFor,
  taskResultPermissionsFor,
  missionResultReviewPermissionsFor,
  COMPANY_DOCUMENT_PROJECT_ORGANIZER_BUNDLE,
  COMPANY_DOCUMENT_REGISTRAR_BUNDLE,
  COMPANY_DOCUMENT_APPROVER_BUNDLE,
  COMPANY_DOCUMENT_CONTENT_READER_BUNDLE,
  COMPANY_MISSION_DELIVERABLE_ACCESS_BUNDLE,
  COMPANY_CONTRACT_SIGNATURE_DECLARER_BUNDLE,
  COMPANY_RECEIVED_CONTRACT_ACCESS_BUNDLE,
  COMPANY_RECEIVED_ADDENDUM_ACCESS_BUNDLE,
  receivedContractPermissionsFor,
  receivedAddendumPermissionsFor,
  COMPANY_TASK_RESULT_RECORDER_BUNDLE,
  COMPANY_MISSION_RESULT_REVIEWER_BUNDLE,
  missionDeliverablePermissionsFor,
  COMPANY_DOCUMENT_CONTENT_UPLOADER_BUNDLE,
  documentApproverPermissionsFor,
  documentPermissionsFor,
  isDocumentPermissionSetVersion,
  COMPANY_PROJECT_ACCESS_BUNDLE,
  COMPANY_PROJECT_APPROVER_BUNDLE,
  projectApproverPermissionsFor,
  isProjectPermissionSetVersion,
  projectPermissionsFor,
  COMPANY_DIRECTOR_CLIENT_ACCESS_BUNDLE,
  companyDirectorClientPermissionsFor,
  COMPANY_COMMERCIAL_INTAKE_BUNDLE,
  commercialIntakePermissionsFor,
  isCommercialIntakePermissionSetVersion,
  COMPANY_COMMERCIAL_ACTIVITY_READER_BUNDLE,
  commercialActivityPermissionsFor,
  type CompanyCommercialIntakePermission,
  COMPANY_SERVICE_CATALOGUE_BUNDLE,
  serviceCataloguePermissionsFor,
  COMPANY_PRICING_CONFIGURATION_BUNDLE,
  pricingConfigurationPermissionsFor,
  COMPANY_PRICING_USER_BUNDLE,
  pricingUserPermissionsFor,
  COMPANY_OFFER_PREPARER_BUNDLE,
  COMPANY_OFFER_APPROVER_BUNDLE,
  offerPreparerPermissionsFor,
  offerApproverPermissionsFor,
  COMMERCIAL_INTAKE_READ_PERMISSIONS,
  COMPANY_OPPORTUNITY_MANAGER_BUNDLE,
  COMPANY_PROJECT_STAGE_ADVANCER_BUNDLE,
  projectStagePermissionsFor,
  COMPANY_PROJECT_TEMPLATE_USER_BUNDLE,
  projectTemplatePermissionsFor,
  projectTemplateConfigurationPermissionsFor,
  COMPANY_PROJECT_TEMPLATE_CONFIGURATION_BUNDLE,
  COMPANY_SALES_STAGE_CONFIGURATION_BUNDLE,
  salesStageConfigurationPermissionsFor,
  isOpportunityManagerPermissionSetVersion,
  opportunityManagerPermissionsFor,
  COMPANY_PRICING_ADJUSTMENT_BUNDLE,
  pricingAdjustmentPermissionsFor,
  COMPANY_PROFITABILITY_CONTRIBUTOR_BUNDLE,
  COMPANY_PROFITABILITY_DIRECTOR_BUNDLE,
  profitabilityContributorPermissionsFor,
  profitabilityDirectorPermissionsFor,
  COMPANY_OPERATIONAL_RISK_READER_BUNDLE,
  COMPANY_OPERATIONAL_RISK_RECORDER_BUNDLE,
  operationalRiskReaderPermissionsFor,
  operationalRiskRecorderPermissionsFor,
} from './company-permissions.js';

import { projectIdeasAssignment } from './ideas-captured-grants.js';
import { projectCertificationAssignment } from './certification-captured-grants.js';
import { captureContractModelGrant } from './contract-model-captured-grants.js';
import { captureOfferModelGrant } from './offer-model-captured-grants.js';
import {
  captureCompanyPermissions,
  captureGrantProjection,
  capturedCompanyGrants,
  capturedAssignmentsCondition,
  carriesCapturedPermissions,
  capturedPermissionResult,
  type CapturedCompanyGrant,
  type CapturedPermissionRequest,
  type PermissionRequirement,
} from './captured-company-permissions.js';

@Injectable()
export class CompanyContextAuthorization {
  constructor(private readonly databaseContext: DatabaseContext) {}

  /** The caller owns the transaction or read snapshot and chooses whether grants remain locked. */
  async requirePermissions(
    actor: ActorContext,
    request: CapturedPermissionRequest,
  ) {
    const company = actor.activeCompany;
    if (!company) throw new ForbiddenException();
    const captured = capturedCompanyGrants(actor);
    const consumed: CapturedCompanyGrant[] = [];
    const consume = async (
      requirement: PermissionRequirement,
      assignmentId?: string,
    ) => {
      if (
        consumed.some(
          (grant) =>
            (!assignmentId || grant.assignmentId === assignmentId) &&
            carriesCapturedPermissions(actor, grant, requirement),
        )
      )
        return;
      if (
        requirement.workspaceAlternative &&
        actor.workspacePermissions.includes(requirement.workspaceAlternative)
      ) {
        const query = this.databaseContext.connection
          .select({ id: workspacePermissionGrants.id })
          .from(workspacePermissionGrants)
          .where(
            and(
              eq(workspacePermissionGrants.workspaceId, actor.workspaceId),
              eq(
                workspacePermissionGrants.workspaceMembershipId,
                actor.workspaceMembershipId,
              ),
              eq(
                workspacePermissionGrants.permission,
                requirement.workspaceAlternative,
              ),
            ),
          )
          .limit(1);
        const rows = request.lock ? await query.for('share') : await query;
        if (rows.length) return;
      }
      const candidates = captured.filter(
        (grant) =>
          (!assignmentId || grant.assignmentId === assignmentId) &&
          carriesCapturedPermissions(actor, grant, requirement),
      );
      if (!candidates.length) throw new ForbiddenException();
      const id = await this.requireLiveCapturedAssignment(
        actor,
        company.id,
        candidates,
        request.lock ?? false,
        request.lockCompany === false ? 'member-rows' : 'all-rows',
      );
      const selected = candidates.find((grant) => grant.assignmentId === id);
      if (!selected) throw new ForbiddenException();
      consumed.push(selected);
    };
    await consume(request, request.assignmentId);
    for (const prerequisite of request.prerequisites ?? [])
      await consume(prerequisite);
    if (consumed.length === 0) {
      const identityQuery = this.databaseContext.connection
        .select({ id: workspaceMemberships.id })
        .from(workspaceMemberships)
        .innerJoin(
          internalUsers,
          and(
            eq(internalUsers.id, workspaceMemberships.internalUserId),
            eq(internalUsers.id, actor.internalUserId),
            eq(internalUsers.status, 'active'),
          ),
        )
        .innerJoin(
          companies,
          and(
            eq(companies.workspaceId, workspaceMemberships.workspaceId),
            eq(companies.id, company.id),
            eq(companies.status, 'active'),
          ),
        )
        .where(
          and(
            eq(workspaceMemberships.workspaceId, actor.workspaceId),
            eq(workspaceMemberships.id, actor.workspaceMembershipId),
            eq(workspaceMemberships.status, 'active'),
          ),
        );
      const identity = request.lock
        ? await identityQuery.for('share', {
            of:
              request.lockCompany === false
                ? [workspaceMemberships, internalUsers]
                : [workspaceMemberships, internalUsers, companies],
          })
        : await identityQuery;
      if (!identity.length) throw new ForbiddenException();
    }
    if (
      !consumed.some((grant) =>
        COMPANY_CONTEXT_CONFERRING_BUNDLES.some(
          (bundle) => bundle === grant.bundle,
        ),
      )
    ) {
      const context = await this.requireLiveCompanyContext(
        actor,
        company.id,
        request.lock ?? false,
      );
      if (context) consumed.push(context);
    }
    return capturedPermissionResult(company.id, consumed);
  }

  /**
   * The active Company of a member who holds the live Workspace right that
   * assigns the Company bundles, the certification bundles included. The
   * caller owns the transaction; `lock` share-locks the grant, membership,
   * Internal User and Company until it ends.
   */
  async requireCompanyAssignmentAdministration(
    actor: ActorContext,
    options: { lock: boolean },
  ): Promise<string> {
    const company = actor.activeCompany;
    if (
      !company ||
      !actor.workspacePermissions.includes('company.assignment.manage')
    )
      throw new ForbiddenException();
    const query = this.databaseContext.connection
      .select({ id: workspacePermissionGrants.id })
      .from(workspacePermissionGrants)
      .innerJoin(
        workspaceMemberships,
        and(
          eq(
            workspaceMemberships.workspaceId,
            workspacePermissionGrants.workspaceId,
          ),
          eq(
            workspaceMemberships.id,
            workspacePermissionGrants.workspaceMembershipId,
          ),
          eq(workspaceMemberships.internalUserId, actor.internalUserId),
          eq(workspaceMemberships.status, 'active'),
        ),
      )
      .innerJoin(
        internalUsers,
        and(
          eq(internalUsers.id, workspaceMemberships.internalUserId),
          eq(internalUsers.status, 'active'),
        ),
      )
      .innerJoin(
        companies,
        and(
          eq(companies.workspaceId, workspacePermissionGrants.workspaceId),
          eq(companies.id, company.id),
          eq(companies.status, 'active'),
        ),
      )
      .where(
        and(
          eq(workspacePermissionGrants.workspaceId, actor.workspaceId),
          eq(
            workspacePermissionGrants.workspaceMembershipId,
            actor.workspaceMembershipId,
          ),
          eq(workspacePermissionGrants.permission, 'company.assignment.manage'),
        ),
      )
      .limit(1);
    const rows = options.lock ? await query.for('share') : await query;
    if (!rows.length) throw new ForbiddenException();
    return company.id;
  }

  async hasPermissions(
    actor: ActorContext,
    request: CapturedPermissionRequest,
  ): Promise<boolean> {
    try {
      await this.requirePermissions(actor, request);
      return true;
    } catch (error) {
      if (error instanceof ForbiddenException) return false;
      throw error;
    }
  }

  /** Payment copied reads and source-free actions deliberately consume no Client/Document authority. */
  async requirePaymentObservationAccess(
    actor: ActorContext,
    options: {
      action: 'read' | 'record' | 'confirm' | 'reverse';
      lock: boolean;
    },
  ) {
    const company = actor.activeCompany;
    const grant =
      options.action === 'read'
        ? paymentReadGrant(company?.paymentGrants)
        : paymentCapturedGrant(
            company?.paymentGrants,
            options.action === 'record'
              ? 'company_payment_recorder'
              : options.action === 'confirm'
                ? 'company_payment_confirmer'
                : 'company_payment_reverser',
          );
    if (!actor.active || !company || !grant) throw new ForbiddenException();
    await this.requirePermissions(actor, {
      permissions: companyRolePermissionsFor(grant.bundle, 'v1'),
      assignmentId: grant.assignmentId,
      lock: options.lock,
    });
    const contexts = await this.opportunityFollowUpContextIdentities(
      actor,
      company.id,
      false,
    );
    const context = paymentObservationContext(contexts);
    if (!context || typeof context[1] !== 'string')
      throw new ForbiddenException();
    if (options.lock) {
      const contextId = context[1];
      if (context[0] === 'company.manage') {
        const rows = await this.databaseContext.connection
          .select({ id: workspacePermissionGrants.id })
          .from(workspacePermissionGrants)
          .where(
            and(
              eq(workspacePermissionGrants.workspaceId, actor.workspaceId),
              eq(
                workspacePermissionGrants.workspaceMembershipId,
                actor.workspaceMembershipId,
              ),
              eq(workspacePermissionGrants.id, contextId),
              eq(workspacePermissionGrants.permission, 'company.manage'),
            ),
          )
          .for('share');
        if (!rows.length) throw new ForbiddenException();
      } else {
        await this.requireLiveCapturedAssignment(
          actor,
          company.id,
          capturedCompanyGrants(actor).filter(
            (grant) => grant.assignmentId === contextId,
          ),
          true,
        );
      }
    }
    if (
      company.paymentObservationContextCapture !==
      paymentObservationContextCapture(actor, company.id, contexts)
    )
      throw new ForbiddenException();
    const read = paymentReadGrant(company.paymentGrants);
    if (!read) throw new ForbiddenException();
    const readCapture = paymentObservationReadCapture(
      actor,
      company.id,
      read.assignmentId,
      contexts,
    );
    if (
      options.action === 'read' &&
      company.paymentObservationReadCapture !== readCapture
    )
      throw new ForbiddenException();
    return {
      companyId: company.id,
      assignmentId: grant.assignmentId,
      readCapture,
    };
  }

  async requirePaymentEvidenceReferenceRead(
    actor: ActorContext,
    lock: boolean,
  ): Promise<void> {
    const company = actor.activeCompany;
    if (!company) throw new ForbiddenException();
    const observed = await readPaymentEvidenceCaptures({
      database: this.databaseContext,
      actor,
      companyId: company.id,
      lock,
    });
    if (
      !observed.contextCapture ||
      !observed.referenceReadCapture ||
      company.paymentEvidenceContextCapture !== observed.contextCapture ||
      company.paymentEvidenceReferenceReadCapture !==
        observed.referenceReadCapture
    )
      throw new ForbiddenException();
  }
  async hasPaymentEvidenceAccess(
    actor: ActorContext,
    options: {
      manage: boolean;
      lockAssignment: boolean;
      paymentObservationAction?: 'record' | 'confirm';
    } = {
      manage: false,
      lockAssignment: false,
    },
  ): Promise<boolean> {
    const company = actor.activeCompany;
    const family = paymentCapturedGrant(
      company?.paymentGrants,
      'company_payment_evidence_access',
    );
    const selected = options.paymentObservationAction
      ? paymentCapturedGrant(
          company?.paymentGrants,
          options.paymentObservationAction === 'confirm'
            ? 'company_payment_confirmer'
            : 'company_payment_recorder',
        )
      : options.manage
        ? paymentCapturedGrant(
            company?.paymentGrants,
            'company_payment_recorder',
          )
        : paymentReadGrant(company?.paymentGrants);
    if (!actor.active || !company || !family || !selected) return false;
    try {
      await this.requirePaymentEvidenceReferenceRead(
        actor,
        options.lockAssignment,
      );
      await this.requirePermissions(actor, {
        permissions: companyRolePermissionsFor(family.bundle, 'v1'),
        assignmentId: family.assignmentId,
        lock: options.lockAssignment,
      });
      if (selected)
        await this.requirePermissions(actor, {
          permissions: companyRolePermissionsFor(selected.bundle, 'v1'),
          assignmentId: selected.assignmentId,
          lock: options.lockAssignment,
        });
      return true;
    } catch (error) {
      if (error instanceof ForbiddenException) return false;
      throw error;
    }
  }

  async requireOfferMessageReadObservation(
    actor: ActorContext,
    options: { lock: boolean },
  ) {
    const company = actor.activeCompany;
    if (!company || !company.offerMessageReadCapture)
      throw new ForbiddenException();
    const observation = await readOfferMessageReadCapture({
      database: this.databaseContext,
      actor,
      companyId: company.id,
      lock: options.lock,
    });
    if (
      !observation ||
      observation.readCapture !== company.offerMessageReadCapture
    )
      throw new ForbiddenException();
    return observation;
  }

  /** Copied records and withdrawal deliberately consume only financial authority. */
  async requireInvoiceRecordAccess(
    actor: ActorContext,
    options: { manage: boolean; lock: boolean },
  ) {
    const company = actor.activeCompany;
    const grant =
      company &&
      invoiceFinanceCapturedGrant(
        company.externalInvoiceGrants,
        options.manage,
      );
    if (!actor.active || !company || !grant) throw new ForbiddenException();
    await this.requireLiveCompanyContext(actor, company.id, options.lock);
    await this.requirePermissions(actor, {
      permissions: companyRolePermissionsFor(grant.bundle, 'v1'),
      assignmentId: grant.assignmentId,
      lock: options.lock,
    });
    const contexts = await this.opportunityFollowUpContextIdentities(
      actor,
      company.id,
      options.lock,
    );
    const readCapture = invoiceRecordReadCapture(
      actor,
      company.id,
      grant.assignmentId,
      contexts,
    );
    if (company.invoiceRecordReadCapture !== readCapture)
      throw new ForbiddenException();
    return {
      companyId: company.id,
      assignmentId: grant.assignmentId,
      readCapture,
    };
  }

  async requireOpportunityFollowUpAccess(
    actor: ActorContext,
    options: { manage: boolean; lock: boolean },
  ): Promise<{
    companyId: string;
    assignmentId: string;
    permissionSetVersion: 'v1';
    readCapture: string;
  }> {
    const company = actor.activeCompany;
    const capture =
      company && opportunityFollowUpCapturedAuthority(company, options);
    if (!actor.active || !company || !capture) throw new ForbiddenException();
    // Match native Commercial Intake's assignment/member/user/Company → context
    // lock order before consuming the independent coordinator assignment.
    await this.requirePermissions(actor, {
      permissions: ['commercial.request.read', 'commercial.opportunity.read'],
      assignmentId: capture.nativeAssignmentId,
      lock: options.lock,
    });
    const contextIdentities = await this.opportunityFollowUpContextIdentities(
      actor,
      company.id,
      options.lock,
    );
    if (contextIdentities.length === 0) throw new ForbiddenException();
    await this.requirePermissions(actor, {
      permissions: [
        options.manage
          ? 'commercial.opportunity.follow_up.manage'
          : 'commercial.opportunity.follow_up.read',
      ],
      assignmentId: capture.assignmentId,
      lock: options.lock,
    });
    const readCapture = opportunityFollowUpReadCapture({
      workspaceId: actor.workspaceId,
      workspaceMembershipId: actor.workspaceMembershipId,
      companyId: company.id,
      assignmentId: capture.assignmentId,
      nativeAssignmentId: capture.nativeAssignmentId,
      nativePermissionSetVersion: capture.nativePermissionSetVersion,
      contextIdentities,
    });
    if (readCapture !== capture.readCapture) throw new ForbiddenException();
    // The same Access-owned PostgreSQL participant also protects direct native
    // command entry; TypeScript retains the complete consumed capture check.
    if (options.manage) {
      await this.databaseContext.connection.execute(
        sql`SELECT access_require_opportunity_follow_up_command(${actor.workspaceId}::uuid,${company.id}::uuid,${actor.workspaceMembershipId}::uuid,${actor.internalUserId}::uuid,${capture.nativeAssignmentId}::uuid,${capture.assignmentId}::uuid)`,
      );
    }
    return {
      companyId: company.id,
      assignmentId: capture.assignmentId,
      permissionSetVersion: 'v1',
      readCapture,
    };
  }

  private async opportunityFollowUpContextIdentities(
    actor: ActorContext,
    companyId: string,
    lock: boolean,
  ): Promise<(string | null)[][]> {
    if (actor.workspacePermissions.includes('company.manage')) {
      const query = this.databaseContext.connection
        .select({ id: workspacePermissionGrants.id })
        .from(workspacePermissionGrants)
        .where(
          and(
            eq(workspacePermissionGrants.workspaceId, actor.workspaceId),
            eq(
              workspacePermissionGrants.workspaceMembershipId,
              actor.workspaceMembershipId,
            ),
            eq(workspacePermissionGrants.permission, 'company.manage'),
          ),
        )
        .orderBy(workspacePermissionGrants.id);
      const grants = lock ? await query.for('share') : await query;
      if (grants.length > 0)
        return grants.map((grant) => ['company.manage', grant.id, null]);
    }
    const query = this.databaseContext.connection
      .select({
        id: companyRoleAssignments.id,
        bundle: companyRoleAssignments.bundle,
        version: companyRoleAssignments.permissionSetVersion,
      })
      .from(companyRoleAssignments)
      .where(
        and(
          eq(companyRoleAssignments.workspaceId, actor.workspaceId),
          eq(
            companyRoleAssignments.workspaceMembershipId,
            actor.workspaceMembershipId,
          ),
          eq(companyRoleAssignments.companyId, companyId),
          inArray(
            companyRoleAssignments.bundle,
            COMPANY_CONTEXT_CONFERRING_BUNDLES,
          ),
          isNull(companyRoleAssignments.revokedAt),
        ),
      )
      .orderBy(companyRoleAssignments.id);
    const grants = lock ? await query.for('share') : await query;
    return grants.map((grant) => [grant.bundle, grant.id, grant.version]);
  }

  async resolveAuthorizedActiveCompany(
    actor: ActorContext,
    companyId: string,
  ): Promise<ActiveCompanyContext | undefined> {
    if (actor.workspacePermissions.includes('company.manage')) {
      const company = await this.findActiveCompany(
        actor.workspaceId,
        companyId,
      );
      if (!company) return undefined;
      captureCompanyPermissions({ actor, company, grants: [] });
      return (
        (await this.findAssignedActiveCompanies(actor, companyId))[0] ?? company
      );
    }
    return (await this.findAssignedActiveCompanies(actor, companyId))[0];
  }

  async resolveVisibleCompanyScope(
    actor: ActorContext,
  ): Promise<CompanyContextVisibility> {
    if (actor.workspacePermissions.includes('company.manage')) {
      return { kind: 'all-active' };
    }
    return {
      kind: 'assigned-active',
      companyIds: (await this.findAssignedActiveCompanies(actor)).map(
        (company) => company.id,
      ),
    };
  }

  async duplicateReviewAuthorizedCompanyIds(
    actor: ActorContext,
    companyIds: readonly string[],
    lock = false,
  ): Promise<ReadonlySet<string>> {
    const requiredCompanyIds = [...new Set(companyIds)];
    if (requiredCompanyIds.length === 0) return new Set();
    const query = this.databaseContext.connection
      .select({ companyId: companyRoleAssignments.companyId })
      .from(companyRoleAssignments)
      .innerJoin(
        workspaceMemberships,
        and(
          eq(
            workspaceMemberships.workspaceId,
            companyRoleAssignments.workspaceId,
          ),
          eq(
            workspaceMemberships.id,
            companyRoleAssignments.workspaceMembershipId,
          ),
          eq(workspaceMemberships.status, 'active'),
        ),
      )
      .innerJoin(
        internalUsers,
        and(
          eq(internalUsers.id, workspaceMemberships.internalUserId),
          eq(internalUsers.id, actor.internalUserId),
          eq(internalUsers.status, 'active'),
        ),
      )
      .innerJoin(
        companies,
        and(
          eq(companies.workspaceId, companyRoleAssignments.workspaceId),
          eq(companies.id, companyRoleAssignments.companyId),
          eq(companies.status, 'active'),
        ),
      )
      .where(
        and(
          eq(companyRoleAssignments.workspaceId, actor.workspaceId),
          eq(
            companyRoleAssignments.workspaceMembershipId,
            actor.workspaceMembershipId,
          ),
          eq(
            companyRoleAssignments.bundle,
            COMPANY_DIRECTOR_CLIENT_ACCESS_BUNDLE,
          ),
          eq(companyRoleAssignments.permissionSetVersion, 'v2'),
          isNull(companyRoleAssignments.revokedAt),
          inArray(companyRoleAssignments.companyId, requiredCompanyIds),
        ),
      );
    const rows = lock ? await query.for('share') : await query;
    return new Set(rows.map((row) => row.companyId));
  }

  /** Contract owns source qualification; Access fences the exact native captures it consumes. */
  async requireExternalInvoiceSourceAccess(
    actor: ActorContext,
    options: { lockAssignment: boolean },
  ): Promise<string> {
    const company = actor.activeCompany;
    if (
      !actor.active ||
      !company ||
      !company.contractPermissions?.includes('commercial.contract.read') ||
      !company.commercialIntakePermissions?.includes(
        'commercial.request.read',
      ) ||
      !company.commercialIntakePermissions.includes(
        'commercial.opportunity.read',
      )
    )
      throw new ForbiddenException();
    await this.requireLiveCompanyContext(
      actor,
      company.id,
      options.lockAssignment,
    );
    await this.requirePermissions(actor, {
      anyOf: [
        ['commercial.contract.read', 'commercial.contract.prepare'],
        ['commercial.contract.read', 'commercial.contract.approve'],
      ],
      lock: options.lockAssignment,
    });
    await this.requireCapturedCompanyGrant(actor, {
      bundle: COMPANY_COMMERCIAL_INTAKE_BUNDLE,
      assignmentId: company.commercialIntakePermissionAssignmentId,
      version: company.commercialIntakePermissionSetVersion,
      versions: ['v1', 'v2', 'v3', 'v4'],
      lock: options.lockAssignment,
    });
    await this.requireExternalInvoiceClientRead(actor, options.lockAssignment);
    return company.id;
  }

  /** Exact parent-read captures, independent from native Document and Client work. */
  async requireReceivedAddendumSourceAccess(
    actor: ActorContext,
    options: { lockAssignment: boolean },
  ): Promise<string> {
    const company = actor.activeCompany;
    if (
      !actor.active ||
      !company ||
      !company.contractPermissions?.includes('commercial.contract.read') ||
      !company.commercialIntakePermissions?.includes(
        'commercial.request.read',
      ) ||
      !company.commercialIntakePermissions.includes(
        'commercial.opportunity.read',
      )
    )
      throw new ForbiddenException();
    await this.requireLiveCompanyContext(
      actor,
      company.id,
      options.lockAssignment,
    );
    await this.requirePermissions(actor, {
      anyOf: [
        ['commercial.contract.read', 'commercial.contract.prepare'],
        ['commercial.contract.read', 'commercial.contract.approve'],
      ],
      lock: options.lockAssignment,
    });
    await this.requireCapturedCompanyGrant(actor, {
      bundle: COMPANY_COMMERCIAL_INTAKE_BUNDLE,
      assignmentId: company.commercialIntakePermissionAssignmentId,
      version: company.commercialIntakePermissionSetVersion,
      versions: ['v1', 'v2', 'v3', 'v4'],
      lock: options.lockAssignment,
    });
    return company.id;
  }

  private async requireCapturedCompanyGrant(
    actor: ActorContext,
    input: {
      bundle: typeof companyRoleAssignments.$inferSelect.bundle;
      assignmentId: unknown;
      version: unknown;
      versions: readonly string[];
      lock: boolean;
    },
  ): Promise<void> {
    const validCapture = isNativeDocumentCapture(input);
    if (!validCapture) throw new ForbiddenException();
    await this.requirePermissions(actor, {
      anyOf: companyRolePermissionsFor(input.bundle, input.version).map(
        (permission) => [permission],
      ),
      assignmentId: input.assignmentId,
      lock: input.lock,
    });
  }

  private async requireExternalInvoiceClientRead(
    actor: ActorContext,
    lock: boolean,
  ): Promise<void> {
    const company = actor.activeCompany;
    if (!company) throw new ForbiddenException();
    if (actor.workspacePermissions.includes('client.manage')) {
      const query = this.databaseContext.connection
        .select({ id: workspacePermissionGrants.id })
        .from(workspacePermissionGrants)
        .where(
          and(
            eq(workspacePermissionGrants.workspaceId, actor.workspaceId),
            eq(
              workspacePermissionGrants.workspaceMembershipId,
              actor.workspaceMembershipId,
            ),
            eq(workspacePermissionGrants.permission, 'client.manage'),
          ),
        );
      const rows = lock ? await query.for('share') : await query;
      if (rows.length) return;
    }
    if (!company.clientPermissions.includes('client.read'))
      throw new ForbiddenException();
    await this.requireCapturedCompanyGrant(actor, {
      bundle: COMPANY_DIRECTOR_CLIENT_ACCESS_BUNDLE,
      assignmentId: company.clientPermissionAssignmentId,
      version: company.clientPermissionSetVersion,
      versions: ['v1', 'v2'],
      lock,
    });
  }

  /** Exact native captures fence only the financial family; legacy families retain their delivered policy. */
  async requirePaymentEvidenceNativeAccess(
    actor: ActorContext,
    options: {
      action:
        | 'read'
        | 'register'
        | 'correct'
        | 'version'
        | 'designate'
        | 'content-read'
        | 'upload';
      lockAssignment: boolean;
    },
  ): Promise<string> {
    const company = actor.activeCompany;
    if (
      !actor.active ||
      !company ||
      !company.documentPermissions?.includes('document.read')
    )
      throw new ForbiddenException();
    await this.requirePaymentEvidenceReferenceRead(
      actor,
      options.lockAssignment,
    );
    const requireCapture = (input: {
      bundle: typeof companyRoleAssignments.$inferSelect.bundle;
      assignmentId: unknown;
      version: unknown;
      versions: readonly string[];
    }) =>
      this.requireCapturedCompanyGrant(actor, {
        ...input,
        lock: options.lockAssignment,
      });
    const versions =
      options.action === 'version' || options.action === 'upload'
        ? ['v3']
        : options.action === 'correct'
          ? ['v2', 'v3']
          : ['v1', 'v2', 'v3'];
    await requireCapture({
      bundle: COMPANY_DOCUMENT_REGISTRAR_BUNDLE,
      assignmentId: company.documentPermissionAssignmentId,
      version: company.documentPermissionSetVersion,
      versions,
    });
    if (
      options.action === 'register' &&
      !company.documentPermissions.includes('document.register')
    )
      throw new ForbiddenException();
    if (
      options.action === 'correct' &&
      !company.documentPermissions.includes('document.correct')
    )
      throw new ForbiddenException();
    if (
      (options.action === 'version' || options.action === 'upload') &&
      !company.documentPermissions.includes('document.version.manage')
    )
      throw new ForbiddenException();
    if (options.action === 'designate') {
      if (
        !company.documentPermissions.includes(
          'document.version.designate_official',
        )
      )
        throw new ForbiddenException();
      await requireCapture({
        bundle: COMPANY_DOCUMENT_APPROVER_BUNDLE,
        assignmentId: company.documentApproverAssignmentId,
        version: company.documentApproverPermissionSetVersion,
        versions: ['v1'],
      });
    }
    if (options.action === 'content-read' || options.action === 'upload') {
      if (!company.documentPermissions.includes('document.content.read'))
        throw new ForbiddenException();
      await requireCapture({
        bundle: COMPANY_DOCUMENT_CONTENT_READER_BUNDLE,
        assignmentId: company.documentContentReaderAssignmentId,
        version: company.documentContentReaderPermissionSetVersion,
        versions: ['v1'],
      });
    }
    if (options.action === 'upload') {
      if (!company.documentPermissions.includes('document.content.upload'))
        throw new ForbiddenException();
      await requireCapture({
        bundle: COMPANY_DOCUMENT_CONTENT_UPLOADER_BUNDLE,
        assignmentId: company.documentContentUploaderAssignmentId,
        version: company.documentContentUploaderPermissionSetVersion,
        versions: ['v1'],
      });
    }
    return company.id;
  }

  async requireExternalInvoiceNativeAccess(
    actor: ActorContext,
    options: {
      action:
        | 'read'
        | 'register'
        | 'correct'
        | 'version'
        | 'designate'
        | 'content-read'
        | 'upload';
      lockAssignment: boolean;
    },
  ): Promise<string> {
    return this.requireDocumentFamilyNativeAccess(actor, options, true);
  }

  /** Current Case authority only: no lifecycle, source eligibility or byte read. Caller owns the transaction. */
  async requireWorkingEvidenceCaseAccess(
    actor: ActorContext,
    options: {
      record: boolean;
      lockAssignment: boolean;
      readCapture?: string;
    },
  ): Promise<{ companyId: string; readCapture: string }> {
    const company = actor.activeCompany;
    if (
      !actor.active ||
      !company ||
      !company.workingEvidenceCasePermissions?.includes(
        'working_evidence_case.read',
      ) ||
      (options.record &&
        !company.workingEvidenceCasePermissions.includes(
          'working_evidence_case.record',
        ))
    )
      throw new ForbiddenException();
    const captures = [
      {
        bundle: COMPANY_WORKING_EVIDENCE_CASE_READER_BUNDLE,
        assignmentId: company.workingEvidenceCaseReaderAssignmentId,
        version: company.workingEvidenceCaseReaderPermissionSetVersion,
      },
      {
        bundle: COMPANY_WORKING_EVIDENCE_CASE_RECORDER_BUNDLE,
        assignmentId: company.workingEvidenceCaseRecorderAssignmentId,
        version: company.workingEvidenceCaseRecorderPermissionSetVersion,
      },
    ] satisfies Array<{
      bundle:
        | typeof COMPANY_WORKING_EVIDENCE_CASE_READER_BUNDLE
        | typeof COMPANY_WORKING_EVIDENCE_CASE_RECORDER_BUNDLE;
      assignmentId: string | undefined;
      version: 'v1' | undefined;
    }>;
    const candidates = captures.filter(
      (candidate) =>
        (!options.record ||
          candidate.bundle === COMPANY_WORKING_EVIDENCE_CASE_RECORDER_BUNDLE) &&
        isNativeDocumentCapture({ ...candidate, versions: ['v1'] }),
    );
    const readCaptureFor = (candidate: (typeof candidates)[number]) =>
      createHash('sha256')
        .update(
          JSON.stringify([
            actor.internalUserId,
            actor.workspaceId,
            actor.workspaceMembershipId,
            company.id,
            candidate.bundle,
            candidate.assignmentId,
            candidate.version,
            company.projectPermissionAssignmentId,
            company.projectPermissionSetVersion,
            company.workingEvidenceContextCapture,
            company.workingEvidenceClientReadCapture,
          ]),
        )
        .digest('hex');
    const selected =
      !options.record && options.readCapture !== undefined
        ? candidates.find(
            (candidate) => readCaptureFor(candidate) === options.readCapture,
          )
        : candidates[0];
    if (!selected) throw new ForbiddenException();
    await this.requireWorkingEvidenceNativeCaptures(
      actor,
      options.lockAssignment,
    );
    await this.requireCapturedCompanyGrant(actor, {
      ...selected,
      versions: ['v1'],
      lock: options.lockAssignment,
    });
    await this.requirePermissions(actor, {
      permissions: ['project.read'],
      lock: options.lockAssignment,
    });
    return { companyId: company.id, readCapture: readCaptureFor(selected) };
  }

  /** Exact native family captures; no Case, Project or formal Audit authority is implied. */
  async requireReceivedAuditSourceNativeAccess(
    actor: ActorContext,
    options: {
      action:
        | 'read'
        | 'reference'
        | 'register'
        | 'correct'
        | 'version'
        | 'designate'
        | 'content-read'
        | 'upload';
      lockAssignment: boolean;
    },
  ): Promise<string> {
    const company = actor.activeCompany;
    if (
      !company?.documentPermissions?.includes(
        'document.received_audit_source.access',
      )
    )
      throw new ForbiddenException();
    await this.requireWorkingEvidenceNativeCaptures(
      actor,
      options.lockAssignment,
    );
    await this.requireCapturedCompanyGrant(actor, {
      bundle: COMPANY_RECEIVED_AUDIT_SOURCE_ACCESS_BUNDLE,
      assignmentId: company.receivedAuditSourceAccessAssignmentId,
      version: company.receivedAuditSourceAccessPermissionSetVersion,
      versions: ['v1'],
      lock: options.lockAssignment,
    });
    return this.requireDocumentFamilyNativeAccess(
      actor,
      {
        ...options,
        action: options.action === 'reference' ? 'read' : options.action,
      },
      true,
    );
  }

  async hasReceivedAuditSourceAccess(
    actor: ActorContext,
    options: { lockAssignment: boolean } = { lockAssignment: false },
  ): Promise<boolean> {
    try {
      await this.requireReceivedAuditSourceNativeAccess(actor, {
        ...options,
        action: 'read',
      });
      return true;
    } catch (error) {
      if (error instanceof ForbiddenException) return false;
      throw error;
    }
  }

  private async requireWorkingEvidenceNativeCaptures(
    actor: ActorContext,
    lock: boolean,
  ): Promise<void> {
    const company = actor.activeCompany;
    if (!company) throw new ForbiddenException();
    const observed = await readWorkingEvidenceCaptures({
      database: this.databaseContext,
      actor,
      company,
      lock,
      expected: {
        contextCapture: company.workingEvidenceContextCapture,
        clientReadCapture: company.workingEvidenceClientReadCapture,
      },
    });
    if (
      !observed ||
      observed.contextCapture !== company.workingEvidenceContextCapture ||
      observed.clientReadCapture !== company.workingEvidenceClientReadCapture
    )
      throw new ForbiddenException();
  }

  async requireReceivedAddendumNativeAccess(
    actor: ActorContext,
    options: {
      action:
        | 'read'
        | 'register'
        | 'correct'
        | 'version'
        | 'designate'
        | 'content-read'
        | 'upload';
      lockAssignment: boolean;
    },
  ): Promise<string> {
    return this.requireDocumentFamilyNativeAccess(actor, options, false);
  }

  /** Exact independent native grants; parent and financial authority stay with their owners. */
  private async requireDocumentFamilyNativeAccess(
    actor: ActorContext,
    options: {
      action:
        | 'read'
        | 'register'
        | 'correct'
        | 'version'
        | 'designate'
        | 'content-read'
        | 'upload';
      lockAssignment: boolean;
    },
    requireClientRead: boolean,
  ): Promise<string> {
    const company = actor.activeCompany;
    if (
      !actor.active ||
      !company ||
      !company.documentPermissions?.includes('document.read')
    )
      throw new ForbiddenException();
    await this.requireLiveCompanyContext(
      actor,
      company.id,
      options.lockAssignment,
    );
    const requireCapture = (input: {
      bundle: typeof companyRoleAssignments.$inferSelect.bundle;
      assignmentId: unknown;
      version: unknown;
      versions: readonly string[];
    }) =>
      this.requireCapturedCompanyGrant(actor, {
        ...input,
        lock: options.lockAssignment,
      });
    const versions =
      options.action === 'version' || options.action === 'upload'
        ? ['v3']
        : options.action === 'correct'
          ? ['v2', 'v3']
          : ['v1', 'v2', 'v3'];
    await requireCapture({
      bundle: COMPANY_DOCUMENT_REGISTRAR_BUNDLE,
      assignmentId: company.documentPermissionAssignmentId,
      version: company.documentPermissionSetVersion,
      versions,
    });
    if (requireClientRead)
      await this.requireExternalInvoiceClientRead(
        actor,
        options.lockAssignment,
      );
    if (
      options.action === 'register' &&
      !company.documentPermissions.includes('document.register')
    )
      throw new ForbiddenException();
    if (
      options.action === 'correct' &&
      !company.documentPermissions.includes('document.correct')
    )
      throw new ForbiddenException();
    if (
      (options.action === 'version' || options.action === 'upload') &&
      !company.documentPermissions.includes('document.version.manage')
    )
      throw new ForbiddenException();
    if (options.action === 'designate') {
      if (
        !company.documentPermissions.includes(
          'document.version.designate_official',
        )
      )
        throw new ForbiddenException();
      await requireCapture({
        bundle: COMPANY_DOCUMENT_APPROVER_BUNDLE,
        assignmentId: company.documentApproverAssignmentId,
        version: company.documentApproverPermissionSetVersion,
        versions: ['v1'],
      });
    }
    if (options.action === 'content-read' || options.action === 'upload') {
      if (!company.documentPermissions.includes('document.content.read'))
        throw new ForbiddenException();
      await requireCapture({
        bundle: COMPANY_DOCUMENT_CONTENT_READER_BUNDLE,
        assignmentId: company.documentContentReaderAssignmentId,
        version: company.documentContentReaderPermissionSetVersion,
        versions: ['v1'],
      });
    }
    if (options.action === 'upload') {
      if (!company.documentPermissions.includes('document.content.upload'))
        throw new ForbiddenException();
      await requireCapture({
        bundle: COMPANY_DOCUMENT_CONTENT_UPLOADER_BUNDLE,
        assignmentId: company.documentContentUploaderAssignmentId,
        version: company.documentContentUploaderPermissionSetVersion,
        versions: ['v1'],
      });
    }
    return company.id;
  }
  /** Finance and family captures remain independent from every ordinary native Document grant. */
  async hasExternalInvoiceAccess(
    actor: ActorContext,
    options: { manage: boolean; lockAssignment: boolean } = {
      manage: false,
      lockAssignment: false,
    },
  ): Promise<boolean> {
    const company = actor.activeCompany;
    if (!actor.active || !company) return false;
    const captured = externalInvoiceCapturedAuthority(
      company.externalInvoiceGrants,
      options,
    );
    if (!captured) return false;
    try {
      await this.requireLiveCompanyContext(
        actor,
        company.id,
        options.lockAssignment,
      );
      await this.requirePermissions(actor, {
        permissions: ['document.external_invoice.access'],
        assignmentId: captured.family.assignmentId,
        lock: options.lockAssignment,
      });
      await this.requirePermissions(actor, {
        permissions: [options.manage ? 'finance.manage' : 'finance.read'],
        lock: options.lockAssignment,
      });
      return true;
    } catch (error) {
      if (error instanceof ForbiddenException) return false;
      throw error;
    }
  }

  async hasReceivedAddendumAccess(
    actor: ActorContext,
    options: { lockAssignment: boolean } = { lockAssignment: false },
  ): Promise<boolean> {
    const condition = receivedAddendumAssignment(actor);
    if (!condition || !actor.activeCompany) return false;
    const capture = await receivedAddendumClientReadCapture({
      database: this.databaseContext,
      actor,
      company: actor.activeCompany,
      lock: options.lockAssignment,
    });
    if (capture !== actor.activeCompany.receivedAddendumClientReadCapture)
      return false;
    return this.hasPermissions(actor, {
      permissions: ['document.received_addendum.access'],
      lock: options.lockAssignment,
    });
  }

  private async requireLiveCapturedAssignment(
    actor: ActorContext,
    companyId: string,
    grants: readonly CapturedCompanyGrant[],
    lock: boolean,
    // Which joined rows a locked read share-locks: every row, or only the
    // assignment, membership and Internal User rows of the actor.
    lockedRows: 'all-rows' | 'member-rows' = 'all-rows',
  ): Promise<string> {
    if (!grants.length) throw new ForbiddenException();
    const assignment = alias(companyRoleAssignments, 'a');
    const member = alias(workspaceMemberships, 'm');
    const user = alias(internalUsers, 'u');
    const company = alias(companies, 'c');
    const query = this.databaseContext.connection
      .select({ id: assignment.id })
      .from(assignment)
      .innerJoin(
        member,
        and(
          eq(member.workspaceId, assignment.workspaceId),
          eq(member.id, assignment.workspaceMembershipId),
          eq(member.status, 'active'),
        ),
      )
      .innerJoin(
        user,
        and(
          eq(user.id, member.internalUserId),
          eq(user.id, actor.internalUserId),
          eq(user.status, 'active'),
        ),
      )
      .innerJoin(
        company,
        and(
          eq(company.workspaceId, assignment.workspaceId),
          eq(company.id, assignment.companyId),
          eq(company.status, 'active'),
        ),
      )
      .where(
        and(
          eq(assignment.workspaceId, actor.workspaceId),
          eq(assignment.workspaceMembershipId, actor.workspaceMembershipId),
          eq(assignment.companyId, companyId),
          capturedAssignmentsCondition(grants, assignment),
          isNull(assignment.revokedAt),
        ),
      )
      .orderBy(assignment.id)
      .limit(1);
    const rows = !lock
      ? await query
      : lockedRows === 'member-rows'
        ? await query.for('share', {
            of: [assignment, member, user],
          })
        : await query.for('share');
    if (rows.length === 0) throw new ForbiddenException();
    const selected = rows[0];
    if (!selected) throw new ForbiddenException();
    return selected.id;
  }

  private async requireLiveCompanyContext(
    actor: ActorContext,
    companyId: string,
    lock: boolean,
  ): Promise<CapturedCompanyGrant | undefined> {
    if (actor.workspacePermissions.includes('company.manage')) {
      const managerQuery = this.databaseContext.connection
        .select({ id: workspacePermissionGrants.id })
        .from(workspacePermissionGrants)
        .where(
          and(
            eq(workspacePermissionGrants.workspaceId, actor.workspaceId),
            eq(
              workspacePermissionGrants.workspaceMembershipId,
              actor.workspaceMembershipId,
            ),
            eq(workspacePermissionGrants.permission, 'company.manage'),
          ),
        );
      const managerGrants = lock
        ? await managerQuery.for('share')
        : await managerQuery;
      if (managerGrants.length > 0) return;
    }

    const captured = capturedCompanyGrants(actor).filter((grant) =>
      COMPANY_CONTEXT_CONFERRING_BUNDLES.some(
        (bundle) => bundle === grant.bundle,
      ),
    );
    if (!captured.length) throw new ForbiddenException();
    const selected = await this.requireLiveCapturedAssignment(
      actor,
      companyId,
      captured,
      lock,
      'member-rows',
    );
    return captured.find((grant) => grant.assignmentId === selected);
  }

  private async findActiveCompany(
    workspaceId: string,
    companyId: string,
  ): Promise<ActiveCompanyContext | undefined> {
    const [company] = await this.databaseContext.connection
      .select({ id: companies.id, displayName: companies.displayName })
      .from(companies)
      .where(
        and(
          eq(companies.workspaceId, workspaceId),
          eq(sql<string>`${companies.id}::text`, companyId),
          eq(companies.status, 'active'),
        ),
      )
      .limit(1);
    return company ? { ...company, clientPermissions: [] } : undefined;
  }

  private async findAssignedActiveCompanies(
    actor: ActorContext,
    companyId?: string,
  ): Promise<readonly ActiveCompanyContext[]> {
    const conditions = [
      eq(companyRoleAssignments.workspaceId, actor.workspaceId),
      eq(
        companyRoleAssignments.workspaceMembershipId,
        actor.workspaceMembershipId,
      ),
      isNull(companyRoleAssignments.revokedAt),
      eq(companies.status, 'active' as const),
    ];
    if (companyId !== undefined) {
      conditions.push(eq(sql<string>`${companies.id}::text`, companyId));
    }
    const rows = await this.databaseContext.connection
      .select({
        id: companies.id,
        displayName: companies.displayName,
        bundle: companyRoleAssignments.bundle,
        assignmentId: companyRoleAssignments.id,
        permissionSetVersion: companyRoleAssignments.permissionSetVersion,
      })
      .from(companyRoleAssignments)
      .innerJoin(
        companies,
        and(
          eq(companies.workspaceId, companyRoleAssignments.workspaceId),
          eq(companies.id, companyRoleAssignments.companyId),
        ),
      )
      .where(and(...conditions));
    const companiesById = new Map<string, ActiveCompanyContext>();
    const projections = new Map<string, Readonly<Record<string, unknown>>>();
    const independentlyAuthorizedCompanies = new Set<string>();
    for (const row of rows) {
      const existing = companiesById.get(row.id);
      const company: ActiveCompanyContext = existing ?? {
        id: row.id,
        displayName: row.displayName,
        clientPermissions: [],
      };
      const before = { ...company };
      if (
        row.bundle === COMPANY_OPPORTUNITY_FOLLOW_UP_COORDINATOR_BUNDLE &&
        row.permissionSetVersion === 'v1'
      ) {
        company.opportunityFollowUpPermissions = [
          ...opportunityFollowUpPermissionsFor(row.permissionSetVersion),
        ];
        company.opportunityFollowUpCoordinatorAssignmentId = row.assignmentId;
        company.opportunityFollowUpCoordinatorPermissionSetVersion = 'v1';
      }
      if (
        row.bundle === COMPANY_CONTRACT_SIGNATURE_DECLARER_BUNDLE &&
        row.permissionSetVersion === 'v1'
      ) {
        company.contractSignatureDeclarerAssignmentId = row.assignmentId;
        company.contractSignatureDeclarerPermissionSetVersion = 'v1';
      }
      if (
        row.bundle === COMPANY_INTERNAL_TASK_MANAGER_BUNDLE &&
        row.permissionSetVersion === 'v1'
      ) {
        company.internalTaskPermissions = [
          ...internalTaskPermissionsFor(row.permissionSetVersion),
        ];
        company.internalTaskManagerAssignmentId = row.assignmentId;
        company.internalTaskManagerPermissionSetVersion = 'v1';
      }
      const paymentGrant = capturePaymentGrant(row);
      if (paymentGrant)
        company.paymentGrants = [
          ...(company.paymentGrants ?? []),
          paymentGrant,
        ];
      const externalInvoiceGrant = captureExternalInvoiceGrant(row);
      if (externalInvoiceGrant)
        company.externalInvoiceGrants = [
          ...(company.externalInvoiceGrants ?? []),
          externalInvoiceGrant,
        ];
      const knowledgeGrant = captureKnowledgeGrant(row);
      if (knowledgeGrant)
        company.knowledgeGrants = [
          ...(company.knowledgeGrants ?? []),
          knowledgeGrant,
        ];
      Object.assign(company, projectIdeasAssignment(row));
      Object.assign(company, projectCertificationAssignment(row));
      const planGrant = captureMissionPlanGrant(row);
      if (planGrant)
        company.missionPlanGrants = [
          ...(company.missionPlanGrants ?? []),
          planGrant,
        ];
      const modelGrant = captureOfferModelGrant(row);
      if (modelGrant)
        company.offerModelGrants = [
          ...(company.offerModelGrants ?? []),
          modelGrant,
        ];
      const contractModelGrant = captureContractModelGrant(row);
      if (contractModelGrant)
        company.contractModelGrants = [
          ...(company.contractModelGrants ?? []),
          contractModelGrant,
        ];
      if (row.bundle === COMPANY_DIRECTOR_CLIENT_ACCESS_BUNDLE) {
        if (
          row.permissionSetVersion !== 'v1' &&
          row.permissionSetVersion !== 'v2'
        ) {
          continue;
        }
        const clientPermissions = companyDirectorClientPermissionsFor(
          row.permissionSetVersion,
        );
        company.clientPermissions = [...clientPermissions];
        company.clientPermissionAssignmentId = row.assignmentId;
        company.clientPermissionSetVersion = row.permissionSetVersion;
      }
      if (
        row.bundle === COMPANY_DOCUMENT_PROJECT_ORGANIZER_BUNDLE &&
        row.permissionSetVersion === 'v1'
      ) {
        company.documentPermissions = [
          ...(company.documentPermissions ?? []),
          'document.project.manage',
        ];
      }
      // Like the Organizer, the Approver contributes only its designation
      // permission and never Company context.
      if (
        row.bundle === COMPANY_DOCUMENT_APPROVER_BUNDLE &&
        row.permissionSetVersion === 'v1'
      ) {
        company.documentPermissions = [
          ...(company.documentPermissions ?? []),
          ...documentApproverPermissionsFor(row.permissionSetVersion),
        ];
        company.documentApproverAssignmentId = row.assignmentId;
        company.documentApproverPermissionSetVersion = 'v1';
      }
      if (
        row.bundle === COMPANY_DOCUMENT_CONTENT_READER_BUNDLE &&
        row.permissionSetVersion === 'v1'
      ) {
        company.documentPermissions = [
          ...(company.documentPermissions ?? []),
          'document.content.read',
        ];
        company.documentContentReaderAssignmentId = row.assignmentId;
        company.documentContentReaderPermissionSetVersion = 'v1';
      }
      if (
        row.bundle === COMPANY_DOCUMENT_CONTENT_UPLOADER_BUNDLE &&
        row.permissionSetVersion === 'v1'
      ) {
        company.documentPermissions = [
          ...(company.documentPermissions ?? []),
          'document.content.upload',
        ];
        company.documentContentUploaderAssignmentId = row.assignmentId;
        company.documentContentUploaderPermissionSetVersion = 'v1';
      }
      if (
        row.bundle === COMPANY_MISSION_DELIVERABLE_ACCESS_BUNDLE &&
        row.permissionSetVersion === 'v1'
      ) {
        company.documentPermissions = [
          ...(company.documentPermissions ?? []),
          ...missionDeliverablePermissionsFor(row.permissionSetVersion),
        ];
        company.missionDeliverableAccessAssignmentId = row.assignmentId;
        company.missionDeliverableAccessPermissionSetVersion = 'v1';
      }
      if (
        row.bundle === COMPANY_RECEIVED_CONTRACT_ACCESS_BUNDLE &&
        row.permissionSetVersion === 'v1'
      ) {
        company.documentPermissions = [
          ...(company.documentPermissions ?? []),
          ...receivedContractPermissionsFor(row.permissionSetVersion),
        ];
        company.receivedContractAccessAssignmentId = row.assignmentId;
        company.receivedContractAccessPermissionSetVersion = 'v1';
      }
      if (
        row.bundle === COMPANY_WORKING_EVIDENCE_CASE_READER_BUNDLE &&
        row.permissionSetVersion === 'v1'
      ) {
        company.workingEvidenceCasePermissions = [
          ...new Set([
            ...(company.workingEvidenceCasePermissions ?? []),
            ...workingEvidenceCaseReaderPermissionsFor(
              row.permissionSetVersion,
            ),
          ]),
        ];
        company.workingEvidenceCaseReaderAssignmentId = row.assignmentId;
        company.workingEvidenceCaseReaderPermissionSetVersion = 'v1';
      }
      if (
        row.bundle === COMPANY_WORKING_EVIDENCE_CASE_RECORDER_BUNDLE &&
        row.permissionSetVersion === 'v1'
      ) {
        company.workingEvidenceCasePermissions = [
          ...new Set([
            ...(company.workingEvidenceCasePermissions ?? []),
            ...workingEvidenceCaseRecorderPermissionsFor(
              row.permissionSetVersion,
            ),
          ]),
        ];
        company.workingEvidenceCaseRecorderAssignmentId = row.assignmentId;
        company.workingEvidenceCaseRecorderPermissionSetVersion = 'v1';
      }
      if (
        row.bundle === COMPANY_RECEIVED_AUDIT_SOURCE_ACCESS_BUNDLE &&
        row.permissionSetVersion === 'v1'
      ) {
        company.documentPermissions = [
          ...(company.documentPermissions ?? []),
          ...receivedAuditSourcePermissionsFor(row.permissionSetVersion),
        ];
        company.receivedAuditSourceAccessAssignmentId = row.assignmentId;
        company.receivedAuditSourceAccessPermissionSetVersion = 'v1';
      }
      if (
        row.bundle === COMPANY_RECEIVED_ADDENDUM_ACCESS_BUNDLE &&
        row.permissionSetVersion === 'v1'
      ) {
        company.documentPermissions = [
          ...(company.documentPermissions ?? []),
          ...receivedAddendumPermissionsFor(row.permissionSetVersion),
        ];
        company.receivedAddendumAccessAssignmentId = row.assignmentId;
        company.receivedAddendumAccessPermissionSetVersion = 'v1';
      }
      if (
        row.bundle === COMPANY_TASK_RESULT_RECORDER_BUNDLE &&
        row.permissionSetVersion === 'v1'
      ) {
        company.taskResultPermissions = [
          ...taskResultPermissionsFor(row.permissionSetVersion),
        ];
        company.taskResultRecorderAssignmentId = row.assignmentId;
        company.taskResultRecorderPermissionSetVersion = 'v1';
      }
      if (
        row.bundle === COMPANY_MISSION_APPLICABILITY_APPROVER_BUNDLE &&
        row.permissionSetVersion === 'v1'
      ) {
        company.missionApplicabilityDecisionPermissions = [
          'project.mission_applicability.decide',
          'project.mission_applicability.restore',
        ];
        company.missionApplicabilityApproverAssignmentId = row.assignmentId;
        company.missionApplicabilityApproverPermissionSetVersion = 'v1';
      }
      if (
        row.bundle === COMPANY_PROJECT_NEXT_ACTION_COORDINATOR_BUNDLE &&
        row.permissionSetVersion === 'v1'
      ) {
        company.projectNextActionPermissions = ['project.next_action.update'];
        company.projectNextActionCoordinatorAssignmentId = row.assignmentId;
        company.projectNextActionCoordinatorPermissionSetVersion = 'v1';
      }
      if (
        row.bundle === COMPANY_MISSION_APPLICABILITY_COORDINATOR_BUNDLE &&
        row.permissionSetVersion === 'v1'
      ) {
        company.missionApplicabilityProposalPermissions = [
          'project.mission_applicability.propose',
        ];
        company.missionApplicabilityCoordinatorAssignmentId = row.assignmentId;
        company.missionApplicabilityCoordinatorPermissionSetVersion = 'v1';
      }
      if (
        row.bundle === COMPANY_MISSION_RESULT_REVIEWER_BUNDLE &&
        row.permissionSetVersion === 'v1'
      ) {
        company.missionResultReviewPermissions = [
          ...missionResultReviewPermissionsFor(row.permissionSetVersion),
        ];
        company.missionResultReviewerAssignmentId = row.assignmentId;
        company.missionResultReviewerPermissionSetVersion = 'v1';
      }
      if (row.bundle === COMPANY_DOCUMENT_REGISTRAR_BUNDLE) {
        if (!isDocumentPermissionSetVersion(row.permissionSetVersion)) continue;
        const permissions = documentPermissionsFor(row.permissionSetVersion);
        company.documentPermissions = [
          ...(company.documentPermissions ?? []),
          ...permissions,
        ];
        company.documentPermissionSetVersion = row.permissionSetVersion;
        company.documentPermissionAssignmentId = row.assignmentId;
      }
      if (
        row.bundle === COMPANY_PROJECT_ACCESS_BUNDLE &&
        isProjectPermissionSetVersion(row.permissionSetVersion)
      ) {
        company.projectPermissions = [
          ...projectPermissionsFor(row.permissionSetVersion),
        ];
        company.projectPermissionAssignmentId = row.assignmentId;
        company.projectPermissionSetVersion = row.permissionSetVersion;
      }
      if (
        row.bundle === COMPANY_TASK_MANAGER_BUNDLE &&
        row.permissionSetVersion === 'v1'
      ) {
        company.taskPermissions = [
          ...taskPermissionsFor(row.permissionSetVersion),
        ];
        company.taskPermissionAssignmentId = row.assignmentId;
        company.taskPermissionSetVersion = 'v1';
      }
      if (
        row.bundle === COMPANY_COMMERCIAL_INTAKE_BUNDLE &&
        isCommercialIntakePermissionSetVersion(row.permissionSetVersion)
      ) {
        company.commercialIntakePermissions = [
          ...commercialIntakePermissionsFor(row.permissionSetVersion),
        ];
        company.commercialIntakePermissionAssignmentId = row.assignmentId;
        company.commercialIntakePermissionSetVersion = row.permissionSetVersion;
      }
      if (
        row.bundle === COMPANY_PROFITABILITY_CONTRIBUTOR_BUNDLE &&
        row.permissionSetVersion === 'v1'
      ) {
        company.profitabilityContributorPermissions = [
          ...profitabilityContributorPermissionsFor(row.permissionSetVersion),
        ];
        company.profitabilityContributorPermissionAssignmentId =
          row.assignmentId;
        company.profitabilityContributorPermissionSetVersion = 'v1';
      }
      if (
        row.bundle === COMPANY_PROFITABILITY_DIRECTOR_BUNDLE &&
        row.permissionSetVersion === 'v1'
      ) {
        company.profitabilityDirectorPermissions = [
          ...profitabilityDirectorPermissionsFor(row.permissionSetVersion),
        ];
        company.profitabilityDirectorPermissionAssignmentId = row.assignmentId;
        company.profitabilityDirectorPermissionSetVersion = 'v1';
      }
      if (
        row.bundle === COMPANY_OPERATIONAL_RISK_READER_BUNDLE &&
        row.permissionSetVersion === 'v1'
      ) {
        company.operationalRiskPermissions = [
          ...(company.operationalRiskPermissions ?? []),
          ...operationalRiskReaderPermissionsFor(row.permissionSetVersion),
        ];
        company.operationalRiskReaderAssignmentId = row.assignmentId;
        company.operationalRiskReaderPermissionSetVersion = 'v1';
      }
      if (
        row.bundle === COMPANY_OPERATIONAL_RISK_RECORDER_BUNDLE &&
        row.permissionSetVersion === 'v1'
      ) {
        company.operationalRiskPermissions = [
          ...(company.operationalRiskPermissions ?? []),
          ...operationalRiskRecorderPermissionsFor(row.permissionSetVersion),
        ];
        company.operationalRiskRecorderAssignmentId = row.assignmentId;
        company.operationalRiskRecorderPermissionSetVersion = 'v1';
      }
      // The reader bundle carries Activity read only. It never contributes
      // Company context, so it is resolved but not authorizing.
      if (
        row.bundle === COMPANY_COMMERCIAL_ACTIVITY_READER_BUNDLE &&
        row.permissionSetVersion === 'v1'
      ) {
        company.commercialActivityPermissions = [
          ...commercialActivityPermissionsFor(row.permissionSetVersion),
        ];
        company.commercialActivityPermissionSetVersion = 'v1';
      }
      // The manager bundle carries reassignment and, from v2, the outcome
      // status change. It never contributes Company context; its
      // prerequisites are evaluated separately.
      if (
        row.bundle === COMPANY_OPPORTUNITY_MANAGER_BUNDLE &&
        isOpportunityManagerPermissionSetVersion(row.permissionSetVersion)
      ) {
        company.opportunityManagerPermissions = [
          ...opportunityManagerPermissionsFor(row.permissionSetVersion),
        ];
        company.opportunityManagerPermissionAssignmentId = row.assignmentId;
        company.opportunityManagerPermissionSetVersion =
          row.permissionSetVersion;
      }
      if (
        row.bundle === COMPANY_PROJECT_STAGE_ADVANCER_BUNDLE &&
        row.permissionSetVersion === 'v1'
      ) {
        company.projectStagePermissions = [
          ...projectStagePermissionsFor(row.permissionSetVersion),
        ];
        company.projectStagePermissionAssignmentId = row.assignmentId;
        company.projectStagePermissionSetVersion = 'v1';
      }
      if (
        row.bundle === COMPANY_PROJECT_TEMPLATE_USER_BUNDLE &&
        (row.permissionSetVersion === 'v1' || row.permissionSetVersion === 'v2')
      ) {
        company.projectTemplatePermissions = [
          ...projectTemplatePermissionsFor(row.permissionSetVersion),
        ];
        company.projectTemplatePermissionAssignmentId = row.assignmentId;
        company.projectTemplatePermissionSetVersion = row.permissionSetVersion;
      }
      if (
        row.bundle === COMPANY_PROJECT_TEMPLATE_CONFIGURATION_BUNDLE &&
        row.permissionSetVersion === 'v1'
      ) {
        company.projectTemplateConfigurationPermissions = [
          ...projectTemplateConfigurationPermissionsFor(
            row.permissionSetVersion,
          ),
        ];
        company.projectTemplateConfigurationPermissionAssignmentId =
          row.assignmentId;
        company.projectTemplateConfigurationPermissionSetVersion = 'v1';
      }
      // The configuration bundle carries Sales Stage configuration only. It
      // never contributes Company context; its prerequisites are evaluated
      // separately.
      if (
        row.bundle === COMPANY_SALES_STAGE_CONFIGURATION_BUNDLE &&
        row.permissionSetVersion === 'v1'
      ) {
        company.salesStageConfigurationPermissions = [
          ...salesStageConfigurationPermissionsFor(row.permissionSetVersion),
        ];
        company.salesStageConfigurationPermissionAssignmentId =
          row.assignmentId;
        company.salesStageConfigurationPermissionSetVersion = 'v1';
      }
      if (
        row.bundle === COMPANY_SERVICE_CATALOGUE_BUNDLE &&
        row.permissionSetVersion === 'v1'
      ) {
        company.serviceCataloguePermissions = [
          ...serviceCataloguePermissionsFor(row.permissionSetVersion),
        ];
        company.serviceCataloguePermissionAssignmentId = row.assignmentId;
        company.serviceCataloguePermissionSetVersion = 'v1';
      }
      // Configuration contributes its captured permissions only; like the
      // catalogue bundle it never authorizes Company context by itself.
      if (
        row.bundle === COMPANY_PRICING_CONFIGURATION_BUNDLE &&
        row.permissionSetVersion === 'v1'
      ) {
        company.pricingConfigurationPermissions = [
          ...pricingConfigurationPermissionsFor(row.permissionSetVersion),
        ];
        company.pricingConfigurationPermissionAssignmentId = row.assignmentId;
        company.pricingConfigurationPermissionSetVersion = 'v1';
      }
      // The approver contributes its captured lifecycle permissions only; it
      // never authorizes Company context or Project read by itself.
      if (
        row.bundle === COMPANY_PROJECT_APPROVER_BUNDLE &&
        row.permissionSetVersion === 'v1'
      ) {
        company.projectApproverPermissions = [
          ...projectApproverPermissionsFor(row.permissionSetVersion),
        ];
        company.projectApproverPermissionAssignmentId = row.assignmentId;
        company.projectApproverPermissionSetVersion = 'v1';
      }
      // Pricing User likewise contributes its captured permissions only and
      // never authorizes Company context by itself.
      if (
        row.bundle === COMPANY_PRICING_USER_BUNDLE &&
        row.permissionSetVersion === 'v1'
      ) {
        company.pricingUserPermissions = [
          ...pricingUserPermissionsFor(row.permissionSetVersion),
        ];
        company.pricingUserPermissionAssignmentId = row.assignmentId;
        company.pricingUserPermissionSetVersion = 'v1';
      }
      // Pricing Adjustment contributes only its one apply permission and
      // never authorizes Company context by itself.
      if (
        row.bundle === COMPANY_PRICING_ADJUSTMENT_BUNDLE &&
        row.permissionSetVersion === 'v1'
      ) {
        company.pricingAdjustmentPermissions = [
          ...pricingAdjustmentPermissionsFor(row.permissionSetVersion),
        ];
        company.pricingAdjustmentPermissionAssignmentId = row.assignmentId;
        company.pricingAdjustmentPermissionSetVersion = 'v1';
      }
      if (
        row.bundle === COMPANY_OFFER_PREPARER_BUNDLE &&
        (row.permissionSetVersion === 'v1' ||
          row.permissionSetVersion === 'v2' ||
          row.permissionSetVersion === 'v3')
      ) {
        company.offerPermissions = [
          ...(company.offerPermissions ?? []),
          ...offerPreparerPermissionsFor(row.permissionSetVersion),
        ];
        company.offerPermissionAssignmentId = row.assignmentId;
        company.offerPermissionSetVersion = row.permissionSetVersion;
      }
      if (
        row.bundle === COMPANY_CONTRACT_PREPARER_BUNDLE &&
        (row.permissionSetVersion === 'v1' || row.permissionSetVersion === 'v2')
      ) {
        company.contractPermissions = [
          ...(company.contractPermissions ?? []),
          ...contractPreparerPermissionsFor(row.permissionSetVersion),
        ];
        company.contractPermissionAssignmentId = row.assignmentId;
        company.contractPermissionSetVersion = row.permissionSetVersion;
      }
      if (
        row.bundle === COMPANY_CONTRACT_EARLY_PREPARATION_BUNDLE &&
        row.permissionSetVersion === 'v1'
      ) {
        company.contractPermissions = [
          ...(company.contractPermissions ?? []),
          ...contractEarlyPreparationPermissionsFor(row.permissionSetVersion),
        ];
        company.contractEarlyPreparationAssignmentId = row.assignmentId;
        company.contractEarlyPreparationPermissionSetVersion = 'v1';
      }
      if (
        row.bundle === COMPANY_CONTRACT_APPROVER_BUNDLE &&
        (row.permissionSetVersion === 'v1' || row.permissionSetVersion === 'v2')
      ) {
        company.contractPermissions = [
          ...(company.contractPermissions ?? []),
          ...contractApproverPermissionsFor(row.permissionSetVersion),
        ];
        company.contractApproverAssignmentId = row.assignmentId;
        company.contractApproverPermissionSetVersion = row.permissionSetVersion;
      }
      if (
        row.bundle === COMPANY_OFFER_APPROVER_BUNDLE &&
        (row.permissionSetVersion === 'v1' || row.permissionSetVersion === 'v2')
      ) {
        company.offerPermissions = [
          ...(company.offerPermissions ?? []),
          ...offerApproverPermissionsFor(row.permissionSetVersion),
        ];
        company.offerApproverAssignmentId = row.assignmentId;
        company.offerApproverPermissionSetVersion = row.permissionSetVersion;
      }
      if (
        COMPANY_CONTEXT_CONFERRING_BUNDLES.some(
          (bundle) => row.bundle === bundle,
        )
      ) {
        independentlyAuthorizedCompanies.add(row.id);
      }
      projections.set(
        row.assignmentId,
        captureGrantProjection({ before, after: company, grant: row }),
      );
      companiesById.set(row.id, company);
    }
    // Organizer contributes only its mutation permission. Company context must
    // already follow from another assignment or Workspace Company management.
    const authorizedCompanies = [...companiesById.values()].filter(
      (company) =>
        actor.workspacePermissions.includes('company.manage') ||
        independentlyAuthorizedCompanies.has(company.id),
    );
    for (const company of authorizedCompanies) {
      if (
        company.workingEvidenceCaseReaderAssignmentId ||
        company.workingEvidenceCaseRecorderAssignmentId ||
        company.receivedAuditSourceAccessAssignmentId
      ) {
        const captures = await readWorkingEvidenceCaptures({
          database: this.databaseContext,
          actor,
          company,
          lock: false,
        });
        if (captures) {
          company.workingEvidenceClientReadCapture = captures.clientReadCapture;
          company.workingEvidenceContextCapture = captures.contextCapture;
        }
      }
      if (company.receivedAddendumAccessAssignmentId)
        company.receivedAddendumClientReadCapture =
          await receivedAddendumClientReadCapture({
            database: this.databaseContext,
            actor,
            company,
            lock: false,
          });
      if (
        company.offerPermissions?.includes('commercial.offer.read') &&
        COMMERCIAL_INTAKE_READ_PERMISSIONS.every((permission) =>
          company.commercialIntakePermissions?.includes(permission),
        )
      ) {
        const observation = await readOfferMessageReadCapture({
          database: this.databaseContext,
          actor,
          companyId: company.id,
          lock: false,
        });
        if (observation)
          company.offerMessageReadCapture = observation.readCapture;
      }
      if (company.paymentGrants?.length) {
        const observations = await readPaymentEvidenceCaptures({
          database: this.databaseContext,
          actor,
          companyId: company.id,
          lock: false,
        });
        company.paymentEvidenceContextCapture = observations.contextCapture;
        company.paymentEvidenceReferenceReadCapture =
          observations.referenceReadCapture;
      }
      const paymentRead = paymentReadGrant(company.paymentGrants);
      if (paymentRead) {
        const contexts = await this.opportunityFollowUpContextIdentities(
          actor,
          company.id,
          false,
        );
        if (paymentObservationContext(contexts)) {
          company.paymentObservationContextCapture =
            paymentObservationContextCapture(actor, company.id, contexts);
          company.paymentObservationReadCapture = paymentObservationReadCapture(
            actor,
            company.id,
            paymentRead.assignmentId,
            contexts,
          );
        }
      }
      const invoiceGrant = invoiceFinanceCapturedGrant(
        company.externalInvoiceGrants,
        false,
      );
      if (invoiceGrant) {
        const contexts = await this.opportunityFollowUpContextIdentities(
          actor,
          company.id,
          false,
        );
        if (contexts.length > 0)
          company.invoiceRecordReadCapture = invoiceRecordReadCapture(
            actor,
            company.id,
            invoiceGrant.assignmentId,
            contexts,
          );
      }

      if (
        company.opportunityFollowUpCoordinatorAssignmentId &&
        company.opportunityFollowUpCoordinatorPermissionSetVersion === 'v1' &&
        company.commercialIntakePermissionAssignmentId &&
        isCommercialIntakePermissionSetVersion(
          company.commercialIntakePermissionSetVersion,
        ) &&
        COMMERCIAL_INTAKE_READ_PERMISSIONS.every((permission) =>
          company.commercialIntakePermissions?.includes(permission),
        )
      ) {
        const contextIdentities =
          await this.opportunityFollowUpContextIdentities(
            actor,
            company.id,
            false,
          );
        if (contextIdentities.length > 0)
          company.opportunityFollowUpReadCapture =
            opportunityFollowUpReadCapture({
              workspaceId: actor.workspaceId,
              workspaceMembershipId: actor.workspaceMembershipId,
              companyId: company.id,
              assignmentId: company.opportunityFollowUpCoordinatorAssignmentId,
              nativeAssignmentId:
                company.commercialIntakePermissionAssignmentId,
              nativePermissionSetVersion:
                company.commercialIntakePermissionSetVersion,
              contextIdentities,
            });
      }
    }
    for (const company of authorizedCompanies)
      captureCompanyPermissions({
        actor,
        company,
        grants: rows.filter((row) => row.id === company.id),
        projections,
      });
    return authorizedCompanies;
  }
}

export type CompanyContextVisibility =
  | { kind: 'all-active' }
  | { kind: 'assigned-active'; companyIds: readonly string[] };

export type CommercialIntakeAccessMode =
  'read' | 'create' | 'update-next-action' | 'associate-client' | 'set-stage';

export function commercialIntakeRequiredPermissions(
  mode: CommercialIntakeAccessMode,
): readonly CompanyCommercialIntakePermission[] {
  switch (mode) {
    case 'read':
      return ['commercial.request.read', 'commercial.opportunity.read'];
    case 'create':
      return ['commercial.request.create', 'commercial.opportunity.create'];
    case 'update-next-action':
      return [
        'commercial.request.read',
        'commercial.opportunity.read',
        'commercial.opportunity.next_action.update',
      ];
    case 'associate-client':
      return ['commercial.request.read', 'commercial.request.client.associate'];
    case 'set-stage':
      return [
        'commercial.request.read',
        'commercial.opportunity.read',
        'commercial.opportunity.stage.set',
      ];
    default:
      return assertNeverMode(mode);
  }
}

function assertNeverMode(mode: never): never {
  throw new Error(`Unknown commercial intake access mode: ${String(mode)}`);
}

/** Complete runtime proof for one feature-consumed native assignment identity. */
function isNativeDocumentCapture(input: {
  bundle: typeof companyRoleAssignments.$inferSelect.bundle;
  assignmentId: unknown;
  version: unknown;
  versions: readonly string[];
}): input is {
  bundle: typeof companyRoleAssignments.$inferSelect.bundle;
  assignmentId: string;
  version: string;
  versions: readonly string[];
} {
  if (
    typeof input.assignmentId !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(
      input.assignmentId,
    ) ||
    typeof input.version !== 'string' ||
    !input.versions.includes(input.version)
  )
    return false;
  return true;
}

function invoiceRecordReadCapture(
  actor: ActorContext,
  companyId: string,
  assignmentId: string,
  contexts: readonly (readonly (string | null)[])[],
) {
  // Consume one independent Company-context authority. Optional native Client
  // or Document grants do not retire financial work while that context stays live.
  const context =
    contexts.find((identity) => identity[0] === 'company.manage') ??
    contexts.find((identity) => identity[0] === 'company_context_access') ??
    contexts.find((identity) => identity[0] === 'company_project_access') ??
    contexts[0];
  return (
    'invoice-record-read.v1.' +
    createHash('sha256')
      .update(
        JSON.stringify([
          actor.workspaceId,
          actor.workspaceMembershipId,
          companyId,
          assignmentId,
          'v1',
          context ?? null,
        ]),
      )
      .digest('hex')
  );
}

function paymentObservationContext(
  contexts: readonly (readonly (string | null)[])[],
) {
  const supported = contexts.filter(
    ([bundle, id, version]) =>
      typeof id === 'string' &&
      (((bundle === 'company.manage' || bundle === 'company_context_access') &&
        version === null) ||
        ((bundle === 'company_project_access' ||
          bundle === 'company_director_client_access') &&
          (version === 'v1' || version === 'v2')) ||
        (bundle === 'company_document_registrar' &&
          (version === 'v1' || version === 'v2' || version === 'v3'))),
  );
  return (
    supported.find((identity) => identity[0] === 'company.manage') ??
    supported.find((identity) => identity[0] === 'company_context_access') ??
    supported.find((identity) => identity[0] === 'company_project_access') ??
    supported[0]
  );
}
function paymentObservationContextCapture(
  actor: ActorContext,
  companyId: string,
  contexts: readonly (readonly (string | null)[])[],
) {
  return (
    'payment-observation-context.v1.' +
    createHash('sha256')
      .update(
        JSON.stringify([
          actor.internalUserId,
          actor.workspaceId,
          actor.workspaceMembershipId,
          companyId,
          paymentObservationContext(contexts) ?? null,
        ]),
      )
      .digest('hex')
  );
}
function paymentObservationReadCapture(
  actor: ActorContext,
  companyId: string,
  assignmentId: string,
  contexts: readonly (readonly (string | null)[])[],
) {
  // Copied reads and source-free owners consume one independent Company context.
  const context = paymentObservationContext(contexts);
  return (
    'payment-observation-read.v1.' +
    createHash('sha256')
      .update(
        JSON.stringify([
          actor.internalUserId,
          actor.workspaceId,
          actor.workspaceMembershipId,
          companyId,
          assignmentId,
          context ?? null,
        ]),
      )
      .digest('hex')
  );
}
