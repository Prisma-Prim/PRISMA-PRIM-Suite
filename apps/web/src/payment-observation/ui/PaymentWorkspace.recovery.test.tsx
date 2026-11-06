import { Blob as NodeBlob } from 'node:buffer';
import { webcrypto } from 'node:crypto';
import { afterEach, expect, it, vi } from 'vitest';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '../../test/render-with-interface-locale';
import { changeValue } from '../../test/select-option';
import {
  deterministicBrowserIdentity,
  type BrowserIdentity,
} from '../../access-composition';
import type { ActorContext } from '../../access-types';
import {
  paymentEvidenceActor,
  paymentEvidenceIds,
} from '../../payment-evidence/payment-evidence.test-fixture';
import { ApplicationPresentation } from '../../production-shell/application-presentation';
import { SectionVisibility } from '../../production-shell/section-visibility';
import { useInterfaceLocale } from '../../localization/interface-locale';
import { PaymentWorkspace } from '../PaymentWorkspace';
import type {
  PaymentAction,
  PaymentCurrent,
  PaymentInventory,
  PaymentReceipt,
  PaymentRevision,
  PaymentSelectable,
  PaymentValues,
} from '../payment.types';
import { paymentCopy, type PaymentLocale } from './payment-copy';

const ids = {
  ...paymentEvidenceIds,
  payment: '10000000-0000-4000-8000-000000001047',
  author: '10000000-0000-4000-8000-000000001046',
  command: '10000000-0000-4000-8000-000000001048',
  correction: '10000000-0000-4000-8000-000000001049',
  confirmation: '10000000-0000-4000-8000-000000001050',
  reversal: '10000000-0000-4000-8000-000000001051',
  representation: '10000000-0000-4000-8000-000000001052',
};
const capture = 'payment-observation-read.v1.' + 'c'.repeat(64);
const nativeActor = paymentEvidenceActor();
const company = {
  ...nativeActor.activeCompany,
  paymentObservationReadCapture: capture,
  paymentObservationContextCapture:
    'payment-observation-context.v1.' + 'd'.repeat(64),
  paymentGrants: [
    ...nativeActor.activeCompany.paymentGrants,
    {
      bundle: 'company_payment_confirmer',
      assignmentId: '10000000-0000-4000-8000-000000001053',
      permissionSetVersion: 'v1',
    },
    {
      bundle: 'company_payment_reverser',
      assignmentId: '10000000-0000-4000-8000-000000001054',
      permissionSetVersion: 'v1',
    },
  ],
} satisfies NonNullable<ActorContext['activeCompany']>;
// These are intercepted, server-authorized UI representations using the delivered
// native capture shapes. Native enrollment and human-author exclusion are proved
// by the issue's separate PostgreSQL REST owner, not by this component fixture.
const actor: ActorContext = { ...nativeActor, activeCompany: company };
const browserIdentity = deterministicBrowserIdentity();
const values: PaymentValues = {
  amountMinor: '125500',
  currency: 'MDL',
  effectiveOn: '2026-01-15',
  method: '  Fictional manual notice  ',
  externalReference: null,
  observationBasis: '  Human-declared fictional observation Ș Я é  ',
};
const author = {
  membershipId: ids.author,
  displayName: 'Fictional earlier author',
};
const reviewer = {
  membershipId: ids.membership,
  displayName: nativeActor.displayName,
};
const first: PaymentRevision = {
  format: 'PAYMENT_REVISION/1',
  paymentId: ids.payment,
  revision: 1,
  action: 'CREATE',
  commandId: ids.command,
  actor: author,
  recordedAt: '2026-01-15T10:00:00.000Z',
  before: null,
  after: { state: 'DRAFT', values, confirmation: null },
  reason: null,
};
const initial: PaymentCurrent = {
  format: 'PAYMENT_OBSERVATION/1',
  companyId: ids.company,
  readCapture: capture,
  payment: {
    id: ids.payment,
    revision: 1,
    ...first.after,
    copiedContext: {
      companyLabel: 'Fictional receiving Company — conserved',
      payer: {
        kind: 'PRIMARY',
        legalName: 'Fictional conserved payer Ș Я é',
        taxId: null,
        legalAddress: null,
      },
    },
    createdAt: first.recordedAt,
    replacesClosedPaymentId: null,
    replacementPaymentId: null,
  },
  actor: first.actor,
  recordedAt: first.recordedAt,
  capabilities: {
    canCorrect: true,
    canWithdraw: true,
    canConfirm: true,
    canReverse: false,
    canReplace: false,
  },
  liveSource: {
    kind: 'AVAILABLE',
    documentId: ids.document,
    documentVersionId: ids.version,
    title: 'Fictional exact original source',
    versionNumber: 1,
    versionState: 'superseded',
    content: {
      kind: 'AVAILABLE',
      representationId: ids.representation,
      fileName: 'fictional-payment-notice.pdf',
      byteLength: 1047,
      sha256: 'a'.repeat(64),
    },
  },
  client: {
    kind: 'AVAILABLE',
    clientId: ids.client,
    displayName: 'Fictional live Client',
  },
  history: { items: [first], nextCursor: null },
};
const source: PaymentSelectable = {
  source: {
    documentId: ids.document,
    documentVersionId: ids.version,
    representationId: ids.representation,
  },
  documentTitle: 'Fictional exact original source',
  versionNumber: 1,
  versionState: 'superseded',
  fileName: 'fictional-payment-notice.pdf',
  byteLength: 1047,
  sha256: 'a'.repeat(64),
  copiedContext: initial.payment.copiedContext,
};
const preservedConfirmation = {
  actor: reviewer,
  recordedAt: '2026-01-15T11:00:00.000Z',
  note: 'Independent fictional review',
};
function confirmed(note = preservedConfirmation.note): PaymentCurrent {
  const confirmation = { ...preservedConfirmation, note };
  const fact: PaymentRevision = {
    ...first,
    revision: 2,
    action: 'CONFIRM',
    commandId: ids.confirmation,
    actor: reviewer,
    recordedAt: confirmation.recordedAt,
    before: first.after,
    after: { state: 'CONFIRMED', values, confirmation },
  };
  return {
    ...initial,
    payment: { ...initial.payment, revision: 2, ...fact.after },
    actor: fact.actor,
    recordedAt: fact.recordedAt,
    capabilities: {
      canCorrect: false,
      canWithdraw: false,
      canConfirm: false,
      canReverse: true,
      canReplace: false,
    },
    history: { items: [fact, first], nextCursor: null },
  };
}
function changed(
  action: 'CORRECT_DRAFT' | 'WITHDRAW_DRAFT' | 'REVERSE',
  reason: string,
  amountMinor = '125550',
): PaymentCurrent {
  const previous = action === 'REVERSE' ? confirmed() : initial;
  const before = previous.history.items[0]?.after;
  if (!before)
    throw new Error('A lawful preceding fixture revision is required.');
  const fact: PaymentRevision = {
    ...first,
    revision: action === 'REVERSE' ? 3 : 2,
    action,
    commandId: action === 'REVERSE' ? ids.reversal : ids.correction,
    actor: reviewer,
    recordedAt: '2026-01-15T12:00:00.000Z',
    before,
    after:
      action === 'CORRECT_DRAFT'
        ? {
            state: 'DRAFT',
            values: { ...values, amountMinor },
            confirmation: null,
          }
        : action === 'WITHDRAW_DRAFT'
          ? { state: 'WITHDRAWN', values, confirmation: null }
          : {
              state: 'REVERSED',
              values,
              confirmation: preservedConfirmation,
            },
    reason,
  };
  return {
    ...initial,
    payment: { ...initial.payment, revision: fact.revision, ...fact.after },
    actor: fact.actor,
    recordedAt: fact.recordedAt,
    capabilities: {
      canCorrect: action === 'CORRECT_DRAFT',
      canWithdraw: action === 'CORRECT_DRAFT',
      canConfirm: action === 'CORRECT_DRAFT',
      canReverse: false,
      canReplace: action !== 'CORRECT_DRAFT',
    },
    history: { items: [fact, ...previous.history.items], nextCursor: null },
  };
}
function receipt(action: PaymentAction): PaymentReceipt {
  return {
    format: 'PAYMENT_COMMAND/1',
    commandId:
      action === 'CREATE'
        ? ids.command
        : action === 'CONFIRM'
          ? ids.confirmation
          : action === 'REVERSE'
            ? ids.reversal
            : ids.correction,
    paymentId: ids.payment,
    revision: action === 'CREATE' ? 1 : action === 'REVERSE' ? 3 : 2,
    action,
    recordedAt:
      action === 'CREATE'
        ? first.recordedAt
        : action === 'CONFIRM'
          ? '2026-01-15T11:00:00.000Z'
          : '2026-01-15T12:00:00.000Z',
  };
}
type Posted = { path: string; body: string; key: string | null };
function installTransport(options: {
  detail?: () => Response | Promise<Response>;
  post: (posted: Posted, attempt: number) => Response | Promise<Response>;
  initialDetail?: PaymentCurrent;
  empty?: boolean;
}) {
  const posts: Posted[] = [],
    reads: string[] = [];
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    const parsed = new URL(url, 'http://localhost'),
      path = parsed.pathname;
    if (init?.method === 'POST') {
      if (typeof init.body !== 'string')
        throw new Error('Expected a serialized Payment command.');
      const posted = {
        path,
        body: init.body,
        key: new Headers(init.headers).get('idempotency-key'),
      };
      posts.push(posted);
      return options.post(posted, posts.length);
    }
    reads.push(path + parsed.search);
    if (path === '/api/payments') {
      const inventory: PaymentInventory = {
        format: 'PAYMENT_INVENTORY/1',
        companyId: ids.company,
        readCapture: capture,
        items: options.empty
          ? []
          : [(options.initialDetail ?? initial).payment],
        nextCursor: null,
      };
      return Response.json(inventory);
    }
    if (path === '/api/payments/sources')
      return Response.json({
        format: 'PAYMENT_SOURCE_PAGE/1',
        companyId: ids.company,
        readCapture: capture,
        items: [source],
        nextCursor: null,
      });
    if (path === `/api/payments/${ids.payment}`)
      return (
        options.detail?.() ?? Response.json(options.initialDetail ?? initial)
      );
    return new Response(null, { status: 404 });
  });
  return { posts, reads };
}
function callbacks() {
  return {
    onProtectedWorkChange: vi.fn(),
    onCompanyContextRejected: vi.fn(),
    onActorRevalidated: vi.fn(),
    onWorkspaceAccessRejected: vi.fn(),
  };
}
function LocaleControl() {
  const { changeLocale } = useInterfaceLocale();
  const locales: PaymentLocale[] = ['ro', 'ru', 'fr', 'en'];
  return (
    <>
      {locales.map((locale) => (
        <button key={locale} type="button" onClick={() => changeLocale(locale)}>
          Change locale {locale}
        </button>
      ))}
    </>
  );
}
function view(options: {
  callbacks: ReturnType<typeof callbacks>;
  actor?: ActorContext;
  identity?: BrowserIdentity;
  frame?: 'classic' | 'prisme';
  projection?: string;
  navigation?: Pick<
    Parameters<typeof PaymentWorkspace>[0],
    'onOpenClient' | 'onOpenDocument'
  >;
}) {
  const frame = options.frame ?? 'prisme';
  return (
    <>
      <ApplicationPresentation value={frame}>
        <SectionVisibility value={true}>
          <div
            className={frame === 'prisme' ? 'prisme-shell' : 'classic-shell'}
          >
            <PaymentWorkspace
              actor={options.actor ?? actor}
              identity={options.identity ?? browserIdentity}
              projectionAuthority={options.projection ?? 'native-captures-1'}
              {...options.callbacks}
              {...options.navigation}
            />
          </div>
        </SectionVisibility>
      </ApplicationPresentation>
      <LocaleControl />
    </>
  );
}
async function open(detail = initial) {
  fireEvent.click(
    await screen.findByRole('button', {
      name: `${paymentCopy.en.values} · ${paymentCopy.en.revision} ${detail.payment.revision}`,
    }),
  );
  await screen.findByRole('heading', { name: paymentCopy.en.history });
}
function commandPanel(action: Exclude<PaymentAction, 'CREATE'>) {
  return screen.getByRole('region', {
    name:
      action === 'CORRECT_DRAFT'
        ? paymentCopy.en.correct
        : action === 'WITHDRAW_DRAFT'
          ? paymentCopy.en.withdraw
          : action === 'CONFIRM'
            ? paymentCopy.en.confirm
            : paymentCopy.en.reverse,
  });
}
function begin(action: Exclude<PaymentAction, 'CREATE'>, literal: string) {
  const label =
    action === 'CORRECT_DRAFT'
      ? paymentCopy.en.correct
      : action === 'WITHDRAW_DRAFT'
        ? paymentCopy.en.withdraw
        : action === 'CONFIRM'
          ? paymentCopy.en.confirm
          : paymentCopy.en.reverse;
  fireEvent.click(screen.getByRole('button', { name: label }));
  const panel = commandPanel(action);
  if (action === 'CORRECT_DRAFT')
    fireEvent.change(within(panel).getByLabelText(paymentCopy.en.amount), {
      target: { value: '1255.50' },
    });
  fireEvent.change(
    within(panel).getByLabelText(
      action === 'CONFIRM'
        ? paymentCopy.en.confirmationNote
        : paymentCopy.en.reason,
    ),
    { target: { value: literal } },
  );
  if (action === 'CONFIRM')
    fireEvent.click(
      within(panel).getByRole('checkbox', {
        name: paymentCopy.en.acknowledgeReviewed,
      }),
    );
  return panel;
}
function submit(panel: HTMLElement, action: Exclude<PaymentAction, 'CREATE'>) {
  fireEvent.click(
    within(panel).getByRole('button', {
      name:
        action === 'CORRECT_DRAFT'
          ? paymentCopy.en.correct
          : action === 'WITHDRAW_DRAFT'
            ? paymentCopy.en.withdraw
            : action === 'CONFIRM'
              ? paymentCopy.en.confirm
              : paymentCopy.en.reverse,
    }),
  );
}
function heldToken() {
  let holdNext = false,
    started = false,
    finished = false;
  let release: ((value: string) => void) | undefined;
  const identity: BrowserIdentity = {
    ...browserIdentity,
    requestHeaders: undefined,
    getToken: async () => {
      if (!holdNext) return 'current-fictional-token';
      holdNext = false;
      started = true;
      const token = await new Promise<string>((resolve) => {
        release = resolve;
      });
      finished = true;
      return token;
    },
  };
  return {
    identity,
    hold: () => {
      holdNext = true;
      started = false;
      finished = false;
      release = undefined;
    },
    started: () => started,
    finished: () => finished,
    release: () => {
      if (!release) throw new Error('No held token acquisition.');
      release('released-fictional-token');
    },
  };
}
function replaceRecorder(): ActorContext {
  return {
    ...actor,
    activeCompany: {
      ...company,
      paymentGrants: company.paymentGrants.map((grant) =>
        grant.bundle === 'company_payment_recorder'
          ? { ...grant, assignmentId: '10000000-0000-4000-8000-000000001099' }
          : grant,
      ),
    },
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
  sessionStorage.clear();
});

