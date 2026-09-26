import type { TariffCurrency } from '../database/schema/index.js';
import {
  decideEffectiveDatedPublication,
  effectiveDatedVersionState,
  type EffectiveDatedHead,
  type EffectiveDatedPublicationDecision,
} from './effective-dated-version.policy.js';
import type { PublishTariffVersionCommand } from './pricing-configuration.types.js';
import {
  TAX_RATE_PERCENT_SCALE,
  UNIT_AMOUNT_SCALE,
  scaledDecimal,
} from './pricing-decimal.js';

// One offering's Tariff scope under the shared effective-dated policy.
export interface TariffHead extends EffectiveDatedHead {
  readonly unit: string;
  readonly unitAmount: string;
  readonly currency: TariffCurrency;
  readonly taxRatePercent: string;
  readonly taxLabel: string;
}

export const tariffVersionState = effectiveDatedVersionState;

export function decideTariffPublication<Head extends TariffHead>({
  head,
  command,
  now,
}: {
  head: Head | undefined;
  command: PublishTariffVersionCommand;
  now: Date;
}): EffectiveDatedPublicationDecision<Head> {
  return decideEffectiveDatedPublication({
    head,
    command,
    now,
    hasIdenticalContent: hasIdenticalTariffContent,
  });
}

// Beyond the declared window: the unit, currency and tax label exactly, and
// the amount and rate by numeric value, so 12.5 equals the stored 12.5000.
function hasIdenticalTariffContent(
  head: TariffHead,
  command: PublishTariffVersionCommand,
): boolean {
  return (
    head.unit === command.unit &&
    head.currency === command.currency &&
    head.taxLabel === command.taxLabel &&
    scaledDecimal(head.unitAmount, UNIT_AMOUNT_SCALE) ===
      scaledDecimal(command.unitAmount, UNIT_AMOUNT_SCALE) &&
    scaledDecimal(head.taxRatePercent, TAX_RATE_PERCENT_SCALE) ===
      scaledDecimal(command.taxRatePercent, TAX_RATE_PERCENT_SCALE)
  );
}
