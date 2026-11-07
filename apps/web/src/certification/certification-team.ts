/** The roles a member plays in the audit team. */
export const TEAM_ROLES = [
  'team_leader',
  'auditor',
  'technical_expert',
  'observer',
] as const;
export type TeamRole = (typeof TEAM_ROLES)[number];

/** The impartiality statements each member confirms or not, explicitly. */
export const IMPARTIALITY_DECLARATIONS = [
  'noConsultancy',
  'noEmployment',
  'noManagementInvolvement',
  'confidentiality',
] as const;
export type ImpartialityDeclaration =
  (typeof IMPARTIALITY_DECLARATIONS)[number];

/** The server's bounds for a proposed team. */
export const TEAM_LIMITS = {
  members: 10,
  name: 200,
  competenceNote: 1000,
  conflictNote: 1000,
} as const;

export interface TeamMember {
  name: string;
  role: TeamRole;
  /** The Workspace membership this member is, when linked. */
  workspaceMembershipId: string | null;
  /** The member holds the competence for the client's category. */
  holdsCategory: boolean;
  competenceNote: string;
  declarations: Record<ImpartialityDeclaration, boolean>;
  /** Present exactly when a declaration is not confirmed. */
  conflictNote: string | null;
}

export interface AuditTeam {
  members: TeamMember[];
}

export type TeamDecision = { teamVersion: number } & (
  | { decision: 'approved'; reason: null }
  | { decision: 'returned'; reason: string }
);

/** Why a composition breaks the server's rules, in the server's order. */
export type TeamRule =
  'size' | 'conflictNote' | 'duplicateLink' | 'leader' | 'category';

/** Some declaration of this member is not confirmed. */
export function declaresConflict(member: {
  declarations: Record<ImpartialityDeclaration, boolean>;
}): boolean {
  return IMPARTIALITY_DECLARATIONS.some(
    (declaration) => !member.declarations[declaration],
  );
}

/** Every declaration of every member confirms the absence of conflict. */
export function teamWithoutConflict(team: AuditTeam): boolean {
  return team.members.every((member) => !declaresConflict(member));
}

/** The Workspace memberships linked to members of this team. */
export function teamMembershipIds(team: {
  members: readonly TeamMember[];
}): string[] {
  return team.members.flatMap((member) =>
    member.workspaceMembershipId === null ? [] : [member.workspaceMembershipId],
  );
}

/**
 * Mirrors the server's composition rules: one to ten members, a conflict note
 * exactly when a declaration is not confirmed, each membership linked once,
 * exactly one team leader, and the client's category held by a non-observer;
 * when the leader does not hold it, a technical expert who does is required.
 */
export function teamCompositionRefusal(
  members: readonly TeamMember[],
): TeamRule | null {
  if (members.length < 1 || members.length > TEAM_LIMITS.members) return 'size';
  if (
    members.some(
      (member) => declaresConflict(member) !== (member.conflictNote !== null),
    )
  )
    return 'conflictNote';
  const links = teamMembershipIds({ members });
  if (new Set(links).size !== links.length) return 'duplicateLink';
  const leaders = members.filter((member) => member.role === 'team_leader');
  const [leader] = leaders;
  if (leaders.length !== 1 || !leader) return 'leader';
  const competent = members.some(
    (member) => member.role !== 'observer' && member.holdsCategory,
  );
  const expertWithCategory = members.some(
    (member) => member.role === 'technical_expert' && member.holdsCategory,
  );
  if (!competent || (!leader.holdsCategory && !expertWithCategory))
    return 'category';
  return null;
}
