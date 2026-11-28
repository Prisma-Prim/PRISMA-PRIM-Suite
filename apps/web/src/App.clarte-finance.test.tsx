import { Blob as NodeBlob } from 'node:buffer';
import { createHash, webcrypto } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import {
  deterministicBrowserIdentity,
  type BrowserIdentity,
} from './access-composition';
import type { ActorContext } from './access-types';
import { withCompanyGrants } from './access/company-grants.test-fixture';
import {
  actor as invoiceActor,
  capture as invoiceCapture,
  corrected,
  current as invoiceCurrent,
  ids as invoiceIds,
  inventory as invoiceInventory,
  receipt as invoiceReceipt,
  source as invoiceSource,
  values as invoiceValues,
  withdrawn,
} from './invoice-record/invoice-record.fixture';
import type {
  PaymentAction,
  PaymentCurrent,
  PaymentReceipt,
  PaymentRevision,
  PaymentSelectable,
  PaymentValues,
} from './payment-observation/payment.types';
import {
  paymentEvidenceActor,
  paymentEvidenceDocument,
  paymentEvidenceIds,
} from './payment-evidence/payment-evidence.test-fixture';
import { renderInInterface } from './test/app-interface';
import {
  act,
  fireEvent,
  screen,
  waitFor,
  within,
} from './test/render-with-interface-locale';
import { changeValue } from './test/select-option';

// Every response is intercepted with fictional data; App, the Clarté frame,
// the Finance screens and every native owner are real.
type Call = Readonly<{
  method: string;
  path: string;
  body: BodyInit | null | undefined;
  key: string | null;
}>;
type Handler = (call: Call) => Response | Promise<Response> | undefined;

const pdfBytes = new TextEncoder().encode('%PDF-1.4 fictional exact source');
const pdfSha = createHash('sha256').update(pdfBytes).digest('hex');
function pdf() {
  return new Response(pdfBytes, {
    headers: { 'content-type': 'application/pdf' },
  });
}

function installApp(actor: ActorContext, handler: Handler) {
  const calls: Call[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(input.toString(), 'http://localhost');
      const call: Call = {
        method: init?.method ?? 'GET',
        path: url.pathname + url.search,
        body: init?.body,
        key: new Headers(init?.headers).get('idempotency-key'),
      };
      calls.push(call);
      if (url.pathname === '/api/access/current-actor')
        return Response.json(actor);
      if (url.pathname === '/api/companies')
        return Response.json([actor.activeCompany]);
      if (url.pathname === '/api/activity-log')
        return Response.json({ events: [] });
      return (await handler(call)) ?? Response.json({}, { status: 404 });
    }),
  );
  return {
    calls,
    posts: () => calls.filter((call) => call.method !== 'GET'),
    reads: (path: string) =>
      calls.filter((call) => call.method === 'GET' && call.path === path),
  };
}

function renderFinance(hash: string, identity: BrowserIdentity) {
  window.history.replaceState(null, '', `/#${hash}`);
  return renderInInterface('clarte', <App identity={identity} />);
}

function panel(name: string | RegExp) {
  return screen.getByRole('dialog', { name });
}

/** Reading a record, the exact PDF opens only when asked. */
async function showPdf(region: HTMLElement, fileName: string) {
  fireEvent.click(
    within(region).getByRole('button', { name: 'Show the PDF here' }),
  );
  return within(region).findByTitle(`Exact source PDF ${fileName}`);
}

/** Beside a transcription form, the exact PDF opens at once. */
async function pdfBeside(region: HTMLElement, fileName: string) {
  const frame = await within(region).findByTitle(
    `Exact source PDF ${fileName}`,
  );
  expect(
    within(region).queryByRole('button', { name: 'Show the PDF here' }),
  ).not.toBeInTheDocument();
  return frame;
}

const scrollable: {
  scrollIntoView?: (options?: ScrollIntoViewOptions) => void;
} = Element.prototype;
const originalScroll = scrollable.scrollIntoView;
const created = vi.fn(() => 'blob:fictional-exact-source');
const revoked = vi.fn();
beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  scrollable.scrollIntoView = vi.fn();
  vi.stubGlobal('crypto', webcrypto);
  vi.stubGlobal('Blob', NodeBlob);
  vi.stubGlobal(
    'URL',
    class extends URL {
      static createObjectURL = created;
      static revokeObjectURL = revoked;
    },
  );
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(
    () => undefined,
  );
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  created.mockClear();
  revoked.mockClear();
  scrollable.scrollIntoView = originalScroll;
  window.history.replaceState(null, '', '/');
});

