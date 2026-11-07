import {
  CERTIFICATION_LIMITS,
  isCalendarDate,
  type CertificationAttachment,
} from './certification-response';
import {
  STAGE_LIMITS,
  slotRoles,
  stageDayCents,
  type Stage1Conclusion,
  type Stage1Report,
  type Stage2Report,
  type StageAttachmentSlot,
  type StagePlan,
} from './certification-stages';

/** The plan form as typed; amounts and dates stay text until they are sent. */
export interface StagePlanDraft {
  startDate: string;
  endDate: string;
  onSiteDays: string;
  remoteDays: string;
  objectives: string;
  scope: string;
  planAttachmentId: string;
  /** Empty while the plan has not been sent to the client. */
  sentToClientOn: string;
  /** Asked only while the on-site days differ from the confirmed duration. */
  deviationNote: string;
  reason: string;
}

/** The Stage 1 report form as typed; nothing is preselected. */
export interface Stage1ReportDraft {
  reportDate: string;
  documentReviewCompleted: boolean;
  conclusion: Stage1Conclusion | null;
  conclusionNote: string;
  reportAttachmentId: string;
  /** Empty when no participant list is attached to the report. */
  participantListAttachmentId: string;
  reason: string;
}

/** The Stage 2 report form as typed. */
export interface Stage2ReportDraft {
  reportDate: string;
  summary: string;
  reportAttachmentId: string;
  participantListAttachmentId: string;
  annexAttachmentId: string;
  reason: string;
}

export type StagePlanCheck =
  | {
      status: 'valid';
      plan: StagePlan;
      /** Null for a first plan; a new version states its reason. */
      reason: string | null;
    }
  | {
      status:
        | 'incomplete'
        | 'dates'
        | 'stage2Start'
        | 'deviationNote'
        | 'reasonRequired';
    };

export type StageReportCheck<Report> =
  | {
      status: 'valid';
      report: Report;
      /** Null for a first report; a new version states its reason. */
      reason: string | null;
    }
  | {
      status: 'incomplete' | 'documentReview' | 'beforePlan' | 'reasonRequired';
    };

/** A first plan starts empty; a correction from the latest plan's exact values. */
export function stagePlanDraftFor(current: StagePlan | null): StagePlanDraft {
  return current
    ? {
        startDate: current.startDate,
        endDate: current.endDate,
        onSiteDays: current.onSiteDays,
        remoteDays: current.remoteDays,
        objectives: current.objectives,
        scope: current.scope,
        planAttachmentId: current.planAttachmentId,
        sentToClientOn: current.sentToClientOn ?? '',
        deviationNote: current.deviationNote ?? '',
        reason: '',
      }
    : {
        startDate: '',
        endDate: '',
        onSiteDays: '',
        remoteDays: '',
        objectives: '',
        scope: '',
        planAttachmentId: '',
        sentToClientOn: '',
        deviationNote: '',
        reason: '',
      };
}

/** A first report starts empty and unconfirmed; a correction from the latest. */
export function stage1ReportDraftFor(
  current: Stage1Report | null,
): Stage1ReportDraft {
  return current
    ? {
        reportDate: current.reportDate,
        documentReviewCompleted: current.documentReviewCompleted,
        conclusion: current.conclusion,
        conclusionNote: current.conclusionNote,
        reportAttachmentId: current.reportAttachmentId,
        participantListAttachmentId: current.participantListAttachmentId ?? '',
        reason: '',
      }
    : {
        reportDate: '',
        documentReviewCompleted: false,
        conclusion: null,
        conclusionNote: '',
        reportAttachmentId: '',
        participantListAttachmentId: '',
        reason: '',
      };
}

export function stage2ReportDraftFor(
  current: Stage2Report | null,
): Stage2ReportDraft {
  return {
    reportDate: current?.reportDate ?? '',
    summary: current?.summary ?? '',
    reportAttachmentId: current?.reportAttachmentId ?? '',
    participantListAttachmentId: current?.participantListAttachmentId ?? '',
    annexAttachmentId: current?.annexAttachmentId ?? '',
    reason: '',
  };
}

