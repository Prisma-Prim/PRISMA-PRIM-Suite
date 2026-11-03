import { afterEach, expect, it, vi } from 'vitest';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '../test/render-with-interface-locale';
import { changeValue } from '../test/select-option';
import { SectionVisibility } from '../production-shell/section-visibility';
import { ApplicationPresentation } from '../production-shell/application-presentation';
import { useInterfaceLocale } from '../localization/interface-locale';
import type { ActorContext } from '../access-types';
import type { BrowserIdentity } from '../access-composition';
import { InvoiceRecordsWorkspace } from './InvoiceRecordsWorkspace';
import {
  actor,
  capture,
  copiedOnly,
  corrected,
  current,
  financeOnly,
  identity,
  ids,
  inventory,
  receipt,
  source,
  values,
  withdrawn,
} from './invoice-record.fixture';

const callbacks = {
  onActorRevalidated: vi.fn(),
  onCompanyContextRejected: vi.fn(),
  onWorkspaceAccessRejected: vi.fn(),
};
function view({
  currentActor = actor,
  currentIdentity = identity,
  visible = true,
  projection = 'native-1',
  frame = 'prisme',
}: {
  currentActor?: ActorContext;
  currentIdentity?: BrowserIdentity;
  visible?: boolean;
  projection?: string;
  frame?: 'prisme' | 'classic';
} = {}) {
  return (
    <ApplicationPresentation value={frame}>
      <SectionVisibility value={visible}>
        <InvoiceRecordsWorkspace
          actor={currentActor}
          identity={currentIdentity}
          projectionAuthority={projection}
          {...callbacks}
        />
      </SectionVisibility>
    </ApplicationPresentation>
  );
}
function LocaleSwitch() {
  const { changeLocale } = useInterfaceLocale();
  return <button onClick={() => changeLocale('fr')}>Français</button>;
}
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  localStorage.clear();
});

it('renders large multiline native copies and captured Actor labels with copied-only authority', async () => {
  const copiedContext = {
    ...copiedOnly.record.copiedContext,
    companyLabel: 'Native Company\n' + 'C'.repeat(1001),
    receivingParty: {
      ...copiedOnly.record.copiedContext.receivingParty,
      legalName: 'Legal\n' + 'N'.repeat(194),
      taxIdentifier: 'TAX\t' + 'T'.repeat(496),
      address: 'Address\n' + 'A'.repeat(1992),
    },
  };
  const capturedActor = {
    ...copiedOnly.actor,
    displayName: 'Native\nActor\t' + 'A'.repeat(1001),
  };
  const requests: string[] = [];
  vi.stubGlobal('fetch', async (url: string) => {
    requests.push(url);
    if (url.endsWith('/invoice-records'))
      return Response.json({
        ...inventory,
        items: [{ ...inventory.items[0], copiedContext }],
      });
    if (url.endsWith(`/invoice-records/${ids.record}`))
      return Response.json({
        ...copiedOnly,
        actor: capturedActor,
        record: { ...copiedOnly.record, copiedContext },
        history: {
          ...copiedOnly.history,
          items: copiedOnly.history.items.map((item) => ({
            ...item,
            actor: capturedActor,
          })),
        },
      });
    throw new Error(`Unexpected live read: ${url}`);
  });
  render(view({ currentActor: financeOnly }));
  fireEvent.click(await screen.findByRole('button', { name: /SYN-INV-001/ }));
  await screen.findByRole('button', { name: 'Withdraw PRISMA entry' });
  for (const literal of [
    copiedContext.companyLabel,
    copiedContext.receivingParty.taxIdentifier,
    copiedContext.receivingParty.address,
  ]) {
    expect(
      screen.getAllByText(
        (_content, element) =>
          element?.tagName === 'DD' && element.textContent === literal,
      ).length,
    ).toBeGreaterThan(0);
  }
  expect(
    screen.getAllByText(
      (_content, element) =>
        element?.tagName === 'DD' &&
        element.textContent ===
          copiedContext.receivingParty.legalName + ' · Additional legal entity',
    ).length,
  ).toBeGreaterThan(0);
  expect(
    screen.getAllByText(
      (_content, element) =>
        element?.tagName === 'P' &&
        element.textContent?.startsWith(
          `Recorded by: ${capturedActor.displayName} · `,
        ) === true,
    ).length,
  ).toBeGreaterThan(0);
  expect(requests.every((url) => url.includes('/invoice-records'))).toBe(true);
});

