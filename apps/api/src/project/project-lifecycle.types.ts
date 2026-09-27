/** Project/Task PRD section 23: every lifecycle status a Project can hold. */
export const PROJECT_STATUSES = [
  'preparatory',
  'active',
  'on_hold',
  'completed',
  'cancelled',
] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const PROJECT_LIFECYCLE_ACTIONS = [
  'activate',
  'hold',
  'resume',
  'complete',
  'cancel',
] as const;
export type ProjectLifecycleAction = (typeof PROJECT_LIFECYCLE_ACTIONS)[number];

/** The recorded text a transition requires, if any. */
export type ProjectLifecycleText = 'none' | 'reason' | 'note';

/**
 * The one transition table of section 23. Validation, the command and the
 * stored-record readers all derive from it; no other transition exists.
 */
export const PROJECT_LIFECYCLE_TRANSITIONS = {
  activate: { from: ['preparatory'], to: 'active', text: 'none' },
  hold: { from: ['active'], to: 'on_hold', text: 'reason' },
  resume: { from: ['on_hold'], to: 'active', text: 'none' },
  complete: { from: ['active'], to: 'completed', text: 'note' },
  cancel: {
    from: ['preparatory', 'active', 'on_hold'],
    to: 'cancelled',
    text: 'reason',
  },
} as const satisfies Record<
  ProjectLifecycleAction,
  {
    from: readonly ProjectStatus[];
    to: ProjectStatus;
    text: ProjectLifecycleText;
  }
>;

/** The actions this slice commands; completion and cancellation follow in #407. */
export const COMMANDED_PROJECT_LIFECYCLE_ACTIONS = [
  'activate',
  'hold',
  'resume',
] as const satisfies readonly ProjectLifecycleAction[];
export type CommandedProjectLifecycleAction =
  (typeof COMMANDED_PROJECT_LIFECYCLE_ACTIONS)[number];

/** The start-dossier items an approver declares, in their fixed order. */
export const START_DECLARATION_ITEMS = [
  'approvedOffer',
  'contractOrPrecontract',
  'projectPlan',
  'initialDocuments',
  'deadlines',
  'financialConditions',
  'risks',
] as const;
export type StartDeclarationItem = (typeof START_DECLARATION_ITEMS)[number];
export type StartDeclarationValue = 'present' | 'missing';
export type StartDeclaration = Record<
  StartDeclarationItem,
  StartDeclarationValue
>;

export interface ProjectLifecycleMember {
  workspaceMembershipId: string;
  displayLabel: string;
}

export interface StartExceptionView {
  reason: string;
  completionResponsible: ProjectLifecycleMember;
  completionDueDate: string;
}

export interface ProjectStartView {
  declaredAt: string;
  declaredBy: { displayName: string };
  declaration: StartDeclaration;
  exception: StartExceptionView | null;
}

interface TransitionBase {
  lifecycleRevision: number;
  from: ProjectStatus;
  to: ProjectStatus;
  occurredAt: string;
  actor: { displayName: string };
}

export type ProjectLifecycleTransitionView =
  | (TransitionBase & { action: 'activate'; withStartException: boolean })
  | (TransitionBase & { action: 'hold'; reason: string })
  | (TransitionBase & { action: 'resume' })
  | (TransitionBase & { action: 'complete'; note: string })
  | (TransitionBase & { action: 'cancel'; reason: string });

export interface ProjectLifecycleView {
  status: ProjectStatus;
  lifecycleRevision: number;
  /** False while the original Client is superseded or no longer related. */
  mutable: boolean;
  start: ProjectStartView | null;
  /** At most the 50 most recent transitions, newest first. */
  transitions: ProjectLifecycleTransitionView[];
}

export interface StartExceptionCommand {
  reason: string;
  completionMembershipId: string;
  completionDueDate: string;
}

export type ProjectLifecycleCommand =
  | {
      action: 'activate';
      expectedLifecycleRevision: number;
      declaration: StartDeclaration;
      startException: StartExceptionCommand | null;
    }
  | { action: 'hold'; expectedLifecycleRevision: number; reason: string }
  | { action: 'resume'; expectedLifecycleRevision: number };

/** One committed transition of this slice, as the Activity record stores it. */
export type ProjectLifecycleTransitionRecord =
  | { action: 'activate'; from: 'preparatory'; to: 'active' }
  | { action: 'hold'; from: 'active'; to: 'on_hold'; reason: string }
  | { action: 'resume'; from: 'on_hold'; to: 'active' };

export interface ProjectLifecycleReceipt {
  projectId: string;
  action: CommandedProjectLifecycleAction;
  from: ProjectStatus;
  to: ProjectStatus;
  lifecycleRevision: number;
}

export interface ProjectLifecycleChangedActivityEvent {
  id: string;
  action: 'project.lifecycle.changed';
  occurredAt: string;
  actor: { internalUserId: string; displayName: string };
  target: {
    type: 'project';
    projectId: string;
    projectTitle: string;
    companyId: string;
  };
  metadata: ProjectLifecycleEventMetadata;
}

/**
 * One variant per section 23 transition, discriminated by its from/to pair.
 * It never carries a reason, note, declared item, member or date (Activity Log
 * PRD section 7).
 */
export type ProjectLifecycleEventMetadata =
  | {
      lifecycleRevision: number;
      from: 'preparatory';
      to: 'active';
      withStartException: boolean;
    }
  | { lifecycleRevision: number; from: 'active'; to: 'on_hold' }
  | { lifecycleRevision: number; from: 'on_hold'; to: 'active' }
  | { lifecycleRevision: number; from: 'active'; to: 'completed' }
  | {
      lifecycleRevision: number;
      from: 'preparatory' | 'active' | 'on_hold';
      to: 'cancelled';
    };

/** Whether a stored from/to pair is exactly one of the section 23 transitions. */
export function isLifecycleTransition(
  action: ProjectLifecycleAction,
  from: ProjectStatus,
  to: ProjectStatus,
): boolean {
  const transition = PROJECT_LIFECYCLE_TRANSITIONS[action];
  const sources: readonly ProjectStatus[] = transition.from;
  return sources.includes(from) && transition.to === to;
}