/** The Case's attachments a slot may refer to, in attachment order. */
export function slotAttachments(
  register: readonly CertificationAttachment[],
  slot: StageAttachmentSlot,
): CertificationAttachment[] {
  const roles = slotRoles(slot);
  return register.filter((item) => roles.includes(item.role));
}

/**
 * The typed on-site days are a valid amount other than the confirmed one:
 * the deviation note is then asked for. Unreadable days ask for nothing yet.
 */
export function draftDeviates(onSiteDays: string, confirmed: string): boolean {
  const typed = stageDayCents(onSiteDays.trim(), { zeroAllowed: false });
  return (
    typed !== undefined &&
    typed !== stageDayCents(confirmed, { zeroAllowed: false })
  );
}

/**
 * Mirrors the server: real dates, the start not after the end, on-site days
 * above zero and remote days with at most two decimals, the objectives and
 * scope, an attachment with the plan role, an optional sending date; a
 * Stage 2 plan starting after the Stage 1 report date; a deviation note
 * exactly when the on-site days differ from the confirmed duration; and, for
 * a new version, its reason.
 */
export function stagePlanFromDraft(
  draft: StagePlanDraft,
  {
    register,
    confirmedOnSite,
    startsAfter,
    correcting,
  }: {
    register: readonly CertificationAttachment[];
    /** The confirmed on-site auditor-days of this Stage. */
    confirmedOnSite: string;
    /** Stage 2 starts after this date, the Stage 1 report date. */
    startsAfter: string | null;
    correcting: boolean;
  },
): StagePlanCheck {
  const startDate = draft.startDate.trim();
  const endDate = draft.endDate.trim();
  const onSiteDays = draft.onSiteDays.trim();
  const remoteDays = draft.remoteDays.trim();
  const sentToClientOn = draft.sentToClientOn.trim();
  const objectives = required(draft.objectives, STAGE_LIMITS.objectives);
  const scope = required(draft.scope, STAGE_LIMITS.scope);
  if (
    !isCalendarDate(startDate) ||
    !isCalendarDate(endDate) ||
    stageDayCents(onSiteDays, { zeroAllowed: false }) === undefined ||
    stageDayCents(remoteDays, { zeroAllowed: true }) === undefined ||
    objectives === undefined ||
    scope === undefined ||
    !slotAttachments(register, 'plan').some(
      (item) => item.id === draft.planAttachmentId,
    ) ||
    (sentToClientOn !== '' && !isCalendarDate(sentToClientOn))
  )
    return { status: 'incomplete' };
  // ISO calendar dates compare in calendar order.
  if (startDate > endDate) return { status: 'dates' };
  if (startsAfter !== null && startDate <= startsAfter)
    return { status: 'stage2Start' };
  // The note is asked only for a deviation; a hidden note is not sent.
  const deviates = draftDeviates(onSiteDays, confirmedOnSite);
  const deviationNote = deviates
    ? required(draft.deviationNote, STAGE_LIMITS.deviationNote)
    : null;
  if (deviationNote === undefined) return { status: 'deviationNote' };
  const plan: StagePlan = {
    startDate,
    endDate,
    onSiteDays,
    remoteDays,
    objectives,
    scope,
    planAttachmentId: draft.planAttachmentId,
    sentToClientOn: sentToClientOn || null,
    deviationNote,
  };
  const stated = statedReason(draft.reason, correcting);
  return stated
    ? { status: 'valid', plan, reason: stated.reason }
    : { status: 'reasonRequired' };
}

/**
 * Mirrors the server: a real report date, an explicit conclusion with its
 * basis, an attachment with the report role and optionally one with the
 * participant-list role; the completed document review; a date not before
 * the Stage start; and, for a new version, its reason.
 */
