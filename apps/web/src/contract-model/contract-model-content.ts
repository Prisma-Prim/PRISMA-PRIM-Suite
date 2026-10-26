export const CONTRACT_MODEL_CODE =
  'INTEGRATED_MANAGEMENT_CONSULTING_CONTRACT_RO';
export const CONTRACT_MODEL_LANGUAGE = 'ro';

/** Complete literal configuration, never an executable/legal template engine. */
export function readContractModelContent(value: unknown) {
  const input = exactRecord(value, [
    'sourceKind',
    'sourceDescription',
    'title',
    'serviceTitle',
    'place',
    'issuer',
    'providerDetails',
    'clientDetailsIntroduction',
    'frameworks',
    'sections',
    'signatureAreas',
    'annex',
  ]);
  const issuer = exactRecord(
    input.issuer,
    ['legalName', 'taxId', 'legalAddress'],
    ['contactDetails'],
  );
  if (
    !Array.isArray(input.frameworks) ||
    input.frameworks.length < 1 ||
    input.frameworks.length > 10
  )
    throw invalidContent();
  const frameworks = input.frameworks.map((value: unknown) => {
    const row = exactRecord(value, ['name', 'edition']);
    return { name: text(row.name, 200), edition: text(row.edition, 100) };
  });
  const sections = exactRecord(input.sections, [
    'subject',
    'executionTerm',
    'rightsAndObligations',
    'confidentiality',
    'priceAndPayment',
    'liability',
    'termination',
    'finalProvisions',
    'partiesAndSignatures',
  ]);
  const signatureAreas = exactRecord(input.signatureAreas, [
    'provider',
    'client',
    'annexProvider',
    'annexClient',
  ]);
  const annex = exactRecord(input.annex, [
    'title',
    'referenceWording',
    'activities',
  ]);
  if (!Array.isArray(annex.activities) || annex.activities.length !== 13)
    throw invalidContent();
  const activities = annex.activities.map((value: unknown) => {
    const row = exactRecord(value, [
      'title',
      'plannedActivity',
      'intendedResult',
    ]);
    return {
      title: text(row.title, 200),
      plannedActivity: text(row.plannedActivity, 1_000),
      intendedResult: text(row.intendedResult, 1_000),
    };
  });
  const content = {
    sourceKind: sourceKind(input.sourceKind),
    sourceDescription: text(input.sourceDescription, 500),
    title: text(input.title, 300),
    serviceTitle: text(input.serviceTitle, 300),
    place: text(input.place, 200),
    issuer: {
      legalName: text(issuer.legalName, 300),
      taxId: text(issuer.taxId, 100),
      legalAddress: text(issuer.legalAddress, 1_000),
      contactDetails:
        issuer.contactDetails === undefined || issuer.contactDetails === null
          ? null
          : text(issuer.contactDetails, 1_000),
    },
    providerDetails: text(input.providerDetails, 4_000),
    clientDetailsIntroduction: text(input.clientDetailsIntroduction, 1_000),
    frameworks,
    sections: {
      subject: text(sections.subject, 4_000),
      executionTerm: text(sections.executionTerm, 4_000),
      rightsAndObligations: text(sections.rightsAndObligations, 4_000),
      confidentiality: text(sections.confidentiality, 4_000),
      priceAndPayment: text(sections.priceAndPayment, 4_000),
      liability: text(sections.liability, 4_000),
      termination: text(sections.termination, 4_000),
      finalProvisions: text(sections.finalProvisions, 4_000),
      partiesAndSignatures: text(sections.partiesAndSignatures, 4_000),
    },
    signatureAreas: {
      provider: text(signatureAreas.provider, 500),
      client: text(signatureAreas.client, 500),
      annexProvider: text(signatureAreas.annexProvider, 500),
      annexClient: text(signatureAreas.annexClient, 500),
    },
    annex: {
      title: text(annex.title, 300),
      referenceWording: text(annex.referenceWording, 1_000),
      activities,
    },
  };
  if (new TextEncoder().encode(JSON.stringify(content)).byteLength > 64 * 1_024)
    throw invalidContent();
  return content;
}

export type ContractModelContent = ReturnType<typeof readContractModelContent>;

export function exactRecord(
  value: unknown,
  required: readonly string[],
  optional: readonly string[] = [],
): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw invalidContent();
  const record = Object.fromEntries(Object.entries(value));
  if (
    required.some((key) => !Object.hasOwn(record, key)) ||
    Object.keys(record).some(
      (key) => !required.includes(key) && !optional.includes(key),
    )
  )
    throw invalidContent();
  return record;
}

export function text(value: unknown, limit: number): string {
  if (
    typeof value !== 'string' ||
    !value.trim() ||
    value.includes('\u0000') ||
    /[\uD800-\uDFFF]/u.test(value) ||
    value.length > limit
  )
    throw invalidContent();
  return value;
}

export function modelInteger(value: unknown, minimum: number): number {
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value < minimum ||
    value > 2_147_483_647
  )
    throw invalidContent();
  return value;
}

function invalidContent() {
  return new Error('Invalid consulting Contract model content.');
}

export function sourceKind(
  value: unknown,
): 'ILLUSTRATIVE' | 'COMPANY_SUPPLIED' {
  if (value === 'ILLUSTRATIVE' || value === 'COMPANY_SUPPLIED') return value;
  throw invalidContent();
}
