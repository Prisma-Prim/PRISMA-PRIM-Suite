import { useState } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '../test/render-with-interface-locale';
import { SectionVisibility } from '../production-shell/section-visibility';
import type { ActorContext } from '../access-types';
import { invoiceRecordProjectionAuthority } from '../access/invoice-record-authority';
import { InvoiceRecordsWorkspace } from './InvoiceRecordsWorkspace';
import {
  actor,
  copiedOnly,
  current,
  financeOnly,
  identity,
  ids,
  inventory,
  receipt,
  withdrawn,
} from './invoice-record.fixture';

const detailPath = `/api/invoice-records/${ids.record}`;
const sourcePath = `${detailPath}/source`;
const commandPath = `${detailPath}/commands`;
type Posted = { body: string; key: string | null };
function callbacks() {
  return {
    onCompanyContextRejected: vi.fn(),
    onActorRevalidated: vi.fn(),
    onWorkspaceAccessRejected: vi.fn(),
  };
}
function view(access: ReturnType<typeof callbacks>) {
  return (
    <SectionVisibility value={true}>
      <InvoiceRecordsWorkspace
        actor={actor}
        identity={identity}
        projectionAuthority="unchanged-financial-and-native-captures"
        {...access}
      />
    </SectionVisibility>
  );
}
function RecoveringView({
  onApplied,
}: {
  onApplied: (value: ActorContext) => void;
}) {
  const [currentActor, setCurrentActor] = useState(actor);
  return (
    <>
      <output aria-label="Current recovered Actor">
        {currentActor.displayName}
      </output>
      <SectionVisibility value={true}>
        <InvoiceRecordsWorkspace
          actor={currentActor}
          identity={identity}
          projectionAuthority={invoiceRecordProjectionAuthority(currentActor)}
          onCompanyContextRejected={() => undefined}
          onWorkspaceAccessRejected={() => undefined}
          onActorRevalidated={(value) => {
            onApplied(value);
            setCurrentActor(value);
          }}
        />
      </SectionVisibility>
    </>
  );
}
function posted(init: RequestInit): Posted {
  if (typeof init.body !== 'string')
    throw new Error('Expected an exact JSON command at the HTTP boundary');
  return {
    body: init.body,
    key: new Headers(init.headers).get('idempotency-key'),
  };
}
async function openDetail() {
  fireEvent.click(await screen.findByRole('button', { name: /SYN-INV-001/ }));
  await screen.findByRole('button', { name: 'Download exact source PDF' });
}
async function openWithdrawal(reason: string) {
  fireEvent.click(
    screen.getByRole('button', { name: 'Withdraw PRISMA entry' }),
  );
  fireEvent.change(screen.getByLabelText('Literal reason'), {
    target: { value: reason },
  });
}
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
});

