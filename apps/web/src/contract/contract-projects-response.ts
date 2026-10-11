import {
  PROJECT_STATUSES,
  type ProjectStatus,
} from '../project/project-lifecycle-response';
export interface ContractProjectLink {
  id: string;
  contractId: string;
  projectId: string;
  revision: number;
  created: boolean;
  actorWorkspaceMembershipId: string;
  linkedAt: string;
}
export interface LinkedContract {
  id: string;
  opportunityId: string;
  clientRequestId: string;
  illustrativeReference: number;
  kind: 'CONTRACT' | 'PRECONTRACT';
  provisional: true;
  linkedAt: string;
}
export interface ProjectSummary {
  id: string;
  title: string;
  status: ProjectStatus;
  createdAt: string;
}
export type ContractProjectCandidate = ProjectSummary & {
  alreadyLinked: boolean;
  otherContracts: LinkedContract[];
};
export type LinkedProject = ProjectSummary & { link: ContractProjectLink };
export function readContractProjectLink(value: unknown): ContractProjectLink {
  const row = record(value);
  if (
    typeof row.created !== 'boolean' ||
    typeof row.revision !== 'number' ||
    !Number.isInteger(row.revision) ||
    row.revision < 4 ||
    row.revision > 2147483646
  )
    throw new Error('Invalid Contract Project link.');
  return {
    id: text(row.id),
    contractId: text(row.contractId),
    projectId: text(row.projectId),
    revision: row.revision,
    created: row.created,
    actorWorkspaceMembershipId: text(row.actorWorkspaceMembershipId),
    linkedAt: instant(row.linkedAt),
  };
}
export function readLinkedContracts(value: unknown): LinkedContract[] {
  const row = record(value);
  if (!Array.isArray(row.items)) throw new Error('Invalid linked Contracts.');
  return row.items.map((item: unknown) => {
    const contract = record(item);
    const kind = contract.kind;
    if (
      (kind !== 'CONTRACT' && kind !== 'PRECONTRACT') ||
      contract.provisional !== true ||
      typeof contract.illustrativeReference !== 'number' ||
      !Number.isSafeInteger(contract.illustrativeReference) ||
      contract.illustrativeReference < 1
    )
      throw new Error('Invalid linked Contract.');
    return {
      id: text(contract.id),
      opportunityId: text(contract.opportunityId),
      clientRequestId: text(contract.clientRequestId),
      illustrativeReference: contract.illustrativeReference,
      kind,
      provisional: true,
      linkedAt: instant(contract.linkedAt),
    };
  });
}
export function readContractProjectCandidates(
  value: unknown,
): ContractProjectCandidate[] {
  const row = record(value);
  if (!Array.isArray(row.items) || row.items.length > 50)
    throw new Error('Invalid Contract Project candidates.');
  return row.items.map((item: unknown) => {
    const project = record(item);
    if (typeof project.alreadyLinked !== 'boolean')
      throw new Error('Invalid linked indication.');
    const summary = projectSummary(project);
    if (summary.status === 'completed' || summary.status === 'cancelled')
      throw new Error('Invalid candidate lifecycle.');
    return {
      ...summary,
      alreadyLinked: project.alreadyLinked,
      otherContracts: readLinkedContracts({ items: project.otherContracts }),
    };
  });
}
export function readLinkedProjects(
  value: unknown,
  contractId: string,
  revision: number,
): LinkedProject[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 50)
    throw new Error('Invalid linked Projects.');
  return value.map((item: unknown) => {
    const project = record(item),
      summary = projectSummary(project),
      link = readContractProjectLink(project.link);
    if (
      link.contractId !== contractId ||
      link.projectId !== summary.id ||
      link.revision > revision
    )
      throw new Error('Mismatched Contract Project link.');
    return { ...summary, link };
  });
}
export function readCreatedContractProject(value: unknown) {
  const row = record(value),
    project = projectSummary(record(row.project)),
    link = readContractProjectLink(row.link);
  if (
    !link.created ||
    project.id !== link.projectId ||
    project.status !== 'preparatory'
  )
    throw new Error('Invalid created Contract Project.');
  return { project, link };
}
function projectSummary(row: Record<string, unknown>): ProjectSummary {
  const status = PROJECT_STATUSES.find((status) => status === row.status);
  if (!status) throw new Error('Invalid Project status.');
  return {
    id: text(row.id),
    title: text(row.title),
    status,
    createdAt: instant(row.createdAt),
  };
}
function record(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new Error('Invalid Contract relationship.');
  return Object.fromEntries(Object.entries(value));
}
function text(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0)
    throw new Error('Invalid Contract relationship text.');
  return value;
}
function instant(value: unknown): string {
  const result = text(value);
  if (
    !Number.isFinite(Date.parse(result)) ||
    new Date(result).toISOString() !== result
  )
    throw new Error('Invalid Contract relationship instant.');
  return result;
}
