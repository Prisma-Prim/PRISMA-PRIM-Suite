import { webcrypto } from 'node:crypto';
import { within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import {
  fireEvent,
  render,
  screen,
} from '../test/render-with-interface-locale';
import { withCompanyGrants } from '../access/company-grants.test-fixture';
import { knowledgeActor } from '../knowledge-evidence/knowledge.test-fixture';
import type { BrowserIdentity } from '../access-composition';
import { DossierAnalysisWorkspace } from './DossierAnalysisWorkspace';
import { selectOption } from '../test/select-option';

const identity = {
  loaded: true,
  signedIn: true,
  signedOutView: null,
  getToken: async () => 'fictional-token',
  rejectSession: vi.fn(async () => undefined),
  signOut: vi.fn(async () => undefined),
} satisfies BrowserIdentity;
const props = {
  actor: {
    ...knowledgeActor,
    activeCompany: {
      ...knowledgeActor.activeCompany,
      grants: withCompanyGrants(knowledgeActor.activeCompany.grants, {
        bundle: 'company_project_access',
        version: 'v1',
        assignmentId: 'project-grant',
      }),
    },
  },
  identity,
  projectId: 'project-one',
  authorityGeneration: '1',
};
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  localStorage.clear();
});
it('shows the empty workspace and retains an explicit local-analysis boundary', async () => {
  localStorage.setItem('prisma-prim.interface-locale', 'en');
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      Response.json({
        format: 'DOSSIER_ANALYSIS/1',
        sources: [],
        runs: [],
        runsNextCursor: null,
      }),
    ),
  );
  render(<DossierAnalysisWorkspace {...props} />);
  expect(await screen.findByText('No analysis sources yet.')).toBeVisible();
  expect(screen.getByText(/only in this analysis/i)).toBeVisible();
});
it('withholds data when a workspace response is malformed and can retry', async () => {
  localStorage.setItem('prisma-prim.interface-locale', 'en');
  let first = true;
  const fetcher = vi.fn(async (input: RequestInfo | URL) => {
    if (!String(input).endsWith('/dossier-analysis'))
      return Response.json({ items: [] });
    if (first) {
      first = false;
      return Response.json({ sources: [] });
    }
    return Response.json({
      format: 'DOSSIER_ANALYSIS/1',
      sources: [],
      runs: [],
      runsNextCursor: null,
    });
  });
  vi.stubGlobal('fetch', fetcher);
  render(<DossierAnalysisWorkspace {...props} />);
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Analysis is unavailable',
  );
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  expect(await screen.findByText('No analysis sources yet.')).toBeVisible();
});
it('opens a historical run, shows partial coverage and preserves exact evidence text', async () => {
  localStorage.setItem('prisma-prim.interface-locale', 'en');
  const source = {
    id: '10000000-0000-4000-8000-000000000001',
    documentId: '20000000-0000-4000-8000-000000000001',
    documentVersionId: '30000000-0000-4000-8000-000000000001',
    kind: 'pdf',
    sourceSha256: 'a'.repeat(64),
    sizeBytes: 5,
    mediaType: 'application/pdf',
    representationId: '50000000-0000-4000-8000-000000000001',
    documentTitle: 'Fictional dossier',
    documentType: 'questionnaire',
    versionNumber: 1,
    versionStatus: 'official',
    fileName: 'fiction.pdf',
    language: 'ro',
    extraction: {
      state: 'partial',
      unitsTotal: 2,
      unitsReadable: 1,
      issues: [{ code: 'unreadable', locator: 'page 2' }],
      passages: [
        {
          locator: 'page 1',
          text: 'Cod fiscal: 123 Ж',
          sha256: 'a'.repeat(64),
        },
      ],
    },
  };
  const cit = {
    sourceId: '10000000-0000-4000-8000-000000000001',
    documentVersionId: '30000000-0000-4000-8000-000000000001',
    locator: 'page 1',
    start: 12,
    end: 17,
    quote: '123 Ж',
    passageSha256: 'a'.repeat(64),
  };
  const run = {
    id: '40000000-0000-4000-8000-000000000001',
    snapshotHash: 'b'.repeat(64),
    createdAt: '2026-01-01T00:00:00.000Z',
    stale: true,
  };
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const path = String(input);
      if (path.endsWith('/inventory')) return Response.json({ items: [] });
      if (path.endsWith('/runs/40000000-0000-4000-8000-000000000001'))
        return Response.json({
          ...run,
          sources: [source],
          candidates: [
            {
              field: 'taxId',
              value: '123 Ж',
              citation: cit,
              normalizationState: 'normalized',
              event: null,
            },
          ],
          comparisons: [],
          coverage: {
            missingDocuments: [],
            fields: [],
            truncatedCandidates: false,
            truncatedComparisons: false,
          },
          suggestions: [],
        });
      return Response.json({
        format: 'DOSSIER_ANALYSIS/1',
        sources: [source],
        runs: [{ ...run, stale: false }],
        runsNextCursor: null,
      });
    }),
  );
  const editor = {
    ...props.actor,
    activeCompany: {
      ...props.actor.activeCompany,
      grants: withCompanyGrants(props.actor.activeCompany.grants, {
        bundle: 'company_document_content_uploader',
        version: 'v1',
        assignmentId: 'uploader-grant',
      }),
    },
  };
  render(<DossierAnalysisWorkspace {...props} actor={editor} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Open run' }));
  expect(await screen.findByText('123 Ж')).toBeVisible();
  expect(screen.getAllByText(/Partial/).length).toBeGreaterThan(0);
  expect(screen.getByText(/This part could not be read. page 2/)).toBeVisible();
  expect(screen.getAllByText(/Historical \/ stale/).length).toBeGreaterThan(0);
  expect(
    screen.getByRole('button', { name: 'Open run' }).closest('li'),
  ).toHaveTextContent('Historical / stale');
});
it('does not render a response from a retired project', async () => {
  localStorage.setItem('prisma-prim.interface-locale', 'en');
  let complete: (response: Response) => void = () => undefined;
  const first = new Promise<Response>((resolve) => {
    complete = resolve;
  });
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const path = String(input);
      if (path.endsWith('/inventory')) return Response.json({ items: [] });
      if (path.includes('project-one')) return first;
      return Response.json({
        format: 'DOSSIER_ANALYSIS/1',
        sources: [],
        runs: [],
        runsNextCursor: null,
      });
    }),
  );
  const mounted = render(<DossierAnalysisWorkspace {...props} />);
  mounted.rerender(
    <DossierAnalysisWorkspace {...props} projectId="project-two" />,
  );
  expect(await screen.findByText('No analysis sources yet.')).toBeVisible();
  complete(
    Response.json({
      format: 'DOSSIER_ANALYSIS/1',
      sources: [{ documentTitle: 'Hidden old source' }],
      runs: [],
      runsNextCursor: null,
    }),
  );
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(screen.queryByText('Hidden old source')).not.toBeInTheDocument();
});
it('selects a native PDF and retries an uncertain write with the same request key and body', async () => {
  localStorage.setItem('prisma-prim.interface-locale', 'en');
  const editor = {
    ...props.actor,
    activeCompany: {
      ...props.actor.activeCompany,
      grants: withCompanyGrants(props.actor.activeCompany.grants, {
        bundle: 'company_document_content_uploader',
        version: 'v1',
        assignmentId: 'uploader-grant',
      }),
    },
  };
  const writes: { body: BodyInit | null | undefined; key: string | null }[] =
    [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      if (path.endsWith('/inventory'))
        return Response.json({
          items: [
            {
              documentId: '20000000-0000-4000-8000-000000000001',
              documentTitle: 'Fictional',
              documentType: 'questionnaire',
              documentVersionId: '30000000-0000-4000-8000-000000000001',
              versionNumber: 1,
              versionStatus: 'draft',
              representationId: '50000000-0000-4000-8000-000000000001',
              fileName: 'fiction.pdf',
              kind: 'pdf',
              caseId: null,
              attachmentId: null,
            },
          ],
        });
      if (path.endsWith('/sources') && init?.method === 'POST') {
        writes.push({
          body: init.body,
          key: new Headers(init.headers).get('Idempotency-Key'),
        });
        if (writes.length === 1) throw new Error('Disconnected');
        return Response.json({ id: '10000000-0000-4000-8000-000000000001' });
      }
      return Response.json({
        format: 'DOSSIER_ANALYSIS/1',
        sources: [],
        runs: [],
        runsNextCursor: null,
      });
    }),
  );
  render(<DossierAnalysisWorkspace {...props} actor={editor} />);
  const selector = await screen.findByLabelText('Document and version');
  fireEvent.click(selector);
  await screen.findByRole('option', { name: /Fictional/ });
  selectOption(selector, '0');
  fireEvent.click(screen.getByRole('button', { name: 'Add PDF' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Retry' }));
  await vi.waitFor(() => expect(writes).toHaveLength(2));
  expect(writes[1]).toEqual(writes[0]);
  expect(writes[0]?.key).toBeTruthy();
});
it('withholds a run whose citation does not match its literal source passage', async () => {
  localStorage.setItem('prisma-prim.interface-locale', 'en');
  const source = {
    id: '10000000-0000-4000-8000-000000000001',
    documentId: '20000000-0000-4000-8000-000000000001',
    documentVersionId: '30000000-0000-4000-8000-000000000001',
    kind: 'pdf',
    sourceSha256: 'a'.repeat(64),
    sizeBytes: 5,
    mediaType: 'application/pdf',
    representationId: '50000000-0000-4000-8000-000000000001',
    documentTitle: 'Fictional',
    documentType: 'questionnaire',
    versionNumber: 1,
    versionStatus: 'draft',
    fileName: 'fiction.pdf',
    language: 'en',
    extraction: {
      state: 'complete',
      unitsTotal: 1,
      unitsReadable: 1,
      issues: [],
      passages: [
        { locator: 'page 1', text: 'Actual evidence', sha256: 'a'.repeat(64) },
      ],
    },
  };
  const run = {
    id: '40000000-0000-4000-8000-000000000001',
    snapshotHash: 'b'.repeat(64),
    createdAt: '2026-01-01T00:00:00.000Z',
    stale: false,
  };
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const path = String(input);
      if (path.endsWith('/inventory')) return Response.json({ items: [] });
      if (path.endsWith('/runs/40000000-0000-4000-8000-000000000001'))
        return Response.json({
          ...run,
          sources: [source],
          candidates: [
            {
              field: 'taxId',
              normalizationState: 'normalized',
              event: null,
              value: 'invented',
              citation: {
                sourceId: '10000000-0000-4000-8000-000000000001',
                documentVersionId: '30000000-0000-4000-8000-000000000001',
                locator: 'page 1',
                start: 0,
                end: 8,
                quote: 'invented',
                passageSha256: 'a'.repeat(64),
              },
            },
          ],
          comparisons: [],
          coverage: {
            missingDocuments: [],
            fields: [],
            truncatedCandidates: false,
            truncatedComparisons: false,
          },
          suggestions: [],
        });
      return Response.json({
        format: 'DOSSIER_ANALYSIS/1',
        sources: [source],
        runs: [run],
        runsNextCursor: null,
      });
    }),
  );
  render(<DossierAnalysisWorkspace {...props} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Open run' }));
  expect(await screen.findByText('Invalid response.')).toBeVisible();
  expect(screen.queryByText('invented')).not.toBeInTheDocument();
});
it('rejects a run response for a different run identity', async () => {
  localStorage.setItem('prisma-prim.interface-locale', 'en');
  const run = {
    id: '40000000-0000-4000-8000-000000000001',
    snapshotHash: 'b'.repeat(64),
    createdAt: '2026-01-01T00:00:00.000Z',
    stale: false,
  };
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const path = String(input);
      if (path.endsWith('/inventory')) return Response.json({ items: [] });
      if (path.includes('/runs/'))
        return Response.json({
          ...run,
          id: '40000000-0000-4000-8000-000000000002',
          sources: [],
          candidates: [],
          comparisons: [],
          coverage: {
            missingDocuments: [],
            fields: [],
            truncatedCandidates: false,
            truncatedComparisons: false,
          },
          suggestions: [],
        });
      return Response.json({
        format: 'DOSSIER_ANALYSIS/1',
        sources: [],
        runs: [run],
        runsNextCursor: null,
      });
    }),
  );
  render(<DossierAnalysisWorkspace {...props} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Open run' }));
  expect(await screen.findByText('Invalid response.')).toBeVisible();
});
it('retires a late inventory response after access is denied', async () => {
  localStorage.setItem('prisma-prim.interface-locale', 'en');
  let finish: (r: Response) => void = () => undefined;
  const slow = new Promise<Response>((resolve) => {
    finish = resolve;
  });
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) =>
      String(input).endsWith('/inventory')
        ? new Response(null, { status: 404 })
        : slow,
    ),
  );
  render(<DossierAnalysisWorkspace {...props} />);
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Analysis is unavailable',
  );
  finish(
    Response.json({
      format: 'DOSSIER_ANALYSIS/1',
      sources: [],
      runs: [],
      runsNextCursor: null,
    }),
  );
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(
    screen.queryByText('No analysis sources yet.'),
  ).not.toBeInTheDocument();
});
it('preserves the DOCX file and idempotency key after an uncertain upload', async () => {
  localStorage.setItem('prisma-prim.interface-locale', 'en');
  const editor = {
    ...props.actor,
    activeCompany: {
      ...props.actor.activeCompany,
      grants: withCompanyGrants(props.actor.activeCompany.grants, {
        bundle: 'company_document_content_uploader',
        version: 'v1',
        assignmentId: 'uploader-grant',
      }),
    },
  };
  const writes: {
    body: BodyInit | null | undefined;
    key: string | null;
    url: string;
  }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      if (path.endsWith('/inventory'))
        return Response.json({
          items: [
            {
              documentId: '20000000-0000-4000-8000-000000000001',
              documentTitle: 'Fictional',
              documentType: 'questionnaire',
              documentVersionId: '30000000-0000-4000-8000-000000000001',
              versionNumber: 1,
              versionStatus: 'draft',
              representationId: null,
              fileName: null,
              kind: 'docx',
              caseId: null,
              attachmentId: null,
            },
          ],
        });
      if (path.includes('/sources/docx?')) {
        writes.push({
          body: init?.body,
          key: new Headers(init?.headers).get('Idempotency-Key'),
          url: path,
        });
        if (writes.length === 1) throw new Error('Disconnected');
        return Response.json({ id: '10000000-0000-4000-8000-000000000001' });
      }
      return Response.json({
        format: 'DOSSIER_ANALYSIS/1',
        sources: [],
        runs: [],
        runsNextCursor: null,
      });
    }),
  );
  render(<DossierAnalysisWorkspace {...props} actor={editor} />);
  const selector = await screen.findByLabelText('Document and version');
  fireEvent.click(selector);
  await screen.findByRole('option', { name: /Fictional/ });
  selectOption(selector, '0');
  const file = new File(['fictional original'], 'fiction.docx', {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
  fireEvent.change(screen.getByLabelText('Choose file'), {
    target: { files: [file] },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Upload DOCX' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Retry' }));
  await vi.waitFor(() => expect(writes).toHaveLength(2));
  expect(writes[0]?.body).toBe(file);
  expect(writes[1]).toEqual(writes[0]);
});
it('refuses original bytes whose hash does not match the source metadata', async () => {
  localStorage.setItem('prisma-prim.interface-locale', 'en');
  vi.stubGlobal('crypto', webcrypto);
  const source = {
    id: '10000000-0000-4000-8000-000000000001',
    documentId: '20000000-0000-4000-8000-000000000001',
    documentVersionId: '30000000-0000-4000-8000-000000000001',
    kind: 'pdf',
    sourceSha256: 'a'.repeat(64),
    sizeBytes: 11,
    mediaType: 'application/pdf',
    representationId: '50000000-0000-4000-8000-000000000001',
    documentTitle: 'Fictional',
    documentType: 'questionnaire',
    versionNumber: 1,
    versionStatus: 'draft',
    fileName: 'fiction.pdf',
    language: 'en',
    extraction: {
      state: 'complete',
      unitsTotal: 1,
      unitsReadable: 1,
      issues: [],
      passages: [
        { locator: 'page 1', text: 'Actual evidence', sha256: 'b'.repeat(64) },
      ],
    },
  };
  const run = {
    id: '40000000-0000-4000-8000-000000000001',
    snapshotHash: 'c'.repeat(64),
    createdAt: '2026-01-01T00:00:00.000Z',
    stale: false,
  };
  const cit = {
    sourceId: source.id,
    documentVersionId: source.documentVersionId,
    locator: 'page 1',
    start: 0,
    end: 6,
    quote: 'Actual',
    passageSha256: 'b'.repeat(64),
  };
  const create = vi.fn();
  vi.stubGlobal(
    'URL',
    Object.assign(class extends URL {}, { createObjectURL: create }),
  );
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const path = String(input);
      if (path.endsWith('/inventory')) return Response.json({ items: [] });
      if (path.endsWith('/original'))
        return new Response('wrong bytes', {
          headers: { 'content-type': 'application/pdf' },
        });
      if (path.includes('/runs/'))
        return Response.json({
          ...run,
          sources: [source],
          candidates: [
            {
              field: 'taxId',
              value: 'Actual',
              normalizationState: 'normalized',
              event: null,
              citation: cit,
            },
          ],
          comparisons: [],
          coverage: {
            missingDocuments: [],
            fields: [],
            truncatedCandidates: false,
            truncatedComparisons: false,
          },
          suggestions: [],
        });
      return Response.json({
        format: 'DOSSIER_ANALYSIS/1',
        sources: [source],
        runs: [run],
        runsNextCursor: null,
      });
    }),
  );
  render(<DossierAnalysisWorkspace {...props} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Open run' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Open original' }));
  expect(
    await screen.findByText(
      'Action could not be completed. Refresh and try again.',
    ),
  ).toBeVisible();
  expect(create).not.toHaveBeenCalled();
});
it('submits a cited manual suggestion and a correction with the current revision', async () => {
  localStorage.setItem('prisma-prim.interface-locale', 'en');
  const editor = {
    ...props.actor,
    activeCompany: {
      ...props.actor.activeCompany,
      grants: withCompanyGrants(props.actor.activeCompany.grants, {
        bundle: 'company_document_content_uploader',
        version: 'v1',
        assignmentId: 'uploader-grant',
      }),
    },
  };
  const source = {
    id: '10000000-0000-4000-8000-000000000001',
    documentId: '20000000-0000-4000-8000-000000000001',
    documentVersionId: '30000000-0000-4000-8000-000000000001',
    kind: 'pdf',
    sourceSha256: 'a'.repeat(64),
    sizeBytes: 5,
    mediaType: 'application/pdf',
    representationId: '50000000-0000-4000-8000-000000000001',
    documentTitle: 'Fictional',
    documentType: 'questionnaire',
    versionNumber: 1,
    versionStatus: 'draft',
    fileName: 'fiction.pdf',
    language: 'en',
    extraction: {
      state: 'complete',
      unitsTotal: 1,
      unitsReadable: 1,
      issues: [],
      passages: [
        { locator: 'page 1', text: 'Tax ID: 123', sha256: 'b'.repeat(64) },
      ],
    },
  };
  const cit = {
    sourceId: source.id,
    documentVersionId: source.documentVersionId,
    locator: 'page 1',
    start: 8,
    end: 11,
    quote: '123',
    passageSha256: 'b'.repeat(64),
  };
  const run = {
    id: '40000000-0000-4000-8000-000000000001',
    snapshotHash: 'c'.repeat(64),
    createdAt: '2026-01-01T00:00:00.000Z',
    stale: false,
  };
  const suggestion = {
    id: '60000000-0000-4000-8000-000000000001',
    revision: 2,
    createdAt: run.createdAt,
    proposal: {
      field: 'taxId',
      value: '123',
      rationale: 'Fictional',
      citations: [cit],
    },
    reviews: [
      {
        revision: 2,
        decision: 'confirm',
        replacementValue: null,
        actorDisplayName: 'Fictional reviewer',
        recordedAt: run.createdAt,
      },
    ],
  };
  const writes: { url: string; body: unknown }[] = [];
  const searches: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      if (init?.method === 'POST') {
        writes.push({ url: path, body: JSON.parse(String(init.body)) });
        return Response.json({ id: suggestion.id });
      }
      if (path.endsWith('/inventory')) return Response.json({ items: [] });
      if (path.includes('/search?')) {
        searches.push(path);
        return Response.json({
          snapshotHash: run.snapshotHash,
          truncated: false,
          nextCursor: searches.length === 1 ? 'next-token' : null,
          hits: [
            {
              source,
              passage: source.extraction.passages[0],
              score: 80,
              reason: 'lexical',
            },
          ],
        });
      }
      if (path.includes('/runs/'))
        return Response.json({
          ...run,
          sources: [source],
          candidates: [],
          comparisons: [],
          coverage: {
            missingDocuments: [],
            fields: [],
            truncatedCandidates: false,
            truncatedComparisons: false,
          },
          suggestions: [suggestion],
        });
      return Response.json({
        format: 'DOSSIER_ANALYSIS/1',
        sources: [source],
        runs: [run],
        runsNextCursor: null,
      });
    }),
  );
  render(<DossierAnalysisWorkspace {...props} actor={editor} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Open run' }));
  expect(await screen.findByText(/Fictional reviewer/)).toBeVisible();
  fireEvent.change(screen.getByLabelText('Replacement value'), {
    target: { value: '456' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Correct' }));
  await vi.waitFor(() => expect(writes).toHaveLength(1));
  expect(writes[0]?.body).toEqual({
    expectedRevision: 2,
    decision: 'correct',
    replacementValue: '456',
  });
  await screen.findByRole('button', { name: 'Confirm' });
  await vi.waitFor(() =>
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeEnabled(),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
  await vi.waitFor(() => expect(writes).toHaveLength(2));
  expect(writes[1]?.body).toEqual({ expectedRevision: 2, decision: 'confirm' });
  await vi.waitFor(() =>
    expect(screen.getByRole('button', { name: 'Reject' })).toBeEnabled(),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Reject' }));
  await vi.waitFor(() => expect(writes).toHaveLength(3));
  expect(writes[2]?.body).toEqual({ expectedRevision: 2, decision: 'reject' });
  await vi.waitFor(() =>
    expect(screen.getByRole('button', { name: 'Correct' })).toBeEnabled(),
  );
  fireEvent.change(screen.getByLabelText('Value'), {
    target: { value: '123' },
  });
  fireEvent.change(screen.getByLabelText('Rationale'), {
    target: { value: 'From source' },
  });
  selectOption(screen.getByLabelText('Citation passage'), '0');
  fireEvent.click(
    within(screen.getByRole('group', { name: 'Manual suggestion' })).getByRole(
      'button',
      { name: 'Submit' },
    ),
  );
  await vi.waitFor(() => expect(writes).toHaveLength(4));
  expect(writes[3]?.body).toMatchObject({
    snapshotHash: run.snapshotHash,
    suggestions: [
      {
        field: 'taxId',
        value: '123',
        rationale: 'From source',
        citations: [{ sourceId: source.id, quote: 'Tax ID: 123' }],
      },
    ],
  });
  await screen.findByRole('group', { name: 'Import proposal JSON' });
  const malformed = new File(['{'], 'proposal.json', {
    type: 'application/json',
  });
  Object.defineProperty(malformed, 'text', { value: async () => '{' });
  fireEvent.change(screen.getByLabelText('Import proposal JSON'), {
    target: { files: [malformed] },
  });
  fireEvent.click(
    within(
      screen.getByRole('group', { name: 'Import proposal JSON' }),
    ).getByRole('button', { name: 'Submit' }),
  );
  expect(await screen.findByText('Invalid response.')).toBeVisible();
  expect(writes).toHaveLength(4);
  fireEvent.change(screen.getByLabelText('Query'), {
    target: { value: 'Tax ID' },
  });
  selectOption(screen.getByLabelText('Search evidence'), 'lexical');
  selectOption(screen.getByLabelText('Source'), source.id);
  fireEvent.click(screen.getByRole('button', { name: 'Search' }));
  fireEvent.click(await screen.findByRole('button', { name: 'More results' }));
  await vi.waitFor(() => expect(searches).toHaveLength(2));
  expect(searches[0]).toContain('mode=lexical');
  expect(searches[0]).toContain('sourceId=' + source.id);
  expect(searches[1]).toContain('cursor=next-token');
});
it.each([
  { state: 'normalized', field: 'taxId', label: 'Normalized' },
  { state: 'ambiguous', field: 'auditDate', label: 'Ambiguous' },
  { state: 'invalid', field: 'validUntil', label: 'Invalid' },
  { state: 'unsupported', field: 'scope', label: 'Not normalized' },
  { state: 'unexpected', field: 'scope', label: null },
])(
  'renders or rejects the engine normalization state $state',
  async ({ state, field, label }) => {
    localStorage.setItem('prisma-prim.interface-locale', 'en');
    const source = {
      id: '10000000-0000-4000-8000-000000000001',
      documentId: '20000000-0000-4000-8000-000000000001',
      documentVersionId: '30000000-0000-4000-8000-000000000001',
      kind: 'pdf',
      sourceSha256: 'a'.repeat(64),
      sizeBytes: 5,
      mediaType: 'application/pdf',
      representationId: '50000000-0000-4000-8000-000000000001',
      documentTitle: 'Fictional',
      documentType: 'questionnaire',
      versionNumber: 1,
      versionStatus: 'draft',
      fileName: 'fiction.pdf',
      language: 'en',
      extraction: {
        state: 'complete',
        unitsTotal: 1,
        unitsReadable: 1,
        issues: [],
        passages: [
          { locator: 'page 1', text: 'Evidence', sha256: 'b'.repeat(64) },
        ],
      },
    };
    const run = {
      id: '40000000-0000-4000-8000-000000000001',
      snapshotHash: 'c'.repeat(64),
      createdAt: '2026-01-01T00:00:00.000Z',
      stale: false,
    };
    const citation = {
      sourceId: source.id,
      documentVersionId: source.documentVersionId,
      locator: 'page 1',
      start: 0,
      end: 8,
      quote: 'Evidence',
      passageSha256: 'b'.repeat(64),
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const path = String(input);
        if (path.endsWith('/inventory')) return Response.json({ items: [] });
        if (path.includes('/runs/'))
          return Response.json({
            ...run,
            sources: [source],
            candidates: [
              {
                field,
                value: 'Evidence',
                normalizationState: state,
                event: null,
                citation,
              },
            ],
            comparisons: [],
            coverage: {
              missingDocuments: [],
              fields: [],
              truncatedCandidates: false,
              truncatedComparisons: false,
            },
            suggestions: [],
          });
        return Response.json({
          format: 'DOSSIER_ANALYSIS/1',
          sources: [source],
          runs: [run],
          runsNextCursor: null,
        });
      }),
    );
    render(<DossierAnalysisWorkspace {...props} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Open run' }));
    if (label) {
      expect(await screen.findByText('Evidence')).toBeVisible();
      expect(screen.getByText(new RegExp(label))).toBeVisible();
      expect(screen.queryByText('Invalid response.')).not.toBeInTheDocument();
    } else {
      expect(await screen.findByText('Invalid response.')).toBeVisible();
      expect(screen.queryByText('Evidence')).not.toBeInTheDocument();
    }
  },
);
it('submits a short unique quote from a long passage and refuses missing or repeated quotes', async () => {
  localStorage.setItem('prisma-prim.interface-locale', 'en');
  const editor = {
    ...props.actor,
    activeCompany: {
      ...props.actor.activeCompany,
      grants: withCompanyGrants(props.actor.activeCompany.grants, {
        bundle: 'company_document_content_uploader',
        version: 'v1',
        assignmentId: 'uploader-grant',
      }),
    },
  };
  const text = 'Repeated phrase. '.repeat(17000) + 'Distinct tax number 12345.';
  const source = {
    id: '10000000-0000-4000-8000-000000000001',
    documentId: '20000000-0000-4000-8000-000000000001',
    documentVersionId: '30000000-0000-4000-8000-000000000001',
    kind: 'pdf',
    sourceSha256: 'a'.repeat(64),
    sizeBytes: 5,
    mediaType: 'application/pdf',
    representationId: '50000000-0000-4000-8000-000000000001',
    documentTitle: 'Fictional',
    documentType: 'questionnaire',
    versionNumber: 1,
    versionStatus: 'draft',
    fileName: 'fiction.pdf',
    language: 'en',
    extraction: {
      state: 'complete',
      unitsTotal: 1,
      unitsReadable: 1,
      issues: [],
      passages: [{ locator: 'page 1', text, sha256: 'b'.repeat(64) }],
    },
  };
  const run = {
    id: '40000000-0000-4000-8000-000000000001',
    snapshotHash: 'c'.repeat(64),
    createdAt: '2026-01-01T00:00:00.000Z',
    stale: false,
  };
  const writes: unknown[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      if (init?.method === 'POST') {
        writes.push(JSON.parse(String(init.body)));
        return Response.json({ id: '60000000-0000-4000-8000-000000000001' });
      }
      if (path.endsWith('/inventory')) return Response.json({ items: [] });
      if (path.includes('/runs/'))
        return Response.json({
          ...run,
          sources: [source],
          candidates: [],
          comparisons: [],
          coverage: {
            missingDocuments: [],
            fields: [],
            truncatedCandidates: false,
            truncatedComparisons: false,
          },
          suggestions: [],
        });
      return Response.json({
        format: 'DOSSIER_ANALYSIS/1',
        sources: [source],
        runs: [run],
        runsNextCursor: null,
      });
    }),
  );
  render(<DossierAnalysisWorkspace {...props} actor={editor} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Open run' }));
  fireEvent.change(await screen.findByLabelText('Value'), {
    target: { value: '12345' },
  });
  fireEvent.change(screen.getByLabelText('Rationale'), {
    target: { value: 'From the source' },
  });
  selectOption(screen.getByLabelText('Citation passage'), '0');
  const quote = screen.getByLabelText('Exact quote');
  const submit = within(
    screen.getByRole('group', { name: 'Manual suggestion' }),
  ).getByRole('button', { name: 'Submit' });
  fireEvent.change(quote, { target: { value: 'not present' } });
  expect(submit).toBeDisabled();
  fireEvent.change(quote, { target: { value: 'Repeated phrase' } });
  expect(submit).toBeDisabled();
  expect(writes).toHaveLength(0);
  selectOption(screen.getByLabelText('Citation passage'), '');
  expect(quote).toHaveValue('');
  selectOption(screen.getByLabelText('Citation passage'), '0');
  fireEvent.change(quote, { target: { value: 'Distinct tax number 12345' } });
  expect(submit).toBeEnabled();
  fireEvent.click(submit);
  await vi.waitFor(() => expect(writes).toHaveLength(1));
  expect(writes[0]).toMatchObject({
    snapshotHash: run.snapshotHash,
    suggestions: [
      {
        citations: [
          {
            sourceId: source.id,
            documentVersionId: source.documentVersionId,
            locator: 'page 1',
            start: text.indexOf('Distinct tax number 12345'),
            end:
              text.indexOf('Distinct tax number 12345') +
              'Distinct tax number 12345'.length,
            quote: 'Distinct tax number 12345',
            passageSha256: 'b'.repeat(64),
          },
        ],
      },
    ],
  });
});
it.each([{ stale: false }, { stale: true }])(
  'requires an explicit choice before searching a stale run ($stale)',
  async ({ stale }) => {
    localStorage.setItem('prisma-prim.interface-locale', 'en');
    const run = {
      id: '40000000-0000-4000-8000-000000000001',
      snapshotHash: 'c'.repeat(64),
      createdAt: '2026-01-01T00:00:00.000Z',
      stale,
    };
    const searches: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const path = String(input);
        if (path.endsWith('/inventory')) return Response.json({ items: [] });
        if (path.includes('/search?')) {
          searches.push(path);
          return Response.json({
            snapshotHash: run.snapshotHash,
            hits: [],
            nextCursor: null,
            truncated: false,
          });
        }
        if (path.includes('/runs/'))
          return Response.json({
            ...run,
            sources: [],
            candidates: [],
            comparisons: [],
            coverage: {
              missingDocuments: [],
              fields: [],
              truncatedCandidates: false,
              truncatedComparisons: false,
            },
            suggestions: [],
          });
        return Response.json({
          format: 'DOSSIER_ANALYSIS/1',
          sources: [],
          runs: [run],
          runsNextCursor: null,
        });
      }),
    );
    render(<DossierAnalysisWorkspace {...props} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Open run' }));
    fireEvent.change(await screen.findByLabelText('Query'), {
      target: { value: 'evidence' },
    });
    const button = screen.getByRole('button', { name: 'Search' });
    if (stale) {
      expect(button).toBeDisabled();
      expect(searches).toHaveLength(0);
      fireEvent.click(screen.getByLabelText('Search this historical run'));
    } else
      expect(
        screen.queryByLabelText('Search this historical run'),
      ).not.toBeInTheDocument();
    fireEvent.click(button);
    await vi.waitFor(() => expect(searches).toHaveLength(1));
    expect(searches[0]?.includes('history=true')).toBe(stale);
  },
);
it('loads more run history without closing the selected run and rejects repeated cursors', async () => {
  localStorage.setItem('prisma-prim.interface-locale', 'en');
  const first = {
    id: '40000000-0000-4000-8000-000000000001',
    snapshotHash: 'c'.repeat(64),
    createdAt: '2026-01-02T00:00:00.000Z',
    stale: false,
  };
  const second = {
    ...first,
    id: '40000000-0000-4000-8000-000000000002',
    createdAt: '2026-01-01T00:00:00.000Z',
  };
  let pages = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const path = String(input);
      if (path.endsWith('/inventory')) return Response.json({ items: [] });
      if (path.includes('/runs?')) {
        pages++;
        return Response.json({ runs: [second], runsNextCursor: 'cursor-one' });
      }
      if (path.includes('/runs/'))
        return Response.json({
          ...first,
          sources: [],
          candidates: [],
          comparisons: [],
          coverage: {
            missingDocuments: [],
            fields: [],
            truncatedCandidates: false,
            truncatedComparisons: false,
          },
          suggestions: [],
        });
      return Response.json({
        format: 'DOSSIER_ANALYSIS/1',
        sources: [],
        runs: [first],
        runsNextCursor: 'cursor-one',
      });
    }),
  );
  render(<DossierAnalysisWorkspace {...props} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Open run' }));
  expect(
    await screen.findByRole('button', { name: 'Context JSON' }),
  ).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'More run history' }));
  expect(await screen.findByText('Could not load more history.')).toBeVisible();
  expect(screen.getByRole('button', { name: 'Context JSON' })).toBeVisible();
  expect(
    screen.queryByText(new RegExp(second.createdAt)),
  ).not.toBeInTheDocument();
  expect(pages).toBe(1);
});
it('appends a valid history page', async () => {
  localStorage.setItem('prisma-prim.interface-locale', 'en');
  const first = {
    id: '40000000-0000-4000-8000-000000000001',
    snapshotHash: 'c'.repeat(64),
    createdAt: '2026-01-02T00:00:00.000Z',
    stale: false,
  };
  const second = {
    ...first,
    id: '40000000-0000-4000-8000-000000000002',
    createdAt: '2026-01-01T00:00:00.000Z',
  };
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const path = String(input);
      if (path.endsWith('/inventory')) return Response.json({ items: [] });
      if (path.includes('/runs?'))
        return Response.json({ runs: [second], runsNextCursor: null });
      return Response.json({
        format: 'DOSSIER_ANALYSIS/1',
        sources: [],
        runs: [first],
        runsNextCursor: 'cursor-one',
      });
    }),
  );
  render(<DossierAnalysisWorkspace {...props} />);
  fireEvent.click(
    await screen.findByRole('button', { name: 'More run history' }),
  );
  expect(await screen.findByText(new RegExp(second.createdAt))).toBeVisible();
  expect(
    screen.queryByRole('button', { name: 'More run history' }),
  ).not.toBeInTheDocument();
});
it('rejects a workspace without a valid history cursor', async () => {
  localStorage.setItem('prisma-prim.interface-locale', 'en');
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) =>
      String(input).endsWith('/inventory')
        ? Response.json({ items: [] })
        : Response.json({
            format: 'DOSSIER_ANALYSIS/1',
            sources: [],
            runs: [],
          }),
    ),
  );
  render(<DossierAnalysisWorkspace {...props} />);
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Analysis is unavailable',
  );
});
it('ignores a late history page after the Project changes', async () => {
  localStorage.setItem('prisma-prim.interface-locale', 'en');
  const run = {
    id: '40000000-0000-4000-8000-000000000001',
    snapshotHash: 'c'.repeat(64),
    createdAt: '2026-01-02T00:00:00.000Z',
    stale: false,
  };
  const old = {
    ...run,
    id: '40000000-0000-4000-8000-000000000002',
    createdAt: '2024-01-01T00:00:00.000Z',
  };
  let finish: (response: Response) => void = () => undefined;
  const pending = new Promise<Response>((resolve) => {
    finish = resolve;
  });
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const path = String(input);
      if (path.endsWith('/inventory')) return Response.json({ items: [] });
      if (path.includes('/runs?')) return pending;
      if (path.includes('project-one'))
        return Response.json({
          format: 'DOSSIER_ANALYSIS/1',
          sources: [],
          runs: [run],
          runsNextCursor: 'next',
        });
      return Response.json({
        format: 'DOSSIER_ANALYSIS/1',
        sources: [],
        runs: [],
        runsNextCursor: null,
      });
    }),
  );
  const mounted = render(<DossierAnalysisWorkspace {...props} />);
  fireEvent.click(
    await screen.findByRole('button', { name: 'More run history' }),
  );
  mounted.rerender(
    <DossierAnalysisWorkspace {...props} projectId="project-two" />,
  );
  expect(await screen.findByText('No runs yet.')).toBeVisible();
  finish(Response.json({ runs: [old], runsNextCursor: null }));
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(screen.queryByText(/2024-01-01/)).not.toBeInTheDocument();
});
