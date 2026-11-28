import { afterEach, expect, it, vi } from 'vitest';
import {
  fireEvent,
  render,
  screen,
  act,
} from '../test/render-with-interface-locale';
import type { BrowserIdentity } from '../access-composition';
import { DossierHarnessPanel } from './DossierHarnessPanel';

const identity = {
  loaded: true,
  signedIn: true,
  signedOutView: null,
  getToken: async () => 'fictional',
  rejectSession: async () => undefined,
  signOut: async () => undefined,
} satisfies BrowserIdentity;
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  localStorage.clear();
});
const queued = {
  id: 'review-one',
  runId: 'run',
  state: 'queued',
  stale: false,
  imported: false,
  nextBatch: 1,
  totalBatches: 2,
  cacheHits: 0,
  coverage: { readableUnits: 2, totalUnits: 2, incompleteSources: 0 },
  proposals: [],
};
const connected = {
  state: 'connected',
  account: 'fictional@example.test',
  models: [{ id: 'fixture-model', label: 'Fictional model' }],
};

it('retires a pending credential read when its Project view closes', async () => {
  let resolveToken: ((token: string) => void) | undefined;
  const token = new Promise<string>((resolve) => {
    resolveToken = resolve;
  });
  const fetchBoundary = vi.fn();
  vi.stubGlobal('fetch', fetchBoundary);
  const view = render(
    <DossierHarnessPanel
      identity={{ ...identity, getToken: () => token }}
      companyId="company"
      projectId="project"
      runId="run"
      scope="retired"
      stale={false}
      onDenied={() => undefined}
      onImported={async () => undefined}
    />,
  );
  view.unmount();
  await act(async () => {
    resolveToken?.('fictional');
    await token;
  });
  expect(fetchBoundary).not.toHaveBeenCalled();
});

it('resumes a saved checkpoint deliberately and stops automatic work at quota', async () => {
  localStorage.setItem('prisma-prim.interface-locale', 'en');
  let advances = 0,
    state = 'queued';
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: RequestInfo | URL) => {
      const path = String(url);
      if (path.endsWith('/advance')) {
        advances++;
        state = 'quota';
        return Response.json({ ...queued, state });
      }
      if (path.endsWith('/control')) return Response.json(queued);
      return Response.json(
        path.includes('/jobs?') ? { items: [{ ...queued, state }] } : connected,
      );
    }),
  );
  render(
    <DossierHarnessPanel
      identity={identity}
      companyId="company"
      projectId="project"
      runId="run"
      stale={false}
      scope="resume"
      onDenied={() => undefined}
      onImported={async () => undefined}
    />,
  );
  const resume = await screen.findByRole('button', { name: 'Resume review' });
  expect(advances).toBe(0);
  fireEvent.click(resume);
  expect(
    await screen.findByText(
      'ChatGPT usage limit reached. Progress is preserved. Resume after checking your allowance.',
      { exact: true },
    ),
  ).toBeVisible();
  expect(advances).toBe(1);
  fireEvent.click(screen.getByRole('button', { name: 'Refresh review' }));
  expect(
    await screen.findByText('Completed batches: 1/2 · Batches reused: 0'),
  ).toBeVisible();
  expect(advances).toBe(1);
});

it('requires explicit external processing consent before starting a subscription review', async () => {
  localStorage.setItem('prisma-prim.interface-locale', 'en');
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: RequestInfo | URL) =>
      Response.json(
        String(url).includes('/jobs?')
          ? { items: [] }
          : {
              state: 'connected',
              account: 'fictional@example.test',
              models: [{ id: 'fixture-model', label: 'Fictional model' }],
            },
      ),
    ),
  );
  render(
    <DossierHarnessPanel
      identity={identity}
      companyId="company"
      projectId="project"
      runId="run"
      stale={false}
      scope="one"
      onDenied={() => undefined}
      onImported={async () => undefined}
    />,
  );
  const start = await screen.findByRole('button', {
    name: 'Start document review',
  });
  expect(start).toBeDisabled();
  fireEvent.click(screen.getByRole('checkbox'));
  expect(start).toBeEnabled();
  expect(screen.getByText(/no automatic paid fallback/i)).toBeVisible();
});
