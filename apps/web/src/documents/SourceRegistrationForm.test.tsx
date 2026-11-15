import { afterEach, expect, it, vi } from 'vitest';
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '../test/render-with-interface-locale';
import { deterministicBrowserIdentity } from '../access-composition';
import { changeValue } from '../test/select-option';
import {
  invoiceUiActor as actor,
  invoiceUiSource as source,
} from './external-invoice.ui.test-fixture';
import { SourceRegistrationForm } from './SourceRegistrationForm';
import {
  RECEIVED_CONTRACT_SOURCE_ADAPTER,
  EXTERNAL_INVOICE_SOURCE_ADAPTER,
  RECEIVED_ADDENDUM_SOURCE_ADAPTER,
} from './source-registration-adapters';
import type { SourceRegistrationAdapter } from './source-registration';
import { withCompanyGrants } from '../access/company-grants.test-fixture';

afterEach(() => vi.unstubAllGlobals());

const contractCase = {
  name: 'received contract',
  endpoint: '/api/documents/received-contract-sources',
  source,
  picker: 'Exact Contract Version',
  sourceLabel: 'Declared source',
  submit: 'Register received Contract PDF',
  retry: 'Retry identical registration',
  next: 'Next Contract Versions',
  render: () => renderForm(RECEIVED_CONTRACT_SOURCE_ADAPTER),
  expectedBody: {
    type: 'received-contract',
    opportunityId: source.opportunityId,
    contractId: source.contractId,
    contractVersionId: source.contractVersionId,
    title: '  Literal Титул 🧪  ',
    purpose: 'Preserve original',
    sourceDescription: '  Fictional source\n  literal spacing  ',
    receivedOn: null,
  },
};

const cases = [
  contractCase,
  {
    ...contractCase,
    name: 'external invoice',
    endpoint: '/api/documents/external-invoice-sources',
    picker: 'Exact declared Contract Version and receiving party',
    sourceLabel: 'Declared external source',
    submit: 'Register external invoice PDF',
    retry: 'Retry identical invoice registration',
    next: 'Next declared Contract Versions',
    render: () => renderForm(EXTERNAL_INVOICE_SOURCE_ADAPTER),
    expectedBody: { ...contractCase.expectedBody, type: 'external-invoice' },
  },
  {
    ...contractCase,
    name: 'received addendum',
    endpoint: '/api/documents/received-addendum-sources',
    source: {
      parentContractId: source.contractId,
      parentContractVersionId: source.contractVersionId,
      contractVersionNumber: source.contractVersionNumber,
      illustrativeReference: source.illustrativeReference,
      clientId: source.clientId,
      clientDisplayName: source.clientDisplayName,
      opportunityTitle: source.opportunityTitle,
      recordedRecipient: source.recordedRecipient,
    },
    picker: 'Exact executed parent Contract Version',
    submit: 'Register received Addendum PDF',
    next: 'Next parent Versions',
    render: () => renderForm(RECEIVED_ADDENDUM_SOURCE_ADAPTER),
    expectedBody: {
      type: 'received-addendum',
      parentContractId: source.contractId,
      parentContractVersionId: source.contractVersionId,
      title: '  Literal Титул 🧪  ',
      purpose: 'Preserve original',
      sourceDescription: '  Fictional source\n  literal spacing  ',
      receivedOn: null,
    },
  },
];

function renderForm<Source>(adapter: SourceRegistrationAdapter<Source>) {
  if (!actor.activeCompany) throw new Error('Missing fictional Company');
  const registrationActor = {
    ...actor,
    activeCompany: {
      ...actor.activeCompany,
      receivedAddendumClientReadCapture:
        'received-addendum-client-read.v1.' + 'a'.repeat(64),
      grants: withCompanyGrants(actor.activeCompany.grants, {
        bundle: 'company_received_addendum_access',
        version: 'v1',
        assignmentId: '20000000-0000-4000-8000-000000000001',
      }),
    },
  };
  return (
    <SourceRegistrationForm
      adapter={adapter}
      actor={registrationActor}
      identity={deterministicBrowserIdentity()}
      companyId={sourceCompanyId()}
      onBusyChange={vi.fn()}
      onRegistered={vi.fn()}
      onStarted={vi.fn()}
      onAccessRejected={vi.fn()}
    />
  );
}

function sourceCompanyId() {
  if (!actor.activeCompany) throw new Error('Missing fictional Company');
  return actor.activeCompany.id;
}

