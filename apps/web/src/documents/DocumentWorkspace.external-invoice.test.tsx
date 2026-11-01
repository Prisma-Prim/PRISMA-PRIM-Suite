import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '../test/render-with-interface-locale';
import { afterEach, expect, it, vi } from 'vitest';
import {
  deterministicBrowserIdentity,
  type BrowserIdentity,
} from '../access-composition';
import { SectionVisibility } from '../production-shell/section-visibility';
import { changeValue } from '../test/select-option';
import { InterfaceLocaleSelect } from '../localization/InterfaceLocaleSelect';
import { ApplicationPresentation } from '../production-shell/application-presentation';
import { DocumentWorkspace } from './DocumentWorkspace';
import type { ActorContext } from '../access-types';
import {
  invoiceUiActor as actor,
  invoiceUiIds as ids,
  invoiceUiDocument as document,
  invoiceUiSource as source,
  invoiceUiVersions as versions,
} from './external-invoice.ui.test-fixture';

function view(identity: BrowserIdentity, active = true, currentActor = actor) {
  return (
    <SectionVisibility value={active}>
      <DocumentWorkspace actor={currentActor} identity={identity} />
    </SectionVisibility>
  );
}
type Write = { body: string; key: string | null };
function http(
  options: {
    post?: (write: Write) => Promise<Response> | Response;
    saved?: boolean;
  } = {},
) {
  const writes: Write[] = [];
  const reads: string[] = [];
  vi.stubGlobal('fetch', async (input: string, init?: RequestInit) => {
    const path = new URL(input, 'http://localhost').pathname;
    if (init?.method === 'POST') {
      const write = {
        body: String(init.body),
        key: new Headers(init.headers).get('idempotency-key'),
      };
      writes.push(write);
      return options.post
        ? options.post(write)
        : Response.json(document, { status: 201 });
    }
    reads.push(path);
    if (path.endsWith('/external-invoice-sources'))
      return Response.json({ sources: [source], nextCursor: null });
    if (path.endsWith('/clients'))
      return Response.json([
        { id: ids.client, displayName: 'Fictional Client' },
      ]);
    if (path.endsWith('/documents'))
      return Response.json(options.saved ? [document] : []);
    if (path.endsWith('/documents/' + ids.document))
      return Response.json(document);
    if (path.endsWith('/versions')) return Response.json(versions);
    return new Response(null, { status: 404 });
  });
  return { writes, reads };
}
async function fillRegistration() {
  await screen.findByRole('button', { name: 'Register working reference' });
  changeValue(screen.getByLabelText('Document family'), 'external-invoice');
  const picker = await screen.findByLabelText(
    'Exact declared Contract Version and receiving party',
  );
  await waitFor(() => expect(picker).not.toBeDisabled());
  changeValue(picker, ids.contractVersion);
  fireEvent.change(screen.getByLabelText('Title'), {
    target: { value: document.title },
  });
  fireEvent.change(screen.getByLabelText('Purpose'), {
    target: { value: document.purpose },
  });
  fireEvent.change(screen.getByLabelText('Declared external source'), {
    target: { value: 'Fictional manual process' },
  });
}
afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

it('registers the labeled exact additional party without browser party/Client/amount input and retries the identical uncertain body/key', async () => {
  let attempts = 0;
  const { writes } = http({
    post: () =>
      Response.json(
        ++attempts === 1
          ? {}
          : attempts === 2
            ? {
                ...document,
                externalInvoiceRelation: {
                  ...document.externalInvoiceRelation,
                  recordedRecipient: {
                    ...source.recordedRecipient,
                    legalName: 'A different party',
                  },
                },
              }
            : document,
        { status: 201 },
      ),
  });
  render(view(deterministicBrowserIdentity()));
  await fillRegistration();
  const party = screen.getByRole('region', {
    name: 'Recorded receiving party',
  });
  expect(
    within(party).getByText(source.recordedRecipient.legalName),
  ).toBeInTheDocument();
  expect(
    within(party).getByText('Additional Client Legal Entity'),
  ).toBeInTheDocument();
  expect(within(party).getByText('Not recorded')).toBeInTheDocument();
  expect(screen.queryByLabelText('Client')).not.toBeInTheDocument();
  expect(
    screen.queryByLabelText('External HTTPS link'),
  ).not.toBeInTheDocument();
  expect(globalThis.document.querySelector('script')).toBeNull();
  fireEvent.click(
    screen.getByRole('button', { name: 'Register external invoice PDF' }),
  );
  await screen.findByRole('button', {
    name: 'Retry identical invoice registration',
  });
  expect(screen.getByLabelText('Title')).toBeDisabled();
  expect(screen.getByLabelText('Document family')).toBeDisabled();
  fireEvent.click(
    screen.getByRole('button', {
      name: 'Retry identical invoice registration',
    }),
  );
  await waitFor(() => expect(writes).toHaveLength(2));
  await screen.findByRole('button', {
    name: 'Retry identical invoice registration',
  });
  expect(
    screen.queryByRole('heading', { name: document.title }),
  ).not.toBeInTheDocument();
  fireEvent.click(
    screen.getByRole('button', {
      name: 'Retry identical invoice registration',
    }),
  );
  await screen.findByRole('heading', { name: document.title });
  expect(writes).toHaveLength(3);
  expect(writes[1]).toEqual(writes[0]);
  expect(writes[2]).toEqual(writes[0]);
  expect(JSON.parse(writes[0]?.body ?? '')).toEqual({
    type: 'external-invoice',
    opportunityId: ids.opportunity,
    contractId: ids.contract,
    contractVersionId: ids.contractVersion,
    title: document.title,
    purpose: document.purpose,
    sourceDescription: 'Fictional manual process',
    receivedOn: null,
  });
});

