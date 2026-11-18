import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  act,
  fireEvent,
  render,
  screen,
  within,
} from '../test/render-with-interface-locale';
import { selectOption } from '../test/select-option';
import { CertificationWorkspace } from './CertificationWorkspace';
import {
  FakeCertificationServer,
  certificationActor,
  certificationIdentity,
  certificationIds,
} from './certification.test-fixture';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
const runId = '14530000-0000-4000-8000-000000000001';
const suggestionId = '14530000-0000-4000-8000-000000000002';
const quote = 'Firma Fictivă SRL';
function preview(caseId: string) {
  return {
    format: 'CERTIFICATION_APPLICATION_DRAFT/1',
    target: { caseId, projectId: certificationIds.project, revision: 1 },
    run: { id: runId, snapshotHash: 'a'.repeat(64) },
    candidates: [
      {
        field: 'declaredLegalName',
        value: quote,
        proposalValue: quote,
        suggestionId,
        reviewRevision: 1,
        reviewer: 'Fictional Reviewer',
        reviewedAt: '2026-11-18T08:00:00Z',
        citations: [
          {
            sourceId: '14530000-0000-4000-8000-000000000003',
            documentVersionId: '14530000-0000-4000-8000-000000000004',
            locator: 'word/document.xml:p:1',
            documentTitle: 'Fictional reviewed source',
            fileName: 'fictiv-ru-ro.docx',
            versionNumber: 1,
            start: 0,
            end: quote.length,
            quote,
            passageSha256: 'b'.repeat(64),
          },
        ],
      },
    ],
  };
}

