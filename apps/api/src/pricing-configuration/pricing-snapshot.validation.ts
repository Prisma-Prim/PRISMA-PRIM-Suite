import { MAXIMUM_VERSION_NUMBER } from './effective-dated-version.policy.js';
import { invalid } from './effective-dated-version.validation.js';
import type { CreatePricingSnapshotCommand } from './pricing-configuration.types.js';
import { QUANTITY_SCALE, scaledDecimal } from './pricing-decimal.js';

const COMMAND_FIELDS: ReadonlySet<string> = new Set([
  'pricingRuleVersionNumber',
  'lines',
]);
const LINE_FIELDS: ReadonlySet<string> = new Set([
  'offeringId',
  'tariffVersionNumber',
  'quantity',
  'adjustment',
]);
const ADJUSTMENT_FIELDS: ReadonlySet<string> = new Set([
  'type',
  'netReduction',
  'reason',
]);
const QUANTITY_GRAMMAR = /^(0|[1-9][0-9]{0,8})(\.[0-9]{1,3})?$/u;
const FIXED_NET_DISCOUNT_GRAMMAR = /^(0|[1-9][0-9]{0,21})\.[0-9]{2}$/u;
const UUID_GRAMMAR =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

// This check deliberately does not validate the command. It only identifies
// whether the independent adjustment authority is required before target
// access and receipt replay.
export function requestsPricingAdjustment(value: unknown): boolean {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    return false;
  const lines = Object.fromEntries(Object.entries(value)).lines;
  return (
    Array.isArray(lines) &&
    lines.some(
      (line) =>
        typeof line === 'object' &&
        line !== null &&
        !Array.isArray(line) &&
        Object.prototype.hasOwnProperty.call(line, 'adjustment'),
    )
  );
}

export function readPricingSnapshotCommand(
  value: unknown,
): CreatePricingSnapshotCommand {
  const body = exactObject(
    value,
    COMMAND_FIELDS,
    'pricingSnapshot',
    'Enter a valid Pricing Snapshot calculation.',
  );
  const pricingRuleVersionNumber = readVersionNumber(
    body.pricingRuleVersionNumber,
    'pricingRuleVersionNumber',
  );
  if (
    !Array.isArray(body.lines) ||
    body.lines.length < 1 ||
    body.lines.length > 20
  )
    invalid('lines', 'Enter between 1 and 20 calculation lines.');
  const offeringIds = new Set<string>();
  const lines = body.lines.map((value, index) => {
    const prefix = `lines[${index}]`;
    const line = exactObject(
      value,
      LINE_FIELDS,
      prefix,
      'Enter a valid calculation line.',
    );
    if (
      typeof line.offeringId !== 'string' ||
      !UUID_GRAMMAR.test(line.offeringId)
    )
      invalid(`${prefix}.offeringId`, 'Choose a valid offering.');
    const offeringId = line.offeringId.toLowerCase();
    if (offeringIds.has(offeringId))
      invalid(`${prefix}.offeringId`, 'Choose each offering only once.');
    offeringIds.add(offeringId);
    const quantity = readQuantity(line.quantity, `${prefix}.quantity`);
    const adjustment = Object.prototype.hasOwnProperty.call(line, 'adjustment')
      ? readAdjustment(line.adjustment, `${prefix}.adjustment`)
      : undefined;
    return {
      offeringId,
      tariffVersionNumber: readVersionNumber(
        line.tariffVersionNumber,
        `${prefix}.tariffVersionNumber`,
      ),
      quantity,
      ...(adjustment ? { adjustment } : {}),
    };
  });
  return { pricingRuleVersionNumber, lines };
}

function readAdjustment(
  value: unknown,
  field: string,
): NonNullable<CreatePricingSnapshotCommand['lines'][number]['adjustment']> {
  const adjustment = exactObject(
    value,
    ADJUSTMENT_FIELDS,
    field,
    'Enter one valid fixed net discount.',
  );
  if (adjustment.type !== 'FIXED_NET_DISCOUNT')
    invalid(`${field}.type`, 'Choose the fixed net discount type.');
  if (
    typeof adjustment.netReduction !== 'string' ||
    !FIXED_NET_DISCOUNT_GRAMMAR.test(adjustment.netReduction) ||
    scaledDecimal(adjustment.netReduction, 2) <= 0n
  )
    invalid(
      `${field}.netReduction`,
      'Enter a positive net reduction with exactly two decimals.',
    );
  if (
    typeof adjustment.reason !== 'string' ||
    adjustment.reason.length < 1 ||
    adjustment.reason.length > 500 ||
    !/\S/u.test(adjustment.reason)
  )
    invalid(`${field}.reason`, 'Enter a reason between 1 and 500 characters.');
  return {
    type: adjustment.type,
    netReduction: adjustment.netReduction,
    reason: adjustment.reason,
  };
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

function readQuantity(value: unknown, field: string): string {
  if (
    typeof value !== 'string' ||
    !QUANTITY_GRAMMAR.test(value) ||
    scaledDecimal(value, QUANTITY_SCALE) <= 0n
  )
    invalid(
      field,
      'Enter a quantity greater than zero with up to 9 digits and 3 decimals.',
    );
  return value;
}

function exactObject(
  value: unknown,
  fields: ReadonlySet<string>,
  field: string,
  message: string,
): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    invalid(field, message);
  const body = Object.fromEntries(Object.entries(value));
  if (Object.keys(body).some((key) => !fields.has(key)))
    invalid(field, 'Remove unsupported fields.');
  return body;
}
