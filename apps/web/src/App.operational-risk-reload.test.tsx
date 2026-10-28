import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from './test/render-with-interface-locale';
import { App } from './App';
import { deterministicBrowserIdentity } from './access-composition';
import {
  journalActor,
  journalOriginal,
  journalRisk,
  journalRoot,
  journalStatement,
} from './test/operational-risk-journal-fixture';

const otherRiskId = '00000000-0000-4000-8000-000000000963';
const otherIntake = {
  ...journalRisk.originalIntake,
  id: '00000000-0000-4000-8000-000000963001',
  facts: { ...journalRisk.currentIntake.facts, process: 'Selected Risk B' },
};
const otherRisk = {
  ...journalRisk,
  id: otherRiskId,
  originalIntake: otherIntake,
  currentIntake: otherIntake,
};
const otherOriginal = {
  ...journalOriginal,
  id: '00000000-0000-4000-8000-000000963002',
  narrative: 'Selected Risk B statement',
};
const sameRiskOriginal = {
  ...journalOriginal,
  id: '00000000-0000-4000-8000-000000962005',
  revision: 3,
  kind: 'reassessment',
  narrative: 'Selected original B in the same Risk',
};
const riskA = { ...journalRisk, revision: 3 };
const historyA = {
  items: [sameRiskOriginal, journalOriginal, journalRisk.originalIntake],
  next_cursor: null,
};
const statementA = { ...journalStatement, revision: 3 };
const list = {
  items: [riskA, otherRisk].map((risk) => ({
    id: risk.id,
    companyId: risk.companyId,
    revision: risk.revision,
    process: risk.currentIntake.facts.process,
    createdAt: risk.createdAt,
  })),
  next_cursor: null,
};

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  vi.stubGlobal('matchMedia', (media: string) => ({
    media,
    matches: media.includes('prefers-reduced-motion'),
    onchange: null,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    dispatchEvent: () => true,
  }));
});
afterEach(() => {
  vi.unstubAllGlobals();
  window.history.replaceState(null, '', '/');
});

