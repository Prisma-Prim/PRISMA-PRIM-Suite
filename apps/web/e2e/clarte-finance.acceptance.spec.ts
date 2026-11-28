import { createHash } from 'node:crypto';
import { expect, test, type Page, type Route } from '@playwright/test';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { companyGrants } from '../src/access/company-grants.test-fixture';
import { actorContextFixture } from './actor-context.fixture';
import { isPhoneLayout, openClarte } from './clarte.fixture';
import { selectOption } from './select-option';

// Every API response is intercepted: fictional data, no live backend.
const id = (suffix: number) =>
  `00000000-0000-4000-8000-${String(1544000 + suffix).padStart(12, '0')}`;
const ids = {
  company: id(1),
  client: id(2),
  invoiceDocument: id(3),
  invoiceVersion: id(4),
  invoiceRepresentation: id(5),
  existingInvoice: id(6),
  newInvoice: id(7),
  opportunity: id(8),
  contract: id(9),
  contractVersion: id(10),
  paymentDocument: id(11),
  paymentVersion: id(12),
  paymentRepresentation: id(13),
  confirmedPayment: id(14),
  newPayment: id(15),
  replacement: id(16),
  newProof: id(17),
  command: id(18),
  author: id(19),
};
const company = {
  id: ids.company,
  displayName: 'PRISMA-PRIM',
};
const bundles = [
  ['company_director_client_access', 'v2'],
  ['company_document_registrar', 'v3'],
  ['company_document_approver', 'v1'],
  ['company_document_content_reader', 'v1'],
  ['company_document_content_uploader', 'v1'],
  ['company_contract_preparer', 'v2'],
  ['company_commercial_intake', 'v4'],
  ['company_invoice_recorder', 'v1'],
  ['company_external_invoice_access', 'v1'],
  ['company_payment_reader', 'v1'],
  ['company_payment_recorder', 'v1'],
  ['company_payment_confirmer', 'v1'],
  ['company_payment_reverser', 'v1'],
  ['company_payment_evidence_access', 'v1'],
] as const;
const actor = {
  ...actorContextFixture,
  workspacePermissions: ['client.manage'],
  activeCompany: {
    ...company,
    grants: companyGrants(
      ...bundles.map(([bundle, version], index) => ({
        bundle,
        version,
        assignmentId: id(100 + index),
      })),
    ),
    invoiceRecordReadCapture: `invoice-record-read.v1.${'b'.repeat(64)}`,
    paymentObservationReadCapture: `payment-observation-read.v1.${'c'.repeat(64)}`,
    paymentObservationContextCapture: `payment-observation-context.v1.${'d'.repeat(64)}`,
    paymentEvidenceContextCapture: `payment-evidence-context.v1.${'a'.repeat(64)}`,
    paymentEvidenceReferenceReadCapture: `payment-evidence-reference-read.v1.${'e'.repeat(64)}`,
  },
};
const recorder = {
  membershipId: actorContextFixture.workspaceMembershipId,
  displayName: actorContextFixture.displayName,
};
const colleague = { membershipId: ids.author, displayName: 'Ion Popa' };

/** A one-page fictional PDF, so the source beside the form is a real file. */
async function fictionalPdf(lines: readonly string[]) {
  const document = await PDFDocument.create();
  const font = await document.embedFont(StandardFonts.Helvetica);
  const page = document.addPage([420, 300]);
  lines.forEach((line, index) =>
    page.drawText(line, { x: 32, y: 250 - index * 26, size: 13, font }),
  );
  const bytes = await document.save({ useObjectStreams: false });
  return {
    bytes: Buffer.from(bytes),
    size: bytes.byteLength,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  };
}

type Pdf = Awaited<ReturnType<typeof fictionalPdf>>;

