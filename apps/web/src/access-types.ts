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
    taskPermissions?: Array<'task.read' | 'task.manage'>;
    taskPermissionAssignmentId?: string;
    taskPermissionSetVersion?: 'v1';
    projectPermissions?: Array<
      'project.read' | 'project.create' | 'project.update'
    >;
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
      | 'commercial.contract.prepare'
      | 'commercial.contract.project.link'
      | 'commercial.contract.approve'
      | 'commercial.contract.signature.record'
    >;
    contractPermissionAssignmentId?: string;
    contractPermissionSetVersion?: 'v1';
    contractApproverAssignmentId?: string;
    contractApproverPermissionSetVersion?: 'v1';
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
      | 'commercial.offer.approve'
      | 'commercial.offer.response.record'
      | 'commercial.offer.transmission.record'
      | 'commercial.pricing.snapshot.read'
    >;
    offerPermissionAssignmentId?: string;
    offerPermissionSetVersion?: 'v1';
    offerApproverAssignmentId?: string;
    offerApproverPermissionSetVersion?: 'v1';
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
    projectStagePermissions?: Array<'project.stage.advance'>;
    projectStagePermissionAssignmentId?: string;
    projectStagePermissionSetVersion?: 'v1';
    projectTemplatePermissions?: Array<
      'project.template.read' | 'project.template.instantiate'
    >;
    projectTemplatePermissionAssignmentId?: string;
    projectTemplatePermissionSetVersion?: 'v1';
    salesStageConfigurationPermissions?: Array<'commercial.sales_stage.configure'>;
    salesStageConfigurationPermissionAssignmentId?: string;
    salesStageConfigurationPermissionSetVersion?: 'v1';
    clientPermissions?: Array<
      | 'client.read'
      | 'client.create'
      | 'client.update'
      | 'client.duplicate.resolve'
    >;
    documentPermissions?: Array<
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
    documentPermissionSetVersion?: 'v1' | 'v2' | 'v3';
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
