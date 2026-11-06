import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '../test/render-with-interface-locale';
import { afterEach, expect, it, vi } from 'vitest';
import type { ActorContext } from '../access-types';
import { WorkingEvidenceWorkspace } from './WorkingEvidenceWorkspace';
import {
  actor,
  identity,
  ids,
  revision,
  source,
} from './working-evidence.test-fixture';

function deferred<T>() {
  let resolve: ((value: T) => void) | undefined;
  return {
    promise: new Promise<T>((complete) => {
      resolve = complete;
    }),
    resolve: (value: T) => {
      if (!resolve) throw new Error('Missing request');
      resolve(value);
    },
  };
}
const caseB = ids.document;
const second = {
  ...revision,
  caseId: caseB,
  revisionId: ids.version,
  title: 'Fictional second Case',
  statement: 'Independent second Case words',
};
function page() {
  return {
    format: 'WORKING_EVIDENCE_CASE_PAGE/1',
    items: [revision, second].map((item) => ({
      caseId: item.caseId,
      revisionId: item.revisionId,
      revisionNumber: item.revisionNumber,
      title: item.title,
      recordedAt: item.recordedAt,
    })),
    nextCursor: null,
  };
}
function detail(value: { caseId: string } = revision) {
  return {
    format: 'WORKING_EVIDENCE_CASE/1',
    caseId: value.caseId,
    projectId: ids.project,
    originalClientId: ids.client,
    current: value,
  };
}
function history() {
  return {
    format: 'WORKING_EVIDENCE_CASE_HISTORY/1',
    items: [
      {
        revisionId: revision.revisionId,
        revisionNumber: 1,
        action: 'RECORD',
        recordedAt: revision.recordedAt,
        actor: revision.actor,
      },
    ],
    nextCursor: null,
  };
}
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it('preserves newer same-Case history when an earlier current-detail response finishes later', async () => {
  const refreshed = deferred<Response>();
  let detailReads = 0;
  const corrected = {
    ...revision,
    revisionId: ids.version,
    revisionNumber: 2,
    previousRevisionId: ids.revision,
    action: 'CORRECT',
    reason: 'Fictional complete correction',
    statement: 'Fictional corrected human words',
  };
  vi.stubGlobal('fetch', async (input: string) => {
    const path = new URL(input, 'http://localhost').pathname;
    if (path.endsWith(`/working-evidence-cases/${ids.case}`)) {
      detailReads++;
      return detailReads === 1
        ? Response.json(detail(corrected))
        : refreshed.promise;
    }
    if (path.endsWith(`/revisions/${ids.revision}`))
      return Response.json(revision);
    if (path.endsWith('/revisions'))
      return Response.json({
        ...history(),
        items: [revision, corrected].map((item) => ({
          revisionId: item.revisionId,
          revisionNumber: item.revisionNumber,
          action: item.action,
          recordedAt: item.recordedAt,
          actor: item.actor,
        })),
      });
    return Response.json(page());
  });
  render(
    <WorkingEvidenceWorkspace
      actor={actor}
      identity={identity}
      projectId={ids.project}
      projectStatus="active"
    />,
  );
  fireEvent.click(await screen.findByRole('button', { name: revision.title }));
  await screen.findByText(corrected.statement);
  fireEvent.click(
    screen.getByRole('button', { name: 'Open current revision' }),
  );
  await waitFor(() => expect(detailReads).toBe(2));
  fireEvent.click(screen.getByRole('button', { name: 'Revision history' }));
  await screen.findByRole('button', {
    name: `Revision 1 · ${revision.actor.displayName}`,
  });
  await act(async () => refreshed.resolve(Response.json(detail(corrected))));
  expect(
    screen.getByRole('button', {
      name: `Revision 1 · ${revision.actor.displayName}`,
    }),
  ).toBeVisible();
  expect(
    screen.getByRole('button', {
      name: `Revision 2 · ${revision.actor.displayName}`,
    }),
  ).toBeVisible();
  fireEvent.click(
    screen.getByRole('button', {
      name: `Revision 1 · ${revision.actor.displayName}`,
    }),
  );
  await screen.findByText(revision.statement);
  expect(screen.getByText('Historical immutable revision')).toBeVisible();
  expect(
    screen.getByRole('button', {
      name: `Revision 1 · ${revision.actor.displayName}`,
    }),
  ).toBeVisible();
  expect(
    screen.getByRole('button', {
      name: `Revision 2 · ${revision.actor.displayName}`,
    }),
  ).toBeVisible();
});

