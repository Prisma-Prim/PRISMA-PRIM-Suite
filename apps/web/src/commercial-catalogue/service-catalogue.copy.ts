export const serviceCatalogueCopy = {
  eyebrow: 'Commercial',
  title: 'Service Catalogue',
  companyPrefix: 'Company:',
  noticeLabel: 'Illustrative catalogue notice',
  illustrativeMarker: 'Illustrative catalogue: provisional records',
  illustrativeDetail:
    'Every Service Definition and offering here carries illustrative provenance. Nothing in this catalogue is a real price, tariff or commitment.',
  abilityDisclaimer:
    'This illustrative offering is non-operational: it is not evidence that the Company may perform, certify, sell or contract the service. A real offering requires a separately reviewed governed transition.',
  definitionsTitle: 'Shared Service Definitions',
  definitionsDescription:
    'Defined once for the whole Workspace. Defining a service grants nothing to any Company.',
  code: 'Service code',
  codeHelp: 'Use 1 to 40 characters: A-Z, 0-9, _ or -.',
  name: 'Service name',
  description: 'Description',
  defineService: 'Define Service',
  definitionCreated: (code: string) => `Service Definition ${code} recorded.`,
  definitionUnchanged: (code: string) =>
    `Service Definition ${code} already existed with identical content. Nothing changed.`,
  definitionValidation:
    'Enter a service code of 1 to 40 characters (A-Z, 0-9, _ or -), a name of at most 160 characters and a description of at most 2,000 characters.',
  codeConflict: (code: string) =>
    `Service code ${code} already exists in this Workspace with different content. Choose another code or reuse the existing definition unchanged.`,
  definitionsLoading: 'Loading Service Definitions…',
  definitionsEmpty: 'No Service Definitions in this Workspace yet.',
  definitionsList: 'Service Definitions',
  showOlderDefinitions: 'Show older Service Definitions',
  olderDefinitionsLoading: 'Loading older Service Definitions…',
  olderDefinitionsError:
    'Older Service Definitions could not be loaded. Please try again.',
  definitionsError:
    'Service Definitions could not be loaded. Please try again.',
  retryDefinitions: 'Reload Service Definitions',
  offeringsTitle: (companyName: string) => `Offerings of ${companyName}`,
  offeringsDescription:
    'Only the active Company sees its own offerings. Other Companies see the shared definition, never this list.',
  offeredDefinition: 'Service Definition',
  selectDefinition: 'Select a Service Definition',
  noDefinitionsToOffer: 'Define a Service before recording an offering.',
  commercialLabel: 'Commercial label',
  commercialLabelHelp:
    'Optional Company-specific display text of at most 160 characters. It never replaces the shared name.',
  offerService: 'Record offering',
  offeringCreated: (name: string) =>
    `Offering for ${name} recorded as available.`,
  offeringUnchanged: (name: string) =>
    `${name} was already offered with the same label. Nothing changed.`,
  offeringValidation:
    'Select a Service Definition and keep the commercial label at most 160 characters.',
  offeringDuplicate: (name: string) =>
    `This Company already offers ${name} with a different commercial label. Offerings cannot be changed here.`,
  definitionUnavailable:
    'The selected Service Definition is no longer available. Reload the definitions and try again.',
  offeringsLoading: 'Loading offerings…',
  offeringsEmpty: (companyName: string) =>
    `No offerings for ${companyName} yet.`,
  offeringsList: 'Company Service Offerings',
  showOlderOfferings: 'Show older offerings',
  olderOfferingsLoading: 'Loading older offerings…',
  olderOfferingsError: 'Older offerings could not be loaded. Please try again.',
  offeringsError: 'Offerings could not be loaded. Please try again.',
  retryOfferings: 'Reload offerings',
  // Indexing these by the validated identifier makes an unmapped variant a
  // type error instead of a missing or invented label.
  availabilityLabels: { AVAILABLE: 'Available' },
  provenanceLabels: { ILLUSTRATIVE: 'Illustrative' },
  denied: 'You do not have permission to access the Service Catalogue.',
  error: 'The catalogue could not be loaded or saved. Please try again.',
};