it('keeps the exact correction body and one key through uncertain and malformed-success retries', async () => {
  const literal = '  Correct literal amount Ș Я é  ';
  const transport = installTransport({
    post: (_posted, attempt) =>
      attempt === 1
        ? new Response(null, { status: 503 })
        : attempt === 2
          ? Response.json(
              { ...receipt('CORRECT_DRAFT'), unknownExtra: true },
              { status: 201 },
            )
          : Response.json(receipt('CORRECT_DRAFT'), { status: 201 }),
    detail: () =>
      Response.json(
        transport.posts.length >= 3
          ? changed('CORRECT_DRAFT', literal)
          : initial,
      ),
  });
  const observed = callbacks();
  render(view({ callbacks: observed }));
  await open();
  const panel = begin('CORRECT_DRAFT', literal);
  submit(panel, 'CORRECT_DRAFT');
  await screen.findByText(paymentCopy.en.uncertain);
  expect(within(panel).getByLabelText(paymentCopy.en.reason)).toBeDisabled();
  expect(
    screen.getByRole('button', { name: paymentCopy.en.back }),
  ).toBeDisabled();
  expect(
    screen.getByRole('button', { name: paymentCopy.en.newObservation }),
  ).toBeDisabled();
  expect(
    screen.getByRole('button', { name: paymentCopy.en.reload }),
  ).toBeDisabled();
  expect(observed.onProtectedWorkChange).toHaveBeenLastCalledWith(true);
  fireEvent.click(
    screen.getByRole('button', { name: paymentCopy.en.retrySame }),
  );
  await waitFor(() => expect(transport.posts).toHaveLength(2));
  await screen.findByRole('button', { name: paymentCopy.en.retrySame });
  expect(transport.reads).toEqual([
    '/api/payments',
    `/api/payments/${ids.payment}`,
  ]);
  fireEvent.click(
    screen.getByRole('button', { name: paymentCopy.en.retrySame }),
  );
  await screen.findByRole('heading', {
    name: 'Revision 2 · Draft values corrected',
  });
  expect(transport.posts).toHaveLength(3);
  const firstPost = transport.posts[0];
  expect(firstPost?.key).toMatch(/^[0-9a-f-]{36}$/u);
  expect(firstPost?.body).toBe(
    JSON.stringify({
      action: 'CORRECT_DRAFT',
      expectedRevision: 1,
      values: { ...values, amountMinor: '125550' },
      reason: literal,
    }),
  );
  expect(transport.posts[1]).toEqual(firstPost);
  expect(transport.posts[2]).toEqual(firstPost);
});

