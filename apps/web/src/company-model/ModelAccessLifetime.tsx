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
import { handleAuthenticatedAccessRejection } from '../api/latest-authenticated-request';

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
  const [denied, setDenied] = useState(false);
  const rejected = useRef(false);
  const pending = useRef<AbortController | null>(null);
  const latest = useRef(props);
  const owner = useRef({ actor: props.actor, generation: 0 });

  // A recovery publishes a complete ActorContext; a newer actor snapshot makes
  // that publication stale even if this model's captured authority key is equal.
  if (owner.current.actor !== props.actor) {
    pending.current?.abort();
    pending.current = null;
    owner.current = {
      actor: props.actor,
      generation: owner.current.generation + 1,
    };
  }
  latest.current = props;

  useEffect(
    () => () => {
      owner.current.generation += 1;
      pending.current?.abort();
      pending.current = null;
    },
    [],
  );

  const reject: Reject = (result) => {
    if (
      rejected.current ||
      (result.status !== 'forbidden' && result.status !== 'unauthorized')
    )
      return;
    rejected.current = true;
    const controller = new AbortController();
    pending.current = controller;
    const generation = owner.current.generation;
    const live = () =>
      owner.current.generation === generation &&
      pending.current === controller &&
      !controller.signal.aborted;

    // Removing children retires their requests/drafts/attempts. The independent
    // recovery controller remains owned here and cannot be canceled by them.
    setDenied(true);
    void handleAuthenticatedAccessRejection({
      result,
      identity: props.identity,
      companyContextId: props.authority.companyId,
      signal: controller.signal,
      onActorRevalidated: (actor) =>
        live() ? latest.current.onActorRevalidated?.(actor) : undefined,
      onCompanyContextRejected: (companyId) => {
        if (live()) latest.current.onCompanyContextRejected?.(companyId);
      },
      onWorkspaceAccessRejected: () =>
        live() ? latest.current.onWorkspaceAccessRejected?.() : undefined,
    })
      .catch(() => undefined)
      .finally(() => {
        if (pending.current === controller) pending.current = null;
      });
  };

  function retry() {
    pending.current?.abort();
    pending.current = null;
    owner.current.generation += 1;
    rejected.current = false;
    setDenied(false);
  }

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
