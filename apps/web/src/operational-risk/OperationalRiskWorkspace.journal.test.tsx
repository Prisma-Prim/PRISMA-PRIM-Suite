import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '../test/render-with-interface-locale';
import { deterministicBrowserIdentity } from '../access-composition';
import { useInterfaceLocale } from '../localization/interface-locale';
import {
  journalActor,
  journalCorrection,
  journalOriginal,
  journalReadResponse,
  journalRisk,
  journalRiskId,
  journalRoot,
  journalStatement,
} from '../test/operational-risk-journal-fixture';
import { OperationalRiskWorkspace } from './OperationalRiskWorkspace';

const noop = () => undefined;
afterEach(() => vi.unstubAllGlobals());
function LocaleChoices() {
  const { changeLocale } = useInterfaceLocale();
  return (
    <>
      {(['ro', 'ru', 'fr', 'en'] as const).map((locale) => (
        <button key={locale} onClick={() => changeLocale(locale)}>
          {locale}
        </button>
      ))}
    </>
  );
}
function view(
  props: Partial<Parameters<typeof OperationalRiskWorkspace>[0]> = {},
) {
  return render(
    <>
      <LocaleChoices />
      <OperationalRiskWorkspace
        actor={journalActor}
        identity={deterministicBrowserIdentity()}
        onActorRevalidated={noop}
        onCompanyContextRejected={noop}
        onWorkspaceAccessRejected={noop}
        {...props}
      />
    </>,
  );
}
async function selectRisk() {
  fireEvent.click(
    await screen.findByRole('button', { name: /Synthetic journal risk/u }),
  );
  await screen.findByRole('heading', { name: 'Immutable history' });
}
async function openStatement() {
  await selectRisk();
  fireEvent.click(
    screen.getByRole('button', { name: 'View current statement' }),
  );
  return screen.findByRole('button', { name: 'Correct journal statement' });
}
async function openEditor() {
  fireEvent.click(await openStatement());
  const note = await screen.findByLabelText('Note', { exact: true });
  expect(note).toHaveValue(journalOriginal.narrative);
  expect(note).toHaveFocus();
  fireEvent.change(note, { target: { value: journalCorrection.narrative } });
  fireEvent.change(
    screen.getByLabelText('Occurrence date (optional)', { exact: true }),
    { target: { value: '' } },
  );
  fireEvent.change(screen.getByLabelText('Correction reason'), {
    target: { value: journalCorrection.reason },
  });
}
function success() {
  return Response.json(
    { risk: { ...journalRisk, revision: 3 }, entry: journalCorrection },
    { status: 201 },
  );
}
function currentRead(path: string) {
  if (path === journalRoot)
    return Response.json({
      ...journalStatement,
      revision: 3,
      currentEntry: journalCorrection,
    });
  if (path === `/api/operational-risks/${journalRiskId}`)
    return Response.json({ ...journalRisk, revision: 3 });
  if (path.endsWith('/history'))
    return Response.json({
      items: [journalCorrection, journalOriginal, journalRisk.originalIntake],
      next_cursor: null,
    });
  return journalReadResponse(path);
}