it('keeps a CREATE exact source, literal values, acknowledgement and explicit null predecessor for an unchanged retry', async () => {
  const created: PaymentCurrent = {
    ...initial,
    actor: reviewer,
    history: { items: [{ ...first, actor: reviewer }], nextCursor: null },
  };
  const transport = installTransport({
    empty: true,
    initialDetail: created,
    post: (_posted, attempt) =>
      attempt === 1
        ? new Response(null, { status: 503 })
        : Response.json(receipt('CREATE'), { status: 201 }),
  });
  render(view({ callbacks: callbacks() }));
  await screen.findByText(paymentCopy.en.empty);
  fireEvent.click(
    screen.getByRole('button', { name: paymentCopy.en.newObservation }),
  );
  fireEvent.click(
    await screen.findByRole('button', {
      name: `${paymentCopy.en.selectSource} 1`,
    }),
  );
  const panel = screen.getByRole('region', { name: paymentCopy.en.create });
  for (const [label, value] of [
    [paymentCopy.en.amount, '1255.00'],
    [paymentCopy.en.currency, 'MDL'],
    [paymentCopy.en.effectiveOn, values.effectiveOn],
    [paymentCopy.en.method, values.method],
    [paymentCopy.en.observationBasis, values.observationBasis],
  ]) {
    if (!label || value === undefined)
      throw new Error('Incomplete CREATE fixture.');
    changeValue(within(panel).getByLabelText(label), value);
  }
  fireEvent.click(
    within(panel).getByRole('checkbox', {
      name: paymentCopy.en.acknowledgeObserved,
    }),
  );
  fireEvent.click(
    within(panel).getByRole('button', { name: paymentCopy.en.create }),
  );
  await screen.findByText(paymentCopy.en.uncertain);
  expect(within(panel).getByLabelText(paymentCopy.en.amount)).toBeDisabled();
  fireEvent.click(
    screen.getByRole('button', { name: paymentCopy.en.retrySame }),
  );
  await screen.findByRole('heading', { name: paymentCopy.en.history });
  expect(transport.posts).toHaveLength(2);
  expect(transport.posts[0]?.body).toBe(
    JSON.stringify({
      source: source.source,
      values,
      acknowledgeObservedDeclaration: true,
      replacesClosedPaymentId: null,
    }),
  );
  expect(transport.posts[1]).toEqual(transport.posts[0]);
  expect(
    transport.reads.filter((path) => path === '/api/payments/sources'),
  ).toHaveLength(1);
});

it.each(['source A → B → A', 'equal-permission Recorder replacement'])(
  'permanently retires a pending correction token under %s',
  async (replacement) => {
    const oldReason = 'Old capture correction',
      freshReason = 'Fresh deliberate correction';
    const token = heldToken();
    const transport = installTransport({
      post: () => Response.json(receipt('CORRECT_DRAFT'), { status: 201 }),
      detail: () =>
        Response.json(
          transport.posts.length
            ? changed('CORRECT_DRAFT', freshReason)
            : initial,
        ),
    });
    const observed = callbacks();
    const rendered = render(
      view({ callbacks: observed, identity: token.identity }),
    );
    await open();
    const panel = begin('CORRECT_DRAFT', oldReason);
    token.hold();
    submit(panel, 'CORRECT_DRAFT');
    await waitFor(() => expect(token.started()).toBe(true));
    const next =
      replacement === 'source A → B → A'
        ? {
            ...actor,
            activeCompany: {
              ...company,
              documentContentReaderAssignmentId:
                '10000000-0000-4000-8000-000000001098',
            },
          }
        : replaceRecorder();
    rendered.rerender(
      view({ callbacks: observed, identity: token.identity, actor: next }),
    );
    if (replacement === 'source A → B → A')
      rendered.rerender(
        view({ callbacks: observed, identity: token.identity, actor }),
      );
    expect(screen.queryByDisplayValue(oldReason)).not.toBeInTheDocument();
    await act(async () => {
      token.release();
    });
    await waitFor(() => expect(token.finished()).toBe(true));
    expect(transport.posts).toHaveLength(0);
    const freshPanel = begin('CORRECT_DRAFT', freshReason);
    submit(freshPanel, 'CORRECT_DRAFT');
    await screen.findByRole('heading', {
      name: 'Revision 2 · Draft values corrected',
    });
    expect(transport.posts).toHaveLength(1);
    expect(transport.posts[0]?.body).toBe(
      JSON.stringify({
        action: 'CORRECT_DRAFT',
        expectedRevision: 1,
        values: { ...values, amountMinor: '125550' },
        reason: freshReason,
      }),
    );
  },
);

it('preserves an invalid literal draft through unrelated Actor, locale and frame changes without duplicate reads', async () => {
  const transport = installTransport({
    post: () => {
      throw new Error('Invalid draft must not reach HTTP.');
    },
  });
  const observed = callbacks();
  const rendered = render(view({ callbacks: observed }));
  await open();
  const panel = begin('CORRECT_DRAFT', '  Retained literal reason Ș Я é  ');
  fireEvent.change(within(panel).getByLabelText(paymentCopy.en.amount), {
    target: { value: '1255.500' },
  });
  fireEvent.change(within(panel).getByLabelText(paymentCopy.en.method), {
    target: { value: '  Unchanged method  ' },
  });
  submit(panel, 'CORRECT_DRAFT');
  await screen.findByText(paymentCopy.en.invalid);
  const newer = { ...actor, displayName: 'Unrelated new Actor label' };
  rendered.rerender(
    view({ callbacks: observed, actor: newer, frame: 'classic' }),
  );
  const locales: PaymentLocale[] = ['ro', 'ru', 'fr', 'en'];
  for (const locale of locales) {
    fireEvent.click(
      screen.getByRole('button', { name: `Change locale ${locale}` }),
    );
    const input = screen.getByLabelText(paymentCopy[locale].amount);
    expect(input).toHaveValue('1255.500');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText(paymentCopy[locale].method)).toHaveValue(
      '  Unchanged method  ',
    );
    expect(screen.getByLabelText(paymentCopy[locale].reason)).toHaveValue(
      '  Retained literal reason Ș Я é  ',
    );
    const describedBy = input.getAttribute('aria-describedby');
    expect(
      describedBy
        ?.split(' ')
        .some(
          (id) =>
            document.getElementById(id)?.textContent ===
            paymentCopy[locale].invalid,
        ),
    ).toBe(true);
  }
  rendered.rerender(
    view({ callbacks: observed, actor: newer, frame: 'prisme' }),
  );
  expect(screen.getByLabelText(paymentCopy.en.amount)).toHaveValue('1255.500');
  expect(transport.reads).toEqual([
    '/api/payments',
    `/api/payments/${ids.payment}`,
  ]);
  expect(transport.posts).toHaveLength(0);
});

it.each(['CONFIRM', 'REVERSE'] satisfies Exclude<
  PaymentAction,
  'CREATE' | 'CORRECT_DRAFT' | 'WITHDRAW_DRAFT'
>[])(
  'keeps an independently permitted %s token alive when only Recorder is replaced',
  async (action) => {
    const literal =
      action === 'CONFIRM'
        ? 'Independent exact review'
        : 'Independent exact reversal';
    const before = action === 'CONFIRM' ? initial : confirmed();
    const token = heldToken();
    const transport = installTransport({
      initialDetail: before,
      post: () => Response.json(receipt(action), { status: 201 }),
      detail: () =>
        Response.json(
          transport.posts.length
            ? action === 'CONFIRM'
              ? confirmed(literal)
              : changed('REVERSE', literal)
            : before,
        ),
    });
    const observed = callbacks();
    const rendered = render(
      view({ callbacks: observed, identity: token.identity }),
    );
    await open(before);
    const panel = begin(action, literal);
    token.hold();
    submit(panel, action);
    await waitFor(() => expect(token.started()).toBe(true));
    rendered.rerender(
      view({
        callbacks: observed,
        identity: token.identity,
        actor: replaceRecorder(),
      }),
    );
    expect(
      screen.getByLabelText(
        action === 'CONFIRM'
          ? paymentCopy.en.confirmationNote
          : paymentCopy.en.reason,
      ),
    ).toHaveValue(literal);
    expect(
      screen.getByRole('button', { name: paymentCopy.en.back }),
    ).toBeDisabled();
    await act(async () => {
      token.release();
    });
    await waitFor(() => expect(transport.posts).toHaveLength(1));
    await screen.findByRole('heading', {
      name:
        action === 'CONFIRM'
          ? 'Revision 2 · Human review confirmed'
          : 'Revision 3 · Recorded observation reversed',
    });
    expect(transport.posts[0]?.body).toBe(
      action === 'CONFIRM'
        ? JSON.stringify({
            action: 'CONFIRM',
            expectedRevision: 1,
            acknowledgeReviewedObservation: true,
            confirmationNote: literal,
          })
        : JSON.stringify({
            action: 'REVERSE',
            expectedRevision: 2,
            reason: literal,
          }),
    );
    expect(screen.getAllByText('1255.00 MDL').length).toBeGreaterThan(0);
  },
);

