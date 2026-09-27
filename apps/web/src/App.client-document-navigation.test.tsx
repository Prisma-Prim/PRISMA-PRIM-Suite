import { changeValue } from './test/select-option';
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { deterministicBrowserIdentity } from './access-composition';
import type { ActorContext } from './access-types';

const companyA = { id: 'company-a', displayName: 'Company A' };
const companyB = { id: 'company-b', displayName: 'Company B' };
const membershipId = 'membership-1';
const projectionReference = 'projection-297';
const firstClient = {
  id: 'client-first',
  version: 2,
  displayName: 'First saved Client',
  taxId: 'UNION-297',
  address: null,
  telephone: '+373 60 111 222',
  generalEmail: null,
  businessActivity: null,
  contacts: [{ name: 'Alex' }],
};
const secondClient = {
  ...firstClient,
  id: 'client-second',
  version: 4,
  displayName: 'Second saved Client',
  address: '14 Example Avenue',
  contacts: [{ name: 'Dana' }],
};
const comparison = {
  outcome: 'comparison',
  reviewReference: 'review-297',
  clients: [firstClient, secondClient],
  companies: [companyA],
};
const workingDocument = {
  id: 'document-first',
  companyId: companyA.id,
  clientId: 'historical-first',
  clientDisplayName: firstClient.displayName,
  title: 'First questionnaire',
  purpose: 'Prepare the first interview',
  type: 'questionnaire',
  confidentiality: 'company-confidential',
  createdAt: '2026-09-19T08:00:00.000Z',
  workingRevision: 1,
  correction: 'allowed',
  version: {
    id: 'version-first',
    status: 'draft',
    representation: {
      id: 'representation-first',
      kind: 'external-reference',
      verification: 'unverified',
      access: 'denied',
    },
  },
};
const secondDocument = {
  ...workingDocument,
  id: 'document-second',
  clientId: secondClient.id,
  clientDossierId: secondClient.id,
  clientDisplayName: secondClient.displayName,
  title: 'Second questionnaire',
};
const otherCompanyDocument = {
  ...workingDocument,
  id: 'document-other-company',
  companyId: companyB.id,
  clientId: 'client-other-company',
  clientDossierId: 'client-other-company',
  clientDisplayName: 'Other Company Client',
  title: 'Other Company questionnaire',
};

function actorFor(companyId: string, administrator: boolean): ActorContext {
  return {
    internalUserId: 'resolver',
    workspaceMembershipId: membershipId,
    workspaceId: 'workspace',
    workspaceName: 'Workspace',
    displayName: 'Resolver',
    email: 'resolver@example.test',
    active: true,
    workspacePermissions: administrator
      ? ['client.manage', 'company.assignment.manage']
      : ['client.manage'],
    activeCompany: {
      ...(companyId === companyB.id ? companyB : companyA),
      clientPermissions: [
        'client.read',
        'client.create',
        'client.update',
        'client.duplicate.resolve',
      ],
      clientPermissionAssignmentId: 'assignment-1',
      clientPermissionSetVersion: 'v2',
      documentPermissions: ['document.read'],
    },
  };
}

function respond(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), { status });
}

function installTransport(
  options: { united?: boolean; administrator?: boolean } = {},
) {
  const state = {
    united: options.united ?? false,
    administrator: options.administrator ?? false,
    documentReads: 0,
    grants: 0,
  };
  const documentsFor = (companyId: string | null) =>
    companyId === companyB.id
      ? [otherCompanyDocument]
      : [
          {
            ...workingDocument,
            clientDossierId: state.united ? secondClient.id : firstClient.id,
          },
          secondDocument,
        ];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = input.toString();
      const companyContextId = new Headers(init?.headers).get(
        'x-company-context-id',
      );
      if (path.endsWith('/access/current-actor'))
        return respond(
          actorFor(companyContextId ?? companyA.id, state.administrator),
        );
      if (path.endsWith('/companies')) return respond([companyA, companyB]);
      if (path.endsWith('/activity-log')) return respond({ events: [] });
      if (path.includes('/client-duplicate-reviews?'))
        return respond({ items: [], next_cursor: null });
      if (path.endsWith('/company-context-assignments/administration'))
        return respond({
          members: [
            {
              workspaceMembershipId: membershipId,
              displayName: 'Resolver',
              email: 'resolver@example.test',
            },
          ],
          companies: [companyA],
          assignments: [],
        });
      if (path.endsWith('/company-director-client-assignments')) {
        state.grants += 1;
        return respond({ id: `assignment-${state.grants}` }, 201);
      }
      if (path.endsWith('/documents')) {
        state.documentReads += 1;
        return respond(documentsFor(companyContextId));
      }
      const openedDocument = documentsFor(companyContextId).find((document) =>
        path.endsWith(`/documents/${document.id}`),
      );
      if (openedDocument) return respond(openedDocument);
      if (path.endsWith('/union-reviews')) return respond(comparison, 201);
      if (path.endsWith('/confirm')) {
        state.united = true;
        return respond(
          {
            outcome: 'united',
            canonicalClientId: secondClient.id,
            projectionReference,
          },
          201,
        );
      }
      if (path.endsWith('/union-history'))
        return respond({
          events: [
            {
              action: 'client.union_confirmed',
              projectionReference,
              companyId: companyA.id,
            },
          ],
          detailReferences: [projectionReference],
        });
      if (path.endsWith(`/client-union-operations/${projectionReference}`))
        return respond({
          state: 'united',
          projectionReference,
          canonicalClientId: secondClient.id,
          originals: [firstClient, secondClient],
          companies: [companyA],
          reason: 'Same verified legal identity.',
          occurredAt: '2026-09-20T12:00:00.000Z',
          actor: { displayName: 'Resolver' },
          reversal: null,
          canReverse: true,
        });
      if (path.endsWith(`/${projectionReference}/reversal`)) {
        state.united = false;
        return respond(
          { outcome: 'reversed', clientIds: [firstClient.id, secondClient.id] },
          201,
        );
      }
      if (path.endsWith('/clients'))
        return respond(
          (state.united ? [secondClient] : [firstClient, secondClient]).map(
            (client) => ({ ...client, relatedToActiveCompany: true }),
          ),
        );
      const dossier = [firstClient, secondClient].find((client) =>
        path.endsWith(`/clients/${client.id}`),
      );
      if (dossier)
        return respond({
          ...dossier,
          relatedToActiveCompany: true,
          involvedCompanyDisplayNames: [companyA.displayName],
        });
      if (path.endsWith('/legal-entities'))
        return respond({ clientVersion: 1, legalEntities: [] });
      throw new Error('Unexpected API request: ' + path);
    }),
  );
  return state;
}

