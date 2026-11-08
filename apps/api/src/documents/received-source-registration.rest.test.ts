import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  ESTIMATE_OFFER_PREPARER,
  openEstimateOfferFixture,
  responseRecord,
  responseString,
} from '../offer/offer-estimate-preparation.test-support.js';
import { openDocumentScannerFixture } from './document-scanner.test-support.js';
import { prepareExternalInvoiceSource } from './external-invoice.test-support.js';
import {
  createPaymentEvidenceFixture,
  paymentSourceRegistration,
} from './payment-evidence.test-support.js';
import { prepareReceivedAddendumParent } from './received-addendum.test-support.js';
import { prepareReceivedContractSource } from './received-contract.test-support.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
const withPostgres = databaseUrl ? describe : describe.skip;

interface RegistrationDriver {
  body: Record<string, unknown>;
  registrarMembershipId: string;
  post(body: Record<string, unknown>, key: string): Promise<Response>;
}

/**
 * The shared registration core of every preserved received source, driven
 * through `POST /documents`: closed metadata, source description, received
 * date, registrar and time, replay and the family's own refusal code.
 */
withPostgres('Preserved received source registration', () => {
  let scanner: Awaited<ReturnType<typeof openDocumentScannerFixture>>;
  let estimate: Awaited<ReturnType<typeof openEstimateOfferFixture>>;
  let payment: Awaited<ReturnType<typeof createPaymentEvidenceFixture>>;

  beforeAll(async () => {
    if (!databaseUrl) throw new Error('TEST_DATABASE_URL is required.');
    scanner = await openDocumentScannerFixture();
    estimate = await openEstimateOfferFixture({
      scannerEnvironment: scanner.environment,
    });
    payment = await createPaymentEvidenceFixture(databaseUrl);
  });
  afterAll(async () => {
    await payment?.close();
    await estimate?.close();
    await scanner?.close();
  });

  const estimatePost =
    (companyId: string) => (body: Record<string, unknown>, key: string) =>
      estimate.post({
        path: '/documents',
        companyId,
        headers: ESTIMATE_OFFER_PREPARER,
        body,
        key,
      });

  const families = [
    {
      type: 'received-contract',
      relationKey: 'receivedContractRelation',
      code: 'received_contract_registration_invalid',
      receivedOnMayBeOmitted: true,
      async prepare(): Promise<RegistrationDriver> {
        await estimate.reset();
        scanner.reset();
        const source = await prepareReceivedContractSource(estimate);
        return {
          body: {
            type: 'received-contract',
            opportunityId: source.ready.source.opportunityId,
            contractId: source.contractId,
            contractVersionId: source.contractVersionId,
            title: 'Received Contract DEMO',
            purpose: 'Preserve the external original',
            sourceDescription: 'Synthetic email source',
            receivedOn: '2026-10-25',
          },
          registrarMembershipId: source.ready.source.preparerMembershipId,
          post: estimatePost(source.ready.source.companyId),
        };
      },
    },
    {
      type: 'received-addendum',
      relationKey: 'receivedAddendumRelation',
      code: 'received_addendum_registration_invalid',
      receivedOnMayBeOmitted: true,
      async prepare(): Promise<RegistrationDriver> {
        await estimate.reset();
        scanner.reset();
        const parent = await prepareReceivedAddendumParent(estimate);
        return {
          body: { ...parent.body, receivedOn: '2026-10-26' },
          registrarMembershipId: parent.ready.source.preparerMembershipId,
          post: estimatePost(parent.target.companyId),
        };
      },
    },
    {
      type: 'external-invoice',
      relationKey: 'externalInvoiceRelation',
      code: 'external_invoice_registration_invalid',
      receivedOnMayBeOmitted: false,
      async prepare(): Promise<RegistrationDriver> {
        await estimate.reset();
        scanner.reset();
        const source = await prepareExternalInvoiceSource(estimate);
        return {
          body: { ...source.body, receivedOn: '2026-10-27' },
          registrarMembershipId: source.membershipId,
          post: estimatePost(source.companyId),
        };
      },
    },
    {
      type: 'payment-evidence',
      relationKey: 'paymentEvidenceSource',
      code: 'payment_evidence_registration_invalid',
      receivedOnMayBeOmitted: false,
      async prepare(): Promise<RegistrationDriver> {
        await payment.reset();
        return {
          body: {
            ...paymentSourceRegistration(payment.ready.clientId),
            receivedOn: '2026-10-28',
          },
          registrarMembershipId: payment.ready.membershipIds.owner,
          post: (body, key) =>
            payment.call('/documents', { method: 'POST', body, key }),
        };
      },
    },
  ] as const;

  describe.each(families)('$type', (family) => {
    let driver: RegistrationDriver;
    beforeEach(async () => {
      driver = await family.prepare();
    });

    async function expectRefused(body: Record<string, unknown>) {
      const response = await driver.post(body, randomUUID());
      expect(response.status).toBe(400);
      expect(responseRecord(await response.json())).toMatchObject({
        code: family.code,
      });
    }

    it('trims closed metadata, records the registrar and time, and replays exactly', async () => {
      const key = randomUUID();
      const body = {
        ...driver.body,
        title: '  Padded received title  ',
        purpose: '\tPadded purpose\n',
        sourceDescription: '  Padded source description  ',
      };
      const response = await driver.post(body, key);
      expect(response.status, await response.clone().text()).toBe(201);
      const document = responseRecord(await response.json());
      expect(document).toMatchObject({
        type: family.type,
        title: 'Padded received title',
        purpose: 'Padded purpose',
      });
      const relation = responseRecord(document[family.relationKey]);
      expect(relation).toMatchObject({
        sourceDescription: 'Padded source description',
        receivedOn: driver.body.receivedOn,
        registeredBy: {
          workspaceMembershipId: driver.registrarMembershipId,
        },
      });
      expect(Date.parse(responseString(relation, 'registeredAt'))).toEqual(
        expect.any(Number),
      );
      const replay = await driver.post(body, key);
      expect(replay.status).toBe(201);
      expect(await replay.json()).toEqual(document);
      const conflict = await driver.post(
        { ...body, purpose: 'Another purpose' },
        key,
      );
      expect(conflict.status).toBe(409);
    });

    it('records an explicitly unknown received date as null', async () => {
      const response = await driver.post(
        { ...driver.body, receivedOn: null },
        randomUUID(),
      );
      expect(response.status, await response.clone().text()).toBe(201);
      const document = responseRecord(await response.json());
      expect(responseRecord(document[family.relationKey]).receivedOn).toBe(
        null,
      );
    });

    it(
      family.receivedOnMayBeOmitted
        ? 'records an omitted received date as null, as its PRD allows'
        : 'refuses an omitted received date, which its PRD requires as nullable',
      async () => {
        const { receivedOn: omitted, ...body } = driver.body;
        expect(omitted).not.toBeNull();
        if (!family.receivedOnMayBeOmitted) {
          await expectRefused(body);
          return;
        }
        const response = await driver.post(body, randomUUID());
        expect(response.status, await response.clone().text()).toBe(201);
        const document = responseRecord(await response.json());
        expect(responseRecord(document[family.relationKey]).receivedOn).toBe(
          null,
        );
      },
    );

    it.each([
      ['an unknown field', { extra: 'not accepted' }],
      ['an impossible received date', { receivedOn: '2026-02-30' }],
      ['a year-zero received date', { receivedOn: '0000-01-01' }],
      ['a non-date received value', { receivedOn: 20261025 }],
      ['a blank title', { title: '   ' }],
      ['a title over 200 code units', { title: 'T'.repeat(201) }],
      ['a purpose over 2000 code units', { purpose: 'P'.repeat(2001) }],
      ['a NUL in the source description', { sourceDescription: 'a\0b' }],
      ['a lone surrogate in the purpose', { purpose: 'a\uD800b' }],
      ['a missing source description', { sourceDescription: undefined }],
    ])('refuses %s with the family code', async (_label, change) => {
      await expectRefused({ ...driver.body, ...change });
    });
  });
});
