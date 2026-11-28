import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { render, screen } from '../test/render-with-interface-locale';
import { ClarteFrame } from './ClarteFrame';
import { InterfacePreferenceProvider } from './InterfacePreferenceProvider';

// As a migrating slice does: only the Clients tab's renderer changes in the
// table; the frame and every other tab stay as they are.
vi.mock('./clarte-entries', async (importOriginal) => {
  const table = await importOriginal<typeof import('./clarte-entries')>();
  return {
    ...table,
    clarteEntries: table.clarteEntries.map((entry) =>
      entry.id === 'clients'
        ? {
            ...entry,
            tabs: [
              { destination: 'clients', render: table.renderClarteScreen },
            ],
          }
        : entry,
    ),
  };
});

beforeEach(() => {
  window.history.replaceState(null, '', '/#clients');
});

afterEach(() => {
  window.history.replaceState(null, '', '/');
});

it('shows the Clarté screen App composed once its tab renderer is replaced', () => {
  render(
    <InterfacePreferenceProvider>
      <ClarteFrame
        context={{
          actorName: 'Ada Ionescu',
          workspaceName: 'PRISMA Workspace',
          companyName: 'PRISMA-PRIM',
        }}
        sections={[
          {
            id: 'clients',
            label: 'Clients',
            description: 'Client dossiers',
            content: <p>Current Clients component</p>,
            clarteContent: <p>Clarté Clients screen</p>,
          },
          {
            id: 'projects',
            label: 'Projects',
            description: 'Project records',
            content: <p>Current Projects component</p>,
            clarteContent: <p>Unused Clarté Projects screen</p>,
          },
        ]}
        companyContext={null}
        user={{
          name: 'Ada Ionescu',
          email: 'ada@example.test',
          onSignOut() {},
        }}
        overview={null}
        recentChanges={undefined}
      />
    </InterfacePreferenceProvider>,
  );

  expect(screen.getByText('Clarté Clients screen')).toBeVisible();
  expect(screen.queryByText('Current Clients component')).toBeNull();
  expect(screen.getByText('Current Projects component')).not.toBeVisible();
  expect(screen.queryByText('Unused Clarté Projects screen')).toBeNull();
});
