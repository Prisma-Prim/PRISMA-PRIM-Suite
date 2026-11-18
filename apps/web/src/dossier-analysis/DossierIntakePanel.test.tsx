import { createHash, webcrypto } from 'node:crypto';
import { afterEach, expect, it, vi } from 'vitest';
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '../test/render-with-interface-locale';
import type { BrowserIdentity } from '../access-composition';
import { DossierIntakePanel } from './DossierIntakePanel';
import { intakeBatch } from './intake-response';

const projectId = '00000000-0000-4000-8000-000000000145';
const clientId = '00000000-0000-4000-8000-000000000146';
const identity = {
  loaded: true,
  signedIn: true,
  signedOutView: null,
  getToken: async () => 'fictional',
  rejectSession: vi.fn(async () => undefined),
  signOut: vi.fn(async () => undefined),
} satisfies BrowserIdentity;
const props = {
  identity,
  companyId: '00000000-0000-4000-8000-000000000147',
  projectId,
  scope: '1',
  onDenied: vi.fn(),
  onImported: vi.fn(async () => undefined),
};
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.clearAllMocks();
  localStorage.clear();
});

const batchId = '00000000-0000-4000-8000-000000000148';
const bytes = new TextEncoder().encode(
  'Fictional exact Word transport original',
);
const original = {
  kind: 'docx',
  fileName: 'original-ru.docx',
  language: 'ru',
  size: bytes.length,
  sha256: createHash('sha256').update(bytes).digest('hex'),
  title: 'Fictional working source',
  purpose: 'Reviewed source',
};
function batch(
  revision = 4,
  stage: 'linked' | 'source_stored' | 'complete' = 'linked',
  phase = 'paused',
) {
  return {
    format: 'DOCUMENT_INTAKE_VIEW/1',
    id: batchId,
    companyId: props.companyId,
    projectId,
    clientId,
    revision,
    phase,
    createdAt: '2026-11-18T10:00:00.000Z',
    items: [
      {
        kind: 'file',
        id: '00000000-0000-4000-8000-000000000149',
        file: original,
        progress: {
          stage,
          target: {
            documentId: '00000000-0000-4000-8000-000000000150',
            versionId: '00000000-0000-4000-8000-000000000151',
          },
          ...(stage === 'linked'
            ? {}
            : {
                sourceId: '00000000-0000-4000-8000-000000000152',
                representationId: null,
              }),
        },
        attempts: 3,
        failureCount: 1,
        lastAttempt: {
          outcome: stage === 'linked' ? 'failed' : 'complete',
          id: '00000000-0000-4000-8000-000000000153',
          at: '2026-11-18T10:01:00.000Z',
          ...(stage === 'linked' ? { code: 'invalid_file' } : {}),
        },
      },
    ],
  };
}
function project() {
  return {
    id: projectId,
    clientAccountId: clientId,
    clientDisplayName: 'Fictional Client',
    title: 'Fictional audit',
  };
}
function selectedFile(content = bytes) {
  const file = new File([new Uint8Array(content)], original.fileName);
  Object.defineProperty(file, 'arrayBuffer', {
    value: async () => new Uint8Array(content).buffer,
  });
  return file;
}
it('decodes the native checkpoint and refuses an unknown execution phase', () => {
  expect(intakeBatch(batch()).revision).toBe(4);
  expect(() =>
    intakeBatch({ ...batch(), phase: 'background-running' }),
  ).toThrow();
});
it('retains a failed item on refresh failure and requires exact reselected bytes before deliberate resume', async () => {
  vi.stubGlobal('crypto', webcrypto);
  let state = batch(),
    refreshFails = false;
  const posts: string[] = [];
  const fetcher = vi.fn(async (path: RequestInfo | URL, init?: RequestInit) => {
    const url = String(path);
    if (init?.method === 'POST') {
      posts.push(url);
      if (url.endsWith('/state')) state = batch(5, 'linked', 'active');
      else if (url.includes('/content?')) {
        expect(init.body).toBeInstanceOf(File);
        state = batch(7, 'source_stored', 'active');
      } else if (url.endsWith('/advance'))
        state = batch(9, 'complete', 'completed');
      else throw new Error('Unexpected native command.');
      return Response.json(state);
    }
    if (refreshFails) throw new Error('Synthetic read failure.');
    return Response.json(
      url.endsWith('/intake-batches')
        ? { items: [state], nextBefore: null }
        : url.endsWith(batchId)
          ? state
          : project(),
    );
  });
  vi.stubGlobal('fetch', fetcher);
  render(<DossierIntakePanel {...props} />);
  fireEvent.click(await screen.findByRole('button', { name: /Reopen batch/ }));
  expect(
    await screen.findByText(/Original refused or unreadable/),
  ).toBeVisible();
  refreshFails = true;
  fireEvent.click(screen.getByRole('button', { name: 'Refresh progress' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Confirmed progress is retained',
  );
  expect(screen.getByText(original.fileName)).toBeVisible();
  refreshFails = false;
  const input = screen.getByLabelText('Reselect original');
  fireEvent.change(input, {
    target: {
      files: [selectedFile(new TextEncoder().encode('different bytes'))],
    },
  });
  await waitFor(() =>
    expect(screen.getByRole('alert')).toHaveTextContent(
      'This is a different file',
    ),
  );
  expect(posts).toEqual([]);
  fireEvent.change(input, { target: { files: [selectedFile()] } });
  expect(
    await screen.findByText('Exact original verified in this page.'),
  ).toBeVisible();
  fireEvent.click(
    screen.getByRole('button', { name: 'Start / resume intake' }),
  );
  expect(
    await screen.findByText('Original preserved and selected'),
  ).toBeVisible();
  expect(posts.filter((url) => url.includes('/content?'))).toHaveLength(1);
  expect(
    screen.getByRole('button', { name: /Reopen batch.*Batch processed/ }),
  ).toBeVisible();
  expect(props.onImported).toHaveBeenCalled();
  expect(localStorage.getItem('original-ru.docx')).toBeNull();
});

it('keeps progress reads independent of an in-flight original upload and rejects older snapshots', async () => {
  vi.stubGlobal('crypto', webcrypto);
  let state = batch();
  let release: ((value: Response) => void) | undefined;
  let uploadSignal: AbortSignal | null | undefined;
  const fetcher = vi.fn(async (path: RequestInfo | URL, init?: RequestInit) => {
    const url = String(path);
    if (init?.method === 'POST') {
      if (url.endsWith('/state')) {
        state = batch(5, 'linked', 'active');
        return Response.json(state);
      }
      if (url.includes('/content?')) {
        uploadSignal = init.signal;
        return new Promise<Response>((resolve) => {
          release = resolve;
        });
      }
      state = batch(9, 'complete', 'completed');
      return Response.json(state);
    }
    return Response.json(
      url.endsWith('/intake-batches')
        ? { items: [state], nextBefore: null }
        : url.endsWith(batchId)
          ? state
          : project(),
    );
  });
  vi.stubGlobal('fetch', fetcher);
  render(<DossierIntakePanel {...props} />);
  fireEvent.click(await screen.findByRole('button', { name: /Reopen batch/ }));
  fireEvent.change(await screen.findByLabelText('Reselect original'), {
    target: { files: [selectedFile()] },
  });
  expect(
    await screen.findByText('Exact original verified in this page.'),
  ).toBeVisible();
  fireEvent.click(
    screen.getByRole('button', { name: 'Start / resume intake' }),
  );
  await waitFor(() => expect(release).toBeTypeOf('function'));
  fireEvent.click(screen.getByRole('button', { name: 'Refresh progress' }));
  await waitFor(() =>
    expect(
      fetcher.mock.calls.filter(([path]) => String(path).endsWith(batchId))
        .length,
    ).toBeGreaterThan(2),
  );
  expect(uploadSignal?.aborted).toBe(false);
  state = batch(7, 'source_stored', 'active');
  if (!release) throw new Error('Expected upload response boundary.');
  release(Response.json(state));
  expect(
    await screen.findByText('Original preserved and selected'),
  ).toBeVisible();
});

it('retires a late progress response when the actor or Company owner is replaced', async () => {
  let release: ((value: Response) => void) | undefined;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (path: RequestInfo | URL) => {
      const url = String(path);
      if (url.endsWith(batchId))
        return new Promise<Response>((resolve) => {
          release = resolve;
        });
      return Response.json(
        url.endsWith('/intake-batches')
          ? { items: [batch()], nextBefore: null }
          : project(),
      );
    }),
  );
  const rendered = render(<DossierIntakePanel {...props} />);
  fireEvent.click(await screen.findByRole('button', { name: /Reopen batch/ }));
  await waitFor(() => expect(release).toBeTypeOf('function'));
  rendered.rerender(
    <DossierIntakePanel
      {...props}
      scope="replaced-actor"
      companyId="00000000-0000-4000-8000-000000000154"
    />,
  );
  if (!release) throw new Error('Expected held read.');
  release(Response.json(batch(20, 'complete', 'completed')));
  expect(await screen.findByRole('alert')).toBeVisible();
  expect(screen.queryByText('Original preserved and selected')).toBeNull();
  expect(screen.queryByText(original.fileName)).toBeNull();
});
it('shows native Project and Client ownership before admitting files, without starting native writes', async () => {
  localStorage.setItem('prisma-prim.interface-locale', 'en');
  const fetcher = vi.fn(async (...[path]: [RequestInfo | URL, RequestInit?]) =>
    Response.json(
      String(path).endsWith('/intake-batches')
        ? { items: [], nextBefore: null }
        : {
            id: projectId,
            clientAccountId: clientId,
            clientDisplayName: 'Fictional Client',
            title: 'Fictional audit',
          },
    ),
  );
  vi.stubGlobal('fetch', fetcher);
  render(<DossierIntakePanel {...props} />);
  expect(
    await screen.findByText('Fictional audit · Fictional Client'),
  ).toBeVisible();
  expect(
    screen.getByRole('button', { name: 'Register reviewed batch' }),
  ).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Refresh progress' }));
  expect(fetcher.mock.calls.every(([, init]) => !init?.method)).toBe(true);
});

