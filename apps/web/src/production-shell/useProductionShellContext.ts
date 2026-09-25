import { useMemo, useSyncExternalStore } from 'react';
import type { BrowserIdentity } from '../access-composition';
import { createAuthenticatedProductionShellTransport } from './authenticated-production-shell-transport';
import {
  createProductionShellSession,
  type ProductionShellSessionSnapshot,
} from './production-shell-session';

export type {
  ActivityLogEvent,
  ActivityLogState,
  CompanyContextState,
  ProductionShellContext,
  ProjectResponsibleChangedActivityLogEvent,
} from './company-context-transitions';

export function useProductionShellContext(
  identity: BrowserIdentity,
): ProductionShellSessionSnapshot {
  const session = useMemo(
    () =>
      createProductionShellSession({
        createTransport: () =>
          createAuthenticatedProductionShellTransport(identity),
        rejectSession: identity.rejectSession,
        shouldInitialize: identity.loaded && identity.signedIn,
      }),
    [identity],
  );
  return useSyncExternalStore(
    session.subscribe,
    session.getSnapshot,
    session.getSnapshot,
  );
}
