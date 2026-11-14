import {
  COMPANY_GRANT_LABELS,
  COMPANY_GRANT_REGISTRY,
  type CompanyGrantBundle,
  type CompanyGrantOf,
} from './company-grants';

// The captured versions the server may report for each administrable bundle
// come from the Company grants registry mirror, keyed by bundle label. An
// unlisted label or version fails closed; the screen never infers one.
type LabelOf<Bundle extends CompanyGrantBundle> =
  (typeof COMPANY_GRANT_LABELS)[Bundle];
export type AssignmentBundleLabel = LabelOf<CompanyGrantBundle>;
type BundleLabelled<Label extends AssignmentBundleLabel> = {
  [Bundle in CompanyGrantBundle]: LabelOf<Bundle> extends Label
    ? Bundle
    : never;
}[CompanyGrantBundle];
type CapturedVersion<Label extends AssignmentBundleLabel> = CompanyGrantOf<
  BundleLabelled<Label>
>['permissionSetVersion'];

const BUNDLE_BY_LABEL: ReadonlyMap<string, CompanyGrantBundle> = new Map(
  Object.keys(COMPANY_GRANT_LABELS)
    .filter((bundle): bundle is CompanyGrantBundle =>
      Object.hasOwn(COMPANY_GRANT_LABELS, bundle),
    )
    .map((bundle) => [COMPANY_GRANT_LABELS[bundle], bundle]),
);

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
  if (!isCapturedVersion(bundle, version))
    throw new Error('Unknown captured Company access version.');
  return { ...base, bundle, permissionSetVersion: version };
}

/** Whether an assignment of `label` can have captured `version`. */
function isCapturedVersion<Label extends AssignmentBundleLabel>(
  label: Label,
  version: unknown,
): version is CapturedVersion<Label> {
  const bundle = BUNDLE_BY_LABEL.get(label);
  if (bundle === undefined) return false;
  const versions = Object.keys(COMPANY_GRANT_REGISTRY[bundle]);
  return versions.length === 0
    ? version === null
    : typeof version === 'string' && versions.includes(version);
}

function assignmentBundleLabel(value: unknown): value is AssignmentBundleLabel {
  return typeof value === 'string' && BUNDLE_BY_LABEL.has(value);
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