it('keeps an unreadable selected file counted while later exact originals remain available for admission', async () => {
  vi.stubGlobal('crypto', webcrypto);
  vi.stubGlobal(
    'fetch',
    vi.fn(async (path: RequestInfo | URL) =>
      Response.json(
        String(path).endsWith('/intake-batches')
          ? { items: [], nextBefore: null }
          : project(),
      ),
    ),
  );
  const unreadable = new File(
    ['Fictional unavailable bytes'],
    'unreadable.docx',
  );
  Object.defineProperty(unreadable, 'arrayBuffer', {
    value: async () => {
      throw new DOMException(
        'Synthetic device read failure',
        'NotReadableError',
      );
    },
  });
  render(<DossierIntakePanel {...props} />);
  await screen.findByText('Fictional audit · Fictional Client');
  fireEvent.change(screen.getByLabelText('Choose PDF / Word files'), {
    target: { files: [unreadable, selectedFile()] },
  });
  expect(
    await screen.findByText('File could not be read in this browser'),
  ).toBeVisible();
  expect(screen.getByText('unreadable.docx')).toBeVisible();
  expect(screen.getByText(original.fileName)).toBeVisible();
  fireEvent.click(
    screen.getByLabelText(
      'I reviewed the Project, Client, language and document metadata.',
    ),
  );
  expect(
    screen.getByRole('button', { name: 'Register reviewed batch' }),
  ).toBeEnabled();
});

