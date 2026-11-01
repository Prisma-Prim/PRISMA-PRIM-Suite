import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '../test/render-with-interface-locale';
import { afterEach, expect, it, vi } from 'vitest';
import type { ActorContext } from '../access-types';
import { deterministicBrowserIdentity } from '../access-composition';
import { SectionVisibility } from '../production-shell/section-visibility';
import { DocumentWorkspace } from './DocumentWorkspace';
import {
  invoiceUiActor as actor,
  invoiceUiIds as ids,
  invoiceUiDocument as document,
  invoiceUiVersions as versions,
} from './external-invoice.ui.test-fixture';
import { changeValue } from '../test/select-option';

function withoutSource(): ActorContext {
  return {
    ...actor,
    activeCompany: {
      ...actor.activeCompany,
      id: ids.company,
      displayName: 'Fictional Company',
      contractPermissions: [],
      commercialIntakePermissions: [],
      contractPermissionAssignmentId: 'replacement-contract',
      commercialIntakePermissionAssignmentId: 'replacement-intake',
    },
  };
}
function view(
  current: ActorContext,
  identity: ReturnType<typeof deterministicBrowserIdentity>,
) {
  return (
    <SectionVisibility value={true}>
      <DocumentWorkspace actor={current} identity={identity} />
    </SectionVisibility>
  );
}
afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

it('retains native correction, PDF and Version controls when the independently readable financial relation is unavailable, while new source registration remains unavailable', async () => {
  const sourceReads: string[] = [];
  const saved = { ...document, externalInvoiceRelation: { access: 'denied' } };
  vi.stubGlobal('fetch', async (input: string) => {
    const path = new URL(input, 'http://localhost').pathname;
    if (path.endsWith('/external-invoice-sources')) {
      sourceReads.push(path);
      return new Response(null, { status: 403 });
    }
    if (path.endsWith('/clients'))
      return Response.json([
        { id: ids.client, displayName: 'Fictional Client' },
      ]);
    if (path.endsWith('/documents')) return Response.json([saved]);
    if (path.endsWith('/documents/' + ids.document))
      return Response.json(saved);
    if (path.endsWith('/versions'))
      return Response.json({
        ...versions,
        versions: versions.versions.map((version) => ({
          ...version,
          pdfContent: { state: 'stored', access: 'denied' },
        })),
      });
    return new Response(null, { status: 404 });
  });
  render(view(withoutSource(), deterministicBrowserIdentity()));
  fireEvent.click(await screen.findByRole('button', { name: document.title }));
  await screen.findByText(
    'The declared invoice source and receiving party are unavailable under your current access.',
  );
  expect(screen.getByRole('button', { name: 'Edit reference' })).toBeEnabled();
  expect(await screen.findByLabelText('Choose the PDF file')).toBeEnabled();
  expect(
    screen.getByRole('button', { name: 'Designate as official' }),
  ).toBeEnabled();
  fireEvent.click(screen.getByRole('button', { name: 'Back to references' }));
  changeValue(screen.getByLabelText('Document family'), 'external-invoice');
  await screen.findByText(
    'Invoice Recorder, External Invoice Access, Contract and Opportunity read are required to select a source.',
  );
  expect(
    screen.queryByLabelText(
      'Exact declared Contract Version and receiving party',
    ),
  ).not.toBeInTheDocument();
  expect(sourceReads).toEqual([]);
});

