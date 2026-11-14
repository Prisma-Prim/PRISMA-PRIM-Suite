/** Only an acknowledgement for the submitted Membership confirms suspension. */
export function confirmsWorkspaceMembershipSuspension({
  value,
  workspaceMembershipId,
}: {
  value: unknown;
  workspaceMembershipId: string;
}): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    'workspaceMembershipId' in value &&
    typeof value.workspaceMembershipId === 'string' &&
    value.workspaceMembershipId.toLowerCase() ===
      workspaceMembershipId.toLowerCase() &&
    'status' in value &&
    value.status === 'inactive'
  );
}