function invoiceContext(party: string, contract: string) {
  return {
    companyLabel: 'PRISMA-PRIM · copied',
    contractReference: contract,
    contractVersionNumber: 1,
    receivingParty: {
      kind: 'PRIMARY',
      legalName: party,
      taxIdentifier: '1003600099999',
      address: null,
    },
  };
}
const invoiceValues = {
  externalSystem: 'Fictional accounting export',
  externalNumber: 'FIC-2026-131',
  issuedOn: '2026-11-20',
  dueOn: '2026-12-15',
  currency: 'MDL',
  grossMinor: '2472000',
  netMinor: '2060000',
  taxMinor: '412000',
};
const existingInvoices = [
  {
    id: ids.existingInvoice,
    revision: 1,
    entryState: 'RECORDED',
    values: {
      ...invoiceValues,
      externalNumber: 'FIC-2026-118',
      issuedOn: '2026-11-02',
      grossMinor: '4800000',
      netMinor: '4000000',
      taxMinor: '800000',
    },
    copiedContext: invoiceContext('Fictional Pharmacy SRL', 'CTR-FIC-011'),
    createdAt: '2026-11-02T09:00:00.000Z',
    replacesWithdrawnRecordId: null,
    replacementRecordId: null,
  },
  {
    id: id(20),
    revision: 2,
    entryState: 'WITHDRAWN',
    values: {
      ...invoiceValues,
      externalNumber: 'FIC-2026-104',
      issuedOn: '2026-10-16',
      grossMinor: '1360800',
      netMinor: '1134000',
      taxMinor: '226800',
    },
    copiedContext: invoiceContext('Fictional Design SRL', 'CTR-FIC-019'),
    createdAt: '2026-10-16T09:00:00.000Z',
    replacesWithdrawnRecordId: null,
    replacementRecordId: null,
  },
];

function invoiceRevision(
  recordId: string,
  revision: number,
  action: 'CREATE' | 'CORRECT',
  values: typeof invoiceValues,
  before: typeof invoiceValues | null,
  reason: string | null,
) {
  return {
    format: 'EXTERNAL_INVOICE_REVISION/1',
    recordId,
    revision,
    action,
    commandId: id(200 + revision),
    actor: recorder,
    recordedAt: `2026-11-2${revision}T10:00:00.000Z`,
    before: before ? { entryState: 'RECORDED', values: before } : null,
    after: { entryState: 'RECORDED', values },
    reason,
  };
}

function paymentValues(amountMinor: string, effectiveOn: string) {
  return {
    amountMinor,
    currency: 'MDL',
    effectiveOn,
    method: 'Bank transfer',
    externalReference: 'FIC-ORDER-448',
    observationBasis: 'Fictional transfer notice for invoice FIC-2026-126',
  };
}
const payer = {
  companyLabel: 'PRISMA-PRIM — conserved',
  payer: {
    kind: 'PRIMARY',
    legalName: 'Fictional Pharmacy SRL',
    taxId: null,
    legalAddress: null,
  },
};

type FinanceState = {
  invoice: 'absent' | 'recorded' | 'corrected';
  payment: 'absent' | 'draft' | 'confirmed' | 'reversed';
  replacement: boolean;
};