describe('Risk journal correction through production controls', () => {
  it('keeps the unchanged proposal editable without a write and associates its validation error, then cancels back to the current statement', async () => {
    const writes: unknown[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === 'POST') {
          writes.push(init.body);
          return success();
        }
        return journalReadResponse(input.toString());
      }),
    );
    view();
    fireEvent.click(await openStatement());
    const note = await screen.findByLabelText('Note', { exact: true });
    fireEvent.change(screen.getByLabelText('Correction reason'), {
      target: { value: ' Reason alone is not a change ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Record' }));
    const form = note.closest('form');
    expect(form).toHaveAccessibleDescription(/Check required fields/u);
    expect(note).toHaveValue(journalOriginal.narrative);
    expect(screen.getByLabelText('Correction reason')).toHaveValue(
      ' Reason alone is not a change ',
    );
    expect(writes).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(
      screen.queryByLabelText('Note', { exact: true }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('heading', {
        name: 'Current journal statement',
        level: 3,
      }),
    ).toHaveFocus();
  });

  it('preserves invalid literal text/date/reason after a definite refusal, without mutating the original', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) =>
        init?.method === 'POST'
          ? Response.json({ code: 'INVALID_RISK_INPUT' }, { status: 400 })
          : journalReadResponse(input.toString()),
      ),
    );
    view();
    await openEditor();
    fireEvent.click(screen.getByRole('button', { name: 'Record' }));
    await waitFor(() =>
      expect(screen.getByLabelText('Note', { exact: true })).toBeEnabled(),
    );
    expect(screen.getByLabelText('Note', { exact: true })).toHaveValue(
      journalCorrection.narrative,
    );
    expect(screen.getByLabelText('Correction reason')).toHaveValue(
      journalCorrection.reason,
    );
    expect(
      screen.getByRole('region', { name: 'Current journal statement' }),
    ).toHaveTextContent(journalOriginal.narrative.trim());
  });

  it.each(['STALE_RISK_REVISION', 'IDEMPOTENCY_CONFLICT'] as const)(
    'requires reload and deliberate review after %s, retaining the proposal with a fresh predecessor and key only after continue',
    async (code) => {
      const writes: { body: unknown; key: string | null }[] = [];
      let latest = false;
      vi.stubGlobal(
        'fetch',
        vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
          const path = input.toString();
          if (init?.method === 'POST') {
            writes.push({
              body: JSON.parse(String(init.body)),
              key: new Headers(init.headers).get('idempotency-key'),
            });
            if (writes.length === 1) {
              latest = true;
              return Response.json({ code }, { status: 409 });
            }
            return Response.json(
              {
                risk: { ...journalRisk, revision: 4 },
                entry: {
                  ...journalCorrection,
                  id: '00000000-0000-4000-8000-000000962004',
                  revision: 4,
                  predecessorId: journalCorrection.id,
                  narrative: ' Reviewed proposal after concurrent statement ',
                },
              },
              { status: 201 },
            );
          }
          return latest ? currentRead(path) : journalReadResponse(path);
        }),
      );
      view();
      await openEditor();
      fireEvent.click(screen.getByRole('button', { name: 'Record' }));
      await waitFor(() =>
        expect(screen.getByRole('button', { name: 'Record' })).toBeDisabled(),
      );
      expect(screen.getByRole('alert')).toHaveTextContent(
        code === 'IDEMPOTENCY_CONFLICT'
          ? 'This key recorded a different command'
          : 'The register changed',
      );
      const form = screen
        .getByLabelText('Note', { exact: true })
        .closest('form');
      if (!form) throw new Error('Missing correction form.');
      fireEvent.submit(form);
      expect(writes).toHaveLength(1);
      fireEvent.click(screen.getByRole('button', { name: 'Reload' }));
      await screen.findByRole('button', {
        name: 'Continue with reviewed data',
      });
      expect(screen.getByLabelText('Note', { exact: true })).toHaveValue(
        journalCorrection.narrative,
      );
      expect(
        screen.getByRole('region', { name: 'Current journal statement' }),
      ).toHaveTextContent(journalCorrection.reason.trim());
      // The retained proposal now equals the current statement: a reason alone
      // remains invalid after review. Deliberately change it before the new save.
      fireEvent.click(
        screen.getByRole('button', { name: 'Continue with reviewed data' }),
      );
      fireEvent.change(screen.getByLabelText('Note', { exact: true }), {
        target: { value: ' Reviewed proposal after concurrent statement ' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Record' }));
      await waitFor(() => expect(writes).toHaveLength(2));
      expect(writes[0]?.body).toEqual({
        expectedRevision: 2,
        predecessorId: journalOriginal.id,
        narrative: journalCorrection.narrative,
        occurredOn: null,
        reason: journalCorrection.reason,
      });
      expect(writes[1]?.body).toEqual({
        expectedRevision: 3,
        predecessorId: journalCorrection.id,
        narrative: ' Reviewed proposal after concurrent statement ',
        occurredOn: null,
        reason: journalCorrection.reason,
      });
      expect(writes[1]?.key).not.toBe(writes[0]?.key);
    },
  );

  it.each([
    'network',
    'service',
    'malformed',
    'foreign',
    'mismatched-facts',
  ] as const)(
    'freezes and retries the exact %s outcome across four locales without another POST or editable sibling intent',
    async (failure) => {
      const writes: {
        path: string;
        body: BodyInit | null | undefined;
        key: string | null;
      }[] = [];
      let saved = false;
      vi.stubGlobal(
        'fetch',
        vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
          const path = input.toString();
          if (init?.method === 'POST') {
            writes.push({
              path,
              body: init.body,
              key: new Headers(init.headers).get('idempotency-key'),
            });
            if (writes.length === 1) {
              if (failure === 'network')
                throw new TypeError('Synthetic lost acknowledgement');
              if (failure === 'service')
                return new Response(null, { status: 503 });
              if (failure === 'malformed')
                return Response.json({ risk: journalRisk }, { status: 201 });
              if (failure === 'mismatched-facts')
                return Response.json(
                  {
                    risk: { ...journalRisk, revision: 3 },
                    entry: {
                      ...journalCorrection,
                      narrative:
                        'Another valid statement for the same original',
                    },
                  },
                  { status: 201 },
                );
              return Response.json(
                {
                  risk: { ...journalRisk, revision: 3 },
                  entry: {
                    ...journalCorrection,
                    originalEntryId: journalRiskId,
                  },
                },
                { status: 201 },
              );
            }
            saved = true;
            return success();
          }
          return saved ? currentRead(path) : journalReadResponse(path);
        }),
      );
      view();
      await openEditor();
      fireEvent.click(screen.getByRole('button', { name: 'Record' }));
      await screen.findByRole('button', { name: 'Retry the same correction' });
      for (const [locale, label, retry] of [
        ['fr', 'Note', 'Réessayer la même correction'],
        ['ru', 'Заметка', 'Повторить то же исправление'],
        ['ro', 'Notă', 'Reîncercați aceeași corectare'],
        ['en', 'Note', 'Retry the same correction'],
      ]) {
        fireEvent.click(screen.getByRole('button', { name: locale }));
        expect(screen.getByLabelText(label, { exact: true })).toHaveValue(
          journalCorrection.narrative,
        );
        expect(screen.getByLabelText(label, { exact: true })).toBeDisabled();
        expect(screen.getByRole('button', { name: retry })).toBeEnabled();
        expect(writes).toHaveLength(1);
      }
      expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
      expect(
        screen.getByRole('button', { name: 'Record a risk' }),
      ).toBeDisabled();
      expect(
        screen.getByRole('button', { name: /Synthetic journal risk/u }),
      ).toBeDisabled();
      fireEvent.click(
        screen.getByRole('button', { name: 'Retry the same correction' }),
      );
      await screen.findByText('Recorded.', { exact: true });
      expect(writes).toHaveLength(2);
      expect(writes[1]).toEqual(writes[0]);
      expect(
        screen.queryByRole('button', { name: 'Retry the same correction' }),
      ).not.toBeInTheDocument();
      expect(
        screen.getByRole('region', { name: 'Current journal statement' }),
      ).toHaveTextContent('Synthetic corrector');
    },
  );

  it.each(['list', 'risk', 'history', 'statement'] as const)(
    'keeps a validated correction confirmed when its following %s refresh fails, and retries reads without another key',
    async (boundary) => {
      let saved = false;
      let fail = true;
      let writes = 0;
      vi.stubGlobal(
        'fetch',
        vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
          const path = input.toString();
          if (init?.method === 'POST') {
            writes++;
            saved = true;
            return success();
          }
          const failing =
            boundary === 'list'
              ? path === '/api/operational-risks'
              : boundary === 'risk'
                ? path === `/api/operational-risks/${journalRiskId}`
                : boundary === 'history'
                  ? path.endsWith('/history')
                  : path === journalRoot;
          if (saved && fail && failing)
            return new Response(null, { status: 503 });
          return saved ? currentRead(path) : journalReadResponse(path);
        }),
      );
      view();
      await openEditor();
      fireEvent.click(screen.getByRole('button', { name: 'Record' }));
      await screen.findByText(/The record is confirmed, but refresh failed/u);
      expect(
        within(
          screen.getByRole('region', {
            name: 'Confirmed correction (historical)',
          }),
        ).getByText(journalCorrection.narrative, {
          normalizer: (value) => value,
        }),
      ).toBeVisible();
      expect(
        screen.queryByRole('button', { name: 'Retry the same correction' }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: 'Correct journal statement' }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByLabelText('Note', { exact: true }),
      ).not.toBeInTheDocument();
      fail = false;
      fireEvent.click(screen.getAllByRole('button', { name: 'Reload' })[0]);
      await waitFor(() =>
        expect(
          screen.queryByText(/The record is confirmed, but refresh failed/u),
        ).not.toBeInTheDocument(),
      );
      expect(writes).toBe(1);
    },
  );

  it.each(['failure', 'foreign', 'unavailable'] as const)(
    'keeps loaded history and offers a safe exact read retry after %s current statement data',
    async (outcome) => {
      let fail = true;
      let writes = 0;
      vi.stubGlobal(
        'fetch',
        vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
          const path = input.toString();
          if (init?.method === 'POST') {
            writes++;
            return success();
          }
          if (path === journalRoot && fail)
            return outcome === 'foreign'
              ? Response.json({
                  ...journalStatement,
                  riskId: journalOriginal.id,
                })
              : new Response(null, {
                  status: outcome === 'unavailable' ? 404 : 503,
                });
          return journalReadResponse(path);
        }),
      );
      view();
      await selectRisk();
      fireEvent.click(
        screen.getByRole('button', { name: 'View current statement' }),
      );
      const region = await screen.findByRole('region', {
        name: 'Current journal statement',
      });
      await within(region).findByRole('alert');
      expect(
        screen.queryByRole('button', { name: 'Correct journal statement' }),
      ).not.toBeInTheDocument();
      expect(
        screen.getByRole('heading', { name: 'Immutable history' }),
      ).toBeVisible();
      expect(
        screen.getByRole('button', { name: 'View current statement' }),
      ).toBeEnabled();
      fail = false;
      fireEvent.click(within(region).getByRole('button', { name: 'Reload' }));
      await screen.findByRole('button', { name: 'Correct journal statement' });
      expect(writes).toBe(0);
    },
  );

  it('labels a regressing current read historical and refuses to prepare a correction below an already observed aggregate revision', async () => {
    let reads = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const path = input.toString();
        if (path === `/api/operational-risks/${journalRiskId}`)
          return Response.json({ ...journalRisk, revision: 4 });
        if (path === journalRoot) {
          reads++;
          return Response.json({
            ...journalStatement,
            revision: reads === 1 ? 5 : 4,
            currentEntry: journalCorrection,
          });
        }
        return journalReadResponse(path);
      }),
    );
    view();
    fireEvent.click(await openStatement());
    await waitFor(() => expect(reads).toBe(2));
    await screen.findByRole('heading', {
      name: 'Current journal statement',
      level: 3,
    });
    expect(
      within(
        screen.getByRole('region', { name: 'Current journal statement' }),
      ).getByText('Historical statement. Reload before correcting.'),
    ).toBeVisible();
    expect(
      screen.queryByLabelText('Note', { exact: true }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Correct journal statement' }),
    ).toBeDisabled();
  });

  it('keeps Reader-only exact original/current and all history available without correction controls', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => currentRead(input.toString())),
    );
    view({
      actor: {
        ...journalActor,
        activeCompany: {
          ...journalActor.activeCompany,
          operationalRiskPermissions: ['risk.read'],
          operationalRiskRecorderAssignmentId: undefined,
          operationalRiskRecorderPermissionSetVersion: undefined,
        },
      },
    });
    await selectRisk();
    fireEvent.click(
      screen.getAllByRole('button', { name: 'View current statement' })[0],
    );
    await screen.findByRole('heading', {
      name: 'Current journal statement',
      level: 3,
    });
    expect(
      screen.getByRole('region', { name: 'Current journal statement' }),
    ).toHaveTextContent('Synthetic corrector');
    expect(
      screen.queryByRole('button', { name: 'Correct journal statement' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Record a risk' }),
    ).not.toBeInTheDocument();
  });

  it.each([200, 401, 403])(
    'ignores an abort-ignoring late %s exact-target read after original selection is replaced',
    async (status) => {
      let reply: ((value: Response) => void) | undefined;
      const rejectSession = vi.fn(async () => undefined);
      const second = {
        ...journalOriginal,
        id: '00000000-0000-4000-8000-000000962005',
        revision: 3,
        kind: 'reassessment',
        narrative: 'Second original target',
      };
      vi.stubGlobal(
        'fetch',
        vi.fn(async (input: RequestInfo | URL) => {
          const path = input.toString();
          if (path === journalRoot)
            return new Promise<Response>((resolve) => {
              reply = resolve;
            });
          if (path.endsWith(`/journal/${second.id}`))
            return Response.json({
              ...journalStatement,
              revision: 3,
              originalEntry: second,
              currentEntry: second,
            });
          if (path.endsWith('/history'))
            return Response.json({
              items: [second, journalOriginal, journalRisk.originalIntake],
              next_cursor: null,
            });
          if (path === `/api/operational-risks/${journalRiskId}`)
            return Response.json({ ...journalRisk, revision: 3 });
          return journalReadResponse(path);
        }),
      );
      view({ identity: { ...deterministicBrowserIdentity(), rejectSession } });
      await selectRisk();
      const buttons = screen.getAllByRole('button', {
        name: 'View current statement',
      });
      fireEvent.click(buttons[1]);
      await waitFor(() => expect(reply).toBeDefined());
      fireEvent.click(buttons[0]);
      await screen.findByRole('button', { name: 'Correct journal statement' });
      await act(async () =>
        reply?.(
          status === 200
            ? Response.json(journalStatement)
            : new Response(null, { status }),
        ),
      );
      expect(
        screen.getByRole('region', { name: 'Current journal statement' }),
      ).toHaveTextContent(second.narrative);
      expect(rejectSession).not.toHaveBeenCalled();
    },
  );

  it.each([200, 401, 403])(
    'retires pending correction and suppresses late %s replies after the scoped owner unmounts',
    async (status) => {
      let reply: ((value: Response) => void) | undefined;
      const rejectSession = vi.fn(async () => undefined);
      const revalidated = vi.fn();
      const companyRejected = vi.fn();
      vi.stubGlobal(
        'fetch',
        vi.fn(async (input: RequestInfo | URL, init?: RequestInit) =>
          init?.method === 'POST'
            ? new Promise<Response>((resolve) => {
                reply = resolve;
              })
            : journalReadResponse(input.toString()),
        ),
      );
      const owner = view({
        identity: { ...deterministicBrowserIdentity(), rejectSession },
        onActorRevalidated: revalidated,
        onCompanyContextRejected: companyRejected,
      });
      await openEditor();
      fireEvent.click(screen.getByRole('button', { name: 'Record' }));
      await waitFor(() => expect(reply).toBeDefined());
      owner.unmount();
      view({ actor: { ...journalActor, displayName: 'Replacement session' } });
      await act(async () =>
        reply?.(status === 200 ? success() : new Response(null, { status })),
      );
      expect(
        screen.queryByLabelText('Note', { exact: true }),
      ).not.toBeInTheDocument();
      expect(rejectSession).not.toHaveBeenCalled();
      expect(revalidated).not.toHaveBeenCalled();
      expect(companyRejected).not.toHaveBeenCalled();
    },
  );
});