it.each([403, 404])(
  'withholds source after exact PDF %s while preserving the independent withdrawal reason, exact attempt and copied history',
  async (status) => {
    const reason = ' Independent withdrawal after source refusal Ș Я é ';
    const posts: Posted[] = [];
    let sourceReads = 0;
    let detailReads = 0;
    let actorReads = 0;
    let sourceRefused = false;
    let successfulWithdrawals = 0;
    const access = callbacks();
    vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
      const path = new URL(url, 'http://localhost').pathname;
      if (path === '/api/access/current-actor') {
        actorReads += 1;
        return Response.json(actor);
      }
      if (path === sourcePath) {
        sourceReads += 1;
        sourceRefused = true;
        return new Response(null, { status });
      }
      if (path === commandPath && init?.method === 'POST') {
        posts.push(posted(init));
        if (posts.length === 1) return new Response(null, { status: 503 });
        successfulWithdrawals += 1;
        return Response.json(receipt('WITHDRAW_ENTRY'), { status: 201 });
      }
      if (path === '/api/invoice-records') return Response.json(inventory);
      if (path === detailPath) {
        detailReads += 1;
        return Response.json(
          successfulWithdrawals
            ? withdrawn(reason)
            : sourceRefused
              ? copiedOnly
              : current,
        );
      }
      return new Response(null, { status: 404 });
    });
    render(view(access));
    await openDetail();
    await openWithdrawal(reason);
    fireEvent.click(
      screen.getByRole('button', { name: 'Confirm entry withdrawal' }),
    );
    await screen.findByRole('button', { name: 'Retry identical command' });
    expect(posts).toHaveLength(1);
    const first = posts[0];
    expect(first?.key).toMatch(/^[0-9a-f-]{36}$/u);
    expect(first?.body).toBe(
      JSON.stringify({ action: 'WITHDRAW_ENTRY', expectedRevision: 1, reason }),
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Download exact source PDF' }),
    );
    await screen.findByText('Source unavailable.');
    await waitFor(() => expect(detailReads).toBe(2));
    expect(
      screen.queryByRole('button', { name: 'Download exact source PDF' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText('fictional-original.pdf'),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(/Fictional exact source/),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(
        'The exact PDF could not be safely opened. Retry deliberately.',
      ),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText('Literal reason')).toHaveValue(reason);
    expect(screen.getByLabelText('Literal reason')).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Retry identical command' }),
    ).toBeEnabled();
    expect(screen.getAllByText('1,255.00 MDL').length).toBeGreaterThan(0);
    expect(screen.getAllByText('0.00 MDL').length).toBeGreaterThan(0);
    expect(
      screen.getAllByText('Unknown / not recorded').length,
    ).toBeGreaterThan(0);
    expect(
      screen.getByRole('heading', { name: 'Revision 1 · Entry created' }),
    ).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Correct transcription' }),
    ).not.toBeInTheDocument();
    expect(posts).toHaveLength(1);
    expect(sourceReads).toBe(1);
    if (status === 404) {
      expect(actorReads).toBe(0);
      expect(access.onActorRevalidated).not.toHaveBeenCalled();
    }
    fireEvent.click(
      screen.getByRole('button', { name: 'Retry identical command' }),
    );
    await screen.findByRole('heading', {
      name: 'Revision 2 · Entry withdrawn',
    });
    expect(posts).toHaveLength(2);
    expect(posts[1]).toEqual(first);
    expect(successfulWithdrawals).toBe(1);
    expect(sourceReads).toBe(1);
    expect(
      screen.getByRole('heading', { name: 'Revision 1 · Entry created' }),
    ).toBeVisible();
    expect(screen.getAllByText('1,255.00 MDL').length).toBeGreaterThan(0);
    expect(
      screen.queryByText('fictional-original.pdf'),
    ).not.toBeInTheDocument();
    if (status === 404) expect(actorReads).toBe(0);
  },
);

it('retires a stronger correction draft on source404 while retaining independent financial copies and withdrawal', async () => {
  let sourceRefused = false;
  let sourceReads = 0;
  let detailReads = 0;
  let actorReads = 0;
  const posts: Posted[] = [];
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    const path = new URL(url, 'http://localhost').pathname;
    if (init?.method === 'POST') {
      posts.push(posted(init));
      return new Response(null, { status: 400 });
    }
    if (path === '/api/access/current-actor') {
      actorReads += 1;
      return Response.json(actor);
    }
    if (path === sourcePath) {
      sourceRefused = true;
      sourceReads += 1;
      return new Response(null, { status: 404 });
    }
    if (path === '/api/invoice-records') return Response.json(inventory);
    if (path === detailPath) {
      detailReads += 1;
      return Response.json(sourceRefused ? copiedOnly : current);
    }
    return new Response(null, { status: 404 });
  });
  render(view(callbacks()));
  await openDetail();
  fireEvent.click(
    screen.getByRole('button', { name: 'Correct transcription' }),
  );
  fireEvent.change(screen.getByLabelText('Declared gross amount'), {
    target: { value: '1255.50' },
  });
  fireEvent.change(screen.getByLabelText('Literal reason'), {
    target: { value: 'Source-use draft must retire' },
  });
  fireEvent.click(
    screen.getByRole('button', { name: 'Download exact source PDF' }),
  );
  await screen.findByText('Source unavailable.');
  await waitFor(() => expect(detailReads).toBe(2));
  expect(screen.queryByLabelText('Literal reason')).not.toBeInTheDocument();
  expect(
    screen.queryByLabelText('Declared gross amount'),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: 'Save transcription correction' }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: 'Correct transcription' }),
  ).not.toBeInTheDocument();
  expect(
    screen.getByRole('button', { name: 'Withdraw PRISMA entry' }),
  ).toBeEnabled();
  expect(
    screen.getByRole('heading', { name: 'Revision 1 · Entry created' }),
  ).toBeVisible();
  expect(screen.getAllByText('1,255.00 MDL').length).toBeGreaterThan(0);
  expect(posts).toEqual([]);
  expect(sourceReads).toBe(1);
  expect(actorReads).toBe(0);
});

