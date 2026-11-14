import type { ActAttribution } from './certification-attribution';

/** The roles a member plays in the audit team. */
export const TEAM_ROLES = [
  'team_leader',
  'auditor',
  'technical_expert',
  'observer',
] as const;
export type TeamRole = (typeof TEAM_ROLES)[number];

/** The impartiality statements each member answers explicitly. */
export const IMPARTIALITY_DECLARATIONS = [
  'noConsultancy',
  'noEmployment',
  'noManagementInvolvement',
  'confidentiality',
] as const;
export type ImpartialityDeclaration =
  (typeof IMPARTIALITY_DECLARATIONS)[number];

/** A declaration is confirmed, a declared conflict, or still to verify. */
export const DECLARATION_STATES = [
  'confirmed',
  'conflict',
  'to_verify',
] as const;
export type DeclarationState = (typeof DECLARATION_STATES)[number];

/** The server's bounds for a proposed team. */
export const TEAM_LIMITS = {
  members: 10,
  name: 200,
  competenceNote: 1000,
  conflictNote: 1000,
  analysisNote: 4000,
  analysisEvidence: 10,
} as const;

export interface TeamMember {
  name: string;
  role: TeamRole;
  /** The Workspace membership this member is, when linked. */
  workspaceMembershipId: string | null;
  /** The member holds the competence for the client's category. */
  holdsCategory: boolean;
  competenceNote: string;
  declarations: Record<ImpartialityDeclaration, DeclarationState>;
  /** Present exactly when a declaration is not confirmed. */
  conflictNote: string | null;
}

/** A documented impartiality analysis, kept even when every declaration is confirmed. */
export interface ImpartialityAnalysis {
  note: string;
  /** Attachments of the Case, each cited once. */
  evidenceAttachmentIds: string[];
}

export interface AuditTeam {
  members: TeamMember[];
  impartialityAnalysis: ImpartialityAnalysis | null;
}

export type TeamDecision = {
  teamVersion: number;
  /** The certification body's decision maker, when recorded on their behalf. */
  onBehalf: ActAttribution | null;
  /** The recording member attests the approver is not on the audit team. */
  independenceAttested: true;
} & (
  | { decision: 'approved'; reason: null }
  | { decision: 'returned'; reason: string }
);

/** Why a composition breaks the server's rules, in the server's order. */
export type TeamRule =
  'size' | 'conflictNote' | 'duplicateLink' | 'leader' | 'category';

/** Some declaration of this member is a conflict or still to verify. */
export function declaresConflict(member: {
  declarations: Record<ImpartialityDeclaration, DeclarationState>;
}): boolean {
  return IMPARTIALITY_DECLARATIONS.some(
    (declaration) => member.declarations[declaration] !== 'confirmed',
  );
}

/** Some declaration of this member is still to verify. */
export function awaitsVerification(member: {
  declarations: Record<ImpartialityDeclaration, DeclarationState>;
}): boolean {
  return IMPARTIALITY_DECLARATIONS.some(
    (declaration) => member.declarations[declaration] === 'to_verify',
  );
}

/** Every declaration of every member is confirmed: only then may the team be approved. */
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