it('reads literal copied declarations and withdraws without any native family, Contract, Client or content grant', async () => {
  const posts: RequestInit[] = [];
  const reason = ' Wrong PRISMA entry Ș Я é <script> ';
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    if (init?.method === 'POST') {
      posts.push(init);
      return Response.json(receipt('WITHDRAW_ENTRY'), { status: 201 });
    }
    return Response.json(
      url.endsWith('/invoice-records')
        ? inventory
        : posts.length
          ? withdrawn(reason)
          : copiedOnly,
    );
  });
  render(view({ currentActor: financeOnly }));
  fireEvent.click(await screen.findByRole('button', { name: /SYN-INV-001/ }));
  expect(
    await screen.findByRole('button', { name: 'Withdraw PRISMA entry' }),
  ).toBeVisible();
  expect(
    screen.queryByRole('button', { name: 'Correct transcription' }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: 'Download exact source PDF' }),
  ).not.toBeInTheDocument();
  expect(screen.getAllByText('1,255.00 MDL').length).toBeGreaterThan(0);
  expect(screen.getAllByText('0.00 MDL').length).toBeGreaterThan(0);
  expect(screen.getAllByText('Unknown / not recorded').length).toBeGreaterThan(
    0,
  );
  expect(
    screen.getByText(
      'Fictional party Ș Я é <script> · Additional legal entity',
    ),
  ).toBeVisible();
  expect(document.querySelector('script')).toBeNull();
  fireEvent.click(
    screen.getByRole('button', { name: 'Withdraw PRISMA entry' }),
  );
  fireEvent.change(screen.getByLabelText('Literal reason'), {
    target: { value: reason },
  });
  fireEvent.click(
    screen.getByRole('button', { name: 'Confirm entry withdrawal' }),
  );
  await screen.findByText(/The command is confirmed and durably recorded/);
  await screen.findByRole('heading', { name: 'Revision 2 · Entry withdrawn' });
  expect(posts).toHaveLength(1);
  expect(posts[0]?.body).toBe(
    JSON.stringify({ action: 'WITHDRAW_ENTRY', expectedRevision: 1, reason }),
  );
  expect(screen.getAllByText('1,255.00 MDL').length).toBeGreaterThan(1);
});

it('keeps one exact uncertain correction across locale and frame changes, then retries only the read after confirmation', async () => {
  const posts: RequestInit[] = [];
  let detailReads = 0;
  const reason = 'Transcription 1255.00 → 1255.50';
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    if (init?.method === 'POST') {
      posts.push(init);
      return posts.length === 1
        ? new Response(null, { status: 503 })
        : Response.json(receipt('CORRECT'), { status: 201 });
    }
    if (url.endsWith('/invoice-records')) return Response.json(inventory);
    detailReads += 1;
    if (detailReads === 2) return new Response(null, { status: 503 });
    return Response.json(posts.length === 2 ? corrected(reason) : current);
  });
  const rendered = render(
    <>
      {view()}
      <LocaleSwitch />
    </>,
  );
  fireEvent.click(await screen.findByRole('button', { name: /SYN-INV-001/ }));
  fireEvent.click(
    await screen.findByRole('button', { name: 'Correct transcription' }),
  );
  fireEvent.change(screen.getByLabelText('Declared gross amount'), {
    target: { value: '1255.50' },
  });
  fireEvent.change(screen.getByLabelText('Literal reason'), {
    target: { value: reason },
  });
  fireEvent.click(
    screen.getByRole('button', { name: 'Save transcription correction' }),
  );
  await screen.findByRole('button', { name: 'Retry identical command' });
  fireEvent.click(screen.getByRole('button', { name: 'Français' }));
  rendered.rerender(
    <>
      {view({ frame: 'classic' })}
      <LocaleSwitch />
    </>,
  );
  expect(screen.getByLabelText('Montant brut déclaré')).toHaveValue('1255.50');
  expect(screen.getByLabelText('Motif littéral')).toHaveValue(reason);
  expect(screen.getByLabelText('Montant brut déclaré')).toBeDisabled();
  expect(detailReads).toBe(1);
  expect(posts).toHaveLength(1);
  fireEvent.click(
    screen.getByRole('button', { name: 'Réessayer la commande identique' }),
  );
  await screen.findByText(
    /La commande est confirmée, mais ses détails actualisés sont illisibles/,
  );
  expect(posts).toHaveLength(2);
  expect(posts[1]?.body).toBe(posts[0]?.body);
  expect(new Headers(posts[1]?.headers).get('idempotency-key')).toBe(
    new Headers(posts[0]?.headers).get('idempotency-key'),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Réessayer la lecture' }));
  await screen.findByRole('heading', {
    name: 'Révision 2 · Transcription corrigée',
  });
  expect(posts).toHaveLength(2);
  expect(
    screen.getAllByText('1 255,50 MDL', { normalizer: (text) => text }).length,
  ).toBeGreaterThan(0);
});

