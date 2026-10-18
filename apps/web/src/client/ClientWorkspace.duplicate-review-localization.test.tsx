import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { deterministicBrowserIdentity } from '../access-composition';
import type { ActorContext } from '../access-types';
import {
  InterfaceLocaleProvider,
  interfaceLocaleStorageKey,
  useInterfaceLocale,
} from '../localization/interface-locale';
import { ApplicationPresentation } from '../production-shell/application-presentation';
import { ClientWorkspace } from './ClientWorkspace';

const reviewReference = '70900000-0000-4000-8000-000000000001';
const actor: ActorContext = {
  internalUserId: 'reviewer-709',
  workspaceMembershipId: 'membership-709',
  workspaceId: 'workspace-709',
  workspaceName: 'Literal Workspace',
  displayName: 'Reviewer',
  email: 'reviewer@example.test',
  active: true,
  workspacePermissions: ['client.manage'],
  activeCompany: {
    id: 'company-709',
    displayName: 'Companie {Я}',
    clientPermissions: [
      'client.read',
      'client.create',
      'client.update',
      'client.duplicate.resolve',
    ],
    clientPermissionAssignmentId: 'resolver-assignment-709',
    clientPermissionSetVersion: 'v2',
  },
};
const comparison = {
  outcome: 'comparison',
  duplicate_review_reference: reviewReference,
  proposal: {
    kind: 'registration',
    fields: {
      displayName: 'Propunere {Știință Я}',
      taxId: 'IDNO-709 {tax}',
      address: 'Rue {адрес propus}',
      telephone: '+373 22 100 709',
      generalEmail: 'proposal@example.test',
      businessActivity: 'Conseil {activitate}',
      contacts: [
        {
          name: 'Ana {контакт propus}',
          telephone: '+33 111 709',
          email: 'ana.proposal@example.test',
          communicationPreferences: 'Română; русский\nemail {dimineața}',
        },
      ],
    },
  },
  candidate: {
    id: 'candidate-709',
    displayName: 'Client existent {Я Ș}',
    taxId: 'IDNO-709 {tax}',
    address: 'Rue {адрес salvat}',
    telephone: '+373 22 200 709',
    generalEmail: 'saved@example.test',
    businessActivity: null,
    contacts: [
      {
        name: 'Ion {контакт salvat}',
        telephone: '+33 222 709',
        email: 'ion.saved@example.test',
        communicationPreferences: 'Français; English {après-midi}',
      },
    ],
    version: 4,
    relatedToActiveCompany: false,
    involvedCompanyDisplayNames: ['Companie partajată {BIC Я}'],
  },
};

function LocaleSwitch() {
  const { changeLocale } = useInterfaceLocale();
  return <button onClick={() => changeLocale('ro')}>Choose Romanian</button>;
}

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

