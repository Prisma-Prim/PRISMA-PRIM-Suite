import { afterEach, expect, it, vi } from 'vitest';
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '../test/render-with-interface-locale';
import { deterministicBrowserIdentity } from '../access-composition';
import type { ActorContext } from '../access-types';
import {
  modelOfferActor,
  modelOfferFixture,
} from '../offer/model-offer.fixture';
import { readOfferDetail } from '../offer/offer-response';
import { supportedOfferMessageTarget } from '../offer-message/offer-message-preparation';
import {
  buildClientRequest,
  requestListItemFor,
} from '../test/commercial-intake-responses';
import { CommercialIntakeWorkspace } from './CommercialIntakeWorkspace';

const identity = deterministicBrowserIdentity();
const capture = 'offer-message-read.v1.' + 'b'.repeat(64);
const first = modelOfferFixture();
const second = {
  ...first,
  revision: 2,
  version: {
    ...first.version,
    id: '90000000-0000-4000-8000-000000001043',
    versionNumber: 2,
    predecessorVersionId: first.version.id,
    representation: { ...first.version.representation, sha256: 'c'.repeat(64) },
  },
};
const detail = buildClientRequest({
  id: 'request-message-1043',
  companyId: first.companyId,
  subject: 'Exact message Request',
  initialOpportunity: { id: first.opportunityId },
});
const other = buildClientRequest({
  id: 'other-request-message-1043',
  companyId: first.companyId,
  subject: 'Other message Request',
  initialOpportunity: { id: '10000000-0000-4000-8000-000000001043' },
});
function reader(): ActorContext {
  return {
    ...modelOfferActor,
    activeCompany: {
      id: first.companyId,
      displayName: 'Message Company',
      clientPermissions: ['client.read'],
      offerPermissions: ['commercial.offer.read'],
      offerMessageReadCapture: capture,
      commercialIntakePermissions: [
        'commercial.request.read',
        'commercial.opportunity.read',
        'commercial.opportunity.next_action.update',
      ],
      commercialIntakePermissionAssignmentId: 'intake-1043',
      commercialIntakePermissionSetVersion: 'v2',
    },
  };
}
function install() {
  const state: {
    head: typeof first | typeof second;
    observations: number;
    mutations: string[];
  } = { head: first, observations: 0, mutations: [] };
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = new URL(input.toString(), 'http://localhost');
    const path = url.pathname;
    if ((init?.method ?? 'GET') !== 'GET') state.mutations.push(path);
    if (path.endsWith('/message-preparation')) {
      state.observations += 1;
      const selected = path.includes(first.version.id) ? first : second;
      const parsed = readOfferDetail({ offer: selected });
      if (!parsed) throw new Error('Expected readable native Offer fixture.');
      const target = supportedOfferMessageTarget({
        actor: reader(),
        opportunityId: first.opportunityId,
        offer: parsed,
      });
      if (!target) throw new Error('Expected native supported fixture.');
      return Response.json({
        format: 'offer-message-preparation.v1',
        readCapture: capture,
        source: target,
        party: selected.version.recipient,
        actor: {
          workspaceMembershipId: reader().workspaceMembershipId,
          displayName: reader().displayName,
        },
      });
    }
    if (path.endsWith('/commercial-intake/requests'))
      return Response.json({
        items: [detail, other].map((request) => requestListItemFor(request)),
      });
    if (path.endsWith('/commercial-intake/requests/' + detail.id))
      return Response.json(detail);
    if (path.endsWith('/commercial-intake/requests/' + other.id))
      return Response.json(other);
    if (path.includes('/offers/')) {
      if (path.endsWith('/versions'))
        return Response.json({ versions: [], nextCursor: null });
      if (path.endsWith(other.initialOpportunity.id))
        return Response.json({ offer: null });
      return Response.json({ offer: state.head });
    }
    if (path.endsWith('/clients'))
      return Response.json({ items: [], nextCursor: null });
    throw new Error('Unexpected message workspace request: ' + path);
  });
  return state;
}
function openRequest(subject: string) {
  const label = screen.getByText(subject);
  const button = label.closest('button');
  if (!button) throw new Error('Request must have its native opening control.');
  fireEvent.click(button);
}
async function prepare() {
  fireEvent.click(
    await screen.findByRole('button', { name: 'Prepare message' }),
  );
  await screen.findByText(/Immutable Offer party/u);
  fireEvent.change(screen.getByRole('textbox', { name: 'Recipient' }), {
    target: { value: 'reader@example.invalid' },
  });
  fireEvent.change(screen.getByRole('textbox', { name: 'Subject' }), {
    target: { value: 'Held exact Version' },
  });
  fireEvent.change(screen.getByRole('textbox', { name: 'Message body' }), {
    target: { value: 'Literal held body' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Review message' }));
  expect(screen.getByRole('button', { name: 'Copy body' })).toBeEnabled();
}
afterEach(() => vi.restoreAllMocks());

it('holds the exact composer outside Client/economic refresh keys and preserves an unrelated native editor', async () => {
  const state = install();
  let actor = reader();
  const element = () => (
    <CommercialIntakeWorkspace
      actor={actor}
      identity={identity}
      onCompanyContextRejected={() => undefined}
    />
  );
  const view = render(element());
  await screen.findByText(detail.subject ?? '');
  openRequest(detail.subject ?? '');
  fireEvent.click(
    await screen.findByRole('button', {
      name: 'Edit next action',
    }),
  );
  fireEvent.change(screen.getByRole('textbox', { name: 'Next action' }), {
    target: { value: 'Unrelated native draft' },
  });
  await prepare();
  state.head = second;
  const company = actor.activeCompany;
  if (!company) throw new Error('Expected the native Message Company.');
  actor = {
    ...actor,
    displayName: 'Renamed current reader',
    activeCompany: {
      ...company,
      clientPermissions: [],
      profitabilityContributorPermissionAssignmentId:
        'unrelated-new-economic-assignment',
      profitabilityContributorPermissionSetVersion: 'v1',
      profitabilityContributorPermissions: [],
    },
  };
  view.rerender(element());
  await waitFor(() => {
    const panel = document.querySelector('.offer-panel');
    if (!(panel instanceof HTMLElement))
      throw new Error('Native Offer panel required.');
    expect(
      within(panel).getByText('Version').nextElementSibling,
    ).toHaveTextContent('2');
  });
  const composer = document.querySelector('.offer-message-preparation');
  if (!(composer instanceof HTMLElement))
    throw new Error('Expected retained composer.');
  expect(within(composer).getByText(/· v1/u)).toBeInTheDocument();
  expect(
    within(composer).getByRole('textbox', {
      name: 'Message body',
    }),
  ).toHaveValue('Literal held body');
  expect(
    within(composer).getByRole('button', { name: 'Copy body' }),
  ).toBeEnabled();
  expect(
    within(composer).getByText(/Renamed current reader/u),
  ).toBeInTheDocument();
  expect(screen.getByRole('textbox', { name: 'Next action' })).toHaveValue(
    'Unrelated native draft',
  );
  expect(state.observations).toBe(1);
  fireEvent.click(screen.getByRole('button', { name: 'Close preparation' }));
  expect(screen.getByRole('textbox', { name: 'Next action' })).toHaveValue(
    'Unrelated native draft',
  );
  expect(state.mutations).toEqual([]);
});

it('retires navigation A → B → A and opens a fresh empty preparation', async () => {
  const state = install();
  render(
    <CommercialIntakeWorkspace
      actor={reader()}
      identity={identity}
      onCompanyContextRejected={() => undefined}
    />,
  );
  await screen.findByText(detail.subject ?? '');
  openRequest(detail.subject ?? '');
  await prepare();
  fireEvent.click(screen.getByRole('button', { name: 'Back to Requests' }));
  openRequest(other.subject ?? '');
  await screen.findByRole('heading', { name: other.subject ?? '' });
  expect(
    screen.queryByRole('textbox', { name: 'Message body' }),
  ).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Back to Requests' }));
  openRequest(detail.subject ?? '');
  fireEvent.click(
    await screen.findByRole('button', { name: 'Prepare message' }),
  );
  await screen.findByText(/Immutable Offer party/u);
  expect(screen.getByRole('textbox', { name: 'Message body' })).toHaveValue('');
  expect(screen.getByRole('button', { name: 'Copy body' })).toBeDisabled();
  expect(state.mutations).toEqual([]);
});
