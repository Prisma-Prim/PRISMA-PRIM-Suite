import type { CertificationDocumentRole } from './certification-response';
import type { AuditTeam } from './certification-team';

/**
 * The server's Stage contract: the programme manager plans each Stage against
 * the confirmed duration; the leader of the approved audit team reports it.
 * The server stays authoritative; this module only mirrors its rules.
 */
export const AUDIT_STAGES = ['stage_1', 'stage_2'] as const;
export type AuditStage = (typeof AUDIT_STAGES)[number];

/** The server's bounds for Stage plans and reports. */
export const STAGE_LIMITS = {
  objectives: 2000,
  scope: 2000,
  deviationNote: 2000,
  conclusionNote: 4000,
  summary: 4000,
} as const;

export interface StagePlan {
  /** Calendar dates, `YYYY-MM-DD`, the start not after the end. */
  startDate: string;
  endDate: string;
  /** Auditor-days with at most two decimals; on site above zero. */
  onSiteDays: string;
  remoteDays: string;
  objectives: string;
  scope: string;
  planAttachmentId: string;
  /** Null while the plan has not been sent to the client. */
  sentToClientOn: string | null;
  /** Explains on-site days that differ from the confirmed duration. */
  deviationNote: string | null;
}

export type Stage1Conclusion = 'ready' | 'not_ready';

export interface Stage1Report {
  reportDate: string;
  /** Stage 1 always completes the document review. */
  documentReviewCompleted: true;
  conclusion: Stage1Conclusion;
  conclusionNote: string;
  reportAttachmentId: string;
  participantListAttachmentId: string | null;
}

export interface Stage2Report {
  reportDate: string;
  summary: string;
  reportAttachmentId: string;
  participantListAttachmentId: string | null;
  annexAttachmentId: string | null;
}

/** The attachment a Stage record refers to, by the role it must carry. */
export type StageAttachmentSlot =
  'plan' | 'report' | 'participantList' | 'annex';

/** The attachment roles the server accepts for each slot. */
export function slotRoles(
  slot: StageAttachmentSlot,
): readonly CertificationDocumentRole[] {
  switch (slot) {
    case 'plan':
      return ['plan'];
    case 'report':
      return ['report'];
    case 'participantList':
      return ['participant_list'];
    case 'annex':
      return ['report', 'evidence', 'iso22000_annex'];
  }
  return unexpected(slot);
}

/** The attachments a Stage record refers to, each with its slot. */
export function stageAttachmentReferences(
  value: StagePlan | Stage1Report | Stage2Report,
): { slot: StageAttachmentSlot; attachmentId: string }[] {
  if ('planAttachmentId' in value)
    return [{ slot: 'plan', attachmentId: value.planAttachmentId }];
  const references: { slot: StageAttachmentSlot; attachmentId: string }[] = [
    { slot: 'report', attachmentId: value.reportAttachmentId },
  ];
  if (value.participantListAttachmentId !== null)
    references.push({
      slot: 'participantList',
      attachmentId: value.participantListAttachmentId,
    });
  if ('annexAttachmentId' in value && value.annexAttachmentId !== null)
    references.push({ slot: 'annex', attachmentId: value.annexAttachmentId });
  return references;
}

const DAY_AMOUNT = /^(0|[1-9]\d{0,2})(?:\.(\d{1,2}))?$/u;

/**
 * Whole hundredths of an amount of auditor-days below 1,000 with at most two
 * decimals, as the server accepts it; zero only where allowed.
 */
export function stageDayCents(
  amount: string,
  { zeroAllowed }: { zeroAllowed: boolean },
): number | undefined {
  const match = DAY_AMOUNT.exec(amount);
  if (!match) return undefined;
  const [, whole = '0', fraction = ''] = match;
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  return cents > 0 || zeroAllowed ? cents : undefined;
}

/** On-site days differ from the confirmed amount: the plan needs a note. */
export function deviatesFromConfirmed(
  onSiteDays: string,
  confirmed: string,
): boolean {
  return (
    stageDayCents(onSiteDays, { zeroAllowed: false }) !==
    stageDayCents(confirmed, { zeroAllowed: false })
  );
}

/** The latest team version when the latest decision approves it. */
export function approvedTeam({
  team,
  teamDecision,
}: {
  team: { version: number; value: AuditTeam } | null;
  teamDecision: {
    value: { teamVersion: number; decision: 'approved' | 'returned' };
  } | null;
}): AuditTeam | undefined {
  return team &&
    teamDecision?.value.decision === 'approved' &&
    teamDecision.value.teamVersion === team.version
    ? team.value
    : undefined;
}

/** Whether this membership is linked to the leader of this team. */
export function leadsTeam(
  team: AuditTeam,
  workspaceMembershipId: string,
): boolean {
  return team.members.some(
    (member) =>
      member.role === 'team_leader' &&
      member.workspaceMembershipId === workspaceMembershipId,
  );
}

function unexpected(value: never): never {
  throw new Error(`Unexpected Certification Stage value: ${String(value)}`);
}
