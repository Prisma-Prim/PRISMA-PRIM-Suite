import {
  TARIFF_CURRENCIES,
  type TariffCurrency,
} from '../database/schema/index.js';
import {
  invalid,
  readEffectiveWindow,
  readExpectedActiveVersionNumber,
  readPublicationBody,
  readVersionText,
} from './effective-dated-version.validation.js';
import type { PublishTariffVersionCommand } from './pricing-configuration.types.js';
import { UNIT_AMOUNT_SCALE, scaledDecimal } from './pricing-decimal.js';

// Every value is user-entered and illustrative. The grammars, the lengths and
// the currency set are provisional drafting choices (PRD section 13, rows 7,
// 8 and 18), not approved business limits. The offering comes from the path;
// every other version field is server-owned.
const PUBLICATION_FIELDS: ReadonlySet<string> = new Set([
  'unit',
  'unitAmount',
  'currency',
  'taxRatePercent',
  'taxLabel',
  'effectiveFrom',
  'effectiveTo',
  'expectedActiveVersionNumber',
]);
const UNIT_MAXIMUM = 24;
const TAX_LABEL_MAXIMUM = 60;
// PRD section 8.1. JavaScript regular expressions match `$` only at the end
// of the input, and `[0-9]` only ASCII digits.
const UNIT_AMOUNT_GRAMMAR = /^(0|[1-9][0-9]{0,6})(\.[0-9]{1,4})?$/u;
const TAX_RATE_PERCENT_GRAMMAR =
  /^(100(\.0{1,2})?|(0|[1-9][0-9]?)(\.[0-9]{1,2})?)$/u;

export function readPublishTariffVersionCommand(
  value: unknown,
): PublishTariffVersionCommand {
  const body = readPublicationBody(value, {
    field: 'tariffVersion',
    fields: PUBLICATION_FIELDS,
    message: 'Enter a valid Tariff Version.',
  });
  const unit = readVersionText(body.unit, {
    field: 'unit',
    maximum: UNIT_MAXIMUM,
    nullMessage: 'Remove the null character from the unit.',
  });
  const unitAmount = readUnitAmount(body.unitAmount);
  const currency = readCurrency(body.currency);
  const taxRatePercent = readTaxRatePercent(body.taxRatePercent);
  const taxLabel = readVersionText(body.taxLabel, {
    field: 'taxLabel',
    maximum: TAX_LABEL_MAXIMUM,
    nullMessage: 'Remove the null character from the tax label.',
  });
  const { effectiveFrom, effectiveTo } = readEffectiveWindow(body);
  return {
    unit,
    unitAmount,
    currency,
    taxRatePercent,
    taxLabel,
    effectiveFrom,
    effectiveTo,
    expectedActiveVersionNumber: readExpectedActiveVersionNumber(
      body.expectedActiveVersionNumber,
      'Reload the Tariff Versions before publishing.',
    ),
  };
}

// A JSON string in the grammar and greater than zero, kept exactly as
// submitted: never trimmed, padded or passed through Number.
function readUnitAmount(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !UNIT_AMOUNT_GRAMMAR.test(value) ||
    scaledDecimal(value, UNIT_AMOUNT_SCALE) <= 0n
  )
    invalid(
      'unitAmount',
      'Enter an amount greater than zero with up to 7 digits and 4 decimals, such as 123.4500.',
    );
  return value;
}

function readTaxRatePercent(value: unknown): string {
  if (typeof value !== 'string' || !TAX_RATE_PERCENT_GRAMMAR.test(value))
    invalid(
      'taxRatePercent',
      'Enter a rate from 0 to 100 with up to 2 decimals, such as 12.34.',
    );
  return value;
}

// Exactly one of the closed set, case-sensitive.
function readCurrency(value: unknown): TariffCurrency {
  const currency = TARIFF_CURRENCIES.find((candidate) => candidate === value);
  if (currency === undefined)
    invalid('currency', `Choose one of ${TARIFF_CURRENCIES.join(', ')}.`);
  return currency;
}
