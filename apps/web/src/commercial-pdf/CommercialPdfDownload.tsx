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
import {
  useActorObservation,
  useRequestLifetime,
} from '../api/use-actor-requests';
import { useScopedOperationGroup } from '../api/use-scoped-operation';
import { holds } from '../access/company-grants';
import { useAuthorityLifetime } from '../access/use-authority-lifetime';
import { holdsContractRead, holdsOfferRead } from '../contract/contract-grants';
import type { CommercialPdfTarget } from './commercial-pdf-response';
import { useCommercialPdfCopy } from './commercial-pdf.copy';

type ScopeFields =
  | 'workspaceId'
  | 'companyId'
  | 'opportunityId'
  | 'language'
  | 'sourceRendererVersion';
type WithoutScope<T> = T extends CommercialPdfTarget
  ? Omit<T, ScopeFields>
  : never;
type Selection =
  | (WithoutScope<Extract<CommercialPdfTarget, { kind: 'offer' }>> & {
      requiresClientRead?: false;
    })
  | (Omit<Extract<CommercialPdfTarget, { kind: 'contract' }>, ScopeFields> & {
      requiresClientRead: boolean;
    });
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
type ScopedTarget = {
  scope: number;
  target: CommercialPdfTarget;
  requiresClientRead: boolean;
};
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
  const blobUrl = useRef<string | undefined>(undefined);
  const company = props.actor.activeCompany;
  const clientReadable =
    props.actor.workspacePermissions.includes('client.manage') ||
    holds(company, 'company_director_client_access', 'client.read');
  // The held exact read retains its consumed authority even when its reader disappears.
  const requiresClientRead =
    command?.requiresClientRead ?? displayed?.requiresClientRead ?? false;
  const mayRead =
    (!requiresClientRead || clientReadable) &&
    props.actor.active &&
    Boolean(company) &&
    holds(
      company,
      'company_commercial_intake',
      'commercial.opportunity.read',
    ) &&
    (props.kind === 'offer'
      ? holdsOfferRead(company)
      : holdsContractRead(company));
  const scope = useRequestLifetime(
    props.identity,
    JSON.stringify([
      props.actor.active,
      props.actor.internalUserId,
      props.actor.workspaceId,
      props.actor.workspaceMembershipId,
      company?.id,
      props.opportunityId,
      props.kind,
      mayRead,
    ]),
  );
  const work = useScopedOperationGroup(
    JSON.stringify([scope, props.navigation]),
  );
  const actorObservation = useActorObservation(props.actor);
  const captureRecovery = useAuthorityLifetime(
    String(actorObservation),
    props.identity,
  );
  const clear = useCallback(() => {
    if (blobUrl.current) URL.revokeObjectURL(blobUrl.current);
    blobUrl.current = undefined;
    setDisplayed(null);
    setCommand(null);
  }, []);
  useLayoutEffect(() => clear, [work, clear]);
  function retire() {
    work.retire();
    clear();
  }
  const select = useCallback(
    (selection: CommercialPdfSelection, inlineBlocked = false) => {
      if (!mayRead || !company?.id) return;
      if (selection === null) {
        setDisplayed((current) => (current?.scope === scope ? null : current));
        return;
      }
      if (selection.kind !== props.kind) return;
      if (selection.requiresClientRead && !clientReadable) {
        setDisplayed((current) => (current?.scope === scope ? null : current));
        return;
      }
      const { requiresClientRead: selectedClientRead, ...source } = selection;
      const identity = {
        workspaceId: props.actor.workspaceId,
        companyId: company.id,
        opportunityId: props.opportunityId,
        sourceRendererVersion: 1,
      } satisfies Pick<
        CommercialPdfTarget,
        'workspaceId' | 'companyId' | 'opportunityId' | 'sourceRendererVersion'
      >;
      const target: CommercialPdfTarget =
        source.provenance === 'ILLUSTRATIVE'
          ? { ...source, ...identity, language: 'en' }
          : { ...source, ...identity, language: 'ro' };
      const next: Displayed = {
        scope,
        requiresClientRead: selectedClientRead ?? false,
        inlineBlocked,
        target,
      };
      // Display refreshes cannot cancel or retarget a pending/failed exact command.
      setDisplayed((previous) =>
        (previous && previous.scope > scope) ||
        JSON.stringify(previous) === JSON.stringify(next)
          ? previous
          : next,
      );
    },
    [
      mayRead,
      clientReadable,
      company?.id,
      scope,
      props.actor.workspaceId,
      props.opportunityId,
      props.kind,
    ],
  );
  async function download(
    exact: CommercialPdfTarget,
    consumesClientRead: boolean,
  ) {
    if (!mayRead || (consumesClientRead && !clientReadable) || work.isPending())
      return;
    const operation = work.begin();
    if (!operation) return;
    const { signal } = operation;
    const valid = () => !signal.aborted;
    const recoveryCurrent = captureRecovery();
    const exactCommand = {
      scope,
      target: exact,
      requiresClientRead: consumesClientRead,
    };
    setCommand({ ...exactCommand, feedback: 'pending' });
    try {
      const api = await createAuthenticatedApiClient(props.identity);
      if (!valid()) return;
      const result = await api.downloadCommercialPdf(
        `/${exact.kind === 'offer' ? 'offers' : 'contracts'}/opportunities/${encodeURIComponent(exact.opportunityId)}/versions/${encodeURIComponent(exact.versionId)}/pdf?sourceHtmlSha256=${exact.sourceHtmlSha256}`,
        exact,
        { companyContextId: exact.companyId, signal },
      );
      if (!valid()) return;
      if (result.status === 'unauthorized' || result.status === 'forbidden') {
        setCommand({ ...exactCommand, feedback: 'denied' });
        // The shell may finish an admitted revalidation after this PDF view closes.
        if (recoveryCurrent())
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
        setCommand({ ...exactCommand, feedback });
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
        setCommand({ ...exactCommand, feedback: 'offered' });
      } finally {
        URL.revokeObjectURL(url);
        blobUrl.current = undefined;
      }
    } catch {
      if (valid()) setCommand({ ...exactCommand, feedback: 'error' });
    } finally {
      operation.release();
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
      void download(
        failed && sameTarget && active ? active.target : selected,
        failed && sameTarget && active
          ? active.requiresClientRead
          : (displayed?.requiresClientRead ?? false),
      ),
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
                onClick={() =>
                  void download(active.target, active.requiresClientRead)
                }
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