// ---------------------------------------------------------------- Invoices
const exactInvoiceSource = {
  ...invoiceSource,
  byteLength: pdfBytes.byteLength,
  sha256: pdfSha,
};
function invoiceWithSource(value = invoiceCurrent) {
  return value.liveSource.kind === 'AVAILABLE' &&
    value.liveSource.content.kind === 'AVAILABLE'
    ? {
        ...value,
        liveSource: {
          ...value.liveSource,
          content: {
            ...value.liveSource.content,
            byteLength: pdfBytes.byteLength,
            sha256: pdfSha,
          },
        },
      }
    : value;
}
function invoiceServer(detail: () => unknown, inventory = invoiceInventory) {
  return installApp(invoiceActor, (call) => {
    if (call.method === 'POST') {
      if (call.path === '/api/invoice-records')
        return Response.json(invoiceReceipt('CREATE'), { status: 201 });
      if (call.path === `/api/invoice-records/${invoiceIds.record}/commands`) {
        const body: unknown = JSON.parse(String(call.body));
        const action =
          typeof body === 'object' && body !== null && 'action' in body
            ? body.action
            : undefined;
        return Response.json(
          invoiceReceipt(action === 'CORRECT' ? 'CORRECT' : 'WITHDRAW_ENTRY'),
          { status: 201 },
        );
      }
      return undefined;
    }
    if (call.path === '/api/invoice-records') return Response.json(inventory);
    if (call.path === '/api/invoice-records/sources')
      return Response.json({
        format: 'EXTERNAL_INVOICE_SOURCE_PAGE/1',
        companyId: invoiceIds.company,
        readCapture: invoiceCapture,
        items: [exactInvoiceSource],
        nextCursor: null,
      });
    if (call.path === `/api/invoice-records/${invoiceIds.record}`)
      return Response.json(detail());
    if (call.path === `/api/invoice-records/${invoiceIds.record}/source`)
      return pdf();
    if (
      call.path ===
      `/api/documents/${invoiceIds.document}/versions/${invoiceIds.version}/content/${invoiceIds.representation}`
    )
      return pdf();
    if (call.path.startsWith('/api/contracts/opportunities/'))
      return Response.json({
        contract: {
          id: invoiceIds.contract,
          companyId: invoiceIds.company,
          opportunityId: invoiceIds.opportunity,
          kind: 'CONTRACT',
          clientRequestId: '10000000-0000-4000-8000-000000000099',
          version: { id: invoiceIds.contractVersion },
        },
      });
    return undefined;
  });
}
async function openInvoice() {
  fireEvent.click(await screen.findByRole('button', { name: /^SYN-INV-001/ }));
  const dialog = await screen.findByRole('dialog', { name: /^SYN-INV-001/ });
  await within(dialog).findByRole('heading', {
    name: 'Immutable revision history',
  });
  return dialog;
}
function chooseInvoiceSource(dialog: HTMLElement) {
  const picker = within(dialog).getByLabelText(
    'Choose an authorized exact source',
  );
  fireEvent.click(picker);
  fireEvent.click(
    screen.getByRole('option', {
      name: /Fictional exact source.*Fictional Contract №17.*Fictional party/,
    }),
  );
}
function transcribe(dialog: HTMLElement) {
  fireEvent.change(
    within(dialog).getByLabelText('Declared external process or system'),
    { target: { value: invoiceValues.externalSystem } },
  );
  fireEvent.change(
    within(dialog).getByLabelText('External invoice reference'),
    {
      target: { value: invoiceValues.externalNumber },
    },
  );
  fireEvent.change(within(dialog).getByLabelText('Declared issue date'), {
    target: { value: invoiceValues.issuedOn },
  });
  fireEvent.change(within(dialog).getByLabelText('Declared gross amount'), {
    target: { value: '1255.00' },
  });
  fireEvent.change(
    within(dialog).getByLabelText('Declared tax amount (optional)'),
    { target: { value: '0' } },
  );
  changeValue(within(dialog).getByLabelText('Currency'), 'MDL');
  fireEvent.click(
    within(dialog).getByRole('checkbox', {
      name: /I declare that this exact source/,
    }),
  );
}

