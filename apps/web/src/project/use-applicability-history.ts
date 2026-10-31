import { useEffect, useRef, useState } from 'react';
import type { BrowserIdentity } from '../access-composition';
import {
  createAuthenticatedApiClient,
  type ApiResult,
} from '../api/authenticated-api-client';
import type { CopiedPilotTemplatePlan } from './project-template-response';
import {
  readApplicabilityHistory,
  type ApplicabilityFact,
  type ApplicabilitySnapshot,
} from './mission-applicability-response';
import {
  resolveApplicabilityRelation,
  type ApplicabilityRelation,
} from './applicability-relations';

type HistoryPage = Extract<
  NonNullable<ReturnType<typeof readApplicabilityHistory>>,
  { kind: 'available' }
>;
type PageState =
  | { kind: 'initial' | 'unavailable' }
  | { kind: 'ready'; page: HistoryPage }
  | { kind: 'loading' | 'error'; previous: HistoryPage | null };
type Context = {
  origin: ApplicabilityFact;
  relation: ApplicabilityRelation;
  returnTo: HTMLElement;
  valid: () => boolean;
  scopeValid: () => boolean;
};
type Inspection =
  | { kind: 'closed' }
  | {
      kind: 'reading' | 'error' | 'more';
      context: Context;
      before: number;
      focusFrom: HTMLElement;
    }
  | { kind: 'unverified'; context: Context }
  | {
      kind: 'found';
      context: Context;
      target: ApplicabilityFact;
      focusFrom: HTMLElement;
      requestFocus: boolean;
    };
type Purpose =
  | { kind: 'page'; before?: number }
  | {
      kind: 'inspection';
      before: number;
      context: Context;
      focusFrom: HTMLElement;
    };
function snapshotFacts(snapshot: ApplicabilitySnapshot | null) {
  return (
    snapshot?.activities
      .flatMap((row) => [
        row.pendingProposal,
        row.activeApproval,
        row.lastProposal,
        row.lastDecision,
        row.lastRestoration,
      ])
      .filter((fact) => fact !== null) ?? []
  );
}
function currentPage(state: PageState) {
  return state.kind === 'ready'
    ? state.page
    : state.kind === 'loading' || state.kind === 'error'
      ? state.previous
      : null;
}

