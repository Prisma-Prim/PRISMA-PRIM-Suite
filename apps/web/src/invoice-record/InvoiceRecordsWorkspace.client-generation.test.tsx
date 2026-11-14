import { afterEach, expect, it, vi } from 'vitest';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '../test/render-with-interface-locale';
import { changeValue } from '../test/select-option';
import type { BrowserIdentity } from '../access-composition';
import { SectionVisibility } from '../production-shell/section-visibility';
import { ApplicationPresentation } from '../production-shell/application-presentation';
import { useInterfaceLocale } from '../localization/interface-locale';
import { InvoiceRecordsWorkspace } from './InvoiceRecordsWorkspace';
import {
  actor,
  capture,
  corrected,
  current,
  identity,
  ids,
  initialFact,
  inventory,
  receipt,
  source,
  values,
  withdrawn,
} from './invoice-record.fixture';

const oldNumber = 'Old Client generation CREATE';
const freshNumber = 'Fresh Client generation CREATE';
const oldReason = 'Old Client generation correction';
const freshReason = 'Fresh Client generation correction';
type Action = 'CREATE' | 'CORRECT' | 'WITHDRAW_ENTRY';
type Posted = { body: string; key: string | null };
function LocaleControl() {
  const { changeLocale } = useInterfaceLocale();
  return (
    <>
      <button onClick={() => changeLocale('fr')}>Français</button>
      <button onClick={() => changeLocale('en')}>English</button>
    </>
  );
}
function view(browserIdentity: BrowserIdentity, projection: string) {
  return (
    <>
      <ApplicationPresentation value="prisme">
        <SectionVisibility value={true}>
          <InvoiceRecordsWorkspace
            actor={actor}
            identity={browserIdentity}
            projectionAuthority={projection}
            onCompanyContextRejected={() => undefined}
            onActorRevalidated={() => undefined}
            onWorkspaceAccessRejected={() => undefined}
          />
        </SectionVisibility>
      </ApplicationPresentation>
      <LocaleControl />
    </>
  );
}
function holdableIdentity() {
  let holdNext = false;
  let release: ((token: string | null) => void) | undefined;
  const browserIdentity: BrowserIdentity = {
    ...identity,
    requestHeaders: undefined,
    getToken: () => {
      if (!holdNext) return Promise.resolve('current-token');
      holdNext = false;
      return new Promise<string | null>((resolve) => {
        release = resolve;
      });
    },
  };
  return {
    browserIdentity,
    hold: () => {
      holdNext = true;
      release = undefined;
    },
    held: () => release !== undefined,
    release: () => release?.('released-token'),
  };
}
function installCommands(action: Action, reason = '') {
  const posts: Posted[] = [];
  const reads: string[] = [];
  const freshValues = { ...values, externalNumber: freshNumber };
  const freshCreate = {
    ...current,
    record: { ...current.record, values: freshValues },
    history: {
      items: [
        {
          ...initialFact,
          after: { entryState: 'RECORDED', values: freshValues },
        },
      ],
      nextCursor: null,
    },
  };
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    if (init?.method === 'POST') {
      if (typeof init.body !== 'string')
        throw new Error('Expected serialized command at HTTP boundary');
      posts.push({
        body: init.body,
        key: new Headers(init.headers).get('idempotency-key'),
      });
      return posts.length === 1
        ? new Response(null, { status: 503 })
        : Response.json(receipt(action), { status: 201 });
    }
    reads.push(url);
    if (url.endsWith('/sources'))
      return Response.json({
        format: 'EXTERNAL_INVOICE_SOURCE_PAGE/1',
        companyId: ids.company,
        readCapture: capture,
        items: [source],
        nextCursor: null,
      });
    if (url.endsWith('/invoice-records'))
      return Response.json(
        action === 'CREATE' ? { ...inventory, items: [] } : inventory,
      );
    return Response.json(
      posts.length < 2
        ? current
        : action === 'CREATE'
          ? freshCreate
          : action === 'CORRECT'
            ? corrected(freshReason)
            : withdrawn(reason),
    );
  });
  return { posts, reads };
}
async function openCreate(number: string) {
  fireEvent.click(
    await screen.findByRole('button', { name: 'Record an external invoice' }),
  );
  const picker = await screen.findByLabelText(
    'Choose an authorized exact source',
  );
  await waitFor(() => expect(picker).toBeEnabled());
  fireEvent.click(picker);
  fireEvent.click(
    await screen.findByRole('option', {
      name: /Fictional exact source.*Fictional Contract №17/,
    }),
  );
  fireEvent.change(
    screen.getByLabelText('Declared external process or system'),
    { target: { value: values.externalSystem } },
  );
  fireEvent.change(screen.getByLabelText('External invoice reference'), {
    target: { value: number },
  });
  fireEvent.change(screen.getByLabelText('Declared issue date'), {
    target: { value: values.issuedOn },
  });
  fireEvent.change(screen.getByLabelText('Declared gross amount'), {
    target: { value: '1255.00' },
  });
  fireEvent.change(screen.getByLabelText('Declared tax amount (optional)'), {
    target: { value: '0' },
  });
  changeValue(screen.getByLabelText('Currency'), 'MDL');
  fireEvent.click(
    screen.getByRole('checkbox', { name: /I declare that this exact source/ }),
  );
}
async function openCorrection(reason: string) {
  fireEvent.click(
    await screen.findByRole('button', { name: 'Correct transcription' }),
  );
  fireEvent.change(screen.getByLabelText('Declared gross amount'), {
    target: { value: '1255.50' },
  });
  fireEvent.change(screen.getByLabelText('Literal reason'), {
    target: { value: reason },
  });
}
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
});