function serveFinance(page: Page, invoicePdf: Pdf, paymentPdf: Pdf) {
  const state: FinanceState = {
    invoice: 'absent',
    payment: 'absent',
    replacement: false,
  };
  const invoiceSource = {
    source: {
      documentId: ids.invoiceDocument,
      documentVersionId: ids.invoiceVersion,
      representationId: ids.invoiceRepresentation,
    },
    documentTitle: 'Fictional invoice FIC-2026-131',
    versionNumber: 1,
    versionState: 'official',
    fileName: 'fic-2026-131.pdf',
    byteLength: invoicePdf.size,
    sha256: invoicePdf.sha256,
    copiedContext: invoiceContext('Fictional Grain SRL', 'CTR-FIC-029'),
  };
  const correctedValues = { ...invoiceValues, dueOn: '2026-12-20' };
  function invoiceRecord() {
    const corrected = state.invoice === 'corrected';
    const created = invoiceRevision(
      ids.newInvoice,
      1,
      'CREATE',
      invoiceValues,
      null,
      null,
    );
    const history = corrected
      ? [
          invoiceRevision(
            ids.newInvoice,
            2,
            'CORRECT',
            correctedValues,
            invoiceValues,
            'Due date misread from the PDF',
          ),
          created,
        ]
      : [created];
    return {
      summary: {
        id: ids.newInvoice,
        revision: corrected ? 2 : 1,
        entryState: 'RECORDED',
        values: corrected ? correctedValues : invoiceValues,
        copiedContext: invoiceSource.copiedContext,
        createdAt: '2026-11-21T10:00:00.000Z',
        replacesWithdrawnRecordId: null,
        replacementRecordId: null,
      },
      history,
    };
  }
  function invoiceDetail() {
    const { summary: record, history } = invoiceRecord();
    return {
      format: 'EXTERNAL_INVOICE_RECORD/1',
      companyId: ids.company,
      readCapture: actor.activeCompany.invoiceRecordReadCapture,
      record,
      actor: recorder,
      recordedAt: history[0]?.recordedAt,
      capabilities: { canCorrect: true, canWithdraw: true },
      liveSource: {
        kind: 'AVAILABLE',
        documentId: ids.invoiceDocument,
        documentVersionId: ids.invoiceVersion,
        title: invoiceSource.documentTitle,
        versionNumber: 1,
        versionState: 'official',
        content: {
          kind: 'AVAILABLE',
          representationId: ids.invoiceRepresentation,
          fileName: invoiceSource.fileName,
          byteLength: invoicePdf.size,
          sha256: invoicePdf.sha256,
        },
      },
      related: {
        contract: {
          kind: 'AVAILABLE',
          opportunityId: ids.opportunity,
          contractId: ids.contract,
          contractVersionId: ids.contractVersion,
        },
        client: {
          kind: 'AVAILABLE',
          clientId: ids.client,
          displayName: 'Fictional Grain SRL',
        },
      },
      history: { items: history, nextCursor: null },
    };
  }
  const paymentSource = {
    source: {
      documentId: ids.paymentDocument,
      documentVersionId: ids.paymentVersion,
      representationId: ids.paymentRepresentation,
    },
    documentTitle: 'Fictional transfer notice 448',
    versionNumber: 1,
    versionState: 'official',
    fileName: 'transfer-notice-448.pdf',
    byteLength: paymentPdf.size,
    sha256: paymentPdf.sha256,
    copiedContext: payer,
  };
  const reviewed = {
    actor: colleague,
    recordedAt: '2026-11-28T11:00:00.000Z',
    note: 'Amount and date checked against the notice',
  };
  const confirmedPayment = {
    id: ids.confirmedPayment,
    revision: 2,
    state: 'CONFIRMED',
    values: paymentValues('1674000', '2026-10-09'),
    confirmation: reviewed,
    copiedContext: {
      ...payer,
      payer: { ...payer.payer, legalName: 'Fictional Electric SRL' },
    },
    createdAt: '2026-10-09T09:00:00.000Z',
    replacesClosedPaymentId: null,
    replacementPaymentId: null,
  };
  function paymentHistory(paymentId: string) {
    const created = {
      format: 'PAYMENT_REVISION/1',
      paymentId,
      revision: 1,
      action: 'CREATE',
      commandId: id(300),
      actor: recorder,
      recordedAt: '2026-11-28T10:00:00.000Z',
      before: null,
      after: {
        state: 'DRAFT',
        values: paymentValues('1260000', '2026-11-28'),
        confirmation: null,
      },
      reason: null,
    };
    if (paymentId === ids.replacement || state.payment === 'draft')
      return [created];
    const confirmed = {
      ...created,
      revision: 2,
      action: 'CONFIRM',
      commandId: id(301),
      actor: colleague,
      recordedAt: reviewed.recordedAt,
      before: created.after,
      after: { ...created.after, state: 'CONFIRMED', confirmation: reviewed },
    };
    if (state.payment === 'confirmed') return [confirmed, created];
    return [
      {
        ...confirmed,
        revision: 3,
        action: 'REVERSE',
        commandId: id(302),
        actor: recorder,
        recordedAt: '2026-11-28T12:00:00.000Z',
        before: confirmed.after,
        after: { ...confirmed.after, state: 'REVERSED' },
        reason: 'Transfer returned by the bank',
      },
      confirmed,
      created,
    ];
  }
  function paymentSummary(paymentId: string) {
    const history = paymentHistory(paymentId);
    const head = history[0];
    if (!head) throw new Error('Expected a Payment revision.');
    return {
      id: paymentId,
      revision: head.revision,
      ...head.after,
      copiedContext: payer,
      createdAt: '2026-11-28T10:00:00.000Z',
      replacesClosedPaymentId:
        paymentId === ids.replacement ? ids.newPayment : null,
      replacementPaymentId:
        paymentId === ids.newPayment && state.replacement
          ? ids.replacement
          : null,
    };
  }
  function paymentDetail(paymentId: string) {
    const summary = paymentSummary(paymentId);
    const draft = summary.state === 'DRAFT';
    // The detail names the head revision's actor and instant.
    const [head] = paymentHistory(paymentId);
    return {
      format: 'PAYMENT_OBSERVATION/1',
      companyId: ids.company,
      readCapture: actor.activeCompany.paymentObservationReadCapture,
      payment: summary,
      actor: head?.actor,
      recordedAt: head?.recordedAt,
      capabilities: {
        canCorrect: draft,
        canWithdraw: draft,
        canConfirm: draft,
        canReverse: summary.state === 'CONFIRMED',
        canReplace: summary.state === 'REVERSED' && !state.replacement,
      },
      liveSource: {
        kind: 'AVAILABLE',
        documentId: ids.paymentDocument,
        documentVersionId: ids.paymentVersion,
        title: paymentSource.documentTitle,
        versionNumber: 1,
        versionState: 'official',
        content: {
          kind: 'AVAILABLE',
          representationId: ids.paymentRepresentation,
          fileName: paymentSource.fileName,
          byteLength: paymentPdf.size,
          sha256: paymentPdf.sha256,
        },
      },
      client: {
        kind: 'AVAILABLE',
        clientId: ids.client,
        displayName: 'Fictional Pharmacy SRL',
      },
      history: { items: paymentHistory(paymentId), nextCursor: null },
    };
  }
  function proof(
    documentId: string,
    title: string,
    source: string,
    receivedOn: string | null,
  ) {
    return {
      id: documentId,
      companyId: ids.company,
      clientId: ids.client,
      clientDisplayName: 'Fictional Pharmacy SRL',
      title,
      purpose: 'Proves the transfer cited by a Payment observation',
      type: 'payment-evidence',
      confidentiality: 'company-confidential',
      createdAt: '2026-11-28T09:00:00.000Z',
      createdByMembershipId: actorContextFixture.workspaceMembershipId,
      workingRevision: 1,
      correction: 'allowed',
      version: {
        id: ids.paymentVersion,
        status: 'draft',
        representation: null,
      },
      paymentEvidenceSource: {
        format: 'PAYMENT_EVIDENCE_SOURCE/1',
        receivingCompanyLabel: 'PRISMA-PRIM',
        sourceDescription: source,
        receivedOn,
        registeredAt: '2026-11-28T09:00:00.000Z',
        registeredBy: {
          workspaceMembershipId: actorContextFixture.workspaceMembershipId,
          internalUserId: actorContextFixture.internalUserId,
        },
        payer: {
          kind: 'AVAILABLE',
          party: {
            kind: 'PRIMARY',
            legalName: 'Fictional Pharmacy SRL',
            taxId: null,
            legalAddress: null,
          },
        },
      },
    };
  }
  const proofs = [
    proof(
      ids.paymentDocument,
      'Fictional transfer notice 448',
      'Fictional bank, transfer notice',
      '2026-11-28',
    ),
  ];
  const receipt = (
    format: string,
    action: string,
    key: string,
    recordId: string,
    revision: number,
  ) => ({
    format,
    commandId: ids.command,
    [key]: recordId,
    revision,
    action,
    recordedAt: '2026-11-28T13:00:00.000Z',
  });
  return page.route('**/api/**', async (route: Route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const method = request.method();
    const json = (body: unknown, status = 200) =>
      route.fulfill({ status, json: body });
    if (path === '/api/access/current-actor') return json(actor);
    if (path === '/api/companies') return json([company]);
    if (path === '/api/activity-log') return json({ events: [] });
    if (path === '/api/client-duplicate-reviews')
      return json({ items: [], next_cursor: null });
    if (path === '/api/clients')
      return json([
        {
          id: ids.client,
          displayName: 'Fictional Pharmacy SRL',
          relatedToActiveCompany: true,
        },
      ]);
    if (path === `/api/clients/${ids.client}`)
      return json({
        id: ids.client,
        displayName: 'Fictional Pharmacy SRL',
        taxId: null,
        address: null,
        version: 1,
        relatedToActiveCompany: true,
      });
    if (path === `/api/clients/${ids.client}/legal-entities`)
      return json({ clientVersion: 1, legalEntities: [] });
    // Invoices
    if (path === '/api/invoice-records' && method === 'POST') {
      state.invoice = 'recorded';
      return json(
        receipt(
          'EXTERNAL_INVOICE_COMMAND/1',
          'CREATE',
          'recordId',
          ids.newInvoice,
          1,
        ),
        201,
      );
    }
    if (path === `/api/invoice-records/${ids.newInvoice}/commands`) {
      state.invoice = 'corrected';
      return json(
        receipt(
          'EXTERNAL_INVOICE_COMMAND/1',
          'CORRECT',
          'recordId',
          ids.newInvoice,
          2,
        ),
        201,
      );
    }
    if (path === '/api/invoice-records') {
      const created = invoiceRecord().summary;
      return json({
        format: 'EXTERNAL_INVOICE_INVENTORY/1',
        companyId: ids.company,
        readCapture: actor.activeCompany.invoiceRecordReadCapture,
        items:
          state.invoice === 'absent'
            ? existingInvoices
            : [created, ...existingInvoices],
        nextCursor: null,
      });
    }
    if (path === '/api/invoice-records/sources')
      return json({
        format: 'EXTERNAL_INVOICE_SOURCE_PAGE/1',
        companyId: ids.company,
        readCapture: actor.activeCompany.invoiceRecordReadCapture,
        items: [invoiceSource],
        nextCursor: null,
      });
    if (path === `/api/invoice-records/${ids.newInvoice}`)
      return json(invoiceDetail());
    if (
      path === `/api/invoice-records/${ids.newInvoice}/source` ||
      path ===
        `/api/documents/${ids.invoiceDocument}/versions/${ids.invoiceVersion}/content/${ids.invoiceRepresentation}`
    )
      return route.fulfill({
        body: invoicePdf.bytes,
        contentType: 'application/pdf',
      });
    // Collections
    if (path === '/api/payments' && method === 'POST') {
      const body: unknown = request.postDataJSON();
      const replaces =
        typeof body === 'object' &&
        body !== null &&
        'replacesClosedPaymentId' in body &&
        body.replacesClosedPaymentId !== null;
      if (replaces) state.replacement = true;
      else state.payment = 'draft';
      return json(
        receipt(
          'PAYMENT_COMMAND/1',
          'CREATE',
          'paymentId',
          replaces ? ids.replacement : ids.newPayment,
          1,
        ),
        201,
      );
    }
    if (path === `/api/payments/${ids.newPayment}/commands`) {
      const confirming = state.payment === 'draft';
      state.payment = confirming ? 'confirmed' : 'reversed';
      return json(
        receipt(
          'PAYMENT_COMMAND/1',
          confirming ? 'CONFIRM' : 'REVERSE',
          'paymentId',
          ids.newPayment,
          confirming ? 2 : 3,
        ),
        201,
      );
    }
    if (path === '/api/payments')
      return json({
        format: 'PAYMENT_INVENTORY/1',
        companyId: ids.company,
        readCapture: actor.activeCompany.paymentObservationReadCapture,
        items: [
          ...(state.replacement ? [paymentSummary(ids.replacement)] : []),
          ...(state.payment === 'absent'
            ? []
            : [paymentSummary(ids.newPayment)]),
          confirmedPayment,
        ],
        nextCursor: null,
      });
    if (path === '/api/payments/sources')
      return json({
        format: 'PAYMENT_SOURCE_PAGE/1',
        companyId: ids.company,
        readCapture: actor.activeCompany.paymentObservationReadCapture,
        items: [paymentSource],
        nextCursor: null,
      });
    if (path === `/api/payments/${ids.newPayment}`)
      return json(paymentDetail(ids.newPayment));
    if (path === `/api/payments/${ids.replacement}`)
      return json(paymentDetail(ids.replacement));
    if (
      path === `/api/payments/${ids.newPayment}/source` ||
      path ===
        `/api/documents/${ids.paymentDocument}/versions/${ids.paymentVersion}/content/${ids.paymentRepresentation}`
    )
      return route.fulfill({
        body: paymentPdf.bytes,
        contentType: 'application/pdf',
      });
    // Payment proofs
    if (path === '/api/documents' && method === 'POST') {
      const body: unknown = request.postDataJSON();
      const field = (name: string) =>
        typeof body === 'object' &&
        body !== null &&
        name in body &&
        typeof Reflect.get(body, name) === 'string'
          ? String(Reflect.get(body, name))
          : '';
      const created = {
        ...proof(
          ids.newProof,
          field('title'),
          field('sourceDescription').trim(),
          null,
        ),
        purpose: field('purpose'),
        version: { id: id(400), status: 'draft', representation: null },
      };
      proofs.unshift(created);
      return json(created, 201);
    }
    if (path === '/api/documents') return json(proofs);
    const opened = proofs.find(
      (entry) => path === `/api/documents/${entry.id}`,
    );
    if (opened) return json(opened);
    if (path.endsWith('/correction-history'))
      return json({ corrections: [], nextBeforeRevision: null });
    const versions = proofs.find(
      (entry) => path === `/api/documents/${entry.id}/versions`,
    );
    if (versions)
      return json({
        workingRevision: 1,
        mutable: true,
        versions: [
          {
            id: versions.version.id,
            number: 1,
            status: versions.version.status,
            createdAt: '2026-11-28T09:00:00.000Z',
            createdBy: { displayName: actorContextFixture.displayName },
            representations: [],
            pdfContent: { state: 'absent' },
          },
        ],
      });
    return route.fulfill({ status: 404, json: {} });
  });
}

