import {
  IMPARTIALITY_DECLARATIONS,
  TEAM_LIMITS,
  declaresConflict,
  teamCompositionRefusal,
  teamMembershipIds,
  teamWithoutConflict,
  type AuditTeam,
  type ImpartialityDeclaration,
  type TeamMember,
  type TeamRole,
  type TeamRule,
} from './certification-team';
import {
  CERTIFICATION_LIMITS,
  type CaseTimeline,
  type TeamVersion,
} from './certification-response';

/** One member as typed; nothing about impartiality is preselected. */
export interface TeamMemberDraft {
  name: string;
  /** No default: the role is chosen explicitly. */
  role: TeamRole | null;
  /** The linked Workspace membership, or empty when not linked. */
  workspaceMembershipId: string;
  holdsCategory: boolean;
  competenceNote: string;
  /** No default: each declaration is answered yes or no explicitly. */
  declarations: Record<ImpartialityDeclaration, 'yes' | 'no' | null>;
  /** Asked only while a declaration is answered no. */
  conflictNote: string;
}

export interface TeamDraft {
  members: TeamMemberDraft[];
  reason: string;
}

export type TeamCheck =
  | {
      status: 'valid';
      team: AuditTeam;
      /** Null for a first proposal; a new version states its reason. */
      reason: string | null;
    }
  | {
      status:
        | 'incomplete'
        | 'conflictNote'
        | 'link'
        | 'leader'
        | 'category'
        | 'reasonRequired';
    };

/** The decision form as typed; no decision is preselected. */
export interface DecisionDraft {
  decision: 'approved' | 'returned' | null;
  reason: string;
}

export type DecisionCheck =
  | { status: 'valid'; decision: 'approved'; reason: null }
  | { status: 'valid'; decision: 'returned'; reason: string }
  | { status: 'incomplete' | 'conflictDeclared' };

export function emptyTeamMember(): TeamMemberDraft {
  return {
    name: '',
    role: null,
    workspaceMembershipId: '',
    holdsCategory: false,
    competenceNote: '',
    declarations: {
      noConsultancy: null,
      noEmployment: null,
      noManagementInvolvement: null,
      confidentiality: null,
    },
    conflictNote: '',
  };
}

/** A first proposal starts with one empty member; a new version from the latest. */
export function teamDraftFor(current: TeamVersion | null): TeamDraft {
  return {
    members: current
      ? current.value.members.map((member) => ({
          name: member.name,
          role: member.role,
          workspaceMembershipId: member.workspaceMembershipId ?? '',
          holdsCategory: member.holdsCategory,
          competenceNote: member.competenceNote,
          declarations: {
            noConsultancy: answer(member.declarations.noConsultancy),
            noEmployment: answer(member.declarations.noEmployment),
            noManagementInvolvement: answer(
              member.declarations.noManagementInvolvement,
            ),
            confidentiality: answer(member.declarations.confidentiality),
          },
          conflictNote: member.conflictNote ?? '',
        }))
      : [emptyTeamMember()],
    reason: '',
  };
}

export function emptyDecisionDraft(): DecisionDraft {
  return { decision: null, reason: '' };
}

/** Some declaration of this draft member is answered no. */
export function draftDeclaresConflict(member: TeamMemberDraft): boolean {
  return IMPARTIALITY_DECLARATIONS.some(
    (declaration) => member.declarations[declaration] === 'no',
  );
}

/**
 * Mirrors the server: every member complete with explicit declarations, a
 * conflict note exactly when one is answered no, links only to the offered
 * memberships and each at most once, then the composition rules and, for a
 * new version, its reason.
 */