it('creates from human source labels with explicit acknowledgement and string minor units, preserving unknown versus zero', async () => {
  const posts: RequestInit[] = [];
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    if (init?.method === 'POST') {
      posts.push(init);
      return Response.json(receipt('CREATE'), { status: 201 });
    }
    if (url.endsWith('/sources'))
      return Response.json({
        format: 'EXTERNAL_INVOICE_SOURCE_PAGE/1',
        companyId: ids.company,
        readCapture: capture,
        items: [source],
        nextCursor: null,
      });
    return Response.json(
      url.endsWith('/invoice-records') ? { ...inventory, items: [] } : current,
    );
  });
  render(view());
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
      name: /Fictional exact source.*Fictional Contract №17.*Fictional party/,
    }),
  );
  expect(screen.getByLabelText('Currency')).toHaveAttribute('data-value', '');
  fireEvent.change(
    screen.getByLabelText('Declared external process or system'),
    { target: { value: values.externalSystem } },
  );
  fireEvent.change(screen.getByLabelText('External invoice reference'), {
    target: { value: values.externalNumber },
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
  fireEvent.click(screen.getByRole('button', { name: 'Save Invoice Record' }));
  await screen.findByText(/The command is confirmed and durably recorded/);
  expect(posts[0]?.body).toBe(
    JSON.stringify({
      source: source.source,
      values,
      acknowledgeExternalDeclaration: true,
      replacesWithdrawnRecordId: null,
    }),
  );
});

it('preserves a finance-only withdrawal intention while retiring live projections after source authority loss', async () => {
  let lost = false;
  vi.stubGlobal('fetch', async (url: string) =>
    Response.json(
      url.endsWith('/invoice-records')
        ? inventory
        : lost
          ? copiedOnly
          : current,
    ),
  );
  const rendered = render(view());
  fireEvent.click(await screen.findByRole('button', { name: /SYN-INV-001/ }));
  fireEvent.click(
    await screen.findByRole('button', { name: 'Withdraw PRISMA entry' }),
  );
  fireEvent.change(screen.getByLabelText('Literal reason'), {
    target: { value: 'Still independently authorized' },
  });
  lost = true;
  rendered.rerender(
    view({ currentActor: financeOnly, projection: 'native-2' }),
  );
  expect(screen.getByLabelText('Literal reason')).toHaveValue(
    'Still independently authorized',
  );
  expect(screen.queryByText('fictional-original.pdf')).not.toBeInTheDocument();
  expect(screen.getAllByText('1,255.00 MDL').length).toBeGreaterThan(0);
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'Confirm entry withdrawal' }),
    ).toBeEnabled(),
  );
});

it('retires a held token through section A → B → A without dispatching the earlier request', async () => {
  let release: ((value: string | null) => void) | undefined;
  let lookups = 0;
  const fetcher = vi.fn(async () => Response.json({ ...inventory, items: [] }));
  const held: BrowserIdentity = {
    ...identity,
    requestHeaders: undefined,
    getToken: () => {
      lookups += 1;
      return lookups === 1
        ? new Promise<string | null>((resolve) => {
            release = resolve;
          })
        : Promise.resolve('new-token');
    },
  };
  vi.stubGlobal('fetch', fetcher);
  const rendered = render(view({ currentIdentity: held }));
  await waitFor(() => expect(lookups).toBe(1));
  rendered.rerender(view({ currentIdentity: held, visible: false }));
  rendered.rerender(view({ currentIdentity: held, visible: true }));
  await screen.findByText('No Invoice Records.');
  await act(async () => {
    release?.('retired-token');
  });
  expect(fetcher).toHaveBeenCalledTimes(1);
});
