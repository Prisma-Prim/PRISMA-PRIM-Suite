import { webcrypto } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { deterministicBrowserIdentity } from './access-composition';
import {
  commercialActor,
  commercialClient,
  commercialRequest,
  createDealCommercialApi,
  type CommercialApiOptions,
} from './clarte/deals/commercial-stages.test-fixture';
import { pdfReply } from './commercial-pdf/commercial-pdf.test-fixture';
import {
  modelOfferEconomicFixture,
  modelOfferFixture,
} from './offer/model-offer.fixture';
import { renderInInterface } from './test/app-interface';
import {
  act,
  fireEvent,
  screen,
  waitFor,
  within,
} from './test/render-with-interface-locale';
import { changeValue, selectOption } from './test/select-option';

const dealTitle = commercialRequest.initialOpportunity.title;
const MODEL_OPPORTUNITY_TAIL = commercialRequest.initialOpportunity.id;

type Held = { release: () => void };

/** Serves the fictional deal; owner reads can be held to show loading. */
function serve(options: CommercialApiOptions = {}) {
  const api = createDealCommercialApi(options);
  const held: Held[] = [];
  let holdOwnerReads = false;
  const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'http://application.test');
    const method = init?.method ?? 'GET';
    if (url.pathname.endsWith('/pdf')) return pdfReply(api.pdfTarget());
    const owner =
      /\/(pricing|offers)\/opportunities\/|\/profitability-estimates/u.test(
        url.pathname,
      );
    if (holdOwnerReads && owner && method === 'GET')
      await new Promise<void>((resolve) => held.push({ release: resolve }));
    const reply = api.reply({
      method,
      url,
      body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
    });
    return Response.json(reply.json, { status: reply.status });
  });
  vi.stubGlobal('fetch', fetch);
  return {
    ...api,
    fetch,
    holdOwnerReads() {
      holdOwnerReads = true;
    },
    releaseOwnerReads() {
      holdOwnerReads = false;
      for (const read of held.splice(0)) read.release();
    },
  };
}

async function openDeal() {
  renderInInterface(
    'clarte',
    <App identity={deterministicBrowserIdentity()} />,
  );
  const row = await screen.findByRole('button', { name: dealTitle });
  await act(async () => {
    fireEvent.click(row);
  });
  await screen.findByRole('heading', { level: 2, name: dealTitle });
}

function thread() {
  return screen.getByRole('list', { name: 'Deal stages' });
}

async function openStage(stage: 'Costing' | 'Offer') {
  fireEvent.click(
    within(thread()).getByRole('button', { name: new RegExp(stage, 'u') }),
  );
  return screen.findByRole('region', { name: stage });
}

function stageMarker(stage: 'Costing' | 'Offer') {
  return within(thread()).getByRole('button', {
    name: new RegExp(stage, 'u'),
  });
}

/** Requests of this slice's owners the fictional API did not answer. */
function ownerReadsUnhandled(api: { unhandled: Set<string> }) {
  return [...api.unhandled].filter((request) =>
    /\/api\/(deals|commercial-intake|pricing\/|opportunities\/|offers|offer-models|clients\/.+\/legal-entities)/u.test(
      request,
    ),
  );
}

function offerOwner() {
  return screen.getByRole('region', { name: 'Illustrative Offer' });
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  vi.stubGlobal('crypto', webcrypto);
  window.history.replaceState(null, '', '/#requests');
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  window.history.replaceState(null, '', '/');
});

