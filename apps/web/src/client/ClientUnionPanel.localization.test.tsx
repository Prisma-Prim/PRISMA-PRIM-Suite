import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { deterministicBrowserIdentity } from '../access-composition';
import {
  InterfaceLocaleProvider,
  interfaceLocaleStorageKey,
  useInterfaceLocale,
} from '../localization/interface-locale';
import { ClientUnionPanel } from './ClientUnionPanel';

function RomanianChoice() {
  const { changeLocale } = useInterfaceLocale();
  return (
    <button type="button" onClick={() => changeLocale('ro')}>
      Use Romanian
    </button>
  );
}

describe('Client union history interface locale', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('translates a discovered authorized history while preserving literal originals, reversal work, focus and requests', async () => {
    localStorage.setItem(interfaceLocaleStorageKey, 'en');
    const originalName = 'Dosar egal — Клиент 712';
    const originalReason = '  Motiv original / исходная причина\nA → B.  ';
    const reversalReason = '  Restabilește / восстановить\nA și B separat.  ';
    const occurredAt = '2026-01-27T12:34:00.000Z';
    const first = {
      id: 'original-client-a',
      version: 1234,
      displayName: originalName,
      taxId: '  MD-0712 / ИД  ',
      address: 'Strada Luminii 7\nChișinău — Кишинёв',
      telephone: '+373 (22) 071-200',
      generalEmail: 'literal+712@example.test',
      businessActivity: 'Certificare / консалтинг',
      contacts: [
        {
          name: 'Ana / Анна',
          telephone: '+373 60 071 201',
          email: 'ana+712@example.test',
          position: '  Director / директор  ',
          communicationPreferences:
            '  Email întâi / сначала email\nDupă 14:00.  ',
        },
        {
          name: 'Ana / Анна',
          telephone: '+373 60 071 202',
          email: 'ana.second+712@example.test',
        },
      ],
    };
    const second = {
      ...first,
      id: 'original-client-b',
      version: 2001,
      address: null,
      contacts: [{ name: 'Boris / Борис', telephone: '+373 60 071 203' }],
    };
    const companies = [
      { id: 'company-b', displayName: 'BIC — Companie / Компания B' },
      { id: 'company-a', displayName: 'PRISMA-PRIM — Companie A' },
    ];
    const detail = {
      state: 'united',
      projectionReference: 'authorized-projection-712',
      canonicalClientId: first.id,
      occurredAt,
      reason: originalReason,
      actor: { displayName: 'Resolver / Решающий 712' },
      canReverse: true,
      originals: [first, second],
      companies,
      reversal: null,
    };
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([{ id: second.id, displayName: originalName }]),
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            events: [
              {
                action: 'client.union_confirmed',
                projectionReference: 'authorized-projection-712',
                companyId: 'company-b',
              },
            ],
            detailReferences: ['authorized-projection-712'],
          }),
        ),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify(detail)));
    vi.stubGlobal('fetch', fetcher);
    const callbacks = {
      onChanged: vi.fn(async () => undefined),
      onOpenCanonical: vi.fn(),
      onConfirmed: vi.fn(),
      onCompanyContextRejected: vi.fn(),
      onActorRevalidated: vi.fn(),
      onWorkspaceAccessRejected: vi.fn(),
    };
    const identity = deterministicBrowserIdentity();
    render(
      <InterfaceLocaleProvider>
        <RomanianChoice />
        <ClientUnionPanel
          clientId={undefined}
          companyContextId="company-b"
          identity={identity}
          canResolve
          {...callbacks}
        />
      </InterfaceLocaleProvider>,
    );
    const panel = screen.getByRole('region', { name: 'Governed Client union' });
    expect(
      within(panel).queryByRole('button', {
        name: 'Review existing duplicates',
      }),
    ).not.toBeInTheDocument();
    fireEvent.click(
      within(panel).getByRole('button', { name: 'Superseded Client history' }),
    );
    fireEvent.click(
      await within(panel).findByRole('button', { name: originalName }),
    );
    expect(
      await within(panel).findByText(
        'Authorized resolver confirmed a Client union',
      ),
    ).toBeVisible();
    fireEvent.click(
      within(panel).getByRole('button', {
        name: 'View authorized union details',
      }),
    );
    const reversal = await within(panel).findByRole('form', {
      name: 'Reverse union',
    });
    const reason = within(reversal).getByRole('textbox', {
      name: 'Reason for reversal',
    });
    const acknowledgement = within(reversal).getByRole('checkbox');
    const originalArticles = within(panel).getAllByRole('article');
    const originalTime = panel.querySelector('time');
    const capturedCompanies = within(panel).getByRole('region', {
      name: 'Complete captured Company set',
    });
    expect(originalArticles).toHaveLength(2);
    expect(originalTime).toHaveAttribute('datetime', occurredAt);
    expect(originalTime).toHaveTextContent('Jan 27, 2026, 12:34 PM');
    fireEvent.change(reason, { target: { value: reversalReason } });
    fireEvent.click(acknowledgement);
    reason.focus();
    expect(reason).toHaveFocus();
    expect(fetcher).toHaveBeenCalledTimes(3);
    const requestsBeforeSwitch = fetcher.mock.calls.slice();

    // Dispatch the public locale choice without moving focus, so this also
    // observes whether the loaded historical owner replaces its controls.
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Use Romanian' }));
    });

    expect(document.documentElement.lang).toBe('ro');
    expect(within(panel).getAllByRole('article')).toEqual(originalArticles);
    expect(panel.querySelector('time')).toBe(originalTime);
    expect(reason).toHaveFocus();
    expect(reason).toHaveValue(reversalReason);
    expect(reason).toHaveAttribute('maxlength', '2000');
    expect(acknowledgement).toBeChecked();
    expect(reversal).toContainElement(reason);
    expect(reversal).toContainElement(acknowledgement);
    expect(fetcher.mock.calls).toEqual(requestsBeforeSwitch);
    for (const callback of Object.values(callbacks))
      expect(callback).not.toHaveBeenCalled();
    expect(
      originalArticles.map((article) =>
        article.querySelector('h4')?.textContent?.endsWith(originalName),
      ),
    ).toEqual([true, true]);
    expect(
      Array.from(
        originalArticles[0]?.querySelectorAll('dd') ?? [],
        (value) => value.textContent,
      ),
    ).toEqual([
      originalName,
      '  MD-0712 / ИД  ',
      'Strada Luminii 7\nChișinău — Кишинёв',
      '+373 (22) 071-200',
      'literal+712@example.test',
      'Certificare / консалтинг',
    ]);
    expect(originalArticles[0]?.querySelectorAll('li strong')).toHaveLength(2);
    expect(originalArticles[1]?.querySelectorAll('li strong')).toHaveLength(1);
    expect(
      Array.from(
        originalArticles[0]?.querySelectorAll('li strong') ?? [],
        (value) => value.textContent,
      ),
    ).toEqual(['Ana / Анна', 'Ana / Анна']);
    expect(originalArticles[0]).toHaveTextContent('+373 60 071 201');
    expect(originalArticles[0]).toHaveTextContent('ana+712@example.test');
    expect(originalArticles[0]).toHaveTextContent('+373 60 071 202');
    expect(originalArticles[0]).toHaveTextContent(
      'ana.second+712@example.test',
    );
    expect(originalArticles[0]?.querySelector('li')?.textContent).toContain(
      '  Director / директор  ',
    );
    expect(originalArticles[0]?.querySelector('li')?.textContent).toContain(
      '  Email întâi / сначала email\nDupă 14:00.  ',
    );
    expect(originalArticles[1]).toHaveTextContent('Boris / Борис');
    expect(originalArticles[1]).toHaveTextContent('+373 60 071 203');
    expect(
      within(panel).getByText(originalReason, {
        exact: true,
        normalizer: (value) => value,
      }).textContent,
    ).toBe(originalReason);
    expect(capturedCompanies.querySelector('ul')?.textContent).toBe(
      'BIC — Companie / Компания BPRISMA-PRIM — Companie A',
    );
    expect(originalTime).toHaveAttribute('datetime', occurredAt);

    expect
      .soft(
        within(panel).queryByRole('heading', {
          name: 'Istoric atribuibil al unirii',
        }),
      )
      .toBeVisible();
    expect
      .soft(
        within(panel).queryByRole('button', {
          name: 'Deschide dosarul canonic al Clientului',
        }),
      )
      .toBeVisible();
    expect
      .soft(within(panel).queryByRole('form', { name: 'Inversează unirea' }))
      .toBe(reversal);
    expect
      .soft(
        within(reversal).queryByRole('textbox', {
          name: 'Motivul inversării',
        }),
      )
      .toBe(reason);
    expect
      .soft(originalArticles[0])
      .toHaveTextContent('Numele afișat al Clientului');
    expect.soft(originalArticles[0]).toHaveTextContent('Versiunea 1.234');
    expect.soft(originalTime).toHaveTextContent('27 ian. 2026, 12:34');
  });
});
