import { afterEach, expect, it, vi } from 'vitest';
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
  stagePlan,
  stage1Report,
} from './certification.test-fixture';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
const runId = '14670000-0000-4000-8000-000000000001';
const suggestionId = '14670000-0000-4000-8000-000000000002';
const literal = 'Producție de lactate — verificat';

type Mode = 'plan' | 'report' | 'reference';
async function prepared(
  mode: Mode = 'plan',
  respond?: (value: unknown, index: number) => Response | Promise<Response>,
) {
  const actor = certificationActor({
    manager: mode === 'plan',
    auditor: mode !== 'plan',
    documents: true,
  });
  const server = new FakeCertificationServer({ actor: () => actor });
  const caseId = server.seedApprovedTeam({
    orderReference: 'CERT-STAGE-REUSE',
    leader: certificationIds.member,
  });
  const planAttachment = server.attachAsColleague(
    caseId,
    server.addSource('Fictional Stage plan'),
    'plan',
  );
  if (mode !== 'plan') {
    server.recordStageAsColleague(
      caseId,
      'stage_1_plan',
      stagePlan(planAttachment),
    );
    const report = server.attachAsColleague(
      caseId,
      server.addSource('Fictional Stage1 report'),
      'report',
    );
    if (mode === 'report') {
      server.recordStageAsColleague(
        caseId,
        'stage_1_report',
        stage1Report(report),
      );
      const plan2 = server.attachAsColleague(
        caseId,
        server.addSource('Fictional Stage2 plan'),
        'plan',
      );
      server.recordStageAsColleague(
        caseId,
        'stage_2_plan',
        stagePlan(plan2, {
          startDate: '2026-11-20',
          endDate: '2026-11-21',
          onSiteDays: '2',
        }),
      );
      server.attachAsColleague(
        caseId,
        server.addSource('Fictional Stage2 report'),
        'report',
      );
    }
  }
  const step =
    mode === 'plan'
      ? 'stage_1_plan'
      : mode === 'report'
        ? 'stage_2_report'
        : 'stage_1_report';
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
      match: (r) => r.path.endsWith('/certification-stage-draft'),
      respond: () => {
        const value = {
          format: 'CERTIFICATION_STAGE_DRAFT/1',
          target: {
            caseId,
            projectId: certificationIds.project,
            revision: mode === 'plan' ? 9 : mode === 'report' ? 15 : 11,
            step,
          },
          run: { id: runId, snapshotHash: 'a'.repeat(64) },
          candidates: [
            {
              field: 'scope',
              value: literal,
              proposalValue: 'Producție de lactate',
              suggestionId,
              reviewRevision: 2,
              reviewer: 'Fictional reviewer',
              reviewedAt: '2026-11-18T08:00:00Z',
              citations: [
                {
                  sourceId: '14670000-0000-4000-8000-000000000003',
                  documentVersionId: '14670000-0000-4000-8000-000000000004',
                  locator: 'word/document.xml:p:3',
                  documentTitle: 'Fictional reviewed scope',
                  fileName: 'domeniu.docx',
                  versionNumber: 1,
                  start: 0,
                  end: 20,
                  quote: 'Producție de lactate',
                  passageSha256: 'b'.repeat(64),
                },
              ],
            },
          ],
        };
        return respond ? respond(value, i) : Response.json(value);
      },
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
    await screen.findByRole('button', { name: 'CERT-STAGE-REUSE' }),
  );
  const stage = await screen.findByRole('region', {
    name: mode === 'report' ? 'Stage 2 audit' : 'Stage 1 audit',
  });
  const preparation = within(stage);
  const form = preparation.getByRole('form', {
    name:
      mode === 'plan'
        ? 'Record the Stage 1 plan'
        : mode === 'report'
          ? 'Record the Stage 2 report'
          : 'Record the Stage 1 report',
  });
  fireEvent.click(
    preparation.getByRole('button', { name: 'Prepare from reviewed analysis' }),
  );
  selectOption(await preparation.findByLabelText('Analysis run'), runId);
  fireEvent.click(
    preparation.getByRole('button', { name: 'Preview reviewed values' }),
  );
  if (mode === 'reference')
    await preparation.findByText(literal, { exact: false });
  else
    fireEvent.click(
      await preparation.findByRole('checkbox', {
        name: `Use Scope: ${literal}`,
      }),
    );
  return { server, stage, form, preparation, actor, view };
}
function insert(preparation: ReturnType<typeof within>) {
  fireEvent.click(
    preparation.getByRole('button', {
      name: 'Insert selected values into draft',
    }),
  );
}

