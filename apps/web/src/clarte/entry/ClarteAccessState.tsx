import { useAppCopy } from '../../app.copy';
import {
  ClarteEmptyState,
  ClarteErrorState,
  ClarteLoadingState,
} from '../components/ClarteState';
import { ClartePage } from './ClartePage';

/** An access state shown before the frame, with the current interface's text. */
export type ClarteAccessStateKind =
  'checking' | 'inactive' | 'error' | 'signed-out';

/**
 * Access being verified, refused as inactive, unverifiable, or requiring a
 * sign-in. Each state keeps its current announcement: the check is a status,
 * the others are alerts. None of them offers an action the current interface
 * does not have.
 */
export function ClarteAccessState({
  state,
}: Readonly<{ state: ClarteAccessStateKind }>) {
  const copy = useAppCopy();
  return <ClartePage>{accessState(state, copy)}</ClartePage>;
}

function accessState(
  state: ClarteAccessStateKind,
  copy: ReturnType<typeof useAppCopy>,
) {
  switch (state) {
    case 'checking':
      return <ClarteLoadingState label={copy.checkingAccess} />;
    case 'inactive':
      return <ClarteErrorState title={copy.inactiveAccess} />;
    case 'error':
      return <ClarteErrorState title={copy.accessError} />;
    case 'signed-out':
      return (
        <div role="alert">
          <ClarteEmptyState title={copy.signInRequired} />
        </div>
      );
    default: {
      const exhaustive: never = state;
      return exhaustive;
    }
  }
}