it.each([
  { action: 'WITHDRAW_DRAFT', loss: 'original Client' },
  { action: 'WITHDRAW_DRAFT', loss: 'evidence family' },
  { action: 'REVERSE', loss: 'native Document' },
  { action: 'REVERSE', loss: 'native content' },
] satisfies { action: 'WITHDRAW_DRAFT' | 'REVERSE'; loss: string }[])(
  'retains copied facts and the owned $action draft after losing $loss access',
  async ({ action, loss }) => {
    const literal = `  Source-free ${action} after ${loss} loss  `;
    const before = action === 'REVERSE' ? confirmed() : initial;
    const after = {
      ...changed(action, literal),
      liveSource: { kind: 'UNAVAILABLE' },
      client: { kind: 'UNAVAILABLE' },
    } satisfies PaymentCurrent;
    const transport = installTransport({
      initialDetail: before,
      post: () => Response.json(receipt(action), { status: 201 }),
      detail: () => Response.json(transport.posts.length ? after : before),
    });
    const observed = callbacks();
    const rendered = render(view({ callbacks: observed }));
    await open(before);
    const panel = begin(action, literal);
    const lost: ActorContext = {
      ...actor,
      workspacePermissions:
        loss === 'original Client' ? [] : actor.workspacePermissions,
      activeCompany: {
        ...company,
        clientPermissions:
          loss === 'original Client' ? [] : company.clientPermissions,
        paymentGrants:
          loss === 'evidence family'
            ? company.paymentGrants.filter(
                (grant) => grant.bundle !== 'company_payment_evidence_access',
              )
            : company.paymentGrants,
        documentPermissions: company.documentPermissions.filter((permission) =>
          loss === 'native Document'
            ? permission !== 'document.read'
            : loss === 'native content'
              ? permission !== 'document.content.read'
              : true,
        ),
      },
    };
    rendered.rerender(
      view({
        callbacks: observed,
        actor: lost,
        projection: 'native-source-lost',
      }),
    );
    expect(screen.getByLabelText(paymentCopy.en.reason)).toHaveValue(literal);
    expect(
      screen.getAllByText(initial.payment.copiedContext.payer.legalName).length,
    ).toBeGreaterThan(0);
    expect(screen.getAllByText('1255.00 MDL').length).toBeGreaterThan(0);
    expect(
      screen.getByRole('heading', { name: paymentCopy.en.history }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: paymentCopy.en.download }),
    ).not.toBeInTheDocument();
    expect(transport.reads).toEqual([
      '/api/payments',
      `/api/payments/${ids.payment}`,
    ]);
    submit(panel, action);
    await screen.findByRole('heading', {
      name:
        action === 'REVERSE'
          ? 'Revision 3 · Recorded observation reversed'
          : 'Revision 2 · Draft observation withdrawn',
    });
    expect(transport.posts).toHaveLength(1);
    expect(transport.posts[0]?.body).toBe(
      JSON.stringify({
        action,
        expectedRevision: action === 'REVERSE' ? 2 : 1,
        reason: literal,
      }),
    );
    expect(
      transport.reads.some(
        (path) =>
          path.includes('/sources') ||
          path.includes('/documents') ||
          path.includes('/clients'),
      ),
    ).toBe(false);
    if (action === 'REVERSE')
      expect(
        screen.getAllByText('Independent fictional review').length,
      ).toBeGreaterThan(0);
  },
);

it('requires a successful deliberate reload begun after conflict, including when the head revision is unchanged', async () => {
  let detailReads = 0;
  let releaseOlderRead: ((response: Response) => void) | undefined;
  const oldReason = 'Conflicting literal correction',
    freshReason = 'New deliberate correction after review';
  const transport = installTransport({
    post: (_posted, attempt) =>
      attempt === 1
        ? Response.json({ code: 'PAYMENT_NO_CHANGE' }, { status: 409 })
        : Response.json(receipt('CORRECT_DRAFT'), { status: 201 }),
    detail: () => {
      detailReads += 1;
      if (detailReads === 2)
        return new Promise<Response>((resolve) => {
          releaseOlderRead = resolve;
        });
      if (detailReads === 3) return new Response(null, { status: 503 });
      return Response.json(
        transport.posts.length > 1
          ? changed('CORRECT_DRAFT', freshReason, '125551')
          : initial,
      );
    },
  });
  render(view({ callbacks: callbacks() }));
  await open();
  const panel = begin('CORRECT_DRAFT', oldReason);
  // This deliberate read begins before the command's eventual conflict.
  fireEvent.click(screen.getByRole('button', { name: paymentCopy.en.reload }));
  await waitFor(() => expect(releaseOlderRead).toBeTypeOf('function'));
  submit(panel, 'CORRECT_DRAFT');
  await screen.findByText(paymentCopy.en.conflict);
  await act(async () => {
    releaseOlderRead?.(Response.json(initial));
  });
  expect(
    within(panel).queryByRole('button', { name: paymentCopy.en.correct }),
  ).not.toBeInTheDocument();
  expect(screen.getByText(paymentCopy.en.conflict)).toBeInTheDocument();
  expect(transport.posts).toHaveLength(1);
  fireEvent.click(
    within(panel).getByRole('button', { name: paymentCopy.en.reload }),
  );
  await screen.findByText(paymentCopy.en.error);
  expect(screen.getByText(paymentCopy.en.conflict)).toBeInTheDocument();
  expect(within(panel).getByLabelText(paymentCopy.en.reason)).toHaveValue(
    oldReason,
  );
  expect(transport.posts).toHaveLength(1);
  fireEvent.click(
    within(panel).getByRole('button', { name: paymentCopy.en.reload }),
  );
  await within(panel).findByRole('button', { name: paymentCopy.en.correct });
  expect(within(panel).getByLabelText(paymentCopy.en.reason)).toHaveValue('');
  expect(within(panel).getByLabelText(paymentCopy.en.amount)).toHaveValue(
    '1255.00',
  );
  expect(transport.posts).toHaveLength(1);
  fireEvent.change(within(panel).getByLabelText(paymentCopy.en.amount), {
    target: { value: '1255.51' },
  });
  fireEvent.change(within(panel).getByLabelText(paymentCopy.en.reason), {
    target: { value: freshReason },
  });
  submit(panel, 'CORRECT_DRAFT');
  await screen.findByRole('heading', {
    name: 'Revision 2 · Draft values corrected',
  });
  expect(transport.posts).toHaveLength(2);
  expect(transport.posts[1]?.key).not.toBe(transport.posts[0]?.key);
  expect(transport.posts[1]?.body).toBe(
    JSON.stringify({
      action: 'CORRECT_DRAFT',
      expectedRevision: 1,
      values: { ...values, amountMinor: '125551' },
      reason: freshReason,
    }),
  );
});

it('preserves a confirmed receipt after refresh failure and retries only the detail read', async () => {
  let detailReads = 0;
  const literal = 'Confirmed correction with failed refresh';
  const transport = installTransport({
    post: () => Response.json(receipt('CORRECT_DRAFT'), { status: 201 }),
    detail: () => {
      detailReads += 1;
      return detailReads === 2
        ? new Response(null, { status: 503 })
        : Response.json(
            detailReads > 2 ? changed('CORRECT_DRAFT', literal) : initial,
          );
    },
  });
  const observed = callbacks();
  render(view({ callbacks: observed }));
  await open();
  const panel = begin('CORRECT_DRAFT', literal);
  submit(panel, 'CORRECT_DRAFT');
  await screen.findByText(paymentCopy.en.refreshFailed);
  expect(screen.getByText(paymentCopy.en.saved)).toBeInTheDocument();
  expect(
    within(panel).queryByRole('button', { name: paymentCopy.en.correct }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: paymentCopy.en.retrySame }),
  ).not.toBeInTheDocument();
  expect(
    screen.getByRole('button', { name: paymentCopy.en.newObservation }),
  ).toBeDisabled();
  expect(transport.posts).toHaveLength(1);
  expect(observed.onProtectedWorkChange).toHaveBeenLastCalledWith(true);
  fireEvent.click(
    screen.getByRole('button', { name: paymentCopy.en.retryRead }),
  );
  await screen.findByRole('heading', {
    name: 'Revision 2 · Draft values corrected',
  });
  expect(transport.posts).toHaveLength(1);
  expect(transport.reads).toEqual([
    '/api/payments',
    `/api/payments/${ids.payment}`,
    `/api/payments/${ids.payment}`,
    `/api/payments/${ids.payment}`,
  ]);
});

