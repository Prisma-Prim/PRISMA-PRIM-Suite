import { useMissionDeliverableCopy } from '../documents/mission-deliverable.copy';
import { useTaskResultCopy } from '../project/task-results.copy';
import { useIdeasCopy } from '../ideas/ideas.copy';
import { useContractModelCopy } from '../contract-model/contract-model.copy';
import { useOfferModelCopy } from '../offer-model/offer-model.copy';
import { useOperationalRiskCopy } from '../operational-risk/operational-risk.copy';
import { useWorkspaceInvitationsCopy } from '../access/workspace-invitations.copy';
import { useOpportunityOutcomeCopy } from '../commercial-intake/opportunity-outcome.copy';
import {
  useSalesStageCopy,
  type SalesStageMessageKey,
} from '../commercial-intake/sales-stage.copy';
import type { RequestedVersion } from '../commercial-intake/CommercialIntakeWorkspace';
import { useDocumentPdfCopy } from '../documents/document-pdf.copy';
import { useInterfaceLocale } from '../localization/interface-locale';
import { formatMessage } from '../localization/messages';
import { useProjectResponsibleCopy } from '../project/project-responsible-localized.copy';
import { useProjectStageCopy } from '../project/project-stage.copy';
import { useProjectTemplateCopy } from '../project/project-template.copy';
import { useProjectTemplateVersionCopy } from '../project/project-template-version.copy';
import { useActivityLogCopy } from './activity-log.copy';
import type {
  ActivityLogEvent,
  ProjectLifecycleChangedActivityLogEvent,
  SalesStageConfiguredActivityLogEvent,
} from './company-context-transitions';

// The projection parser owns admission. This mapping only names already proved
// canonical actions; its total type makes a new admitted action a compile error.
const stageOperationKeys = {
  CREATED: 'operationCreated',
} satisfies Record<
  SalesStageConfiguredActivityLogEvent['metadata']['operation'],
  SalesStageMessageKey
>;

