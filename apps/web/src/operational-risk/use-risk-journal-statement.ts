import { useRef, useState } from 'react';
import type { BrowserIdentity } from '../access-composition';
import {
  createAuthenticatedApiClient,
  type ApiResult,
} from '../api/authenticated-api-client';
import { useScopedOperationGroup } from '../api/use-scoped-operation';
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
  const work = useScopedOperationGroup(JSON.stringify([companyId, riskId]));
  const generation = useRef(0);
  function clear() {
    generation.current++;
    work.retire();
    setState({ kind: 'none' });
  }
  async function load(
    originalEntryId: string,
  ): Promise<OperationalRiskJournalStatement | undefined> {
    if (!companyId || !riskId) return undefined;
    const operation = work.beginLatest();
    if (!operation) return undefined;
    const root = originalEntryId;
    const sequence = ++generation.current;
    const live = () =>
      !operation.signal.aborted && generation.current === sequence;
    setState({ kind: 'loading', root });
    try {
      const api = await createAuthenticatedApiClient(identity);
      if (!live()) return undefined;
      const result = await api.request(
        `/operational-risks/${encodeURIComponent(riskId)}/journal/${encodeURIComponent(root)}`,
        { companyContextId: companyId, signal: operation.signal },
      );
      // Guard even the shared rejection callback against retired/abort-ignoring reads.
      if (!live() || (await reject(result, operation.signal)) || !live())
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
    } finally {
      operation.release();
    }
  }
  function checkpoint(): () => boolean {
    const sameLifetime = work.capture();
    const sequence = generation.current;
    return () => sameLifetime() && generation.current === sequence;
  }
  return { state, load, clear, checkpoint };
}
