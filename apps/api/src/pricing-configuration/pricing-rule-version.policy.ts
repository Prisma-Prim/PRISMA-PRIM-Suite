import type {
  PricingRuleVersionState,
  PublishPricingRuleVersionCommand,
} from './pricing-configuration.types.js';

// Version numbers are PostgreSQL integers. The maximum stays a valid head so
// an unchanged publication or a replay can still confirm it; only a material
// publication from it is refused.
export const MAXIMUM_PRICING_RULE_VERSION_NUMBER = 2_147_483_647;

export interface PricingRuleHead {
  readonly versionNumber: number;
  readonly label: string;
  readonly effectiveFrom: Date;
  readonly effectiveTo: Date | null;
}

export type PricingRulePublicationRejection =
  | 'EFFECTIVE_FROM_PAST'
  | 'EFFECTIVE_FROM_NOT_ADVANCING'
  | 'EFFECTIVE_WINDOW_GAP'
  | 'VERSION_EXHAUSTED';

export type PricingRulePublicationDecision<Head extends PricingRuleHead> =
  | { readonly kind: 'stale'; readonly headVersionNumber: number | null }
  | { readonly kind: 'unchanged'; readonly head: Head }
  | {
      readonly kind: 'rejected';
      readonly code: PricingRulePublicationRejection;
    }
  | {
      readonly kind: 'publish';
      readonly versionNumber: number;
      readonly predecessor: Head | undefined;
    };

// Boundaries are inclusive at effectiveFrom and exclusive at effectiveTo and
// supersededFrom, so no instant yields two CURRENT versions of one scope.
export function pricingRuleVersionState(
  version: {
    readonly effectiveFrom: Date;
    readonly effectiveTo: Date | null;
    readonly supersededFrom: Date | null;
  },
  now: Date,
): PricingRuleVersionState {
  const instant = now.getTime();
  if (version.effectiveFrom.getTime() > instant) return 'SCHEDULED';
  if (
    (version.supersededFrom && version.supersededFrom.getTime() <= instant) ||
    (version.effectiveTo && version.effectiveTo.getTime() <= instant)
  )
    return 'SUPERSEDED';
  return 'CURRENT';
}

// Evaluated after authority, replay and payload validation, against the head
// locked for update and the command's single server-owned instant. The no-op
// precedes the window rules, which govern only a material successor.
export function decidePricingRulePublication<Head extends PricingRuleHead>({
  head,
  command,
  now,
}: {
  head: Head | undefined;
  command: PublishPricingRuleVersionCommand;
  now: Date;
}): PricingRulePublicationDecision<Head> {
  const headVersionNumber = head?.versionNumber ?? null;
  if (headVersionNumber !== command.expectedActiveVersionNumber)
    return { kind: 'stale', headVersionNumber };
  if (head && hasIdenticalContent(head, command))
    return { kind: 'unchanged', head };

  const start = command.effectiveFrom.getTime();
  const instant = now.getTime();
  if (start < instant) return { kind: 'rejected', code: 'EFFECTIVE_FROM_PAST' };
  if (!head)
    return { kind: 'publish', versionNumber: 1, predecessor: undefined };
  if (start <= head.effectiveFrom.getTime())
    return { kind: 'rejected', code: 'EFFECTIVE_FROM_NOT_ADVANCING' };
  // Only a head that has not already expired can gain a new interruption. A
  // successor to an expired head resumes the scope without back-dating.
  if (
    head.effectiveTo &&
    head.effectiveTo.getTime() > instant &&
    head.effectiveTo.getTime() < start
  )
    return { kind: 'rejected', code: 'EFFECTIVE_WINDOW_GAP' };
  if (head.versionNumber >= MAXIMUM_PRICING_RULE_VERSION_NUMBER)
    return { kind: 'rejected', code: 'VERSION_EXHAUSTED' };
  return {
    kind: 'publish',
    versionNumber: head.versionNumber + 1,
    predecessor: head,
  };
}

// Every server-fixed field is identical by construction, so the content that
// can differ is the exact label and the declared window compared as instants.
function hasIdenticalContent(
  head: PricingRuleHead,
  command: PublishPricingRuleVersionCommand,
): boolean {
  return (
    head.label === command.label &&
    head.effectiveFrom.getTime() === command.effectiveFrom.getTime() &&
    (head.effectiveTo?.getTime() ?? null) ===
      (command.effectiveTo?.getTime() ?? null)
  );
}
