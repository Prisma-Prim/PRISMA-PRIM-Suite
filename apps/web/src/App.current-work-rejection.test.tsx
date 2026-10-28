import { afterEach, beforeEach, describe, expect, it } from 'vitest';
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
import { changeValue } from './test/select-option';
import { company, currentActor, id } from './mission-plan/current-work.fixture';
import {
  deferred,
  installCurrentWorkApp,
  openCurrentWork,
  resetCurrentWorkApp,
  restoreCurrentWorkApp,
} from './mission-plan/current-work-app.test-support';

const gates = [
  'document-registrar',
  'mission-deliverable-access',
  'document-content-reader',
  'task-result-recorder',
  'mission-result-reviewer',
] as const;
const phases = ['company', 'workspace'] as const;
const cases = gates.flatMap((bundle) =>
  phases.flatMap((phase) =>
    [200, 403].map((status) => ({ bundle, phase, status })),
  ),
);
describe('Current-work rejection through actual App authority revalidation', () => {
  beforeEach(resetCurrentWorkApp);
  afterEach(restoreCurrentWorkApp);
  it.each(cases)(
    'retires held $phase actor$status after $bundle A→B→A without stale shared effects or lost connected drafts',
    async ({ bundle, phase, status }) => {
      const state = installCurrentWorkApp();
      render(<App identity={deterministicBrowserIdentity()} />);
      const panel = await openCurrentWork();
      await within(panel).findByText('Current declaration 1 Ж / é');
      const draft = await screen.findByLabelText('Task title');
      const instructions = screen.getByLabelText(
        'Task instructions (optional)',
      );
      changeValue(
        instructions,
        'Protected native instructions during full Actor recovery\n  Ș / Я / 😀',
      );
      changeValue(
        draft,
        'Protected connected native draft during revalidation',
      );
      const source = screen.getByRole('heading', {
        name: 'Preserved source DEMO · Version 1',
      });
      const selected = deferred(),
        workspace = deferred();
      state.actorHoldCompany = selected;
      if (phase === 'workspace') state.actorHoldWorkspace = workspace;
      state.status = 403;
      fireEvent.click(
        within(panel).getByRole('button', { name: 'Refresh current work' }),
      );
      await waitFor(() => expect(state.heldActorReads).toContain('company'));
      if (phase === 'workspace') {
        await act(async () =>
          selected.resolve(Response.json({}, { status: 403 })),
        );
        await waitFor(() =>
          expect(state.heldActorReads).toContain('workspace'),
        );
      }
      expect(draft).toBeInTheDocument();
      expect(source).toBeInTheDocument();
      expect(instructions).toBeInTheDocument();
      expect(instructions).toHaveValue(
        'Protected native instructions during full Actor recovery\n  Ș / Я / 😀',
      );
      state.status = 200;
      const access = await screen.findByRole('region', {
        name: 'Company access',
      });
      changeValue(within(access).getByLabelText('Workspace member'), id(9));
      changeValue(
        within(access).getByLabelText('Company', { exact: true }),
        company.id,
      );
      changeValue(within(access).getByLabelText('Access bundle'), bundle);
      for (const replacement of [
        id(90),
        bundle === 'document-registrar'
          ? id(14)
          : bundle === 'mission-deliverable-access'
            ? id(16)
            : bundle === 'document-content-reader'
              ? id(15)
              : bundle === 'task-result-recorder'
                ? id(17)
                : id(18),
      ]) {
        if (bundle === 'document-registrar') state.metadataId = replacement;
        if (bundle === 'mission-deliverable-access')
          state.familyId = replacement;
        if (bundle === 'document-content-reader') state.readerId = replacement;
        if (bundle === 'task-result-recorder') state.recorderId = replacement;
        if (bundle === 'mission-result-reviewer')
          state.reviewerId = replacement;
        fireEvent.click(
          within(access).getByRole('button', { name: 'Grant access' }),
        );
        await waitFor(() =>
          expect(
            within(access).getByRole('button', { name: 'Grant access' }),
          ).toBeEnabled(),
        );
        await screen.findByText('Access granted. Server state refreshed.');
        expect(draft).toBeInTheDocument();
        expect(draft).toHaveValue(
          'Protected connected native draft during revalidation',
        );
        expect(source).toBeInTheDocument();
      }
      await act(async () => {});
      if (
        bundle === 'task-result-recorder' ||
        bundle === 'mission-result-reviewer'
      )
        expect(state.reads).toBe(2);
      const before = {
        actors: state.actorReads,
        activity: state.activityReads,
      };
      const staleActor = currentActor();
      staleActor.displayName = 'Retired revalidation actor';
      if (phase === 'workspace') delete staleActor.activeCompany;
      await act(async () => {
        (phase === 'company' ? selected : workspace).resolve(
          Response.json(status === 200 ? staleActor : {}, { status }),
        );
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
      });
      expect({
        actors: state.actorReads,
        activity: state.activityReads,
      }).toEqual(before);
      expect(screen.queryAllByText('Retired revalidation actor')).toHaveLength(
        0,
      );
      expect(draft).toBeInTheDocument();
      expect(draft).toHaveValue(
        'Protected connected native draft during revalidation',
      );
      expect(source).toBeInTheDocument();
    },
  );
});