it('keeps a pending CONFIRM token and its successful receipt when only the copied Reader capture is replaced', async () => {
  const literal = '  Review owned by the unchanged Confirmer capture  ';
  const token = heldToken();
  const observed = callbacks();
  const posts: Posted[] = [];
  const replacementCapture = 'payment-observation-read.v1.' + 'd'.repeat(64);
  const replacement: ActorContext = {
    ...actor,
    activeCompany: {
      ...company,
      paymentObservationReadCapture: replacementCapture,
      paymentGrants: company.paymentGrants.map((grant) =>
        grant.bundle === 'company_payment_reader'
          ? { ...grant, assignmentId: '10000000-0000-4000-8000-000000001095' }
          : grant,
      ),
    },
  };
  let currentCapture = capture;
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    const path = new URL(url, 'http://localhost').pathname;
    if (init?.method === 'POST') {
      if (typeof init.body !== 'string')
        throw new Error('Expected the held serialized CONFIRM command.');
      posts.push({
        path,
        body: init.body,
        key: new Headers(init.headers).get('idempotency-key'),
      });
      return Response.json(receipt('CONFIRM'), { status: 201 });
    }
    if (path === '/api/payments')
      return Response.json({
        format: 'PAYMENT_INVENTORY/1',
        companyId: ids.company,
        readCapture: currentCapture,
        items: [posts.length ? confirmed(literal).payment : initial.payment],
        nextCursor: null,
      } satisfies PaymentInventory);
    if (path === `/api/payments/${ids.payment}`)
      return Response.json({
        ...(posts.length ? confirmed(literal) : initial),
        readCapture: currentCapture,
      });
    return new Response(null, { status: 404 });
  });
  const rendered = render(
    view({ callbacks: observed, identity: token.identity }),
  );
  await open();
  const panel = begin('CONFIRM', literal);
  token.hold();
  submit(panel, 'CONFIRM');
  await waitFor(() => expect(token.started()).toBe(true));
  // Confirmer, Recorder, Reverser, family, Client, Document and content captures
  // remain byte-for-byte equal. Only the preferred copied Reader is renewed.
  currentCapture = replacementCapture;
  rendered.rerender(
    view({ callbacks: observed, identity: token.identity, actor: replacement }),
  );
  expect(screen.getByLabelText(paymentCopy.en.confirmationNote)).toHaveValue(
    literal,
  );
  expect(screen.getByLabelText(paymentCopy.en.confirmationNote)).toBeDisabled();
  expect(observed.onProtectedWorkChange).toHaveBeenLastCalledWith(true);
  expect(posts).toHaveLength(0);
  await act(async () => {
    token.release();
  });
  await waitFor(() => expect(token.finished()).toBe(true));
  await screen.findByRole('heading', {
    name: 'Revision 2 · Human review confirmed',
  });
  expect(posts).toHaveLength(1);
  expect(posts[0]?.path).toBe(`/api/payments/${ids.payment}/commands`);
  expect(posts[0]?.key).toMatch(/^[0-9a-f-]{36}$/u);
  expect(posts[0]?.body).toBe(
    JSON.stringify({
      action: 'CONFIRM',
      expectedRevision: 1,
      acknowledgeReviewedObservation: true,
      confirmationNote: literal,
    }),
  );
  expect(
    screen.queryByText(paymentCopy.en.refreshFailed),
  ).not.toBeInTheDocument();
  const notes = screen.getAllByText(literal.trim());
  expect(notes.length).toBeGreaterThan(0);
  for (const note of notes) expect(note.textContent).toBe(literal);
});

it('keeps an uncertain REVERSE intention and identical key through Reader replacement and a held retry response', async () => {
  const literal = '  Reversal owned by the unchanged Reverser capture  ';
  const observed = callbacks();
  const posts: Posted[] = [];
  const replacementCapture = 'payment-observation-read.v1.' + 'd'.repeat(64);
  const nextCapture = 'payment-observation-read.v1.' + 'e'.repeat(64);
  const replaceReader = (
    assignmentId: string,
    readCapture: string,
  ): ActorContext => ({
    ...actor,
    activeCompany: {
      ...company,
      paymentObservationReadCapture: readCapture,
      paymentGrants: company.paymentGrants.map((grant) =>
        grant.bundle === 'company_payment_reader'
          ? { ...grant, assignmentId }
          : grant,
      ),
    },
  });
  let currentCapture = capture;
  let committed = false;
  let releaseRetry: ((response: Response) => void) | undefined;
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    const path = new URL(url, 'http://localhost').pathname;
    if (init?.method === 'POST') {
      if (typeof init.body !== 'string')
        throw new Error('Expected the conserved serialized REVERSE command.');
      posts.push({
        path,
        body: init.body,
        key: new Headers(init.headers).get('idempotency-key'),
      });
      if (posts.length === 1) return new Response(null, { status: 503 });
      return new Promise<Response>((resolve) => {
        releaseRetry = (response) => {
          committed = true;
          resolve(response);
        };
      });
    }
    if (path === '/api/payments')
      return Response.json({
        format: 'PAYMENT_INVENTORY/1',
        companyId: ids.company,
        readCapture: currentCapture,
        items: [
          committed ? changed('REVERSE', literal).payment : confirmed().payment,
        ],
        nextCursor: null,
      } satisfies PaymentInventory);
    if (path === `/api/payments/${ids.payment}`)
      return Response.json({
        ...(committed ? changed('REVERSE', literal) : confirmed()),
        readCapture: currentCapture,
      });
    return new Response(null, { status: 404 });
  });
  const rendered = render(view({ callbacks: observed }));
  await open(confirmed());
  const panel = begin('REVERSE', literal);
  submit(panel, 'REVERSE');
  await screen.findByText(paymentCopy.en.uncertain);
  expect(posts).toHaveLength(1);
  const original = posts[0];
  expect(original?.body).toBe(
    JSON.stringify({ action: 'REVERSE', expectedRevision: 2, reason: literal }),
  );
  expect(original?.key).toMatch(/^[0-9a-f-]{36}$/u);
  currentCapture = replacementCapture;
  rendered.rerender(
    view({
      callbacks: observed,
      actor: replaceReader(
        '10000000-0000-4000-8000-000000001095',
        replacementCapture,
      ),
    }),
  );
  expect(screen.getByText(paymentCopy.en.uncertain)).toBeInTheDocument();
  expect(screen.getByLabelText(paymentCopy.en.reason)).toHaveValue(literal);
  expect(screen.getByLabelText(paymentCopy.en.reason)).toBeDisabled();
  expect(observed.onProtectedWorkChange).toHaveBeenLastCalledWith(true);
  expect(posts).toHaveLength(1);
  fireEvent.click(
    screen.getByRole('button', { name: paymentCopy.en.retrySame }),
  );
  await waitFor(() => expect(releaseRetry).toBeTypeOf('function'));
  expect(posts).toHaveLength(2);
  expect(posts[1]).toEqual(original);
  // Renew only Reader again while the exact retry response is held. Neither
  // the Reverser nor any native Source capture changes during either renewal.
  currentCapture = nextCapture;
  rendered.rerender(
    view({
      callbacks: observed,
      actor: replaceReader('10000000-0000-4000-8000-000000001096', nextCapture),
    }),
  );
  expect(screen.getByLabelText(paymentCopy.en.reason)).toHaveValue(literal);
  expect(observed.onProtectedWorkChange).toHaveBeenLastCalledWith(true);
  await act(async () => {
    if (!releaseRetry)
      throw new Error('The identical retry response was not held.');
    releaseRetry(Response.json(receipt('REVERSE'), { status: 201 }));
  });
  await screen.findByRole('heading', {
    name: 'Revision 3 · Recorded observation reversed',
  });
  expect(posts).toHaveLength(2);
  expect(posts[1]).toEqual(original);
  expect(
    screen.queryByText(paymentCopy.en.refreshFailed),
  ).not.toBeInTheDocument();
  expect(
    screen.getAllByText('Independent fictional review').length,
  ).toBeGreaterThan(0);
});

