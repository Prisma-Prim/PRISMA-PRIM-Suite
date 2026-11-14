import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '../test/render-with-interface-locale';
import { selectOptionByLabel } from '../test/select-option';
import type { ActorContext } from '../access-types';
import { useInterfaceLocale } from '../localization/interface-locale';
import { assertMessageCoverage } from '../localization/messages';
import { CertificationWorkspace } from './CertificationWorkspace';
import { exchangeMessages } from './certification-exchanges.copy';
import {
  FakeCertificationServer,
  certificationActor,
  certificationIdentity,
  certificationIds,
  stagePlan,
} from './certification.test-fixture';

const REGION = 'Exchanges and deadlines';
const FICTIONAL = {
  stage_plan_sent: 10,
  audit_dossier_transmitted: 20,
  stage_2_report_released: 0,
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

/** Switches the interface language the way the shell's language menu does. */
function LocaleSwitch() {
  const { changeLocale } = useInterfaceLocale();
  return (
    <>
      {(['fr', 'ro', 'ru', 'en'] as const).map((locale) => (
        <button key={locale} type="button" onClick={() => changeLocale(locale)}>
          {`Locale ${locale}`}
        </button>
      ))}
    </>
  );
}

function renderWorkspace(
  actor: ActorContext,
  onActorRevalidated?: (actor: ActorContext) => void,
) {
  return render(
    <>
      <LocaleSwitch />
      <CertificationWorkspace
        actor={actor}
        identity={certificationIdentity}
        projectId={certificationIds.project}
        onActorRevalidated={onActorRevalidated}
      />
    </>,
  );
}

function serve(grants: Parameters<typeof certificationActor>[0]) {
  const actor = certificationActor(grants);
  const server = new FakeCertificationServer({ actor: () => actor });
  return { server, actor };
}

/** A Case with an approved team and its Stage 1 plan on an attached PDF. */
function plannedCase(server: FakeCertificationServer, reference: string) {
  const caseId = server.seedApprovedTeam({ orderReference: reference });
  const plan = server.attachAsColleague(
    caseId,
    server.addSource('Stage 1 audit plan'),
    'plan',
  );
  server.recordStageAsColleague(
    caseId,
    'stage_1_plan',
    stagePlan(plan, { sentToClientOn: null }),
  );
  return { caseId, plan };
}

function pagedCase(server: FakeCertificationServer, reference: string) {
  const { caseId, plan } = plannedCase(server, reference);
  for (let sequence = 1; sequence <= 201; sequence++) {
    const version = {
      id: `exchange-${sequence}`,
      sequence,
      version: 1,
      caseRevision: 2,
      direction: sequence === 1 ? 'sent' : 'received',
      itemKind: 'stage_plan',
      counterpart: { kind: 'client', name: 'Lactis Demo SRL' },
      businessDate: '2026-10-29',
      channel: 'email',
      reference: `OUT-${sequence}`,
      note: null,
      reason: null,
      attachmentIds: [plan],
      recordedBy: {
        workspaceMembershipId: certificationIds.member,
        displayName: 'Manager Demo',
      },
      recordedAt: '2026-10-30T12:00:00.000Z',
    };
    server.seedExchangeRecord(
      caseId,
      sequence,
      sequence === 1
        ? [
            version,
            {
              ...version,
              id: 'exchange-1-v2',
              version: 2,
              reason: 'Fictional correction',
            },
          ]
        : [version],
    );
  }
  return { caseId, plan };
}

async function openSeededCase(reference: string) {
  fireEvent.click(await screen.findByRole('button', { name: reference }));
  return screen.findByRole('heading', {
    name: `Certification Case ${reference}`,
  });
}

function region() {
  return screen.getByRole('region', { name: REGION });
}

function change(element: HTMLElement, value: string) {
  fireEvent.change(element, { target: { value } });
}

/** A valid exchange draft, through the same controls as a programme manager. */
async function editableExchange(
  options: { date?: string; channel?: 'E-mail' | 'Other'; note?: string } = {},
) {
  const { server, actor } = serve({ manager: true });
  const { caseId, plan } = plannedCase(server, 'CERT-FIELD-ERROR');
  server.install();
  renderWorkspace(actor);
  await openSeededCase('CERT-FIELD-ERROR');
  fireEvent.click(
    within(region()).getByRole('button', { name: 'Record an exchange' }),
  );
  const form = within(region()).getByRole('form', {
    name: 'New Exchange Record',
  });
  selectOptionByLabel(within(form).getByLabelText('Direction'), 'Sent');
  selectOptionByLabel(within(form).getByLabelText('Item kind'), 'Stage plan');
  fireEvent.click(
    within(form).getByRole('checkbox', {
      name: 'Stage 1 audit plan, version 1',
    }),
  );
  selectOptionByLabel(
    within(form).getByLabelText('Counterpart kind'),
    'Client',
  );
  change(
    within(form).getByLabelText('Counterpart name'),
    'Lactis Demo SRL, quality manager',
  );
  change(
    within(form).getByLabelText('Date of the exchange'),
    options.date ?? '2026-10-29',
  );
  selectOptionByLabel(
    within(form).getByLabelText('Channel'),
    options.channel ?? 'E-mail',
  );
  if (options.note) change(within(form).getByLabelText('Note'), options.note);
  return { server, actor, caseId, plan, form };
}

function invalidFields(form: HTMLElement) {
  return [...form.querySelectorAll('[aria-invalid="true"]')];
}

function refuseNext(
  server: FakeCertificationServer,
  { suffix, code }: { suffix: string; code: string },
) {
  server.interceptions.push({
    match: (request) =>
      request.method === 'POST' && request.path.endsWith(suffix),
    respond: () => Response.json({ code }, { status: 409 }),
  });
}

/**
 * Answers the next matching command with the Case read an earlier version
 * recorded as its receipt: without the exchange page keys.
 */
function answerWithPrePaginationReceipt(
  server: FakeCertificationServer,
  { suffix, caseId }: { suffix: string; caseId: string },
) {
  server.interceptions.push({
    match: (request) =>
      request.method === 'POST' && request.path.endsWith(suffix),
    respond: async () => {
      const live: unknown = await (
        await server.fetch(`/api/certification-cases/${caseId}`)
      ).json();
      if (!isRecord(live) || !isRecord(live.exchanges))
        throw new Error('Expected the Case read.');
      const exchanges = Object.fromEntries(
        Object.entries(live.exchanges).filter(
          ([key]) => key !== 'nextCursor' && key !== 'sendings',
        ),
      );
      return Response.json({ ...live, exchanges }, { status: 201 });
    },
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const entries = [
  {
    kind: 'stage_plan_sent',
    stage: 'stage_1',
    direction: 'before',
    days: 10,
    anchor: '2026-11-10',
    dueDate: '2026-10-31',
    state: 'met',
    record: { sequence: 1, version: 1, businessDate: '2026-10-29' },
  },
  {
    kind: 'stage_plan_sent',
    stage: 'stage_2',
    direction: 'before',
    days: 10,
    anchor: null,
    dueDate: null,
    state: null,
    record: null,
  },
  {
    kind: 'audit_dossier_transmitted',
    stage: null,
    direction: 'after',
    days: 20,
    anchor: '2026-10-01',
    dueDate: '2026-10-21',
    state: 'overdue',
    record: null,
  },
  {
    kind: 'stage_2_report_released',
    stage: null,
    direction: 'not_before',
    days: 0,
    anchor: null,
    dueDate: null,
    state: 'sent_too_early',
    record: { sequence: 2, version: 1, businessDate: '2026-11-02' },
  },
];

describe('Exchanges and deadlines region', () => {
  it('reads the following Exchange Records and their correction history while the Stage sending stays visible beyond the first page', async () => {
    const { server, actor } = serve({ manager: false });
    const { caseId } = pagedCase(server, 'CERT-PAGED');
    server.seedDeadlineSet(FICTIONAL);
    server.seedDeadlineStates(caseId, entries);
    server.install();
    renderWorkspace(actor);
    await openSeededCase('CERT-PAGED');
    expect(
      within(region()).getAllByRole('listitem', {
        name: /^Exchange Record \d+ —/u,
      }),
    ).toHaveLength(200);
    expect(
      screen.getByRole('list', { name: 'Sendings of this document' }),
    ).toHaveTextContent('Exchange Record 1');
    for (const [locale, label] of [
      ['fr', 'Charger les échanges précédents'],
      ['ro', 'Încarcă schimburile anterioare'],
      ['ru', 'Загрузить предыдущие обмены'],
      ['en', 'Load earlier exchanges'],
    ]) {
      fireEvent.click(screen.getByRole('button', { name: `Locale ${locale}` }));
      expect(screen.getByRole('button', { name: label })).toBeVisible();
    }
    server.interceptions.push({
      match: (request) =>
        request.method === 'GET' && request.path.endsWith('/exchanges'),
      respond: () => new Response(null, { status: 503 }),
    });
    fireEvent.click(
      within(region()).getByRole('button', { name: 'Load earlier exchanges' }),
    );
    await within(region()).findByRole('alert');
    expect(
      within(region()).getAllByRole('listitem', {
        name: /^Exchange Record \d+ —/u,
      }),
    ).toHaveLength(200);
    server.interceptions.push({
      match: (request) =>
        request.method === 'GET' && request.path.endsWith('/exchanges'),
      respond: () =>
        Response.json({ code: 'CERTIFICATION_STALE' }, { status: 409 }),
    });
    fireEvent.click(
      within(region()).getByRole('button', { name: 'Retry loading exchanges' }),
    );
    fireEvent.click(
      await within(region()).findByRole('button', { name: 'Reload the Case' }),
    );
    await screen.findByRole('region', { name: REGION });
    await within(region()).findByRole('button', {
      name: 'Load earlier exchanges',
    });
    fireEvent.click(
      within(region()).getByRole('button', { name: 'Load earlier exchanges' }),
    );
    await waitFor(() =>
      expect(
        within(region()).getAllByRole('listitem', {
          name: /^Exchange Record \d+ —/u,
        }),
      ).toHaveLength(201),
    );
    expect(
      within(region()).queryByRole('button', {
        name: 'Load earlier exchanges',
      }),
    ).toBeNull();
    const first = within(region()).getByRole('listitem', {
      name: 'Exchange Record 1 — Sent — Stage plan',
    });
    expect(first).toHaveTextContent('Fictional correction');
    expect(first).toHaveTextContent('Version 1');
    expect(first).toHaveTextContent('Version 2');
  });

  it('retires the paged register and revalidates authority after access is refused', async () => {
    const { server, actor } = serve({ manager: false });
    pagedCase(server, 'CERT-PAGE-DENIED');
    server.install();
    const onActorRevalidated = vi.fn();
    renderWorkspace(actor, onActorRevalidated);
    await openSeededCase('CERT-PAGE-DENIED');
    server.interceptions.push({
      match: (request) =>
        request.method === 'GET' && request.path.endsWith('/exchanges'),
      respond: () => new Response(null, { status: 403 }),
    });
    fireEvent.click(
      within(region()).getByRole('button', { name: 'Load earlier exchanges' }),
    );
    await waitFor(() => expect(onActorRevalidated).toHaveBeenCalledOnce());
    expect(screen.queryByRole('region', { name: REGION })).toBeNull();
    expect(
      screen.queryByRole('button', { name: 'CERT-PAGE-DENIED' }),
    ).toBeNull();
  });

  it('marks only the business date when the server refuses a future exchange, keeping a filled Other-channel note valid', async () => {
    // The fake server owns a fixed clock. Its refusal is authoritative even
    // when this date has already passed on the browser's clock.
    const { form } = await editableExchange({
      date: '2026-11-08',
      channel: 'Other',
      note: 'Fictional platform handover.',
    });
    fireEvent.click(
      within(form).getByRole('button', { name: 'Record the exchange' }),
    );
    await within(form).findByText('An exchange cannot be dated after today.');
    expect(invalidFields(form)).toEqual([
      within(form).getByLabelText('Date of the exchange'),
    ]);
  });

  it('marks only the Document Versions group when the server refuses an attachment', async () => {
    const { server, form } = await editableExchange();
    refuseNext(server, {
      suffix: '/exchanges',
      code: 'CERTIFICATION_ATTACHMENT_ROLE',
    });
    fireEvent.click(
      within(form).getByRole('button', { name: 'Record the exchange' }),
    );
    await within(form).findByText(
      'A selected document is no longer attached to this Case. Reload the Case.',
    );
    expect(invalidFields(form)).toEqual([
      within(form).getByRole('group', { name: /Document Versions/u }),
    ]);
  });

  it.each(['STALE_VERSION', 'CERTIFICATION_CASE_CLOSED'])(
    'marks no exchange field for the state refusal %s',
    async (code) => {
      const { server, form } = await editableExchange({
        channel: 'Other',
        note: 'Fictional platform handover.',
      });
      refuseNext(server, { suffix: '/exchanges', code });
      fireEvent.click(
        within(form).getByRole('button', { name: 'Record the exchange' }),
      );
      await within(form).findByRole('alert');
      expect(invalidFields(form)).toEqual([]);
    },
  );

  it('marks no correction field after a stale refusal, including its filled reason', async () => {
    const { server, form } = await editableExchange();
    fireEvent.click(
      within(form).getByRole('button', { name: 'Record the exchange' }),
    );
    const entry = await within(region()).findByRole('listitem', {
      name: 'Exchange Record 1 — Sent — Stage plan',
    });
    fireEvent.click(
      within(entry).getByRole('button', { name: 'Correct Exchange Record 1' }),
    );
    const correction = within(entry).getByRole('form', {
      name: 'Correction of Exchange Record 1',
    });
    change(
      within(correction).getByLabelText('Reason for the correction'),
      'Fictional reference corrected.',
    );
    refuseNext(server, { suffix: '/exchanges/1', code: 'STALE_VERSION' });
    fireEvent.click(
      within(correction).getByRole('button', { name: 'Record the correction' }),
    );
    await within(correction).findByRole('alert');
    expect(invalidFields(correction)).toEqual([]);
  });

  it('marks only missing item text or withdrawal reason, and no field after their stale refusals', async () => {
    const { server, actor } = serve({ manager: true });
    plannedCase(server, 'CERT-ITEM-FIELDS');
    server.install();
    renderWorkspace(actor);
    await openSeededCase('CERT-ITEM-FIELDS');
    const add = () =>
      fireEvent.click(
        within(region()).getByRole('button', {
          name: 'Add an item to re-verify',
        }),
      );
    add();
    let form = within(region()).getByRole('form', {
      name: 'Item to re-verify',
    });
    fireEvent.click(within(form).getByRole('button', { name: 'Add the item' }));
    await within(form).findByText('State what to verify at the next Audit.');
    expect(invalidFields(form)).toEqual([
      within(form).getByLabelText('What to verify'),
    ]);
    change(
      within(form).getByLabelText('What to verify'),
      'Fictional first item.',
    );
    fireEvent.click(within(form).getByRole('button', { name: 'Add the item' }));
    await within(region()).findByRole('listitem', {
      name: /^Item 1: Fictional first item/u,
    });
    add();
    form = within(region()).getByRole('form', { name: 'Item to re-verify' });
    change(
      within(form).getByLabelText('What to verify'),
      'Fictional second item.',
    );
    refuseNext(server, {
      suffix: '/reverification-items',
      code: 'STALE_VERSION',
    });
    fireEvent.click(within(form).getByRole('button', { name: 'Add the item' }));
    await within(form).findByRole('alert');
    expect(invalidFields(form)).toEqual([]);
    fireEvent.click(within(form).getByRole('button', { name: 'Cancel' }));
    const item = within(region()).getByRole('listitem', {
      name: /^Item 1: Fictional first item/u,
    });
    fireEvent.click(
      within(item).getByRole('button', { name: 'Withdraw item 1' }),
    );
    const withdrawal = within(item).getByRole('form', {
      name: 'Withdrawal of item 1',
    });
    fireEvent.click(
      within(withdrawal).getByRole('button', { name: 'Record the withdrawal' }),
    );
    await within(withdrawal).findByText('A withdrawal states its reason.');
    expect(invalidFields(withdrawal)).toEqual([
      within(withdrawal).getByLabelText('Reason for the withdrawal'),
    ]);
    change(
      within(withdrawal).getByLabelText('Reason for the withdrawal'),
      'Fictional duplicate.',
    );
    refuseNext(server, { suffix: '/withdrawal', code: 'STALE_VERSION' });
    fireEvent.click(
      within(withdrawal).getByRole('button', { name: 'Record the withdrawal' }),
    );
    await within(withdrawal).findByRole('alert');
    expect(invalidFields(withdrawal)).toEqual([]);
  });

  it('shows its empty states, then the deadline states by text and icon, the derived dates and the Re-verification Items', async () => {
    const { server, actor } = serve({ manager: true });
    const empty = server.seed({ orderReference: 'CERT-EMPTY' });
    expect(empty).toBeTruthy();
    const { caseId } = plannedCase(server, 'CERT-DEADLINES');
    server.install();
    renderWorkspace(actor);
    await openSeededCase('CERT-EMPTY');
    const blank = region();
    for (const text of [
      'No procedure deadline configured',
      'No exchange recorded',
      'Nothing to re-verify',
      'The latest start of the first surveillance is set with the Certificate.',
    ])
      expect(within(blank).getByText(text)).toBeVisible();

    server.seedDeadlineSet(FICTIONAL);
    server.seedDeadlineStates(caseId, entries);
    server.seedReverificationItem(caseId, {
      id: 'finding:11310000-0000-4000-8000-900000000001',
      origin: 'automatic',
      sequence: null,
      text: null,
      caseRevision: 12,
      source: {
        kind: 'finding',
        findingId: '11310000-0000-4000-8000-900000000001',
        sequence: 2,
      },
      addedBy: null,
      addedAt: null,
      status: 'open',
      withdrawal: null,
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Back to Certification Cases' }),
    );
    await openSeededCase('CERT-DEADLINES');
    const deadlines = within(region()).getByRole('list', {
      name: 'Procedure deadlines',
    });
    expect(
      within(deadlines)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual([
      'Stage plan sent to the client — Stage 1 ✓ MetDue date: 2026-10-31By Exchange Record 1 of 2026-10-29',
      'Stage plan sent to the client — Stage 2 … Awaiting its starting date',
      'Audit dossier transmitted to the certification body ⚠ OverdueDue date: 2026-10-21',
      'Stage 2 report released to the client ⚠ Sent too earlyExchange Record 2 of 2026-11-02',
    ]);
    expect(
      within(region()).getByText(
        /^Deadline set version 1, configured by Ana Demo/u,
      ),
    ).toBeVisible();
    expect(
      within(region()).getByRole('listitem', {
        name: 'Minor nonconformity 2: verify the implementation of its plan Open',
      }),
    ).toBeVisible();
    // An automatic item cannot be withdrawn.
    expect(
      within(region()).queryByRole('button', { name: /^Withdraw/u }),
    ).toBeNull();
  });

  it('lets the programme manager record an exchange, refuses "other" without a note, filters the register and shows the sendings beside the step', async () => {
    const { server, actor } = serve({ manager: true });
    const { caseId, plan } = plannedCase(server, 'CERT-RECORD');
    const questionnaire = server.attachAsColleague(
      caseId,
      server.addSource('Questionnaire received'),
      'correspondence',
    );
    server.install();
    renderWorkspace(actor);
    await openSeededCase('CERT-RECORD');
    fireEvent.click(
      within(region()).getByRole('button', { name: 'Record an exchange' }),
    );
    const form = within(region()).getByRole('form', {
      name: 'New Exchange Record',
    });
    selectOptionByLabel(within(form).getByLabelText('Direction'), 'Sent');
    selectOptionByLabel(within(form).getByLabelText('Item kind'), 'Stage plan');
    fireEvent.click(
      within(form).getByRole('checkbox', {
        name: 'Stage 1 audit plan, version 1',
      }),
    );
    selectOptionByLabel(
      within(form).getByLabelText('Counterpart kind'),
      'Client',
    );
    change(
      within(form).getByLabelText('Counterpart name'),
      'Lactis Demo SRL, quality manager',
    );
    change(within(form).getByLabelText('Date of the exchange'), '2026-10-29');
    selectOptionByLabel(within(form).getByLabelText('Channel'), 'Other');
    change(within(form).getByLabelText('Reference (optional)'), 'OUT-7');
    fireEvent.click(
      within(form).getByRole('button', { name: 'Record the exchange' }),
    );
    expect(
      await within(form).findByText(
        'An exchange through another channel states it in a note.',
      ),
    ).toBeVisible();
    expect(server.mutations()).toHaveLength(0);
    expect(invalidFields(form)).toEqual([within(form).getByLabelText('Note')]);
    selectOptionByLabel(within(form).getByLabelText('Channel'), 'E-mail');
    fireEvent.click(
      within(form).getByRole('button', { name: 'Record the exchange' }),
    );
    const sent = await within(region()).findByRole('listitem', {
      name: 'Exchange Record 1 — Sent — Stage plan',
    });
    expect(sent).toHaveTextContent('Client: Lactis Demo SRL, quality manager');
    expect(sent).toHaveTextContent('E-mail');
    expect(sent).toHaveTextContent('OUT-7');
    expect(sent).toHaveTextContent('Version 1 recorded by Ana Demo');
    expect(server.mutations()[0]).toMatchObject({
      path: `/api/certification-cases/${caseId}/exchanges`,
      body: {
        expectedRevision: 11,
        direction: 'sent',
        itemKind: 'stage_plan',
        attachmentIds: [plan],
        counterpart: {
          kind: 'client',
          name: 'Lactis Demo SRL, quality manager',
        },
        businessDate: '2026-10-29',
        channel: 'email',
        reference: 'OUT-7',
        note: null,
      },
    });
    // The Stage 1 plan shows its sending.
    const stage1 = screen.getByRole('region', { name: 'Stage 1 audit' });
    expect(
      within(stage1).getByRole('list', { name: 'Sendings of this document' }),
    ).toHaveTextContent(
      'Version 1 sent to Client: Lactis Demo SRL, quality manager on 2026-10-29 by E-mail — Exchange Record 1',
    );

    // A received questionnaire, then the filters.
    fireEvent.click(
      within(region()).getByRole('button', { name: 'Record an exchange' }),
    );
    const second = within(region()).getByRole('form', {
      name: 'New Exchange Record',
    });
    selectOptionByLabel(within(second).getByLabelText('Direction'), 'Received');
    selectOptionByLabel(
      within(second).getByLabelText('Item kind'),
      'Application',
    );
    fireEvent.click(
      within(second).getByRole('checkbox', {
        name: 'Questionnaire received, version 1',
      }),
    );
    selectOptionByLabel(
      within(second).getByLabelText('Counterpart kind'),
      'Client',
    );
    change(
      within(second).getByLabelText('Counterpart name'),
      'Lactis Demo SRL',
    );
    change(within(second).getByLabelText('Date of the exchange'), '2026-09-01');
    selectOptionByLabel(within(second).getByLabelText('Channel'), 'E-mail');
    fireEvent.click(
      within(second).getByRole('button', { name: 'Record the exchange' }),
    );
    await within(region()).findByRole('listitem', {
      name: 'Exchange Record 2 — Received — Application',
    });
    expect(server.mutations()[1]?.body).toMatchObject({
      attachmentIds: [questionnaire],
    });
    const register = () =>
      within(region()).getByRole('list', { name: 'Exchange register' });
    expect(
      within(register())
        .getAllByRole('listitem', { name: /^Exchange Record/u })
        .map((item) => item.getAttribute('aria-labelledby') !== null),
    ).toHaveLength(2);
    selectOptionByLabel(
      within(region()).getByLabelText('Direction'),
      'Received',
    );
    expect(
      within(register()).getAllByRole('listitem', {
        name: /^Exchange Record/u,
      }),
    ).toHaveLength(1);
    selectOptionByLabel(within(region()).getByLabelText('Direction'), 'All');
    selectOptionByLabel(
      within(region()).getByLabelText('Item kind'),
      'Audit dossier',
    );
    expect(
      within(region()).getByText('No Exchange Record matches these filters.'),
    ).toBeVisible();
  });

  it('corrects an Exchange Record with a reason and keeps its earlier version', async () => {
    const { server, actor } = serve({ manager: true });
    const { caseId, plan } = plannedCase(server, 'CERT-CORRECT');
    server.install();
    renderWorkspace(actor);
    await openSeededCase('CERT-CORRECT');
    fireEvent.click(
      within(region()).getByRole('button', { name: 'Record an exchange' }),
    );
    const form = within(region()).getByRole('form', {
      name: 'New Exchange Record',
    });
    selectOptionByLabel(within(form).getByLabelText('Direction'), 'Sent');
    selectOptionByLabel(within(form).getByLabelText('Item kind'), 'Stage plan');
    fireEvent.click(
      within(form).getByRole('checkbox', {
        name: 'Stage 1 audit plan, version 1',
      }),
    );
    selectOptionByLabel(
      within(form).getByLabelText('Counterpart kind'),
      'Client',
    );
    change(within(form).getByLabelText('Counterpart name'), 'Lactis Demo SRL');
    change(within(form).getByLabelText('Date of the exchange'), '2026-10-27');
    selectOptionByLabel(within(form).getByLabelText('Channel'), 'E-mail');
    fireEvent.click(
      within(form).getByRole('button', { name: 'Record the exchange' }),
    );
    const record = await within(region()).findByRole('listitem', {
      name: 'Exchange Record 1 — Sent — Stage plan',
    });
    fireEvent.click(
      within(record).getByRole('button', {
        name: 'Correct Exchange Record 1',
      }),
    );
    const correction = within(record).getByRole('form', {
      name: 'Correction of Exchange Record 1',
    });
    change(
      within(correction).getByLabelText('Date of the exchange'),
      '2026-10-29',
    );
    fireEvent.click(
      within(correction).getByRole('button', {
        name: 'Record the correction',
      }),
    );
    expect(
      await within(correction).findByText('A correction states its reason.'),
    ).toBeVisible();
    expect(invalidFields(correction)).toEqual([
      within(correction).getByLabelText('Reason for the correction'),
    ]);
    change(
      within(correction).getByLabelText('Reason for the correction'),
      'Fictional: the plan was sent two days later.',
    );
    fireEvent.click(
      within(correction).getByRole('button', {
        name: 'Record the correction',
      }),
    );
    await waitFor(() =>
      expect(
        within(region()).getByRole('listitem', {
          name: 'Exchange Record 1 — Sent — Stage plan',
        }),
      ).toHaveTextContent(
        'Reason: Fictional: the plan was sent two days later.',
      ),
    );
    const corrected = within(region()).getByRole('listitem', {
      name: 'Exchange Record 1 — Sent — Stage plan',
    });
    expect(corrected).toHaveTextContent('2026-10-29');
    expect(corrected).toHaveTextContent('Version 1 recorded by Ana Demo');
    expect(corrected).toHaveTextContent('Version 2 recorded by Ana Demo');
    // The earlier version stays readable with its own recorded values.
    const earlier = within(corrected).getByText(
      'Values recorded in version 1: Sent — Stage plan',
    );
    fireEvent.click(earlier);
    const details = earlier.closest('details');
    if (!details) throw new Error('Expected the earlier version details.');
    expect(within(details).getByText('2026-10-27')).toBeVisible();
    expect(details).toHaveTextContent('Client: Lactis Demo SRL');
    expect(details).toHaveTextContent('Stage 1 audit plan, version 1');
    expect(server.mutations()[1]).toMatchObject({
      path: `/api/certification-cases/${caseId}/exchanges/1`,
      body: {
        attachmentIds: [plan],
        businessDate: '2026-10-29',
        reason: 'Fictional: the plan was sent two days later.',
      },
    });
  });

  it('adds a manual Re-verification Item, withdraws it with a reason, and retries an uncertain save with the same key', async () => {
    const { server, actor } = serve({ manager: true });
    const { caseId, plan } = plannedCase(server, 'CERT-ITEMS');
    server.install();
    renderWorkspace(actor);
    await openSeededCase('CERT-ITEMS');
    fireEvent.click(
      within(region()).getByRole('button', {
        name: 'Add an item to re-verify',
      }),
    );
    const form = within(region()).getByRole('form', {
      name: 'Item to re-verify',
    });
    change(
      within(form).getByLabelText('What to verify'),
      'Fictional: verify the allergen labels at dispatch.',
    );
    selectOptionByLabel(
      within(form).getByLabelText('Source (optional)'),
      'Stage 1 audit plan, version 1',
    );
    server.interceptions.push({
      match: (request) => request.path.endsWith('/reverification-items'),
      respond: () => Promise.reject(new TypeError('Network down')),
    });
    fireEvent.click(within(form).getByRole('button', { name: 'Add the item' }));
    const retry = await within(region()).findByRole('button', {
      name: 'Retry unchanged save',
    });
    const firstKey = server.mutations().at(-1)?.key;
    fireEvent.click(retry);
    const item = await within(region()).findByRole('listitem', {
      name: /^Item 1: Fictional: verify the allergen labels at dispatch\./u,
    });
    expect(server.mutations()).toHaveLength(2);
    expect(server.mutations().at(-1)?.key).toBe(firstKey);
    expect(item).toHaveTextContent('Added by Ana Demo');
    expect(item).toHaveTextContent('Source: Stage 1 audit plan, version 1');
    expect(server.mutations().at(-1)?.body).toEqual({
      expectedRevision: 10,
      text: 'Fictional: verify the allergen labels at dispatch.',
      source: { attachmentId: plan },
    });
    fireEvent.click(
      within(item).getByRole('button', { name: 'Withdraw item 1' }),
    );
    const withdrawal = within(item).getByRole('form', {
      name: 'Withdrawal of item 1',
    });
    change(
      within(withdrawal).getByLabelText('Reason for the withdrawal'),
      'Fictional: recorded by mistake.',
    );
    fireEvent.click(
      within(withdrawal).getByRole('button', {
        name: 'Record the withdrawal',
      }),
    );
    await waitFor(() =>
      expect(
        within(region()).getByRole('listitem', { name: /^Item 1:/u }),
      ).toHaveTextContent(
        /Withdrawn by Ana Demo on .*: Fictional: recorded by mistake\./u,
      ),
    );
    expect(server.mutations().at(-1)?.path).toMatch(
      new RegExp(
        `/api/certification-cases/${caseId}/reverification-items/[^/]+/withdrawal$`,
        'u',
      ),
    );
  });

  it('shows the reader the register, the deadlines and the items without any command', async () => {
    const { server, actor } = serve({ manager: false });
    const { caseId } = plannedCase(server, 'CERT-READER');
    server.seedDeadlineSet(FICTIONAL);
    server.seedDeadlineStates(caseId, entries);
    server.install();
    renderWorkspace(actor);
    await openSeededCase('CERT-READER');
    expect(within(region()).queryAllByRole('button')).toEqual([]);
    expect(within(region()).queryAllByRole('form')).toEqual([]);
    expect(
      within(region()).getByRole('list', { name: 'Procedure deadlines' }),
    ).toBeVisible();
  });

  it('treats a command reply recorded before exchange pagination as unreadable and retries it unchanged', async () => {
    const { server, actor } = serve({ manager: true });
    const { caseId } = plannedCase(server, 'CERT-RECEIPT');
    server.install();
    renderWorkspace(actor);
    await openSeededCase('CERT-RECEIPT');
    fireEvent.click(
      within(region()).getByRole('button', {
        name: 'Add an item to re-verify',
      }),
    );
    const form = within(region()).getByRole('form', {
      name: 'Item to re-verify',
    });
    change(
      within(form).getByLabelText('What to verify'),
      'Fictional: verify the allergen labels at dispatch.',
    );
    answerWithPrePaginationReceipt(server, {
      suffix: '/reverification-items',
      caseId,
    });
    fireEvent.click(within(form).getByRole('button', { name: 'Add the item' }));
    const retry = await within(region()).findByRole('button', {
      name: 'Retry unchanged save',
    });
    expect(within(form).getByLabelText('What to verify')).toHaveDisplayValue(
      'Fictional: verify the allergen labels at dispatch.',
    );
    const firstKey = server.mutations().at(-1)?.key;
    fireEvent.click(retry);
    await within(region()).findByRole('listitem', {
      name: /^Item 1: Fictional: verify the allergen labels at dispatch\./u,
    });
    expect(server.mutations()).toHaveLength(2);
    expect(server.mutations().at(-1)?.key).toBe(firstKey);
  });

  it('lets the Company administrator set the procedure deadlines and read their history, with stale and uncertain saves', async () => {
    const { server, actor } = serve({ manager: true, administrator: true });
    plannedCase(server, 'CERT-ADMIN');
    server.install();
    renderWorkspace(actor);
    await openSeededCase('CERT-ADMIN');
    fireEvent.click(
      within(region()).getByRole('button', {
        name: 'Configure the procedure deadlines',
      }),
    );
    const panel = await within(region()).findByRole('form', {
      name: 'Procedure deadline configuration',
    });
    change(
      within(panel).getByLabelText(
        'Stage plan sent to the client, in calendar days',
      ),
      '400',
    );
    fireEvent.click(
      within(panel).getByRole('button', { name: 'Save the deadlines' }),
    );
    expect(
      await within(panel).findByText(
        'Enter whole days from 0 to 365, or leave the value empty.',
      ),
    ).toBeVisible();
    expect([...panel.querySelectorAll('[aria-invalid="true"]')]).toEqual([
      within(panel).getByLabelText(
        'Stage plan sent to the client, in calendar days',
      ),
    ]);
    for (const [label, value] of [
      ['Stage plan sent to the client, in calendar days', '10'],
      [
        'Audit dossier transmitted to the certification body, in calendar days',
        '20',
      ],
      ['Stage 2 report released to the client, in calendar days', '0'],
    ] as const)
      change(within(panel).getByLabelText(label), value);
    server.interceptions.push({
      match: (request) =>
        request.path === '/api/certification-procedure-deadlines' &&
        request.method === 'POST',
      respond: () => Promise.reject(new TypeError('Network down')),
    });
    fireEvent.click(
      within(panel).getByRole('button', { name: 'Save the deadlines' }),
    );
    fireEvent.click(
      await within(region()).findByRole('button', { name: 'Try again' }),
    );
    const posts = () =>
      server.requests.filter(
        (request) =>
          request.path === '/api/certification-procedure-deadlines' &&
          request.method === 'POST',
      );
    expect(
      await within(region()).findByText('Deadline set version 1 saved.'),
    ).toBeVisible();
    expect(posts()).toHaveLength(2);
    expect(posts()[1]?.key).toBe(posts()[0]?.key);
    expect(posts()[1]?.body).toEqual({ expectedVersion: 0, days: FICTIONAL });
    expect(
      within(region()).getByRole('list', {
        name: 'History of the deadline set',
      }),
    ).toHaveTextContent(
      'Stage plan sent to the client: 10 days; Audit dossier transmitted to the certification body: 20 days; Stage 2 report released to the client: 0 days',
    );
    // Another administrator changed the set meanwhile.
    server.seedDeadlineSet({ ...FICTIONAL, stage_plan_sent: 12 });
    change(
      within(region()).getByLabelText(
        'Stage plan sent to the client, in calendar days',
      ),
      '',
    );
    fireEvent.click(
      within(region()).getByRole('button', { name: 'Save the deadlines' }),
    );
    expect(
      await within(region()).findByText(
        'The deadlines changed meanwhile. Reload them, then save your values again.',
      ),
    ).toBeVisible();
    expect(panel.querySelectorAll('[aria-invalid="true"]')).toHaveLength(0);
    fireEvent.click(
      within(region()).getByRole('button', { name: 'Reload the deadlines' }),
    );
    await waitFor(() =>
      expect(
        within(region()).getByLabelText(
          'Stage plan sent to the client, in calendar days',
        ),
      ).toHaveValue('12'),
    );
  });

  it('offers the deadline configuration only to the Company administrator', async () => {
    const { server, actor } = serve({ manager: true });
    plannedCase(server, 'CERT-NO-ADMIN');
    server.install();
    renderWorkspace(actor);
    await openSeededCase('CERT-NO-ADMIN');
    expect(
      within(region()).queryByRole('button', {
        name: 'Configure the procedure deadlines',
      }),
    ).toBeNull();
  });

  it('is available in Romanian, Russian, French and English', async () => {
    expect(() =>
      assertMessageCoverage('exchanges', exchangeMessages),
    ).not.toThrow();
    const { server, actor } = serve({ manager: true });
    const { caseId } = plannedCase(server, 'CERT-LOCALE');
    server.seedDeadlineSet(FICTIONAL);
    server.seedDeadlineStates(caseId, entries);
    server.install();
    renderWorkspace(actor);
    await openSeededCase('CERT-LOCALE');
    for (const [locale, title, state] of [
      ['fr', 'Échanges et délais', 'Dépassé'],
      ['ro', 'Schimburi și termene', 'Depășit'],
      ['ru', 'Обмены и сроки', 'Просрочен'],
    ] as const) {
      fireEvent.click(screen.getByRole('button', { name: `Locale ${locale}` }));
      const panel = await screen.findByRole('region', { name: title });
      expect(within(panel).getByText(state)).toBeVisible();
    }
  });
});
