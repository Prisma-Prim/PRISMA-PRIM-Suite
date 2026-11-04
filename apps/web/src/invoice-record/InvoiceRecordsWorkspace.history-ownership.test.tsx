import { afterEach, expect, it, vi } from 'vitest';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '../test/render-with-interface-locale';
import type { InvoiceCurrent } from './invoice-record-contract';
import type { InvoiceRevision } from './invoice-record-history';
import { SectionVisibility } from '../production-shell/section-visibility';
import { InvoiceRecordsWorkspace } from './InvoiceRecordsWorkspace';
import {
  actor,
  current,
  identity,
  initialFact,
  inventory,
} from './invoice-record.fixture';

function pagedCurrent(): InvoiceCurrent {
  let head = initialFact;
  const items = [head];
  for (let revision = 2; revision <= 26; revision += 1) {
    const fact: InvoiceRevision = {
      ...head,
      revision,
      action: 'CORRECT',
      commandId: crypto.randomUUID(),
      before: head.after,
      after: {
        entryState: 'RECORDED',
        values: { ...head.after.values, grossMinor: String(125499 + revision) },
      },
      reason: `Fictional transcription revision ${revision}`,
    };
    items.unshift(fact);
    head = fact;
  }
  return {
    ...current,
    record: { ...current.record, revision: 26, values: head.after.values },
    history: { items: items.slice(0, 25), nextCursor: 'observed-head-26' },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

it('preserves a correctable draft until deliberate cancel allows history reload', async () => {
  let detailReads = 0;
  vi.stubGlobal('fetch', async (url: string) => {
    const path = new URL(url, 'http://localhost').pathname;
    if (path.endsWith('/history'))
      return Response.json(
        { code: 'INVOICE_HISTORY_CHANGED' },
        { status: 409 },
      );
    if (path === '/api/invoice-records') return Response.json(inventory);
    detailReads += 1;
    return Response.json(pagedCurrent());
  });
  render(
    <SectionVisibility value={true}>
      <InvoiceRecordsWorkspace
        actor={actor}
        identity={identity}
        projectionAuthority="unchanged-native-authority"
        onActorRevalidated={() => undefined}
        onCompanyContextRejected={() => undefined}
        onWorkspaceAccessRejected={() => undefined}
      />
    </SectionVisibility>,
  );
  fireEvent.click(await screen.findByRole('button', { name: /SYN-INV-001/ }));
  fireEvent.click(
    await screen.findByRole('button', { name: 'Correct transcription' }),
  );
  fireEvent.change(screen.getByLabelText('Literal reason'), {
    target: { value: 'Correctable intent' },
  });
  const history = within(
    screen.getByRole('region', { name: 'Immutable revision history' }),
  );
  fireEvent.click(history.getByRole('button', { name: 'Load more' }));
  const reload = await history.findByRole('button', {
    name: 'Reload current entry',
  });
  expect(reload).toBeDisabled();
  expect(screen.getByLabelText('Literal reason')).toHaveValue(
    'Correctable intent',
  );
  expect(screen.getByLabelText('Literal reason')).toBeEnabled();
  expect(detailReads).toBe(1);
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(reload).toBeEnabled();
  fireEvent.click(reload);
  await waitFor(() => expect(detailReads).toBe(2));
});

for (const action of ['CORRECT', 'WITHDRAW_ENTRY'] as const)
  for (const commandState of ['sending', 'uncertain'] as const)
    for (const continuation of ['before editor', 'after submit'] as const)
      it(`keeps ${commandState} ${action} owned when history requested ${continuation} reports a changed head`, async () => {
        const detail = pagedCurrent();
        let releaseCommand: ((response: Response) => void) | undefined;
        let releaseHistory: ((response: Response) => void) | undefined;
        let detailReads = 0;
        const posts: RequestInit[] = [];
        const reason = ' Exact pending command Ș Я é <script> ';
        const values = { ...detail.record.values, grossMinor: '125550' };
        const resultValues =
          action === 'CORRECT' ? values : detail.record.values;
        const fact: InvoiceRevision = {
          ...initialFact,
          revision: 27,
          action,
          commandId: crypto.randomUUID(),
          before: { entryState: 'RECORDED', values: detail.record.values },
          after: {
            entryState: action === 'CORRECT' ? 'RECORDED' : 'WITHDRAWN',
            values: resultValues,
          },
          reason,
        };
        const resolved: InvoiceCurrent = {
          ...detail,
          record: {
            ...detail.record,
            revision: 27,
            entryState: fact.after.entryState,
            values: resultValues,
          },
          capabilities: {
            canCorrect: action === 'CORRECT',
            canWithdraw: action === 'CORRECT',
          },
          history: {
            items: [fact, ...detail.history.items].slice(0, 25),
            nextCursor: 'observed-head-27',
          },
        };
        vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
          const path = new URL(url, 'http://localhost').pathname;
          if (init?.method === 'POST') {
            posts.push(init);
            if (posts.length > 1)
              return Response.json(
                {
                  format: 'EXTERNAL_INVOICE_COMMAND/1',
                  commandId: fact.commandId,
                  recordId: detail.record.id,
                  revision: 27,
                  action,
                  recordedAt: fact.recordedAt,
                },
                { status: 201 },
              );
            return new Promise<Response>((resolve) => {
              releaseCommand = resolve;
            });
          }
          if (path.endsWith('/history'))
            return new Promise<Response>((resolve) => {
              releaseHistory = resolve;
            });
          if (path === '/api/invoice-records') return Response.json(inventory);
          detailReads += 1;
          return Response.json(posts.length > 1 ? resolved : detail);
        });
        const rendered = render(
          <SectionVisibility value={true}>
            <InvoiceRecordsWorkspace
              actor={actor}
              identity={identity}
              projectionAuthority="unchanged-native-authority"
              onActorRevalidated={() => undefined}
              onCompanyContextRejected={() => undefined}
              onWorkspaceAccessRejected={() => undefined}
            />
          </SectionVisibility>,
        );
        fireEvent.click(
          await screen.findByRole('button', { name: /SYN-INV-001/ }),
        );
        const openEditor = await screen.findByRole('button', {
          name:
            action === 'CORRECT'
              ? 'Correct transcription'
              : 'Withdraw PRISMA entry',
        });
        const history = within(
          screen.getByRole('region', { name: 'Immutable revision history' }),
        );
        expect(history.getAllByRole('listitem')).toHaveLength(25);
        if (continuation === 'before editor') {
          fireEvent.click(history.getByRole('button', { name: 'Load more' }));
          await waitFor(() => expect(releaseHistory).toBeTypeOf('function'));
        }
        fireEvent.click(openEditor);
        if (action === 'CORRECT')
          fireEvent.change(screen.getByLabelText('Declared gross amount'), {
            target: { value: '1255.50' },
          });
        fireEvent.change(screen.getByLabelText('Literal reason'), {
          target: { value: reason },
        });
        fireEvent.click(
          screen.getByRole('button', {
            name:
              action === 'CORRECT'
                ? 'Save transcription correction'
                : 'Confirm entry withdrawal',
          }),
        );
        await screen.findByText('Saving…');
        await waitFor(() => expect(posts).toHaveLength(1));
        if (commandState === 'uncertain') {
          await act(async () =>
            releaseCommand?.(new Response(null, { status: 503 })),
          );
          await screen.findByRole('button', {
            name: 'Retry identical command',
          });
        }
        if (continuation === 'after submit') {
          fireEvent.click(history.getByRole('button', { name: 'Load more' }));
          await waitFor(() => expect(releaseHistory).toBeTypeOf('function'));
        }
        await act(async () =>
          releaseHistory?.(
            Response.json({ code: 'INVOICE_HISTORY_CHANGED' }, { status: 409 }),
          ),
        );
        await history.findByText(/History changed/);
        fireEvent.click(
          history.getByRole('button', { name: 'Reload current entry' }),
        );
        expect(screen.getByLabelText('Literal reason')).toHaveValue(reason);
        expect(screen.getByLabelText('Literal reason')).toBeDisabled();
        expect(
          history.getByRole('button', { name: 'Reload current entry' }),
        ).toBeDisabled();
        expect(
          screen.getByRole('button', { name: 'Back to inventory' }),
        ).toBeDisabled();
        expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
        expect(detailReads).toBe(1);
        if (commandState === 'sending') {
          expect(
            screen.queryByRole('button', { name: 'Retry identical command' }),
          ).not.toBeInTheDocument();
          await act(async () =>
            releaseCommand?.(new Response(null, { status: 503 })),
          );
        }
        fireEvent.click(
          await screen.findByRole('button', {
            name: 'Retry identical command',
          }),
        );
        await screen.findByRole('heading', {
          name:
            action === 'CORRECT'
              ? 'Revision 27 · Transcription corrected'
              : 'Revision 27 · Entry withdrawn',
        });
        expect(
          screen.queryByLabelText('Literal reason'),
        ).not.toBeInTheDocument();
        expect(posts).toHaveLength(2);
        expect(posts[0]?.body).toBe(
          JSON.stringify(
            action === 'CORRECT'
              ? { action, expectedRevision: 26, values, reason }
              : { action, expectedRevision: 26, reason },
          ),
        );
        expect(posts[1]?.body).toBe(posts[0]?.body);
        const key = new Headers(posts[0]?.headers).get('idempotency-key');
        expect(key).toMatch(/^[0-9a-f-]{36}$/);
        expect(new Headers(posts[1]?.headers).get('idempotency-key')).toBe(key);
        expect(detailReads).toBe(2);
        const resolvedHistory = within(
          screen.getByRole('region', { name: 'Immutable revision history' }),
        );
        releaseHistory = undefined;
        fireEvent.click(
          resolvedHistory.getByRole('button', { name: 'Load more' }),
        );
        await waitFor(() => expect(releaseHistory).toBeTypeOf('function'));
        await act(async () =>
          releaseHistory?.(
            Response.json({ code: 'INVOICE_HISTORY_CHANGED' }, { status: 409 }),
          ),
        );
        const reload = await resolvedHistory.findByRole('button', {
          name: 'Reload current entry',
        });
        expect(reload).toBeEnabled();
        fireEvent.click(reload);
        await waitFor(() => expect(detailReads).toBe(3));
        expect(posts).toHaveLength(2);
        rendered.unmount();
      });
