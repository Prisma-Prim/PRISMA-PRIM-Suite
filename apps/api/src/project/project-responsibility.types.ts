/** A responsible member as recorded: identifier and the label captured then. */
export interface ProjectResponsibleMember {
  workspaceMembershipId: string;
  displayLabel: string;
}

export interface ProjectResponsibilityView {
  responsible: ProjectResponsibleMember | null;
  revision: number;
  lastChange: { actorDisplayName: string; occurredAt: string } | null;
  /** False while the Project's original Client is superseded. */
  mutable: boolean;
}

export interface ProjectResponsibilityReceipt {
  projectId: string;
  outcome: 'changed' | 'unchanged';
  revision: number;
  responsible: ProjectResponsibleMember | null;
}

export interface ProjectResponsibilityCommand {
  expectedRevision: number;
  workspaceMembershipId: string | null;
}

export interface ProjectResponsibleChangedActivityEvent {
  id: string;
  action: 'project.responsible.changed';
  occurredAt: string;
  actor: { internalUserId: string; displayName: string };
  target: {
    type: 'project';
    projectId: string;
    projectTitle: string;
    companyId: string;
  };
  metadata: {
    revision: number;
    before: ProjectResponsibleMember | null;
    after: ProjectResponsibleMember | null;
  };
}