describe('Clarté Finance › Invoices', () => {
  it('EX-194 EX-195: lists Invoice Records and records an Invoice beside its exact source PDF', async () => {
    const http = invoiceServer(() => invoiceWithSource());
    renderFinance('invoice-records', deterministicBrowserIdentity());
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Finance' }),
    ).toBeInTheDocument();
    const inventory = await screen.findByRole('region', {
      name: 'Transcribed invoices',
    });
    const row = within(inventory)
      .getByRole('button', { name: /^SYN-INV-001/ })
      .closest('tr');
    if (!row) throw new Error('Expected the Invoice row.');
    expect(row).toHaveTextContent('Fictional party Ș Я é <script>');
    expect(row).toHaveTextContent('Fictional Contract №17 · Version 2');
    expect(row).toHaveTextContent('1,255.00 MDL');
    expect(row).toHaveTextContent('Recorded PRISMA entry');
    expect(
      within(inventory).queryByRole('columnheader', { name: 'Issue date' }),
    ).not.toBeInTheDocument();
    expect(
      within(inventory).getByRole('columnheader', {
        name: 'Declared due date (optional)',
      }),
    ).toBeInTheDocument();
    expect(row).not.toHaveTextContent(invoiceValues.issuedOn);

    fireEvent.click(
      within(inventory).getByRole('button', {
        name: 'Record an external invoice',
      }),
    );
    const dialog = panel('Record an external invoice');
    await waitFor(() =>
      expect(
        within(dialog).getByLabelText('Choose an authorized exact source'),
      ).toBeEnabled(),
    );
    chooseInvoiceSource(dialog);
    const beside = within(dialog).getByRole('region', {
      name: 'PDF beside the form',
    });
    expect(beside).toHaveTextContent('fictional-original.pdf');
    const frame = await pdfBeside(beside, 'fictional-original.pdf');
    expect(frame.getAttribute('data')?.split('#')[0]).toBe(
      'blob:fictional-exact-source',
    );
    expect(
      http.reads(
        `/api/documents/${invoiceIds.document}/versions/${invoiceIds.version}/content/${invoiceIds.representation}`,
      ),
    ).toHaveLength(1);

    transcribe(dialog);
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Save Invoice Record' }),
    );
    const detail = await screen.findByRole('dialog', {
      name: 'Invoice Record',
    });
    expect(
      await within(detail).findByText(
        /The command is confirmed and durably recorded/,
      ),
    ).toBeInTheDocument();
    expect(http.posts().map((post) => post.body)).toEqual([
      JSON.stringify({
        source: exactInvoiceSource.source,
        values: invoiceValues,
        acknowledgeExternalDeclaration: true,
        replacesWithdrawnRecordId: null,
      }),
    ]);
  });

  it('EX-196 EX-198: corrects a transcription beside its source, reads the revision history and downloads the exact PDF', async () => {
    const reason = 'Gross amount misread from the PDF';
    let changed = false;
    const http = invoiceServer(() =>
      invoiceWithSource(changed ? corrected(reason) : invoiceCurrent),
    );
    renderFinance('invoice-records', deterministicBrowserIdentity());
    const dialog = await openInvoice();
    expect(
      within(dialog).getByRole('heading', {
        name: /Revision 1 · Entry created/,
      }),
    ).toBeInTheDocument();
    fireEvent.click(
      within(dialog).getByRole('button', {
        name: 'Download exact source PDF',
      }),
    );
    await waitFor(() =>
      expect(
        http.reads(`/api/invoice-records/${invoiceIds.record}/source`),
      ).toHaveLength(1),
    );
    const beside = within(dialog).getByRole('region', {
      name: 'PDF beside the form',
    });
    await showPdf(beside, 'fictional-original.pdf');

    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Correct transcription' }),
    );
    const form = within(dialog).getByRole('region', {
      name: 'Correct transcription',
    });
    // The exact PDF stays shown beside the correction form.
    expect(
      within(dialog).getByTitle('Exact source PDF fictional-original.pdf'),
    ).toBeInTheDocument();
    // An open form keeps the panel: Escape does not discard it.
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(form).toBeInTheDocument();
    fireEvent.change(within(form).getByLabelText('Declared gross amount'), {
      target: { value: '1255.50' },
    });
    fireEvent.change(within(form).getByLabelText('Literal reason'), {
      target: { value: reason },
    });
    changed = true;
    fireEvent.click(
      within(form).getByRole('button', {
        name: 'Save transcription correction',
      }),
    );
    expect(
      await within(dialog).findByRole('heading', {
        name: 'Revision 2 · Transcription corrected',
      }),
    ).toBeInTheDocument();
    const [post] = http.posts();
    expect(post?.path).toBe(
      `/api/invoice-records/${invoiceIds.record}/commands`,
    );
    expect(JSON.parse(String(post?.body))).toEqual({
      action: 'CORRECT',
      expectedRevision: 1,
      values: { ...invoiceValues, grossMinor: '125550' },
      reason,
    });
  });

  it('EX-197: removes an entry and creates its linked replacement beside a chosen source', async () => {
    const reason = 'Entered against the wrong Contract';
    let state: 'recorded' | 'withdrawn' = 'recorded';
    const http = invoiceServer(() =>
      state === 'withdrawn' ? withdrawn(reason) : invoiceWithSource(),
    );
    renderFinance('invoice-records', deterministicBrowserIdentity());
    const dialog = await openInvoice();
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Withdraw PRISMA entry' }),
    );
    fireEvent.change(within(dialog).getByLabelText('Literal reason'), {
      target: { value: reason },
    });
    state = 'withdrawn';
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Confirm entry withdrawal' }),
    );
    fireEvent.click(
      await within(dialog).findByRole('button', {
        name: 'Create an explicitly linked replacement',
      }),
    );
    await waitFor(() =>
      expect(
        within(dialog).getByLabelText('Choose an authorized exact source'),
      ).toBeEnabled(),
    );
    chooseInvoiceSource(dialog);
    await pdfBeside(
      within(dialog).getByRole('region', { name: 'PDF beside the form' }),
      'fictional-original.pdf',
    );
    transcribe(dialog);
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Save Invoice Record' }),
    );
    await waitFor(() => expect(http.posts()).toHaveLength(2));
    const [withdrawal, replacement] = http.posts();
    expect(JSON.parse(String(withdrawal?.body))).toEqual({
      action: 'WITHDRAW_ENTRY',
      expectedRevision: 1,
      reason,
    });
    expect(replacement?.path).toBe('/api/invoice-records');
    expect(JSON.parse(String(replacement?.body))).toMatchObject({
      source: exactInvoiceSource.source,
      replacesWithdrawnRecordId: invoiceIds.record,
    });
  });

  it('EX-199: opens the Client and the Contract an Invoice is copied from', async () => {
    invoiceServer(() => invoiceWithSource());
    renderFinance('invoice-records', deterministicBrowserIdentity());
    let dialog = await openInvoice();
    fireEvent.click(
      within(dialog).getByRole('button', {
        name: 'Open authorized Client: Fictional live Client',
      }),
    );
    await waitFor(() => expect(window.location.hash).toBe('#clients'));
    act(() => {
      window.history.pushState(null, '', '/#invoice-records');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    dialog = await openInvoice();
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Open authorized Contract' }),
    );
    await waitFor(() => expect(window.location.hash).toBe('#requests'));
  });

  it('shows the empty, error and no-permission states of the Invoice inventory', async () => {
    let reply: () => Response = () =>
      Response.json({ ...invoiceInventory, items: [] });
    installApp(invoiceActor, (call) =>
      call.path === '/api/invoice-records' ? reply() : undefined,
    );
    let view = renderFinance('invoice-records', deterministicBrowserIdentity());
    expect(await screen.findByText('No Invoice Records.')).toBeInTheDocument();
    view.unmount();
    reply = () => new Response(null, { status: 503 });
    view = renderFinance('invoice-records', deterministicBrowserIdentity());
    expect(
      await screen.findByText(
        'This information could not be read. Retry deliberately.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry read' })).toBeEnabled();
    view.unmount();
    reply = () => new Response(null, { status: 403 });
    renderFinance('invoice-records', deterministicBrowserIdentity());
    expect(
      await screen.findByText(
        'Access is unavailable. Protected work has been cleared.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Record an external invoice' }),
    ).not.toBeInTheDocument();
  });

  it('refuses to show a source PDF whose bytes differ from the declared fingerprint', async () => {
    installApp(invoiceActor, (call) => {
      if (call.path === '/api/invoice-records')
        return Response.json(invoiceInventory);
      if (call.path === `/api/invoice-records/${invoiceIds.record}`)
        return Response.json(invoiceWithSource());
      if (call.path === `/api/invoice-records/${invoiceIds.record}/source`)
        return new Response(
          new TextEncoder().encode('%PDF-1.4 fictional altered bytes'),
          { headers: { 'content-type': 'application/pdf' } },
        );
      return undefined;
    });
    renderFinance('invoice-records', deterministicBrowserIdentity());
    const dialog = await openInvoice();
    const beside = within(dialog).getByRole('region', {
      name: 'PDF beside the form',
    });
    fireEvent.click(
      within(beside).getByRole('button', { name: 'Show the PDF here' }),
    );
    expect(
      await within(beside).findByText(
        'The exact PDF could not be shown safely. Try again.',
      ),
    ).toBeInTheDocument();
    expect(within(beside).queryByTitle(/Exact source PDF/)).toBeNull();
    expect(
      within(beside).queryByRole('link', { name: 'Download verified PDF' }),
    ).not.toBeInTheDocument();
    expect(created).not.toHaveBeenCalled();
  });
});

