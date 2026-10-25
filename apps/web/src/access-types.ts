export interface ActorContext {
  internalUserId: string;
  workspaceMembershipId: string;
  workspaceId: string;
  workspaceName: string;
  displayName: string;
  email: string;
  active: true;
  workspacePermissions: Array<
    | 'company.manage'
    | 'company.assignment.manage'
    | 'client.manage'
    | 'member.invite'
  >;
  activeCompany?: {
    id: string;
    displayName: string;
    /** This additional wire projection is proved by the Offer-model boundary. */
    offerModelGrants?: unknown;
    contractModelGrants?: unknown;
    taskPermissions?: Array<'task.read' | 'task.manage'>;
    taskPermissionAssignmentId?: string;
    taskPermissionSetVersion?: 'v1';
    taskResultPermissions?: Array<'task.result.record'>;
    taskResultRecorderAssignmentId?: string;
    taskResultRecorderPermissionSetVersion?: 'v1';
    projectPermissions?: Array<
      'project.read' | 'project.create' | 'project.update'
    >;
    projectPermissionAssignmentId?: string;
    projectPermissionSetVersion?: 'v1' | 'v2';
    projectApproverPermissions?: Array<
      'project.lifecycle.transition' | 'project.close'
    >;
    projectApproverPermissionAssignmentId?: string;
    projectApproverPermissionSetVersion?: 'v1';
    commercialIntakePermissions?: Array<
      | 'commercial.request.read'
      | 'commercial.request.create'
      | 'commercial.opportunity.read'
      | 'commercial.opportunity.create'
      | 'commercial.opportunity.next_action.update'
      | 'commercial.request.client.associate'
      | 'commercial.opportunity.stage.set'
    >;
    commercialIntakePermissionAssignmentId?: string;
    commercialIntakePermissionSetVersion?: 'v1' | 'v2' | 'v3' | 'v4';
    serviceCataloguePermissions?: Array<
      | 'service.definition.read'
      | 'service.definition.create'
      | 'commercial.offering.read'
      | 'commercial.offering.manage'
    >;
    serviceCataloguePermissionAssignmentId?: string;
    serviceCataloguePermissionSetVersion?: 'v1';
    pricingConfigurationPermissions?: Array<
      | 'commercial.offering.read'
      | 'commercial.pricing.configuration.read'
      | 'commercial.pricing.configuration.manage'
    >;
    pricingConfigurationPermissionAssignmentId?: string;
    pricingConfigurationPermissionSetVersion?: 'v1';
    pricingUserPermissions?: Array<
      | 'commercial.offering.read'
      | 'commercial.pricing.configuration.read'
      | 'commercial.pricing.calculate'
      | 'commercial.pricing.snapshot.read'
    >;
    pricingUserPermissionAssignmentId?: string;
    pricingUserPermissionSetVersion?: 'v1';
    contractPermissions?: Array<
      | 'commercial.contract.read'
      | 'commercial.contract.model.select'
      | 'commercial.contract.model_based.prepare'
      | 'commercial.contract.model_based.approve'
      | 'commercial.contract.prepare_pending_offer'
      | 'commercial.contract.prepare'
      | 'commercial.contract.project.link'
      | 'commercial.contract.approve'
      | 'commercial.contract.signature.record'
    >;
    contractEarlyPreparationAssignmentId?: string;
    contractEarlyPreparationPermissionSetVersion?: 'v1';
    contractPermissionAssignmentId?: string;
    contractPermissionSetVersion?: 'v1' | 'v2';
    contractApproverAssignmentId?: string;
    contractApproverPermissionSetVersion?: 'v1' | 'v2';
    profitabilityContributorPermissions?: Array<
      | 'commercial.profitability_estimate.read'
      | 'commercial.profitability_estimate.create'
    >;
    profitabilityContributorPermissionAssignmentId?: string;
    profitabilityContributorPermissionSetVersion?: 'v1';
    profitabilityDirectorPermissions?: Array<
      | 'commercial.profitability_estimate.read'
      | 'commercial.profitability_estimate.decide'
    >;
    profitabilityDirectorPermissionAssignmentId?: string;
    profitabilityDirectorPermissionSetVersion?: 'v1';
    offerPermissions?: Array<
      | 'commercial.offer.read'
      | 'commercial.offer.prepare'
      | 'commercial.offer.estimate.prepare'
      | 'commercial.offer.model.select'
      | 'commercial.offer.model_based.prepare'
      | 'commercial.offer.model_based.approve'
      | 'commercial.offer.model_based.transmission.record'
      | 'commercial.offer.model_based.response.record'
      | 'commercial.offer.approve'
      | 'commercial.offer.response.record'
      | 'commercial.offer.transmission.record'
      | 'commercial.pricing.snapshot.read'
    >;
    offerPermissionAssignmentId?: string;
    offerPermissionSetVersion?: 'v1' | 'v2' | 'v3';
    offerApproverAssignmentId?: string;
    offerApproverPermissionSetVersion?: 'v1' | 'v2';
    pricingAdjustmentPermissions?: Array<'commercial.pricing.adjustment.apply'>;
    pricingAdjustmentPermissionAssignmentId?: string;
    pricingAdjustmentPermissionSetVersion?: 'v1';
    commercialActivityPermissions?: Array<'commercial.activity.read'>;
    commercialActivityPermissionSetVersion?: 'v1';
    opportunityManagerPermissions?: Array<
      'commercial.opportunity.assign' | 'commercial.opportunity.outcome.change'
    >;
    opportunityManagerPermissionAssignmentId?: string;
    opportunityManagerPermissionSetVersion?: 'v1' | 'v2';
    operationalRiskPermissions?: Array<'risk.read' | 'risk.record'>;
    operationalRiskReaderAssignmentId?: string;
    operationalRiskReaderPermissionSetVersion?: 'v1';
    operationalRiskRecorderAssignmentId?: string;
    operationalRiskRecorderPermissionSetVersion?: 'v1';
    projectStagePermissions?: Array<'project.stage.advance'>;
    projectStagePermissionAssignmentId?: string;
    projectStagePermissionSetVersion?: 'v1';
    projectTemplateConfigurationPermissions?: Array<'project.template.version.create'>;
    projectTemplateConfigurationPermissionAssignmentId?: string;
    projectTemplateConfigurationPermissionSetVersion?: 'v1';
    projectTemplatePermissions?: Array<
      | 'project.template.read'
      | 'project.template.instantiate'
      | 'project.template.pilot.read'
      | 'project.template.pilot.instantiate'
    >;
    projectTemplatePermissionAssignmentId?: string;
    projectTemplatePermissionSetVersion?: 'v1' | 'v2';
    salesStageConfigurationPermissions?: Array<'commercial.sales_stage.configure'>;
    salesStageConfigurationPermissionAssignmentId?: string;
    salesStageConfigurationPermissionSetVersion?: 'v1';
    ideasReaderPermissions?: Array<'idea.read'>;
    ideasReaderPermissionAssignmentId?: string;
    ideasReaderPermissionSetVersion?: 'v1';
    ideasRecorderPermissions?: Array<'idea.record'>;
    ideasRecorderPermissionAssignmentId?: string;
    ideasRecorderPermissionSetVersion?: 'v1';
    ideasReviewerPermissions?: Array<'idea.disposition.record'>;
    ideasReviewerPermissionAssignmentId?: string;
    ideasReviewerPermissionSetVersion?: 'v1';
    clientPermissions?: Array<
      | 'client.read'
      | 'client.create'
      | 'client.update'
      | 'client.duplicate.resolve'
    >;
    documentPermissions?: Array<
      | 'document.received_contract.access'
      | 'document.mission_deliverable.access'
      | 'document.read'
      | 'document.register'
      | 'document.reference.read'
      | 'document.correct'
      | 'document.content.read'
      | 'document.content.upload'
      | 'document.version.manage'
      | 'document.version.designate_official'
      | 'document.project.manage'
    >;
    missionDeliverableAccessAssignmentId?: string;
    missionDeliverableAccessPermissionSetVersion?: 'v1';
    receivedContractAccessAssignmentId?: string;
    receivedContractAccessPermissionSetVersion?: 'v1';
    documentPermissionSetVersion?: 'v1' | 'v2' | 'v3';
    documentPermissionAssignmentId?: string;
    /** The live Company Document Approver assignment, if any. */
    documentContentReaderAssignmentId?: string;
    documentContentReaderPermissionSetVersion?: 'v1';
    documentContentUploaderAssignmentId?: string;
    documentContentUploaderPermissionSetVersion?: 'v1';
    documentApproverAssignmentId?: string;
    documentApproverPermissionSetVersion?: 'v1';
    clientPermissionAssignmentId?: string;
    clientPermissionSetVersion?: 'v1' | 'v2';
  };
}