it.each(['WITHDRAW_DRAFT', 'REVERSE'] satisfies (
  'WITHDRAW_DRAFT' | 'REVERSE'
)[])(
  'permanently retires a pending %s token across Company context A → B → A without affecting a new command',
  async (action) => {
    const oldReason = `  Retired Company-context ${action} intention  `;
    const freshReason = `  New deliberate Company-context ${action} intention  `;
    const before = action === 'REVERSE' ? confirmed() : initial;
    const label =
      action === 'REVERSE' ? paymentCopy.en.reverse : paymentCopy.en.withdraw;
    const token = heldToken();
    const observed = callbacks();
    const posts: Posted[] = [];
    const replacementReadCapture =
      'payment-observation-read.v1.' + 'f'.repeat(64);
    const replacement: ActorContext = {
      ...actor,
      activeCompany: {
        ...company,
        paymentObservationContextCapture:
          'payment-observation-context.v1.' + 'e'.repeat(64),
        paymentObservationReadCapture: replacementReadCapture,
      },
    };
    let currentReadCapture = capture;
    let committed = false;
    vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
      const path = new URL(url, 'http://localhost').pathname;
      if (init?.method === 'POST') {
        if (typeof init.body !== 'string')
          throw new Error('Expected an explicitly submitted Payment command.');
        posts.push({
          path,
          body: init.body,
          key: new Headers(init.headers).get('idempotency-key'),
        });
        committed = true;
        return Response.json(receipt(action), { status: 201 });
      }
      const detail = committed ? changed(action, freshReason) : before;
      if (path === '/api/payments')
        return Response.json({
          format: 'PAYMENT_INVENTORY/1',
          companyId: ids.company,
          readCapture: currentReadCapture,
          items: [detail.payment],
          nextCursor: null,
        } satisfies PaymentInventory);
      if (path === `/api/payments/${ids.payment}`)
        return Response.json({ ...detail, readCapture: currentReadCapture });
      return new Response(null, { status: 404 });
    });
    const rendered = render(
      view({ callbacks: observed, identity: token.identity }),
    );
    await open(before);
    const oldPanel = begin(action, oldReason);
    token.hold();
    submit(oldPanel, action);
    await waitFor(() => expect(token.started()).toBe(true));
    expect(observed.onProtectedWorkChange).toHaveBeenLastCalledWith(true);
    // The selected Company admission changes, while the Reader and all action
    // and native Source captures remain identical. Returning to A cannot revive
    // the token acquisition belonging to its previous consumed generation.
    currentReadCapture = replacementReadCapture;
    rendered.rerender(
      view({
        callbacks: observed,
        identity: token.identity,
        actor: replacement,
      }),
    );
    await waitFor(() =>
      expect(screen.queryByDisplayValue(oldReason)).not.toBeInTheDocument(),
    );
    currentReadCapture = capture;
    rendered.rerender(
      view({ callbacks: observed, identity: token.identity, actor }),
    );
    expect(screen.queryByDisplayValue(oldReason)).not.toBeInTheDocument();
    const inventoryLabel = `${paymentCopy.en.values} · ${paymentCopy.en.revision} ${before.payment.revision}`;
    await waitFor(() => {
      if (
        !screen.queryByRole('button', { name: label }) &&
        !screen.queryByRole('button', { name: inventoryLabel })
      )
        throw new Error(
          'The current Company context must expose its authorized observation or inventory.',
        );
    });
    if (!screen.queryByRole('button', { name: label })) await open(before);
    const freshPanel = begin(action, freshReason);
    expect(
      within(freshPanel).getByLabelText(paymentCopy.en.reason),
    ).toHaveValue(freshReason);
    expect(
      within(freshPanel).getByRole('button', { name: label }),
    ).toBeEnabled();
    expect(observed.onProtectedWorkChange).toHaveBeenLastCalledWith(false);
    const protectionCalls = observed.onProtectedWorkChange.mock.calls.length;
    await act(async () => {
      token.release();
    });
    await waitFor(() => expect(token.finished()).toBe(true));
    expect(posts).toHaveLength(0);
    expect(screen.queryByDisplayValue(oldReason)).not.toBeInTheDocument();
    expect(
      within(freshPanel).getByLabelText(paymentCopy.en.reason),
    ).toHaveValue(freshReason);
    expect(
      within(freshPanel).getByRole('button', { name: label }),
    ).toBeEnabled();
    expect(
      observed.onProtectedWorkChange.mock.calls.slice(protectionCalls),
    ).toEqual([]);
    expect(observed.onProtectedWorkChange).toHaveBeenLastCalledWith(false);
    submit(freshPanel, action);
    await screen.findByRole('heading', {
      name:
        action === 'REVERSE'
          ? 'Revision 3 · Recorded observation reversed'
          : 'Revision 2 · Draft observation withdrawn',
    });
    expect(posts).toHaveLength(1);
    expect(posts[0]?.path).toBe(`/api/payments/${ids.payment}/commands`);
    expect(posts[0]?.body).toBe(
      JSON.stringify({
        action,
        expectedRevision: action === 'REVERSE' ? 2 : 1,
        reason: freshReason,
      }),
    );
    expect(posts[0]?.key).toMatch(/^[0-9a-f-]{36}$/u);
  },
);

it('protects a definite conflict against Close, sibling actions, source changes and navigation until a deliberate validated reload', async () => {
  const oldReason = '  Conflict must remain owned after Close attempts  ';
  const freshReason = '  Deliberate correction after current review  ';
  let detailReads = 0;
  let releaseOlderRead: ((response: Response) => void) | undefined;
  let releaseCurrentRead: ((response: Response) => void) | undefined;
  const transport = installTransport({
    post: (_posted, attempt) =>
      attempt === 1
        ? Response.json({ code: 'PAYMENT_NO_CHANGE' }, { status: 409 })
        : Response.json(receipt('CORRECT_DRAFT'), { status: 201 }),
    detail: () => {
      detailReads += 1;
      if (detailReads === 2)
        return new Promise<Response>((resolve) => {
          releaseOlderRead = resolve;
        });
      if (detailReads === 3) return new Response(null, { status: 503 });
      if (detailReads === 4)
        return Response.json({ ...initial, readCapture: 'invalid-current' });
      if (detailReads === 5)
        return new Promise<Response>((resolve) => {
          releaseCurrentRead = resolve;
        });
      return Response.json(
        transport.posts.length > 1
          ? changed('CORRECT_DRAFT', freshReason, '125551')
          : initial,
      );
    },
  });
  const observed = callbacks();
  const navigation = { onOpenClient: vi.fn(), onOpenDocument: vi.fn() };
  const rendered = render(view({ callbacks: observed, navigation }));
  await open();
  const panel = begin('CORRECT_DRAFT', oldReason);
  fireEvent.click(screen.getByRole('button', { name: paymentCopy.en.reload }));
  await waitFor(() => expect(releaseOlderRead).toBeTypeOf('function'));
  submit(panel, 'CORRECT_DRAFT');
  await screen.findByText(paymentCopy.en.conflict);

  function expectConflictProtected() {
    expect(screen.getByText(paymentCopy.en.conflict)).toBeInTheDocument();
    expect(within(panel).getByLabelText(paymentCopy.en.reason)).toHaveValue(
      oldReason,
    );
    expect(within(panel).getByLabelText(paymentCopy.en.reason)).toBeDisabled();
    expect(observed.onProtectedWorkChange).toHaveBeenLastCalledWith(true);
    const close = within(panel).queryByRole('button', {
      name: paymentCopy.en.close,
    });
    if (close) {
      expect(close).toBeDisabled();
      fireEvent.click(close);
    }
    for (const label of [
      paymentCopy.en.back,
      paymentCopy.en.newObservation,
      paymentCopy.en.source,
      'Fictional live Client',
    ]) {
      const control = screen.getByRole('button', { name: label });
      expect(control).toBeDisabled();
      fireEvent.click(control);
    }
    for (const label of [
      paymentCopy.en.correct,
      paymentCopy.en.withdraw,
      paymentCopy.en.confirm,
      `${paymentCopy.en.selectSource} 1`,
    ])
      for (const control of screen.queryAllByRole('button', { name: label })) {
        expect(control).toBeDisabled();
        fireEvent.click(control);
      }
    const outerReload = screen
      .getAllByRole('button', { name: paymentCopy.en.reload })
      .find((control) => !panel.contains(control));
    if (!outerReload)
      throw new Error('The workspace Reload control is absent.');
    expect(outerReload).toBeDisabled();
    fireEvent.click(outerReload);
    expect(commandPanel('CORRECT_DRAFT')).toBe(panel);
    expect(
      screen.queryByRole('region', { name: paymentCopy.en.create }),
    ).not.toBeInTheDocument();
    expect(transport.posts).toHaveLength(1);
    expect(navigation.onOpenClient).not.toHaveBeenCalled();
    expect(navigation.onOpenDocument).not.toHaveBeenCalled();
  }

  expectConflictProtected();
  expect(detailReads).toBe(2);
  expect(transport.reads).toEqual([
    '/api/payments',
    `/api/payments/${ids.payment}`,
    `/api/payments/${ids.payment}`,
  ]);
  await act(async () => {
    if (!releaseOlderRead) throw new Error('The older read was not held.');
    releaseOlderRead(Response.json(initial));
  });
  // A passive completion of the pre-conflict read and an unrelated Actor label
  // refresh cannot turn the discarded editor path into a new command.
  rendered.rerender(
    view({
      callbacks: observed,
      navigation,
      actor: { ...actor, displayName: 'Unrelated updated Actor label' },
    }),
  );
  expectConflictProtected();
  expect(detailReads).toBe(2);
  for (const expectedReads of [3, 4]) {
    await act(async () => {
      fireEvent.click(
        within(panel).getByRole('button', { name: paymentCopy.en.reload }),
      );
    });
    await screen.findByText(paymentCopy.en.error);
    expectConflictProtected();
    expect(detailReads).toBe(expectedReads);
  }
  fireEvent.click(
    within(panel).getByRole('button', { name: paymentCopy.en.reload }),
  );
  await waitFor(() => expect(releaseCurrentRead).toBeTypeOf('function'));
  expectConflictProtected();
  expect(detailReads).toBe(5);
  await act(async () => {
    if (!releaseCurrentRead)
      throw new Error('The current reload was not held.');
    releaseCurrentRead(Response.json(initial));
  });
  await within(panel).findByRole('button', { name: paymentCopy.en.correct });
  expect(within(panel).getByLabelText(paymentCopy.en.reason)).toHaveValue('');
  expect(within(panel).getByLabelText(paymentCopy.en.amount)).toHaveValue(
    '1255.00',
  );
  expect(observed.onProtectedWorkChange).toHaveBeenLastCalledWith(false);
  expect(transport.posts).toHaveLength(1);
  expect(detailReads).toBe(5);
  fireEvent.change(within(panel).getByLabelText(paymentCopy.en.amount), {
    target: { value: '1255.51' },
  });
  fireEvent.change(within(panel).getByLabelText(paymentCopy.en.reason), {
    target: { value: freshReason },
  });
  submit(panel, 'CORRECT_DRAFT');
  await screen.findByRole('heading', {
    name: 'Revision 2 · Draft values corrected',
  });
  expect(transport.posts).toHaveLength(2);
  expect(transport.posts[0]?.key).toMatch(/^[0-9a-f-]{36}$/u);
  expect(transport.posts[0]?.body).toBe(
    JSON.stringify({
      action: 'CORRECT_DRAFT',
      expectedRevision: 1,
      values: { ...values, amountMinor: '125550' },
      reason: oldReason,
    }),
  );
  expect(transport.posts[1]?.key).toMatch(/^[0-9a-f-]{36}$/u);
  expect(transport.posts[1]?.key).not.toBe(transport.posts[0]?.key);
  expect(transport.posts[1]?.body).toBe(
    JSON.stringify({
      action: 'CORRECT_DRAFT',
      expectedRevision: 1,
      values: { ...values, amountMinor: '125551' },
      reason: freshReason,
    }),
  );
  expect(detailReads).toBe(6);
  expect(transport.reads).toEqual([
    '/api/payments',
    ...Array.from({ length: 6 }, () => `/api/payments/${ids.payment}`),
  ]);
  expect(navigation.onOpenClient).not.toHaveBeenCalled();
  expect(navigation.onOpenDocument).not.toHaveBeenCalled();
});

