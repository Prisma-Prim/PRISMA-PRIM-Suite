export interface CreateServiceDefinitionCommand {
  readonly code: string;
  readonly name: string;
  readonly description: string | null;
}

export interface CreateCompanyServiceOfferingCommand {
  readonly serviceDefinitionId: string;
  readonly commercialLabel: string | null;
}

// Shared Workspace vocabulary: no Company field, no money field.
export interface ServiceDefinitionRecord {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly description: string | null;
  readonly provenance: 'ILLUSTRATIVE';
  readonly provisional: true;
  readonly createdByWorkspaceMembershipId: string;
  readonly createdAt: string;
}

// The durable Company Service Offering keeps its full meaning. The ILLUSTRATIVE
// instance created by this slice is non-operational: it grants no ability to
// perform, certify, sell or contract, and no endpoint converts it.
export interface CompanyServiceOfferingRecord {
  readonly id: string;
  readonly companyId: string;
  readonly serviceDefinitionId: string;
  readonly serviceDefinition: {
    readonly code: string;
    readonly name: string;
  };
  readonly commercialLabel: string | null;
  readonly availability: 'AVAILABLE';
  readonly provenance: 'ILLUSTRATIVE';
  readonly provisional: true;
  readonly createdByWorkspaceMembershipId: string;
  readonly createdAt: string;
}

export type CatalogueCommandOutcome = 'CREATED' | 'UNCHANGED';

export interface CreateServiceDefinitionResult {
  readonly outcome: CatalogueCommandOutcome;
  readonly definition: ServiceDefinitionRecord;
}

export interface CreateCompanyServiceOfferingResult {
  readonly outcome: CatalogueCommandOutcome;
  readonly offering: CompanyServiceOfferingRecord;
}

export interface ServiceDefinitionPage {
  readonly items: ServiceDefinitionRecord[];
  readonly nextCursor?: string;
}

export interface CompanyServiceOfferingPage {
  readonly items: CompanyServiceOfferingRecord[];
  readonly nextCursor?: string;
}
