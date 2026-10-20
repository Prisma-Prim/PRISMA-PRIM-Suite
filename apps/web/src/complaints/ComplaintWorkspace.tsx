import type { ActorContext } from '../access-types';
import { useMemo } from 'react';
import {
  ComplaintRegistry,
  type ComplaintWorkspaceProps,
} from './ComplaintRegistry';
import './complaints.css';

export function canReadComplaints(actor: ActorContext): boolean {
  return Boolean(
    actor.activeCompany?.complaintReaderAssignmentId?.trim() &&
    actor.activeCompany.complaintReaderPermissionSetVersion === 'v1',
  );
}

export function complaintAuthorityKey(actor: ActorContext): string {
  const company = actor.activeCompany;
  return JSON.stringify([
    actor.workspaceId,
    actor.internalUserId,
    actor.workspaceMembershipId,
    company?.id,
    company?.complaintReaderAssignmentId,
    company?.complaintReaderPermissionSetVersion,
    company?.complaintRecorderAssignmentId,
    company?.complaintRecorderPermissionSetVersion,
    actor.workspacePermissions.includes('client.manage'),
    company?.clientPermissionAssignmentId,
    company?.clientPermissionSetVersion,
    company?.clientPermissions,
    company?.projectPermissions,
  ]);
}

export function ComplaintWorkspace(props: ComplaintWorkspaceProps) {
  const identityScope = useMemo(() => crypto.randomUUID(), [props.identity]);
  if (!canReadComplaints(props.actor)) return null;
  return (
    <ComplaintRegistry
      key={`${identityScope}:${complaintAuthorityKey(props.actor)}`}
      {...props}
    />
  );
}