/** One bounded page and one explicit business reference, under the reader's existing authority. */
export function useApplicabilityHistory(props: {
  path: string;
  identity: BrowserIdentity;
  companyId: string | undefined;
  plan: CopiedPilotTemplatePlan;
  snapshot: ApplicabilitySnapshot | null;
  capture: () => () => boolean;
  captureRecovery: () => () => boolean;
  recover: (
    result: ApiResult<unknown>,
    valid: () => boolean,
    recoveryValid: () => boolean,
    signal: AbortSignal,
  ) => Promise<void>;
  onDenied: () => void;
}) {
  const [state, setState] = useState<PageState>({ kind: 'initial' }),
    [inspection, setInspection] = useState<Inspection>({ kind: 'closed' });
  const request = useRef<AbortController | undefined>(undefined),
    epoch = useRef(0),
    selectedContext = useRef<object | null>(null);
  function cancel() {
    epoch.current += 1;
    request.current?.abort();
    selectedContext.current = null;
  }
  function close() {
    if (selectedContext.current === null) return;
    cancel();
    setInspection({ kind: 'closed' });
    setState((current) =>
      current.kind === 'loading'
        ? current.previous
          ? { kind: 'ready', page: current.previous }
          : { kind: 'initial' }
        : current,
    );
  }
  function clear() {
    close();
    cancel();
    setState({ kind: 'initial' });
  }
  useEffect(() => () => cancel(), []);
  const visibleInspection: Inspection =
      inspection.kind === 'closed' || inspection.context.valid()
        ? inspection
        : { kind: 'closed' },
    page = currentPage(state),
    knownFacts = [
      ...snapshotFacts(props.snapshot),
      ...(page?.facts ?? []),
      ...(visibleInspection.kind === 'closed'
        ? []
        : [visibleInspection.context.origin]),
      ...(visibleInspection.kind === 'found' ? [visibleInspection.target] : []),
    ];
  async function read(purpose: Purpose) {
    const scopeValid = props.capture(),
      recoveryValid = props.captureRecovery(),
      requestedFocus =
        purpose.kind === 'inspection' &&
        document.activeElement === purpose.focusFrom;
    if (
      !scopeValid() ||
      (purpose.kind === 'inspection' && !purpose.context.valid())
    )
      return;
    epoch.current += 1;
    const capturedEpoch = epoch.current;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    const live = () =>
      scopeValid() &&
      epoch.current === capturedEpoch &&
      !controller.signal.aborted &&
      (purpose.kind === 'page' || purpose.context.valid());
    setState({ kind: 'loading', previous: currentPage(state) });
    if (purpose.kind === 'inspection')
      setInspection({
        kind: 'reading',
        context: purpose.context,
        before: purpose.before,
        focusFrom: purpose.focusFrom,
      });
    function failed() {
      if (!live()) return;
      setState({ kind: 'error', previous: currentPage(state) });
      if (purpose.kind === 'inspection')
        setInspection({
          kind: 'error',
          context: purpose.context,
          before: purpose.before,
          focusFrom: purpose.focusFrom,
        });
    }
    try {
      const api = await createAuthenticatedApiClient(props.identity);
      if (!live()) return;
      const result = await api.request<unknown>(
        props.path +
          '/history' +
          (purpose.before === undefined
            ? ''
            : `?beforeRevision=${purpose.before}`),
        { companyContextId: props.companyId, signal: controller.signal },
      );
      if (!live()) return;
      if (result.status === 'unauthorized' || result.status === 'forbidden') {
        await props.recover(result, live, recoveryValid, controller.signal);
        if (live()) props.onDenied();
        return;
      }
      if (result.status !== 'ok') {
        failed();
        return;
      }
      const next = readApplicabilityHistory(
        result.value,
        props.plan,
        purpose.before,
      );
      if (!next) {
        failed();
        return;
      }
      if (!live()) return;
      if (next.kind === 'unavailable') {
        cancel();
        setInspection({ kind: 'closed' });
        setState({ kind: 'unavailable' });
        return;
      }
      setState({ kind: 'ready', page: next });
      if (purpose.kind === 'inspection') {
        const resolved = resolveApplicabilityRelation({
          origin: purpose.context.origin,
          relation: purpose.context.relation,
          facts: [...snapshotFacts(props.snapshot), ...next.facts],
        });
        if (!live()) return;
        if (resolved.kind === 'known')
          setInspection({
            kind: 'found',
            context: purpose.context,
            target: resolved.fact,
            focusFrom: purpose.focusFrom,
            requestFocus:
              document.activeElement === purpose.focusFrom ||
              (requestedFocus &&
                document.activeElement === document.body &&
                !purpose.focusFrom.isConnected),
          });
        else if (
          resolved.kind === 'notLoaded' &&
          next.nextBeforeRevision !== null
        )
          setInspection({
            kind: 'more',
            context: purpose.context,
            before: next.nextBeforeRevision,
            focusFrom: purpose.focusFrom,
          });
        else setInspection({ kind: 'unverified', context: purpose.context });
      }
    } catch {
      failed();
    }
  }
  function loadPage(before?: number) {
    close();
    return read({ kind: 'page', before });
  }
  function inspect(
    origin: ApplicabilityFact,
    relation: ApplicabilityRelation,
    returnTo: HTMLElement,
  ) {
    close();
    const token = {},
      scopeValid = props.capture();
    selectedContext.current = token;
    const context: Context = {
      origin,
      relation,
      returnTo,
      scopeValid,
      valid: () => scopeValid() && selectedContext.current === token,
    };
    if (!context.valid()) return;
    const resolved = resolveApplicabilityRelation({
      origin,
      relation,
      facts: knownFacts,
    });
    if (resolved.kind === 'known')
      setInspection({
        kind: 'found',
        context,
        target: resolved.fact,
        focusFrom: returnTo,
        requestFocus: document.activeElement === returnTo,
      });
    else if (resolved.kind === 'unverified')
      setInspection({ kind: 'unverified', context });
    else
      void read({
        kind: 'inspection',
        before: origin.revision,
        context,
        focusFrom: returnTo,
      });
  }
  function continueInspection(focusFrom: HTMLElement) {
    if (
      (visibleInspection.kind === 'more' ||
        visibleInspection.kind === 'error') &&
      visibleInspection.context.valid()
    )
      void read({
        kind: 'inspection',
        context: visibleInspection.context,
        before: visibleInspection.before,
        focusFrom,
      });
  }
  return {
    state,
    page,
    knownFacts,
    inspection: visibleInspection,
    inspect,
    continueInspection,
    close,
    clear,
    loadPage,
  };
}
