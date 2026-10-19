import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '../test/render-with-interface-locale';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ApplicationShell, type ApplicationSection } from './ApplicationShell';
import { Select } from '../presentation/Select';
import { ActivityLog } from './ActivityLog';

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

    it('focuses the full Activity region through its unique internal destination', async () => {
      render(
        <ApplicationShell
          context={{
            actorName: 'Director',
            workspaceName: 'Workspace',
            companyName: 'Company',
          }}
          sections={[
            ...sections,
            {
              id: 'activity',
              label: 'Activity Log',
              description: 'Recorded activity',
              content: (
                <ActivityLog
                  state={{ status: 'ready', events: [] }}
                  activeCompanyId="company"
                  onOpenRequest={undefined}
                />
              ),
            },
          ]}
          companyContext={null}
          userArea={null}
        >
          Classic heading
        </ApplicationShell>,
      );
      act(() => {
        window.history.pushState(null, '', `/?frame=${frame}#activity`);
        window.dispatchEvent(new PopStateEvent('popstate'));
      });
      const activity = screen.getByRole('region', { name: 'Activity Log' });
      await waitFor(() => expect(activity).toHaveFocus());
      expect(activity).toHaveAttribute('id', 'activity');
      expect(activity).toHaveAttribute('tabindex', '-1');
      expect(document.querySelectorAll('#activity')).toHaveLength(1);
      expect(activity.closest('.application-section')).not.toHaveAttribute(
        'id',
      );
    });
  },
);

it('dismisses the Company menu before letting Escape close navigation', () => {
  window.history.replaceState(null, '', '/?frame=prisme#clients');
  render(
    <ApplicationShell
      context={{
        actorName: 'Director',
        workspaceName: 'Workspace',
        companyName: 'Company',
      }}
      sections={sections}
      companyContext={
        <>
          <label htmlFor="navigation-company">Active Company</label>
          <Select
            id="navigation-company"
            value="company"
            options={[{ value: 'company', label: 'Company' }]}
            onValueChange={() => undefined}
          />
        </>
      }
      userArea={null}
    >
      Classic heading
    </ApplicationShell>,
  );
  const navigationToggle = screen.getByRole('button', {
    name: 'Open navigation',
  });
  fireEvent.click(navigationToggle);
  const companySelect = screen.getByRole('combobox', {
    name: 'Active Company',
  });
  fireEvent.click(companySelect);
  expect(screen.getByRole('listbox', { name: 'Active Company' })).toBeVisible();

  fireEvent.keyDown(companySelect, { key: 'Escape' });

  expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  expect(navigationToggle).toHaveAccessibleName('Close navigation');
  expect(navigationToggle).toHaveAttribute('aria-expanded', 'true');
  expect(companySelect).toHaveFocus();

  fireEvent.keyDown(companySelect, { key: 'Escape' });

  expect(navigationToggle).toHaveAccessibleName('Open navigation');
  expect(navigationToggle).toHaveAttribute('aria-expanded', 'false');
  expect(navigationToggle).toHaveFocus();
  window.history.replaceState(null, '', '/');
});