it.each(['CREATE', 'CORRECT'] satisfies Action[])(
  'retires an uncertain %s retry on Client projection A → B → A with unchanged native and finance captures, then admits a fresh intention',
  async (action) => {
    const { posts, reads } = installCommands(action);
    const token = holdableIdentity();
    const rendered = render(view(token.browserIdentity, 'client-generation-A'));
    if (action === 'CREATE') await openCreate(oldNumber);
    else {
      fireEvent.click(
        await screen.findByRole('button', { name: /SYN-INV-001/ }),
      );
      await openCorrection(oldReason);
    }
    fireEvent.click(
      screen.getByRole('button', {
        name:
          action === 'CREATE'
            ? 'Save Invoice Record'
            : 'Save transcription correction',
      }),
    );
    await screen.findByRole('button', { name: 'Retry identical command' });
    expect(posts).toHaveLength(1);
    const oldAttempt = posts[0];
    const readsBeforeLocale = reads.length;
    expect(oldAttempt?.key).toMatch(/^[0-9a-f-]{36}$/u);
    fireEvent.click(screen.getByRole('button', { name: 'Français' }));
    expect(
      screen.getByRole('button', { name: 'Réessayer la commande identique' }),
    ).toBeVisible();
    expect(
      screen.getByLabelText(
        action === 'CREATE'
          ? 'Référence de la facture externe'
          : 'Motif littéral',
      ),
    ).toHaveValue(action === 'CREATE' ? oldNumber : oldReason);
    expect(posts).toHaveLength(1);
    expect(reads).toHaveLength(readsBeforeLocale);
    fireEvent.click(screen.getByRole('button', { name: 'English' }));
    token.hold();
    fireEvent.click(
      screen.getByRole('button', { name: 'Retry identical command' }),
    );
    await waitFor(() => expect(token.held()).toBe(true));
    rendered.rerender(view(token.browserIdentity, 'client-generation-B'));
    rendered.rerender(view(token.browserIdentity, 'client-generation-A'));
    expect(
      screen.queryByLabelText('External invoice reference'),
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Literal reason')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Retry identical command' }),
    ).not.toBeInTheDocument();
    await act(async () => {
      token.release();
    });
    expect(posts).toHaveLength(1);
    if (action === 'CREATE') await openCreate(freshNumber);
    else await openCorrection(freshReason);
    fireEvent.click(
      screen.getByRole('button', {
        name:
          action === 'CREATE'
            ? 'Save Invoice Record'
            : 'Save transcription correction',
      }),
    );
    await screen.findByText(/The command is confirmed and durably recorded/);
    expect(posts).toHaveLength(2);
    expect(posts[1]?.key).not.toBe(oldAttempt?.key);
    expect(posts[1]?.body).not.toBe(oldAttempt?.body);
    expect(posts[1]?.body).toBe(
      JSON.stringify(
        action === 'CREATE'
          ? {
              source: source.source,
              values: { ...values, externalNumber: freshNumber },
              acknowledgeExternalDeclaration: true,
              replacesWithdrawnRecordId: null,
            }
          : {
              action: 'CORRECT',
              expectedRevision: 1,
              values: { ...values, grossMinor: '125550' },
              reason: freshReason,
            },
      ),
    );
    await screen.findByRole('heading', {
      name:
        action === 'CREATE'
          ? 'Revision 1 · Entry created'
          : 'Revision 2 · Transcription corrected',
    });
  },
);

it('preserves a financial withdrawal reason and exact retry through Client projection changes and publishes its final withdrawn history', async () => {
  const reason = ' Independent financial withdrawal Ș Я é ';
  const { posts } = installCommands('WITHDRAW_ENTRY', reason);
  const token = holdableIdentity();
  const rendered = render(view(token.browserIdentity, 'client-generation-A'));
  fireEvent.click(await screen.findByRole('button', { name: /SYN-INV-001/ }));
  fireEvent.click(
    await screen.findByRole('button', { name: 'Withdraw PRISMA entry' }),
  );
  fireEvent.change(screen.getByLabelText('Literal reason'), {
    target: { value: reason },
  });
  rendered.rerender(view(token.browserIdentity, 'client-generation-B'));
  expect(screen.getByLabelText('Literal reason')).toHaveValue(reason);
  fireEvent.click(
    screen.getByRole('button', { name: 'Confirm entry withdrawal' }),
  );
  await screen.findByRole('button', { name: 'Retry identical command' });
  const first = posts[0];
  token.hold();
  fireEvent.click(
    screen.getByRole('button', { name: 'Retry identical command' }),
  );
  await waitFor(() => expect(token.held()).toBe(true));
  rendered.rerender(view(token.browserIdentity, 'client-generation-C'));
  rendered.rerender(view(token.browserIdentity, 'client-generation-B'));
  expect(screen.getByLabelText('Literal reason')).toHaveValue(reason);
  await act(async () => {
    token.release();
  });
  await screen.findByText(/The command is confirmed and durably recorded/);
  await screen.findByRole('heading', { name: 'Revision 2 · Entry withdrawn' });
  expect(posts).toHaveLength(2);
  expect(posts[1]).toEqual(first);
  expect(posts[1]?.body).toBe(
    JSON.stringify({ action: 'WITHDRAW_ENTRY', expectedRevision: 1, reason }),
  );
  expect(screen.getAllByText('1,255.00 MDL').length).toBeGreaterThan(0);
});
