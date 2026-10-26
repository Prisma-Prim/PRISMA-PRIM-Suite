import type { ActorContext } from '../access-types';

/** Captures consumed by this owner, without presentation or unrelated grants. */
export function reportedSigningAuthority(actor: ActorContext) {
  const c = actor.activeCompany;
  const declarer = capture(
    c?.contractSignatureDeclarerAssignmentId,
    c?.contractSignatureDeclarerPermissionSetVersion,
    ['v1'],
  );
  const signature = capture(
    c?.contractApproverAssignmentId,
    c?.contractApproverPermissionSetVersion,
    ['v1', 'v2'],
  );
  const offer =
    capture(c?.offerPermissionAssignmentId, c?.offerPermissionSetVersion, [
      'v1',
      'v2',
      'v3',
    ]) ??
    capture(
      c?.offerApproverAssignmentId,
      c?.offerApproverPermissionSetVersion,
      ['v1', 'v2'],
    );
  const intake = capture(
    c?.commercialIntakePermissionAssignmentId,
    c?.commercialIntakePermissionSetVersion,
    ['v1', 'v2', 'v3', 'v4'],
  );
  const client = capture(
    c?.clientPermissionAssignmentId,
    c?.clientPermissionSetVersion,
    ['v1', 'v2'],
  );
  const pdf = reportedSigningPdfAuthority(actor);
  const allowed = Boolean(
    actor.active &&
    c &&
    declarer &&
    signature &&
    offer &&
    intake &&
    client &&
    pdf.allowed &&
    c.contractPermissions?.includes('commercial.contract.read') &&
    c.contractPermissions.includes('commercial.contract.signature.record') &&
    c.offerPermissions?.includes('commercial.offer.read') &&
    c.commercialIntakePermissions?.includes('commercial.request.read') &&
    c.commercialIntakePermissions.includes('commercial.opportunity.read') &&
    c.clientPermissions?.includes('client.read'),
  );
  return {
    allowed,
    key: JSON.stringify([
      declarer,
      signature,
      offer,
      intake,
      client,
      pdf.key,
      allowed,
    ]),
  };
}

export function reportedSigningPdfAuthority(actor: ActorContext) {
  const c = actor.activeCompany;
  const metadata = capture(
    c?.documentPermissionAssignmentId,
    c?.documentPermissionSetVersion,
    ['v1', 'v2', 'v3'],
  );
  const family = capture(
    c?.receivedContractAccessAssignmentId,
    c?.receivedContractAccessPermissionSetVersion,
    ['v1'],
  );
  const content = capture(
    c?.documentContentReaderAssignmentId,
    c?.documentContentReaderPermissionSetVersion,
    ['v1'],
  );
  const client = c?.clientPermissions?.includes('client.read')
    ? capture(c.clientPermissionAssignmentId, c.clientPermissionSetVersion, [
        'v1',
        'v2',
      ])
    : undefined;
  const workspaceClient = actor.workspacePermissions.includes('client.manage');
  const allowed = Boolean(
    actor.active &&
    c?.documentPermissions?.includes('document.read') &&
    c.documentPermissions.includes('document.content.read') &&
    c.documentPermissions.includes('document.received_contract.access') &&
    (client || workspaceClient) &&
    metadata &&
    family &&
    content,
  );
  return {
    allowed,
    key: JSON.stringify([
      metadata,
      family,
      content,
      client ?? workspaceClient,
      allowed,
    ]),
  };
}
function capture(
  id: string | undefined,
  version: unknown,
  versions: readonly string[],
) {
  return id && typeof version === 'string' && versions.includes(version)
    ? { assignmentId: id, permissionSetVersion: version }
    : undefined;
}