describe('Costing and Offer stages in the Clarté interface', () => {
  it('calculates and records a pricing snapshot at Costing, reopens it and rereads the deal', async () => {
    const api = serve();
    await openDeal();
    const costing = await openStage('Costing');
    const pricing = await within(costing).findByRole('region', {
      name: 'Illustrative pricing',
    });
    expect(
      await within(pricing).findByText(
        'No Pricing Snapshot has been saved for this Opportunity.',
      ),
    ).toBeVisible();
    const reads = api.dealReads();

    // EX-078: up to 20 Offerings with quantities, calculated and saved.
    fireEvent.click(
      within(pricing).getByRole('checkbox', {
        name: 'ISO 22000 certification audit',
      }),
    );
    changeValue(within(pricing).getByLabelText('Quantity'), '5');
    fireEvent.click(
      within(pricing).getByRole('button', { name: 'Calculate and save' }),
    );
    await waitFor(() =>
      expect(api.writes).toEqual([
        `POST /api/pricing/opportunities/${commercialRequest.initialOpportunity.id}/snapshots`,
      ]),
    );
    // The thread and the stage facts follow without a reload.
    await waitFor(() => expect(api.dealReads()).toBe(reads + 1));
    await waitFor(() =>
      expect(stageMarker('Costing')).toHaveTextContent('Current stage'),
    );
    expect(
      within(costing).getByRole('region', { name: 'At a glance' }),
    ).toHaveTextContent('31200.00 MDL');

    // EX-079: the recorded snapshot reopens from the history.
    fireEvent.click(
      within(pricing).getByRole('button', { name: 'Close snapshot' }),
    );
    fireEvent.click(
      within(pricing).getByRole('button', { name: /^Reopen snapshot/u }),
    );
    expect(
      await within(pricing).findByRole('button', { name: 'Close snapshot' }),
    ).toBeVisible();
    expect(pricing).toHaveTextContent('ISO 22000 certification audit');
    expect(ownerReadsUnhandled(api)).toEqual([]);
  });

  it('records an estimate version and decides it beside its exact figures, then reads the history', async () => {
    const api = serve();
    await openDeal();
    const costing = await openStage('Costing');
    const estimate = await within(costing).findByRole('region', {
      name: 'Profitability Estimate',
    });
    expect(
      await within(estimate).findByText(
        'No Profitability Estimate Versions yet.',
      ),
    ).toBeVisible();

    // EX-080: a confirmed version with every cost and the proposed price.
    for (const [label, value] of [
      ['ISO currency', 'MDL'],
      ['Executor cost', '9800.00'],
      ['Confirmed fiscal cost', '1700.00'],
      ['Explicit allocated overhead', '1200.00'],
      ['Proposed commercial price', '21000.00'],
      ['Target profitability (%)', '30'],
    ] as const)
      changeValue(within(estimate).getByLabelText(label), value);
    selectOption(
      within(estimate).getByLabelText('Executor type'),
      'DIRECTOR_OR_EMPLOYEE',
    );
    selectOption(within(estimate).getByLabelText('Pricing intent'), 'ORDINARY');
    fireEvent.click(within(estimate).getByRole('checkbox'));
    const reads = api.dealReads();
    fireEvent.click(
      within(estimate).getByRole('button', { name: 'Save confirmed version' }),
    );
    expect(await within(estimate).findByText('Version saved.')).toBeVisible();
    await waitFor(() => expect(api.dealReads()).toBe(reads + 1));

    // EX-081: the decision sits beside the exact version it decides.
    const version = within(estimate).getByRole('article', {
      name: 'Version 1',
    });
    const decision = within(version).getByRole('region', {
      name: 'Decision for this version',
    });
    const beside = decision.parentElement;
    if (!beside) throw new Error('Expected the version layout.');
    expect(beside).toHaveClass('profitability-version-beside');
    const figures = beside.querySelector('.profitability-version-record');
    if (!(figures instanceof HTMLElement))
      throw new Error('Expected the exact version figures.');
    expect(figures).toHaveTextContent('Proposed commercial price');
    expect(figures).toHaveTextContent('Estimated profitability (%)');
    expect(figures).toHaveTextContent('39.52%');
    fireEvent.click(
      within(decision).getByRole('button', { name: 'Approve this version' }),
    );
    expect(
      await within(estimate).findByText(
        'Director decision recorded for this exact version.',
      ),
    ).toBeVisible();
    expect(decision).toHaveTextContent('Approved');
    await waitFor(() => expect(api.dealReads()).toBe(reads + 2));
    await waitFor(() =>
      expect(
        within(costing).getByRole('region', { name: 'At a glance' }),
      ).toHaveTextContent('Version 1Approved'),
    );

    // EX-082: the immutable history opens any version.
    const history = within(estimate).getByRole('list');
    expect(history).toHaveTextContent('Version 1');
    fireEvent.click(
      within(history).getByRole('button', { name: 'Open version 1' }),
    );
    await waitFor(() =>
      expect(
        api.fetch.mock.calls.some(([input]) =>
          String(input).includes('/profitability-estimates/versions/'),
        ),
      ).toBe(true),
    );
    expect(api.writes).toEqual([
      `POST /api/opportunities/${commercialRequest.initialOpportunity.id}/profitability-estimates`,
      expect.stringMatching(/\/decision$/u),
    ]);
  });

  it('prepares the illustrative Offer from a snapshot, checks it, approves it beside its exact version and records the simulated transmission and acceptance', async () => {
    const api = serve({ initial: 'costed' });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(
      () => undefined,
    );
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:offer-1534');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    await openDeal();
    const stage = await openStage('Offer');
    expect(
      within(stage).getByRole('region', { name: 'Offer path' }),
    ).toHaveTextContent('No Offer prepared yet.');

    // EX-084: version 1 from the recorded snapshot.
    const commercialConditions = await within(stage).findByLabelText(
      'Commercial conditions',
    );
    changeValue(
      commercialConditions,
      'Half on signature, half after the audit',
    );
    const reads = api.dealReads();
    fireEvent.click(
      within(stage).getByRole('button', { name: 'Prepare version 1' }),
    );
    expect(
      await within(stage).findByTitle('Illustrative Offer representation'),
    ).toBeVisible();
    await waitFor(() =>
      expect(stageMarker('Offer')).toHaveTextContent('Current stage'),
    );
    expect(api.dealReads()).toBeGreaterThan(reads);

    // The commands sit beside the exact representation they act on.
    const document = offerOwner().querySelector('.offer-version-document');
    const commands = offerOwner().querySelector('.offer-version-commands');
    if (
      !(document instanceof HTMLElement) ||
      !(commands instanceof HTMLElement)
    )
      throw new Error('Expected the version beside its commands.');
    expect(document.parentElement).toBe(commands.parentElement);
    expect(
      within(document).getByTitle('Illustrative Offer representation'),
    ).toBeVisible();
    expect(document).toHaveTextContent(
      'e08e76ef771b57620b188b0e65648e93f47dbf7c88fd8582a403e4e4f75eaf34',
    );

    // EX-089: Quality Checks on this exact version.
    fireEvent.click(
      within(commands).getByRole('button', { name: 'Run Quality Checks' }),
    );
    expect(
      await within(commands).findByText('All Quality Checks passed.'),
    ).toBeVisible();

    // EX-090: the internal approval, beside the version it approves.
    const decision = within(commands).getByRole('region', {
      name: 'Internal decision',
    });
    fireEvent.click(
      within(decision).getByRole('button', { name: 'Approve this version' }),
    );
    expect(await within(stage).findByText('Version approved.')).toBeVisible();
    await waitFor(() =>
      expect(
        within(stage).getByRole('region', { name: 'Offer path' }),
      ).toHaveTextContent('Internal decisionApproved'),
    );

    // EX-091: the simulated transmission with its note.
    changeValue(
      await within(commands).findByLabelText('Simulation note'),
      'Sent by e-mail to the Client',
    );
    fireEvent.click(
      within(commands).getByRole('button', {
        name: 'Record simulated transmission',
      }),
    );
    await waitFor(() =>
      expect(
        within(document).getByText('Sent by e-mail to the Client'),
      ).toBeVisible(),
    );

    // EX-092: the simulated Client acceptance.
    changeValue(
      await within(commands).findByLabelText('Reported received time (UTC)'),
      '2026-10-03T12:35:00.000Z',
    );
    fireEvent.click(
      within(commands).getByRole('button', {
        name: 'Record simulated acceptance',
      }),
    );
    expect(
      await within(stage).findByText('Simulated Client acceptance recorded'),
    ).toBeVisible();
    await waitFor(() =>
      expect(
        within(stage).getByRole('region', { name: 'Offer path' }),
      ).toHaveTextContent('Client responseAccepted by the Client'),
    );

    // EX-088 and EX-094: the exact HTML and the unofficial PDF.
    fireEvent.click(
      within(document).getByRole('button', {
        name: 'Download exact English HTML',
      }),
    );
    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledTimes(1);
    fireEvent.click(
      within(document).getByRole('button', {
        name: 'Download non-official PDF',
      }),
    );
    await waitFor(() =>
      expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledTimes(2),
    );
    expect(
      api.fetch.mock.calls.some(([input]) =>
        String(input).includes('/pdf?sourceHtmlSha256='),
      ),
    ).toBe(true);

    // EX-093: the cover message to copy by hand.
    fireEvent.click(
      within(commands).getByRole('button', { name: 'Prepare message' }),
    );
    expect(
      await screen.findByText(
        `Immutable Offer party: ${commercialClient.displayName}`,
      ),
    ).toBeVisible();
    changeValue(
      screen.getByRole('textbox', { name: 'Recipient' }),
      'quality@codru-orchards.example',
    );
    changeValue(
      screen.getByRole('textbox', { name: 'Subject' }),
      'Offer 12 for the food safety certification',
    );
    changeValue(
      screen.getByRole('textbox', { name: 'Message body' }),
      'Please find attached our Offer.',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Review message' }));
    expect(
      await screen.findByText(
        'Reviewed for this exact Offer. Any edit requires a new review.',
      ),
    ).toBeVisible();
    expect(api.writes.map((write) => write.split('/').at(-1))).toEqual([
      MODEL_OPPORTUNITY_TAIL,
      'quality-checks',
      'approve',
      'transmission',
      'client-response',
    ]);
    expect(ownerReadsUnhandled(api)).toEqual([]);
  });

  it('creates a new version, reads the history with differences and reopens the earlier exact version', async () => {
    const api = serve({ initial: 'costed' });
    await openDeal();
    const stage = await openStage('Offer');
    fireEvent.click(
      await within(stage).findByRole('button', { name: 'Prepare version 1' }),
    );
    await within(stage).findByTitle('Illustrative Offer representation');

    // EX-087: a successor with its recorded differences.
    fireEvent.click(
      within(stage).getByRole('button', { name: 'Prepare a new version' }),
    );
    changeValue(
      await within(stage).findByLabelText('Commercial conditions'),
      'Second warehouse added to the scope',
    );
    fireEvent.click(
      within(stage).getByRole('button', { name: 'Create new version' }),
    );
    expect(
      await within(stage).findByText('New Offer version created.'),
    ).toBeVisible();
    const history = offerOwner().querySelector('.offer-version-history');
    if (!(history instanceof HTMLElement))
      throw new Error('Expected the version history.');
    expect(
      await within(history).findByText('Differences from previous version'),
    ).toBeVisible();
    expect(history).toHaveTextContent('Second warehouse added to the scope');
    await waitFor(() =>
      expect(
        within(stage).getByRole('region', { name: 'Offer path' }),
      ).toHaveTextContent('PreparedVersion 2'),
    );

    // The earlier version reopens exactly, read only.
    fireEvent.click(
      await within(history).findByRole('button', { name: 'Open version 1' }),
    );
    expect(
      await within(stage).findByText('Historical version · read only'),
    ).toBeVisible();
    expect(ownerReadsUnhandled(api)).toEqual([]);
  });

  it('prepares an internal Offer from an approved estimate on the Offer stage', async () => {
    await prepareFromSource({
      open: 'Prepare from an approved estimate',
      create: 'Create internal draft',
      write: 'from-approved-estimate',
    });
  });

  it('prepares the Romanian consulting Offer from the approved model on the Offer stage', async () => {
    await prepareFromSource({
      open: 'Prepare full Offer from approved model',
      create: 'Create non-official Offer',
      write: 'from-approved-model',
    });
  });

  /** EX-085 and EX-086: each kind of Offer from its existing source. */
  async function prepareFromSource({
    open,
    create,
    write,
  }: Readonly<{
    open: string;
    create: string;
    write: 'from-approved-estimate' | 'from-approved-model';
  }>) {
    const api = serve({ initial: 'costed' });
    await openDeal();
    const stage = await openStage('Offer');
    fireEvent.click(await within(stage).findByRole('button', { name: open }));
    fireEvent.change(
      await within(stage).findByLabelText('Approved estimate version'),
      { target: { value: modelOfferEconomicFixture().id } },
    );
    if (write === 'from-approved-model') {
      for (const [label, value] of [
        ['Declared tax amount (same currency)', '25.00'],
        // The values the fictional model Offer declares.
        ['Declared tax label', 'Literal tax'],
        [
          'Internal declaration basis',
          modelOfferFixture().version.financialDeclaration.basis,
        ],
      ] as const)
        fireEvent.change(within(stage).getByLabelText(label), {
          target: { value },
        });
      fireEvent.click(
        within(stage).getByLabelText('Select this model version deliberately'),
      );
      fireEvent.click(
        within(stage).getByLabelText(
          'I confirm the approved amount is the net amount for this Offer version.',
        ),
      );
    }
    const reads = api.dealReads();
    fireEvent.click(within(stage).getByRole('button', { name: create }));
    await waitFor(() =>
      expect(api.writes).toEqual([
        expect.stringMatching(new RegExp(`/${write}$`, 'u')),
      ]),
    );
    await waitFor(() => expect(api.dealReads()).toBeGreaterThan(reads));
    expect(
      write === 'from-approved-model'
        ? await within(stage).findByRole('button', {
            name: 'Download exact Romanian HTML',
          })
        : await within(stage).findByRole('region', {
            name: 'Internal draft · tax treatment unspecified',
          }),
    ).toBeVisible();
    expect(ownerReadsUnhandled(api)).toEqual([]);
  }

  it('shows the loading and empty states of both stages', async () => {
    // Loading, then the empty owners.
    const api = serve();
    api.holdOwnerReads();
    await openDeal();
    const costing = await openStage('Costing');
    expect(
      await within(costing).findByText('Loading estimate history…'),
    ).toBeVisible();
    api.releaseOwnerReads();
    expect(
      await within(costing).findByText(
        'No Profitability Estimate Versions yet.',
      ),
    ).toBeVisible();
    expect(
      within(costing).getByRole('region', { name: 'At a glance' }),
    ).toHaveTextContent('No pricing snapshot yet.');
    const offer = await openStage('Offer');
    expect(
      await within(offer).findByText(
        'Save an illustrative Pricing Snapshot before preparing an Offer.',
      ),
    ).toBeVisible();
    expect(
      within(offer).getByRole('region', { name: 'Offer path' }),
    ).toHaveTextContent('No Offer prepared yet.');
  });

  it('shows the error states of both stages with their retry', async () => {
    serve({ ownerReadStatus: 500 });
    await openDeal();
    const costing = await openStage('Costing');
    expect(
      await within(costing).findByText(
        'Estimate history could not be loaded. Reload.',
      ),
    ).toBeVisible();
    const offer = await openStage('Offer');
    expect(
      await within(offer).findByText(
        'The Offer could not be loaded. Try again.',
      ),
    ).toBeVisible();
    expect(within(offer).getByRole('button', { name: 'Retry' })).toBeVisible();
  });

  it('shows the no-permission states to a reader without Costing or Offer grants', async () => {
    const api = serve();
    api.setActor(commercialActor('reader'));
    await openDeal();
    const offer = await openStage('Offer');
    expect(
      await within(offer).findByText(
        'Offer access is not available for this Opportunity.',
      ),
    ).toBeVisible();
    const costing = await openStage('Costing');
    expect(
      within(costing).queryByRole('region', { name: 'Profitability Estimate' }),
    ).not.toBeInTheDocument();
    expect(
      within(costing).queryByRole('button', { name: 'Calculate and save' }),
    ).not.toBeInTheDocument();
    expect(api.writes).toEqual([]);
  });
});
