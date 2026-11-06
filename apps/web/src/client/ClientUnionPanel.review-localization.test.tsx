import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { deterministicBrowserIdentity } from '../access-composition';
import {
  InterfaceLocaleProvider,
  interfaceLocaleStorageKey,
  type InterfaceLocale,
} from '../localization/interface-locale';
import { changeValue } from '../test/select-option';
import { ClientUnionPanel } from './ClientUnionPanel';

// Expectations are written independently of the catalogs. The Romanian and
// Russian business wording remains a provisional label until Iurie validates it.
const locales: readonly {
  code: InterfaceLocale;
  review: string;
  remediation: string;
  saved: string;
}[] = [
  {
    code: 'ro',
    review: 'Revizuiește duplicatele existente',
    remediation:
      'Acest identificator necesită o remediere separată a datelor înainte ca o pereche să poată fi unită.',
    saved:
      'Unirea a fost confirmată. Dosarul canonic este acum disponibil în Companiile implicate.',
  },
  {
    code: 'ru',
    review: 'Проверить существующие дубликаты',
    remediation:
      'Для этого идентификатора необходимо отдельное исправление данных, прежде чем пару можно будет объединить.',
    saved:
      'Объединение подтверждено. Каноническое досье теперь доступно в затронутых Компаниях.',
  },
  {
    code: 'fr',
    review: 'Examiner les doublons existants',
    remediation:
      'Cet identifiant nécessite une correction distincte des données avant qu’une paire puisse être unie.',
    saved:
      'Union confirmée. Le dossier canonique est maintenant disponible dans les Entreprises concernées.',
  },
  {
    code: 'en',
    review: 'Review existing duplicates',
    remediation:
      'This identifier needs separate data remediation before a pair can be united.',
    saved:
      'Union confirmed. The canonical dossier is now available in the affected Companies.',
  },
];

const first = {
  id: 'client-1',
  version: 1,
  displayName: 'Exemplu SRL',
  taxId: 'UNION-X',
  address: null,
  telephone: null,
  generalEmail: null,
  businessActivity: null,
  contacts: [{ name: 'Alex' }],
};
const second = {
  ...first,
  id: 'client-2',
  displayName: 'Exemplu S.R.L.',
  address: 'Chisinau',
  contacts: [{ name: 'Dana' }],
};
const comparison = {
  outcome: 'comparison',
  reviewReference: 'review-1',
  clients: [first, second],
  companies: [
    { id: 'company-a', displayName: 'PRISMA-PRIM' },
    { id: 'company-b', displayName: 'BIC' },
  ],
};

function respond(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), { status });
}

/** Renders the Classic panel (no `onConfirmed`) in the given interface locale. */
function renderPanel(locale: InterfaceLocale, responses: Response[]) {
  localStorage.setItem(interfaceLocaleStorageKey, locale);
  const fetcher = vi.fn();
  for (const next of responses) fetcher.mockResolvedValueOnce(next);
  vi.stubGlobal('fetch', fetcher);
  render(
    <InterfaceLocaleProvider>
      <ClientUnionPanel
        clientId={first.id}
        companyContextId="company-a"
        identity={deterministicBrowserIdentity()}
        canResolve
        onChanged={vi.fn(async () => undefined)}
        onOpenCanonical={vi.fn()}
        onCompanyContextRejected={vi.fn()}
        onActorRevalidated={vi.fn()}
        onWorkspaceAccessRejected={vi.fn()}
      />
    </InterfaceLocaleProvider>,
  );
  return fetcher;
}

describe('Client union panel interface locale', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  for (const locale of locales) {
    it(`shows the data remediation guidance in ${locale.code}`, async () => {
      renderPanel(locale.code, [
        respond(
          { outcome: 'multiple_duplicate_candidates_require_data_remediation' },
          201,
        ),
      ]);

      fireEvent.click(screen.getByRole('button', { name: locale.review }));

      expect((await screen.findByRole('alert')).textContent).toBe(
        locale.remediation,
      );
      expect(screen.queryByRole('form')).not.toBeInTheDocument();
    });

    it(`shows the confirmed union status in ${locale.code}`, async () => {
      renderPanel(locale.code, [
        respond(comparison, 201),
        respond(
          {
            outcome: 'united',
            projectionReference: 'projection-a',
            canonicalClientId: first.id,
          },
          201,
        ),
      ]);

      fireEvent.click(screen.getByRole('button', { name: locale.review }));
      const form = await screen.findByRole('form');
      for (const select of within(form).getAllByRole('combobox'))
        changeValue(select, first.id);
      changeValue(within(form).getByRole('textbox'), 'Same legal identity.');
      for (const checkbox of within(form).getAllByRole('checkbox'))
        fireEvent.click(checkbox);
      fireEvent.submit(form);

      await waitFor(() =>
        expect(screen.getByRole('status').textContent).toBe(locale.saved),
      );
    });
  }
});
