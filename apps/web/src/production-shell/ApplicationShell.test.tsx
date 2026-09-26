import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ApplicationShell, type ApplicationSection } from './ApplicationShell';

const sections: ApplicationSection[] = [
  {
    id: 'clients',
    label: 'Clients',
    description: 'Client dossiers',
    content: (
      <section id="clients" tabIndex={-1}>
        Client content
      </section>
    ),
  },
  {
    id: 'projects',
    label: 'Projects',
    description: 'Project records',
    content: (
      <section id="projects" tabIndex={-1}>
        Project content
      </section>
    ),
  },
];

it('offers no Classic switch in the default frame or its opened navigation', () => {
  window.history.replaceState(null, '', '/#clients');
  render(
    <ApplicationShell
      context={{
        actorName: 'Director',
        workspaceName: 'Workspace',
        companyName: 'Company',
      }}
      sections={sections}
      companyContext={<span>Company context</span>}
      userArea={<span>Director profile</span>}
    >
      Classic heading
    </ApplicationShell>,
  );
  expect(
    screen.queryByRole('button', { name: 'Use classic frame' }),
  ).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Open navigation' }));
  expect(
    screen.queryByRole('button', { name: 'Use classic frame' }),
  ).not.toBeInTheDocument();
  expect(screen.getByText('Director profile')).toBeInTheDocument();
  expect(screen.getByText('Company context')).toBeInTheDocument();
  window.history.replaceState(null, '', '/');
});

describe.each(['classic', 'prisme'] as const)(
  '%s section navigation',
  (frame) => {
    beforeEach(() => {
      window.history.replaceState(null, '', `/?frame=${frame}#clients`);
    });

    afterEach(() => {
      window.history.replaceState(null, '', '/');
    });

    it('focuses the destination after processing a history event', async () => {
      render(
        <ApplicationShell
          context={{
            actorName: 'Director',
            workspaceName: 'Workspace',
            companyName: 'Company',
          }}
          sections={sections}
          companyContext={null}
          userArea={null}
        >
          Classic heading
        </ApplicationShell>,
      );

      act(() => {
        window.history.pushState(null, '', `/?frame=${frame}#projects`);
        window.dispatchEvent(new PopStateEvent('popstate'));
      });

      await waitFor(() =>
        expect(document.getElementById('projects')).toHaveFocus(),
      );
    });
  },
);
