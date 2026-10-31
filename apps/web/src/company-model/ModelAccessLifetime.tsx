import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { BrowserIdentity } from '../access-composition';
import type { ActorContext } from '../access-types';
import type { ApiResult } from '../api/authenticated-api-client';
import { useAccessRecovery } from '../api/use-access-recovery';

// These are the complete runtime inputs. Admission and content stay in callers.
type Props = {
  identity: BrowserIdentity;
  actor: ActorContext;
  authority: { key: string; companyId: string };
  onActorRevalidated?: (actor: ActorContext) => void | Promise<void>;
  onCompanyContextRejected?: (companyId: string) => void;
  onWorkspaceAccessRejected?: () => void | Promise<void>;
  denied: (retry: () => void) => ReactNode;
  children: ReactNode;
};

type Reject = (result: ApiResult<unknown>) => void;
const Rejection = createContext<Reject | null>(null);

/** Owns recovery independently from the protected business subtree. */
export function ModelAccessLifetime(props: Props) {
  const [session, setSession] = useState({
    identity: props.identity,
    generation: 0,
  });
  if (session.identity !== props.identity) {
    setSession({
      identity: props.identity,
      generation: session.generation + 1,
    });
    return null;
  }
  return (
    <ScopeOwner
      key={`${session.generation}:${props.authority.companyId}:${props.authority.key}`}
      {...props}
    />
  );
}

function ScopeOwner(props: Props) {
  const { denied, reject, retry } = useAccessRecovery(props);

  return denied ? (
    props.denied(retry)
  ) : (
    <Rejection.Provider value={reject}>{props.children}</Rejection.Provider>
  );
}

/** Stable within a live consumer; calls retained by retired children are inert. */
export function useModelAccessRejection(): Reject {
  const rejection = useContext(Rejection);
  if (!rejection) throw new Error('Company model access lifetime is required.');
  const latest = useRef(rejection);
  latest.current = rejection;
  const live = useRef(true);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);
  return useCallback((result) => {
    if (live.current) latest.current(result);
  }, []);
}
