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
  opportunityStatusLabels: { OPEN: 'Open' },
  responsible: 'Responsible actor',
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
  },
  activityRequestTarget: 'Client Request',
  activityOpportunityTarget: 'Opportunity',
  // Offered on a commercial Activity event; it names no event content.
  activityOpenRequest: 'Open Request',
  requestedAfterNextActionEdit:
    'The requested Client Request opens after the next-action edit is saved or cancelled.',
  requestedAfterCapture:
    'The requested Client Request opens after this capture is confirmed.',
};
