import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '../test/render-with-interface-locale';
import { deterministicBrowserIdentity } from '../access-composition';
import type { ActorContext } from '../access-types';
import { useInterfaceLocale } from '../localization/interface-locale';
import { OperationalRiskWorkspace } from './OperationalRiskWorkspace';

const companyId = '00000000-0000-4000-8000-000000000763';
const riskId = '00000000-0000-4000-8000-000000000764';
const entry = {
  id: '00000000-0000-4000-8000-000000000765',
  kind: 'intake-recorded',
  revision: 1,
  actor: {
    workspaceMembershipId: '00000000-0000-4000-8000-000000000766',
    displayName: 'Synthetic author',
  },
  recordedAt: '2026-10-21T12:00:00.000Z',
  predecessorId: null,
  reason: null,
  facts: {
    process: 'Synthetic literal <script>text</script>',
    cause: 'Cause',
    effect: 'Effect',
    plannedMeasure: 'Measure',
    existingMeasures: null,
    sourceDescription: null,
    plannedDate: null,
  },
};
const risk = {
  id: riskId,
  companyId,
  revision: 1,
  assessment: 'not-assessed',
  responsibility: 'not-specified',
  createdAt: entry.recordedAt,
  originalIntake: entry,
  currentIntake: entry,
};
const actor: ActorContext = {
  internalUserId: '00000000-0000-4000-8000-000000000767',
  workspaceId: '00000000-0000-4000-8000-000000000768',
  workspaceMembershipId: entry.actor.workspaceMembershipId,
  workspaceName: 'Synthetic workspace',
  displayName: 'Synthetic author',
  email: 'author@example.test',
  active: true,
  workspacePermissions: [],
  activeCompany: {
    id: companyId,
    displayName: 'Synthetic Risk Company',
    operationalRiskPermissions: ['risk.read', 'risk.record'],
    operationalRiskReaderAssignmentId: '00000000-0000-4000-8000-000000000769',
    operationalRiskReaderPermissionSetVersion: 'v1',
    operationalRiskRecorderAssignmentId: '00000000-0000-4000-8000-000000000770',
    operationalRiskRecorderPermissionSetVersion: 'v1',
  },
};
const noop = () => undefined;
afterEach(() => {
  vi.unstubAllGlobals();
});

function LocaleChoice() {
  const { changeLocale } = useInterfaceLocale();
  return (
    <button onClick={() => changeLocale('fr')}>French test interface</button>
  );
}
function view(
  props: Partial<Parameters<typeof OperationalRiskWorkspace>[0]> = {},
) {
  return render(
    <>
      <LocaleChoice />
      <OperationalRiskWorkspace
        actor={actor}
        identity={deterministicBrowserIdentity()}
        onActorRevalidated={noop}
        onCompanyContextRejected={noop}
        onWorkspaceAccessRejected={noop}
        {...props}
      />
    </>,
  );
}
function readResponse(path: string) {
  if (path === '/api/operational-risks')
    return Response.json({
      items: [
        {
          id: riskId,
          companyId,
          revision: 1,
          process: entry.facts.process,
          createdAt: entry.recordedAt,
        },
      ],
      next_cursor: null,
    });
  if (path === `/api/operational-risks/${riskId}`) return Response.json(risk);
  if (path === `/api/operational-risks/${riskId}/history`)
    return Response.json({ items: [entry], next_cursor: null });
  throw new Error('Unexpected synthetic Risk read.');
}
async function fill() {
  fireEvent.click(screen.getByRole('button', { name: 'Record a risk' }));
  for (const [label, value] of [
    ['Process / activity', ' Exact draft\n<literal> '],
    ['Possible cause', 'Cause'],
    ['Possible effect', 'Effect'],
    ['Planned measure', 'Measure'],
  ])
    fireEvent.change(
      screen.getByLabelText(new RegExp(`^${label.replace('/', '\\/')}`, 'u')),
      { target: { value } },
    );
}

