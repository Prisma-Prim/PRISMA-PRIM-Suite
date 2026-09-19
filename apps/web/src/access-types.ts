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
    projectPermissions?: Array<'project.read' | 'project.create'>;
    clientPermissions?: Array<
      | 'client.read'
      | 'client.create'
      | 'client.update'
      | 'client.duplicate.resolve'
    >;
    clientPermissionAssignmentId?: string;
    clientPermissionSetVersion?: 'v1' | 'v2';
  };
}
