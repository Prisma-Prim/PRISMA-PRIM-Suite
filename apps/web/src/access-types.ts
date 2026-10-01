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
    >;
    commercialIntakePermissionAssignmentId?: string;
    commercialIntakePermissionSetVersion?: 'v1' | 'v2';
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
    offerPermissions?: Array<
      | 'commercial.offer.read'
      | 'commercial.offer.prepare'
      | 'commercial.offer.transmission.record'
      | 'commercial.pricing.snapshot.read'
    >;
    offerPermissionAssignmentId?: string;
    offerPermissionSetVersion?: 'v1';
    pricingAdjustmentPermissions?: Array<'commercial.pricing.adjustment.apply'>;
    pricingAdjustmentPermissionAssignmentId?: string;
    pricingAdjustmentPermissionSetVersion?: 'v1';
    commercialActivityPermissions?: Array<'commercial.activity.read'>;
    commercialActivityPermissionSetVersion?: 'v1';
    opportunityManagerPermissions?: Array<'commercial.opportunity.assign'>;
    opportunityManagerPermissionAssignmentId?: string;
    opportunityManagerPermissionSetVersion?: 'v1';
    profitabilityContributorPermissions?: Array<
      | 'commercial.profitability_estimate.read'
      | 'commercial.profitability_estimate.create'
    >;
    profitabilityContributorAssignmentId?: string;
    profitabilityContributorPermissionSetVersion?: 'v1';
    profitabilityDirectorPermissions?: Array<
      | 'commercial.profitability_estimate.read'
      | 'commercial.profitability_estimate.decide'
    >;
    profitabilityDirectorAssignmentId?: string;
    profitabilityDirectorPermissionSetVersion?: 'v1';
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
      | 'document.version.manage'
      | 'document.version.designate_official'
      | 'document.project.manage'
    >;
    documentPermissionSetVersion?: 'v1' | 'v2' | 'v3';
    /** The live Company Document Approver assignment, if any. */
    documentApproverAssignmentId?: string;
    documentApproverPermissionSetVersion?: 'v1';
    clientPermissionAssignmentId?: string;
    clientPermissionSetVersion?: 'v1' | 'v2';
  };
}
