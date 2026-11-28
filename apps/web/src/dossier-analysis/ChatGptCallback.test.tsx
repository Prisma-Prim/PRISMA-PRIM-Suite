import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApplicationRoot } from '../ApplicationRoot';
import { interfaceLocaleStorageKey } from '../localization/interface-locale';
import { appInterfaces } from '../test/app-interface';
import {
  expectEntryInterface,
  storeInterfacePreference,
} from '../test/entry-interface';

describe.each(appInterfaces)(
  'ChatGPT callback window in the %s interface',
  (appInterface) => {
    beforeEach(() => {
      localStorage.setItem(interfaceLocaleStorageKey, 'en');
      storeInterfacePreference(appInterface);
      window.history.replaceState(
        null,
        '',
        '/chatgpt/callback?state=fictional-state&code=fictional-code',
      );
    });

    afterEach(() => {
      vi.restoreAllMocks();
      vi.unstubAllGlobals();
      localStorage.clear();
      window.history.replaceState(null, '', '/');
    });

    it('does not claim that a callback was delivered when the initiating window is absent', async () => {
      vi.stubGlobal('opener', null);
      const fetch = vi.fn();
      vi.stubGlobal('fetch', fetch);

      render(<ApplicationRoot pathname="/chatgpt/callback" />);

      expect(
        await screen.findByText(
          'Sign-in could not be completed. Return to PRISMA and start again.',
        ),
      ).toBeVisible();
      expect(window.location.search).toBe('');
      expect(fetch).not.toHaveBeenCalled();
      expectEntryInterface(appInterface);
    });

    it('returns the code to the opening window without navigating and closes once it confirms', () => {
      // The opening window is this test's window, so its confirmation has a real source.
      const handOver = vi
        .spyOn(window, 'postMessage')
        .mockImplementation(() => undefined);
      const close = vi.spyOn(window, 'close').mockImplementation(() => {});
      vi.stubGlobal('opener', window);
      const fetch = vi.fn();
      vi.stubGlobal('fetch', fetch);
      const before = window.history.length;

      render(<ApplicationRoot pathname="/chatgpt/callback" />);

      expect(handOver).toHaveBeenCalledExactlyOnceWith(
        {
          type: 'prisma-chatgpt-callback',
          state: 'fictional-state',
          code: 'fictional-code',
          error: false,
        },
        window.location.origin,
      );
      expect(window.location.pathname).toBe('/chatgpt/callback');
      expect(window.location.search).toBe('');
      expect(window.history.length).toBe(before);
      expect(screen.getByRole('status')).toHaveTextContent(
        'Completing the connection…',
      );
      expectEntryInterface(appInterface);

      confirm({ type: 'prisma-chatgpt-received', state: 'another-state' });
      expect(close).not.toHaveBeenCalled();
      expect(screen.getByRole('status')).toHaveTextContent(
        'Completing the connection…',
      );

      confirm({ type: 'prisma-chatgpt-received', state: 'fictional-state' });
      expect(close).toHaveBeenCalledOnce();
      expect(screen.getByRole('status')).toHaveTextContent(
        'Sign-in received. You can return to PRISMA.',
      );
      expect(fetch).not.toHaveBeenCalled();
    });
  },
);

function confirm(data: unknown): void {
  act(() => {
    window.dispatchEvent(
      new MessageEvent('message', {
        data,
        origin: window.location.origin,
        source: window,
      }),
    );
  });
}
