export const commercialIntakeCopy = {
  eyebrow: 'Commercial',
  title: 'Client Requests',
  companyPrefix: 'Company:',
  manualSource: 'This intake stores the request as manual text.',
  manualSourceDetail:
    'After capture, the original request text, subject, source label, and reported received time cannot be changed.',
  originalText: 'Original request text',
  sourceLabel: 'Source label',
  reportedReceivedAt: 'Reported received at',
  capturedAt: 'Captured at',
  capturedAtHelp:
    'Recorded by the application when this Request was captured. The reported received time is what the sender declared.',
  subject: 'Subject',
  clientSearch: 'Search Clients by name',
  searchClients: 'Search Clients',
  existingClient: 'Existing Client',
  noClient: 'No Client selected',
  clientHelp:
    'Optional. Search only shows Clients you can access in this Company.',
  clientSearchValidation: 'Enter a Client name to search.',
  clientSearchEmpty: 'No accessible Clients match this search.',
  clientSearchDenied:
    'Client search is not available. You can capture this Request without a Client.',
  clientSearchError: 'The Client search could not be loaded. Please try again.',
  clientSearchLoading: 'Loading accessible Clients…',
  client: 'Client',
  noClientAssociated: 'No Client associated',
  clientAssociationHidden: 'The associated Client is not currently available.',
  associateClient: 'Associate a Client',
  confirmClientAssociation: 'Confirm Client association',
  retryClientAssociation: 'Retry Client association',
  clientAssociationValidation: 'Choose a Client before confirming.',
  clientAssociationLoading: 'Associating Client…',
  clientAssociationSuccess: 'Client associated.',
  clientAssociationStale:
    'This Request changed since you loaded it. Reload it before retrying.',
  clientAlreadyAssociated: 'This Request already has a Client association.',
  clientAssociationDenied:
    'You no longer have permission to associate a Client with this Request.',
  clientAssociationUncertain:
    'The association result is uncertain. Retry with the unchanged selection to confirm it.',
  clientAssociationError:
    'The Client association could not be completed. Reload the Request and try again.',
  opportunityTitle: 'Opportunity title',
  opportunityScope: 'Opportunity scope',
  nextAction: 'Next action',
  capture: 'Capture Request',
  loading: 'Loading Client Requests…',
  empty: (companyName: string) => `No Client Requests for ${companyName} yet.`,
  list: 'Client Requests',
  filterLabel: 'Filter loaded Client Requests',
  filterHelp:
    'Filters only the Client Requests already loaded below, by subject, initial Opportunity title, or responsible actor. It does not search other Requests in this Company or the original request text.',
  filterNoMatch: 'No loaded Client Requests match this filter.',
  filterClear: 'Show all loaded Requests',
  // The dossier restriction compares only the rows already loaded below.
  restrictionLabel: (displayName: string) =>
    `Loaded Client Requests for ${displayName}`,
  restrictionHelp:
    'Only the Client Requests already loaded below that belong to this Client dossier are shown. Show older Requests to check more.',
  restrictionClear: 'Show loaded Requests for every Client',
  restrictionNoMatch: (displayName: string) =>
    `No loaded Client Request for ${displayName}.`,
  openClientDossier: 'Open Client dossier',
  showOlder: 'Show older Requests',
  olderLoading: 'Loading older Client Requests…',
  olderError: 'Older Client Requests could not be loaded. Please try again.',
  back: 'Back to Requests',
  detail: 'Client Request detail',
  initialOpportunity: 'Initial Opportunity',
  source: 'Source',
  status: 'Status',
  // Indexing these by the validated identifier makes an unmapped variant a
  // type error instead of a missing or invented label.
  sourceKindLabels: { MANUAL_TEXT: 'Manual text' },
  opportunityStatusLabels: {
    OPEN: 'Open',
    ON_HOLD: 'On hold',
    WON: 'Won',
    LOST: 'Lost',
    DISQUALIFIED: 'Disqualified',
    ARCHIVED: 'Archived',
  },
  statusEnteredAt: 'Since',
  // The outcome status change offers only the transitions permitted from
  // the current status, each named by what it does.
  outcomeTransitionLabels: {
    hold: 'Put on hold',
    resume: 'Resume',
    win: 'Mark as won',
    lose: 'Mark as lost',
    disqualify: 'Disqualify',
    archive: 'Archive',
    reopen: 'Reopen',
  },
  lossReasonLabels: {
    PRICE: 'Price',
    DEADLINE: 'Deadline',
    COMPETITOR: 'Competitor',
    NO_BUDGET: 'No budget',
    POSTPONED: 'Postponed',
    CLIENT_WITHDREW: 'Client withdrew',
    OTHER: 'Other',
    UNKNOWN: 'Unknown',
  },
  changeOutcome: 'Change status',
  outcomeTransition: 'Status change',
  outcomeSelectTransition: 'Select a status change',
  outcomeReason: 'Reason',
  outcomeLossReason: 'Loss reason',
  outcomeSelectLossReason: 'Select a loss reason',
  outcomeNote: 'Note (required for Other)',
  saveOutcome: 'Save status',
  cancelOutcome: 'Cancel',
  retryOutcome: 'Retry update',
  outcomeSaving: 'Saving status…',
  outcomeChanged: 'Status changed.',
  outcomeValidation:
    'Choose a status change and enter its required fields, each between 1 and 500 characters.',
  outcomeConflict:
    'This Opportunity changed since you loaded it. Reload the Request before changing the status.',
  outcomeDenied:
    'You no longer have permission to change the status of this Opportunity.',
  outcomeUncertain:
    'The status change did not complete. Retry to confirm the result.',
  outcomeHistory: 'Status history',
  outcomeHistoryEmpty: 'No status change recorded yet.',
  outcomeHistoryChange: (previous: string, next: string) =>
    `${previous} → ${next}`,
  outcomeHistoryNote: 'Note',
  outcomeHistoryOlder: 'Show older status changes',
  outcomeHistoryOlderLoading: 'Loading older status changes…',
  outcomeHistoryOlderError:
    'Older status changes could not be loaded. Try again.',
  responsible: 'Responsible actor',
  // Sales Stage labels are tenant terminology shown exactly as entered; only
  // the surrounding copy below is product copy.
  salesStage: 'Sales Stage',
  stageNone: 'No Sales Stage',
  changeStage: 'Change Sales Stage',
  stageChoice: 'New Sales Stage',
  stageListLoading: 'Loading Sales Stages…',
  stageListError: 'The Sales Stages could not be loaded. Reload the list.',
  stageReloadList: 'Reload the list',
  stageNoneConfigured:
    'No Sales Stage is configured for this Company yet. A holder of Company Sales Stage Configuration must create one first in the Sales Stage settings.',
  saveStage: 'Save Sales Stage',
  cancelStage: 'Cancel',
  retryStage: 'Retry update',
  stageSaving: 'Saving Sales Stage…',
  stageChanged: 'Sales Stage changed.',
  stageUnchanged: 'The Opportunity already had this Sales Stage.',
  stageUnavailable:
    'This Sales Stage can no longer be assigned. Reload the list.',
  stageConflict:
    'This Opportunity changed since you loaded it. Reload the Request before changing the Sales Stage.',
  stageDenied:
    'You no longer have permission to change the Sales Stage of this Opportunity.',
  stageUncertain:
    'The Sales Stage change did not complete. Retry to confirm the result.',
  stageHistory: 'Sales Stage history',
  stageHistoryEmpty: 'No Sales Stage change recorded yet.',
  stageHistoryChange: (previous: string, next: string) =>
    `${previous} → ${next}`,
  stageHistoryOlder: 'Show older Sales Stage changes',
  stageHistoryOlderLoading: 'Loading older Sales Stage changes…',
  stageHistoryOlderError:
    'Older Sales Stage changes could not be loaded. Try again.',
  // The Company's Sales Stage settings view.
  openSalesStageSettings: 'Sales Stage settings',
  salesStageSettings: 'Sales Stage settings',
  salesStageSettingsHelp:
    'The Sales Stages of this Company, in order. Stage labels are shown exactly as entered.',
  salesStageList: 'Sales Stages',
  salesStagesLoading: 'Loading Sales Stages…',
  salesStagesError: 'The Sales Stages could not be loaded. Please try again.',
  salesStagesReload: 'Reload Sales Stages',
  salesStagesEmpty: 'No Sales Stage is configured for this Company yet.',
  salesStageStateLabels: { ACTIVE: 'Active' },
  salesStageReadOnly:
    'Only a holder of Company Sales Stage Configuration can add Sales Stages.',
  salesStageLabel: 'New stage label',
  createSalesStage: 'Add stage',
  retrySalesStage: 'Retry adding the stage',
  cancelSalesStage: 'Cancel',
  salesStageSaving: 'Adding the stage…',
  salesStageCreated: 'Sales Stage added.',
  salesStageLabelValidation: 'Enter a label between 1 and 80 characters.',
  salesStageLabelTaken:
    'Another Sales Stage of this Company already uses this label.',
  salesStageLimit: 'This Company already has the maximum of 30 Sales Stages.',
  salesStageConflict:
    'The Sales Stages changed since you loaded them. Reload them before adding a stage.',
  salesStageDenied: 'You no longer have permission to configure Sales Stages.',
  salesStageUncertain:
    'Adding the stage did not complete. Retry to confirm the result.',
  opportunityVersion: 'Version',
  editNextAction: 'Edit next action',
  saveNextAction: 'Save next action',
  cancelNextAction: 'Cancel',
  retryNextAction: 'Retry update',
  reloadRequest: 'Reload Request',
  nextActionSaving: 'Saving next action…',
  nextActionSaved: 'Next action saved.',
  nextActionUnchanged: 'The next action already had this value.',
  nextActionValidation: 'Enter a next action between 1 and 500 characters.',
  nextActionConflict:
    'This Opportunity changed since you loaded it. Reload the Request before editing again.',
  nextActionMissing:
    'This Request is no longer available in the active Company. Reload the list.',
  nextActionDenied:
    'You no longer have permission to update the next action of this Opportunity.',
  nextActionUncertain:
    'The next action update did not complete. Retry to confirm the result.',
  // The responsible-actor change names members by label only, never email.
  changeResponsible: 'Change responsible',
  responsibleChoice: 'New responsible actor',
  responsibleSelectMember: 'Select a member',
  responsibleMembersLoading: 'Loading eligible members…',
  responsibleMembersError:
    'The eligible members could not be loaded. Reload the list.',
  responsibleReloadList: 'Reload the list',
  responsibleNoOtherMember:
    'No other eligible member; the current responsible actor stays.',
  responsibleCurrentIneligible: (displayName: string) =>
    `Current responsible actor: ${displayName} — no longer eligible.`,
  saveResponsible: 'Save responsible',
  cancelResponsible: 'Cancel',
  retryResponsible: 'Retry update',
  responsibleSaving: 'Saving responsible actor…',
  responsibleChanged: 'Responsible actor changed.',
  responsibleUnchanged: 'This member was already responsible.',
  responsibleConflict:
    'This Opportunity changed since you loaded it. Reload the Request before changing the responsible actor.',
  responsibleUnavailable:
    'This member can no longer become responsible. Reload the list.',
  responsibleDenied:
    'You no longer have permission to change the responsible actor of this Opportunity.',
  responsibleUncertain:
    'The responsible actor change did not complete. Retry to confirm the result.',
  validation: 'Enter the required request and Opportunity fields.',
  unavailableClient:
    'The selected Client is no longer available. Refresh the Client search before trying again.',
  denied: 'You do not have permission to access Commercial Intake.',
  error: 'The Client Request could not be loaded or saved. Please try again.',
  retry: 'Reload Client Requests',
  // Commercial history is visible only through the opt-in reader grant. The
  // labels name the action and the target reference, never request content.
  activityActionLabels: {
    'client_request.created': 'captured a Client Request',
    'client_request.client_associated': 'associated a Client with a Request',
    'opportunity.created': 'created an initial Opportunity',
    'opportunity.next_action.updated': 'updated an Opportunity next action',
    'opportunity.responsible.changed':
      'changed the responsible actor of an Opportunity',
    'opportunity.outcome.changed': 'changed the status of an Opportunity',
    'opportunity.stage.changed': 'changed the Sales Stage of an Opportunity',
    'sales_stage.configured': 'configured a Sales Stage',
  },
  // The previous and new responsible actor, as the change captured them.
  activityResponsibleChange: (before: string, after: string) =>
    `(${before} → ${after})`,
  // The previous and new status and, for a loss, its reason label; never the
  // reason or note text.
  activityOutcomeChange: (previous: string, next: string, loss?: string) =>
    loss ? `(${previous} → ${next}: ${loss})` : `(${previous} → ${next})`,
  // The previous and new stage labels as the change captured them.
  activityStageChange: (previous: string, next: string) =>
    `(${previous} → ${next})`,
  // The configuration operation and the stage label, never the revision.
  salesStageOperationLabels: { CREATED: 'created' },
  activityStageConfigured: (operation: string, label: string) =>
    `(${operation}: ${label})`,
  activitySalesStageTarget: 'Sales Stage settings',
  activityRequestTarget: 'Client Request',
  activityOpportunityTarget: 'Opportunity',
  // Offered on a commercial Activity event; it names no event content.
  activityOpenRequest: 'Open Request',
  requestedAfterNextActionEdit:
    'The requested Client Request opens after the next-action edit is saved or cancelled.',
  requestedAfterOutcomeEdit:
    'The requested Client Request opens after the status change is saved or cancelled.',
  requestedAfterStageEdit:
    'The requested Client Request opens after the Sales Stage change is saved or cancelled.',
  requestedAfterResponsibleEdit:
    'The requested Client Request opens after the responsible actor change is saved or cancelled.',
  requestedAfterCapture:
    'The requested Client Request opens after this capture is confirmed.',
  requestedAfterClientAssociation:
    'The requested Client Request opens after this Client association is confirmed.',
};
