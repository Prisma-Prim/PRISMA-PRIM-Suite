import { BadRequestException } from '@nestjs/common';
import {
  DECISION_CODES,
  DIRECT_COST_CATEGORIES,
  EXECUTOR_TYPES,
  type DecideProfitabilityCommand,
  type SubmitProfitabilityCommand,
} from './profitability.types.js';

function object(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    invalid('body', 'Submit an object.');
  return Object.fromEntries(Object.entries(value));
}
function text(value: unknown, field: string, max = 200): string {
  if (typeof value !== 'string' || value.length > max || !/\S/u.test(value))
    invalid(field, 'Enter a non-empty value.');
  return value;
}
function money(value: unknown, field: string, positive: boolean): string {
  if (typeof value !== 'string' || !/^[0-9]{1,20}\.[0-9]{2}$/.test(value))
    invalid(field, 'Use a plain amount with exactly two fractional digits.');
  if (positive ? /^0+\.00$/.test(value) : false)
    invalid(field, 'Enter an amount greater than zero.');
  return value;
}
function choice<const T extends string>(
  value: unknown,
  values: readonly T[],
  field: string,
): T {
  const found = values.find((candidate) => candidate === value);
  if (!found) invalid(field, 'Choose a supported value.');
  return found;
}
function invalid(field: string, message: string): never {
  throw new BadRequestException({
    code: 'INVALID_PROFITABILITY_ESTIMATE',
    field,
    message,
  });
}

export function readSubmitProfitabilityCommand(
  value: unknown,
): SubmitProfitabilityCommand {
  const body = object(value);
  const expected = body.expectedLatestVersion;
  if (
    expected !== null &&
    (!Number.isSafeInteger(expected) ||
      typeof expected !== 'number' ||
      expected < 1)
  )
    invalid('expectedLatestVersion', 'Use null or a positive version number.');
  const currency =
    typeof body.currency === 'string' && /^[A-Z]{3}$/.test(body.currency)
      ? body.currency
      : invalid('currency', 'Use a three-letter ISO currency code.');
  if (!Array.isArray(body.directCosts) || body.directCosts.length > 100)
    invalid('directCosts', 'Submit at most 100 direct-cost lines.');
  const keys = new Set<string>();
  const directCosts = body.directCosts.map((raw, index) => {
    const line = object(raw);
    const key = text(line.key, `directCosts[${index}].key`, 100);
    if (keys.has(key))
      invalid(
        `directCosts[${index}].key`,
        'Line keys must be unique within the version.',
      );
    keys.add(key);
    const lineCurrency = typeof line.currency === 'string' ? line.currency : '';
    if (lineCurrency !== currency)
      invalid(
        `directCosts[${index}].currency`,
        'Every line must use the estimate currency.',
      );
    return {
      key,
      category: choice(
        line.category,
        DIRECT_COST_CATEGORIES,
        `directCosts[${index}].category`,
      ),
      label: text(line.label, `directCosts[${index}].label`),
      currency: lineCurrency,
      amount: money(line.amount, `directCosts[${index}].amount`, true),
    };
  });
  if (body.costComplete !== true)
    invalid('costComplete', 'Confirm that the cost bundle is complete.');
  if (body.noKnownDuplicate !== true)
    invalid(
      'noKnownDuplicate',
      'Confirm that no cost is knowingly duplicated.',
    );
  const targetProfitability =
    typeof body.targetProfitability === 'string' &&
    /^-?[0-9]{1,20}(?:\.[0-9]{1,20})?$/.test(body.targetProfitability)
      ? body.targetProfitability
      : invalid(
          'targetProfitability',
          'Enter an explicit plain decimal percentage.',
        );
  const pricingIntent = choice(
    body.pricingIntent,
    ['ORDINARY', 'STRATEGIC'] as const,
    'pricingIntent',
  );
  const strategicReason =
    pricingIntent === 'STRATEGIC'
      ? text(body.strategicReason, 'strategicReason', 2000)
      : body.strategicReason === null || body.strategicReason === undefined
        ? null
        : invalid(
            'strategicReason',
            'Ordinary pricing has no strategic reason.',
          );
  return {
    expectedLatestVersion: expected,
    currency,
    executorType: choice(body.executorType, EXECUTOR_TYPES, 'executorType'),
    executorCost: money(body.executorCost, 'executorCost', false),
    fiscalCost: money(body.fiscalCost, 'fiscalCost', false),
    allocatedOverhead: money(
      body.allocatedOverhead,
      'allocatedOverhead',
      false,
    ),
    directCosts,
    targetProfitability,
    proposedPrice: money(body.proposedPrice, 'proposedPrice', true),
    pricingIntent,
    strategicReason,
    costComplete: true,
    noKnownDuplicate: true,
  };
}

export function readDecideProfitabilityCommand(
  value: unknown,
): DecideProfitabilityCommand {
  const body = object(value);
  if (
    typeof body.versionNumber !== 'number' ||
    !Number.isSafeInteger(body.versionNumber) ||
    body.versionNumber < 1
  )
    invalid('versionNumber', 'Choose a positive version number.');
  if (body.expectedDecision !== null)
    invalid(
      'expectedDecision',
      'A first decision must explicitly expect no decision.',
    );
  return {
    versionNumber: body.versionNumber,
    expectedDecision: null,
    code: choice(body.code, DECISION_CODES, 'code'),
  };
}
