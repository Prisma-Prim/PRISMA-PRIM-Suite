export interface WorkingDocument {
  id: string;
  workspaceId: string;
  companyId: string;
  clientId: string;
  clientDisplayName: string;
  title: string;
  purpose: string;
  type: 'questionnaire';
  confidentiality: 'company-confidential';
  createdAt: string;
  createdByMembershipId: string;
  version: {
    id: string;
    status: 'draft';
    representation: {
      id: string;
      kind: 'external-reference';
      verification: 'unverified';
    } & ({ access: 'granted'; url: string } | { access: 'denied' });
  };
}