// ------------------------------------------------- Collections and proofs
const payIds = {
  ...paymentEvidenceIds,
  payment: '10000000-0000-4000-8000-000000001047',
  replacement: '10000000-0000-4000-8000-000000001060',
  author: '10000000-0000-4000-8000-000000001046',
  command: '10000000-0000-4000-8000-000000001048',
  correction: '10000000-0000-4000-8000-000000001049',
  confirmation: '10000000-0000-4000-8000-000000001050',
  reversal: '10000000-0000-4000-8000-000000001051',
  representation: '10000000-0000-4000-8000-000000001052',
};
const paymentCapture = 'payment-observation-read.v1.' + 'c'.repeat(64);
const evidenceActor = paymentEvidenceActor();
const financeActor: ActorContext = {
  ...evidenceActor,
  activeCompany: {
    ...evidenceActor.activeCompany,
    paymentObservationReadCapture: paymentCapture,
    paymentObservationContextCapture:
      'payment-observation-context.v1.' + 'd'.repeat(64),
    grants: withCompanyGrants(
      evidenceActor.activeCompany.grants,
      {
        bundle: 'company_payment_confirmer',
        version: 'v1',
        assignmentId: '10000000-0000-4000-8000-000000001053',
      },
      {
        bundle: 'company_payment_reverser',
        version: 'v1',
        assignmentId: '10000000-0000-4000-8000-000000001054',
      },
    ),
  },
};
const paymentValues: PaymentValues = {
  amountMinor: '125500',
  currency: 'MDL',
  effectiveOn: '2026-01-15',
  method: 'Fictional bank transfer',
  externalReference: 'FICTIONAL-REF-7',
  observationBasis: 'Human-declared fictional transfer notice',
};
const author = { membershipId: payIds.author, displayName: 'Fictional author' };
const reviewer = {
  membershipId: payIds.membership,
  displayName: evidenceActor.displayName,
};
const firstRevision: PaymentRevision = {
  format: 'PAYMENT_REVISION/1',
  paymentId: payIds.payment,
  revision: 1,
  action: 'CREATE',
  commandId: payIds.command,
  actor: author,
  recordedAt: '2026-01-15T10:00:00.000Z',
  before: null,
  after: { state: 'DRAFT', values: paymentValues, confirmation: null },
  reason: null,
};
const draft: PaymentCurrent = {
  format: 'PAYMENT_OBSERVATION/1',
  companyId: payIds.company,
  readCapture: paymentCapture,
  payment: {
    id: payIds.payment,
    revision: 1,
    ...firstRevision.after,
    copiedContext: {
      companyLabel: 'Fictional receiving Company — conserved',
      payer: {
        kind: 'PRIMARY',
        legalName: 'Fictional conserved payer',
        taxId: null,
        legalAddress: null,
      },
    },
    createdAt: firstRevision.recordedAt,
    replacesClosedPaymentId: null,
    replacementPaymentId: null,
  },
  actor: author,
  recordedAt: firstRevision.recordedAt,
  capabilities: {
    canCorrect: true,
    canWithdraw: true,
    canConfirm: true,
    canReverse: false,
    canReplace: false,
  },
  liveSource: {
    kind: 'AVAILABLE',
    documentId: payIds.document,
    documentVersionId: payIds.version,
    title: 'Fictional notice',
    versionNumber: 1,
    versionState: 'superseded',
    content: {
      kind: 'AVAILABLE',
      representationId: payIds.representation,
      fileName: 'fictional-payment-notice.pdf',
      byteLength: pdfBytes.byteLength,
      sha256: pdfSha,
    },
  },
  client: {
    kind: 'AVAILABLE',
    clientId: payIds.client,
    displayName: 'Fictional live Client',
  },
  history: { items: [firstRevision], nextCursor: null },
};
const paymentSource: PaymentSelectable = {
  source: {
    documentId: payIds.document,
    documentVersionId: payIds.version,
    representationId: payIds.representation,
  },
  documentTitle: 'Fictional notice',
  versionNumber: 1,
  versionState: 'superseded',
  fileName: 'fictional-payment-notice.pdf',
  byteLength: pdfBytes.byteLength,
  sha256: pdfSha,
  copiedContext: draft.payment.copiedContext,
};
function revision(
  previous: PaymentCurrent,
  action: Exclude<PaymentAction, 'CREATE'>,
  after: PaymentRevision['after'],
  reason: string | null,
  capabilities: PaymentCurrent['capabilities'],
): PaymentCurrent {
  const fact: PaymentRevision = {
    ...firstRevision,
    revision: previous.payment.revision + 1,
    action,
    commandId:
      action === 'CONFIRM'
        ? payIds.confirmation
        : action === 'REVERSE'
          ? payIds.reversal
          : payIds.correction,
    actor: reviewer,
    recordedAt: `2026-01-15T1${previous.payment.revision}:30:00.000Z`,
    before: previous.history.items[0]?.after ?? null,
    after,
    reason,
  };
  return {
    ...previous,
    payment: { ...previous.payment, revision: fact.revision, ...after },
    actor: reviewer,
    recordedAt: fact.recordedAt,
    capabilities,
    history: { items: [fact, ...previous.history.items], nextCursor: null },
  };
}
const none = {
  canCorrect: false,
  canWithdraw: false,
  canConfirm: false,
  canReverse: false,
  canReplace: false,
};
function paymentReceipt(
  action: PaymentAction,
  current: PaymentCurrent,
  paymentId = payIds.payment,
): PaymentReceipt {
  return {
    format: 'PAYMENT_COMMAND/1',
    commandId: payIds.command,
    paymentId,
    revision: action === 'CREATE' ? 1 : current.payment.revision + 1,
    action,
    recordedAt: '2026-01-15T13:00:00.000Z',
  };
}
function paymentServer(options: {
  detail: () => PaymentCurrent;
  replacement?: PaymentCurrent;
  onCommand?: (action: PaymentAction) => void;
  documents?: () => unknown;
}) {
  return installApp(financeActor, (call) => {
    if (call.method === 'POST') {
      if (call.path === '/api/payments') {
        options.onCommand?.('CREATE');
        return Response.json(
          paymentReceipt(
            'CREATE',
            options.detail(),
            options.replacement ? payIds.replacement : payIds.payment,
          ),
          { status: 201 },
        );
      }
      if (call.path === `/api/payments/${payIds.payment}/commands`) {
        const body: unknown = JSON.parse(String(call.body));
        const action =
          typeof body === 'object' && body !== null && 'action' in body
            ? body.action
            : undefined;
        if (
          action !== 'CORRECT_DRAFT' &&
          action !== 'WITHDRAW_DRAFT' &&
          action !== 'CONFIRM' &&
          action !== 'REVERSE'
        )
          return undefined;
        const before = options.detail();
        options.onCommand?.(action);
        return Response.json(paymentReceipt(action, before), { status: 201 });
      }
      return undefined;
    }
    if (call.path === '/api/payments')
      return Response.json({
        format: 'PAYMENT_INVENTORY/1',
        companyId: payIds.company,
        readCapture: paymentCapture,
        items: [options.detail().payment],
        nextCursor: null,
      });
    if (call.path === '/api/payments/sources')
      return Response.json({
        format: 'PAYMENT_SOURCE_PAGE/1',
        companyId: payIds.company,
        readCapture: paymentCapture,
        items: [paymentSource],
        nextCursor: null,
      });
    if (call.path === `/api/payments/${payIds.payment}`)
      return Response.json(options.detail());
    if (
      options.replacement &&
      call.path === `/api/payments/${payIds.replacement}`
    )
      return Response.json(options.replacement);
    if (call.path === `/api/payments/${payIds.payment}/source`) return pdf();
    if (
      call.path ===
      `/api/documents/${payIds.document}/versions/${payIds.version}/content/${payIds.representation}`
    )
      return pdf();
    if (call.path === '/api/documents')
      return Response.json(
        options.documents?.() ?? [paymentEvidenceDocument()],
      );
    if (call.path === '/api/clients')
      return Response.json([
        {
          id: payIds.client,
          displayName: 'Fictional original Client',
          relatedToActiveCompany: true,
        },
      ]);
    if (call.path === `/api/clients/${payIds.client}`)
      return Response.json({
        id: payIds.client,
        displayName: 'Fictional original Client',
        taxId: null,
        address: null,
        version: 1,
        relatedToActiveCompany: true,
      });
    if (call.path === `/api/clients/${payIds.client}/legal-entities`)
      return Response.json({ clientVersion: 1, legalEntities: [] });
    if (call.path === `/api/documents/${payIds.document}`)
      return Response.json(paymentEvidenceDocument());
    if (call.path === `/api/documents/${payIds.document}/correction-history`)
      return Response.json({ corrections: [], nextBeforeRevision: null });
    if (call.path === `/api/documents/${payIds.document}/versions`)
      return Response.json({
        workingRevision: 1,
        mutable: true,
        versions: [
          {
            id: payIds.version,
            number: 1,
            status: 'draft',
            createdAt: '2026-01-15T09:00:00.000Z',
            createdBy: { displayName: evidenceActor.displayName },
            representations: [],
            pdfContent: { state: 'absent' },
          },
        ],
      });
    return undefined;
  });
}
async function openPayment() {
  fireEvent.click(
    await screen.findByRole('button', {
      name: 'Fictional bank transfer · Jan 15',
    }),
  );
  const dialog = await screen.findByRole('dialog', { name: '1,255.00 MDL' });
  await within(dialog).findByRole('heading', { name: 'Immutable history' });
  return dialog;
}

