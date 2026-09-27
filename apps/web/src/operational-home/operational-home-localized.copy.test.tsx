import { render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import {
  InterfaceLocaleProvider,
  interfaceLocaleStorageKey,
  type InterfaceLocale,
} from '../localization/interface-locale';
import { useOperationalHomeCopy } from './operational-home-localized.copy';

const localizedCounts: ReadonlyArray<{
  locale: InterfaceLocale;
  count: string;
  overdue: string;
  dueIn: string;
}> = [
  {
    locale: 'ro',
    count: '1.234',
    overdue: 'Restantă de 1.234 zile',
    dueIn: 'Termen în 1.234 zile',
  },
  {
    locale: 'ru',
    count: '1 234',
    overdue: 'Просрочено на 1 234 дн.',
    dueIn: 'Срок через 1 234 дн.',
  },
  {
    locale: 'fr',
    count: '1 234',
    overdue: 'En retard de 1 234 jours',
    dueIn: 'Échéance dans 1 234 jours',
  },
  {
    locale: 'en',
    count: '1,234',
    overdue: 'Overdue by 1,234 days',
    dueIn: 'Due in 1,234 days',
  },
];

afterEach(() => {
  localStorage.removeItem(interfaceLocaleStorageKey);
});

it.each(localizedCounts)(
  'keeps canonical days separate from the $locale display count',
  ({ locale, count, overdue, dueIn }) => {
    localStorage.setItem(interfaceLocaleStorageKey, locale);

    render(
      <InterfaceLocaleProvider>
        <AttentionCountProbe days={1_234} count={count} />
      </InterfaceLocaleProvider>,
    );

    expect(screen.getByTestId('overdue').textContent).toBe(overdue);
    expect(screen.getByTestId('due-in').textContent).toBe(dueIn);
  },
);

function AttentionCountProbe({ days, count }: { days: number; count: string }) {
  const copy = useOperationalHomeCopy();
  return (
    <>
      <span data-testid="overdue">
        {copy.attention.overdueBy({ days, count })}
      </span>
      <span data-testid="due-in">{copy.attention.dueIn({ days, count })}</span>
    </>
  );
}