export function useActivityLogDisplay() {
  const message = useActivityLogCopy();
  const ideas = useIdeasCopy();
  const model = useOfferModelCopy();
  const contractModel = useContractModelCopy();
  const invitationActions = useWorkspaceInvitationsCopy().activityActionLabels;
  const pdfActions = useDocumentPdfCopy().activityActionLabels;
  const stage = useSalesStageCopy();
  const projectStage = useProjectStageCopy();
  const template = useProjectTemplateCopy();
  const templateVersion = useProjectTemplateVersionCopy();
  const responsible = useProjectResponsibleCopy();
  const outcome = useOpportunityOutcomeCopy();
  const { formatNumber, formatDateTime } = useInterfaceLocale();
  // The Offer viewer owns complete state sentences. These are the existing
  // ledger's short outcome labels, not a second workflow/state dictionary.
  const responseOutcomes = {
    ACCEPTED: message('responseAccepted'),
    REJECTED: message('responseRejected'),
    EXPIRED: message('responseExpired'),
  } satisfies Record<
    Extract<
      ActivityLogEvent,
      { action: 'offer_version.client_response_recorded' }
    >['metadata']['outcome'],
    string
  >;
  const risk = useOperationalRiskCopy();
  const missionActions = useMissionDeliverableCopy().activityActionLabels;
  const taskResultActions = useTaskResultCopy().activityActionLabels;
  const actionLabels = {
    ...taskResultActions,
    ...missionActions,
    'company_ideas_reader_assignment.granted': ideas('readerGranted'),
    'company_ideas_reader_assignment.revoked': ideas('readerRevoked'),
    'company_ideas_recorder_assignment.granted': ideas('recorderGranted'),
    'company_ideas_recorder_assignment.revoked': ideas('recorderRevoked'),
    'company_ideas_reviewer_assignment.granted': ideas('reviewerGranted'),
    'company_ideas_reviewer_assignment.revoked': ideas('reviewerRevoked'),

    'company_operational_risk_reader_assignment.granted': risk('readerGranted'),
    'company_operational_risk_reader_assignment.revoked': risk('readerRevoked'),
    'company_operational_risk_recorder_assignment.granted':
      risk('recorderGranted'),
    'company_operational_risk_recorder_assignment.revoked':
      risk('recorderRevoked'),
    'internal_user.provisioned': message('internal_user.provisioned'),
    'workspace_membership.suspended': message('workspace_membership.suspended'),
    'workspace_sessions.revoked': message('workspace_sessions.revoked'),
    'workspace_sessions.revocation_retry_required': message(
      'workspace_sessions.revocation_retry_required',
    ),
    'company.registered': message('company.registered'),
    'project.created': message('project.created'),
    'project.responsible.changed': message('project.responsible.changed'),
    'task.created': message('task.created'),
    'task.updated': message('task.updated'),
    'task.status.changed': message('task.status.changed'),
    'task.completed': message('task.completed'),
    'task.cancelled': message('task.cancelled'),
    'task.reopened': message('task.reopened'),
    'document.registered': message('document.registered'),
    'document.corrected': message('document.corrected'),
    'document.version.drafted': message('document.version.drafted'),
    'document.version.designated_official': message(
      'document.version.designated_official',
    ),
    'document.representation.added': message('document.representation.added'),
    'document.representation.removed': message(
      'document.representation.removed',
    ),
    'document.project.linked': message('document.project.linked'),
    'document.project.unlinked': message('document.project.unlinked'),
    'client.created': message('client.created'),
    'client.corrected': message('client.corrected'),
    'client_company_relationship.established': message(
      'client_company_relationship.established',
    ),
    'client_legal_entity.registered': message('client_legal_entity.registered'),
    'client_legal_entity.corrected': message('client_legal_entity.corrected'),
    'client.union_confirmed': message('client.union_confirmed'),
    'client.union_reversed': message('client.union_reversed'),
    'client_request.created': message('client_request.created'),
    'client_request.client_associated': message(
      'client_request.client_associated',
    ),
    'opportunity.created': message('opportunity.created'),
    'opportunity.next_action.updated': message(
      'opportunity.next_action.updated',
    ),
    'opportunity.responsible.changed': message(
      'opportunity.responsible.changed',
    ),
    'opportunity.outcome.changed': message('opportunity.outcome.changed'),
    'offer.created': message('offer.created'),
    'offer_version.created': message('offer_version.created'),
    'offer_version.approved': message('offer_version.approved'),
    'offer_version.rejected': message('offer_version.rejected'),
    'offer_version.transmission_recorded': message(
      'offer_version.transmission_recorded',
    ),
    'offer_version.client_response_recorded': message(
      'offer_version.client_response_recorded',
    ),
    'contract.created': message('contract.created'),
    'contract_version.created': message('contract_version.created'),
    'contract_version.approved': message('contract_version.approved'),
    'contract_version.rejected': message('contract_version.rejected'),
    'contract_version.signature_recorded': message(
      'contract_version.signature_recorded',
    ),
    'contract_project.linked': message('contract_project.linked'),
    'company_task_manager_assignment.granted': message(
      'company_task_manager_assignment.granted',
    ),
    'company_task_manager_assignment.revoked': message(
      'company_task_manager_assignment.revoked',
    ),
    'company_project_assignment.granted': message(
      'company_project_assignment.granted',
    ),
    'company_project_assignment.revoked': message(
      'company_project_assignment.revoked',
    ),
    'company_commercial_intake_assignment.granted': message(
      'company_commercial_intake_assignment.granted',
    ),
    'company_commercial_intake_assignment.revoked': message(
      'company_commercial_intake_assignment.revoked',
    ),
    'company_service_catalogue_assignment.granted': message(
      'company_service_catalogue_assignment.granted',
    ),
    'company_service_catalogue_assignment.revoked': message(
      'company_service_catalogue_assignment.revoked',
    ),
    'company_pricing_configuration_assignment.granted': message(
      'company_pricing_configuration_assignment.granted',
    ),
    'company_pricing_configuration_assignment.revoked': message(
      'company_pricing_configuration_assignment.revoked',
    ),
    'company_pricing_user_assignment.granted': message(
      'company_pricing_user_assignment.granted',
    ),
    'company_pricing_user_assignment.revoked': message(
      'company_pricing_user_assignment.revoked',
    ),
    'company_offer_preparer_assignment.granted': message(
      'company_offer_preparer_assignment.granted',
    ),
    'company_offer_model_editor_assignment.granted': model('editorGranted'),
    'company_contract_model_editor_assignment.granted':
      contractModel('editorGranted'),
    'company_offer_model_editor_assignment.revoked': model('editorRevoked'),
    'company_contract_model_editor_assignment.revoked':
      contractModel('editorRevoked'),
    'company_offer_model_approver_assignment.granted': model('approverGranted'),
    'company_contract_model_approver_assignment.granted':
      contractModel('approverGranted'),
    'company_offer_model_approver_assignment.revoked': model('approverRevoked'),
    'company_contract_model_approver_assignment.revoked':
      contractModel('approverRevoked'),
    'company_offer_preparer_assignment.revoked': message(
      'company_offer_preparer_assignment.revoked',
    ),
    'company_offer_approver_assignment.granted': message(
      'company_offer_approver_assignment.granted',
    ),
    'company_offer_approver_assignment.revoked': message(
      'company_offer_approver_assignment.revoked',
    ),
    'company_pricing_adjustment_assignment.granted': message(
      'company_pricing_adjustment_assignment.granted',
    ),
    'company_pricing_adjustment_assignment.revoked': message(
      'company_pricing_adjustment_assignment.revoked',
    ),
    'company_commercial_activity_reader_assignment.granted': message(
      'company_commercial_activity_reader_assignment.granted',
    ),
    'company_commercial_activity_reader_assignment.revoked': message(
      'company_commercial_activity_reader_assignment.revoked',
    ),
    'company_opportunity_manager_assignment.granted': message(
      'company_opportunity_manager_assignment.granted',
    ),
    'company_opportunity_manager_assignment.revoked': message(
      'company_opportunity_manager_assignment.revoked',
    ),
    'company_project_approver_assignment.granted': message(
      'company_project_approver_assignment.granted',
    ),
    'company_project_approver_assignment.revoked': message(
      'company_project_approver_assignment.revoked',
    ),
    'company_context_assignment.granted': message(
      'company_context_assignment.granted',
    ),
    'company_context_assignment.revoked': message(
      'company_context_assignment.revoked',
    ),
    'company_director_client_assignment.granted': message(
      'company_director_client_assignment.granted',
    ),
    'company_director_client_assignment.revoked': message(
      'company_director_client_assignment.revoked',
    ),
    'company_document_project_organizer_assignment.granted': message(
      'company_document_project_organizer_assignment.granted',
    ),
    'company_document_project_organizer_assignment.revoked': message(
      'company_document_project_organizer_assignment.revoked',
    ),
    'company_document_registrar_assignment.granted': message(
      'company_document_registrar_assignment.granted',
    ),
    'company_document_registrar_assignment.revoked': message(
      'company_document_registrar_assignment.revoked',
    ),
    'company_document_approver_assignment.granted': message(
      'company_document_approver_assignment.granted',
    ),
    'company_document_approver_assignment.revoked': message(
      'company_document_approver_assignment.revoked',
    ),
    ...invitationActions,
    ...pdfActions,
    'opportunity.stage.changed': stage('activityStageChanged'),
    'sales_stage.configured': stage('activitySalesStageConfigured'),
    'company_sales_stage_configuration_assignment.granted': stage(
      'configurationGranted',
    ),
    'company_sales_stage_configuration_assignment.revoked': stage(
      'configurationRevoked',
    ),
    'project.stage.changed': projectStage('activity'),
    'company_project_stage_advancer_assignment.granted':
      projectStage('granted'),
    'company_project_stage_advancer_assignment.revoked':
      projectStage('revoked'),
    'company_project_template_user_assignment.granted': template('granted'),
    'company_project_template_user_assignment.revoked': template('revoked'),
    'project.template.version.created': templateVersion('activity'),
    'company_project_template_configuration_assignment.granted':
      templateVersion('granted'),
    'company_project_template_configuration_assignment.revoked':
      templateVersion('revoked'),
  } satisfies Record<
    Exclude<ActivityLogEvent['action'], 'project.lifecycle.changed'>,
    string
  >;

  function lifecycleDescription(
    metadata: ProjectLifecycleChangedActivityLogEvent['metadata'],
  ): string {
    switch (metadata.to) {
      case 'active':
        if (metadata.from === 'on_hold') return message('lifecycleResumed');
        return message(
          metadata.withStartException
            ? 'lifecycleActivatedException'
            : 'lifecycleActivated',
        );
      case 'on_hold':
        return message('lifecycleOnHold');
      case 'completed':
        return message('lifecycleCompleted');
      case 'cancelled':
        return message('lifecycleCancelled');
      default: {
        const exhaustive: never = metadata;
        return exhaustive;
      }
    }
  }

  function describe(event: ActivityLogEvent): string {
    const actor =
      'kind' in event.actor ? message('resolver') : event.actor.displayName;
    if (event.action === 'project.lifecycle.changed')
      return `${actor} ${lifecycleDescription(event.metadata)}`;
    const description = `${actor} ${actionLabels[event.action]}`;
    switch (event.action) {
      case 'offer_version.client_response_recorded':
        return `${description} (${responseOutcomes[event.metadata.outcome]})`;
      case 'opportunity.stage.changed':
        return `${description} ${formatMessage(stage('activityStageChange'), {
          previous: event.metadata.previousLabel ?? stage('stageNone'),
          next: event.metadata.newLabel ?? stage('stageNone'),
        })}`;
      case 'sales_stage.configured':
        return `${description} ${formatMessage(
          stage('activityStageConfigured'),
          {
            operation: stage(stageOperationKeys[event.metadata.operation]),
            label: event.metadata.label,
          },
        )}`;
      case 'opportunity.outcome.changed': {
        const { metadata } = event;
        const values = {
          before: outcome.opportunityStatusLabels[metadata.previousStatus],
          after: outcome.opportunityStatusLabels[metadata.newStatus],
        };
        return `${description} ${
          metadata.newStatus === 'LOST'
            ? formatMessage(message('lossChange'), {
                ...values,
                loss: outcome.lossReasonLabels[metadata.lossReasonCode],
              })
            : formatMessage(message('change'), values)
        }`;
      }
      case 'opportunity.responsible.changed':
        return `${description} ${formatMessage(message('change'), {
          before: event.metadata.before.displayLabel,
          after: event.metadata.after.displayLabel,
        })}`;
      default:
        return description;
    }
  }

  function targetDescription(event: ActivityLogEvent): string {
    // The resulting catalogue Version remains the source for Project copies.
    // sourceVersion is its publication predecessor; no identity is substituted.
    if (event.action === 'project.template.version.created')
      return formatMessage(templateVersion('source'), {
        version: formatNumber(event.metadata.version),
      });
    switch (event.target.type) {
      case 'document_project':
        return `${message('documentTarget')}: ${event.target.documentTitle} — ${message('projectTarget')}: ${event.target.projectTitle}`;
      case 'document':
        return `${message('documentTarget')}: ${event.action === 'document.corrected' ? event.target.documentId : event.target.documentTitle}`;
      case 'project': {
        const project = `${message('projectTarget')}: ${event.target.projectTitle}`;
        return event.action === 'project.responsible.changed'
          ? `${project} — ${formatMessage(message('responsibleChange'), {
              before: event.metadata.before?.displayLabel ?? responsible.none,
              after: event.metadata.after?.displayLabel ?? responsible.none,
            })}`
          : project;
      }
      case 'task':
        return `${message('taskTarget')}: ${event.target.taskTitle}`;
      case 'workspace_invitation':
        return event.target.invitationId;
      case 'client_union_operation':
        return message('unionTarget');
      case 'client_request':
        return `${message('requestTarget')}: ${event.target.clientRequestId}`;
      case 'opportunity':
        return `${message('opportunityTarget')}: ${event.target.opportunityId}`;
      case 'offer_version': {
        const target = formatMessage(message('offerVersion'), {
          reference: formatNumber(event.target.illustrativeReference),
          version: formatNumber(event.target.versionNumber),
        });
        return event.action === 'offer_version.transmission_recorded' ||
          event.action === 'offer_version.client_response_recorded'
          ? `${target} · ${message('simulated')}`
          : target;
      }
      case 'sales_stage':
        return stage('salesStageSettings');
      case 'contract_version': {
        const kindLabels = {
          CONTRACT: message('contractKind'),
          PRECONTRACT: message('precontractKind'),
          ADDENDUM: message('addendumKind'),
        } satisfies Record<typeof event.target.kind, string>;
        const target = formatMessage(message('contractVersion'), {
          kind: kindLabels[event.target.kind],
          reference: formatNumber(event.target.illustrativeReference),
          version: formatNumber(event.target.versionNumber),
        });
        switch (event.action) {
          case 'contract_version.signature_recorded':
            return `${target} · ${message('simulated')}`;
          case 'contract_project.linked':
            return `${target} — ${formatMessage(message(event.metadata.created ? 'createdProject' : 'linkedProject'), { title: event.metadata.project.projectTitle })}`;
          default:
            return target;
        }
      }
      case 'company_role_assignment':
        return `${event.target.internalUserDisplayName} — ${event.target.companyDisplayName}`;
      case 'client_company_relationship':
        return `${event.target.clientDisplayName} — ${event.target.companyDisplayName}`;
      case 'internal_user':
      case 'workspace_membership':
      case 'company':
        return event.target.displayName;
      case 'client_account':
        return event.target.companyDisplayName
          ? `${event.target.displayName} — ${event.target.companyDisplayName}`
          : event.target.displayName;
      default: {
        const exhaustive: never = event.target;
        return exhaustive;
      }
    }
  }

  function openIntent({
    event,
    activeCompanyId,
  }: {
    event: ActivityLogEvent;
    activeCompanyId: string | undefined;
  }):
    | { clientRequestId: string; version?: RequestedVersion; label: string }
    | undefined {
    const { target } = event;
    if (
      (target.type !== 'client_request' &&
        target.type !== 'opportunity' &&
        target.type !== 'offer_version' &&
        target.type !== 'contract_version') ||
      target.companyId !== activeCompanyId ||
      target.clientRequestId === undefined
    )
      return undefined;
    switch (target.type) {
      case 'offer_version':
        return {
          clientRequestId: target.clientRequestId,
          version: {
            type: 'offer_version',
            offerVersionId: target.offerVersionId,
          },
          label: message('openOffer'),
        };
      case 'contract_version':
        return {
          clientRequestId: target.clientRequestId,
          version: {
            type: 'contract_version',
            contractId: target.contractId,
            contractVersionId: target.contractVersionId,
            kind: target.kind,
          },
          label: message('openContract'),
        };
      default:
        return {
          clientRequestId: target.clientRequestId,
          label: message('openRequest'),
        };
    }
  }

  return { message, describe, targetDescription, openIntent, formatDateTime };
}
