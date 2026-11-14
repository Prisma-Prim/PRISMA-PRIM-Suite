import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '../test/render-with-interface-locale';
import { afterEach, expect, it, vi } from 'vitest';
import type { ActorContext } from '../access-types';
import { WorkingEvidenceWorkspace } from './WorkingEvidenceWorkspace';
import { withoutCompanyGrants } from '../access/company-grants.test-fixture';
import {
  readEvidenceReceipt,
  readEvidenceSources,
} from './working-evidence-response';
import { workingEvidenceMessages } from './working-evidence.copy';
import { assertMessageCoverage } from '../localization/messages';
import {
  ids,
  actor,
  identity,
  source,
  revision,
} from './working-evidence.test-fixture';
function page() {
  return {
    format: 'WORKING_EVIDENCE_CASE_PAGE/1',
    items: [],
    nextCursor: null,
  };
}
function receipt(commandId: string) {
  return {
    format: 'WORKING_EVIDENCE_CASE_RECEIPT/1',
    commandId,
    caseId: ids.case,
    revisionId: ids.revision,
    revisionNumber: 1,
    action: 'RECORD',
    recordedAt: '2026-10-01T10:00:00.000Z',
  };
}
async function fill() {
  fireEvent.click(
    await screen.findByRole('button', { name: 'Record working statement' }),
  );
  fireEvent.change(screen.getByLabelText('Title'), {
    target: { value: 'Fictional working statement' },
  });
  fireEvent.change(screen.getByLabelText('Process'), {
    target: { value: 'Fictional process' },
  });
  fireEvent.change(screen.getByLabelText('Human working statement'), {
    target: { value: 'Human literal <script>not executable</script>' },
  });
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Add support' })).toBeEnabled(),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Add support' }));
  fireEvent.change(screen.getByLabelText('Support note'), {
    target: { value: 'Literal unverified support' },
  });
}
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
it('keeps complete identical uncertain intent and confirmation survives an unavailable refresh', async () => {
  const writes: string[] = [];
  vi.stubGlobal('fetch', async (input: string, init?: RequestInit) => {
    const path = new URL(input, 'http://localhost').pathname;
    if (init?.method === 'POST') {
      const body = String(init.body);
      writes.push(body);
      const command: unknown = JSON.parse(body);
      if (
        !command ||
        typeof command !== 'object' ||
        !('commandId' in command) ||
        typeof command.commandId !== 'string'
      )
        throw new Error('Invalid command');
      return writes.length === 1
        ? Response.json({})
        : Response.json(receipt(command.commandId), { status: 201 });
    }
    if (path.endsWith('/working-evidence-sources'))
      return Response.json({
        format: 'WORKING_EVIDENCE_CASE_SOURCE_PAGE/1',
        items: [source],
        nextCursor: null,
      });
    if (path.endsWith('/working-evidence-cases'))
      return writes.length > 1
        ? new Response(null, { status: 503 })
        : Response.json(page());
    return new Response(null, { status: 503 });
  });
  render(
    <WorkingEvidenceWorkspace
      actor={actor}
      identity={identity}
      projectId={ids.project}
      projectStatus="preparatory"
    />,
  );
  await fill();
  fireEvent.click(
    screen.getByRole('button', { name: 'Save complete revision' }),
  );
  await screen.findByText(
    'Save result uncertain. Explicitly retry the identical command.',
  );
  expect(screen.getByLabelText('Human working statement')).toBeDisabled();
  fireEvent.click(
    screen.getByRole('button', { name: 'Retry identical command' }),
  );
  await screen.findByText('Revision confirmed saved.');
  await screen.findByText(
    'Working evidence unavailable. Try an explicit refresh.',
  );
  expect(writes).toHaveLength(2);
  expect(writes[0]).toBe(writes[1]);
  expect(
    screen.queryByText(
      'Save result uncertain. Explicitly retry the identical command.',
    ),
  ).not.toBeInTheDocument();
});
it('permanently retires an in-flight Recorder across A to B to A without a false saved effect', async () => {
  let resolveWrite: ((value: Response) => void) | undefined;
  let postedCommand = '';
  vi.stubGlobal('fetch', async (input: string, init?: RequestInit) => {
    const path = new URL(input, 'http://localhost').pathname;
    if (init?.method === 'POST') {
      const command: unknown = JSON.parse(String(init.body));
      if (
        command &&
        typeof command === 'object' &&
        'commandId' in command &&
        typeof command.commandId === 'string'
      )
        postedCommand = command.commandId;
      return new Promise<Response>((resolve) => {
        resolveWrite = resolve;
      });
    }
    if (path.endsWith('/working-evidence-sources'))
      return Response.json({
        format: 'WORKING_EVIDENCE_CASE_SOURCE_PAGE/1',
        items: [source],
        nextCursor: null,
      });
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
  await fill();
  fireEvent.click(
    screen.getByRole('button', { name: 'Save complete revision' }),
  );
  await waitFor(() => expect(resolveWrite).toBeDefined());
  const changed: ActorContext = {
    ...actor,
    activeCompany: {
      ...actor.activeCompany,
      id: ids.project,
      displayName: 'Fictional Company',
      workingEvidenceCasePermissions: ['working_evidence_case.read'],
      workingEvidenceCaseRecorderAssignmentId: undefined,
      workingEvidenceCaseRecorderPermissionSetVersion: undefined,
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
  resolveWrite?.(Response.json(receipt(postedCommand), { status: 201 }));
  await waitFor(() =>
    expect(
      screen.queryByText('Revision confirmed saved.'),
    ).not.toBeInTheDocument(),
  );
  fireEvent.click(
    screen.getByRole('button', { name: 'Record working statement' }),
  );
  expect(screen.getByLabelText('Human working statement')).toHaveValue('');
  expect(identity.rejectSession).not.toHaveBeenCalled();
});
it('withholds source tuples and counts while preserving independently authorized Case text on source loss', async () => {
  vi.stubGlobal('fetch', async (input: string) => {
    const path = new URL(input, 'http://localhost').pathname;
    return path.endsWith(`/working-evidence-cases/${ids.case}`)
      ? Response.json({
          format: 'WORKING_EVIDENCE_CASE/1',
          caseId: ids.case,
          projectId: ids.project,
          originalClientId: ids.client,
          current: revision,
        })
      : Response.json({
          ...page(),
          items: [
            {
              caseId: ids.case,
              revisionId: ids.revision,
              revisionNumber: 1,
              title: revision.title,
              recordedAt: revision.recordedAt,
            },
          ],
        });
  });
  const view = render(
    <WorkingEvidenceWorkspace
      actor={actor}
      identity={identity}
      projectId={ids.project}
      projectStatus="completed"
    />,
  );
  fireEvent.click(await screen.findByRole('button', { name: revision.title }));
  await screen.findByText('Fictional exact original · Revision 1');
  const changed: ActorContext = {
    ...actor,
    activeCompany: {
      ...actor.activeCompany,
      id: ids.project,
      displayName: 'Fictional Company',
      receivedAuditSourceAccessAssignmentId: undefined,
      receivedAuditSourceAccessPermissionSetVersion: undefined,
      grants: withoutCompanyGrants(
        actor.activeCompany?.grants,
        'company_received_audit_source_access',
      ),
    },
  };
  view.rerender(
    <WorkingEvidenceWorkspace
      actor={changed}
      identity={identity}
      projectId={ids.project}
      projectStatus="completed"
    />,
  );
  expect(screen.getByText(revision.statement)).toBeVisible();
  expect(screen.getByText('Supporting evidence unavailable.')).toBeVisible();
  expect(
    screen.queryByText(/Fictional exact original/u),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: 'Download original-source annex' }),
  ).not.toBeInTheDocument();
});
it('keeps receipt persistence closed and validates source selector fields without inventing metadata', () => {
  expect(() =>
    readEvidenceReceipt({ ...receipt(ids.project), sourceCount: 1 }),
  ).toThrow();
  expect(() =>
    readEvidenceSources({
      format: 'WORKING_EVIDENCE_CASE_SOURCE_PAGE/1',
      items: [{ ...source, versionNumber: 51 }],
      nextCursor: null,
    }),
  ).toThrow();
  expect(
    readEvidenceSources({
      format: 'WORKING_EVIDENCE_CASE_SOURCE_PAGE/1',
      items: [source],
      nextCursor: null,
    }).items,
  ).toEqual([source]);
  assertMessageCoverage('working-evidence', workingEvidenceMessages);
});

it('preserves a Recorder intent when an unrelated Reader is replaced and retires equal-permission Recorder replacement', async () => {
  const writes: string[] = [];
  let resolveWrite: ((response: Response) => void) | undefined;
  vi.stubGlobal('fetch', async (input: string, init?: RequestInit) => {
    if (init?.method === 'POST') {
      writes.push(String(init.body));
      return new Promise<Response>((resolve) => {
        resolveWrite = resolve;
      });
    }
    if (
      new URL(input, 'http://localhost').pathname.endsWith(
        '/working-evidence-sources',
      )
    )
      return Response.json({
        format: 'WORKING_EVIDENCE_CASE_SOURCE_PAGE/1',
        items: [source],
        nextCursor: null,
      });
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
  await fill();
  fireEvent.click(
    screen.getByRole('button', { name: 'Save complete revision' }),
  );
  await waitFor(() => expect(resolveWrite).toBeDefined());
  const readerReplacement: ActorContext = {
    ...actor,
    activeCompany: {
      ...actor.activeCompany,
      id: ids.project,
      displayName: 'Fictional Company',
      workingEvidenceCaseReaderAssignmentId: ids.evidence,
    },
  };
  view.rerender(
    <WorkingEvidenceWorkspace
      actor={readerReplacement}
      identity={identity}
      projectId={ids.project}
      projectStatus="active"
    />,
  );
  expect(screen.getByLabelText('Human working statement')).toHaveValue(
    'Human literal <script>not executable</script>',
  );
  const recorderReplacement: ActorContext = {
    ...readerReplacement,
    activeCompany: {
      ...readerReplacement.activeCompany,
      id: ids.project,
      displayName: 'Fictional Company',
      workingEvidenceCaseRecorderAssignmentId: ids.document,
    },
  };
  view.rerender(
    <WorkingEvidenceWorkspace
      actor={recorderReplacement}
      identity={identity}
      projectId={ids.project}
      projectStatus="active"
    />,
  );
  expect(
    screen.queryByLabelText('Human working statement'),
  ).not.toBeInTheDocument();
  const command: unknown = JSON.parse(writes[0] ?? '{}');
  if (
    !command ||
    typeof command !== 'object' ||
    !('commandId' in command) ||
    typeof command.commandId !== 'string'
  )
    throw new Error('Missing sealed command');
  resolveWrite?.(Response.json(receipt(command.commandId), { status: 201 }));
  await waitFor(() =>
    expect(
      screen.queryByText('Revision confirmed saved.'),
    ).not.toBeInTheDocument(),
  );
});

it('settles a current write401 without waiting for global recovery and never claims a saved revision', async () => {
  let endRecovery: (() => void) | undefined;
  const rejected = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        endRecovery = resolve;
      }),
  );
  vi.stubGlobal('fetch', async (input: string, init?: RequestInit) => {
    if (init?.method === 'POST') return new Response(null, { status: 401 });
    return new URL(input, 'http://localhost').pathname.endsWith(
      '/working-evidence-sources',
    )
      ? Response.json({
          format: 'WORKING_EVIDENCE_CASE_SOURCE_PAGE/1',
          items: [source],
          nextCursor: null,
        })
      : Response.json(page());
  });
  render(
    <WorkingEvidenceWorkspace
      actor={actor}
      identity={{ ...identity, rejectSession: rejected }}
      projectId={ids.project}
      projectStatus="active"
    />,
  );
  await fill();
  fireEvent.click(
    screen.getByRole('button', { name: 'Save complete revision' }),
  );
  await screen.findByText('You do not have the required current access.');
  expect(
    screen.getByRole('button', { name: 'Save complete revision' }),
  ).toBeEnabled();
  expect(
    screen.queryByText('Saving complete revision…'),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByText('Revision confirmed saved.'),
  ).not.toBeInTheDocument();
  expect(rejected).toHaveBeenCalledOnce();
  endRecovery?.();
});

it.each(['list', 'detail', 'current', 'history', 'historical'] as const)(
  'settles current %s401 and clears denied data while session recovery remains pending',
  async (stage) => {
    let rejectedPath =
      stage === 'list' ? `/projects/${ids.project}/working-evidence-cases` : '';
    let endRecovery: (() => void) | undefined;
    const rejected = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          endRecovery = resolve;
        }),
    );
    vi.stubGlobal('fetch', async (input: string) => {
      const path = new URL(input, 'http://localhost').pathname.replace(
        /^\/api/u,
        '',
      );
      if (path === rejectedPath) return new Response(null, { status: 401 });
      if (path.endsWith(`/working-evidence-cases/${ids.case}`))
        return Response.json({
          format: 'WORKING_EVIDENCE_CASE/1',
          caseId: ids.case,
          projectId: ids.project,
          originalClientId: ids.client,
          current: revision,
        });
      if (path.endsWith('/revisions'))
        return Response.json({
          format: 'WORKING_EVIDENCE_CASE_HISTORY/1',
          items: [
            {
              revisionId: ids.revision,
              revisionNumber: 1,
              action: 'RECORD',
              recordedAt: revision.recordedAt,
              actor: revision.actor,
              reason: null,
            },
          ],
          nextCursor: null,
        });
      return Response.json({
        ...page(),
        items: [
          {
            caseId: ids.case,
            revisionId: ids.revision,
            revisionNumber: 1,
            title: revision.title,
            recordedAt: revision.recordedAt,
          },
        ],
      });
    });
    render(
      <WorkingEvidenceWorkspace
        actor={actor}
        identity={{ ...identity, rejectSession: rejected }}
        projectId={ids.project}
        projectStatus="active"
      />,
    );
    if (stage !== 'list') {
      const selected = await screen.findByRole('button', {
        name: revision.title,
      });
      if (stage === 'detail')
        rejectedPath = `/working-evidence-cases/${ids.case}`;
      fireEvent.click(selected);
      if (stage !== 'detail') {
        await screen.findByText(revision.statement);
        if (stage === 'current') {
          rejectedPath = `/working-evidence-cases/${ids.case}`;
          fireEvent.click(
            screen.getByRole('button', { name: 'Open current revision' }),
          );
        } else {
          if (stage === 'history')
            rejectedPath = `/working-evidence-cases/${ids.case}/revisions`;
          fireEvent.click(
            screen.getByRole('button', { name: 'Revision history' }),
          );
          if (stage === 'historical') {
            const historical = await screen.findByRole('button', {
              name: `Revision 1 · ${revision.actor.displayName}`,
            });
            rejectedPath = `/working-evidence-cases/${ids.case}/revisions/${ids.revision}`;
            fireEvent.click(historical);
          }
        }
      }
    }
    await screen.findByRole('alert');
    expect(
      screen.queryByText('Loading working evidence…'),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(revision.statement)).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: revision.title }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Refresh working evidence' }),
    ).toBeEnabled();
    expect(
      screen.queryByText('Revision confirmed saved.'),
    ).not.toBeInTheDocument();
    expect(rejected).toHaveBeenCalledOnce();
    endRecovery?.();
  },
);

