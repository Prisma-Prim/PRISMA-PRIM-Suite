import './commercial-pdf.css';
import {
  useCallback,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { BrowserIdentity } from '../access-composition';
import type { ActorContext } from '../access-types';
import { createAuthenticatedApiClient } from '../api/authenticated-api-client';
import { handleAuthenticatedAccessRejection } from '../api/latest-authenticated-request';
import type { CommercialPdfTarget } from './commercial-pdf-response';
import { useCommercialPdfCopy } from './commercial-pdf.copy';

type ScopeFields =
  | 'workspaceId'
  | 'companyId'
  | 'opportunityId'
  | 'language'
  | 'sourceRendererVersion';
type Selection =
  | Omit<Extract<CommercialPdfTarget, { kind: 'offer' }>, ScopeFields>
  | Omit<Extract<CommercialPdfTarget, { kind: 'contract' }>, ScopeFields>;
export type CommercialPdfSelection = Selection | null;
export type CommercialPdfCallbacks = {
  select: (selection: CommercialPdfSelection, inlineBlocked?: boolean) => void;
  action?: ReactNode;
  navigate: () => void;
};
type Feedback =
  | 'pending'
  | 'offered'
  | 'denied'
  | 'unsupported'
  | 'stale'
  | 'malformed'
  | 'error'
  | 'limit'
  | 'unavailable';
type ScopedTarget = { scope: string; target: CommercialPdfTarget };
type Displayed = ScopedTarget & { inlineBlocked: boolean };
type Command = ScopedTarget & { feedback: Feedback };
type Props = {
  actor: ActorContext;
  identity: BrowserIdentity;
  opportunityId: string;
  kind: 'offer' | 'contract';
  navigation: number | undefined;
  onCompanyContextRejected: (companyId: string) => void;
  onActorRevalidated?: (actor: ActorContext) => void | Promise<void>;
  onWorkspaceAccessRejected?: () => void | Promise<void>;
};

/** Owns only the new PDF read; existing panel keys, reads and command owners stay independent. */
export function useCommercialPdfDownload(props: Props) {
  const copy = useCommercialPdfCopy(),
    statusId = useId(),
    captionId = useId();
  const [displayed, setDisplayed] = useState<Displayed | null>(null);
  const [command, setCommand] = useState<Command | null>(null);
  const pending = useRef<AbortController | undefined>(undefined);
  const held = useRef<CommercialPdfTarget | null>(null);
  const blobUrl = useRef<string | undefined>(undefined);
  const generation = useRef({ identity: props.identity, value: 0 });
  if (generation.current.identity !== props.identity)
    generation.current = {
      identity: props.identity,
      value: generation.current.value + 1,
    };
  const company = props.actor.activeCompany;
  const mayRead =
    props.actor.active &&
    Boolean(company) &&
    company?.commercialIntakePermissions?.includes(
      'commercial.opportunity.read',
    ) === true &&
    (props.kind === 'offer'
      ? company.offerPermissions?.includes('commercial.offer.read')
      : company.contractPermissions?.includes('commercial.contract.read')) ===
      true;
  const scope = JSON.stringify([
    generation.current.value,
    props.actor.active,
    props.actor.internalUserId,
    props.actor.workspaceId,
    props.actor.workspaceMembershipId,
    company?.id,
    props.opportunityId,
    props.kind,
    mayRead,
  ]);
  const liveScope = useRef(scope);
  liveScope.current = scope;
  const retire = useCallback(() => {
    pending.current?.abort();
    pending.current = undefined;
    held.current = null;
    if (blobUrl.current) URL.revokeObjectURL(blobUrl.current);
    blobUrl.current = undefined;
    setDisplayed(null);
    setCommand(null);
  }, []);
  // Cleanup runs before replacement child selections. A revoked lifetime never revives on regrant.
  useLayoutEffect(() => () => retire(), [scope, props.navigation, retire]);
  const select = useCallback(
    (selection: CommercialPdfSelection, inlineBlocked = false) => {
      if (!mayRead || !company?.id || liveScope.current !== scope) return;
      if (selection === null) {
        setDisplayed(null);
        return;
      }
      if (selection.kind !== props.kind) return;
      const next: Displayed = {
        scope,
        inlineBlocked,
        target: {
          ...selection,
          workspaceId: props.actor.workspaceId,
          companyId: company.id,
          opportunityId: props.opportunityId,
          language: 'ro',
          sourceRendererVersion: 1,
        },
      };
      // Display refreshes cannot cancel or retarget a pending/failed exact command.
      setDisplayed((previous) =>
        JSON.stringify(previous) === JSON.stringify(next) ? previous : next,
      );
    },
    [
      mayRead,
      company?.id,
      scope,
      props.actor.workspaceId,
      props.opportunityId,
      props.kind,
    ],
  );
  async function download(exact: CommercialPdfTarget) {
    if (!mayRead || liveScope.current !== scope || pending.current) return;
    const controller = new AbortController();
    pending.current = controller;
    held.current = exact;
    const valid = () =>
      !controller.signal.aborted &&
      liveScope.current === scope &&
      held.current === exact;
    setCommand({ scope, target: exact, feedback: 'pending' });
    try {
      const api = await createAuthenticatedApiClient(props.identity);
      if (!valid()) return;
      const result = await api.downloadCommercialPdf(
        `/${exact.kind === 'offer' ? 'offers' : 'contracts'}/opportunities/${encodeURIComponent(exact.opportunityId)}/versions/${encodeURIComponent(exact.versionId)}/pdf?sourceHtmlSha256=${exact.sourceHtmlSha256}`,
        exact,
        { companyContextId: exact.companyId, signal: controller.signal },
      );
      if (!valid()) return;
      if (result.status === 'unauthorized' || result.status === 'forbidden') {
        setCommand({ scope, target: exact, feedback: 'denied' });
        // The shell revalidation owns its lifetime; no child abort signal is passed.
        await handleAuthenticatedAccessRejection({
          result,
          identity: props.identity,
          companyContextId: exact.companyId,
          onCompanyContextRejected: props.onCompanyContextRejected,
          onActorRevalidated: props.onActorRevalidated ?? (() => undefined),
          onWorkspaceAccessRejected: props.onWorkspaceAccessRejected,
        });
        return;
      }
      if (result.status !== 'ok') {
        const feedback =
          result.status === 'malformed' ||
          result.status === 'unsupported' ||
          result.status === 'stale' ||
          result.status === 'limit' ||
          result.status === 'unavailable'
            ? result.status
            : result.status === 'notFound'
              ? 'unavailable'
              : 'error';
        setCommand({ scope, target: exact, feedback });
        return;
      }
      if (!valid()) return;
      const url = URL.createObjectURL(result.value.blob);
      blobUrl.current = url;
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = result.value.filename;
      try {
        anchor.click();
        setCommand({ scope, target: exact, feedback: 'offered' });
      } finally {
        URL.revokeObjectURL(url);
        blobUrl.current = undefined;
      }
    } catch {
      if (valid()) setCommand({ scope, target: exact, feedback: 'error' });
    } finally {
      if (pending.current === controller) pending.current = undefined;
    }
  }
  const selected =
    mayRead && displayed?.scope === scope ? displayed.target : null;
  const active = mayRead && command?.scope === scope ? command : null;
  const failed =
    active &&
    active.feedback !== 'pending' &&
    active.feedback !== 'offered' &&
    active.feedback !== 'denied';
  const sameTarget = Boolean(
    selected &&
    active &&
    JSON.stringify(selected) === JSON.stringify(active.target),
  );
  const blocked =
    active?.feedback === 'pending' || active?.feedback === 'denied';
  const primary = selected && {
    selected,
    active,
    blocked,
    retry: Boolean(failed && sameTarget),
    activate: () =>
      void download(failed && sameTarget && active ? active.target : selected),
  };
  const controls =
    active || (primary && displayed?.inlineBlocked) ? (
      <div className="commercial-pdf-held" data-kind={props.kind}>
        {primary && displayed?.inlineBlocked && (
          <CommercialPdfAction {...primary} placement="fallback" />
        )}
        {active && (
          <>
            <p id={captionId}>
              {copy.exactTarget}: {copy[active.target.kind]}{' '}
              {active.target.reference} · v{active.target.versionNumber} ·{' '}
              {active.target.sourceHtmlSha256}
            </p>
            {failed && !sameTarget && (
              <button
                className="commercial-pdf-button"
                type="button"
                aria-describedby={`${captionId} ${statusId}`}
                onClick={() => void download(active.target)}
              >
                {copy.retry}
              </button>
            )}
            <p
              id={statusId}
              role={failed || active.feedback === 'denied' ? 'alert' : 'status'}
              aria-live="polite"
            >
              {copy[active.feedback]}
            </p>
          </>
        )}
      </div>
    ) : null;
  return {
    callbacks: {
      select,
      navigate: retire,
      action: primary ? (
        <CommercialPdfAction {...primary} placement="inline" />
      ) : null,
    } satisfies CommercialPdfCallbacks,
    controls,
  };
}

/** Pure controlled presentation. Native disabled form boundaries remain untouched. */
function CommercialPdfAction({
  selected,
  active,
  blocked,
  retry,
  activate,
  placement,
}: {
  selected: CommercialPdfTarget;
  active: Command | null;
  blocked: boolean;
  retry: boolean;
  activate: () => void;
  placement: 'inline' | 'fallback';
}) {
  const copy = useCommercialPdfCopy(),
    captionId = useId(),
    feedbackId = useId();
  return (
    <div
      className="commercial-pdf-action"
      data-kind={selected.kind}
      data-placement={placement}
    >
      <button
        className="commercial-pdf-button"
        type="button"
        disabled={blocked}
        aria-describedby={`${captionId} ${feedbackId}`}
        onClick={activate}
      >
        {retry ? copy.retry : copy.action}
      </button>
      <p id={captionId}>
        {copy.selectedHtml}: {copy[selected.kind]} {selected.reference} · v
        {selected.versionNumber} · {selected.sourceHtmlSha256}
      </p>
      <p id={feedbackId}>
        {active && (
          <>
            {copy.exactTarget}: {copy[active.target.kind]}{' '}
            {active.target.reference} · v{active.target.versionNumber} ·{' '}
            {active.target.sourceHtmlSha256}. {copy[active.feedback]}
          </>
        )}
      </p>
    </div>
  );
}

/** Publishes only displayed source state. No cleanup, abort, held target or old reader state. */
export function useCommercialPdfDisplayed(
  selection: CommercialPdfSelection | undefined,
  onSelection?: CommercialPdfCallbacks['select'],
  inlineBlocked = false,
) {
  const signature = JSON.stringify(selection);
  useLayoutEffect(() => {
    if (selection !== undefined) onSelection?.(selection, inlineBlocked);
  }, [onSelection, signature, selection, inlineBlocked]);
}
export function CommercialPdfSelection({
  selection,
  onSelection,
  inlineBlocked = false,
}: {
  inlineBlocked?: boolean;
  selection: CommercialPdfSelection;
  onSelection?: CommercialPdfCallbacks['select'];
}) {
  useCommercialPdfDisplayed(selection, onSelection, inlineBlocked);
  return null;
}
