import { useEffect, useRef, useState } from 'react';
import type { BrowserIdentity } from '../access-composition';
import {
  createAuthenticatedApiClient,
  type ApiResult,
} from '../api/authenticated-api-client';
import { readRiskJournalStatement } from './operational-risk.response';
import type { OperationalRiskJournalStatement } from './operational-risk.types';

type JournalLoad =
  | { kind: 'none' }
  | { kind: 'loading' | 'error' | 'unavailable'; root: string }
  | { kind: 'ready'; value: OperationalRiskJournalStatement };

/** A private read lifetime inside the existing keyed Risk owner. */
export function useRiskJournalStatement({
  identity,
  companyId,
  riskId,
  reject,
  onUnavailable,
  onRead,
}: {
  identity: BrowserIdentity;
  companyId: string | undefined;
  riskId: string | undefined;
  reject: (result: ApiResult<unknown>, signal: AbortSignal) => Promise<boolean>;
  onUnavailable: (root: string) => void;
  onRead: (value: OperationalRiskJournalStatement) => void;
}) {
  const [state, setState] = useState<JournalLoad>({ kind: 'none' });
  const request = useRef<AbortController | undefined>(undefined);
  const mounted = useRef(false);
  const generation = useRef(0);
  const selectedRisk = useRef(riskId);
  selectedRisk.current = riskId;
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      request.current?.abort();
    };
  }, []);
  function clear(rejectingSignal?: AbortSignal) {
    generation.current++;
    // Retire the read without aborting the live shared rejection callback.
    if (request.current?.signal !== rejectingSignal) request.current?.abort();
    setState({ kind: 'none' });
  }
  async function load(
    originalEntryId: string,
  ): Promise<OperationalRiskJournalStatement | undefined> {
    if (!companyId || !riskId) return undefined;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    const root = originalEntryId;
    const sequence = ++generation.current;
    const live = () =>
      mounted.current &&
      !controller.signal.aborted &&
      selectedRisk.current === riskId &&
      generation.current === sequence;
    setState({ kind: 'loading', root });
    try {
      const api = await createAuthenticatedApiClient(identity);
      if (!live()) return undefined;
      const result = await api.request<unknown>(
        `/operational-risks/${encodeURIComponent(riskId)}/journal/${encodeURIComponent(root)}`,
        { companyContextId: companyId, signal: controller.signal },
      );
      // Guard even the shared rejection callback against retired/abort-ignoring reads.
      if (!live() || (await reject(result, controller.signal)) || !live())
        return undefined;
      if (result.status === 'notFound') {
        setState({ kind: 'unavailable', root });
        onUnavailable(root);
        return undefined;
      }
      if (result.status !== 'ok') throw new Error('Risk journal read failed.');
      const value = readRiskJournalStatement({
        value: result.value,
        companyId,
        riskId,
        journalEntryId: root,
      });
      onRead(value);
      setState({ kind: 'ready', value });
      return value;
    } catch {
      if (live()) setState({ kind: 'error', root });
      return undefined;
    }
  }
  return { state, load, clear };
}