it('retires writing immediately on withdrawalPOST403 and clears copies only after a fresh financial GET403 while actor recovery is held', async () => {
  const reason = 'Financial denial clears this protected intention';
  const access = callbacks();
  const posts: Posted[] = [];
  let actorReads = 0;
  let sourceReads = 0;
  let freshFinancialReads = 0;
  let releaseRecovery: (() => void) | undefined;
  let releaseReadRefusal: (() => void) | undefined;
  const revokedActor: ActorContext = {
    ...actor,
    activeCompany: {
      ...actor.activeCompany,
      id: ids.company,
      displayName: 'Fictional Company',
      externalInvoiceGrants: [],
      invoiceRecordReadCapture: undefined,
    },
  };
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    const path = new URL(url, 'http://localhost').pathname;
    if (path === '/api/access/current-actor') {
      actorReads += 1;
      await new Promise<void>((resolve) => {
        releaseRecovery = resolve;
      });
      return Response.json(revokedActor);
    }
    if (path === commandPath && init?.method === 'POST') {
      posts.push(posted(init));
      return new Response(null, { status: 403 });
    }
    if (path === sourcePath) {
      sourceReads += 1;
      return new Response(null, { status: 404 });
    }
    if (path === '/api/invoice-records') return Response.json(inventory);
    if (path === detailPath) {
      if (posts.length === 0) return Response.json(current);
      freshFinancialReads += 1;
      await new Promise<void>((resolve) => {
        releaseReadRefusal = resolve;
      });
      return new Response(null, { status: 403 });
    }
    return new Response(null, { status: 404 });
  });
  render(view(access));
  await openDetail();
  await openWithdrawal(reason);
  fireEvent.click(
    screen.getByRole('button', { name: 'Confirm entry withdrawal' }),
  );
  await waitFor(() => expect(freshFinancialReads).toBe(1));
  await waitFor(() => expect(actorReads).toBe(1));
  expect(screen.queryByLabelText('Literal reason')).not.toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: 'Retry identical command' }),
  ).not.toBeInTheDocument();
  expect(screen.getAllByText('1,255.00 MDL').length).toBeGreaterThan(0);
  expect(
    screen.getByRole('heading', { name: 'Revision 1 · Entry created' }),
  ).toBeVisible();
  expect(
    screen.queryByText(
      'Access is unavailable. Protected work has been cleared.',
    ),
  ).not.toBeInTheDocument();
  expect(releaseReadRefusal).toBeTypeOf('function');
  await act(async () => {
    releaseReadRefusal?.();
  });
  await screen.findByText(
    'Access is unavailable. Protected work has been cleared.',
  );
  expect(screen.queryAllByText('1,255.00 MDL')).toEqual([]);
  expect(screen.queryByText(/Fictional Contract №17/)).not.toBeInTheDocument();
  expect(
    screen.queryByRole('heading', { name: 'Revision 1 · Entry created' }),
  ).not.toBeInTheDocument();
  expect(screen.queryByText('fictional-original.pdf')).not.toBeInTheDocument();
  await waitFor(() => expect(actorReads).toBe(1));
  expect(releaseRecovery).toBeTypeOf('function');
  expect(sourceReads).toBe(0);
  expect(posts).toHaveLength(1);
  expect(posts[0]?.body).toBe(
    JSON.stringify({ action: 'WITHDRAW_ENTRY', expectedRevision: 1, reason }),
  );
  await act(async () => {
    releaseRecovery?.();
  });
  expect(screen.queryAllByText('1,255.00 MDL')).toEqual([]);
  expect(screen.queryByLabelText('Literal reason')).not.toBeInTheDocument();
  expect(freshFinancialReads).toBe(1);
  expect(actorReads).toBe(1);
});

