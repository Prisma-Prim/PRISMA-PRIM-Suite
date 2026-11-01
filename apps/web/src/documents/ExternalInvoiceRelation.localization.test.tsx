import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { deterministicBrowserIdentity } from '../access-composition';
import {
  InterfaceLocaleProvider,
  interfaceLocaleStorageKey,
} from '../localization/interface-locale';
import { ExternalInvoiceRelation } from './ExternalInvoiceRelation';
import {
  invoiceUiActor,
  invoiceUiDocument,
  invoiceUiIds,
} from './external-invoice.ui.test-fixture';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
  document.documentElement.lang = 'en';
});

it.each([
  { locale: 'ro', date: '2026-01-15', expected: '15 ian. 2026' },
  { locale: 'ru', date: '2026-01-15', expected: '15 янв. 2026 г.' },
  { locale: 'fr', date: '2026-01-15', expected: '15 janv. 2026' },
  { locale: 'en', date: '2026-01-15', expected: 'Jan 15, 2026' },
  { locale: 'en', date: '0001-01-01', expected: 'Jan 1, 1' },
  { locale: 'en', date: '9999-12-31', expected: 'Dec 31, 9999' },
])(
  'presents the recorded $date calendar day in $locale without changing its canonical value',
  async ({ locale, date, expected }) => {
    localStorage.setItem(interfaceLocaleStorageKey, locale);
    const read = vi.fn(() =>
      Promise.resolve(
        Response.json({
          ...invoiceUiDocument,
          externalInvoiceRelation: {
            ...invoiceUiDocument.externalInvoiceRelation,
            receivedOn: date,
          },
        }),
      ),
    );
    vi.stubGlobal('fetch', read);
    render(
      <InterfaceLocaleProvider>
        <ExternalInvoiceRelation
          actor={invoiceUiActor}
          identity={deterministicBrowserIdentity()}
          documentId={invoiceUiIds.document}
        />
      </InterfaceLocaleProvider>,
    );
    await screen.findByText(
      invoiceUiDocument.externalInvoiceRelation.sourceDescription,
    );
    const receivedDate = await screen.findByText(expected, { exact: true });
    expect(receivedDate).toHaveAttribute('datetime', date);
    expect(read).toHaveBeenCalledTimes(1);
  },
);