it('retires a held token before dispatch on hidden navigation and does not restore the old draft after return', async () => {
  let hold = false;
  let release: ((token: string) => void) | undefined;
  const identity: BrowserIdentity = {
    ...deterministicBrowserIdentity(),
    getToken: () =>
      hold
        ? new Promise<string>((resolve) => {
            release = resolve;
          })
        : Promise.resolve('token'),
  };
  const { writes } = http();
  const rendered = render(view(identity));
  await fillRegistration();
  hold = true;
  fireEvent.click(
    screen.getByRole('button', { name: 'Register external invoice PDF' }),
  );
  await waitFor(() => expect(release).toBeTypeOf('function'));
  rendered.rerender(view(identity, false));
  hold = false;
  rendered.rerender(view(identity, true));
  await act(async () => {
    release?.('late-token');
  });
  expect(writes).toHaveLength(0);
  expect(
    screen.queryByText(source.recordedRecipient.legalName),
  ).not.toBeInTheDocument();
  await screen.findByRole('button', { name: 'Register working reference' });
  changeValue(screen.getByLabelText('Document family'), 'external-invoice');
  await screen.findByLabelText(
    'Exact declared Contract Version and receiving party',
  );
  expect(screen.getByLabelText('Title')).toHaveValue('');
});

it.each([
  'company_invoice_recorder',
  'company_external_invoice_access',
] as const)(
  'retires a held registration response when %s is replaced with equal permission',
  async (bundle) => {
    let complete: ((response: Response) => void) | undefined;
    const { writes } = http({
      post: () =>
        new Promise<Response>((resolve) => {
          complete = resolve;
        }),
    });
    const identity = deterministicBrowserIdentity();
    const rendered = render(view(identity));
    await fillRegistration();
    fireEvent.click(
      screen.getByRole('button', { name: 'Register external invoice PDF' }),
    );
    await waitFor(() => expect(writes).toHaveLength(1));
    const replaced: ActorContext = {
      ...actor,
      activeCompany: {
        ...actor.activeCompany,
        id: ids.company,
        displayName: 'Fictional Company',
        externalInvoiceGrants: [
          {
            bundle: 'company_invoice_recorder',
            assignmentId:
              bundle === 'company_invoice_recorder'
                ? ids.replacement
                : ids.recorder,
            permissionSetVersion: 'v1',
          },
          {
            bundle: 'company_external_invoice_access',
            assignmentId:
              bundle === 'company_external_invoice_access'
                ? ids.replacement
                : ids.family,
            permissionSetVersion: 'v1',
          },
        ],
      },
    };
    rendered.rerender(view(identity, true, replaced));
    await act(async () => {
      complete?.(Response.json(document, { status: 201 }));
    });
    expect(
      screen.queryByRole('heading', { name: document.title }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', {
        name: 'Retry identical invoice registration',
      }),
    ).not.toBeInTheDocument();
  },
);

it('allows an independently captured Invoice Reader to reopen metadata and Versions without mutation controls', async () => {
  const reader: ActorContext = {
    ...actor,
    activeCompany: {
      ...actor.activeCompany,
      id: ids.company,
      displayName: 'Fictional Company',
      externalInvoiceGrants: [
        {
          bundle: 'company_invoice_reader',
          assignmentId: ids.recorder,
          permissionSetVersion: 'v1',
        },
        {
          bundle: 'company_external_invoice_access',
          assignmentId: ids.family,
          permissionSetVersion: 'v1',
        },
      ],
    },
  };
  http({ saved: true });
  render(view(deterministicBrowserIdentity(), true, reader));
  fireEvent.click(await screen.findByRole('button', { name: document.title }));
  await screen.findByRole('heading', { name: document.title });
  await screen.findByText('This Version has no preserved PDF yet.');
  expect(
    screen.queryByRole('button', { name: 'Edit reference' }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByLabelText('Choose the PDF file'),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: 'Designate as official' }),
  ).not.toBeInTheDocument();
});

