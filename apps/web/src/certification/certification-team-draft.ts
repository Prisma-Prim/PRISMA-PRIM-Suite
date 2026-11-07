import {
  actingFromDraft,
  emptyActingDraft,
  sameName,
  type ActAttribution,
  type ActingDraft,
} from './certification-attribution';
import {
  IMPARTIALITY_DECLARATIONS,
  TEAM_LIMITS,
  declaresConflict,
  teamCompositionRefusal,
  teamMembershipIds,
  teamWithoutConflict,
  type AuditTeam,
  type DeclarationState,
  type ImpartialityAnalysis,
  type ImpartialityDeclaration,
  type TeamMember,
  type TeamRole,
  type TeamRule,
} from './certification-team';
import {
  CERTIFICATION_LIMITS,
  type CaseTimeline,
  type CertificationAttachment,
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
  /** No default: each declaration is answered explicitly. */
  declarations: Record<ImpartialityDeclaration, DeclarationState | null>;
  /** Asked only while a declaration is a conflict or still to verify. */
  conflictNote: string;
}

export interface TeamDraft {
  members: TeamMemberDraft[];
  /** The documented impartiality analysis; blank when none is documented. */
  analysisNote: string;
  /** Attachments of the Case cited by the analysis, in register order. */
  analysisEvidence: string[];
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
        | 'analysisRequired'
        | 'reasonRequired';
    };

/** The decision form as typed; no decision and no attestation is preselected. */
export interface DecisionDraft {
  decision: 'approved' | 'returned' | null;
  reason: string;
  /** The certification body's decision maker, when recorded on their behalf. */
  onBehalf: ActingDraft;
  independenceAttested: boolean;
}

export type DecisionCheck =
  | ({ status: 'valid'; onBehalf: ActAttribution | null } & (
      | { decision: 'approved'; reason: null }
      | { decision: 'returned'; reason: string }
    ))
  | {
      status:
        | 'incomplete'
        | 'acting'
        | 'actingOnTeam'
        | 'conflictDeclared'
        | 'attestation';
    };

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

/**
 * A first proposal starts with one empty member and no analysis; a new
 * version from the latest, its analysis included.
 */
export function teamDraftFor(current: TeamVersion | null): TeamDraft {
  const analysis = current?.value.impartialityAnalysis ?? null;
  return {
    members: current
      ? current.value.members.map((member) => ({
          name: member.name,
          role: member.role,
          workspaceMembershipId: member.workspaceMembershipId ?? '',
          holdsCategory: member.holdsCategory,
          competenceNote: member.competenceNote,
          declarations: { ...member.declarations },
          conflictNote: member.conflictNote ?? '',
        }))
      : [emptyTeamMember()],
    analysisNote: analysis?.note ?? '',
    analysisEvidence: [...(analysis?.evidenceAttachmentIds ?? [])],
    reason: '',
  };
}

export function emptyDecisionDraft(): DecisionDraft {
  return {
    decision: null,
    reason: '',
    onBehalf: emptyActingDraft(),
    independenceAttested: false,
  };
}

/** Some declaration of this draft member is a conflict or still to verify. */
export function draftDeclaresConflict(member: TeamMemberDraft): boolean {
  return IMPARTIALITY_DECLARATIONS.some((declaration) => {
    const state = member.declarations[declaration];
    return state !== null && state !== 'confirmed';
  });
}

/**
 * Mirrors the server: every member complete with explicit declarations, a
 * conflict note exactly when one is not confirmed, links only to the
 * offered memberships and each at most once, then the composition rules;
 * an impartiality analysis within its limits citing attachments of the
 * Case, required when the application declared a consultant; and, for a
 * new version, its reason.
 */
export function teamFromDraft(
  draft: TeamDraft,
  {
    correcting,
    linkable,
    consultantDeclared,
    register,
  }: {
    correcting: boolean;
    linkable: ReadonlySet<string>;
    consultantDeclared: boolean;
    register: readonly CertificationAttachment[];
  },
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
  const impartialityAnalysis = analysisFromDraft(draft, register);
  if (
    impartialityAnalysis === undefined ||
    (consultantDeclared && impartialityAnalysis === null)
  )
    return { status: 'analysisRequired' };
  const team = { members, impartialityAnalysis };
  if (!correcting) return { status: 'valid', team, reason: null };
  const reason = required(draft.reason, CERTIFICATION_LIMITS.reason);
  return reason === undefined
    ? { status: 'reasonRequired' }
    : { status: 'valid', team, reason };
}

/**
 * Mirrors the server: an explicit decision, a reason to return, a complete
 * act on behalf of the certification body by a person named on no team
 * version, no approval unless every declaration is confirmed, then the
 * explicit attestation of independence.
 */
export function decisionFromDraft(
  draft: DecisionDraft,
  {
    team,
    timeline,
    register,
  }: {
    team: AuditTeam;
    timeline: CaseTimeline;
    register: readonly CertificationAttachment[];
  },
): DecisionCheck {
  if (draft.decision === null) return { status: 'incomplete' };
  const reason =
    draft.decision === 'returned'
      ? required(draft.reason, CERTIFICATION_LIMITS.reason)
      : null;
  if (reason === undefined) return { status: 'incomplete' };
  const onBehalf = actingFromDraft(draft.onBehalf, register);
  if (onBehalf === undefined) return { status: 'acting' };
  if (onBehalf && namedOnAnyTeamVersion(timeline, onBehalf.actedBy))
    return { status: 'actingOnTeam' };
  if (draft.decision === 'approved' && !teamWithoutConflict(team))
    return { status: 'conflictDeclared' };
  if (!draft.independenceAttested) return { status: 'attestation' };
  return reason === null
    ? { status: 'valid', onBehalf, decision: 'approved', reason }
    : { status: 'valid', onBehalf, decision: 'returned', reason };
}

/**
 * Whether a person is named like a member of any proposed team version, as
 * the server compares names: such a person cannot act for the
 * certification body where independence from the team is required.
 */
export function namedOnAnyTeamVersion(
  timeline: CaseTimeline,
  name: string,
): boolean {
  return timeline.entries.some(
    (entry) =>
      entry.step === 'team' &&
      entry.value.members.some((member) => sameName(member.name, name)),
  );
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
    noConsultancy,
    noEmployment,
    noManagementInvolvement,
    confidentiality,
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

/**
 * No analysis when nothing is typed or cited; otherwise its note within its
 * limit and at most ten attachments of the Case. Undefined when incomplete.
 */
function analysisFromDraft(
  draft: TeamDraft,
  register: readonly CertificationAttachment[],
): ImpartialityAnalysis | null | undefined {
  const note = draft.analysisNote.trim();
  const evidence = draft.analysisEvidence;
  if (!note && evidence.length === 0) return null;
  if (
    !note ||
    note.length > TEAM_LIMITS.analysisNote ||
    evidence.length > TEAM_LIMITS.analysisEvidence ||
    new Set(evidence).size !== evidence.length ||
    evidence.some((id) => !register.some((item) => item.id === id))
  )
    return undefined;
  return { note, evidenceAttachmentIds: [...evidence] };
}

function required(value: string, limit: number): string | undefined {
  const trimmed = value.trim();
  return trimmed && trimmed.length <= limit ? trimmed : undefined;
}