it('settles current source-selector401 without waiting for session recovery or exposing an enabled save', async () => {
  let endRecovery: (() => void) | undefined;
  const rejected = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        endRecovery = resolve;
      }),
  );
  vi.stubGlobal('fetch', async (input: string) =>
    new URL(input, 'http://localhost').pathname.endsWith(
      '/working-evidence-sources',
    )
      ? new Response(null, { status: 401 })
      : Response.json(page()),
  );
  render(
    <WorkingEvidenceWorkspace
      actor={actor}
      identity={{ ...identity, rejectSession: rejected }}
      projectId={ids.project}
      projectStatus="active"
    />,
  );
  fireEvent.click(
    await screen.findByRole('button', { name: 'Record working statement' }),
  );
  await screen.findByText('Supporting evidence unavailable.');
  expect(
    screen.getByRole('button', { name: 'Save complete revision' }),
  ).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Cancel' })).toBeEnabled();
  expect(
    screen.queryByText('Revision confirmed saved.'),
  ).not.toBeInTheDocument();
  expect(rejected).toHaveBeenCalledOnce();
  endRecovery?.();
});

it('retains a pending Case read consumed through Recorder when a newly granted Reader appears', async () => {
  const fallbackActor: ActorContext = {
    ...actor,
    activeCompany: {
      ...actor.activeCompany,
      id: ids.project,
      displayName: 'Fictional Company',
      workingEvidenceCaseReaderAssignmentId: undefined,
      workingEvidenceCaseReaderPermissionSetVersion: undefined,
    },
  };
  let resolvePage: ((response: Response) => void) | undefined;
  const fetching = vi.fn(
    () =>
      new Promise<Response>((resolve) => {
        resolvePage = resolve;
      }),
  );
  vi.stubGlobal('fetch', fetching);
  const view = render(
    <WorkingEvidenceWorkspace
      actor={fallbackActor}
      identity={identity}
      projectId={ids.project}
      projectStatus="active"
    />,
  );
  await waitFor(() => expect(fetching).toHaveBeenCalledOnce());
  view.rerender(
    <WorkingEvidenceWorkspace
      actor={actor}
      identity={identity}
      projectId={ids.project}
      projectStatus="active"
    />,
  );
  resolvePage?.(
    Response.json({
      ...page(),
      items: [
        {
          caseId: ids.case,
          revisionId: ids.revision,
          revisionNumber: 1,
          title: revision.title,
          recordedAt: revision.recordedAt,
        },
      ],
    }),
  );
  await screen.findByRole('button', { name: revision.title });
  expect(fetching).toHaveBeenCalledOnce();
});