describe('App Risk reload selection lifetime', () => {
  it.each(
    (
      [
        ['list', 200],
        ['list', 401],
        ['list', 403],
        ['detail', 200],
        ['detail', 401],
        ['detail', 403],
        ['history', 200],
        ['history', 401],
        ['history', 403],
      ] as const
    ).flatMap(([stage, status]) =>
      [false, true].map((ready) => ({ stage, status, ready })),
    ),
  )(
    'preserves the newer selection while an obsolete $stage reload resumes with $status (new read ready: $ready)',
    async ({ stage, status, ready }) => {
      let holdReload = false;
      let oldReply: ((response: Response) => void) | undefined;
      let newReply: ((response: Response) => void) | undefined;
      let newSignal: AbortSignal | null | undefined;
      let actorReads = 0;
      let originalReads = 0;
      const rejectSession = vi.fn(async () => undefined);
      const selectedOriginal =
        stage === 'list' ? sameRiskOriginal : otherOriginal;
      const selectedRisk = stage === 'list' ? riskA : otherRisk;
      const selectedRoot = `/api/operational-risks/${selectedRisk.id}/journal/${selectedOriginal.id}`;
      vi.stubGlobal(
        'fetch',
        vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
          const path = input.toString();
          if (path === '/api/access/current-actor') {
            actorReads++;
            return Response.json(journalActor);
          }
          if (path === '/api/companies')
            return Response.json([
              {
                id: journalRisk.companyId,
                displayName: 'Synthetic Risk Company',
              },
            ]);
          const heldPath =
            stage === 'list'
              ? '/api/operational-risks'
              : `/api/operational-risks/${journalRisk.id}${stage === 'history' ? '/history' : ''}`;
          if (holdReload && path === heldPath && !oldReply)
            return new Promise<Response>((resolve) => {
              oldReply = resolve;
            });
          if (path === '/api/operational-risks') return Response.json(list);
          if (path === `/api/operational-risks/${journalRisk.id}`)
            return Response.json(riskA);
          if (path === `/api/operational-risks/${journalRisk.id}/history`)
            return Response.json(historyA);
          if (path === journalRoot) {
            originalReads++;
            return originalReads === 1 || status === 200
              ? Response.json(statementA)
              : new Response(null, { status });
          }
          if (path === selectedRoot) {
            newSignal = init?.signal;
            // The transport deliberately ignores abort, like an already delivered response.
            return new Promise<Response>((resolve) => {
              newReply = resolve;
            });
          }
          if (path === `/api/operational-risks/${otherRiskId}`)
            return Response.json(otherRisk);
          if (path === `/api/operational-risks/${otherRiskId}/history`)
            return Response.json({
              items: [otherOriginal, otherIntake],
              next_cursor: null,
            });
          throw new Error('Unexpected synthetic App reload request.');
        }),
      );
      window.history.replaceState(null, '', '/#operational-risks');
      render(
        <App identity={{ ...deterministicBrowserIdentity(), rejectSession }} />,
      );
      expect(
        await screen.findByRole('combobox', { name: 'Active Company' }),
      ).toHaveTextContent('Synthetic Risk Company');
      fireEvent.click(
        await screen.findByRole('button', { name: /Synthetic journal risk/u }),
      );
      await screen.findByRole('heading', { name: 'Immutable history' });
      viewOriginal(journalOriginal.narrative);
      await waitFor(() =>
        expect(
          screen.getByRole('region', { name: 'Current journal statement' }),
        ).toHaveTextContent(journalOriginal.narrative.trim()),
      );
      holdReload = true;
      fireEvent.click(
        within(
          screen.getByRole('region', { name: 'Recorded risks' }),
        ).getByRole('button', { name: 'Reload' }),
      );
      await waitFor(() => expect(oldReply).toBeDefined());
      if (stage !== 'list') {
        fireEvent.click(
          await screen.findByRole('button', { name: /Selected Risk B/u }),
        );
        await waitFor(() =>
          expect(
            screen.getByRole('heading', { name: 'Immutable history' }),
          ).toBeVisible(),
        );
      }
      viewOriginal(selectedOriginal.narrative);
      await waitFor(() => expect(newReply).toBeDefined());
      expect(newSignal?.aborted).toBe(false);
      const completeCurrent = async () =>
        act(async () =>
          newReply?.(
            Response.json({
              riskId: selectedRisk.id,
              companyId: selectedRisk.companyId,
              revision: selectedRisk.revision,
              originalEntry: selectedOriginal,
              currentEntry: selectedOriginal,
            }),
          ),
        );
      if (ready) {
        await completeCurrent();
        await waitFor(() =>
          expect(
            screen.getByRole('region', { name: 'Current journal statement' }),
          ).toHaveTextContent(selectedOriginal.narrative),
        );
      }
      const admittedActorReads = actorReads;
      await act(async () =>
        oldReply?.(
          stage === 'list'
            ? Response.json(list)
            : status === 200
              ? Response.json(stage === 'detail' ? riskA : historyA)
              : new Response(null, { status }),
        ),
      );
      expect(newSignal?.aborted).toBe(false);
      expect(originalReads).toBe(1);
      if (!ready) await completeCurrent();
      await waitFor(() =>
        expect(
          screen.getByRole('region', { name: 'Current journal statement' }),
        ).toHaveTextContent(selectedOriginal.narrative),
      );
      expect(
        screen.getByRole('button', {
          name:
            stage === 'list' ? /Synthetic journal risk/u : /Selected Risk B/u,
        }),
      ).toHaveAttribute('aria-pressed', 'true');
      expect(actorReads).toBe(admittedActorReads);
      expect(rejectSession).not.toHaveBeenCalled();
      expect(screen.queryAllByRole('alert')).toHaveLength(0);
    },
  );
});

function viewOriginal(narrative: string) {
  const row = screen
    .getAllByRole('listitem')
    .find((item) =>
      within(item).queryByText(narrative.trim(), { exact: true }),
    );
  if (!row)
    throw new Error(
      'Selected original history row must be loaded before selection.',
    );
  fireEvent.click(
    within(row).getByRole('button', { name: 'View current statement' }),
  );
}
