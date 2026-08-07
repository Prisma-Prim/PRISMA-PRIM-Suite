export type ExtractedFieldStatus =
  'confirmed' | 'inferred' | 'missing' | 'contradictory';

export interface RequestSource {
  id: string;
  type: 'email' | 'document' | 'call-note';
  title: string;
  author: string;
  receivedAt: string;
  language: 'English' | 'Romanian';
  excerpt: string;
}

export interface ExtractedField {
  id: string;
  label: string;
  status: ExtractedFieldStatus;
  value?: string;
  confidence?: number;
  critical: boolean;
  rationale: string;
  provenance: ReadonlyArray<{
    requestSourceId: string;
    locator: string;
    quote: string;
  }>;
  correction?: {
    originalValue: string;
    correctedValue: string;
    correctedBy: string;
    correctedAt: string;
    reason: string;
  };
  exception?: string;
}

export interface ComparisonFixture {
  client: {
    legalName: string;
    registrationNumber: string;
    headquarters: string;
    operatingSites: ReadonlyArray<string>;
    primaryContact: {
      name: string;
      role: string;
      email: string;
      preferredLanguage: string;
    };
  };
  clientRequest: {
    id: string;
    title: string;
    receivedAt: string;
    owner: string;
    workflowStatus: string;
    targetDecisionAt: string;
    requestedServices: ReadonlyArray<string>;
  };
  workflow: ReadonlyArray<{
    label: string;
    status: 'complete' | 'current' | 'blocked' | 'not-started';
    detail: string;
  }>;
  pendingActions: ReadonlyArray<{
    id: string;
    priority: 'urgent' | 'normal';
    owner: string;
    label: string;
    reason: string;
  }>;
  requestSources: ReadonlyArray<RequestSource>;
  analysis: {
    version: number;
    proposedAt: string;
    reviewedBy: string;
    summary: string;
    pricingGate: {
      status: 'blocked';
      reason: string;
      criticalFieldIds: ReadonlyArray<string>;
    };
  };
  extractedFields: ReadonlyArray<ExtractedField>;
}

