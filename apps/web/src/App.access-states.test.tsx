import { screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { deterministicBrowserIdentity } from './access-composition';
import type { ActorContext } from './access-types';
import { baseActor } from './production-shell/production-shell-context.test-fixtures';
import { appInterfaces, renderInInterface } from './test/app-interface';
import { expectEntryInterface } from './test/entry-interface';

describe.each(appInterfaces)(
  'Access states in the %s interface',
  (appInterface) => {
    beforeEach(() => {
      window.history.replaceState(null, '', '/');
      vi.stubGlobal(
        'fetch',
        vi.fn(async (input: RequestInfo | URL) => {
          const url = input.toString();
          if (url.endsWith('/companies')) return Response.json([]);
          if (url.endsWith('/activity-log'))
            return Response.json({ events: [] });
          return Response.json({
            ...baseActor,
            displayName: 'Ada Ionescu',
            email: 'ada@example.test',
            workspaceName: 'PRISMA Workspace',
            workspacePermissions: ['company.manage'],
          } satisfies ActorContext);
        }),
      );
    });

    afterEach(() => {
      vi.restoreAllMocks();
      vi.unstubAllGlobals();
      localStorage.clear();
      sessionStorage.clear();
      window.history.replaceState(null, '', '/');
    });

    it('announces the access check while the identity provider loads', () => {
      renderInInterface(
        appInterface,
        <App identity={{ ...deterministicBrowserIdentity(), loaded: false }} />,
      );

      expect(screen.getByRole('status')).toHaveTextContent(
        'Verifying your access…',
      );
      expect(fetch).not.toHaveBeenCalled();
      expect(screen.queryByRole('banner')).not.toBeInTheDocument();
      expectEntryInterface(appInterface);
    });

    it('announces the access check until the server confirms the actor', async () => {
      const pending = vi.fn(() => new Promise<Response>(() => undefined));
      vi.stubGlobal('fetch', pending);

      renderInInterface(
        appInterface,
        <App identity={deterministicBrowserIdentity()} />,
      );

      await waitFor(() =>
        expect(pending).toHaveBeenCalledWith(
          '/api/access/current-actor',
          expect.anything(),
        ),
      );
      expect(screen.getByRole('status')).toHaveTextContent(
        'Verifying your access…',
      );
      expect(screen.queryByRole('banner')).not.toBeInTheDocument();
      expectEntryInterface(appInterface);
    });

    it.each([
      [403, 'Your access to this workspace is inactive.'],
      [503, 'We could not verify your access. Please try again.'],
    ])(
      'refuses the shell when access verification answers %i',
      async (status, message) => {
        vi.stubGlobal(
          'fetch',
          vi.fn(async () => new Response(null, { status })),
        );

        renderInInterface(
          appInterface,
          <App identity={deterministicBrowserIdentity()} />,
        );

        expect(await screen.findByRole('alert')).toHaveTextContent(message);
        expect(screen.queryByRole('banner')).not.toBeInTheDocument();
        // Neither state has an action today, and Clarté adds none.
        expect(screen.queryByRole('button')).not.toBeInTheDocument();
        expect(screen.queryByRole('link')).not.toBeInTheDocument();
        expectEntryInterface(appInterface);
      },
    );

    it('renders no protected content while the identity composition is signed out', () => {
      const identity = { ...deterministicBrowserIdentity(), signedIn: false };
      renderInInterface(appInterface, <App identity={identity} />);
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Sign in is required',
      );
      expect(screen.queryByRole('banner')).not.toBeInTheDocument();
      expectEntryInterface(appInterface);
    });

    it('returns a rejected session to the provider sign-in flow', async () => {
      vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 401 }));
      const rejectSession = vi.fn().mockResolvedValue(undefined);
      const identity = { ...deterministicBrowserIdentity(), rejectSession };

      renderInInterface(appInterface, <App identity={identity} />);

      expect(await screen.findByRole('alert')).toHaveTextContent(
        'Sign in is required',
      );
      expect(rejectSession).toHaveBeenCalledOnce();
      expect(screen.queryByRole('banner')).not.toBeInTheDocument();
      expectEntryInterface(appInterface);
    });
  },
);
