import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import type { BrowserIdentity } from '../access-composition';
import type { ActorContext } from '../access-types';
import { createAuthenticatedApiClient } from '../api/authenticated-api-client';
import {
  useScopedOperation,
  useScopedOperationGroup,
} from '../api/use-scoped-operation';
import { useWorkspaceRequestScope } from './use-workspace-request-scope';
import {
  invitationPageResponse,
  invitationResponse,
  type InvitationPage,
} from './workspace-invitation-response';

export type InvitationPageState =
  | { status: 'loading' | 'error' | 'forbidden' }
  | { status: 'ready'; page: InvitationPage };
type Command = { path: string; body: string; key: string };
export type FieldValidationError = 'required' | 'invalid' | null;
export type InvitationValidationErrors = {
  email: FieldValidationError;
  expiry: FieldValidationError;
};

export const noInvitationValidationErrors = {
  email: null,
  expiry: null,
} satisfies InvitationValidationErrors;

/**
 * Workspace invitations as both interfaces present them: the paged list, the
 * invitation draft, and the invite, provider check and revoke commands with
 * the exact retry of an unconfirmed command.
 */
export function useWorkspaceInvitations({
  actor,
  identity,
  onActivityRecorded,
  onWorkspaceAccessRejected,
}: Readonly<{
  actor: ActorContext;
  identity: BrowserIdentity;
  onActivityRecorded: () => void | Promise<void>;
  onWorkspaceAccessRejected: () => void | Promise<void>;
}>) {
  const [state, setState] = useState<InvitationPageState>({
    status: 'loading',
  });
  const [email, setEmail] = useState('');
  const [days, setDays] = useState('7');
  const [validationErrors, setValidationErrors] =
    useState<InvitationValidationErrors>(noInvitationValidationErrors);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [reviewing, setReviewing] = useState<string | null>(null);
  const retry = useRef<Command | undefined>(undefined);
  const { allowed, scope, captureRecovery } = useWorkspaceRequestScope({
    actor,
    identity,
    permission: 'member.invite',
  });
  const listing = useScopedOperation(scope);
  const commands = useScopedOperationGroup(scope);
  const callbacks = useRef({ onActivityRecorded, onWorkspaceAccessRejected });
  useLayoutEffect(() => {
    callbacks.current = { onActivityRecorded, onWorkspaceAccessRejected };
  });

  const load = useCallback(
    async (after?: string) => {
      if (!allowed || commands.isPending()) return;
      const signal = listing.begin();
      if (!signal) return;
      const recoveryLive = captureRecovery();
      setState({ status: 'loading' });
      try {
        const api = await createAuthenticatedApiClient(identity);
        if (signal.aborted) return;
        const result = await api.request(
          `/workspace-invitations${after ? `?after=${encodeURIComponent(after)}` : ''}`,
          { signal },
        );
        if (signal.aborted) return;
        if (result.status === 'unauthorized' || result.status === 'forbidden') {
          setState({ status: 'forbidden' });
          retry.current = undefined;
          if (recoveryLive()) {
            if (result.status === 'unauthorized')
              await identity.rejectSession();
            else await callbacks.current.onWorkspaceAccessRejected();
          }
          return;
        }
        if (result.status !== 'ok')
          throw new Error('Invitation listing failed.');
        setState({
          status: 'ready',
          page: invitationPageResponse(result.value),
        });
      } catch {
        if (!signal.aborted) setState({ status: 'error' });
      }
    },
    [identity, allowed, commands, listing, captureRecovery],
  );

  useEffect(() => {
    retry.current = undefined;
    setEmail('');
    setValidationErrors(noInvitationValidationErrors);
    setReviewing(null);
    setFailed(false);
    setBusy(false);
    if (allowed) void load();
    return () => {
      listing.retire();
      commands.retire();
    };
  }, [scope, allowed, load, listing, commands]);

  /** Sends one command; true only once the server confirmed it. */
  async function submit(path: string, body: object): Promise<boolean> {
    if (!allowed || busy || state.status !== 'ready' || commands.isPending())
      return false;
    const operation = commands.begin();
    if (!operation) return false;
    const current = () => commands.isLive() && !operation.signal.aborted;
    const recoveryLive = captureRecovery();
    const serialized = JSON.stringify(body);
    const command =
      retry.current?.path === path && retry.current.body === serialized
        ? retry.current
        : { path, body: serialized, key: crypto.randomUUID() };
    retry.current = command;
    listing.retire();
    setBusy(true);
    setFailed(false);
    try {
      const api = await createAuthenticatedApiClient(identity);
      if (!current()) return false;
      const result = await api.request(`/workspace-invitations${path}`, {
        method: 'POST',
        body: command.body,
        headers: {
          'content-type': 'application/json',
          'idempotency-key': command.key,
        },
        signal: operation.signal,
      });
      if (!current()) return false;
      if (result.status === 'unauthorized' || result.status === 'forbidden') {
        setState({ status: 'forbidden' });
        retry.current = undefined;
        if (recoveryLive()) {
          if (result.status === 'unauthorized') await identity.rejectSession();
          else await callbacks.current.onWorkspaceAccessRejected();
        }
        return false;
      }
      if (result.status !== 'ok')
        throw new Error('Invitation command unconfirmed.');
      const invitation = invitationResponse(result.value);
      setState((current) =>
        current.status === 'ready'
          ? {
              status: 'ready',
              page: {
                ...current.page,
                invitations: [
                  invitation,
                  ...current.page.invitations.filter(
                    (entry) => entry.id !== invitation.id,
                  ),
                ],
              },
            }
          : current,
      );
      retry.current = undefined;
      setReviewing(null);
      if (path === '') setEmail('');
      await callbacks.current.onActivityRecorded();
      return true;
    } catch {
      if (current()) setFailed(true);
      return false;
    } finally {
      if (current()) setBusy(false);
      operation.release();
    }
  }

  return {
    allowed,
    state,
    email,
    days,
    validationErrors,
    busy,
    failed,
    reviewing,
    load,
    /** Edits the recipient; an unconfirmed invitation is no longer retried. */
    changeEmail(value: string) {
      setEmail(value);
      setValidationErrors((current) => ({ ...current, email: null }));
      retry.current = undefined;
    },
    /** Edits the validity in days; an unconfirmed invitation is no longer retried. */
    changeDays(value: string) {
      setDays(value);
      setValidationErrors((current) => ({ ...current, expiry: null }));
      retry.current = undefined;
    },
    setValidationErrors,
    invite() {
      return submit('', { email, expiresInDays: Number(days) });
    },
    checkStatus(invitationId: string) {
      return submit(`/${invitationId}/refresh`, {});
    },
    reviewRevocation: setReviewing,
    revoke(invitationId: string) {
      return submit(`/${invitationId}/revoke`, {});
    },
  };
}
