import { afterEach, expect, it, vi } from 'vitest';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from './test/render-with-interface-locale';
import { App } from './App';
import { browserIdentity } from './production-shell/production-shell-context.test-fixtures';
import { actor, ids } from './working-evidence/working-evidence.test-fixture';

const sourceHash = `#working-evidence/${ids.case}/${ids.revision}/${ids.evidence}`;
const evidencePath = `/api/working-evidence-cases/${ids.case}/revisions/${ids.revision}/evidence/${ids.evidence}`;
const original = '%PDF-1.7\nFictional native original\n%%EOF';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  localStorage.clear();
  sessionStorage.clear();
  window.history.replaceState(null, '', '/');
});

it.each(['prisme', 'classic'] as const)(
  'authenticates the exact source hash through real %s App composition and reopens it after Projects navigation',
  async (presentation) => {
    localStorage.clear();
    sessionStorage.clear();
    vi.stubGlobal('matchMedia', (media: string) => ({
      matches: true,
      media,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
    window.history.replaceState(
      null,
      '',
      `${presentation === 'classic' ? '/?frame=classic' : '/'}${sourceHash}`,
    );
    const blobs: Blob[] = [];
    const clicked = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);
    vi.stubGlobal(
      'URL',
      class extends URL {
        static createObjectURL(blob: Blob) {
          blobs.push(blob);
          return `blob:fictional-original-${blobs.length}`;
        }
        static revokeObjectURL = vi.fn();
      },
    );
    const sourceReads: Headers[] = [];
    vi.stubGlobal(
      'fetch',
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const path = new URL(String(input), 'http://localhost').pathname;
        if (path === '/api/access/current-actor') return Response.json(actor);
        if (path === '/api/companies')
          return Response.json([
            { id: ids.project, displayName: 'Fictional Company' },
          ]);
        if (path === '/api/activity-log') return Response.json({ events: [] });
        if (path === '/api/projects' || path === '/api/clients')
          return Response.json([]);
        if (path === evidencePath) {
          sourceReads.push(new Headers(init?.headers));
          return new Response(original, {
            headers: { 'content-type': 'application/pdf' },
          });
        }
        return new Response(null, { status: 503 });
      },
    );
    render(<App identity={browserIdentity()} />);
    const resolver = await screen.findByRole('region', {
      name: 'Open exact original PDF',
    });
    fireEvent.click(
      within(resolver).getByRole('button', { name: 'Open exact original PDF' }),
    );
    await waitFor(() => expect(clicked).toHaveBeenCalledOnce());
    expect(sourceReads).toHaveLength(1);
    expect(sourceReads[0]?.get('x-company-context-id')).toBe(ids.project);
    expect(sourceReads[0]?.get('authorization')).toBe('Bearer token');
    expect(await blobs[0]?.text()).toBe(original);
    const navigation = screen.getByRole('navigation', {
      name: 'Primary navigation',
    });
    fireEvent.click(within(navigation).getByRole('link', { name: 'Projects' }));
    await waitFor(() => expect(window.location.hash).toBe('#projects'));
    await waitFor(() =>
      expect(
        screen.queryByRole('region', { name: 'Open exact original PDF' }),
      ).not.toBeInTheDocument(),
    );
    await act(async () => {
      window.location.hash = sourceHash;
    });
    const reopened = await screen.findByRole('region', {
      name: 'Open exact original PDF',
    });
    fireEvent.click(
      within(reopened).getByRole('button', { name: 'Open exact original PDF' }),
    );
    await waitFor(() => expect(clicked).toHaveBeenCalledTimes(2));
    expect(sourceReads).toHaveLength(2);
    expect(sourceReads[1]?.get('x-company-context-id')).toBe(ids.project);
    expect(sourceReads[1]?.get('authorization')).toBe('Bearer token');
    expect(await blobs[1]?.text()).toBe(original);
  },
);