const pdfBytes = new TextEncoder().encode(
  '%PDF-1.4\nFictional payment notice only\n%%EOF\n',
);
const pdfDetail: PaymentCurrent = {
  ...initial,
  liveSource: {
    kind: 'AVAILABLE',
    documentId: ids.document,
    documentVersionId: ids.version,
    title: 'Fictional exact original source',
    versionNumber: 1,
    versionState: 'superseded',
    content: {
      kind: 'AVAILABLE',
      representationId: ids.representation,
      fileName: 'fictional-payment-notice.pdf',
      byteLength: pdfBytes.length,
      sha256:
        '06f9dfa5b7e0fc647de9fdc2877abb6bd3de4ff4c866c6b352e96776dbdd7561',
    },
  },
};
function observeBlobDownload() {
  const created = vi.fn(() => 'blob:payment-observation-exact-pdf');
  const revoked = vi.fn();
  const clicked = vi
    .spyOn(HTMLAnchorElement.prototype, 'click')
    .mockImplementation(() => undefined);
  const NativeURL = URL;
  vi.stubGlobal(
    'URL',
    class extends NativeURL {
      static createObjectURL = created;
      static revokeObjectURL = revoked;
    },
  );
  return { created, revoked, clicked };
}

it.each([
  { stage: 'token', replacement: 'identity projection' },
  { stage: 'body', replacement: 'identity projection' },
  { stage: 'hash', replacement: 'identity projection' },
  { stage: 'token', replacement: 'Content A → B → A' },
  { stage: 'body', replacement: 'Content A → B → A' },
  { stage: 'hash', replacement: 'Content A → B → A' },
] satisfies {
  stage: 'token' | 'body' | 'hash';
  replacement: 'identity projection' | 'Content A → B → A';
}[])(
  'owns a held exact PDF $stage independently under $replacement',
  async ({ stage, replacement }) => {
    vi.stubGlobal('Blob', NodeBlob);
    vi.stubGlobal('crypto', webcrypto);
    const effects = observeBlobDownload();
    const token = heldToken();
    const nativeDigest = webcrypto.subtle.digest.bind(webcrypto.subtle);
    const digestCall = vi.spyOn(webcrypto.subtle, 'digest');
    let releaseHash: ((value: ArrayBuffer) => void) | undefined;
    if (stage === 'hash')
      digestCall.mockReturnValueOnce(
        new Promise<ArrayBuffer>((resolve) => {
          releaseHash = resolve;
        }),
      );
    let bodyController: ReadableStreamDefaultController<Uint8Array> | undefined;
    let heldBody: Response | undefined;
    const reads: string[] = [];
    const sourceRequests: { signal: AbortSignal | null | undefined }[] = [];
    vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
      const parsed = new URL(url, 'http://localhost');
      const path = parsed.pathname;
      if (init?.method === 'POST')
        throw new Error('A PDF download cannot submit a Payment command.');
      reads.push(path + parsed.search);
      if (path === '/api/payments')
        return Response.json({
          format: 'PAYMENT_INVENTORY/1',
          companyId: ids.company,
          readCapture: capture,
          items: [pdfDetail.payment],
          nextCursor: null,
        } satisfies PaymentInventory);
      if (path === `/api/payments/${ids.payment}`)
        return Response.json(pdfDetail);
      if (path === `/api/payments/${ids.payment}/source`) {
        sourceRequests.push({ signal: init?.signal });
        expect(init?.method).toBe('GET');
        expect(init?.cache).toBe('no-store');
        expect(new Headers(init?.headers).get('x-company-context-id')).toBe(
          ids.company,
        );
        const headers = {
          'content-type': 'application/pdf',
          'content-length': String(pdfBytes.length),
        };
        if (stage === 'body' && sourceRequests.length === 1) {
          heldBody = new Response(
            new ReadableStream<Uint8Array>({
              start(controller) {
                bodyController = controller;
              },
            }),
            { headers },
          );
          return heldBody;
        }
        return new Response(pdfBytes, { headers });
      }
      return new Response(null, { status: 404 });
    });
    const observed = callbacks();
    const rendered = render(
      view({ callbacks: observed, identity: token.identity }),
    );
    await open(pdfDetail);
    if (stage === 'token') token.hold();
    fireEvent.click(
      screen.getByRole('button', { name: paymentCopy.en.download }),
    );
    if (stage === 'token')
      await waitFor(() => expect(token.started()).toBe(true));
    else if (stage === 'body')
      await waitFor(() => expect(heldBody?.body?.locked).toBe(true));
    else await waitFor(() => expect(digestCall).toHaveBeenCalledTimes(1));
    expect(effects.created).not.toHaveBeenCalled();
    const identityOnly = replacement === 'identity projection';
    const replacementActor: ActorContext = {
      ...actor,
      activeCompany: identityOnly
        ? {
            ...company,
            clientPermissionAssignmentId:
              '10000000-0000-4000-8000-000000001093',
          }
        : {
            ...company,
            documentContentReaderAssignmentId:
              '10000000-0000-4000-8000-000000001094',
          },
    };
    // Workspace client.manage remains the original-reference route. The Company
    // context, copied Reader, family, Document and Content captures are unchanged
    // in the identity-only case; only its projection/data generation changes.
    rendered.rerender(
      view({
        callbacks: observed,
        identity: token.identity,
        actor: replacementActor,
        projection: identityOnly
          ? 'identity-and-client-data-generation-2'
          : undefined,
      }),
    );
    if (!identityOnly)
      rendered.rerender(
        view({ callbacks: observed, identity: token.identity, actor }),
      );
    if (identityOnly) {
      expect(
        screen.getByRole('button', { name: paymentCopy.en.loading }),
      ).toBeDisabled();
      if (stage !== 'token')
        expect(sourceRequests[0]?.signal?.aborted).toBe(false);
    } else if (stage !== 'token')
      expect(sourceRequests[0]?.signal?.aborted).toBe(true);
    expect(reads).toEqual([
      '/api/payments',
      `/api/payments/${ids.payment}`,
      ...(stage === 'token' ? [] : [`/api/payments/${ids.payment}/source`]),
    ]);
    await act(async () => {
      if (stage === 'token') token.release();
      else if (stage === 'body') {
        if (!bodyController)
          throw new Error('The exact PDF body was not held.');
        bodyController.enqueue(pdfBytes);
        bodyController.close();
      } else {
        if (!releaseHash) throw new Error('The exact PDF hash was not held.');
        releaseHash(await nativeDigest('SHA-256', pdfBytes));
      }
    });
    if (stage === 'token')
      await waitFor(() => expect(token.finished()).toBe(true));
    if (stage === 'body')
      await waitFor(() => expect(heldBody?.body?.locked).toBe(false));
    if (identityOnly) {
      await waitFor(() => expect(effects.clicked).toHaveBeenCalledTimes(1));
      expect(digestCall).toHaveBeenCalledTimes(1);
      expect(sourceRequests).toHaveLength(1);
      expect(reads).toEqual([
        '/api/payments',
        `/api/payments/${ids.payment}`,
        `/api/payments/${ids.payment}/source`,
      ]);
      expect(
        screen.getByRole('button', { name: paymentCopy.en.download }),
      ).toBeEnabled();
    } else {
      expect(effects.created).not.toHaveBeenCalled();
      expect(effects.clicked).not.toHaveBeenCalled();
      expect(effects.revoked).not.toHaveBeenCalled();
      expect(digestCall).toHaveBeenCalledTimes(stage === 'hash' ? 1 : 0);
      expect(sourceRequests).toHaveLength(stage === 'token' ? 0 : 1);
      // A new deliberate read/download may use the restored current A capture;
      // the old generation cannot trigger it or publish a Blob into this owner.
      fireEvent.click(
        screen.getByRole('button', { name: paymentCopy.en.reload }),
      );
      fireEvent.click(
        await screen.findByRole('button', { name: paymentCopy.en.download }),
      );
      await waitFor(() => expect(effects.clicked).toHaveBeenCalledTimes(1));
      expect(sourceRequests).toHaveLength(stage === 'token' ? 1 : 2);
      expect(digestCall).toHaveBeenCalledTimes(stage === 'hash' ? 2 : 1);
      expect(reads).toEqual([
        '/api/payments',
        `/api/payments/${ids.payment}`,
        ...(stage === 'token' ? [] : [`/api/payments/${ids.payment}/source`]),
        `/api/payments/${ids.payment}`,
        `/api/payments/${ids.payment}/source`,
      ]);
    }
    expect(effects.created).toHaveBeenCalledTimes(1);
    expect(effects.created).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'application/pdf',
        size: pdfBytes.length,
      }),
    );
    expect(effects.revoked).toHaveBeenCalledTimes(1);
    expect(effects.revoked).toHaveBeenCalledWith(
      'blob:payment-observation-exact-pdf',
    );
    expect(effects.clicked).toHaveBeenCalledTimes(1);
    expect(document.querySelector('a[download]')).not.toBeInTheDocument();
    rendered.unmount();
    expect(effects.revoked).toHaveBeenCalledTimes(1);
  },
);

