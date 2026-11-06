import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  createPaymentEvidenceFixture,
  paymentJson,
  paymentNoticePdf,
  paymentRecord,
  paymentSourceRegistration,
  paymentText,
  type PaymentEvidenceFixture,
  type PaymentEvidenceIdentity,
} from '../documents/payment-evidence.test-support.js';
const databaseUrl = process.env.TEST_DATABASE_URL;
const withPostgres = databaseUrl ? describe : describe.skip;
withPostgres('Manual incoming Payment observations through native REST', () => {
  let fixture: PaymentEvidenceFixture;
  beforeAll(async () => {
    if (!databaseUrl) throw new Error('TEST_DATABASE_URL is required.');
    fixture = await createPaymentEvidenceFixture(databaseUrl);
  });
  let candidate: string;
  beforeEach(async () => {
    await fixture.reset();
    await prepareAuthors();
  });
  afterAll(async () => {
    await fixture?.close();
  });
  const values = {
    amountMinor: '125500',
    currency: 'MDL',
    effectiveOn: '2026-01-15',
    method: '  Manual notice  ',
    externalReference: 'FICT-PAY-001',
    observationBasis: 'Fictional notice — not bank or fiscal proof',
  };
  async function source() {
    const registered = await fixture.call('/documents', {
      method: 'POST',
      body: paymentSourceRegistration(fixture.ready.clientId),
    });
    expect(registered.status, await registered.clone().text()).toBe(201);
    const d = await paymentJson(registered),
      documentId = paymentText(d.id),
      documentVersionId = paymentText(paymentRecord(d.version).id);
    const upload = await fixture.upload({
      documentId,
      versionId: documentVersionId,
      revision: 1,
      bytes: await paymentNoticePdf(),
    });
    expect(upload.status, await upload.clone().text()).toBe(201);
    const representationId = paymentText(
      (await paymentJson(upload)).representationId,
    );
    const designated = await fixture.call(
      `/documents/${documentId}/versions/${documentVersionId}/official-designation`,
      { method: 'POST', body: { expectedRevision: 2 } },
    );
    expect(designated.status, await designated.clone().text()).toBe(200);
    return { documentId, documentVersionId, representationId };
  }
  async function create(
    selected: Awaited<ReturnType<typeof source>>,
    key?: string,
  ) {
    const response = await fixture.call('/payments', {
      method: 'POST',
      key,
      body: {
        source: selected,
        values,
        acknowledgeObservedDeclaration: true,
        replacesClosedPaymentId: null,
      },
    });
    expect(response.status, await response.clone().text()).toBe(201);
    return paymentJson(response);
  }
  async function correction(
    id: string,
    expectedRevision: number,
    amountMinor: string,
    identity: PaymentEvidenceIdentity,
  ) {
    const r = await fixture.call(`/payments/${id}/commands`, {
      method: 'POST',
      identity,
      body: {
        action: 'CORRECT_DRAFT',
        expectedRevision,
        values: { ...values, amountMinor },
        reason: '  Literal reason Ș Ю 😀  ',
      },
    });
    expect(r.status, await r.clone().text()).toBe(201);
    return paymentJson(r);
  }
  async function prepareAuthors() {
    const earlier = fixture.ready.membershipIds.reader;
    for (const [path, id] of [
      ['/company-payment-recorder-assignments', earlier],
      ['/company-payment-confirmer-assignments', earlier],
      [
        '/company-payment-confirmer-assignments',
        fixture.ready.membershipIds.owner,
      ],
    ]) {
      if (!path || !id) throw new Error('Incomplete author fixture');
      const grant = await fixture.grant(path, id);
      expect(grant.status, await grant.clone().text()).toBe(201);
    }
    const selected = await source();
    const control = paymentText((await create(selected)).paymentId);
    await correction(control, 1, '125550', 'reader');
    await correction(control, 2, '125575', 'owner');
    const confirmed = await fixture.call(`/payments/${control}/commands`, {
      method: 'POST',
      identity: 'confirmer',
      body: {
        action: 'CONFIRM',
        expectedRevision: 3,
        acknowledgeReviewedObservation: true,
        confirmationNote: 'Independent exact review',
      },
    });
    expect(confirmed.status, await confirmed.clone().text()).toBe(201);
    const confirmedActor = await fixture.call('/access/current-actor', {
      identity: 'confirmer',
    });
    expect(JSON.stringify(await paymentJson(confirmedActor))).not.toContain(
      'company_payment_recorder',
    );
    candidate = paymentText((await create(selected)).paymentId);
    await correction(candidate, 1, '125550', 'reader');
    await correction(candidate, 2, '125575', 'owner');
  }
  it('refuses every earlier material draft author after a later editor while an independent Confirmer without Recorder succeeds', async () => {
    const refused = await fixture.call(`/payments/${candidate}/commands`, {
      method: 'POST',
      identity: 'reader',
      body: {
        action: 'CONFIRM',
        expectedRevision: 3,
        acknowledgeReviewedObservation: true,
        confirmationNote: 'Earlier author must remain disqualified',
      },
    });
    expect(refused.status, await refused.clone().text()).toBe(403);
    const current = await fixture.call(`/payments/${candidate}`);
    expect(current.status, await current.clone().text()).toBe(200);
    expect(await paymentJson(current)).toMatchObject({
      payment: { state: 'DRAFT', revision: 3, confirmation: null },
      history: { items: [{ revision: 3 }, { revision: 2 }, { revision: 1 }] },
    });
  });
});