describe('Operational Risk manual workspace', () => {
  it('shows unknown and unassessed truth, original and immutable attributable history without interpreting business text', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => readResponse(input.toString())),
    );
    view();
    fireEvent.click(
      await screen.findByRole('button', {
        name: new RegExp('Synthetic literal', 'u'),
      }),
    );
    expect(await screen.findByText('Assessment: not assessed')).toBeVisible();
    expect(
      screen.getByText(/The note author is not the risk owner/u),
    ).toBeVisible();
    expect(screen.getAllByText(entry.facts.process).length).toBeGreaterThan(1);
    expect(
      screen.getByRole('heading', { name: 'Immutable history' }),
    ).toBeVisible();
    expect(screen.getByText(/Author: /u)).toHaveTextContent('Synthetic author');
    expect(document.querySelector('.risk-workspace script')).toBeNull();
    expect(screen.getAllByText('Unknown').length).toBeGreaterThan(0);
  });

  it('retains the exact uncertain command body and key across locale changes, disables editing and retries only that intent', async () => {
    const commands: {
      body: BodyInit | null | undefined;
      key: string | null;
    }[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === 'POST') {
          commands.push({
            body: init.body,
            key: new Headers(init.headers).get('idempotency-key'),
          });
          if (commands.length === 1)
            throw new TypeError('Synthetic lost response');
          return Response.json({ risk, entry });
        }
        return readResponse(input.toString());
      }),
    );
    view();
    await screen.findByRole('button', { name: /Synthetic literal/u });
    await fill();
    fireEvent.click(screen.getByRole('button', { name: /^Record$/u }));
    expect(
      await screen.findByRole('button', { name: 'Retry the same record' }),
    ).toBeVisible();
    const process = screen.getByLabelText(/^Process \/ activity/u);
    expect(process).toBeDisabled();
    if (!(process instanceof HTMLTextAreaElement))
      throw new Error('Expected the literal process text field.');
    const preserved = process.value;
    fireEvent.click(
      screen.getByRole('button', { name: 'French test interface' }),
    );
    expect(screen.getByLabelText(/^Processus \/ activité/u)).toHaveValue(
      preserved,
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Réessayer le même enregistrement' }),
    );
    await screen.findByText('Enregistré.');
    expect(commands).toHaveLength(2);
    expect(commands[1]).toEqual(commands[0]);
    expect(commands[0]?.key).toMatch(/^[0-9a-f-]{36}$/u);
  });

  it('distinguishes a confirmed save followed by failed refresh from an uncertain command and offers no resubmission', async () => {
    let saved = false;
    let postCount = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === 'POST') {
          saved = true;
          postCount++;
          return Response.json({ risk, entry });
        }
        if (saved) return new Response(null, { status: 503 });
        return readResponse(input.toString());
      }),
    );
    view();
    await screen.findByRole('button', { name: /Synthetic literal/u });
    await fill();
    fireEvent.click(screen.getByRole('button', { name: /^Record$/u }));
    expect(
      await screen.findByText(/The record is confirmed, but refresh failed/u),
    ).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Retry the same record' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText(/^Process \/ activity/u),
    ).not.toBeInTheDocument();
    expect(postCount).toBe(1);
  });

  it('treats malformed successful command output as uncertain and preserves the original key', async () => {
    const calls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === 'POST') {
          calls.push(new Headers(init.headers).get('idempotency-key') ?? '');
          return Response.json({ risk: { ...risk, companyId: riskId }, entry });
        }
        return readResponse(input.toString());
      }),
    );
    view();
    await screen.findByRole('button', { name: /Synthetic literal/u });
    await fill();
    fireEvent.click(screen.getByRole('button', { name: /^Record$/u }));
    fireEvent.click(
      await screen.findByRole('button', { name: 'Retry the same record' }),
    );
    await waitFor(() => expect(calls).toHaveLength(2));
    expect(calls[1]).toBe(calls[0]);
    expect(screen.getByLabelText(/^Process \/ activity/u)).toBeDisabled();
  });

  it('locally retires refused Risk reads and revalidates the same Company without rejecting its independent context', async () => {
    const revalidated = vi.fn();
    const rejected = vi.fn();
    const workspaceRejected = vi.fn();
    const withoutRisk = {
      ...actor,
      activeCompany: {
        id: companyId,
        displayName: 'Synthetic Risk Company',
        projectPermissions: ['project.read'],
        taskPermissions: ['task.read'],
      },
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) =>
        input.toString() === '/api/access/current-actor'
          ? Response.json(withoutRisk)
          : new Response(null, { status: 403 }),
      ),
    );
    view({
      onActorRevalidated: revalidated,
      onCompanyContextRejected: rejected,
      onWorkspaceAccessRejected: workspaceRejected,
    });
    expect(
      await screen.findByText(
        /Access to this register is no longer available/u,
      ),
    ).toBeVisible();
    await waitFor(() => expect(revalidated).toHaveBeenCalledWith(withoutRisk));
    expect(rejected).not.toHaveBeenCalled();
    expect(workspaceRejected).not.toHaveBeenCalled();
    expect(
      screen.queryByRole('region', { name: 'Recorded risks' }),
    ).not.toBeInTheDocument();
  });

  it.each([200, 401, 403])(
    'ignores a late ignored-abort %s read after scope disposal without rejecting the current identity',
    async (status) => {
      let reply: ((value: Response) => void) | undefined;
      vi.stubGlobal(
        'fetch',
        vi.fn(
          () =>
            new Promise<Response>((resolve) => {
              reply = resolve;
            }),
        ),
      );
      const rejectSession = vi.fn(async () => undefined);
      const revalidated = vi.fn();
      const rejected = vi.fn();
      const mounted = view({
        identity: { ...deterministicBrowserIdentity(), rejectSession },
        onActorRevalidated: revalidated,
        onCompanyContextRejected: rejected,
      });
      await waitFor(() => expect(reply).toBeDefined());
      mounted.unmount();
      await act(async () => {
        reply?.(
          status === 200
            ? readResponse('/api/operational-risks')
            : new Response(null, { status }),
        );
      });
      expect(screen.queryByText(entry.facts.process)).not.toBeInTheDocument();
      expect(rejectSession).not.toHaveBeenCalled();
      expect(revalidated).not.toHaveBeenCalled();
      expect(rejected).not.toHaveBeenCalled();
    },
  );

  it('ignores an abort-ignoring late command 401 after disposal instead of rejecting a replacement identity', async () => {
    let reply: ((value: Response) => void) | undefined;
    const rejectSession = vi.fn(async () => undefined);
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === 'POST')
          return new Promise<Response>((resolve) => {
            reply = resolve;
          });
        return readResponse(input.toString());
      }),
    );
    const mounted = view({
      identity: { ...deterministicBrowserIdentity(), rejectSession },
    });
    await screen.findByRole('button', { name: /Synthetic literal/u });
    await fill();
    fireEvent.click(screen.getByRole('button', { name: /^Record$/u }));
    await waitFor(() => expect(reply).toBeDefined());
    mounted.unmount();
    await act(async () => {
      reply?.(new Response(null, { status: 401 }));
    });
    expect(rejectSession).not.toHaveBeenCalled();
  });

  it('renders Reader-only access without recording actions', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => readResponse(input.toString())),
    );
    view({
      actor: {
        ...actor,
        activeCompany: {
          ...actor.activeCompany,
          id: companyId,
          displayName: 'Synthetic Risk Company',
          operationalRiskPermissions: ['risk.read'],
          operationalRiskRecorderAssignmentId: undefined,
          operationalRiskRecorderPermissionSetVersion: undefined,
        },
      },
    });
    const list = await screen.findByRole('region', { name: 'Recorded risks' });
    fireEvent.click(
      await within(list).findByRole('button', { name: /Synthetic literal/u }),
    );
    await screen.findByText('Assessment: not assessed');
    expect(
      screen.queryByRole('button', { name: 'Record a risk' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Correct intake facts' }),
    ).not.toBeInTheDocument();
  });
  it.each(['record', 'journal', 'correct'] as const)(
    'preserves and explicitly reviews a conflicted %s draft before a fresh intent, including failed reload and direct form submission',
    async (kind) => {
      const literalFacts = {
        process: ' Draft process\n<literal process> ',
        cause: ' Draft cause\n<literal cause> ',
        effect: ' Draft effect\n<literal effect> ',
        plannedMeasure: ' Draft measure\n<literal measure> ',
        existingMeasures: ' Existing measures\n<literal existing> ',
        sourceDescription: ' Source description\n<literal source> ',
        plannedDate: '2024-02-29',
      };
      const narrative = ' Draft reassessment\n<literal narrative> ';
      const reason = ' Draft reason\n<literal correction> ';
      const freshEntry = {
        ...entry,
        id: '00000000-0000-4000-8000-000000000777',
        kind: 'intake-corrected',
        revision: 2,
        predecessorId: entry.id,
        reason: 'Concurrent verified correction',
        facts: {
          ...entry.facts,
          process: 'Concurrent latest intake',
          cause: 'Concurrent cause',
        },
      };
      const freshRisk = { ...risk, revision: 2, currentIntake: freshEntry };
      let readMode: 'initial' | 'failed' | 'fresh' = 'initial';
      const commands: { body: string; key: string | null; path: string }[] = [];
      vi.stubGlobal(
        'fetch',
        vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
          const path = input.toString();
          if (init?.method === 'POST') {
            if (typeof init.body !== 'string')
              throw new Error('Expected the actual serialized command.');
            commands.push({
              body: init.body,
              key: new Headers(init.headers).get('idempotency-key'),
              path,
            });
            if (commands.length === 1) {
              readMode = 'failed';
              return new Response(null, { status: 409 });
            }
            return new Response(null, { status: 503 });
          }
          if (readMode === 'failed') return new Response(null, { status: 503 });
          if (readMode === 'fresh') {
            if (path === '/api/operational-risks')
              return Response.json({
                items: [
                  {
                    id: riskId,
                    companyId,
                    revision: 2,
                    process: freshEntry.facts.process,
                    createdAt: entry.recordedAt,
                  },
                ],
                next_cursor: null,
              });
            if (path === `/api/operational-risks/${riskId}`)
              return Response.json(freshRisk);
            if (path === `/api/operational-risks/${riskId}/history`)
              return Response.json({
                items: [freshEntry, entry],
                next_cursor: null,
              });
          }
          return readResponse(path);
        }),
      );
      view();
      const row = await screen.findByRole('button', {
        name: /Synthetic literal/u,
      });
      if (kind === 'record')
        fireEvent.click(screen.getByRole('button', { name: 'Record a risk' }));
      else {
        fireEvent.click(row);
        await screen.findByText('Assessment: not assessed');
        fireEvent.click(
          screen.getByRole('button', {
            name:
              kind === 'journal'
                ? 'Observation / Narrative reassessment'
                : 'Correct intake facts',
          }),
        );
      }
      const factFieldNames = [
        'process',
        'cause',
        'effect',
        'plannedMeasure',
        'existingMeasures',
        'sourceDescription',
        'plannedDate',
      ] as const;
      const labels = {
        process: /^Process \/ activity/u,
        cause: /^Possible cause/u,
        effect: /^Possible effect/u,
        plannedMeasure: /^Planned measure/u,
        existingMeasures: /^Existing measures/u,
        sourceDescription: /^Source description/u,
        plannedDate: /^Planned date/u,
      };
      if (kind === 'journal') {
        fireEvent.click(screen.getByRole('combobox', { name: 'Note type' }));
        fireEvent.click(
          screen.getByRole('option', { name: 'Narrative reassessment' }),
        );
        fireEvent.change(screen.getByLabelText(/^Note$/u), {
          target: { value: narrative },
        });
        fireEvent.change(screen.getByLabelText('Occurrence date (optional)'), {
          target: { value: '2024-02-29' },
        });
      } else {
        for (const field of factFieldNames)
          fireEvent.change(screen.getByLabelText(labels[field]), {
            target: { value: literalFacts[field] },
          });
        if (kind === 'correct')
          fireEvent.change(screen.getByLabelText('Correction reason'), {
            target: { value: reason },
          });
      }
      const assertDraft = () => {
        if (kind === 'journal') {
          expect(
            screen.getByRole('combobox', { name: 'Note type' }),
          ).toHaveTextContent('Narrative reassessment');
          expect(screen.getByLabelText(/^Note$/u)).toHaveValue(narrative);
          expect(
            screen.getByLabelText('Occurrence date (optional)'),
          ).toHaveValue('2024-02-29');
        } else {
          for (const field of factFieldNames)
            expect(screen.getByLabelText(labels[field])).toHaveValue(
              literalFacts[field],
            );
          if (kind === 'correct')
            expect(screen.getByLabelText('Correction reason')).toHaveValue(
              reason,
            );
        }
      };
      const save = screen.getByRole('button', { name: /^Record$/u });
      const form = save.closest('form');
      if (!(form instanceof HTMLFormElement))
        throw new Error('Expected the public record form.');
      fireEvent.click(save);
      await screen.findByText(
        /The register changed or the key was already used/u,
      );
      assertDraft();
      expect(save).toBeDisabled();
      await act(async () => {
        fireEvent.submit(form);
      });
      expect(commands).toHaveLength(1);
      fireEvent.click(screen.getByRole('button', { name: 'Reload' }));
      await screen.findAllByText('Reading failed. Please retry.');
      assertDraft();
      expect(save).toBeDisabled();
      expect(
        screen.queryByRole('button', { name: 'Continue with reviewed data' }),
      ).not.toBeInTheDocument();
      await act(async () => {
        fireEvent.submit(form);
      });
      expect(commands).toHaveLength(1);
      readMode = 'fresh';
      fireEvent.click(screen.getByRole('button', { name: 'Reload' }));
      await screen.findByRole('button', { name: /Concurrent latest intake/u });
      const review = await screen.findByRole('button', {
        name: 'Continue with reviewed data',
      });
      expect(review).toBeEnabled();
      assertDraft();
      expect(save).toBeDisabled();
      await act(async () => {
        fireEvent.submit(form);
      });
      expect(commands).toHaveLength(1);
      fireEvent.click(review);
      assertDraft();
      expect(save).toBeEnabled();
      fireEvent.click(save);
      await screen.findByRole('button', { name: 'Retry the same record' });
      expect(commands).toHaveLength(2);
      expect(commands[0]?.key).toMatch(/^[0-9a-f-]{36}$/u);
      expect(commands[1]?.key).toMatch(/^[0-9a-f-]{36}$/u);
      expect(commands[1]?.key).not.toBe(commands[0]?.key);
      const expectedBody =
        kind === 'journal'
          ? {
              kind: 'reassessment',
              narrative,
              occurredOn: '2024-02-29',
              expectedRevision: 2,
            }
          : kind === 'correct'
            ? {
                ...literalFacts,
                reason,
                expectedRevision: 2,
                predecessorId: freshEntry.id,
              }
            : literalFacts;
      const reviewedBody: unknown = JSON.parse(commands[1]?.body ?? 'null');
      expect(reviewedBody).toEqual(expectedBody);
      expect(commands[1]?.path).toBe(
        kind === 'record'
          ? '/api/operational-risks'
          : `/api/operational-risks/${riskId}/${kind === 'journal' ? 'journal' : 'intake-corrections'}`,
      );
      fireEvent.click(
        screen.getByRole('button', { name: 'Retry the same record' }),
      );
      await waitFor(() => expect(commands).toHaveLength(3));
      expect(commands[2]).toEqual(commands[1]);
    },
  );
});