it('keeps the target conflict protected after Source authority retires its editor, then admits source-free withdrawal only after a deliberate current read', async () => {
  let saved = false;
  const reason = 'Source-free withdrawal after current review';
  const fresh: PaymentCurrent = {
    ...initial,
    liveSource: { kind: 'UNAVAILABLE' },
    capabilities: {
      ...initial.capabilities,
      canCorrect: false,
      canConfirm: false,
    },
  };
  const transport = installTransport({
    detail: () =>
      Response.json(
        saved
          ? {
              ...changed('WITHDRAW_DRAFT', reason),
              liveSource: { kind: 'UNAVAILABLE' },
            }
          : fresh,
      ),
    post: (_posted, attempt) => {
      if (attempt === 1) return new Response(null, { status: 409 });
      saved = true;
      return Response.json(receipt('WITHDRAW_DRAFT'), { status: 201 });
    },
  });
  // The first shown snapshot is authorized under its original Source capture.
  let firstRead = true;
  const nativeFetch = globalThis.fetch;
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    if (
      !init?.method &&
      new URL(url, 'http://localhost').pathname ===
        `/api/payments/${ids.payment}` &&
      firstRead
    ) {
      firstRead = false;
      return Response.json(initial);
    }
    return nativeFetch(url, init);
  });
  const observed = callbacks();
  const rendered = render(view({ callbacks: observed }));
  await open();
  submit(
    begin('CORRECT_DRAFT', 'Correction before a Source loss'),
    'CORRECT_DRAFT',
  );
  await screen.findByText(paymentCopy.en.conflict);
  const withoutSource: ActorContext = {
    ...actor,
    activeCompany: {
      ...company,
      paymentGrants: company.paymentGrants.filter(
        (grant) => grant.bundle !== 'company_payment_evidence_access',
      ),
    },
  };
  rendered.rerender(view({ callbacks: observed, actor: withoutSource }));
  const withdraw = await screen.findByRole('button', {
    name: paymentCopy.en.withdraw,
  });
  expect(withdraw).toBeDisabled();
  fireEvent.click(withdraw);
  expect(transport.posts).toHaveLength(1);
  expect(observed.onProtectedWorkChange).toHaveBeenLastCalledWith(true);
  fireEvent.click(screen.getByRole('button', { name: paymentCopy.en.reload }));
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: paymentCopy.en.withdraw }),
    ).toBeEnabled(),
  );
  expect(transport.posts).toHaveLength(1);
  const panel = begin('WITHDRAW_DRAFT', reason);
  submit(panel, 'WITHDRAW_DRAFT');
  await screen.findByRole('heading', {
    name: 'Revision 2 · Draft observation withdrawn',
  });
  expect(transport.posts).toHaveLength(2);
  expect(transport.posts[1]?.body).toBe(
    JSON.stringify({ action: 'WITHDRAW_DRAFT', expectedRevision: 1, reason }),
  );
  expect(transport.posts[1]?.key).not.toBe(transport.posts[0]?.key);
});

it('retains a CREATE conflict until fresh eligible Source discovery succeeds and a new Source is deliberately selected', async () => {
  const posts: Posted[] = [];
  let discovery = 0,
    committed = false;
  const created: PaymentCurrent = {
    ...initial,
    actor: reviewer,
    history: { items: [{ ...first, actor: reviewer }], nextCursor: null },
  };
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    const path = new URL(url, 'http://localhost').pathname;
    if (init?.method === 'POST') {
      if (typeof init.body !== 'string')
        throw new Error('An exact command body is required.');
      posts.push({
        path,
        body: init.body,
        key: new Headers(init.headers).get('idempotency-key'),
      });
      if (posts.length === 1) return new Response(null, { status: 409 });
      committed = true;
      return Response.json(receipt('CREATE'), { status: 201 });
    }
    if (path === '/api/payments')
      return Response.json({
        format: 'PAYMENT_INVENTORY/1',
        companyId: ids.company,
        readCapture: capture,
        items: committed ? [created.payment] : [],
        nextCursor: null,
      } satisfies PaymentInventory);
    if (path === '/api/payments/sources') {
      discovery++;
      if (discovery === 2) return new Response(null, { status: 503 });
      return Response.json({
        format: 'PAYMENT_SOURCE_PAGE/1',
        companyId: ids.company,
        readCapture: capture,
        items: [source],
        nextCursor: null,
      });
    }
    if (path === `/api/payments/${ids.payment}`) return Response.json(created);
    return new Response(null, { status: 404 });
  });
  const observed = callbacks();
  render(view({ callbacks: observed }));
  await screen.findByText(paymentCopy.en.empty);
  fireEvent.click(
    screen.getByRole('button', { name: paymentCopy.en.newObservation }),
  );
  const choose = () =>
    screen.findByRole('button', { name: `${paymentCopy.en.selectSource} 1` });
  fireEvent.click(await choose());
  function enterAndCreate() {
    const panel = screen.getByRole('region', { name: paymentCopy.en.create });
    for (const [label, value] of [
      [paymentCopy.en.amount, '1255.00'],
      [paymentCopy.en.currency, 'MDL'],
      [paymentCopy.en.effectiveOn, values.effectiveOn],
      [paymentCopy.en.method, values.method],
      [paymentCopy.en.observationBasis, values.observationBasis],
    ]) {
      if (!label || value === undefined)
        throw new Error('A complete literal CREATE is required.');
      changeValue(within(panel).getByLabelText(label), value);
    }
    fireEvent.click(
      within(panel).getByRole('checkbox', {
        name: paymentCopy.en.acknowledgeObserved,
      }),
    );
    fireEvent.click(
      within(panel).getByRole('button', { name: paymentCopy.en.create }),
    );
    return panel;
  }
  const conflicted = enterAndCreate();
  await screen.findByText(paymentCopy.en.conflict);
  expect(
    within(conflicted).queryByRole('button', { name: paymentCopy.en.close }),
  ).not.toBeInTheDocument();
  fireEvent.click(
    within(conflicted).getByRole('button', { name: paymentCopy.en.reload }),
  );
  await screen.findByRole('button', { name: paymentCopy.en.retryRead });
  expect(posts).toHaveLength(1);
  expect(discovery).toBe(2);
  expect(screen.getByText(paymentCopy.en.conflict)).toBeInTheDocument();
  expect(observed.onProtectedWorkChange).toHaveBeenLastCalledWith(true);
  fireEvent.click(
    screen.getByRole('button', { name: paymentCopy.en.retryRead }),
  );
  const currentSource = await choose();
  await waitFor(() =>
    expect(observed.onProtectedWorkChange).toHaveBeenLastCalledWith(false),
  );
  expect(discovery).toBe(3);
  expect(posts).toHaveLength(1);
  expect(screen.queryByText(paymentCopy.en.conflict)).not.toBeInTheDocument();
  fireEvent.click(currentSource);
  enterAndCreate();
  await screen.findByRole('heading', { name: paymentCopy.en.history });
  expect(posts).toHaveLength(2);
  expect(posts[1]?.key).not.toBe(posts[0]?.key);
  expect(posts[1]?.body).toBe(posts[0]?.body);
});