async function screenshot(page: Page, name: string) {
  await page.screenshot({
    path: test.info().outputPath(`${name}.png`),
    fullPage: false,
  });
}

function financeView(page: Page, name: string) {
  return page
    .getByRole('navigation', { name: 'Finance views' })
    .getByRole('link', { name, exact: true });
}

test('records an invoice and a collection beside their exact source, confirms, reverses and replaces it, then registers a payment proof', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const invoicePdf = await fictionalPdf([
    'Fictional invoice FIC-2026-131',
    'Fictional Grain SRL — CTR-FIC-029',
    'Issued 2026-11-20 · due 2026-12-15',
    'Total 24 720.00 MDL',
  ]);
  const paymentPdf = await fictionalPdf([
    'Fictional transfer notice 448',
    'Payer: Fictional Pharmacy SRL',
    'Amount 12 600.00 MDL · 2026-11-28',
    'Reference FIC-ORDER-448',
  ]);
  await serveFinance(page, invoicePdf, paymentPdf);
  const width = isPhoneLayout(page) ? '390' : '1440';
  await openClarte(page, '/#invoice-records');
  await expect(
    page.getByRole('heading', { level: 1, name: 'Finance' }),
  ).toBeVisible();

  // Invoices: the inventory, then a transcription beside its exact PDF.
  const invoices = page.getByRole('region', { name: 'Transcribed invoices' });
  await expect(
    invoices.getByRole('button', { name: 'FIC-2026-118' }),
  ).toBeVisible();
  await screenshot(page, `clarte-finance-invoices-${width}`);
  await invoices
    .getByRole('button', { name: 'Record an external invoice' })
    .click();
  const create = page.getByRole('dialog', {
    name: 'Record an external invoice',
  });
  await selectOption(create.getByLabel('Choose an authorized exact source'), {
    label:
      'Fictional invoice FIC-2026-131 · Version 1 (Official Version) · fic-2026-131.pdf · CTR-FIC-029 · Version 1 · Fictional Grain SRL',
  });
  // Beside a transcription form the exact PDF opens at once.
  const beside = create.getByRole('region', { name: 'PDF beside the form' });
  await expect(
    beside.getByTitle('Exact source PDF fic-2026-131.pdf'),
  ).toBeVisible();
  await create
    .getByLabel('Declared external process or system')
    .fill(invoiceValues.externalSystem);
  await create
    .getByLabel('External invoice reference')
    .fill(invoiceValues.externalNumber);
  await create.getByLabel('Declared issue date').fill(invoiceValues.issuedOn);
  await create.getByLabel('Declared due date (optional)').fill('2026-12-15');
  await create.getByLabel('Declared gross amount').fill('24720.00');
  await create.getByLabel('Declared net amount (optional)').fill('20600.00');
  await create.getByLabel('Declared tax amount (optional)').fill('4120.00');
  await selectOption(create.getByLabel('Currency'), 'MDL');
  await create
    .getByRole('checkbox', { name: /I declare that this exact source/ })
    .check();
  await screenshot(page, `clarte-finance-invoice-record-${width}`);
  await create.getByRole('button', { name: 'Save Invoice Record' }).click();
  const invoice = page.getByRole('dialog', { name: 'Invoice Record' });
  await expect(
    invoice.getByText(/The command is confirmed and durably recorded/),
  ).toBeVisible();

  // Correct the transcription with the exact PDF still beside the form.
  await invoice.getByRole('button', { name: 'Correct transcription' }).click();
  await expect(
    invoice.getByTitle('Exact source PDF fic-2026-131.pdf'),
  ).toBeVisible();
  await invoice.getByLabel('Declared due date (optional)').fill('2026-12-20');
  await invoice
    .getByLabel('Literal reason')
    .fill('Due date misread from the PDF');
  await screenshot(page, `clarte-finance-invoice-correct-${width}`);
  await invoice
    .getByRole('button', { name: 'Save transcription correction' })
    .click();
  await expect(
    invoice.getByRole('heading', {
      name: 'Revision 2 · Transcription corrected',
    }),
  ).toBeVisible();
  await invoice.getByRole('button', { name: 'Close', exact: true }).click();

  // Collections: record, confirm after review, reverse and replace.
  await financeView(page, 'Manual incoming Payment observations').click();
  const collections = page.getByRole('region', {
    name: 'Payment observations',
  });
  await expect(
    collections.getByRole('button', { name: '2026-10-09 · Bank transfer' }),
  ).toBeVisible();
  await screenshot(page, `clarte-finance-collections-${width}`);
  await collections
    .getByRole('button', { name: 'New manual observation' })
    .click();
  const observe = page.getByRole('dialog', { name: 'New manual observation' });
  await observe
    .getByRole('button', { name: 'Select an authorized exact source 1' })
    .click();
  await expect(
    observe.getByTitle('Exact source PDF transfer-notice-448.pdf'),
  ).toBeVisible();
  await observe.getByLabel('Declared amount').fill('12600.00');
  await selectOption(observe.getByLabel('Currency'), 'MDL');
  await observe.getByLabel('Declared effective date').fill('2026-11-28');
  await observe.getByLabel('Declared payment method').fill('Bank transfer');
  await observe
    .getByLabel('External reference (optional)')
    .fill('FIC-ORDER-448');
  await observe
    .getByLabel('What was observed')
    .fill('Fictional transfer notice for invoice FIC-2026-126');
  await observe
    .getByRole('checkbox', {
      name: /I declare one manually observed incoming Payment/,
    })
    .check();
  await screenshot(page, `clarte-finance-collection-record-${width}`);
  await observe.getByRole('button', { name: 'Record observation' }).click();
  const payment = page.getByRole('dialog', { name: '12,600.00 MDL' });
  await expect(payment).toContainText('Draft observation · Revision 1');
  await payment
    .getByRole('button', { name: 'Confirm reviewed observation' })
    .click();
  await expect(
    payment.getByTitle('Exact source PDF transfer-notice-448.pdf'),
  ).toBeVisible();
  const review = payment.getByRole('region', {
    name: 'Confirm reviewed observation',
  });
  await review
    .getByLabel('Literal review note')
    .fill('Amount and date checked against the notice');
  await review
    .getByRole('checkbox', { name: /I reviewed this exact displayed revision/ })
    .check();
  await screenshot(page, `clarte-finance-collection-confirm-${width}`);
  await review
    .getByRole('button', { name: 'Confirm reviewed observation' })
    .click();
  await expect(payment).toContainText(
    'Human-confirmed observation · Revision 2',
  );
  await payment
    .getByRole('button', { name: 'Reverse recorded observation' })
    .click();
  const reversal = payment.getByRole('region', {
    name: 'Reverse recorded observation',
  });
  await reversal
    .getByLabel('Literal reason')
    .fill('Transfer returned by the bank');
  await reversal
    .getByRole('button', { name: 'Reverse recorded observation' })
    .click();
  await expect(payment).toContainText('Reversed recorded observation');
  await payment
    .getByRole('button', { name: 'Create a linked corrected replacement' })
    .click();
  await payment
    .getByRole('button', { name: 'Select an authorized exact source 1' })
    .click();
  await payment.getByLabel('Declared amount').fill('12600.00');
  await selectOption(payment.getByLabel('Currency'), 'MDL');
  await payment.getByLabel('Declared effective date').fill('2026-11-28');
  await payment.getByLabel('Declared payment method').fill('Bank transfer');
  await payment
    .getByLabel('What was observed')
    .fill('Fictional corrected transfer notice');
  await payment
    .getByRole('checkbox', {
      name: /I declare one manually observed incoming Payment/,
    })
    .check();
  await payment.getByRole('button', { name: 'Record observation' }).click();
  await expect(payment).toContainText(
    'This observation explicitly replaces a closed observation.',
  );
  await payment.getByRole('button', { name: 'Close', exact: true }).click();

  // Payment proofs: the inventory, one proof's Versions, then a registration.
  await financeView(page, 'Payment proofs').click();
  const proofs = page.getByRole('region', {
    name: 'Preserved payment proofs',
  });
  await expect(
    proofs.getByRole('button', { name: 'Fictional transfer notice 448' }),
  ).toBeVisible();
  await screenshot(page, `clarte-finance-proofs-${width}`);
  await proofs
    .getByRole('button', { name: 'Fictional transfer notice 448' })
    .click();
  const proof = page.getByRole('dialog', {
    name: 'Fictional transfer notice 448',
  });
  await expect(proof.getByRole('button', { name: 'Version 1' })).toBeVisible();
  await screenshot(page, `clarte-finance-proof-${width}`);
  await proof.getByRole('button', { name: 'Close', exact: true }).click();
  await proofs
    .getByRole('button', { name: 'Register payment evidence' })
    .click();
  const register = page.getByRole('form', {
    name: 'Register payment evidence',
  });
  await selectOption(register.getByLabel('Original Client'), ids.client);
  await selectOption(register.getByLabel('Exact payer'), 'PRIMARY');
  await register.getByLabel('Title').fill('Fictional cash receipt 112');
  await register
    .getByLabel('Purpose')
    .fill('Proves the cash payment of a fictional invoice');
  await register.getByLabel('Declared source').fill('Fictional cash receipt');
  await register
    .getByRole('button', { name: 'Preserve evidence source' })
    .click();
  await expect(
    page.getByRole('dialog').getByText('Evidence registration confirmed.'),
  ).toBeVisible();
});