it('retains the Recorder-owned source selector and draft when a Reader is granted during its pending response', async () => {
  const fallbackActor: ActorContext = {
    ...actor,
    activeCompany: {
      ...actor.activeCompany,
      id: ids.project,
      displayName: 'Fictional Company',
      workingEvidenceCaseReaderAssignmentId: undefined,
      workingEvidenceCaseReaderPermissionSetVersion: undefined,
    },
  };
  let resolveSources: ((response: Response) => void) | undefined;
  const sourceReads = vi.fn(
    () =>
      new Promise<Response>((resolve) => {
        resolveSources = resolve;
      }),
  );
  vi.stubGlobal('fetch', async (input: string) =>
    new URL(input, 'http://localhost').pathname.endsWith(
      '/working-evidence-sources',
    )
      ? sourceReads()
      : Response.json(page()),
  );
  const view = render(
    <WorkingEvidenceWorkspace
      actor={fallbackActor}
      identity={identity}
      projectId={ids.project}
      projectStatus="active"
    />,
  );
  fireEvent.click(
    await screen.findByRole('button', { name: 'Record working statement' }),
  );
  fireEvent.change(screen.getByLabelText('Human working statement'), {
    target: { value: 'Fictional Recorder intent survives a new Reader' },
  });
  await waitFor(() => expect(sourceReads).toHaveBeenCalledOnce());
  expect(screen.getByRole('button', { name: 'Add support' })).toBeDisabled();
  view.rerender(
    <WorkingEvidenceWorkspace
      actor={actor}
      identity={identity}
      projectId={ids.project}
      projectStatus="active"
    />,
  );
  resolveSources?.(
    Response.json({
      format: 'WORKING_EVIDENCE_CASE_SOURCE_PAGE/1',
      items: [source],
      nextCursor: null,
    }),
  );
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Add support' })).toBeEnabled(),
  );
  expect(screen.getByLabelText('Human working statement')).toHaveValue(
    'Fictional Recorder intent survives a new Reader',
  );
  expect(sourceReads).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole('button', { name: 'Add support' }));
  expect(screen.getByLabelText('Support note')).toBeEnabled();
});
