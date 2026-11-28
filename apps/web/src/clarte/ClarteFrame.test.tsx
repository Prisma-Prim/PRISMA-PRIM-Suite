import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApplicationSection } from '../production-shell/application-section';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '../test/render-with-interface-locale';
import { ClarteFrame, type ClarteFrameProps } from './ClarteFrame';
import { InterfacePreferenceProvider } from './InterfacePreferenceProvider';
import { clarteEntries } from './clarte-entries';

const sectionLabels = {
  payments: 'Payment Observations',
  'invoice-records': 'Invoice Records',
  'payment-proofs': 'Payment proofs',
  'knowledge-evidence': 'Knowledge items',
  'internal-tasks': 'Internal Tasks',
  ideas: 'Ideas',
  'operational-risks': 'Operational Risks',
  documents: 'Working Documents',
  requests: 'Client Requests',
  catalogue: 'Service catalogue',
  pricing: 'Pricing configuration',
  'offer-models': 'Offer model',
  'contract-models': 'Contract model',
  projects: 'Projects',
  'my-tasks': 'My Tasks',
  'unassigned-tasks': 'Unassigned Tasks',
  'blocked-tasks': 'Blocked Tasks',
  'team-tasks': 'Team Tasks',
  clients: 'Clients',
  access: 'Team and access',
  companies: 'Companies',
  activity: 'Activity Log',
  invitations: 'Invitations',
} satisfies Record<ApplicationSection['id'], string>;

type SectionId = keyof typeof sectionLabels;
const sectionIds = Object.keys(sectionLabels).filter(
  (id): id is SectionId => id in sectionLabels,
);

function section(
  id: SectionId,
  options: Partial<ApplicationSection> = {},
): ApplicationSection {
  const label = sectionLabels[id];
  const placeholder = (
    <section id={id} tabIndex={-1} aria-label={`${label} screen`}>
      {label} content
    </section>
  );
  // A migrated tab renders `clarteContent`; this frame test needs one
  // placeholder screen whichever renderer a slice chose for the tab.
  return {
    id,
    label,
    description: `${label} description`,
    content: placeholder,
    clarteContent: placeholder,
    ...options,
  };
}

const everySection = sectionIds.map((id) => section(id));

function renderFrame(props: Partial<ClarteFrameProps> = {}) {
  const onSignOut = vi.fn();
  const view = render(
    <InterfacePreferenceProvider>
      <ClarteFrame
        context={{
          actorName: 'Ada Ionescu',
          workspaceName: 'PRISMA Workspace',
          companyName: 'PRISMA-PRIM',
        }}
        sections={everySection}
        companyContext={<p>Company selector</p>}
        user={{ name: 'Ada Ionescu', email: 'ada@example.test', onSignOut }}
        overview={<p>Overview content</p>}
        recentChanges={undefined}
        {...props}
      />
    </InterfacePreferenceProvider>,
  );
  return { ...view, onSignOut };
}

function primaryNavigation() {
  return screen.getByRole('navigation', { name: 'Primary navigation' });
}

function linkNames(container: HTMLElement): string[] {
  return within(container)
    .getAllByRole('link')
    .map((link) => link.textContent ?? '');
}