it('conserves an uncertain native upload through Contract and Opportunity capture loss and replacement, retiring only the old relation response', async () => {
  const uploads: Array<{
    body: BodyInit | null | undefined;
    key: string | null;
    path: string;
  }> = [];
  let holdRelation = false,
    release: (() => void) | undefined;
  vi.stubGlobal('fetch', async (input: string, init?: RequestInit) => {
    const path = new URL(input, 'http://localhost').pathname;
    if (path.endsWith('/content') && init?.method === 'POST') {
      uploads.push({
        body: init.body,
        key: new Headers(init.headers).get('idempotency-key'),
        path: String(input),
      });
      if (uploads.length === 1) return new Response(null, { status: 503 });
      return Response.json(
        {
          documentId: ids.document,
          versionId: ids.version,
          versionNumber: 1,
          workingRevision: 2,
          action: 'representation_added',
          representationId: 'preserved-upload',
          appendedAfterDesignation: false,
        },
        { status: 201 },
      );
    }
    if (path.endsWith('/clients'))
      return Response.json([
        { id: ids.client, displayName: 'Fictional Client' },
      ]);
    if (path.endsWith('/documents')) return Response.json([document]);
    if (path.endsWith('/documents/' + ids.document)) {
      if (holdRelation) {
        holdRelation = false;
        await new Promise<void>((resolve) => {
          release = resolve;
        });
      }
      return Response.json(document);
    }
    if (path.endsWith('/versions')) return Response.json(versions);
    return new Response(null, { status: 404 });
  });
  const identity = deterministicBrowserIdentity();
  const rendered = render(view(actor, identity));
  fireEvent.click(await screen.findByRole('button', { name: document.title }));
  await screen.findByText(document.externalInvoiceRelation.sourceDescription);
  const file = new File(
    ['%PDF-1.4\nFictional\n%%EOF\n'],
    'fictional-original.pdf',
    { type: 'application/pdf' },
  );
  fireEvent.change(await screen.findByLabelText('Choose the PDF file'), {
    target: { files: [file] },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Preserve PDF' }));
  await screen.findByRole('button', { name: 'Retry the same PDF' });
  holdRelation = true;
  fireEvent.click(
    screen.getByRole('button', { name: 'Reload declared invoice source' }),
  );
  await waitFor(() => expect(release).toBeTypeOf('function'));
  rendered.rerender(view(withoutSource(), identity));
  expect(
    screen.getByRole('button', { name: 'Retry the same PDF' }),
  ).toBeEnabled();
  await act(async () => {
    release?.();
  });
  expect(
    screen.queryByText(document.externalInvoiceRelation.sourceDescription),
  ).not.toBeInTheDocument();
  rendered.rerender(
    view(
      {
        ...actor,
        activeCompany: {
          ...actor.activeCompany,
          id: ids.company,
          displayName: 'Fictional Company',
          contractPermissionAssignmentId: 'new-contract-capture',
        },
      },
      identity,
    ),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Retry the same PDF' }));
  await waitFor(() => expect(uploads).toHaveLength(2));
  expect(uploads[1]).toEqual(uploads[0]);
  expect(uploads[1]?.body).toBe(file);
});

it('preserves the exact uncertain native metadata correction after Contract capture replacement', async () => {
  const corrections: Array<{ body: string; key: string | null }> = [];
  vi.stubGlobal('fetch', async (input: string, init?: RequestInit) => {
    const path = new URL(input, 'http://localhost').pathname;
    if (init?.method === 'PATCH') {
      corrections.push({
        body: String(init.body),
        key: new Headers(init.headers).get('idempotency-key'),
      });
      if (corrections.length === 1) return new Response(null, { status: 503 });
      return Response.json({
        documentId: ids.document,
        revision: 2,
        outcome: 'corrected',
      });
    }
    if (path.endsWith('/clients'))
      return Response.json([
        { id: ids.client, displayName: 'Fictional Client' },
      ]);
    if (path.endsWith('/documents')) return Response.json([document]);
    if (path.endsWith('/documents/' + ids.document))
      return Response.json(document);
    if (path.endsWith('/versions')) return Response.json(versions);
    return new Response(null, { status: 404 });
  });
  const identity = deterministicBrowserIdentity();
  const rendered = render(view(actor, identity));
  fireEvent.click(await screen.findByRole('button', { name: document.title }));
  fireEvent.click(
    await screen.findByRole('button', { name: 'Edit reference' }),
  );
  fireEvent.change(screen.getByLabelText('Title'), {
    target: { value: 'Corrected literal title' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save correction' }));
  await screen.findByRole('button', { name: 'Retry same correction' });
  rendered.rerender(view(withoutSource(), identity));
  expect(screen.getByLabelText('Title')).toHaveValue('Corrected literal title');
  fireEvent.click(
    screen.getByRole('button', { name: 'Retry same correction' }),
  );
  await waitFor(() => expect(corrections).toHaveLength(2));
  expect(corrections[1]).toEqual(corrections[0]);
});
