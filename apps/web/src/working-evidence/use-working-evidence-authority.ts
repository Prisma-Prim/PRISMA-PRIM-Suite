import { useRef } from 'react';
import type { ActorContext } from '../access-types';
import type { BrowserIdentity } from '../access-composition';
import { workingEvidenceAuthority } from './working-evidence-access';

/** An owner retains its consumed read alternative while that exact capture remains live. */
export function useWorkingEvidenceAuthority(
  actor: ActorContext,
  identity: BrowserIdentity,
  scope: string,
) {
  const selected = useRef<{
    identity: BrowserIdentity;
    scope: string;
    read: string | undefined;
  }>({ identity, scope, read: undefined });
  const previous = selected.current;
  const authority = workingEvidenceAuthority(
    actor,
    previous.identity === identity && previous.scope === scope
      ? previous.read
      : undefined,
  );
  selected.current = { identity, scope, read: authority?.read };
  return authority;
}