it('unlocks reviewed metadata after a confirmed admission rejection and uses a new key for the corrected intent', async () => {
  vi.stubGlobal('crypto', webcrypto);
  const keys: (string | null)[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (path: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'POST') {
        keys.push(new Headers(init.headers).get('idempotency-key'));
        return Response.json(
          { message: 'Invalid intake metadata.' },
          { status: 400 },
        );
      }
      return Response.json(
        String(path).endsWith('/intake-batches')
          ? { items: [], nextBefore: null }
          : project(),
      );
    }),
  );
  render(<DossierIntakePanel {...props} />);
  await screen.findByText('Fictional audit · Fictional Client');
  fireEvent.change(screen.getByLabelText('Choose PDF / Word files'), {
    target: { files: [selectedFile()] },
  });
  const title = await screen.findByLabelText('Document title');
  fireEvent.click(
    screen.getByLabelText(
      'I reviewed the Project, Client, language and document metadata.',
    ),
  );
  fireEvent.click(
    screen.getByRole('button', { name: 'Register reviewed batch' }),
  );
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Batch registration was refused',
  );
  expect(title).toBeEnabled();
  expect(
    screen.queryByRole('button', { name: 'Retry batch registration' }),
  ).toBeNull();
  fireEvent.change(title, { target: { value: ' Report ' } });
  fireEvent.blur(title);
  expect(title).toHaveValue('Report');
  fireEvent.click(
    screen.getByLabelText(
      'I reviewed the Project, Client, language and document metadata.',
    ),
  );
  fireEvent.click(
    screen.getByRole('button', { name: 'Register reviewed batch' }),
  );
  await waitFor(() => expect(keys).toHaveLength(2));
  expect(keys[0]).toBeTruthy();
  expect(keys[1]).not.toBe(keys[0]);
});