function visit(hash: string) {
  act(() => {
    window.history.pushState(null, '', `/${hash}`);
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
}

beforeEach(() => {
  window.history.replaceState(null, '', '/');
});

afterEach(() => {
  vi.restoreAllMocks();
  window.history.replaceState(null, '', '/');
});

describe('Clarté entries and tabs', () => {
  it('places every section of the composition under its entry and tab in order', () => {
    renderFrame();

    expect(linkNames(primaryNavigation())).toEqual([
      'Today',
      'Affaires',
      'Clients',
      'Missions and audits',
      'Tasks',
      'Documents',
      'Finance',
      'Improvement',
      'Settings',
    ]);
    const expected: ReadonlyArray<readonly [string, readonly string[]]> = [
      ['Affaires', ['Client Requests']],
      ['Clients', ['Clients']],
      ['Missions and audits', ['Projects']],
      [
        'Tasks',
        [
          'My Tasks',
          'Unassigned Tasks',
          'Blocked Tasks',
          'Team Tasks',
          'Internal Tasks',
        ],
      ],
      ['Documents', ['Working Documents', 'Knowledge items']],
      [
        'Finance',
        ['Invoice Records', 'Payment Observations', 'Payment proofs'],
      ],
      ['Improvement', ['Ideas', 'Operational Risks']],
    ];
    for (const [entry, tabs] of expected) {
      fireEvent.click(
        within(primaryNavigation()).getByRole('link', { name: entry }),
      );
      expect(
        screen.getByRole('heading', { level: 1, name: entry }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole('region', { name: `${tabs[0]} screen` }),
      ).toBeVisible();
      const views = screen.queryByRole('navigation', {
        name: `${entry} views`,
      });
      if (tabs.length === 1) expect(views).not.toBeInTheDocument();
      else {
        if (!views) throw new Error(`Expected the ${entry} views.`);
        expect(linkNames(views)).toEqual(tabs);
        for (const tab of tabs) {
          fireEvent.click(within(views).getByRole('link', { name: tab }));
          expect(
            screen.getByRole('region', { name: `${tab} screen` }),
          ).toBeVisible();
          expect(
            within(views).getByRole('link', { name: tab }),
          ).toHaveAttribute('aria-current', 'page');
          expect(
            within(primaryNavigation()).getByRole('link', { name: entry }),
          ).toHaveAttribute('aria-current', 'page');
        }
      }
    }

    // Settings draws its own list of sections: the console, not a tab row.
    fireEvent.click(
      within(primaryNavigation()).getByRole('link', { name: 'Settings' }),
    );
    expect(
      screen.queryByRole('navigation', { name: 'Settings views' }),
    ).not.toBeInTheDocument();
    const sectionList = screen.getByRole('navigation', {
      name: 'Settings sections',
    });
    expect(linkNames(sectionList)).toEqual([
      'Companies',
      'Team and access',
      'Invitations',
      'Service catalogue',
      'Pricing configuration',
      'Offer model',
      'Contract model',
      'Activity Log',
    ]);
    // A section no slice migrated yet keeps the current component.
    fireEvent.click(
      within(sectionList).getByRole('link', { name: 'Service catalogue' }),
    );
    expect(
      screen.getByRole('region', { name: 'Service catalogue screen' }),
    ).toBeVisible();
  });

  it('places each section exactly once in the table', () => {
    const placed = clarteEntries.flatMap((entry) =>
      entry.tabs.map((tab) => tab.destination),
    );

    expect([...placed].sort()).toEqual(
      ['overview', 'settings', 'language', ...sectionIds].sort(),
    );
  });

  it('shows an entry only when the composition offers one of its destinations', () => {
    renderFrame({ sections: [section('clients'), section('activity')] });

    expect(linkNames(primaryNavigation())).toEqual([
      'Today',
      'Clients',
      'Settings',
    ]);
    expect(
      within(primaryNavigation()).getByRole('link', { name: 'Settings' }),
    ).toHaveAttribute('href', '#activity');
    fireEvent.click(
      within(primaryNavigation()).getByRole('link', { name: 'Settings' }),
    );
    expect(
      screen.queryByRole('navigation', { name: 'Settings views' }),
    ).not.toBeInTheDocument();
  });

  it('opens Today for a fragment of a section the composition does not offer', () => {
    window.history.replaceState(null, '', '/#payments');
    renderFrame({ sections: [section('clients')] });

    expect(
      screen.getByRole('heading', { level: 1, name: 'Today' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Overview content')).toBeVisible();
    expect(screen.getByText('Hello, Ada Ionescu.')).toBeInTheDocument();
  });

  it('keeps hidden sections mounted and follows the mounting rules of the current shell', () => {
    renderFrame({
      sections: [
        section('clients'),
        section('unassigned-tasks', { mountWhenSelected: true }),
        section('team-tasks', {
          mountWhenSelected: true,
          retainAfterSelection: true,
        }),
      ],
    });

    expect(screen.getByText('Clients content')).not.toBeVisible();
    expect(screen.queryByText('Unassigned Tasks content')).toBeNull();
    expect(screen.queryByText('Team Tasks content')).toBeNull();
    visit('#unassigned-tasks');
    visit('#team-tasks');
    visit('#clients');

    expect(screen.getByText('Clients content')).toBeVisible();
    expect(screen.queryByText('Unassigned Tasks content')).toBeNull();
    expect(screen.getByText('Team Tasks content')).not.toBeVisible();
    expect(screen.queryByText('Overview content')).toBeNull();
  });
});

describe('Clarté-only screens and screens that draw their own views', () => {
  const language = {
    id: 'language',
    label: 'Language',
    description: 'Language description',
    clarteContent: <p>Language content</p>,
  } as const;

  it('selects, mounts and places a Clarté-only screen like a section', () => {
    window.history.replaceState(null, '', '/#language');
    renderFrame({
      sections: [section('clients'), section('activity')],
      clarteScreens: [language],
    });

    expect(
      screen.getByRole('heading', { level: 1, name: 'Settings' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Language content')).toBeVisible();
    visit('#clients');
    // Hidden like a section, and still mounted.
    expect(screen.getByText('Language content')).not.toBeVisible();

    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    const jump = screen.getByRole('dialog', { name: 'Go to a screen' });
    expect(
      within(jump)
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(['Today', 'Clients', 'LanguageSettings', 'Activity LogSettings']);
  });

  it('hands the offered views to a screen-drawn entry and draws neither its row of views nor its description', () => {
    window.history.replaceState(null, '', '/#activity');
    renderFrame({
      sections: [section('access'), section('activity')],
      clarteScreens: [language],
    });

    expect(
      screen.queryByRole('navigation', { name: 'Settings views' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText('Activity Log description', {
        selector: '.clarte-screen-description',
      }),
    ).toBeNull();
    const sectionList = screen.getByRole('navigation', {
      name: 'Settings sections',
    });
    expect(linkNames(sectionList)).toEqual([
      'Language',
      'Team and access',
      'Activity Log',
    ]);
    fireEvent.click(
      within(sectionList).getByRole('link', { name: 'Language' }),
    );

    expect(window.location.hash).toBe('#language');
    expect(screen.getByText('Language content')).toBeVisible();
    expect(
      within(
        screen.getByRole('navigation', { name: 'Settings sections' }),
      ).getByRole('link', { name: 'Language' }),
    ).toHaveAttribute('aria-current', 'page');
    expect(
      within(primaryNavigation()).getByRole('link', { name: 'Settings' }),
    ).toHaveAttribute('aria-current', 'page');
  });
});

describe('Clarté navigation', () => {
  it('focuses the destination after Back and Forward', async () => {
    window.history.replaceState(null, '', '/#clients');
    renderFrame();

    visit('#projects');
    await waitFor(() =>
      expect(document.getElementById('projects')).toHaveFocus(),
    );
    act(() => window.history.back());
    await waitFor(() => expect(window.location.hash).toBe('#clients'));
    await waitFor(() =>
      expect(document.getElementById('clients')).toHaveFocus(),
    );
  });

  it('moves focus to the screen title from the skip link', () => {
    renderFrame();

    fireEvent.click(screen.getByRole('link', { name: 'Skip to content' }));

    expect(
      screen.getByRole('heading', { level: 1, name: 'Today' }),
    ).toHaveFocus();
  });

  it('closes each open menu with Escape and returns focus to its trigger', () => {
    renderFrame({
      recentChanges: {
        state: { status: 'ready', events: [] },
        activeCompanyId: 'company-a',
        onRefresh: async () => undefined,
        onOpenActivity: () => undefined,
        onOpenRequest: undefined,
      },
    });
    const triggers = [
      screen.getByRole('button', { name: 'User menu' }),
      screen.getByRole('button', { name: 'Recent changes' }),
      screen.getByRole('button', { name: 'More' }),
      screen.getByRole('button', { name: 'Go to a screen' }),
    ];
    for (const trigger of triggers) {
      trigger.focus();
      fireEvent.click(trigger);
      expect(trigger).toHaveAttribute('aria-expanded', 'true');
      fireEvent.keyDown(document.activeElement ?? trigger, { key: 'Escape' });
      expect(trigger).toHaveAttribute('aria-expanded', 'false');
      expect(trigger).toHaveFocus();
    }
  });

  it('keeps the user menu open while the language changes, then closes it on Escape', () => {
    renderFrame();
    const userMenu = screen.getByRole('button', { name: 'User menu' });
    userMenu.focus();
    fireEvent.click(userMenu);
    const languages = screen.getByRole('group', { name: 'Interface language' });

    expect(
      within(languages)
        .getAllByRole('radio')
        .map((radio) => radio.closest('label')?.textContent),
    ).toEqual(['Română', 'Русский', 'Français', 'English']);
    expect(
      within(languages).getByRole('radio', { name: 'English' }),
    ).toBeChecked();
    fireEvent.click(within(languages).getByRole('radio', { name: 'Français' }));

    expect(userMenu).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('radio', { name: 'Français' })).toBeChecked();
    fireEvent.keyDown(screen.getByRole('radio', { name: 'Français' }), {
      key: 'Escape',
    });
    expect(userMenu).toHaveAttribute('aria-expanded', 'false');
    expect(userMenu).toHaveFocus();
  });

  it('offers the phone bar entries and the remaining entries under More', () => {
    renderFrame();
    const phone = screen.getByRole('navigation', { name: 'Quick navigation' });

    expect(
      within(phone)
        .getAllByRole('link')
        .map((link) => link.textContent),
    ).toEqual(['Today', 'Affaires', 'Tasks', 'Documents']);
    fireEvent.click(within(phone).getByRole('button', { name: 'More' }));
    const more = screen.getByRole('group', { name: 'More screens' });
    expect(linkNames(more)).toEqual([
      'Clients',
      'Missions and audits',
      'Finance',
      'Improvement',
      'Settings',
    ]);
    fireEvent.click(within(more).getByRole('link', { name: 'Finance' }));
    expect(window.location.hash).toBe('#invoice-records');
    expect(
      screen.queryByRole('group', { name: 'More screens' }),
    ).not.toBeInTheDocument();
  });

  it('holds every navigation path while a protected write is in progress', async () => {
    window.history.replaceState(null, '', '/#documents');
    renderFrame({ navigationProtected: true });
    const held = () => expect(window.location.hash).toBe('#documents');

    fireEvent.click(
      within(primaryNavigation()).getByRole('link', { name: 'Clients' }),
    );
    held();
    fireEvent.click(
      within(
        screen.getByRole('navigation', { name: 'Documents views' }),
      ).getByRole('link', { name: 'Knowledge items' }),
    );
    held();
    fireEvent.click(
      within(
        screen.getByRole('navigation', { name: 'Quick navigation' }),
      ).getByRole('link', { name: 'Tasks' }),
    );
    held();
    fireEvent.click(
      screen.getByRole('link', { name: 'PRISMA-PRIM Suite home' }),
    );
    held();
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    fireEvent.change(screen.getByRole('combobox', { name: 'Screen name' }), {
      target: { value: 'clients' },
    });
    fireEvent.keyDown(screen.getByRole('combobox', { name: 'Screen name' }), {
      key: 'Enter',
    });
    held();
    visit('#clients');
    await waitFor(held);
    expect(screen.getByText('Working Documents content')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'User menu' }));
    expect(
      screen.getByRole('button', { name: 'Leave the Clarté interface' }),
    ).toBeDisabled();
  });
});

describe('Clarté jump list', () => {
  it('keeps the option chosen with the arrow keys in view', () => {
    const scrolled: Array<{ element: Element; options: unknown }> = [];
    const scrollable: {
      scrollIntoView?: (options?: ScrollIntoViewOptions) => void;
    } = Element.prototype;
    const original = scrollable.scrollIntoView;
    scrollable.scrollIntoView = function (
      this: Element,
      options?: ScrollIntoViewOptions,
    ) {
      scrolled.push({ element: this, options });
    };
    try {
      renderFrame();
      fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
      const field = screen.getByRole('combobox', { name: 'Screen name' });

      fireEvent.keyDown(field, { key: 'ArrowUp' });

      const last = screen.getAllByRole('option').at(-1);
      expect(last).toHaveAttribute('aria-selected', 'true');
      expect(scrolled.at(-1)).toEqual({
        element: last,
        options: { block: 'nearest' },
      });
    } finally {
      scrollable.scrollIntoView = original;
    }
  });

  it('opens with Ctrl K or Cmd K, filters authorized destinations and opens the chosen one', () => {
    renderFrame({
      sections: [
        section('my-tasks'),
        section('blocked-tasks'),
        section('clients'),
      ],
    });

    fireEvent.keyDown(window, { key: 'K', metaKey: true });
    const dialog = screen.getByRole('dialog', { name: 'Go to a screen' });
    const field = within(dialog).getByRole('combobox', { name: 'Screen name' });
    expect(field).toHaveFocus();
    expect(
      within(dialog)
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(['Today', 'Clients', 'My TasksTasks', 'Blocked TasksTasks']);
    expect(
      within(dialog).queryByRole('option', { name: /Payment/u }),
    ).toBeNull();

    fireEvent.change(field, { target: { value: 'task blo' } });
    expect(
      within(dialog)
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(['Blocked TasksTasks']);
    fireEvent.change(field, { target: { value: 'invoice' } });
    expect(within(dialog).queryAllByRole('option')).toHaveLength(0);
    expect(
      within(dialog).getByText('No screen you can open matches.'),
    ).toBeInTheDocument();

    fireEvent.change(field, { target: { value: 'tasks' } });
    fireEvent.keyDown(field, { key: 'ArrowDown' });
    fireEvent.keyDown(field, { key: 'Enter' });
    expect(window.location.hash).toBe('#blocked-tasks');
    expect(
      screen.queryByRole('dialog', { name: 'Go to a screen' }),
    ).not.toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    fireEvent.click(
      within(screen.getByRole('dialog', { name: 'Go to a screen' })).getByRole(
        'option',
        { name: /^Clients/u },
      ),
    );
    expect(window.location.hash).toBe('#clients');
  });
});

describe('Clarté user menu', () => {
  it('shows the identity, signs out and changes the interface language', () => {
    const { onSignOut } = renderFrame();
    fireEvent.click(screen.getByRole('button', { name: 'User menu' }));
    const menu = screen.getByRole('group', { name: 'User menu' });

    expect(within(menu).getByText('Ada Ionescu')).toBeInTheDocument();
    expect(within(menu).getByText('ada@example.test')).toBeInTheDocument();
    fireEvent.click(within(menu).getByRole('radio', { name: 'Русский' }));
    expect(
      within(
        screen.getByRole('navigation', { name: 'Основная навигация' }),
      ).getByRole('link', { name: 'Сегодня' }),
    ).toBeInTheDocument();
    fireEvent.click(
      within(
        screen.getByRole('group', { name: 'Меню пользователя' }),
      ).getByRole('button', { name: 'Выйти из аккаунта' }),
    );
    expect(onSignOut).toHaveBeenCalledOnce();
  });
});