it.each(['detail', 'historical'] as const)(
  'permanently retires the source projection of a held %s response across source A to B to A',
  async (kind) => {
    const held = deferred<Response>();
    let holding = false;
    vi.stubGlobal('fetch', async (input: string) => {
      const path = new URL(input, 'http://localhost').pathname;
      if (
        path.endsWith(`/revisions/${ids.revision}`) ||
        (kind === 'detail' &&
          path.endsWith(`/working-evidence-cases/${ids.case}`))
      ) {
        holding = true;
        return held.promise;
      }
      if (path.endsWith('/revisions')) return Response.json(history());
      if (path.endsWith(`/working-evidence-cases/${ids.case}`))
        return Response.json(detail());
      return Response.json(page());
    });
    const view = render(
      <WorkingEvidenceWorkspace
        actor={actor}
        identity={identity}
        projectId={ids.project}
        projectStatus="active"
      />,
    );
    fireEvent.click(
      await screen.findByRole('button', { name: revision.title }),
    );
    if (kind === 'historical') {
      fireEvent.click(
        await screen.findByRole('button', { name: 'Revision history' }),
      );
      fireEvent.click(
        await screen.findByRole('button', {
          name: `Revision 1 · ${revision.actor.displayName}`,
        }),
      );
    }
    await waitFor(() => expect(holding).toBe(true));
    const changed: ActorContext = {
      ...actor,
      activeCompany: {
        ...actor.activeCompany,
        id: ids.project,
        displayName: 'Fictional Company',
        receivedAuditSourceAccessAssignmentId: ids.evidence,
      },
    };
    view.rerender(
      <WorkingEvidenceWorkspace
        actor={changed}
        identity={identity}
        projectId={ids.project}
        projectStatus="active"
      />,
    );
    view.rerender(
      <WorkingEvidenceWorkspace
        actor={actor}
        identity={identity}
        projectId={ids.project}
        projectStatus="active"
      />,
    );
    await act(async () =>
      held.resolve(Response.json(kind === 'detail' ? detail() : revision)),
    );
    await screen.findByText(revision.statement);
    expect(
      screen.queryByText(source.sourceTitle, { exact: false }),
    ).not.toBeInTheDocument();
    expect(screen.getByText('Supporting evidence unavailable.')).toBeVisible();
  },
);

it.each([200, 401])(
  'retires Case A history%s immediately when opening Case B before B responds',
  async (status) => {
    const held = deferred<Response>(),
      opening = deferred<Response>(),
      rejected = vi.fn(async () => undefined);
    let holding = false,
      openingB = false;
    vi.stubGlobal('fetch', async (input: string) => {
      const path = new URL(input, 'http://localhost').pathname;
      if (path.endsWith('/revisions')) {
        holding = true;
        return held.promise;
      }
      if (path.endsWith(`/working-evidence-cases/${ids.case}`))
        return Response.json(detail());
      if (path.endsWith(`/working-evidence-cases/${caseB}`)) {
        openingB = true;
        return opening.promise;
      }
      return Response.json(page());
    });
    render(
      <WorkingEvidenceWorkspace
        actor={actor}
        identity={{ ...identity, rejectSession: rejected }}
        projectId={ids.project}
        projectStatus="active"
      />,
    );
    fireEvent.click(
      await screen.findByRole('button', { name: revision.title }),
    );
    fireEvent.click(
      await screen.findByRole('button', { name: 'Revision history' }),
    );
    await waitFor(() => expect(holding).toBe(true));
    fireEvent.click(screen.getByRole('button', { name: second.title }));
    await waitFor(() => expect(openingB).toBe(true));
    await act(async () =>
      held.resolve(
        status === 200
          ? Response.json(history())
          : new Response(null, { status }),
      ),
    );
    expect(
      screen.queryByRole('button', {
        name: `Revision 1 · ${revision.actor.displayName}`,
      }),
    ).not.toBeInTheDocument();
    expect(rejected).not.toHaveBeenCalled();
    await act(async () => opening.resolve(Response.json(detail(second))));
    await screen.findByText(second.statement);
    expect(
      screen.queryByRole('button', {
        name: `Revision 1 · ${revision.actor.displayName}`,
      }),
    ).not.toBeInTheDocument();
  },
);

it('retires already scheduled Case A history recovery when Case B is opened', async () => {
  const recovery = deferred<Response>(),
    revalidated = vi.fn();
  let recoveryStarted = false;
  vi.stubGlobal('fetch', async (input: string) => {
    const path = new URL(input, 'http://localhost').pathname;
    if (path.endsWith('/access/current-actor')) {
      recoveryStarted = true;
      return recovery.promise;
    }
    if (path.endsWith('/revisions')) return new Response(null, { status: 403 });
    if (path.endsWith(`/working-evidence-cases/${ids.case}`))
      return Response.json(detail());
    if (path.endsWith(`/working-evidence-cases/${caseB}`))
      return Response.json(detail(second));
    return Response.json(page());
  });
  render(
    <WorkingEvidenceWorkspace
      actor={actor}
      identity={identity}
      projectId={ids.project}
      projectStatus="active"
      onActorRevalidated={revalidated}
    />,
  );
  fireEvent.click(await screen.findByRole('button', { name: revision.title }));
  fireEvent.click(
    await screen.findByRole('button', { name: 'Revision history' }),
  );
  await waitFor(() => expect(recoveryStarted).toBe(true));
  // A current denial clears the list; explicitly reload it before choosing B.
  fireEvent.click(
    screen.getByRole('button', { name: 'Refresh working evidence' }),
  );
  fireEvent.click(await screen.findByRole('button', { name: second.title }));
  await screen.findByText(second.statement);
  await act(async () => recovery.resolve(Response.json(actor)));
  expect(revalidated).not.toHaveBeenCalled();
  expect(screen.getByText(second.statement)).toBeVisible();
});