function navigation() {
  return screen.getByRole('navigation', { name: 'Primary navigation' });
}
function navigateTo(label: string) {
  fireEvent.click(within(navigation()).getByRole('link', { name: label }));
}
function documentsRegion() {
  return screen.getByRole('region', { name: 'Working Documents' });
}
function documentTitles() {
  return within(documentsRegion())
    .getAllByRole('listitem')
    .map((item) => item.textContent);
}
function documentFilter() {
  return within(documentsRegion()).getByRole('searchbox', {
    name: 'Filter working Documents',
  });
}
async function openLoadedDocuments() {
  await screen.findByRole('navigation', { name: 'Primary navigation' });
  navigateTo('Working Documents');
  await waitFor(() =>
    expect(within(documentsRegion()).getAllByRole('listitem')).toHaveLength(2),
  );
}
async function openDossier(displayName: string) {
  navigateTo('Clients');
  const heading = await screen.findByRole('heading', { name: displayName });
  const row = heading.closest('li');
  if (!row) throw new Error(`Expected a directory row for ${displayName}`);
  fireEvent.click(within(row).getByRole('button', { name: 'Open dossier' }));
  return screen.findByRole('region', { name: displayName });
}
async function openClientDocuments(dossier: HTMLElement) {
  fireEvent.click(
    within(dossier).getByRole('button', {
      name: 'Open Client working Documents',
    }),
  );
  await waitFor(() => expect(documentsRegion()).toBeVisible());
}
async function uniteFirstIntoSecond(dossier: HTMLElement) {
  fireEvent.click(
    within(dossier.parentElement ?? dossier).getByRole('button', {
      name: 'Review existing duplicates',
    }),
  );
  const form = await screen.findByRole('form', { name: 'Confirm union' });
  for (const select of within(form).getAllByRole('combobox'))
    changeValue(select, secondClient.id);
  changeValue(
    within(form).getByLabelText('Reason for this union'),
    'Reviewed both saved dossiers.',
  );
  for (const checkbox of within(form).getAllByRole('checkbox'))
    fireEvent.click(checkbox);
  fireEvent.submit(form);
  return screen.findByRole('region', { name: secondClient.displayName });
}

// jsdom implements neither scrolling nor motion media queries. The real
// scroll, focus and frame behaviour is proven by the browser specs.
const scrollable: {
  scrollIntoView?: (options?: ScrollIntoViewOptions) => void;
} = Element.prototype;
const nativeScrollIntoView = scrollable.scrollIntoView;

