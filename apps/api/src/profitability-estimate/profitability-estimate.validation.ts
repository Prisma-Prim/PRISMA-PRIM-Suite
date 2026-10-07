import { BadRequestException } from '@nestjs/common';

const SUBMISSION_FIELDS = new Set([
  'expectedLatestVersionNumber',
  'currency',
  'executorType',
  'executorCost',
  'fiscalCost',
  'allocatedOverhead',
  'directCosts',
  'targetProfitability',
  'proposedPrice',
  'pricingIntent',
  'costConfirmation',
]);
const LINE_FIELDS = new Set(['key', 'category', 'label', 'amount', 'currency']);
const DECISION_FIELDS = new Set([
  'expectedVersionNumber',
  'expectedDecision',
  'code',
]);
const MONETARY_GRAMMAR = /^[0-9]+\.[0-9]{2}$/u;
const TARGET_GRAMMAR = /^[+-]?[0-9]+(?:\.[0-9]+)?$/u;
// Native ICU supplies ISO 4217 currencies independently of the illustrative
// Tariff's four-currency set. No exchange rates or conversions are selected.
const CURRENCIES = new Set(Intl.supportedValuesOf('currency'));
// Version counters use PostgreSQL integer storage, not an economic limit.
const MAXIMUM_VERSION_NUMBER = 2_147_483_647;

export function readProfitabilitySubmission(value: unknown) {
  const body = exactObject(value, SUBMISSION_FIELDS, 'profitabilityEstimate');
  const expectedLatestVersionNumber =
    body.expectedLatestVersionNumber === null
      ? null
      : readVersionNumber(
          body.expectedLatestVersionNumber,
          'expectedLatestVersionNumber',
        );
  const currency = readCurrency(body.currency, 'currency');
  const executorType = readExecutorType(body.executorType);
  const executorCost = readAmount(body.executorCost, 'executorCost', false);
  const fiscalCost = readAmount(body.fiscalCost, 'fiscalCost', false);
  const allocatedOverhead = readAmount(
    body.allocatedOverhead,
    'allocatedOverhead',
    false,
  );
  if (!Array.isArray(body.directCosts))
    invalid('directCosts', 'Enter a complete direct-cost list.');
  const keys = new Set<string>();
  const directCosts = body.directCosts.map((value, index) => {
    const field = `directCosts[${index}]`;
    const line = exactObject(value, LINE_FIELDS, field);
    const key = readText(line.key, `${field}.key`);
    if (keys.has(key)) invalid(`${field}.key`, 'Use each line key only once.');
    keys.add(key);
    const lineCurrency = readCurrency(line.currency, `${field}.currency`);
    if (lineCurrency !== currency)
      invalid(`${field}.currency`, 'Use the estimate currency for every cost.');
    return {
      key,
      category: readCategory(line.category, `${field}.category`),
      label: readText(line.label, `${field}.label`),
      amount: readAmount(line.amount, `${field}.amount`, true),
      currency: lineCurrency,
    };
  });
  if (
    typeof body.targetProfitability !== 'string' ||
    !TARGET_GRAMMAR.test(body.targetProfitability)
  )
    invalid('targetProfitability', 'Enter an explicit plain decimal target.');
  const proposedPrice = readAmount(body.proposedPrice, 'proposedPrice', true);
  const pricingIntent = readPricingIntent(body.pricingIntent);
  if (body.costConfirmation !== true)
    invalid('costConfirmation', 'Confirm the complete cost bundle.');
  return {
    expectedLatestVersionNumber,
    currency,
    executorType,
    executorCost,
    fiscalCost,
    allocatedOverhead,
    directCosts,
    targetProfitability: body.targetProfitability,
    proposedPrice,
    pricingIntent,
    costConfirmation: body.costConfirmation,
  } satisfies Record<string, unknown> & { costConfirmation: true };
}