describe('Clarté Finance › Collections', () => {
  it('EX-187 EX-188: lists manual observations and records one beside its exact source', async () => {
    const http = paymentServer({ detail: () => draft });
    renderFinance('payments', deterministicBrowserIdentity());
    const views = await screen.findByRole('navigation', {
      name: 'Finance views',
    });
    expect(
      within(views).getByRole('link', { name: 'Collections' }),
    ).toHaveAttribute('aria-current', 'page');
    expect(
      within(views)
        .getAllByRole('link')
        .map((link) => link.textContent),
    ).toEqual(['Collections', 'Proofs']);
    expect(
      screen.getByText('Allocation is not tracked by this capability.'),
    ).toBeInTheDocument();
    const inventory = await screen.findByRole('region', {
      name: 'Payment observations',
    });
    const row = (
      await within(inventory).findByRole('button', {
        name: 'Fictional bank transfer · Jan 15',
      })
    ).closest('tr');
    expect(row).toHaveTextContent('Fictional conserved payer');
    expect(row).toHaveTextContent('1,255.00 MDL');
    expect(row).toHaveTextContent('Draft observation');
    expect(row).toHaveTextContent('FICTIONAL-REF-7');
    expect(
      within(inventory).queryByRole('button', { name: 'Reload and review' }),
    ).not.toBeInTheDocument();

    fireEvent.click(
      within(inventory).getByRole('button', {
        name: 'New manual observation',
      }),
    );
    const dialog = panel('New manual observation');
    fireEvent.click(
      await within(dialog).findByRole('button', {
        name: 'Select an authorized exact source 1',
      }),
    );
    const beside = within(dialog).getByRole('region', {
      name: 'PDF beside the form',
    });
    const frame = await pdfBeside(beside, 'fictional-payment-notice.pdf');
    const sourceLink = within(beside).getByRole('link', {
      name: 'Download verified PDF',
    });
    expect(frame.getAttribute('data')?.split('#')[0]).toBe(
      sourceLink.getAttribute('href'),
    );
    expect(sourceLink).toHaveAttribute(
      'download',
      'fictional-payment-notice.pdf',
    );
    expect(
      http.reads(
        `/api/documents/${payIds.document}/versions/${payIds.version}/content/${payIds.representation}`,
      ),
    ).toHaveLength(1);
    fireEvent.change(within(dialog).getByLabelText('Declared amount'), {
      target: { value: '1255.00' },
    });
    changeValue(within(dialog).getByLabelText('Currency'), 'MDL');
    fireEvent.change(within(dialog).getByLabelText('Declared effective date'), {
      target: { value: paymentValues.effectiveOn },
    });
    fireEvent.change(within(dialog).getByLabelText('Declared payment method'), {
      target: { value: paymentValues.method },
    });
    fireEvent.change(
      within(dialog).getByLabelText('External reference (optional)'),
      { target: { value: paymentValues.externalReference } },
    );
    fireEvent.change(within(dialog).getByLabelText('What was observed'), {
      target: { value: paymentValues.observationBasis },
    });
    fireEvent.click(
      within(dialog).getByRole('checkbox', {
        name: /I declare one manually observed incoming Payment/,
      }),
    );
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Record observation' }),
    );
    const detail = await screen.findByRole('dialog', { name: '1,255.00 MDL' });
    expect(detail).toHaveTextContent('Draft observation · Revision 1');
    // The recording command closed itself: the observation's own commands show.
    expect(
      await within(detail).findByRole('button', { name: 'Correct draft' }),
    ).toBeInTheDocument();
    expect(
      within(detail).queryByRole('region', { name: 'Record observation' }),
    ).not.toBeInTheDocument();
    expect(JSON.parse(String(http.posts()[0]?.body))).toEqual({
      source: paymentSource.source,
      values: paymentValues,
      acknowledgeObservedDeclaration: true,
      replacesClosedPaymentId: null,
    });
  });

  it('EX-189 EX-190: corrects a draft and confirms it after review beside the exact source', async () => {
    const reason = 'Reference misread';
    const note = 'Reviewed against the exact notice';
    let current = draft;
    const http = paymentServer({
      detail: () => current,
      onCommand: (action) => {
        current =
          action === 'CORRECT_DRAFT'
            ? revision(
                current,
                'CORRECT_DRAFT',
                {
                  state: 'DRAFT',
                  values: { ...paymentValues, amountMinor: '125550' },
                  confirmation: null,
                },
                reason,
                draft.capabilities,
              )
            : revision(
                current,
                'CONFIRM',
                {
                  state: 'CONFIRMED',
                  values: { ...paymentValues, amountMinor: '125550' },
                  confirmation: {
                    actor: reviewer,
                    recordedAt: '2026-01-15T12:30:00.000Z',
                    note,
                  },
                },
                null,
                { ...none, canReverse: true },
              );
      },
    });
    renderFinance('payments', deterministicBrowserIdentity());
    let dialog = await openPayment();
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Correct draft' }),
    );
    const correction = within(dialog).getByRole('region', {
      name: 'Correct draft',
    });
    await pdfBeside(
      within(dialog).getByRole('region', { name: 'PDF beside the form' }),
      'fictional-payment-notice.pdf',
    );
    fireEvent.change(within(correction).getByLabelText('Declared amount'), {
      target: { value: '1255.50' },
    });
    fireEvent.change(within(correction).getByLabelText('Literal reason'), {
      target: { value: reason },
    });
    fireEvent.click(
      within(correction).getByRole('button', { name: 'Correct draft' }),
    );
    dialog = await screen.findByRole('dialog', { name: '1,255.50 MDL' });
    await within(dialog).findByText('Draft observation · Revision 2', {
      exact: false,
    });
    fireEvent.click(
      within(dialog).getByRole('button', {
        name: 'Confirm reviewed observation',
      }),
    );
    const review = within(dialog).getByRole('region', {
      name: 'Confirm reviewed observation',
    });
    expect(
      within(dialog).getByRole('region', { name: 'PDF beside the form' }),
    ).toBeInTheDocument();
    fireEvent.change(within(review).getByLabelText('Literal review note'), {
      target: { value: note },
    });
    fireEvent.click(
      within(review).getByRole('checkbox', {
        name: /I reviewed this exact displayed revision/,
      }),
    );
    fireEvent.click(
      within(review).getByRole('button', {
        name: 'Confirm reviewed observation',
      }),
    );
    await waitFor(() =>
      expect(
        screen.getByRole('dialog', { name: '1,255.50 MDL' }),
      ).toHaveTextContent('Human-confirmed observation · Revision 3'),
    );
    expect(
      http.posts().map((post) => JSON.parse(String(post.body)).action),
    ).toEqual(['CORRECT_DRAFT', 'CONFIRM']);
  });

  it('recovers a conflicting new observation through a deliberate reload of the exact sources', async () => {
    let sourceReads = 0;
    const http = installApp(financeActor, (call) => {
      if (call.method === 'POST' && call.path === '/api/payments')
        return Response.json({ code: 'STALE_SOURCE' }, { status: 409 });
      if (call.path === '/api/payments')
        return Response.json({
          format: 'PAYMENT_INVENTORY/1',
          companyId: payIds.company,
          readCapture: paymentCapture,
          items: [],
          nextCursor: null,
        });
      if (call.path === '/api/payments/sources') {
        sourceReads += 1;
        return Response.json({
          format: 'PAYMENT_SOURCE_PAGE/1',
          companyId: payIds.company,
          readCapture: paymentCapture,
          items: [paymentSource],
          nextCursor: null,
        });
      }
      if (
        call.path ===
        `/api/documents/${payIds.document}/versions/${payIds.version}/content/${payIds.representation}`
      )
        return pdf();
      return undefined;
    });
    renderFinance('payments', deterministicBrowserIdentity());
    fireEvent.click(
      await screen.findByRole('button', { name: 'New manual observation' }),
    );
    const dialog = panel('New manual observation');
    fireEvent.click(
      await within(dialog).findByRole('button', {
        name: 'Select an authorized exact source 1',
      }),
    );
    fireEvent.change(within(dialog).getByLabelText('Declared amount'), {
      target: { value: '1255.00' },
    });
    changeValue(within(dialog).getByLabelText('Currency'), 'MDL');
    fireEvent.change(within(dialog).getByLabelText('Declared effective date'), {
      target: { value: paymentValues.effectiveOn },
    });
    fireEvent.change(within(dialog).getByLabelText('Declared payment method'), {
      target: { value: paymentValues.method },
    });
    fireEvent.change(within(dialog).getByLabelText('What was observed'), {
      target: { value: paymentValues.observationBasis },
    });
    fireEvent.click(
      within(dialog).getByRole('checkbox', {
        name: /I declare one manually observed incoming Payment/,
      }),
    );
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Record observation' }),
    );
    expect(
      await within(dialog).findByText(
        'The command conflicts with current data. Deliberately reload and review before starting a new command.',
      ),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(
        screen.getByRole('combobox', { name: 'Active Company' }),
      ).toBeDisabled(),
    );
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Reload and review' }),
    );
    // The fresh exact sources release the conflict and offer a new choice.
    expect(
      await within(dialog).findByRole('button', {
        name: 'Select an authorized exact source 1',
      }),
    ).toBeEnabled();
    await waitFor(() =>
      expect(
        within(dialog).queryByRole('region', { name: 'Record observation' }),
      ).not.toBeInTheDocument(),
    );
    expect(
      screen.getByRole('combobox', { name: 'Active Company' }),
    ).toBeEnabled();
    expect(sourceReads).toBe(2);
    expect(http.posts()).toHaveLength(1);
  });

  it('EX-189: withdraws a draft observation', async () => {
    const reason = 'Recorded twice by mistake';
    let current = draft;
    const http = paymentServer({
      detail: () => current,
      onCommand: () => {
        current = revision(
          current,
          'WITHDRAW_DRAFT',
          { state: 'WITHDRAWN', values: paymentValues, confirmation: null },
          reason,
          { ...none, canReplace: true },
        );
      },
    });
    renderFinance('payments', deterministicBrowserIdentity());
    const dialog = await openPayment();
    fireEvent.click(
      within(dialog).getByRole('button', {
        name: 'Withdraw draft observation',
      }),
    );
    const form = within(dialog).getByRole('region', {
      name: 'Withdraw draft observation',
    });
    fireEvent.change(within(form).getByLabelText('Literal reason'), {
      target: { value: reason },
    });
    fireEvent.click(
      within(form).getByRole('button', { name: 'Withdraw draft observation' }),
    );
    await waitFor(() =>
      expect(
        screen.getByRole('dialog', { name: '1,255.00 MDL' }),
      ).toHaveTextContent('Withdrawn draft observation · Revision 2'),
    );
    expect(JSON.parse(String(http.posts()[0]?.body))).toMatchObject({
      action: 'WITHDRAW_DRAFT',
      reason,
    });
  });

  it('EX-191 EX-192: reverses a confirmed observation and creates its linked corrected replacement', async () => {
    const reason = 'Transfer rejected by the bank';
    const confirmedDraft = revision(
      draft,
      'CONFIRM',
      {
        state: 'CONFIRMED',
        values: paymentValues,
        confirmation: {
          actor: reviewer,
          recordedAt: '2026-01-15T11:30:00.000Z',
          note: 'Fictional review',
        },
      },
      null,
      { ...none, canReverse: true },
    );
    let current = confirmedDraft;
    const replacement: PaymentCurrent = {
      ...draft,
      payment: {
        ...draft.payment,
        id: payIds.replacement,
        replacesClosedPaymentId: payIds.payment,
      },
      history: {
        items: [{ ...firstRevision, paymentId: payIds.replacement }],
        nextCursor: null,
      },
    };
    const http = paymentServer({
      detail: () => current,
      replacement,
      onCommand: (action) => {
        if (action === 'REVERSE')
          current = revision(
            current,
            'REVERSE',
            {
              state: 'REVERSED',
              values: paymentValues,
              confirmation: {
                actor: reviewer,
                recordedAt: '2026-01-15T11:30:00.000Z',
                note: 'Fictional review',
              },
            },
            reason,
            { ...none, canReplace: true },
          );
      },
    });
    renderFinance('payments', deterministicBrowserIdentity());
    const dialog = await openPayment();
    fireEvent.click(
      within(dialog).getByRole('button', {
        name: 'Reverse recorded observation',
      }),
    );
    const form = within(dialog).getByRole('region', {
      name: 'Reverse recorded observation',
    });
    fireEvent.change(within(form).getByLabelText('Literal reason'), {
      target: { value: reason },
    });
    fireEvent.click(
      within(form).getByRole('button', {
        name: 'Reverse recorded observation',
      }),
    );
    fireEvent.click(
      await within(dialog).findByRole('button', {
        name: 'Create a linked corrected replacement',
      }),
    );
    fireEvent.click(
      await within(dialog).findByRole('button', {
        name: 'Select an authorized exact source 1',
      }),
    );
    await pdfBeside(
      within(dialog).getByRole('region', { name: 'PDF beside the form' }),
      'fictional-payment-notice.pdf',
    );
    fireEvent.change(within(dialog).getByLabelText('Declared amount'), {
      target: { value: '1255.00' },
    });
    changeValue(within(dialog).getByLabelText('Currency'), 'MDL');
    fireEvent.change(within(dialog).getByLabelText('Declared effective date'), {
      target: { value: paymentValues.effectiveOn },
    });
    fireEvent.change(within(dialog).getByLabelText('Declared payment method'), {
      target: { value: paymentValues.method },
    });
    fireEvent.change(within(dialog).getByLabelText('What was observed'), {
      target: { value: paymentValues.observationBasis },
    });
    fireEvent.click(
      within(dialog).getByRole('checkbox', {
        name: /I declare one manually observed incoming Payment/,
      }),
    );
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Record observation' }),
    );
    await waitFor(() =>
      expect(
        screen.getByRole('dialog', { name: '1,255.00 MDL' }),
      ).toHaveTextContent(
        'This observation explicitly replaces a closed observation.',
      ),
    );
    expect(
      within(dialog).queryByRole('region', { name: 'Record observation' }),
    ).not.toBeInTheDocument();
    const [reversal, created] = http.posts();
    expect(JSON.parse(String(reversal?.body))).toMatchObject({
      action: 'REVERSE',
      reason,
    });
    expect(JSON.parse(String(created?.body))).toMatchObject({
      replacesClosedPaymentId: payIds.payment,
    });
  });

  it('EX-193 EX-200: reads the immutable history, downloads the exact source PDF and opens the Client and the payment proof', async () => {
    const http = paymentServer({ detail: () => draft });
    renderFinance('payments', deterministicBrowserIdentity());
    let dialog = await openPayment();
    expect(
      within(dialog).getByRole('heading', {
        name: 'Revision 1 · Manual observation recorded',
      }),
    ).toBeInTheDocument();
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Download exact source PDF' }),
    );
    await waitFor(() =>
      expect(http.reads(`/api/payments/${payIds.payment}/source`)).toHaveLength(
        1,
      ),
    );
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Fictional live Client' }),
    );
    await waitFor(() => expect(window.location.hash).toBe('#clients'));
    act(() => {
      window.history.pushState(null, '', '/#payments');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    dialog = await openPayment();
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Exact preserved source' }),
    );
    await waitFor(() => expect(window.location.hash).toBe('#payment-proofs'));
    const proof = await screen.findByRole('dialog', {
      name: 'Fictional notice',
    });
    expect(
      await within(proof).findByRole('button', { name: 'Version 1' }),
    ).toBeInTheDocument();
  });

  it('holds navigation and the Company change while a payment command is pending', async () => {
    let release: ((response: Response) => void) | undefined;
    installApp(financeActor, (call) => {
      if (call.method === 'POST')
        return new Promise<Response>((resolve) => {
          release = resolve;
        });
      if (call.path === '/api/payments')
        return Response.json({
          format: 'PAYMENT_INVENTORY/1',
          companyId: payIds.company,
          readCapture: paymentCapture,
          items: [draft.payment],
          nextCursor: null,
        });
      if (call.path === `/api/payments/${payIds.payment}`)
        return Response.json(draft);
      return undefined;
    });
    renderFinance('payments', deterministicBrowserIdentity());
    const dialog = await openPayment();
    fireEvent.click(
      within(dialog).getByRole('button', {
        name: 'Withdraw draft observation',
      }),
    );
    fireEvent.change(within(dialog).getByLabelText('Literal reason'), {
      target: { value: 'Held reason' },
    });
    fireEvent.click(
      within(
        within(dialog).getByRole('region', {
          name: 'Withdraw draft observation',
        }),
      ).getByRole('button', { name: 'Withdraw draft observation' }),
    );
    await within(dialog).findByText('Recording…');
    await waitFor(() =>
      expect(
        screen.getByRole('combobox', { name: 'Active Company' }),
      ).toBeDisabled(),
    );
    fireEvent.click(
      within(
        screen.getByRole('navigation', { name: 'Primary navigation' }),
      ).getByRole('link', { name: 'Clients' }),
    );
    expect(window.location.hash).toBe('#payments');
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(dialog).toBeInTheDocument();
    await act(async () => release?.(new Response(null, { status: 503 })));
  });

  it('shows the empty, error and no-permission states of the observations', async () => {
    let reply: () => Response = () =>
      Response.json({
        format: 'PAYMENT_INVENTORY/1',
        companyId: payIds.company,
        readCapture: paymentCapture,
        items: [],
        nextCursor: null,
      });
    installApp(financeActor, (call) =>
      call.path === '/api/payments' ? reply() : undefined,
    );
    let view = renderFinance('payments', deterministicBrowserIdentity());
    expect(
      await screen.findByText('No manual Payment observations.'),
    ).toBeInTheDocument();
    view.unmount();
    reply = () => new Response(null, { status: 503 });
    view = renderFinance('payments', deterministicBrowserIdentity());
    expect(
      await screen.findByText(
        'The requested information could not be safely read. Retry deliberately.',
      ),
    ).toBeInTheDocument();
    reply = () =>
      Response.json({
        format: 'PAYMENT_INVENTORY/1',
        companyId: payIds.company,
        readCapture: paymentCapture,
        items: [],
        nextCursor: null,
      });
    fireEvent.click(screen.getByRole('button', { name: 'Reload and review' }));
    expect(
      await screen.findByText('No manual Payment observations.'),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Reload and review' }),
    ).not.toBeInTheDocument();
    view.unmount();
    reply = () => new Response(null, { status: 403 });
    renderFinance('payments', deterministicBrowserIdentity());
    expect(
      await screen.findByText('Unavailable with current access.'),
    ).toBeInTheDocument();
  });
});