it('preserves literal entry and focused native controls through all four locales and frame-only changes without duplicate reads', async () => {
  const { reads, writes } = http();
  const identity = deterministicBrowserIdentity();
  const content = (frame: 'classic' | 'prisme') => (
    <ApplicationPresentation value={frame}>
      <InterfaceLocaleSelect />
      {view(identity)}
    </ApplicationPresentation>
  );
  const rendered = render(content('classic'));
  await fillRegistration();
  const title = screen.getByLabelText('Title');
  title.focus();
  const before = [...reads];
  for (const locale of ['ro', 'ru', 'fr', 'en']) {
    changeValue(
      globalThis.document.getElementById('interface-locale') ?? title,
      locale,
    );
    expect(title).toHaveValue(document.title);
    expect(
      screen.getByText(source.recordedRecipient.legalName),
    ).toBeInTheDocument();
  }
  title.focus();
  rendered.rerender(content('prisme'));
  expect(screen.getByLabelText('Title')).toBe(title);
  expect(title).toHaveFocus();
  expect(reads).toEqual(before);
  expect(writes).toHaveLength(0);
});

it('preserves an unrelated questionnaire draft when financial captures are removed and granted again', async () => {
  http();
  const identity = deterministicBrowserIdentity();
  const rendered = render(view(identity));
  await screen.findByRole('button', { name: 'Register working reference' });
  fireEvent.change(screen.getByLabelText('Title'), {
    target: { value: 'Unrelated native draft' },
  });
  fireEvent.change(screen.getByLabelText('Purpose'), {
    target: { value: 'Keep ordinary family work' },
  });
  fireEvent.change(screen.getByLabelText('External HTTPS link'), {
    target: { value: 'https://example.test/unrelated' },
  });
  const removed: ActorContext = {
    ...actor,
    activeCompany: {
      ...actor.activeCompany,
      id: ids.company,
      displayName: 'Fictional Company',
      externalInvoiceGrants: [],
    },
  };
  rendered.rerender(view(identity, true, removed));
  expect(screen.getByLabelText('Title')).toHaveValue('Unrelated native draft');
  rendered.rerender(view(identity));
  expect(screen.getByLabelText('Title')).toHaveValue('Unrelated native draft');
  expect(screen.getByLabelText('Purpose')).toHaveValue(
    'Keep ordinary family work',
  );
  expect(screen.getByLabelText('External HTTPS link')).toHaveValue(
    'https://example.test/unrelated',
  );
});

it.each([
  'unknown financial row keys',
  'case-insensitive duplicate identity',
  'missing Contract capture',
  'missing Opportunity capture',
] as const)('makes no protected source request with %s', async (kind) => {
  const company = {
    ...actor.activeCompany,
    id: ids.company,
    displayName: 'Fictional Company',
  };
  const malformed: ActorContext = {
    ...actor,
    activeCompany:
      kind === 'unknown financial row keys'
        ? {
            ...company,
            externalInvoiceGrants: [
              {
                bundle: 'company_invoice_recorder',
                assignmentId: ids.recorder,
                permissionSetVersion: 'v1',
                extra: 'not authority',
              },
              {
                bundle: 'company_external_invoice_access',
                assignmentId: ids.family,
                permissionSetVersion: 'v1',
              },
            ],
          }
        : kind === 'case-insensitive duplicate identity'
          ? {
              ...company,
              externalInvoiceGrants: [
                {
                  bundle: 'company_invoice_recorder',
                  assignmentId: 'aaaaaaaa-0000-4000-8000-000000000001',
                  permissionSetVersion: 'v1',
                },
                {
                  bundle: 'company_external_invoice_access',
                  assignmentId: 'AAAAAAAA-0000-4000-8000-000000000001',
                  permissionSetVersion: 'v1',
                },
              ],
            }
          : kind === 'missing Contract capture'
            ? { ...company, contractPermissionAssignmentId: undefined }
            : { ...company, commercialIntakePermissionAssignmentId: undefined },
  };
  const { reads, writes } = http();
  render(view(deterministicBrowserIdentity(), true, malformed));
  await screen.findByRole('button', { name: 'Register working reference' });
  const family = screen.queryByLabelText('Document family');
  if (family) changeValue(family, 'external-invoice');
  await act(async () => {
    await Promise.resolve();
  });
  expect(
    reads.filter((path) => path.endsWith('/external-invoice-sources')),
  ).toEqual([]);
  expect(writes).toHaveLength(0);
  expect(
    screen.queryByLabelText(
      'Exact declared Contract Version and receiving party',
    ),
  ).not.toBeInTheDocument();
});
