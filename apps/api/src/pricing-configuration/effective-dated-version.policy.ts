import type { EffectiveDatedVersionState } from './pricing-configuration.types.js';

// One policy for every effective-dated version scope: the Company's Pricing
// Rule Versions and each offering's Tariff Versions. A scope supplies only
// how its own content compares; the time rules, the order of the checks and
// the version bounds are the same for every scope.

// Version numbers are PostgreSQL integers. The maximum stays a valid head so
// an unchanged publication or a replay can still confirm it; only a material
// publication from it is refused.
export const MAXIMUM_VERSION_NUMBER = 2_147_483_647;

export interface EffectiveDatedHead {
  readonly versionNumber: number;
  readonly effectiveFrom: Date;
  readonly effectiveTo: Date | null;
}

export interface EffectiveDatedPublication {
  readonly effectiveFrom: Date;
  readonly effectiveTo: Date | null;
  // The head number the caller displayed, or null for a first publication.
  readonly expectedActiveVersionNumber: number | null;
}

export type EffectiveDatedPublicationRejection =
  | 'EFFECTIVE_FROM_PAST'
  | 'EFFECTIVE_FROM_NOT_ADVANCING'
  | 'EFFECTIVE_WINDOW_GAP'
  | 'VERSION_EXHAUSTED';

export type EffectiveDatedPublicationDecision<Head> =
  | { readonly kind: 'stale'; readonly headVersionNumber: number | null }
  | { readonly kind: 'unchanged'; readonly head: Head }
  | {
      readonly kind: 'rejected';
      readonly code: EffectiveDatedPublicationRejection;
    }
  | {
      readonly kind: 'publish';
      readonly versionNumber: number;
      readonly predecessor: Head | undefined;
    };

// Boundaries are inclusive at effectiveFrom and exclusive at effectiveTo and
// supersededFrom, so no instant yields two CURRENT versions of one scope.
export function effectiveDatedVersionState(
  version: {
    readonly effectiveFrom: Date;
    readonly effectiveTo: Date | null;
    readonly supersededFrom: Date | null;
  },
  now: Date,
): EffectiveDatedVersionState {
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
// precedes the window rules, which govern only a material successor. Content
// is identical when the declared window matches as instants and the scope's
// own content comparison holds.
export function decideEffectiveDatedPublication<
  Head extends EffectiveDatedHead,
  Command extends EffectiveDatedPublication,
>({
  head,
  command,
  now,
  hasIdenticalContent,
}: {
  head: Head | undefined;
  command: Command;
  now: Date;
  hasIdenticalContent: (head: Head, command: Command) => boolean;
}): EffectiveDatedPublicationDecision<Head> {
  const headVersionNumber = head?.versionNumber ?? null;
  if (headVersionNumber !== command.expectedActiveVersionNumber)
    return { kind: 'stale', headVersionNumber };
  if (
    head &&
    hasIdenticalWindow(head, command) &&
    hasIdenticalContent(head, command)
  )
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
  if (head.versionNumber >= MAXIMUM_VERSION_NUMBER)
    return { kind: 'rejected', code: 'VERSION_EXHAUSTED' };
  return {
    kind: 'publish',
    versionNumber: head.versionNumber + 1,
    predecessor: head,
  };
}

// The declared window compared as instants, whatever offset spelled it.
function hasIdenticalWindow(
  head: EffectiveDatedHead,
  command: EffectiveDatedPublication,
): boolean {
  return (
    head.effectiveFrom.getTime() === command.effectiveFrom.getTime() &&
    (head.effectiveTo?.getTime() ?? null) ===
      (command.effectiveTo?.getTime() ?? null)
  );
}
