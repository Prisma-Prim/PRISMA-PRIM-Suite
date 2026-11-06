import {
  fireEvent,
  render,
  screen,
  within,
} from '../../test/render-with-interface-locale';
import { expect, it, vi } from 'vitest';
import type {
  PaymentRevision,
  PaymentSelectable,
  PaymentSummary,
  PaymentValues,
} from '../payment.types';
import {
  PaymentRevisionView,
  PaymentSourceView,
  PaymentSummaryView,
} from './PaymentPresentation';
import {
  PaymentValuesFields,
  type PaymentValuesDraft,
} from './PaymentValuesFields';
import { paymentCopy, type PaymentLocale } from './payment-copy';

const values: PaymentValues = {
  amountMinor: '125550',
  currency: 'MDL',
  effectiveOn: '2026-01-15',
  method: '  Manual notice · Încăsare  ',
  externalReference: null,
  observationBasis: '  FICT-PAY-001 — observed 🙂  ',
};
const summary: PaymentSummary = {
  id: '00000000-0000-4000-8000-000000001047',
  revision: 2,
  state: 'DRAFT',
  values,
  confirmation: null,
  copiedContext: {
    companyLabel: 'Fictional Receiving Company',
    payer: {
      kind: 'PRIMARY',
      legalName: '  Fictional Payer  ',
      taxId: null,
      legalAddress: null,
    },
  },
  createdAt: '2026-01-15T10:00:00.000Z',
  replacesClosedPaymentId: '00000000-0000-4000-8000-000000001046',
  replacementPaymentId: null,
};

it('preserves an invalid literal draft across all interface locales and emits exact edited text', () => {
  const value: PaymentValuesDraft = {
    amount: '1255.500',
    currency: 'MDL',
    effectiveOn: '2026-02-30',
    method: '  Manual notice  ',
    externalReference: '  Ref 001  ',
    observationBasis: '  Declared 🙂  ',
  };
  const onChange = vi.fn();
  const props = {
    value,
    onChange,
    idPrefix: 'payment-values',
    errorId: 'payment-error',
  };
  const view = render(<PaymentValuesFields {...props} locale="en" />);
  const locales: PaymentLocale[] = ['ro', 'ru', 'fr', 'en'];
  for (const locale of locales) {
    view.rerender(<PaymentValuesFields {...props} locale={locale} />);
    const amount = screen.getByRole('textbox', {
      name: paymentCopy[locale].amount,
    });
    expect(amount).toHaveValue('1255.500');
    expect(amount).toHaveAttribute('type', 'text');
    expect(amount).toHaveAttribute('aria-invalid', 'true');
    expect(amount).toHaveAttribute(
      'aria-describedby',
      'payment-values-money-help payment-error',
    );
    expect(
      screen.getByRole('textbox', { name: paymentCopy[locale].effectiveOn }),
    ).toHaveValue('2026-02-30');
    expect(
      screen.getByRole('combobox', { name: paymentCopy[locale].currency }),
    ).toHaveTextContent('MDL');
  }
  expect(onChange).not.toHaveBeenCalled();
  fireEvent.change(
    screen.getByRole('textbox', { name: 'Declared payment method' }),
    {
      target: { value: '  Human method Ж 🙂  ' },
    },
  );
  expect(onChange).toHaveBeenCalledExactlyOnceWith({
    ...value,
    method: '  Human method Ж 🙂  ',
  });
});

it('shows exact positive minor amounts, frozen nulls and human lineage without technical identifiers', () => {
  const view = render(
    <PaymentSummaryView
      locale="en"
      payment={{ ...summary, values: { ...values, amountMinor: '1' } }}
    />,
  );
  expect(screen.getByText('0.01 MDL')).toBeInTheDocument();
  expect(screen.getAllByText('Not recorded')).toHaveLength(3);
  expect(view.container.textContent).toContain('  Fictional Payer  ');
  expect(view.container.textContent).toContain(values.method);
  expect(view.container.textContent).toContain(values.observationBasis);
  expect(view.container.textContent).toContain(
    paymentCopy.en.replacesClosedPayment,
  );
  expect(view.container.textContent).not.toContain(summary.id);
  expect(view.container.textContent).not.toContain(
    summary.replacesClosedPaymentId,
  );
  expect(view.container.querySelector('a')).toBeNull();
  view.rerender(
    <PaymentSummaryView
      locale="fr"
      payment={{
        ...summary,
        values: { ...values, amountMinor: '99999999999999' },
      }}
    />,
  );
  expect(screen.getByText('999999999999,99 MDL')).toBeInTheDocument();
  expect(screen.getByText('2026-01-15')).toHaveAttribute(
    'datetime',
    '2026-01-15',
  );
});

it('shows both exact revision snapshots and keeps the original confirmation on reversal', () => {
  const confirmation = {
    actor: {
      membershipId: '00000000-0000-4000-8000-000000001048',
      displayName: 'Fictional Independent Reviewer',
    },
    recordedAt: '2026-01-15T11:00:00.000Z',
    note: '  Exact review note Ж 🙂  ',
  };
  const revision: PaymentRevision = {
    format: 'PAYMENT_REVISION/1',
    paymentId: summary.id,
    revision: 4,
    action: 'REVERSE',
    commandId: '00000000-0000-4000-8000-000000001049',
    actor: {
      membershipId: '00000000-0000-4000-8000-000000001050',
      displayName: 'Fictional Reverser',
    },
    recordedAt: '2026-01-15T12:00:00.000Z',
    before: { state: 'CONFIRMED', values, confirmation },
    after: { state: 'REVERSED', values, confirmation },
    reason: '  Literal reversal reason  ',
  };
  const view = render(<PaymentRevisionView locale="en" revision={revision} />);
  const before = screen.getByRole('region', { name: 'Before' });
  const after = screen.getByRole('region', { name: 'After' });
  expect(within(before).getByText('1255.50 MDL')).toBeInTheDocument();
  expect(within(after).getByText('1255.50 MDL')).toBeInTheDocument();
  expect(before.textContent).toContain(confirmation.note);
  expect(after.textContent).toContain(confirmation.note);
  expect(view.container.textContent).toContain(revision.reason);
  expect(view.container.textContent).not.toContain(revision.commandId);
  expect(view.container.textContent).not.toContain(
    confirmation.actor.membershipId,
  );
});

it('presents an exact superseded source without navigating or inferring a newer Version', () => {
  const source: PaymentSelectable = {
    source: {
      documentId: '00000000-0000-4000-8000-000000001051',
      documentVersionId: '00000000-0000-4000-8000-000000001052',
      representationId: '00000000-0000-4000-8000-000000001053',
    },
    documentTitle: '  Fictional original source 🙂  ',
    versionNumber: 1,
    versionState: 'superseded',
    fileName: 'fictional-payment-notice.pdf',
    byteLength: 1047,
    sha256: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    copiedContext: summary.copiedContext,
  };
  const view = render(<PaymentSourceView locale="en" source={source} />);
  expect(
    screen.getByText('Source Version 1 · Superseded frozen content'),
  ).toBeInTheDocument();
  expect(screen.getByText(source.fileName)).toBeInTheDocument();
  expect(screen.getByText(source.sha256)).toBeInTheDocument();
  expect(view.container.textContent).toContain(source.documentTitle);
  expect(view.container.textContent).not.toContain(source.source.documentId);
  expect(view.container.querySelector('a, button')).toBeNull();
});
