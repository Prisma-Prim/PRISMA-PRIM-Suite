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
    projectPermissions?: Array<'project.read' | 'project.create'>;
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
    commercialActivityPermissions?: Array<'commercial.activity.read'>;
    commercialActivityPermissionSetVersion?: 'v1';
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
      | 'document.project.manage'
    >;
    documentPermissionSetVersion?: 'v1' | 'v2';
    clientPermissionAssignmentId?: string;
    clientPermissionSetVersion?: 'v1' | 'v2';
  };
}