it('opens a duplicate’s earlier actor-owned batch through a fresh private read', async () => {
  const duplicateId = '00000000-0000-4000-8000-000000000155';
  const primary = batch();
  const duplicate = {
    ...batch(),
    id: duplicateId,
    items: primary.items.map((item) => ({
      ...item,
      progress: {
        stage: 'duplicate',
        duplicateOf: { kind: 'batch', id: batchId, itemId: item.id },
      },
    })),
  };
  const fetcher = vi.fn(async (path: RequestInfo | URL) => {
    const url = String(path);
    return Response.json(
      url.endsWith('/intake-batches')
        ? { items: [duplicate], nextBefore: null }
        : url.endsWith(duplicateId)
          ? duplicate
          : url.endsWith(batchId)
            ? primary
            : project(),
    );
  });
  vi.stubGlobal('fetch', fetcher);
  render(<DossierIntakePanel {...props} />);
  fireEvent.click(await screen.findByRole('button', { name: /Reopen batch/ }));
  fireEvent.click(
    await screen.findByRole('button', {
      name: 'Open the earlier batch containing this original',
    }),
  );
  expect(
    await screen.findByText(/Original refused or unreadable/),
  ).toBeVisible();
  expect(screen.getByLabelText('Reselect original')).toBeEnabled();
  expect(
    fetcher.mock.calls.some(([path]) => String(path).endsWith(batchId)),
  ).toBe(true);
});

it('immediately retires the private batch display after live authority is denied', async () => {
  let denied = false;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (path: RequestInfo | URL) => {
      if (denied)
        return Response.json({ message: 'Forbidden' }, { status: 403 });
      const url = String(path);
      return Response.json(
        url.endsWith('/intake-batches')
          ? { items: [batch()], nextBefore: null }
          : url.endsWith(batchId)
            ? batch()
            : project(),
      );
    }),
  );
  render(<DossierIntakePanel {...props} />);
  fireEvent.click(await screen.findByRole('button', { name: /Reopen batch/ }));
  expect(await screen.findByText(original.fileName)).toBeVisible();
  denied = true;
  fireEvent.click(screen.getByRole('button', { name: 'Refresh progress' }));
  expect(await screen.findByRole('alert')).toBeVisible();
  expect(screen.queryByText(original.fileName)).toBeNull();
  expect(
    screen.queryByRole('button', { name: 'Start / resume intake' }),
  ).toBeNull();
  expect(props.onDenied).toHaveBeenCalledWith({ status: 'forbidden' });
});