describe('Controlled application draft preparation', () => {
  it('keeps literal edits until a reviewed field is deliberately selected and revalidated, then inserts only that field without posting a Case act', async () => {
    const full = certificationActor({ manager: true, documents: true });
    const actor = {
      ...full,
      activeCompany: full.activeCompany
        ? {
            ...full.activeCompany,
            grants: full.activeCompany.grants.filter(
              (grant) =>
                grant.bundle !== 'company_received_audit_source_access',
            ),
          }
        : undefined,
    };
    const server = new FakeCertificationServer({ actor: () => actor });
    const caseId = server.seed({ orderReference: 'CERT-PREFILL' });
    server.interceptions.push({
      match: (r) => r.path.endsWith('/dossier-analysis'),
      respond: () =>
        Response.json({
          runs: [
            {
              id: runId,
              snapshotHash: 'a'.repeat(64),
              createdAt: '2026-11-18T08:00:00Z',
              stale: false,
            },
          ],
          runsNextCursor: null,
        }),
    });
    for (let i = 0; i < 2; i++)
      server.interceptions.push({
        match: (r) => r.path.endsWith('/certification-draft'),
        respond: () => Response.json(preview(caseId)),
      });
    server.install();
    render(
      <CertificationWorkspace
        actor={actor}
        identity={certificationIdentity}
        projectId={certificationIds.project}
      />,
    );
    fireEvent.click(
      await screen.findByRole('button', { name: 'CERT-PREFILL' }),
    );
    const form = await screen.findByRole('form', {
      name: 'Record the application',
    });
    fireEvent.change(within(form).getByLabelText('Declared legal name'), {
      target: { value: 'Literal earlier draft' },
    });
    fireEvent.change(within(form).getByLabelText('Declared address'), {
      target: { value: 'Preserve this address' },
    });
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Prepare from reviewed analysis',
      }),
    );
    const select = await screen.findByLabelText('Analysis run');
    selectOption(select, runId);
    fireEvent.click(
      screen.getByRole('button', { name: 'Preview reviewed values' }),
    );
    const choice = await screen.findByRole('checkbox', {
      name: 'Use Declared legal name: Firma Fictivă SRL',
    });
    expect(choice).not.toBeChecked();
    expect(within(form).getByLabelText('Declared legal name')).toHaveValue(
      'Literal earlier draft',
    );
    expect(
      screen.getByRole('button', { name: 'Insert selected values into draft' }),
    ).toBeDisabled();
    expect(screen.getByText('word/document.xml:p:1')).toBeVisible();
    fireEvent.click(choice);
    fireEvent.click(
      screen.getByRole('button', { name: 'Insert selected values into draft' }),
    );
    expect(
      await screen.findByText(
        'Selected values inserted. Check and edit the draft before saving.',
      ),
    ).toBeVisible();
    expect(within(form).getByLabelText('Declared legal name')).toHaveValue(
      quote,
    );
    expect(within(form).getByLabelText('Declared address')).toHaveValue(
      'Preserve this address',
    );
    expect(
      server.requests.filter((r) => r.path.endsWith('/certification-draft')),
    ).toHaveLength(2);
    expect(server.mutations()).toEqual([]);
  });
  async function prepared(
    respond: (
      value: ReturnType<typeof preview>,
      index: number,
    ) => Response | Promise<Response>,
  ) {
    const actor = certificationActor({ manager: true, documents: true });
    const server = new FakeCertificationServer({ actor: () => actor });
    const caseId = server.seed({ orderReference: 'CERT-PREFILL-GUARD' });
    server.interceptions.push({
      match: (r) => r.path.endsWith('/dossier-analysis'),
      respond: () =>
        Response.json({
          runs: [
            {
              id: runId,
              snapshotHash: 'a'.repeat(64),
              createdAt: '2026-11-18T08:00:00Z',
              stale: false,
            },
          ],
          runsNextCursor: null,
        }),
    });
    for (let index = 0; index < 2; index++)
      server.interceptions.push({
        match: (r) => r.path.endsWith('/certification-draft'),
        respond: () => respond(preview(caseId), index),
      });
    server.install();
    const view = render(
      <CertificationWorkspace
        actor={actor}
        identity={certificationIdentity}
        projectId={certificationIds.project}
      />,
    );
    fireEvent.click(
      await screen.findByRole('button', { name: 'CERT-PREFILL-GUARD' }),
    );
    const form = await screen.findByRole('form', {
      name: 'Record the application',
    });
    fireEvent.change(within(form).getByLabelText('Declared legal name'), {
      target: { value: 'Protected literal draft' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Prepare from reviewed analysis' }),
    );
    const chooseRun = await screen.findByLabelText('Analysis run');
    fireEvent.click(chooseRun);
    await screen.findByRole('option', { name: /14530000/u });
    selectOption(chooseRun, runId);
    fireEvent.click(
      screen.getByRole('button', { name: 'Preview reviewed values' }),
    );
    const choice = await screen.findByRole('checkbox', {
      name: 'Use Declared legal name: Firma Fictivă SRL',
    });
    fireEvent.click(choice);
    return { server, form, view };
  }

  it('refuses changed review values on insertion without silently replacing the literal draft', async () => {
    const { server, form } = await prepared((value, index) => {
      if (index === 1) {
        const first = value.candidates[0];
        if (!first) throw new Error('Expected prepared candidate');
        value.candidates[0] = {
          ...first,
          value: 'Changed source proposal',
          reviewRevision: 2,
        };
      }
      return Response.json(value);
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Insert selected values into draft' }),
    );
    expect(
      await screen.findByText(
        'Sources, reviews or the Case changed. Read a fresh preview before choosing again.',
      ),
    ).toBeVisible();
    expect(within(form).getByLabelText('Declared legal name')).toHaveValue(
      'Protected literal draft',
    );
    expect(screen.queryByText('Changed source proposal')).toBeNull();
    expect(server.mutations()).toEqual([]);
  });

  it('preserves text typed while the final source check is held and refuses to report an insertion', async () => {
    const held: { complete?: (response: Response) => void } = {};
    const pending = new Promise<Response>((resolve) => {
      held.complete = resolve;
    });
    let finalValue: ReturnType<typeof preview> | undefined;
    const { server, form } = await prepared((value, index) => {
      finalValue = value;
      return index === 0 ? Response.json(value) : pending;
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Insert selected values into draft' }),
    );
    fireEvent.change(within(form).getByLabelText('Declared legal name'), {
      target: { value: 'Typed during source verification' },
    });
    if (!held.complete || !finalValue)
      throw new Error('Expected held public response');
    await act(async () => {
      held.complete?.(Response.json(finalValue));
    });
    expect(
      await screen.findByText(
        'Your draft changed while the values were checked. Nothing was inserted; review the changes and try again.',
      ),
    ).toBeVisible();
    expect(within(form).getByLabelText('Declared legal name')).toHaveValue(
      'Typed during source verification',
    );
    expect(server.mutations()).toEqual([]);
  });

  it('retires a held preparation when manager authority is replaced', async () => {
    const held: { complete?: (response: Response) => void } = {};
    const pending = new Promise<Response>((resolve) => {
      held.complete = resolve;
    });
    let finalValue: ReturnType<typeof preview> | undefined;
    const { view } = await prepared((value, index) => {
      finalValue = value;
      return index === 0 ? Response.json(value) : pending;
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Insert selected values into draft' }),
    );
    view.rerender(
      <CertificationWorkspace
        actor={certificationActor({ manager: false, documents: true })}
        identity={certificationIdentity}
        projectId={certificationIds.project}
      />,
    );
    if (!held.complete || !finalValue)
      throw new Error('Expected held public response');
    await act(async () => {
      held.complete?.(Response.json(finalValue));
    });
    expect(
      screen.queryByRole('form', { name: 'Record the application' }),
    ).toBeNull();
    expect(screen.queryByText(quote)).toBeNull();
    expect(
      screen.queryByRole('button', { name: 'Prepare from reviewed analysis' }),
    ).toBeNull();
  });

  it('preserves the draft after a failed final read and permits a fresh successful retry', async () => {
    let fresh: ReturnType<typeof preview> | undefined;
    const { server, form } = await prepared((value, index) => {
      fresh = value;
      return index === 0
        ? Response.json(value)
        : new Response(null, { status: 503 });
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Insert selected values into draft' }),
    );
    expect(
      await screen.findByText(
        'Preparation could not be read. Your draft is unchanged. Try again.',
      ),
    ).toBeVisible();
    expect(within(form).getByLabelText('Declared legal name')).toHaveValue(
      'Protected literal draft',
    );
    if (!fresh) throw new Error('Expected public preparation');
    server.interceptions.push({
      match: (r) => r.path.endsWith('/certification-draft'),
      respond: () => Response.json(fresh),
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Insert selected values into draft' }),
    );
    expect(
      await screen.findByText(
        'Selected values inserted. Check and edit the draft before saving.',
      ),
    ).toBeVisible();
    expect(within(form).getByLabelText('Declared legal name')).toHaveValue(
      quote,
    );
    expect(server.mutations()).toEqual([]);
  });

  it('cancels a selected preview without changing any typed value', async () => {
    const { server, form } = await prepared((value) => Response.json(value));
    fireEvent.click(screen.getByRole('button', { name: 'Close preparation' }));
    expect(
      screen.queryByRole('checkbox', { name: /Use Declared legal name/u }),
    ).toBeNull();
    expect(within(form).getByLabelText('Declared legal name')).toHaveValue(
      'Protected literal draft',
    );
    expect(server.mutations()).toEqual([]);
  });
});