it('translates an open exact-ID review from English to Romanian while retaining its nodes, literal values, focus and HTTP state', async () => {
  localStorage.setItem(interfaceLocaleStorageKey, 'en');
  const identity = deterministicBrowserIdentity();
  const onActivityRecorded = vi.fn(async () => undefined);
  const onCompanyContextRejected = vi.fn();
  const onActorRevalidated = vi.fn();
  const onWorkspaceAccessRejected = vi.fn();
  const fetcher = vi.fn(async (input: RequestInfo | URL) => {
    const path = input.toString();
    if (path === '/api/clients') return Response.json([]);
    if (path === '/api/client-duplicate-reviews?page_size=20')
      return Response.json({
        items: [{ duplicate_review_reference: reviewReference }],
        next_cursor: null,
      });
    if (path === `/api/client-duplicate-reviews/${reviewReference}`)
      return Response.json(comparison);
    throw new Error(`Unexpected API request: ${path}`);
  });
  vi.stubGlobal('fetch', fetcher);

  render(
    <InterfaceLocaleProvider>
      <LocaleSwitch />
      <ApplicationPresentation value="prisme">
        <ClientWorkspace
          actor={actor}
          identity={identity}
          onCompanyContextRejected={onCompanyContextRejected}
          onActorRevalidated={onActorRevalidated}
          onWorkspaceAccessRejected={onWorkspaceAccessRejected}
          onActivityRecorded={onActivityRecorded}
        />
      </ApplicationPresentation>
    </InterfaceLocaleProvider>,
  );

  const panel = await screen.findByRole('region', {
    name: 'Possible duplicate reviews',
  });
  const reviewHeading = within(panel).getByRole('heading', { level: 3 });
  const openButton = await within(panel).findByRole('button', {
    name: 'Review possible duplicate 1',
  });
  const listRow = within(panel).getByRole('listitem');
  expect(within(panel).queryByText(reviewReference)).not.toBeInTheDocument();
  expect(within(panel).queryByText('IDNO-709 {tax}')).not.toBeInTheDocument();
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
  openButton.focus();
  fireEvent.click(openButton);

  const comparisonRegion = await within(panel).findByRole('region', {
    name: 'Compare the proposed and existing Client',
  });
  const comparisonHeading = within(comparisonRegion).getByRole('heading');
  const table = within(comparisonRegion).getByRole('table');
  const columns = within(table).getAllByRole('columnheader');
  const rows = within(table).getAllByRole('row');
  const rowHeaders = within(table).getAllByRole('rowheader');
  const cells = within(table).getAllByRole('cell');
  const attachButton = within(comparisonRegion).getByRole('button', {
    name: 'Use this existing Client in the active Company',
  });
  expect(columns.map((node) => node.textContent)).toEqual([
    'Field',
    'Proposed value',
    'Existing Client',
  ]);
  expect(comparisonHeading).toHaveFocus();
  expect(attachButton).toBeEnabled();
  expect(within(comparisonRegion).getByText('Version 4')).toBeVisible();
  expect(
    within(comparisonRegion).getByText('Registration proposal · not saved'),
  ).toBeVisible();
  expect(
    within(comparisonRegion).queryByRole('textbox'),
  ).not.toBeInTheDocument();

  const literalValues = [
    'Propunere {Știință Я}',
    'Client existent {Я Ș}',
    'IDNO-709 {tax}',
    'Rue {адрес propus}',
    'Rue {адрес salvat}',
    '+373 22 100 709',
    '+373 22 200 709',
    'proposal@example.test',
    'saved@example.test',
    'Conseil {activitate}',
    'Ana {контакт propus}',
    'Ion {контакт salvat}',
    '+33 111 709',
    '+33 222 709',
    'ana.proposal@example.test',
    'ion.saved@example.test',
    'Română; русский email {dimineața}',
    'Français; English {après-midi}',
    'Companie partajată {BIC Я}',
  ].map((value) => ({
    value,
    nodes: within(comparisonRegion).getAllByText(value, { exact: true }),
  }));
  for (const { nodes } of literalValues)
    for (const node of nodes) expect(node).toBeVisible();
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(3));
  const requestsBefore = [...fetcher.mock.calls];

  fireEvent.click(screen.getByRole('button', { name: 'Choose Romanian' }));

  expect(document.documentElement).toHaveAttribute('lang', 'ro');
  expect(panel).toBeInTheDocument();
  expect(openButton).toBeInTheDocument();
  expect(openButton.closest('li')).toBe(listRow);
  expect(within(comparisonRegion).getByRole('heading')).toBe(comparisonHeading);
  expect(comparisonHeading).toHaveFocus();
  expect(within(comparisonRegion).getByRole('table')).toBe(table);
  expect(within(comparisonRegion).getByRole('button')).toBe(attachButton);
  expect(attachButton).toBeEnabled();
  for (const [role, originalNodes] of [
    ['row', rows],
    ['rowheader', rowHeaders],
    ['columnheader', columns],
    ['cell', cells],
  ] as const) {
    const currentNodes = within(table).getAllByRole(role);
    expect(currentNodes).toHaveLength(originalNodes.length);
    originalNodes.forEach((node, index) =>
      expect(currentNodes[index]).toBe(node),
    );
  }
  for (const { value, nodes } of literalValues) {
    const currentNodes = within(comparisonRegion).getAllByText(value, {
      exact: true,
    });
    expect(currentNodes).toHaveLength(nodes.length);
    nodes.forEach((node, index) => expect(currentNodes[index]).toBe(node));
  }
  expect(fetcher.mock.calls).toEqual(requestsBefore);
  expect(within(panel).queryByText(reviewReference)).not.toBeInTheDocument();
  expect(onActivityRecorded).not.toHaveBeenCalled();
  expect(onCompanyContextRejected).not.toHaveBeenCalled();
  expect(onActorRevalidated).not.toHaveBeenCalled();
  expect(onWorkspaceAccessRejected).not.toHaveBeenCalled();

  expect
    .soft(reviewHeading)
    .toHaveTextContent('Examinări ale posibilelor duplicate');
  expect
    .soft(comparisonHeading)
    .toHaveTextContent('Compară Clientul propus cu cel existent');
  expect.soft(columns[1]).toHaveTextContent('Valoare propusă');
  expect.soft(columns[2]).toHaveTextContent('Client existent');
  expect
    .soft(attachButton)
    .toHaveTextContent('Folosește acest Client existent în Compania activă');
});