export function stage1ReportFromDraft(
  draft: Stage1ReportDraft,
  context: ReportContext,
): StageReportCheck<Stage1Report> {
  const reportDate = draft.reportDate.trim();
  const conclusionNote = required(
    draft.conclusionNote,
    STAGE_LIMITS.conclusionNote,
  );
  const participantList = optionalSlot(
    context.register,
    'participantList',
    draft.participantListAttachmentId,
  );
  if (
    !isCalendarDate(reportDate) ||
    draft.conclusion === null ||
    conclusionNote === undefined ||
    !inSlot(context.register, 'report', draft.reportAttachmentId) ||
    participantList === undefined
  )
    return { status: 'incomplete' };
  if (!draft.documentReviewCompleted) return { status: 'documentReview' };
  if (reportDate < context.planStart) return { status: 'beforePlan' };
  const stated = statedReason(draft.reason, context.correcting);
  if (!stated) return { status: 'reasonRequired' };
  return {
    status: 'valid',
    report: {
      reportDate,
      documentReviewCompleted: true,
      conclusion: draft.conclusion,
      conclusionNote,
      reportAttachmentId: draft.reportAttachmentId,
      participantListAttachmentId: participantList,
    },
    reason: stated.reason,
  };
}

/**
 * Mirrors the server: a real report date, the summary, an attachment with
 * the report role, an optional participant list and annex with their roles,
 * a date not before the Stage start and, for a new version, its reason.
 */
export function stage2ReportFromDraft(
  draft: Stage2ReportDraft,
  context: ReportContext,
): StageReportCheck<Stage2Report> {
  const reportDate = draft.reportDate.trim();
  const summary = required(draft.summary, STAGE_LIMITS.summary);
  const participantList = optionalSlot(
    context.register,
    'participantList',
    draft.participantListAttachmentId,
  );
  const annex = optionalSlot(
    context.register,
    'annex',
    draft.annexAttachmentId,
  );
  if (
    !isCalendarDate(reportDate) ||
    summary === undefined ||
    !inSlot(context.register, 'report', draft.reportAttachmentId) ||
    participantList === undefined ||
    annex === undefined
  )
    return { status: 'incomplete' };
  if (reportDate < context.planStart) return { status: 'beforePlan' };
  const stated = statedReason(draft.reason, context.correcting);
  if (!stated) return { status: 'reasonRequired' };
  return {
    status: 'valid',
    report: {
      reportDate,
      summary,
      reportAttachmentId: draft.reportAttachmentId,
      participantListAttachmentId: participantList,
      annexAttachmentId: annex,
    },
    reason: stated.reason,
  };
}

type ReportContext = {
  register: readonly CertificationAttachment[];
  /** The start date of the latest plan of this Stage. */
  planStart: string;
  correcting: boolean;
};

function inSlot(
  register: readonly CertificationAttachment[],
  slot: StageAttachmentSlot,
  attachmentId: string,
): boolean {
  return slotAttachments(register, slot).some(
    (item) => item.id === attachmentId,
  );
}

/** Null when none is chosen, the chosen id in its slot, else undefined. */
function optionalSlot(
  register: readonly CertificationAttachment[],
  slot: StageAttachmentSlot,
  attachmentId: string,
): string | null | undefined {
  if (!attachmentId) return null;
  return inSlot(register, slot, attachmentId) ? attachmentId : undefined;
}

/**
 * A first record states no reason; a new version states one within its
 * limit. Undefined when a new version lacks it.
 */
function statedReason(
  typed: string,
  correcting: boolean,
): { reason: string | null } | undefined {
  if (!correcting) return { reason: null };
  const reason = required(typed, CERTIFICATION_LIMITS.reason);
  return reason === undefined ? undefined : { reason };
}

function required(value: string, limit: number): string | undefined {
  const trimmed = value.trim();
  return trimmed && trimmed.length <= limit ? trimmed : undefined;
}