describe('Client dossier and working Document navigation through App', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    scrollable.scrollIntoView = vi.fn();
    // The Prisme overview renders the motion hero before a section is selected.
    vi.stubGlobal(
      'matchMedia',
      vi.fn(
        (query: string) =>
          ({
            matches: true,
            media: query,
            onchange: null,
            addListener: vi.fn(),
            removeListener: vi.fn(),
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
            dispatchEvent: vi.fn(() => false),
          }) satisfies MediaQueryList,
      ),
    );
    window.history.replaceState(null, '', '/?frame=prisme#clients');
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    scrollable.scrollIntoView = nativeScrollIntoView;
    window.history.replaceState(null, '', '/');
  });

  it('shows the united Client its loaded Documents without remounting the workspace', async () => {
    installTransport();
    render(<App identity={deterministicBrowserIdentity()} />);
    await openLoadedDocuments();

    const dossier = await openDossier(firstClient.displayName);
    const canonical = await uniteFirstIntoSecond(dossier);

    await openClientDocuments(canonical);
    await waitFor(() =>
      expect(documentTitles()).toEqual([
        expect.stringContaining('First questionnaire'),
        expect.stringContaining('Second questionnaire'),
      ]),
    );
  });

  it('restores the original Client its loaded Documents after a union reversal', async () => {
    installTransport({ united: true });
    render(<App identity={deterministicBrowserIdentity()} />);
    await openLoadedDocuments();

    const dossier = await openDossier(secondClient.displayName);
    const panel = dossier.parentElement ?? dossier;
    fireEvent.click(
      within(panel).getByRole('button', { name: 'Union history' }),
    );
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'View authorized union details',
      }),
    );
    const reversal = await screen.findByRole('form', { name: 'Reverse union' });
    changeValue(
      within(reversal).getByLabelText('Reason for reversal'),
      'Restore the separate dossiers deliberately.',
    );
    fireEvent.click(within(reversal).getByRole('checkbox'));
    fireEvent.click(
      within(reversal).getByRole('button', { name: 'Reverse union' }),
    );

    const restored = await openDossier(firstClient.displayName);
    await openClientDocuments(restored);
    await waitFor(() =>
      expect(documentTitles()).toEqual([
        expect.stringContaining('First questionnaire'),
      ]),
    );
  });

  it('retires a superseded dossier restriction when the Client identity changes', async () => {
    installTransport();
    render(<App identity={deterministicBrowserIdentity()} />);
    await openLoadedDocuments();
    const dossier = await openDossier(firstClient.displayName);
    await openClientDocuments(dossier);
    await waitFor(() =>
      expect(documentTitles()).toEqual([
        expect.stringContaining('First questionnaire'),
      ]),
    );

    navigateTo('Clients');
    await uniteFirstIntoSecond(dossier);

    navigateTo('Working Documents');
    await waitFor(() => expect(documentTitles()).toHaveLength(2));
    expect(documentFilter()).toHaveValue('');
  });

  it('keeps a dossier restriction when the member merely opens the canonical dossier from union history', async () => {
    const transport = installTransport({ united: true });
    render(<App identity={deterministicBrowserIdentity()} />);
    await openLoadedDocuments();
    const dossier = await openDossier(secondClient.displayName);
    await openClientDocuments(dossier);
    await waitFor(() =>
      expect(documentFilter()).toHaveValue(secondClient.displayName),
    );
    const documentReadsBefore = transport.documentReads;

    navigateTo('Clients');
    fireEvent.click(
      within(dossier.parentElement ?? dossier).getByRole('button', {
        name: 'Union history',
      }),
    );
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'View authorized union details',
      }),
    );
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Open canonical Client dossier',
      }),
    );
    await screen.findByRole('region', { name: secondClient.displayName });

    navigateTo('Working Documents');
    expect(documentFilter()).toHaveValue(secondClient.displayName);
    expect(documentTitles()).toHaveLength(2);
    expect(transport.documentReads).toBe(documentReadsBefore);
  });

  it('does not restore a previous Company restriction when the member returns to that Company', async () => {
    installTransport();
    render(<App identity={deterministicBrowserIdentity()} />);
    await openLoadedDocuments();
    const dossier = await openDossier(firstClient.displayName);
    await openClientDocuments(dossier);
    await waitFor(() =>
      expect(documentTitles()).toEqual([
        expect.stringContaining('First questionnaire'),
      ]),
    );

    const company = screen.getByLabelText('Active Company', { exact: true });
    changeValue(company, companyB.id);
    await waitFor(() =>
      expect(documentTitles()).toEqual([
        expect.stringContaining('Other Company questionnaire'),
      ]),
    );
    changeValue(company, companyA.id);

    await waitFor(() => expect(documentTitles()).toHaveLength(2));
    expect(documentFilter()).toHaveValue('');
  });

  it('does not reapply a previous restriction when Client authority changes', async () => {
    installTransport({ administrator: true });
    render(<App identity={deterministicBrowserIdentity()} />);
    await openLoadedDocuments();
    const dossier = await openDossier(firstClient.displayName);
    await openClientDocuments(dossier);
    await waitFor(() =>
      expect(documentTitles()).toEqual([
        expect.stringContaining('First questionnaire'),
      ]),
    );

    navigateTo('Team & access');
    const access = await screen.findByRole('region', {
      name: 'Company access',
    });
    changeValue(
      within(access).getByLabelText('Workspace member'),
      membershipId,
    );
    changeValue(
      within(access).getByLabelText('Company', { exact: true }),
      companyA.id,
    );
    changeValue(
      within(access).getByLabelText('Access bundle'),
      'director-client',
    );
    fireEvent.click(
      within(access).getByRole('button', { name: 'Grant access' }),
    );
    await screen.findByText('Access granted. Server state refreshed.');

    navigateTo('Working Documents');
    await waitFor(() => expect(documentTitles()).toHaveLength(2));
    expect(documentFilter()).toHaveValue('');
  });
});