it('applies Reader-only recovery after withdrawalPOST403 and restores matching copied reads without restoring writes or retrying the denied command', async () => {
  const reason =
    'Write permission can end while copied reads remain authorized';
  const readerCapture = `invoice-record-read.v1.${'b'.repeat(64)}`;
  const readerActor: ActorContext = {
    ...financeOnly,
    displayName: 'Fictional Reader after Recorder revocation',
    activeCompany: {
      ...financeOnly.activeCompany,
      id: ids.company,
      displayName: 'Fictional Company',
      invoiceRecordReadCapture: readerCapture,
      externalInvoiceGrants: [
        {
          bundle: 'company_invoice_reader',
          assignmentId: '40000000-0000-4000-8000-000000000001',
          permissionSetVersion: 'v1',
        },
      ],
    },
  };
  const readerCurrent = {
    ...copiedOnly,
    readCapture: readerCapture,
    capabilities: { canCorrect: false, canWithdraw: false },
  };
  const readerInventory = { ...inventory, readCapture: readerCapture };
  const posts: Posted[] = [];
  let actorReads = 0;
  let sourceReads = 0;
  let recorderRevalidations = 0;
  let readerInventoryReads = 0;
  let readerDetailReads = 0;
  let readerApplied = false;
  let releaseRecovery: (() => void) | undefined;
  let releaseOldRead: (() => void) | undefined;
  const applied = vi.fn((value: ActorContext) => {
    if (value.activeCompany?.invoiceRecordReadCapture === readerCapture)
      readerApplied = true;
  });
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    const path = new URL(url, 'http://localhost').pathname;
    if (path === '/api/access/current-actor') {
      actorReads += 1;
      await new Promise<void>((resolve) => {
        releaseRecovery = resolve;
      });
      return Response.json(readerActor);
    }
    if (path === commandPath && init?.method === 'POST') {
      posts.push(posted(init));
      return new Response(null, { status: 403 });
    }
    if (path === sourcePath) {
      sourceReads += 1;
      return new Response(null, { status: 404 });
    }
    if (path === '/api/invoice-records') {
      if (readerApplied) {
        readerInventoryReads += 1;
        return Response.json(readerInventory);
      }
      return Response.json(inventory);
    }
    if (path === detailPath) {
      if (readerApplied) {
        readerDetailReads += 1;
        return Response.json(readerCurrent);
      }
      if (posts.length === 0) return Response.json(current);
      recorderRevalidations += 1;
      await new Promise<void>((resolve) => {
        releaseOldRead = resolve;
      });
      return Response.json(current);
    }
    return new Response(null, { status: 404 });
  });
  render(<RecoveringView onApplied={applied} />);
  await openDetail();
  await openWithdrawal(reason);
  fireEvent.click(
    screen.getByRole('button', { name: 'Confirm entry withdrawal' }),
  );
  await waitFor(() => expect(actorReads).toBe(1));
  await waitFor(() => expect(recorderRevalidations).toBe(1));
  expect(screen.queryByLabelText('Literal reason')).not.toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: 'Retry identical command' }),
  ).not.toBeInTheDocument();
  expect(applied).not.toHaveBeenCalled();
  expect(releaseRecovery).toBeTypeOf('function');
  await act(async () => {
    releaseRecovery?.();
  });
  await waitFor(() => expect(applied).toHaveBeenCalledTimes(1));
  expect(applied).toHaveBeenCalledWith(readerActor);
  await waitFor(() =>
    expect(screen.getByLabelText('Current recovered Actor')).toHaveTextContent(
      readerActor.displayName,
    ),
  );
  fireEvent.click(await screen.findByRole('button', { name: /SYN-INV-001/ }));
  await screen.findByRole('heading', { name: 'Revision 1 · Entry created' });
  expect(readerInventoryReads).toBe(1);
  expect(readerDetailReads).toBe(1);
  expect(screen.getAllByText('1,255.00 MDL').length).toBeGreaterThan(0);
  expect(screen.getAllByText('0.00 MDL').length).toBeGreaterThan(0);
  expect(
    screen.queryByRole('button', { name: 'Correct transcription' }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: 'Withdraw PRISMA entry' }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: 'Record an external invoice' }),
  ).not.toBeInTheDocument();
  expect(screen.queryByLabelText('Literal reason')).not.toBeInTheDocument();
  expect(releaseOldRead).toBeTypeOf('function');
  await act(async () => {
    releaseOldRead?.();
  });
  expect(
    screen.getByRole('heading', { name: 'Revision 1 · Entry created' }),
  ).toBeVisible();
  expect(
    screen.queryByRole('button', { name: 'Withdraw PRISMA entry' }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: 'Correct transcription' }),
  ).not.toBeInTheDocument();
  expect(posts).toHaveLength(1);
  expect(sourceReads).toBe(0);
  expect(actorReads).toBe(1);
  expect(posts[0]?.body).toBe(
    JSON.stringify({ action: 'WITHDRAW_ENTRY', expectedRevision: 1, reason }),
  );
});