export function readProfitabilityDecision(value: unknown) {
  const body = exactObject(value, DECISION_FIELDS, 'profitabilityDecision');
  const expectedVersionNumber = readVersionNumber(
    body.expectedVersionNumber,
    'expectedVersionNumber',
  );
  if (body.expectedDecision !== null)
    invalid('expectedDecision', 'Expect no existing Director decision.');
  const code = readDecisionCode(body.code);
  return { expectedVersionNumber, expectedDecision: null, code };
}

function readExecutorType(value: unknown) {
  switch (value) {
    case 'PATENT_CONSULTANT':
    case 'CIVIL_CONTRACT_FREELANCER':
    case 'DIRECTOR_OR_EMPLOYEE':
    case 'EXTERNAL_SUBCONTRACTOR':
      return value;
    default:
      return invalid('executorType', 'Choose a supported executor type.');
  }
}

function readCategory(value: unknown, field: string) {
  switch (value) {
    case 'PATENT':
    case 'TRAVEL':
    case 'SUBCONTRACTOR':
    case 'TRANSLATION_MATERIAL_CONSUMABLE':
    case 'OTHER':
      return value;
    default:
      return invalid(field, 'Choose a supported direct-cost category.');
  }
}

function readDecisionCode(value: unknown) {
  switch (value) {
    case 'APPROVE':
    case 'MODIFY':
    case 'REJECT':
      return value;
    default:
      return invalid('code', 'Choose a supported Director decision.');
  }
}

function readPricingIntent(value: unknown) {
  const fields = new Set(['kind', 'reason']);
  const body = exactObject(value, fields, 'pricingIntent');
  switch (body.kind) {
    case 'ORDINARY':
      if (Object.hasOwn(body, 'reason'))
        invalid('pricingIntent.reason', 'Ordinary pricing has no reason.');
      return { kind: body.kind };
    case 'STRATEGIC':
      return {
        kind: body.kind,
        reason: readText(body.reason, 'pricingIntent.reason'),
      };
    default:
      return invalid(
        'pricingIntent.kind',
        'Choose ordinary or strategic pricing.',
      );
  }
}

function readAmount(value: unknown, field: string, positive: boolean): string {
  if (
    typeof value !== 'string' ||
    !MONETARY_GRAMMAR.test(value) ||
    (positive && BigInt(value.replace('.', '')) <= 0n)
  )
    invalid(
      field,
      positive
        ? 'Enter a positive amount with exactly two decimal places.'
        : 'Enter a zero-or-positive amount with exactly two decimal places.',
    );
  return value;
}

function readCurrency(value: unknown, field: string): string {
  if (typeof value !== 'string' || !CURRENCIES.has(value))
    invalid(field, 'Choose a supported ISO currency.');
  return value;
}

function readText(value: unknown, field: string): string {
  if (typeof value !== 'string' || !/\S/u.test(value))
    invalid(field, 'Enter text containing a non-whitespace character.');
  // PostgreSQL text/JSON cannot represent null characters or lone surrogates.
  // Refuse before writing; preserve every other accepted character verbatim.
  if (value.includes('\u0000') || /[\uD800-\uDFFF]/u.test(value))
    invalid(field, 'Enter valid Unicode text without null characters.');
  return value;
}

function readVersionNumber(value: unknown, field: string): number {
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value < 1 ||
    value > MAXIMUM_VERSION_NUMBER
  )
    invalid(field, 'Choose a valid version number.');
  return value;
}

function exactObject(
  value: unknown,
  fields: ReadonlySet<string>,
  field: string,
): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    invalid(field, 'Enter a valid object.');
  const body = Object.fromEntries(Object.entries(value));
  if (Object.keys(body).some((key) => !fields.has(key)))
    invalid(field, 'Remove unsupported fields.');
  return body;
}

function invalid(field: string, message: string): never {
  throw new BadRequestException({ code: 'VALIDATION_ERROR', field, message });
}
