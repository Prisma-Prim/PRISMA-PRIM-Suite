import { act, fireEvent, screen } from '../test/render-with-interface-locale';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { appInterfaces, renderInInterface } from '../test/app-interface';
import type { BrowserIdentity } from '../access-composition';
import { WorkspaceInvitationAcceptance } from './WorkspaceInvitationAcceptance';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  sessionStorage.clear();
  localStorage.clear();
});

describe.each(appInterfaces)(
  'invitation acceptance in the %s interface',
  (appInterface) => {
    it('retries stalled token acquisition and ignores the obsolete attempt', async () => {
      vi.useFakeTimers();
      const firstToken = pendingToken();
      const retryToken = pendingToken();
      const getToken = vi
        .fn<BrowserIdentity['getToken']>()
        .mockReturnValueOnce(firstToken.promise)
        .mockReturnValueOnce(retryToken.promise);
      const fetch = vi.fn(async () => new Response(null, { status: 403 }));
      vi.stubGlobal('fetch', fetch);
      renderInInterface(
        appInterface,
        <WorkspaceInvitationAcceptance
          identity={{
            loaded: true,
            signedIn: true,
            getToken,
            signOut: async () => {},
            rejectSession: async () => {},
            signedOutView: null,
          }}
          intent={{
            invitationId: 'aaaaaaaa-0000-4000-8000-000000000163',
            key: '00000000-0000-4000-8000-000000000163',
            attempted: false,
          }}
        />,
      );
      fireEvent.click(
        screen.getByRole('button', { name: 'Accept invitation' }),
      );
      await act(() => vi.advanceTimersByTimeAsync(35_000));
      fireEvent.click(screen.getByRole('button', { name: 'Retry acceptance' }));
      expect(getToken).toHaveBeenCalledTimes(2);
      await act(async () => firstToken.resolve('obsolete-session'));
      expect(fetch).not.toHaveBeenCalled();
      expect(
        screen.getByRole('button', { name: 'Accept invitation' }),
      ).toBeDisabled();
      await act(async () => retryToken.resolve('current-session'));
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(screen.getByRole('alert')).toHaveTextContent(
        'This invitation cannot be accepted with your current access.',
      );
      expect(
        screen.queryByRole('button', { name: 'Accept invitation' }),
      ).not.toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: 'Use another account' }),
      ).toBeEnabled();
    });

    it('retires a held acceptance when identity changes and never revives it on A-to-B-to-A', async () => {
      const oldToken = pendingToken();
      const currentToken = pendingToken();
      const getToken = vi
        .fn<BrowserIdentity['getToken']>()
        .mockReturnValueOnce(oldToken.promise)
        .mockReturnValueOnce(currentToken.promise);
      const identity: BrowserIdentity = {
        loaded: true,
        signedIn: true,
        getToken,
        signOut: async () => {},
        rejectSession: async () => {},
        signedOutView: null,
      };
      const intent = {
        invitationId: 'aaaaaaaa-0000-4000-8000-000000000163',
        key: '00000000-0000-4000-8000-000000000163',
        attempted: false,
      };
      const fetch = vi.fn(async () => new Response(null, { status: 403 }));
      vi.stubGlobal('fetch', fetch);
      const probe = renderInInterface(
        appInterface,
        <WorkspaceInvitationAcceptance identity={identity} intent={intent} />,
      );
      fireEvent.click(
        screen.getByRole('button', { name: 'Accept invitation' }),
      );
      expect(getToken).toHaveBeenCalledOnce();
      probe.rerender(
        <WorkspaceInvitationAcceptance
          identity={{ ...identity, getToken: async () => 'other-session' }}
          intent={intent}
        />,
      );
      expect(
        screen.getByRole('button', { name: 'Accept invitation' }),
      ).toBeEnabled();
      probe.rerender(
        <WorkspaceInvitationAcceptance identity={identity} intent={intent} />,
      );
      fireEvent.click(
        screen.getByRole('button', { name: 'Accept invitation' }),
      );
      expect(getToken).toHaveBeenCalledTimes(2);
      await act(async () => oldToken.resolve('retired-session'));
      expect(fetch).not.toHaveBeenCalled();
      expect(
        screen.getByRole('button', { name: 'Accept invitation' }),
      ).toBeDisabled();
      await act(async () => currentToken.resolve('current-session'));
      expect(fetch).toHaveBeenCalledOnce();
      expect(screen.getByRole('alert')).toHaveTextContent(
        'This invitation cannot be accepted with your current access.',
      );
      expect(
        screen.queryByRole('button', { name: 'Accept invitation' }),
      ).not.toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: 'Use another account' }),
      ).toBeEnabled();
    });
  },
);

function pendingToken() {
  let resolve: (value: string | null) => void = () => {
    throw new Error('Token promise is not initialized.');
  };
  const promise = new Promise<string | null>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}
