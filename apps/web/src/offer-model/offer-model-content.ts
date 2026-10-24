// Browser boundary for Commercial §27; the API validates writes independently.

export const OFFER_MODEL_CODE = 'INTEGRATED_MANAGEMENT_CONSULTING_RO';
export const OFFER_MODEL_LANGUAGE = 'ro';

/** The fixed pilot structure accepts plain content, never executable templates. */
export function readOfferModelContent(value: unknown) {
  const input = exactRecord(value, [
    'sourceKind',
    'sourceDescription',
    'issuer',
    'serviceTitle',
    'frameworks',
    'sections',
    'stages',
  ]);
  const issuer = exactRecord(input.issuer, [
    'legalName',
    'taxId',
    'legalAddress',
    'contactDetails',
  ]);
  if (
    !Array.isArray(input.frameworks) ||
    input.frameworks.length < 1 ||
    input.frameworks.length > 10
  )
    throw invalidContent();
  const frameworks = input.frameworks.map((entry: unknown) => {
    const framework = exactRecord(entry, ['name', 'edition']);
    return {
      name: text(framework.name, 200),
      edition: text(framework.edition, 100),
    };
  });
  if (!Array.isArray(input.stages) || input.stages.length !== 18)
    throw invalidContent();
  const stages = input.stages.map((entry: unknown) => {
    const stage = exactRecord(entry, [
      'title',
      'plannedActivity',
      'intendedResult',
    ]);
    return {
      title: text(stage.title, 200),
      plannedActivity: text(stage.plannedActivity, 1_000),
      intendedResult: text(stage.intendedResult, 1_000),
    };
  });
  const content = {
    sourceKind: sourceKind(input.sourceKind),
    sourceDescription: text(input.sourceDescription, 500),
    issuer: {
      legalName: text(issuer.legalName, 300),
      taxId: text(issuer.taxId, 100),
      legalAddress: text(issuer.legalAddress, 1_000),
      contactDetails:
        issuer.contactDetails === undefined || issuer.contactDetails === null
          ? null
          : text(issuer.contactDetails, 1_000),
    },
    serviceTitle: text(input.serviceTitle, 300),
    frameworks,
    sections: narrativeSections(input.sections),
    stages,
  };
  if (new TextEncoder().encode(JSON.stringify(content)).byteLength > 64 * 1_024)
    throw invalidContent();
  return content;
}

export type OfferModelContent = ReturnType<typeof readOfferModelContent>;

export function sourceKind(
  value: unknown,
): 'ILLUSTRATIVE' | 'COMPANY_SUPPLIED' {
  if (value === 'ILLUSTRATIVE' || value === 'COMPANY_SUPPLIED') return value;
  throw invalidContent();
}

function narrativeSections(value: unknown) {
  const input = exactRecord(value, [
    'introduction',
    'providerProfile',
    'scope',
    'objectives',
    'assessmentGuidance',
    'methodology',
    'deliverables',
    'realizationConditions',
    'paymentConditions',
    'closingRationale',
  ]);
  return {
    introduction: text(input.introduction, 4_000),
    providerProfile: text(input.providerProfile, 4_000),
    scope: text(input.scope, 4_000),
    objectives: text(input.objectives, 4_000),
    assessmentGuidance: text(input.assessmentGuidance, 4_000),
    methodology: text(input.methodology, 4_000),
    deliverables: text(input.deliverables, 4_000),
    realizationConditions: text(input.realizationConditions, 4_000),
    paymentConditions: text(input.paymentConditions, 4_000),
    closingRationale: text(input.closingRationale, 4_000),
  };
}

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
  return new Error('Invalid consulting Offer model content.');
}