describe('Clarté Finance › Payment proofs', () => {
  it('EX-180 EX-181 EX-182: reads the proof inventory and details, corrects draft metadata and manages its Versions and PDF', async () => {
    const http = paymentServer({ detail: () => draft });
    renderFinance('payment-proofs', deterministicBrowserIdentity());
    const inventory = await screen.findByRole('region', {
      name: 'Preserved payment proofs',
    });
    const row = (
      await within(inventory).findByRole('button', { name: 'Fictional notice' })
    ).closest('tr');
    expect(row).toHaveTextContent('Fictional manual notice');
    expect(row).toHaveTextContent('Fictional original Client');
    fireEvent.click(
      within(inventory).getByRole('button', { name: 'Fictional notice' }),
    );
    const dialog = await screen.findByRole('dialog', {
      name: 'Fictional notice',
    });
    // The panel title and the native detail heading name the same proof.
    expect(
      await within(dialog).findAllByRole('heading', {
        name: 'Fictional notice',
      }),
    ).toHaveLength(2);
    expect(
      await within(dialog).findByRole('button', { name: 'Version 1' }),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByLabelText('Choose the PDF file'),
    ).toBeInTheDocument();
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Correct draft metadata' }),
    );
    fireEvent.change(within(dialog).getByLabelText('Title'), {
      target: { value: 'Corrected fictional notice' },
    });
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Save metadata correction' }),
    );
    await waitFor(() =>
      expect(http.posts()[0]).toMatchObject({
        method: 'PATCH',
        path: `/api/documents/${payIds.document}`,
      }),
    );
  });

  it('EX-179: registers a payment proof with its declared source', async () => {
    const http = paymentServer({ detail: () => draft, documents: () => [] });
    renderFinance('payment-proofs', deterministicBrowserIdentity());
    const inventory = await screen.findByRole('region', {
      name: 'Preserved payment proofs',
    });
    expect(
      await within(inventory).findByText('No payment evidence is available.'),
    ).toBeInTheDocument();
    fireEvent.click(
      within(inventory).getByRole('button', {
        name: 'Register payment evidence',
      }),
    );
    const dialog = panel('Register payment evidence');
    const form = within(dialog).getByRole('form', {
      name: 'Register payment evidence',
    });
    const client = within(form).getByLabelText('Original Client');
    await waitFor(() => expect(client).not.toBeDisabled());
    changeValue(client, payIds.client);
    const payer = within(form).getByLabelText('Exact payer');
    await waitFor(() => expect(payer).not.toBeDisabled());
    changeValue(payer, 'PRIMARY');
    fireEvent.change(within(form).getByLabelText('Title'), {
      target: { value: 'Fictional transfer notice' },
    });
    fireEvent.change(within(form).getByLabelText('Purpose'), {
      target: { value: 'Preserve original source' },
    });
    fireEvent.change(within(form).getByLabelText('Declared source'), {
      target: { value: 'Fictional bank notice' },
    });
    fireEvent.click(
      within(form).getByRole('button', { name: 'Preserve evidence source' }),
    );
    await waitFor(() => expect(http.posts()).toHaveLength(1));
    expect(http.posts()[0]).toMatchObject({
      method: 'POST',
      path: '/api/documents',
    });
  });

  it('shows the error and no-permission states of the proof inventory', async () => {
    let reply = () => new Response(null, { status: 503 });
    installApp(financeActor, (call) =>
      call.path === '/api/documents' ? reply() : undefined,
    );
    const view = renderFinance(
      'payment-proofs',
      deterministicBrowserIdentity(),
    );
    expect(
      await screen.findByText('Payment evidence could not be loaded or saved.'),
    ).toBeInTheDocument();
    view.unmount();
    reply = () => new Response(null, { status: 403 });
    renderFinance('payment-proofs', deterministicBrowserIdentity());
    expect(
      await screen.findByText(
        'Payment evidence is unavailable with your current access.',
      ),
    ).toBeInTheDocument();
  });
});