it.each(cases)(
  'preserves the exact selected source, literal fields and retry for $name',
  async (example) => {
    const writes: Array<{ body: string; key: string | null }> = [];
    const reads: string[] = [];
    vi.stubGlobal('fetch', async (input: string, init?: RequestInit) => {
      const url = new URL(input, 'http://localhost');
      if (init?.method === 'POST') {
        writes.push({
          body: String(init.body),
          key: new Headers(init.headers).get('idempotency-key'),
        });
        return Response.json({}, { status: 201 });
      }
      reads.push(url.pathname);
      return Response.json({ sources: [example.source], nextCursor: null });
    });
    render(example.render());
    const picker = await screen.findByLabelText(example.picker);
    await waitFor(() => expect(picker).not.toBeDisabled());
    changeValue(picker, source.contractVersionId);
    fireEvent.change(screen.getByLabelText('Title'), {
      target: { value: '  Literal Титул 🧪  ' },
    });
    fireEvent.change(screen.getByLabelText('Purpose'), {
      target: { value: 'Preserve original' },
    });
    fireEvent.change(screen.getByLabelText(example.sourceLabel), {
      target: { value: '  Fictional source\n  literal spacing  ' },
    });
    fireEvent.click(screen.getByRole('button', { name: example.submit }));
    await screen.findByRole('button', { name: example.retry });
    expect(screen.getByLabelText('Title')).toBeDisabled();
    expect(picker).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: example.retry }));
    await waitFor(() => expect(writes).toHaveLength(2));
    expect(reads).toEqual([example.endpoint]);
    expect(writes[0]?.key).toMatch(/^[0-9a-f-]{36}$/u);
    expect(JSON.parse(writes[0]?.body ?? '')).toEqual(example.expectedBody);
    expect(writes[1]).toEqual(writes[0]);
  },
);

it.each(cases)(
  'loads the next source page without carrying over its selection for $name',
  async (example) => {
    const cursor = 'A'.repeat(48);
    const firstId = '30000000-0000-4000-8000-000000000001';
    const firstPage = Array.from({ length: 20 }, (_, index) => {
      const versionId = `30000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`;
      return 'parentContractVersionId' in example.source
        ? { ...example.source, parentContractVersionId: versionId }
        : { ...example.source, contractVersionId: versionId };
    });
    const reads: string[] = [],
      writes: string[] = [];
    let release: ((response: Response) => void) | undefined;
    const nextPage = new Promise<Response>((resolve) => {
      release = resolve;
    });
    vi.stubGlobal('fetch', async (input: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        writes.push(String(init.body));
        return Response.json({}, { status: 201 });
      }
      const url = new URL(input, 'http://localhost');
      reads.push(url.pathname + url.search);
      return url.search
        ? nextPage
        : Response.json({ sources: firstPage, nextCursor: cursor });
    });
    render(example.render());
    const picker = await screen.findByLabelText(example.picker);
    await waitFor(() => expect(picker).not.toBeDisabled());
    changeValue(picker, firstId);
    fireEvent.change(screen.getByLabelText('Title'), {
      target: { value: '  Literal Титул 🧪  ' },
    });
    fireEvent.change(screen.getByLabelText('Purpose'), {
      target: { value: 'Preserve original' },
    });
    fireEvent.change(screen.getByLabelText(example.sourceLabel), {
      target: { value: '  Fictional source\n  literal spacing  ' },
    });
    fireEvent.click(screen.getByRole('button', { name: example.next }));
    await waitFor(() => expect(reads).toHaveLength(2));
    expect(picker).toBeDisabled();
    expect(screen.getByLabelText('Title')).toHaveValue('  Literal Титул 🧪  ');
    if (!release) throw new Error('Next source page was not requested');
    release(Response.json({ sources: [example.source], nextCursor: null }));
    await waitFor(() => expect(picker).not.toBeDisabled());
    expect(screen.getByRole('button', { name: example.submit })).toBeDisabled();
    expect(writes).toHaveLength(0);
    changeValue(picker, source.contractVersionId);
    fireEvent.click(screen.getByRole('button', { name: example.submit }));
    await screen.findByRole('button', { name: example.retry });
    expect(reads).toEqual([
      example.endpoint,
      `${example.endpoint}?cursor=${cursor}`,
    ]);
    expect(writes).toHaveLength(1);
    expect(JSON.parse(writes[0] ?? '')).toEqual(example.expectedBody);
  },
);