it('revalidates a deliberately chosen reviewed scope into only the native Stage1 plan draft', async () => {
  const { server, form, preparation } = await prepared();
  fireEvent.change(within(form).getByLabelText('Objectives'), {
    target: { value: 'Human objectives' },
  });
  insert(preparation);
  await preparation.findByText(
    'Selected values inserted. Check and edit the draft before saving.',
  );
  expect(within(form).getByLabelText('Audit scope')).toHaveValue(literal);
  expect(within(form).getByLabelText('Objectives')).toHaveValue(
    'Human objectives',
  );
  expect(server.mutations()).toEqual([]);
});
it('appends attributed source context while retaining the human report summary and all ordinary Save requirements', async () => {
  const { server, form, preparation } = await prepared('report');
  const summary = within(form).getByLabelText('Summary of the Stage 2 audit');
  fireEvent.change(summary, { target: { value: 'Ручной текст аудитора.' } });
  insert(preparation);
  await preparation.findByText(
    'Selected values inserted. Check and edit the draft before saving.',
  );
  if (!(summary instanceof HTMLTextAreaElement))
    throw new Error('Expected native summary textarea');
  expect(summary.value).toContain(
    'Ручной текст аудитора.\n\nQuoted source context',
  );
  expect(summary.value).toContain('Scope: «Producție de lactate — verificat»');
  expect(summary.value).toContain(
    'domeniu.docx · v1 · 14670000-0000-4000-8000-000000000004 · word/document.xml:p:3',
  );
  expect(summary.value).toContain(
    'Fictional reviewer · 2026-11-18T08:00:00Z · r2',
  );
  expect(server.mutations()).toEqual([]);
});
it('shows Stage1 references separately without inserting source facts into the professional conclusion', async () => {
  const { server, form, preparation } = await prepared('reference');
  fireEvent.change(within(form).getByLabelText('Basis of the conclusion'), {
    target: { value: 'Professional judgment' },
  });
  expect(
    preparation.queryByRole('checkbox', { name: `Use Scope: ${literal}` }),
  ).toBeNull();
  expect(
    preparation.queryByRole('button', {
      name: 'Insert selected values into draft',
    }),
  ).toBeNull();
  expect(within(form).getByLabelText('Basis of the conclusion')).toHaveValue(
    'Professional judgment',
  );
  expect(server.mutations()).toEqual([]);
});
it('refuses context exceeding the native report limit and keeps all manual text', async () => {
  const { form, preparation, server } = await prepared('report');
  fireEvent.change(
    within(form).getByLabelText('Summary of the Stage 2 audit'),
    {
      target: { value: 'Я'.repeat(3900) },
    },
  );
  insert(preparation);
  await preparation.findByText(
    'The selected context and your text exceed the native limit. Select fewer values or shorten your own draft; nothing was inserted.',
  );
  expect(
    within(form).getByLabelText('Summary of the Stage 2 audit'),
  ).toHaveValue('Я'.repeat(3900));
  expect(server.mutations()).toEqual([]);
});
it('retains edits typed while the final current-source read is held', async () => {
  let release: ((response: Response) => void) | undefined;
  const pending = new Promise<Response>((resolve) => {
    release = resolve;
  });
  let value: unknown;
  const { form, preparation, server } = await prepared('report', (v, i) => {
    value = v;
    return i === 0 ? Response.json(v) : pending;
  });
  insert(preparation);
  fireEvent.change(
    within(form).getByLabelText('Summary of the Stage 2 audit'),
    {
      target: { value: 'Typed while checking' },
    },
  );
  if (!release) throw new Error('Expected held public response');
  await act(async () => {
    release?.(Response.json(value));
  });
  await preparation.findByText(
    'Your draft changed while the values were checked. Nothing was inserted; review the changes and try again.',
  );
  expect(
    within(form).getByLabelText('Summary of the Stage 2 audit'),
  ).toHaveValue('Typed while checking');
  expect(server.mutations()).toEqual([]);
});
it('retires a late report preparation when the auditor authority is replaced', async () => {
  let release: ((response: Response) => void) | undefined;
  const pending = new Promise<Response>((resolve) => {
    release = resolve;
  });
  let value: unknown;
  const { preparation, view, server } = await prepared('report', (v, i) => {
    value = v;
    return i === 0 ? Response.json(v) : pending;
  });
  insert(preparation);
  view.rerender(
    <CertificationWorkspace
      actor={certificationActor({
        manager: false,
        auditor: false,
        documents: true,
      })}
      identity={certificationIdentity}
      projectId={certificationIds.project}
    />,
  );
  if (!release) throw new Error('Expected held public response');
  await act(async () => {
    release?.(Response.json(value));
  });
  expect(
    screen.queryByText(
      'Selected values inserted. Check and edit the draft before saving.',
    ),
  ).toBeNull();
  expect(server.mutations()).toEqual([]);
});
it('refuses a changed review on final confirmation without inserting the previous proposal', async () => {
  const { preparation, form, server } = await prepared('plan', (value, i) => {
    if (i === 0) return Response.json(value);
    const current = object(value);
    const candidates = current.candidates;
    if (!Array.isArray(candidates) || !candidates[0])
      throw new Error('Expected candidate');
    return Response.json({
      ...current,
      candidates: [
        {
          ...object(candidates[0]),
          reviewRevision: 3,
          value: 'Changed reviewed scope',
        },
      ],
    });
  });
  insert(preparation);
  await preparation.findByText(
    'Sources, reviews or the Case changed. Read a fresh preview before choosing again.',
  );
  expect(within(form).getByLabelText('Audit scope')).toHaveValue('');
  expect(server.mutations()).toEqual([]);
});
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Expected object');
  return Object.fromEntries(Object.entries(value));
}
it.each([403, 404])(
  'retires private prepared values after current-source access is denied (%s), preserving the editable plan',
  async (status) => {
    const { preparation, form, server } = await prepared('plan', (value, i) =>
      i === 0
        ? Response.json(value)
        : Response.json({ message: 'Unavailable' }, { status }),
    );
    fireEvent.change(within(form).getByLabelText('Audit scope'), {
      target: { value: 'Keep this literal plan' },
    });
    insert(preparation);
    await preparation.findByText(
      'Preparation could not be read. Your draft is unchanged. Try again.',
    );
    expect(
      preparation.queryByRole('checkbox', { name: `Use Scope: ${literal}` }),
    ).toBeNull();
    expect(within(form).getByLabelText('Audit scope')).toHaveValue(
      'Keep this literal plan',
    );
    expect(server.mutations()).toEqual([]);
  },
);
it('offers a corrected eligible scope while preserving its multiline original proposal verbatim', async () => {
  const { preparation, form, server } = await prepared('plan', (value) => {
    const current = object(value),
      candidates = current.candidates;
    if (!Array.isArray(candidates) || !candidates[0])
      throw new Error('Expected corrected candidate');
    return Response.json({
      ...current,
      candidates: [
        {
          ...object(candidates[0]),
          proposalValue: '  Domeniu anterior\ncu detalii  ',
        },
      ],
    });
  });
  const original = preparation.getByText(
    'Original proposal: Domeniu anterior cu detalii',
  );
  expect(original).toBeVisible();
  expect(original.textContent).toBe(
    'Original proposal:   Domeniu anterior\ncu detalii  ',
  );
  insert(preparation);
  await preparation.findByText(
    'Selected values inserted. Check and edit the draft before saving.',
  );
  expect(within(form).getByLabelText('Audit scope')).toHaveValue(literal);
  expect(server.mutations()).toEqual([]);
});