export const comparisonFixture: ComparisonFixture = {
  client: {
    legalName: 'NordVale Foods S.R.L.',
    registrationNumber: 'RO 43821790',
    headquarters: 'Strada Fabricii 18, Cluj-Napoca, Romania',
    operatingSites: [
      'Cluj-Napoca — chilled-meals production',
      'Turda — dry-goods packing and dispatch',
    ],
    primaryContact: {
      name: 'Elena Ionescu',
      role: 'Quality and Compliance Director',
      email: 'elena.ionescu@example.invalid',
      preferredLanguage: 'Romanian',
    },
  },
  clientRequest: {
    id: 'CR-2026-0147',
    title: 'Integrated ISO 22000 and IFS Food readiness programme',
    receivedAt: '2026-07-29T08:42:00+03:00',
    owner: 'Mara Petrescu',
    workflowStatus: 'Analysis review',
    targetDecisionAt: '2026-08-12T17:00:00+03:00',
    requestedServices: [
      'Readiness assessment',
      'Implementation support',
      'Internal-audit training',
    ],
  },
  workflow: [
    {
      label: 'Request received',
      status: 'complete',
      detail: 'Three Request Sources preserved',
    },
    {
      label: 'Analysis review',
      status: 'current',
      detail: 'Four fields require human attention',
    },
    {
      label: 'Pricing',
      status: 'blocked',
      detail: 'Two Critical Fields are not Confirmed',
    },
    {
      label: 'Offer preparation',
      status: 'not-started',
      detail: 'Waiting for a Pricing Snapshot',
    },
  ],
  pendingActions: [
    {
      id: 'PA-01',
      priority: 'urgent',
      owner: 'Mara Petrescu',
      label: 'Resolve the requested certification scope',
      reason: 'The email and brief name incompatible site coverage.',
    },
    {
      id: 'PA-02',
      priority: 'urgent',
      owner: 'Mara Petrescu',
      label: 'Confirm annual tonnage',
      reason: 'A Critical Field is still Inferred from an approximate range.',
    },
    {
      id: 'PA-03',
      priority: 'normal',
      owner: 'Elena Ionescu',
      label: 'Provide the current HACCP plan',
      reason: 'No supporting Request Source was supplied.',
    },
    {
      id: 'PA-04',
      priority: 'normal',
      owner: 'Mara Petrescu',
      label: 'Review the corrected headcount',
      reason: 'The contact corrected a value proposed by the Analysis.',
    },
  ],
  requestSources: [
    {
      id: 'RS-EMAIL-01',
      type: 'email',
      title: 'Initial request from Elena Ionescu',
      author: 'Elena Ionescu',
      receivedAt: '2026-07-29T08:42:00+03:00',
      language: 'English',
      excerpt:
        'We would like support preparing NordVale Foods for ISO 22000 certification across both our Cluj production site and the Turda packing operation. The priority is the chilled-meals activity because a retail customer expects evidence of progress this autumn. We estimate approximately 180 colleagues across the business, although seasonal packing staff can change that number. Please include a readiness assessment, help updating procedures, and practical internal-auditor training. Our preferred start is September, with certification ideally completed before the end of March. The attached brief contains the current process list and a first view of the scope.',
    },
    {
      id: 'RS-BRIEF-02',
      type: 'document',
      title: 'Certification programme brief — revision 2',
      author: 'NordVale procurement team',
      receivedAt: '2026-07-29T08:42:00+03:00',
      language: 'English',
      excerpt:
        'The requested programme covers the design and implementation of a food-safety management system for the Cluj-Napoca facility. Phase one should address ISO 22000:2018 readiness and preparation for an IFS Food audit requested by a strategic retailer. Turda is expected to provide warehousing evidence but is not presently listed as a certification site. The organisation reports 146 permanent employees and up to 38 seasonal workers. Production runs two shifts, five days per week, with a third sanitation shift. The desired audit window is February 2027. Existing materials include a 2024 HACCP study, supplier approval records, complaint logs, and Romanian-language work instructions; the current HACCP plan was not included with this request.',
    },
    {
      id: 'RS-CALL-03',
      type: 'call-note',
      title: 'Discovery call notes',
      author: 'Mara Petrescu',
      receivedAt: '2026-07-31T15:30:00+03:00',
      language: 'Romanian',
      excerpt:
        'Elena clarified that the headcount normally used for external audits is 172, not 180. She wants one coordinated project but is still checking whether Turda must appear on the certificate or only support the Cluj scope. IFS Food is driven by the retailer and may need a separate audit. The team can start workshops in the second half of September. Elena will send the active HACCP plan and confirm annual product tonnage after finance validates the latest production report. A March target is important but should not be represented as a guaranteed certification date.',
    },
  ],
  analysis: {
    version: 2,
    proposedAt: '2026-08-01T10:18:00+03:00',
    reviewedBy: 'Mara Petrescu',
    summary:
      'The Client requests a coordinated food-safety readiness programme. Site scope and annual tonnage still prevent deterministic pricing; the headcount has a documented human correction.',
    pricingGate: {
      status: 'blocked',
      reason: 'Annual tonnage and certification-site scope must be Confirmed.',
      criticalFieldIds: ['EF-SCOPE', 'EF-TONNAGE'],
    },
  },
  extractedFields: [
    {
      id: 'EF-STANDARD-ISO',
      label: 'Primary Standard',
      status: 'confirmed',
      value: 'ISO 22000:2018',
      confidence: 0.99,
      critical: true,
      rationale: 'The Standard is named consistently in two Request Sources.',
      provenance: [
        {
          requestSourceId: 'RS-EMAIL-01',
          locator: 'Email, paragraph 1',
          quote: 'preparing NordVale Foods for ISO 22000 certification',
        },
        {
          requestSourceId: 'RS-BRIEF-02',
          locator: 'Brief, phase one',
          quote: 'ISO 22000:2018 readiness',
        },
      ],
    },
    {
      id: 'EF-HEADCOUNT',
      label: 'Audit headcount',
      status: 'confirmed',
      value: '172 people',
      confidence: 1,
      critical: true,
      rationale: 'An Internal User recorded the Contact correction.',
      provenance: [
        {
          requestSourceId: 'RS-CALL-03',
          locator: 'Discovery call, note 1',
          quote: 'the headcount normally used for external audits is 172',
        },
      ],
      correction: {
        originalValue: '180 people',
        correctedValue: '172 people',
        correctedBy: 'Mara Petrescu',
        correctedAt: '2026-08-01T11:04:00+03:00',
        reason:
          'The Contact supplied the audit-specific headcount on the call.',
      },
    },
    {
      id: 'EF-TONNAGE',
      label: 'Annual product tonnage',
      status: 'inferred',
      value: '10,000–15,000 tonnes',
      confidence: 0.46,
      critical: true,
      rationale:
        'The range is estimated from shift patterns and is not stated by the Client.',
      provenance: [
        {
          requestSourceId: 'RS-BRIEF-02',
          locator: 'Brief, operations paragraph',
          quote: 'Production runs two shifts, five days per week',
        },
      ],
      exception:
        'Do not use the inferred range for a Pricing Calculation; finance confirmation is pending.',
    },
    {
      id: 'EF-START',
      label: 'Preferred programme start',
      status: 'inferred',
      value: 'Second half of September 2026',
      confidence: 0.82,
      critical: false,
      rationale: 'The call narrows the earlier September preference.',
      provenance: [
        {
          requestSourceId: 'RS-CALL-03',
          locator: 'Discovery call, note 4',
          quote: 'start workshops in the second half of September',
        },
      ],
    },
    {
      id: 'EF-HACCP',
      label: 'Current HACCP plan',
      status: 'missing',
      critical: false,
      rationale: 'The brief names the plan, but the Document was not supplied.',
      provenance: [
        {
          requestSourceId: 'RS-BRIEF-02',
          locator: 'Brief, existing materials',
          quote: 'the current HACCP plan was not included',
        },
      ],
      exception:
        'A 2024 HACCP study is mentioned but cannot substitute for the active plan.',
    },
    {
      id: 'EF-SCOPE',
      label: 'Certification-site scope',
      status: 'contradictory',
      critical: true,
      rationale: 'Request Sources disagree on whether Turda is certified.',
      provenance: [
        {
          requestSourceId: 'RS-EMAIL-01',
          locator: 'Email, paragraph 1',
          quote:
            'across both our Cluj production site and the Turda packing operation',
        },
        {
          requestSourceId: 'RS-BRIEF-02',
          locator: 'Brief, scope paragraph',
          quote: 'Turda ... is not presently listed as a certification site',
        },
      ],
      exception:
        'The Client wants one project even if the final certification scope contains only Cluj.',
    },
  ],
};
