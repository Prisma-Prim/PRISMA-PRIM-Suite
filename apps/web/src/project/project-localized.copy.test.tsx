import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import {
  assertMessageCoverage,
  defineMessages,
  resolveMessage,
} from '../localization/messages';
import {
  InterfaceLocaleProvider,
  interfaceLocaleStorageKey,
  type InterfaceLocale,
} from '../localization/interface-locale';
import { projectMessages, useProjectCopy } from './project-localized.copy';
import {
  projectResponsibleMessages,
  useProjectResponsibleCopy,
} from './project-responsible-localized.copy';
import {
  projectLifecycleMessages,
  useProjectLifecycleCopy,
} from './project-lifecycle-localized.copy';

const localizedExamples: ReadonlyArray<{
  locale: InterfaceLocale;
  title: string;
  responsible: string;
  active: string;
  completion: string;
}> = [
  {
    locale: 'ro',
    title: 'Proiecte',
    responsible: 'Membru responsabil',
    active: 'Activ',
    completion: 'De completat de Membru {literal} până la',
  },
  {
    locale: 'ru',
    title: 'Проекты',
    responsible: 'Ответственный участник',
    active: 'Активный',
    completion: 'Должен завершить Membru {literal} до',
  },
  {
    locale: 'fr',
    title: 'Projets',
    responsible: 'Membre responsable',
    active: 'Actif',
    completion: 'À terminer par Membru {literal} avant le',
  },
  {
    locale: 'en',
    title: 'Projects',
    responsible: 'Responsible member',
    active: 'Active',
    completion: 'To be completed by Membru {literal} by',
  },
];

afterEach(() => {
  localStorage.removeItem(interfaceLocaleStorageKey);
  document.documentElement.lang = '';
});

describe('Project-owned localization catalogs', () => {
  it('covers every required Project key in all four locales', () => {
    expect(() =>
      assertMessageCoverage('project', projectMessages),
    ).not.toThrow();
    expect(() =>
      assertMessageCoverage('projectResponsible', projectResponsibleMessages),
    ).not.toThrow();
    expect(() =>
      assertMessageCoverage('projectLifecycle', projectLifecycleMessages),
    ).not.toThrow();
  });

  it('falls back to Romanian at runtime and reports a missing required key', () => {
    const incomplete = defineMessages(['title'] as const, {
      ro: { title: 'Proiecte' },
      ru: {},
      fr: { title: 'Projets' },
      en: { title: 'Projects' },
    });

    expect(resolveMessage(incomplete, 'ru', 'title')).toBe('Proiecte');
    expect(() => assertMessageCoverage('projectProbe', incomplete)).toThrow(
      'Missing translation: projectProbe.ru.title',
    );
  });

  it.each(localizedExamples)(
    'renders the Project boundary in $locale without translating business values',
    ({ locale, title, responsible, active, completion }) => {
      localStorage.setItem(interfaceLocaleStorageKey, locale);

      render(
        <InterfaceLocaleProvider>
          <ProjectCopyProbe />
        </InterfaceLocaleProvider>,
      );

      expect(screen.getByTestId('title')).toHaveTextContent(title);
      expect(screen.getByTestId('responsible')).toHaveTextContent(responsible);
      expect(screen.getByTestId('status')).toHaveTextContent(active);
      expect(screen.getByTestId('completion')).toHaveTextContent(completion);
      expect(screen.getByTestId('business-value')).toHaveTextContent(
        'Project {literal} — Client Ștefan',
      );
    },
  );
});

function ProjectCopyProbe() {
  const project = useProjectCopy();
  const responsible = useProjectResponsibleCopy();
  const lifecycle = useProjectLifecycleCopy();
  return (
    <>
      <span data-testid="title">{project.title}</span>
      <span data-testid="responsible">{responsible.title}</span>
      <span data-testid="status">{lifecycle.statusLabels.active}</span>
      <span data-testid="completion">
        {lifecycle.completion('Membru {literal}')}
      </span>
      <span data-testid="business-value">
        Project {'{literal}'} — Client Ștefan
      </span>
    </>
  );
}
