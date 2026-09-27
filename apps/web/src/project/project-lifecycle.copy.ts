import type {
  ProjectLifecycleActivityMetadata,
  ProjectLifecycleTransition,
  ProjectStatus,
  StartDeclarationItem,
  StartDeclarationValue,
} from './project-lifecycle-response';

/** The status label shown in Project rows, the detail header and the section. */
export const projectStatusLabels = {
  preparatory: 'Preparatory',
  active: 'Active',
  on_hold: 'On hold',
  completed: 'Completed',
  cancelled: 'Cancelled',
} as const satisfies Record<ProjectStatus, string>;

export type ProjectStatusTone =
  'neutral' | 'success' | 'warning' | 'info' | 'danger';

/** The `/ui-baseline` Status pill tone of each status. */
export const projectStatusTones = {
  preparatory: 'neutral',
  active: 'success',
  on_hold: 'warning',
  completed: 'info',
  cancelled: 'danger',
} as const satisfies Record<ProjectStatus, ProjectStatusTone>;

export const startDeclarationItemLabels = {
  approvedOffer: 'Approved Offer',
  contractOrPrecontract: 'Contract or precontract',
  projectPlan: 'Project plan',
  initialDocuments: 'Initial documents',
  deadlines: 'Deadlines',
  financialConditions: 'Financial conditions',
  risks: 'Relevant risks',
} as const satisfies Record<StartDeclarationItem, string>;

export const startDeclarationValueLabels = {
  present: 'Present',
  missing: 'Missing',
} as const satisfies Record<StartDeclarationValue, string>;

/** The history label of one recorded transition. */
export function transitionLabel(
  transition: ProjectLifecycleTransition,
): string {
  switch (transition.action) {
    case 'activate':
      return transition.withStartException
        ? 'Activated with a start exception'
        : 'Activated';
    case 'hold':
      return 'Put on hold';
    case 'resume':
      return 'Resumed';
    case 'complete':
      return 'Completed';
    case 'cancel':
      return 'Cancelled';
    default: {
      const exhaustive: never = transition;
      return exhaustive;
    }
  }
}

export const projectLifecycleCopy = {
  title: 'Lifecycle',
  status: 'Status',
  loading: 'Loading the Project lifecycle…',
  error: 'The Project lifecycle could not be loaded.',
  unavailable: 'The Project lifecycle is unavailable. Reload the Project list.',
  reload: 'Reload lifecycle',
  reloadProject: 'Reload Project',
  lastChange: 'Last change',
  by: 'by',
  on: 'on',
  holdReason: 'Hold reason',
  declarationTitle: 'Start declaration — declared, not verified',
  declaredBy: 'Declared by',
  exceptionTitle: 'Start exception',
  exceptionReason: 'Reason',
  completion: (member: string) => `To be completed by ${member} by`,
  historyTitle: 'Transition history',
  noTransitions: 'No lifecycle change has been recorded.',
  reason: 'Reason',
  note: 'Note',
  readOnly:
    'Read-only: the original Client has been superseded. The lifecycle remains visible.',
  activate: 'Activate Project',
  activateTitle: 'Start declaration',
  activateHint:
    'Declare each start-dossier item. The declaration is recorded as declared, not verified.',
  needsResponsible: 'Name a responsible member before activating this Project.',
  chooseEach: 'Choose Present or Missing for this item.',
  exceptionLegend: 'Start exception',
  exceptionHint:
    'At least one item is missing, so the activation records a start exception.',
  exceptionReasonLabel: 'Start exception reason',
  completionResponsible: 'To be completed by',
  selectMember: 'Select a member',
  completionDueDate: 'Completion deadline',
  membersLoading: 'Loading eligible members…',
  membersError:
    'Eligible members could not be loaded. Cancel and choose Activate Project again.',
  noMembers: 'No member can currently be named to complete the missing items.',
  reasonValidation: 'Enter a reason of 1–500 characters.',
  memberValidation: 'Choose who completes the missing items.',
  dateValidation: 'Enter a valid completion deadline.',
  confirmActivate: 'Activate',
  hold: 'Put on hold',
  holdReasonLabel: 'Hold reason',
  confirmHold: 'Put Project on hold',
  resume: 'Resume Project',
  resumeConfirmation:
    'Resume this Project? Its Tasks, Documents and responsible member stay unchanged.',
  confirmResume: 'Confirm resumption',
  cancel: 'Cancel',
  saving: 'Saving the lifecycle change…',
  saved: 'Project lifecycle updated.',
  conflict:
    'The Project lifecycle changed. Reload the Project before choosing another action.',
  invalid:
    'This lifecycle change is no longer available. Reload the Project before choosing another action.',
  responsibleRequired:
    'This Project has no responsible member. Name a responsible member before activating it.',
  rejected:
    'The lifecycle change was rejected. Reload the Project and check the selected member and dates.',
  uncertain:
    'The change is not confirmed. Retry the same change to safely recover its recorded result.',
  retry: 'Retry lifecycle change',
  activityActions: {
    activated: 'activated a Project',
    activatedWithException: 'activated a Project with a start exception',
    onHold: 'put a Project on hold',
    resumed: 'resumed a Project',
    completed: 'completed a Project',
    cancelled: 'cancelled a Project',
  },
} as const;

/** The Activity Log label of one lifecycle event, exhaustive on its target status. */
export function lifecycleActivityLabel(
  metadata: ProjectLifecycleActivityMetadata,
): string {
  const labels = projectLifecycleCopy.activityActions;
  switch (metadata.to) {
    case 'active':
      if (metadata.from === 'on_hold') return labels.resumed;
      return metadata.withStartException
        ? labels.activatedWithException
        : labels.activated;
    case 'on_hold':
      return labels.onHold;
    case 'completed':
      return labels.completed;
    case 'cancelled':
      return labels.cancelled;
    default: {
      const exhaustive: never = metadata;
      return exhaustive;
    }
  }
}
