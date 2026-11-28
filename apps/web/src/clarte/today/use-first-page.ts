import { useEffect, useState } from 'react';
import type { BrowserIdentity } from '../../access-composition';
import { runLatestAuthenticatedRequest } from '../../api/latest-authenticated-request';
import { useRequestLifetime } from '../../api/use-actor-requests';
import { useScopedOperation } from '../../api/use-scoped-operation';

export type FirstPage<Page> =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'denied' }
  | { kind: 'ready'; page: Page };

/**
 * The first page of one existing paged Task read, with the same request,
 * session rejection and late-reply suppression as its full list. A Company,
 * membership or session change retires the reply; `enabled` false reads
 * nothing and shows nothing.
 */
export function useFirstPage<Page>({
  identity,
  companyId,
  workspaceMembershipId,
  path,
  enabled,
  parse,
}: Readonly<{
  identity: BrowserIdentity;
  companyId: string;
  workspaceMembershipId: string;
  /** The existing read at offset zero, for example `/due-soon-tasks?offset=0`. */
  path: string;
  enabled: boolean;
  parse: (value: unknown) => Page;
}>): { load: FirstPage<Page>; retry: () => void } {
  const [load, setLoad] = useState<FirstPage<Page>>({ kind: 'idle' });
  const ownerScope = String(
    useRequestLifetime(
      identity,
      JSON.stringify([companyId, workspaceMembershipId, path, enabled]),
    ),
  );
  const latest = useScopedOperation(ownerScope);
  function read() {
    if (!enabled) {
      setLoad({ kind: 'idle' });
      return;
    }
    const requestSignal = latest.begin();
    if (!requestSignal) return;
    setLoad({ kind: 'loading' });
    void runLatestAuthenticatedRequest({
      signal: requestSignal,
      identity,
      execute: (api, signal) =>
        api.request(path, { companyContextId: companyId, signal }),
      onResult: async (result, signal) => {
        if (result.status === 'unauthorized') {
          await identity.rejectSession();
          if (!signal.aborted) setLoad({ kind: 'denied' });
        } else if (result.status === 'forbidden') setLoad({ kind: 'denied' });
        else if (result.status !== 'ok') setLoad({ kind: 'error' });
        else setLoad({ kind: 'ready', page: parse(result.value) });
      },
      onError: () => setLoad({ kind: 'error' }),
    });
  }
  useEffect(() => {
    read();
  }, [ownerScope]);
  return { load: enabled ? load : { kind: 'idle' }, retry: read };
}