export function teamFromDraft(
  draft: TeamDraft,
  {
    correcting,
    linkable,
  }: { correcting: boolean; linkable: ReadonlySet<string> },
): TeamCheck {
  if (draft.members.length < 1 || draft.members.length > TEAM_LIMITS.members)
    return { status: 'incomplete' };
  const members: TeamMember[] = [];
  for (const entry of draft.members) {
    const member = memberFromDraft(entry);
    if (member === 'incomplete' || member === 'conflictNote')
      return { status: member };
    if (
      member.workspaceMembershipId !== null &&
      !linkable.has(member.workspaceMembershipId)
    )
      return { status: 'link' };
    members.push(member);
  }
  const refusal = teamCompositionRefusal(members);
  if (refusal !== null) return { status: compositionStatus(refusal) };
  const team = { members };
  if (!correcting) return { status: 'valid', team, reason: null };
  const reason = required(draft.reason, CERTIFICATION_LIMITS.reason);
  return reason === undefined
    ? { status: 'reasonRequired' }
    : { status: 'valid', team, reason };
}

/** Mirrors the server: an explicit decision, a reason to return, no approval of a declared conflict. */
export function decisionFromDraft(
  draft: DecisionDraft,
  team: AuditTeam,
): DecisionCheck {
  if (draft.decision === null) return { status: 'incomplete' };
  if (draft.decision === 'approved')
    return teamWithoutConflict(team)
      ? { status: 'valid', decision: 'approved', reason: null }
      : { status: 'conflictDeclared' };
  const reason = required(draft.reason, CERTIFICATION_LIMITS.reason);
  return reason === undefined
    ? { status: 'incomplete' }
    : { status: 'valid', decision: 'returned', reason };
}

/**
 * Whether this membership is linked to a member of any proposed team
 * version: the server then refuses its decision for independence.
 */
export function linkedToAnyTeamVersion(
  timeline: CaseTimeline,
  workspaceMembershipId: string,
): boolean {
  return timeline.entries.some(
    (entry) =>
      entry.step === 'team' &&
      teamMembershipIds(entry.value).includes(workspaceMembershipId),
  );
}

function memberFromDraft(
  entry: TeamMemberDraft,
): TeamMember | 'incomplete' | 'conflictNote' {
  const name = required(entry.name, TEAM_LIMITS.name);
  const competenceNote = required(
    entry.competenceNote,
    TEAM_LIMITS.competenceNote,
  );
  const {
    noConsultancy,
    noEmployment,
    noManagementInvolvement,
    confidentiality,
  } = entry.declarations;
  if (
    name === undefined ||
    competenceNote === undefined ||
    entry.role === null ||
    noConsultancy === null ||
    noEmployment === null ||
    noManagementInvolvement === null ||
    confidentiality === null
  )
    return 'incomplete';
  const declarations = {
    noConsultancy: noConsultancy === 'yes',
    noEmployment: noEmployment === 'yes',
    noManagementInvolvement: noManagementInvolvement === 'yes',
    confidentiality: confidentiality === 'yes',
  };
  // The note is asked only for a declared conflict; a hidden note is not sent.
  const conflict = declaresConflict({ declarations });
  const note = entry.conflictNote.trim();
  if (conflict && !note) return 'conflictNote';
  if (conflict && note.length > TEAM_LIMITS.conflictNote) return 'incomplete';
  return {
    name,
    role: entry.role,
    workspaceMembershipId: entry.workspaceMembershipId || null,
    holdsCategory: entry.holdsCategory,
    competenceNote,
    declarations,
    conflictNote: conflict ? note : null,
  };
}

function compositionStatus(
  rule: TeamRule,
): Exclude<TeamCheck, { status: 'valid' }>['status'] {
  switch (rule) {
    case 'size':
      return 'incomplete';
    case 'conflictNote':
      return 'conflictNote';
    case 'duplicateLink':
      return 'link';
    case 'leader':
      return 'leader';
    case 'category':
      return 'category';
  }
  return unexpected(rule);
}

function unexpected(value: never): never {
  throw new Error(`Unexpected team rule: ${String(value)}`);
}

function answer(confirmed: boolean): 'yes' | 'no' {
  return confirmed ? 'yes' : 'no';
}

function required(value: string, limit: number): string | undefined {
  const trimmed = value.trim();
  return trimmed && trimmed.length <= limit ? trimmed : undefined;
}
