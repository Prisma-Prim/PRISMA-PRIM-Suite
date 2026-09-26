import {
  MAXIMUM_VERSION_NUMBER,
  decideEffectiveDatedPublication,
  effectiveDatedVersionState,
  type EffectiveDatedHead,
  type EffectiveDatedPublicationDecision,
} from './effective-dated-version.policy.js';
import type { PublishPricingRuleVersionCommand } from './pricing-configuration.types.js';

// The Company's Pricing Rule scope under the shared effective-dated policy.
// Rule behaviour is unchanged by the extraction; only the content comparison
// below is specific to rules.
export const MAXIMUM_PRICING_RULE_VERSION_NUMBER = MAXIMUM_VERSION_NUMBER;

export interface PricingRuleHead extends EffectiveDatedHead {
  readonly label: string;
}

export const pricingRuleVersionState = effectiveDatedVersionState;

export function decidePricingRulePublication<Head extends PricingRuleHead>({
  head,
  command,
  now,
}: {
  head: Head | undefined;
  command: PublishPricingRuleVersionCommand;
  now: Date;
}): EffectiveDatedPublicationDecision<Head> {
  return decideEffectiveDatedPublication({
    head,
    command,
    now,
    hasIdenticalContent: hasIdenticalRuleContent,
  });
}

// Every server-fixed field is identical by construction, so beyond the
// declared window the only content that can differ is the exact label.
function hasIdenticalRuleContent(
  head: PricingRuleHead,
  command: PublishPricingRuleVersionCommand,
): boolean {
  return head.label === command.label;
}
