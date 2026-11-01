// The captured versions the server may report for each administrable bundle.
// An unlisted label or version fails closed; the screen never infers one.
const CAPTURED_VERSIONS = {
  'Company Opportunity Follow-up Coordinator': ['v1'],
  'Company Invoice Reader': ['v1'],
  'Company Invoice Recorder': ['v1'],
  'Company External Invoice Access': ['v1'],

  'Company Knowledge Source Administrator': ['v1'],
  'Company Knowledge Evidence Reader': ['v1'],
  'Company Mission Plan Configuration': ['v1'],
  'Company Mission Plan User': ['v1'],
  'Company Contract Model Editor': ['v1'],
  'Company Contract Model Approver': ['v1'],
  'Company Offer Model Editor': ['v1'],
  'Company Offer Model Approver': ['v1'],
  'Company Ideas Reader': ['v1'],
  'Company Ideas Recorder': ['v1'],
  'Company Ideas Reviewer': ['v1'],
  'Company Context Access': [null],
  'Company Director Client Access': ['v1', 'v2'],
  'Company Mission Deliverable Access': ['v1'],
  'Company Contract Signature Declarer': ['v1'],
  'Company Received Contract Access': ['v1'],
  'Company Document Registrar': ['v1', 'v2', 'v3'],
  'Company Document Approver': ['v1'],
  'Company Document Content Reader': ['v1'],
  'Company Document Content Uploader': ['v1'],
  'Company Commercial Intake': ['v1', 'v2', 'v3', 'v4'],
  'Company Document Project Organizer': ['v1'],
  'Company Project Access': ['v1', 'v2'],
  'Company Internal Task Manager': ['v1'],
  'Company Task Manager': ['v1'],
  'Company Task Result Recorder': ['v1'],
  'Company Mission Result Reviewer': ['v1'],
  'Company Mission Applicability Coordinator': ['v1'],
  'Company Project Next Action Coordinator': ['v1'],
  'Company Mission Applicability Approver': ['v1'],
  'Company Service Catalogue': ['v1'],
  'Company Pricing Configuration': ['v1'],
  'Company Pricing User': ['v1'],
  'Company Offer Preparer': ['v1', 'v2', 'v3'],
  'Company Contract Preparer': ['v1', 'v2'],
  'Company Contract Early Preparation': ['v1'],
  'Company Contract Approver': ['v1', 'v2'],
  'Company Offer Approver': ['v1', 'v2'],
  'Company Pricing Adjustment': ['v1'],
  'Company Commercial Activity Reader': ['v1'],
  'Company Opportunity Manager': ['v1', 'v2'],
  'Company Project Approver': ['v1'],
  'Company Profitability Contributor': ['v1'],
  'Company Profitability Director': ['v1'],
  'Company Operational Risk Reader': ['v1'],
  'Company Operational Risk Recorder': ['v1'],
  'Company Sales Stage Configuration': ['v1'],
  'Company Project Template User': ['v1', 'v2'],
  'Company Project Stage Advancer': ['v1'],
  'Company Project Template Configuration': ['v1'],
} as const satisfies Record<
  string,
  readonly ('v1' | 'v2' | 'v3' | 'v4' | null)[]
>;

export type AssignmentBundleLabel = keyof typeof CAPTURED_VERSIONS;
type CapturedVersion<Label extends AssignmentBundleLabel> =
  (typeof CAPTURED_VERSIONS)[Label][number];
interface AssignmentBase {
  id: string;
  workspaceMembershipId: string;
  companyId: string;
  active: boolean;
}
type AssignmentFor<Label extends AssignmentBundleLabel> = {
  [Bundle in Label]: AssignmentBase & {
    bundle: Bundle;
    permissionSetVersion: CapturedVersion<Bundle>;
  };
}[Label];

export type CompanyAccessAssignment = AssignmentFor<AssignmentBundleLabel>;
export interface CompanyAccessMember {
  workspaceMembershipId: string;
  displayName: string;
  email: string;
}
export interface CompanyAccessCompany {
  id: string;
  displayName: string;
}
export interface CompanyAccessAdministration {
  members: CompanyAccessMember[];
  companies: CompanyAccessCompany[];
  assignments: CompanyAccessAssignment[];
}

export function companyAccessAdministrationResponse(
  value: unknown,
): CompanyAccessAdministration {
  if (
    !record(value) ||
    !Array.isArray(value.members) ||
    !Array.isArray(value.companies) ||
    !Array.isArray(value.assignments)
  )
    throw new Error('Invalid Company access administration response.');
  return {
    members: value.members.map(member),
    companies: value.companies.map(company),
    assignments: value.assignments.map(assignment),
  };
}

function member(value: unknown): CompanyAccessMember {
  if (
    !record(value) ||
    typeof value.workspaceMembershipId !== 'string' ||
    typeof value.displayName !== 'string' ||
    typeof value.email !== 'string'
  )
    throw new Error('Invalid Company access administration member.');
  return {
    workspaceMembershipId: value.workspaceMembershipId,
    displayName: value.displayName,
    email: value.email,
  };
}

function company(value: unknown): CompanyAccessCompany {
  if (
    !record(value) ||
    typeof value.id !== 'string' ||
    typeof value.displayName !== 'string'
  )
    throw new Error('Invalid Company access administration Company.');
  return { id: value.id, displayName: value.displayName };
}

function assignment(value: unknown): CompanyAccessAssignment {
  if (
    !record(value) ||
    typeof value.id !== 'string' ||
    typeof value.workspaceMembershipId !== 'string' ||
    typeof value.companyId !== 'string' ||
    typeof value.active !== 'boolean' ||
    !assignmentBundleLabel(value.bundle)
  )
    throw new Error('Invalid Company access administration assignment.');
  return versionedAssignment(value.bundle, value.permissionSetVersion, {
    id: value.id,
    workspaceMembershipId: value.workspaceMembershipId,
    companyId: value.companyId,
    active: value.active,
  });
}

function versionedAssignment<Label extends AssignmentBundleLabel>(
  bundle: Label,
  version: unknown,
  base: AssignmentBase,
): AssignmentFor<Label> {
  const allowed: readonly CapturedVersion<Label>[] = CAPTURED_VERSIONS[bundle];
  const permissionSetVersion = allowed.find(
    (candidate) => candidate === version,
  );
  if (permissionSetVersion === undefined)
    throw new Error('Unknown captured Company access version.');
  return { ...base, bundle, permissionSetVersion };
}

function assignmentBundleLabel(value: unknown): value is AssignmentBundleLabel {
  return typeof value === 'string' && Object.hasOwn(CAPTURED_VERSIONS, value);
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
