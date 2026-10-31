import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  act,
  fireEvent,
  screen,
  waitFor,
  within,
} from './test/render-with-interface-locale';
import { projectId, snapshot } from './test/mission-applicability-app-fixture';
import {
  installNextActionPublication,
  nextActionActor,
  openNextActionApp,
  publishNextActionActor,
} from './test/project-next-action-app';

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  window.history.replaceState(null, '', '/#projects');
});
afterEach(() => {
  vi.unstubAllGlobals();
  window.history.replaceState(null, '', '/');
});
it.each(['draft', 'pending', 'uncertain', 'confirmed'])(
  'preserves native applicability %s through an independent next-action Coordinator replacement accepted by actual administration',
  async (phase) => {
    const fresh = {
      ...nextActionActor,
      displayName: 'Fresh parent Actor DEMO',
      activeCompany: {
        ...nextActionActor.activeCompany,
        projectNextActionCoordinatorAssignmentId: 'new-independent-coordinator',
      },
    };
    const writes: Array<{
      body: BodyInit | null | undefined;
      key: string | null;
    }> = [];
    let recorded = false,
      finish: ((response: Response) => void) | undefined;
    const receipt = {
      action: 'recorded',
      projectId,
      factId: 'independent-applicability-fact',
      applicabilityRevision: 1,
    };
    installNextActionPublication(fresh, async (path, init) => {
      if (path !== `/api/projects/${projectId}/mission-applicability`)
        return undefined;
      if (init?.method === 'POST') {
        writes.push({
          body: init.body,
          key: new Headers(init.headers).get('idempotency-key'),
        });
        if (phase === 'pending' && writes.length === 1)
          return new Promise((resolve) => {
            finish = resolve;
          });
        recorded = true;
        if (phase === 'uncertain' && writes.length === 1)
          throw new TypeError('Lost native applicability response');
        return Response.json(receipt, { status: 201 });
      }
      return recorded
        ? new Response(null, { status: 503 })
        : Response.json(snapshot());
    });
    const { projects } = await openNextActionApp(),
      panel = await screen.findByRole('region', {
        name: 'Mission activity applicability',
      });
    await within(panel).findByRole('combobox', { name: 'Source activity' });
    for (const [name, value] of [
      ['Proposal reason (1–1000 characters)', 'Independent proposal intent'],
      ['Reported scope basis (1–2000 characters)', 'Independent scope basis'],
      [
        'Reported agreement basis (1–2000 characters)',
        'No contractual change reported',
      ],
    ])
      fireEvent.change(within(panel).getByRole('textbox', { name }), {
        target: { value },
      });
    fireEvent.click(
      within(panel).getByRole('button', { name: 'Review exact proposal' }),
    );
    if (phase !== 'draft')
      fireEvent.click(
        within(panel).getByRole('button', { name: 'Record proposal' }),
      );
    if (phase === 'pending')
      await waitFor(() => expect(finish).toBeTypeOf('function'));
    if (phase === 'uncertain')
      await within(panel).findByRole('button', {
        name: 'Retry identical command',
      });
    if (phase === 'confirmed')
      await within(panel).findByText('Applicability fact confirmed.');
    const before = writes.map((write) => ({ ...write }));
    await publishNextActionActor();
    expect(writes).toEqual(before);
    expect(
      within(projects).getByRole('textbox', { name: 'Project title' }),
    ).toHaveValue('Independent parent Project draft DEMO');
    if (phase === 'draft')
      fireEvent.click(
        within(panel).getByRole('button', { name: 'Record proposal' }),
      );
    if (phase === 'pending') {
      recorded = true;
      await act(async () => {
        finish?.(Response.json(receipt, { status: 201 }));
      });
    }
    if (phase === 'uncertain')
      fireEvent.click(
        within(panel).getByRole('button', { name: 'Retry identical command' }),
      );
    await within(panel).findByText('Applicability fact confirmed.');
    if (phase === 'uncertain') {
      expect(writes).toHaveLength(2);
      expect(writes[1]).toEqual(writes[0]);
    }
  },
);
