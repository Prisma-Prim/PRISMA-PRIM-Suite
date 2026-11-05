import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest';
import {
  backendPid,
  waitForBlocked,
} from '../offer/offer-concurrency.test-support.js';
import {
  createPaymentEvidenceFixture,
  paymentNoticePdf,
  paymentRecord,
  paymentText,
  type PaymentEvidenceFixture,
  type PaymentEvidenceIdentity,
} from '../documents/payment-evidence.test-support.js';
import type { PaymentSource } from './payment.input.js';
import type {
  PaymentAction,
  PaymentConfirmation,
  PaymentCopy,
} from './payment.types.js';
import {
  authorSourceCreateBody,
  authorSourceItems,
  authorSourceJson,
  authorSourceReceipt,
  authorSourceReadEffects,
  authorSourceValues,
  correctLiveAuthorSourcePayer,
  createAuthorSourceObservation,
  expectAuthorSourceStatus,
  expectSingleAuthorSourceReplacementEffects,
  prepareAuthorSource,
  prepareAuthorSourceWithDraft,
} from './payment-observation-author-source.test-support.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
const withPostgres = databaseUrl ? describe : describe.skip;
const primaryPayer = {
  kind: 'PRIMARY',
  legalName: 'Fictional Payer Primary',
  taxId: 'FICT-PAYER-1045',
  legalAddress: '1045 Fictional Street',
} satisfies PaymentCopy['payer'];
const copiedContext = {
  companyLabel: 'Fictional Receiving Company',
  payer: primaryPayer,
};
const reviewNote = '  Independently reviewed exact revision Ș Ю 😀  ';

withPostgres(
  'Payment observation native authors and exact Source authority',
  () => {
    let fixture: PaymentEvidenceFixture;
    beforeAll(async () => {
      if (!databaseUrl) throw new Error('TEST_DATABASE_URL is required.');
      fixture = await createPaymentEvidenceFixture(databaseUrl);
    });
    beforeEach(async () => {
      await fixture.reset();
    });
    afterAll(async () => {
      await fixture?.close();
    });

    describe.each([
      { payerKind: 'PRIMARY', payer: primaryPayer },
      {
        payerKind: 'ADDITIONAL',
        payer: {
          kind: 'ADDITIONAL',
          legalName: 'Fictional Payer Additional',
          taxId: 'FICT-ADDITIONAL-1045',
          legalAddress: null,
        },
      },
    ] satisfies {
      payerKind: PaymentCopy['payer']['kind'];
      payer: PaymentCopy['payer'];
    }[])('conserved $payerKind payer', ({ payerKind, payer }) => {
      let prepared: Awaited<ReturnType<typeof prepareAuthorSource>>;
      beforeEach(async () => {
        prepared = await prepareAuthorSource(fixture, { payerKind });
        const corrected = await correctLiveAuthorSourcePayer(
          fixture,
          payerKind,
        );
        if (payerKind === 'PRIMARY')
          expect(corrected).toMatchObject({
            displayName: 'Corrected live fictional payer',
            taxId: null,
            address: 'Current fictional address',
          });
        else
          expect(corrected).toMatchObject({
            legalEntity: {
              legalName: 'Corrected live fictional additional payer',
              taxId: null,
              legalAddress: 'Current fictional address',
            },
          });
      });

      it('selects and copies the frozen Source identity, including actual nulls, after live Client correction', async () => {
        const sources = await authorSourceJson(
          await fixture.call('/payments/sources'),
        );
        expect(sources).toMatchObject({
          format: 'PAYMENT_SOURCE_PAGE/1',
          companyId: fixture.ready.companyId,
          items: [
            {
              source: prepared.source,
              copiedContext: {
                companyLabel: 'Fictional Receiving Company',
                payer,
              },
            },
          ],
          nextCursor: null,
        });
        expect(authorSourceItems(sources.items)).toHaveLength(1);
        const { paymentId } = await createAuthorSourceObservation(
          fixture,
          prepared.source,
        );
        const detail = await authorSourceJson(
          await fixture.call(`/payments/${paymentId}`),
        );
        expect(detail).toMatchObject({
          payment: {
            revision: 1,
            state: 'DRAFT',
            values: authorSourceValues,
            copiedContext: {
              companyLabel: 'Fictional Receiving Company',
              payer,
            },
            confirmation: null,
          },
          history: {
            items: [
              {
                revision: 1,
                action: 'CREATE',
                before: null,
                after: {
                  state: 'DRAFT',
                  values: authorSourceValues,
                  confirmation: null,
                },
              },
            ],
            nextCursor: null,
          },
        });
        const pdf = await fixture.call(`/payments/${paymentId}/source`);
        await expectAuthorSourceStatus(pdf, 200);
        expect(Buffer.from(await pdf.arrayBuffer())).toEqual(prepared.bytes);
      });
    });

    describe('Company identity-copy authority', () => {
      let source: PaymentSource;
      beforeEach(async () => {
        source = (await prepareAuthorSource(fixture)).source;
        await correctLiveAuthorSourcePayer(fixture, 'PRIMARY');
      });

      it('refuses fresh discovery and CREATE without a root or reserved key, then accepts that same key after restoration', async () => {
        const key = 'fresh-copy-denied-then-restored';
        await expectAuthorSourceStatus(
          await fixture.revoke(
            '/company-director-client-assignments',
            fixture.ready.membershipIds.owner,
          ),
          200,
        );
        await expectAuthorSourceStatus(
          await fixture.call('/payments/sources'),
          403,
        );
        await expectAuthorSourceStatus(
          await fixture.call('/payments', {
            method: 'POST',
            key,
            body: authorSourceCreateBody(source),
          }),
          403,
        );
        expect(
          (
            await authorSourceJson(
              await fixture.call('/payments', { identity: 'reader' }),
            )
          ).items,
        ).toEqual([]);
        await expectAuthorSourceStatus(
          await fixture.grant(
            '/company-director-client-assignments',
            fixture.ready.membershipIds.owner,
          ),
          201,
        );
        const created = await createAuthorSourceObservation(fixture, source, {
          key,
        });
        expect(created.body).toMatchObject({ revision: 1, action: 'CREATE' });
      });

      describe('a conserved CREATE after identity-read loss', () => {
        let created: Awaited<ReturnType<typeof createAuthorSourceObservation>>;
        const key = 'committed-copy-before-identity-loss';
        beforeEach(async () => {
          created = await createAuthorSourceObservation(fixture, source, {
            key,
          });
          await expectAuthorSourceStatus(
            await fixture.revoke(
              '/company-director-client-assignments',
              fixture.ready.membershipIds.owner,
            ),
            200,
          );
        });

        it('replays the exact minimal receipt while native Source payer projection is unavailable', async () => {
          const replay = await createAuthorSourceObservation(fixture, source, {
            key,
          });
          expect(replay.body).toEqual(created.body);
          const nativeSource = await authorSourceJson(
            await fixture.call(`/documents/${source.documentId}`),
          );
          expect(
            paymentRecord(nativeSource.paymentEvidenceSource).payer,
          ).toEqual({ kind: 'UNAVAILABLE' });
          const detail = await authorSourceJson(
            await fixture.call(`/payments/${created.paymentId}`),
          );
          expect(paymentRecord(detail.payment).copiedContext).toEqual(
            copiedContext,
          );
          expect(
            authorSourceItems(paymentRecord(detail.history).items),
          ).toHaveLength(1);
          await expectAuthorSourceStatus(
            await fixture.call('/payments/sources'),
            403,
          );
        });

        it('allows material correction and independent confirmation without recopying the payer', async () => {
          const values = { ...authorSourceValues, amountMinor: '125550' };
          await authorSourceReceipt(
            await fixture.call(`/payments/${created.paymentId}/commands`, {
              method: 'POST',
              body: {
                action: 'CORRECT_DRAFT',
                expectedRevision: 1,
                values,
                reason: '  Literal correction Ș Ю 😀  ',
              },
            }),
            { action: 'CORRECT_DRAFT', revision: 2 },
          );
          await expectAuthorSourceStatus(
            await fixture.call('/payments/sources', { identity: 'confirmer' }),
            403,
          );
          const confirmed = await authorSourceReceipt(
            await fixture.call(`/payments/${created.paymentId}/commands`, {
              method: 'POST',
              identity: 'confirmer',
              body: {
                action: 'CONFIRM',
                expectedRevision: 2,
                acknowledgeReviewedObservation: true,
                confirmationNote: reviewNote,
              },
            }),
            { action: 'CONFIRM', revision: 3 },
          );
          const detail = await authorSourceJson(
            await fixture.call(`/payments/${created.paymentId}`, {
              identity: 'reader',
            }),
          );
          expect(detail).toMatchObject({
            payment: {
              state: 'CONFIRMED',
              revision: 3,
              values,
              copiedContext,
              confirmation: {
                actor: {
                  membershipId: fixture.ready.membershipIds.confirmer,
                  displayName: 'Fictional Payment Confirmer',
                },
                recordedAt: paymentText(confirmed.body.recordedAt),
                note: reviewNote,
              },
            },
            history: {
              items: [
                { revision: 3, action: 'CONFIRM' },
                {
                  revision: 2,
                  action: 'CORRECT_DRAFT',
                  reason: '  Literal correction Ș Ю 😀  ',
                },
                { revision: 1, action: 'CREATE' },
              ],
            },
          });
        });
      });
    });

    describe.each([
      {
        authority: 'original Client',
        path: '/company-director-client-assignments',
        downloadStatus: 403,
        hidesSource: true,
        hidesClient: true,
      },
      {
        authority: 'Evidence family',
        path: '/company-payment-evidence-access-assignments',
        downloadStatus: 404,
        hidesSource: true,
        hidesClient: false,
      },
      {
        authority: 'native Document',
        path: '/company-document-registrar-assignments',
        downloadStatus: 403,
        hidesSource: true,
        hidesClient: false,
      },
      {
        authority: 'PDF content',
        path: '/company-document-content-reader-assignments',
        downloadStatus: 403,
        hidesSource: false,
        hidesClient: false,
      },
    ])('$authority loss', (authority) => {
      let source: PaymentSource;
      let draftId: string;
      let confirmedId: string;
      let confirmation: PaymentConfirmation;
      beforeEach(async () => {
        source = (await prepareAuthorSource(fixture)).source;
        await expectAuthorSourceStatus(
          await fixture.grant(
            '/company-payment-recorder-assignments',
            fixture.ready.membershipIds.ordinary,
          ),
          201,
        );
        draftId = (await createAuthorSourceObservation(fixture, source))
          .paymentId;
        confirmedId = (await createAuthorSourceObservation(fixture, source))
          .paymentId;
        const confirmed = await authorSourceReceipt(
          await fixture.call(`/payments/${confirmedId}/commands`, {
            method: 'POST',
            identity: 'confirmer',
            body: {
              action: 'CONFIRM',
              expectedRevision: 1,
              acknowledgeReviewedObservation: true,
              confirmationNote: reviewNote,
            },
          }),
          { action: 'CONFIRM', revision: 2 },
        );
        confirmation = {
          actor: {
            membershipId: fixture.ready.membershipIds.confirmer,
            displayName: 'Fictional Payment Confirmer',
          },
          recordedAt: paymentText(confirmed.body.recordedAt),
          note: reviewNote,
        };
        for (const identity of ['reader', 'ordinary', 'reverser'] satisfies (
          'reader' | 'ordinary' | 'reverser'
        )[])
          await expectAuthorSourceStatus(
            await fixture.revoke(
              authority.path,
              fixture.ready.membershipIds[identity],
            ),
            200,
          );
      });

      function expectProtectedProjections(detail: Record<string, unknown>) {
        if (authority.hidesSource)
          expect(detail.liveSource).toEqual({ kind: 'UNAVAILABLE' });
        else
          expect(detail.liveSource).toEqual({
            kind: 'AVAILABLE',
            documentId: source.documentId,
            documentVersionId: source.documentVersionId,
            title: 'Fictional payment notice',
            versionNumber: 1,
            versionState: 'official',
            content: { kind: 'UNAVAILABLE' },
          });
        if (authority.hidesClient)
          expect(detail.client).toEqual({ kind: 'UNAVAILABLE' });
        else
          expect(detail.client).toMatchObject({
            kind: 'AVAILABLE',
            clientId: fixture.ready.clientId,
          });
      }

      it('lets a non-owner Recorder withdraw and a copied Reader retain exact facts and full history', async () => {
        await authorSourceReceipt(
          await fixture.call(`/payments/${draftId}/commands`, {
            method: 'POST',
            identity: 'ordinary',
            body: {
              action: 'WITHDRAW_DRAFT',
              expectedRevision: 1,
              reason: '  Withdraw mistaken declaration Ș Ю 😀  ',
            },
          }),
          { action: 'WITHDRAW_DRAFT', revision: 2 },
        );
        const detail = await authorSourceJson(
          await fixture.call(`/payments/${draftId}`, { identity: 'reader' }),
        );
        expect(detail).toMatchObject({
          payment: {
            state: 'WITHDRAWN',
            revision: 2,
            values: authorSourceValues,
            copiedContext,
            confirmation: null,
          },
          history: {
            items: [
              {
                revision: 2,
                action: 'WITHDRAW_DRAFT',
                actor: { membershipId: fixture.ready.membershipIds.ordinary },
                before: {
                  state: 'DRAFT',
                  values: authorSourceValues,
                  confirmation: null,
                },
                after: {
                  state: 'WITHDRAWN',
                  values: authorSourceValues,
                  confirmation: null,
                },
                reason: '  Withdraw mistaken declaration Ș Ю 😀  ',
              },
              { revision: 1, action: 'CREATE' },
            ],
            nextCursor: null,
          },
        });
        expectProtectedProjections(detail);
        await expectAuthorSourceStatus(
          await fixture.call(`/payments/${draftId}/source`, {
            identity: 'reader',
          }),
          authority.downloadStatus,
        );
        const owner = await authorSourceJson(
          await fixture.call(`/payments/${draftId}`),
        );
        expect(owner.liveSource).toMatchObject({
          documentId: source.documentId,
          documentVersionId: source.documentVersionId,
          content: { representationId: source.representationId },
        });
      });

      it('lets a Reverser without Recorder reverse source-free while conserving the original confirmation', async () => {
        await authorSourceReceipt(
          await fixture.call(`/payments/${confirmedId}/commands`, {
            method: 'POST',
            identity: 'reverser',
            body: {
              action: 'REVERSE',
              expectedRevision: 2,
              reason: '  Reverse recorded observation; no refund Ș Ю 😀  ',
            },
          }),
          { action: 'REVERSE', revision: 3 },
        );
        const detail = await authorSourceJson(
          await fixture.call(`/payments/${confirmedId}`, {
            identity: 'reader',
          }),
        );
        expect(detail).toMatchObject({
          payment: {
            state: 'REVERSED',
            revision: 3,
            values: authorSourceValues,
            copiedContext,
            confirmation,
          },
          history: {
            items: [
              {
                revision: 3,
                action: 'REVERSE',
                actor: { membershipId: fixture.ready.membershipIds.reverser },
                before: {
                  state: 'CONFIRMED',
                  values: authorSourceValues,
                  confirmation,
                },
                after: {
                  state: 'REVERSED',
                  values: authorSourceValues,
                  confirmation,
                },
              },
              { revision: 2, action: 'CONFIRM', after: { confirmation } },
              { revision: 1, action: 'CREATE' },
            ],
            nextCursor: null,
          },
        });
        expectProtectedProjections(detail);
        await expectAuthorSourceStatus(
          await fixture.call(`/payments/${confirmedId}/source`, {
            identity: 'reader',
          }),
          authority.downloadStatus,
        );
        const owner = await authorSourceJson(
          await fixture.call(`/payments/${confirmedId}`),
        );
        expect(owner.liveSource).toMatchObject({
          documentId: source.documentId,
          documentVersionId: source.documentVersionId,
          content: { representationId: source.representationId },
        });
      });
    });

    describe('exact Version and Representation selection', () => {
      let superseded: PaymentSource;
      let official: PaymentSource;
      let draft: PaymentSource;
      let olderRepresentation: PaymentSource;
      let preservedBytes: Buffer;
      beforeEach(async () => {
        const prepared = await prepareAuthorSource(fixture, {
          official: false,
        });
        olderRepresentation = prepared.source;
        preservedBytes = prepared.bytes;
        const currentUpload = await authorSourceJson(
          await fixture.upload({
            documentId: prepared.source.documentId,
            versionId: prepared.source.documentVersionId,
            revision: 2,
            bytes: preservedBytes,
          }),
          201,
        );
        superseded = {
          ...prepared.source,
          representationId: paymentText(currentUpload.representationId),
        };
        await authorSourceJson(
          await fixture.call(
            `/documents/${superseded.documentId}/versions/${superseded.documentVersionId}/official-designation`,
            { method: 'POST', body: { expectedRevision: 3 } },
          ),
        );
        const successor = await authorSourceJson(
          await fixture.call(`/documents/${superseded.documentId}/versions`, {
            method: 'POST',
            body: { expectedRevision: 4 },
          }),
          201,
        );
        const nextVersionId = paymentText(successor.versionId);
        const nextUpload = await authorSourceJson(
          await fixture.upload({
            documentId: superseded.documentId,
            versionId: nextVersionId,
            revision: 5,
            bytes: preservedBytes,
          }),
          201,
        );
        official = {
          documentId: superseded.documentId,
          documentVersionId: nextVersionId,
          representationId: paymentText(nextUpload.representationId),
        };
        await authorSourceJson(
          await fixture.call(
            `/documents/${official.documentId}/versions/${official.documentVersionId}/official-designation`,
            { method: 'POST', body: { expectedRevision: 6 } },
          ),
        );
        const draftVersion = await authorSourceJson(
          await fixture.call(`/documents/${official.documentId}/versions`, {
            method: 'POST',
            body: { expectedRevision: 7 },
          }),
          201,
        );
        const draftVersionId = paymentText(draftVersion.versionId);
        const draftUpload = await authorSourceJson(
          await fixture.upload({
            documentId: official.documentId,
            versionId: draftVersionId,
            revision: 8,
            bytes: preservedBytes,
          }),
          201,
        );
        draft = {
          documentId: official.documentId,
          documentVersionId: draftVersionId,
          representationId: paymentText(draftUpload.representationId),
        };
      });

      it('keeps an exact superseded Source selectable and reopens its preserved PDF without retargeting to latest', async () => {
        const sources = await authorSourceJson(
          await fixture.call('/payments/sources'),
        );
        const items = authorSourceItems(sources.items);
        expect(items).toHaveLength(2);
        expect(items).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              source: superseded,
              versionNumber: 1,
              versionState: 'superseded',
            }),
            expect.objectContaining({
              source: official,
              versionNumber: 2,
              versionState: 'official',
            }),
          ]),
        );
        const created = await createAuthorSourceObservation(
          fixture,
          superseded,
        );
        const detail = await authorSourceJson(
          await fixture.call(`/payments/${created.paymentId}`),
        );
        expect(detail.liveSource).toMatchObject({
          documentVersionId: superseded.documentVersionId,
          versionNumber: 1,
          versionState: 'superseded',
          content: { representationId: superseded.representationId },
        });
        const downloaded = await fixture.call(
          `/payments/${created.paymentId}/source`,
        );
        await expectAuthorSourceStatus(downloaded, 200);
        expect(Buffer.from(await downloaded.arrayBuffer())).toEqual(
          preservedBytes,
        );
      });

      it('refuses a draft, an overwritten Representation and a mismatched Version tuple even when all PDF bytes match', async () => {
        for (const source of [
          draft,
          olderRepresentation,
          { ...superseded, representationId: official.representationId },
        ])
          await expectAuthorSourceStatus(
            await fixture.call('/payments', {
              method: 'POST',
              body: authorSourceCreateBody(source),
            }),
            409,
          );
        expect(
          (await authorSourceJson(await fixture.call('/payments'))).items,
        ).toEqual([]);
      });
    });

    describe('independent human declarations', () => {
      let source: PaymentSource;
      beforeEach(async () => {
        source = (await prepareAuthorSource(fixture)).source;
      });

      it('permits separate acknowledged observations of one PDF and repeated external reference without merging them', async () => {
        const first = await createAuthorSourceObservation(fixture, source);
        const second = await createAuthorSourceObservation(fixture, source);
        expect(second.paymentId).not.toBe(first.paymentId);
        expect(second.body.commandId).not.toBe(first.body.commandId);
        const inventory = await authorSourceJson(
          await fixture.call('/payments'),
        );
        const items = authorSourceItems(inventory.items);
        expect(items).toHaveLength(2);
        expect(items.map((item) => item.id).sort()).toEqual(
          [first.paymentId, second.paymentId].sort(),
        );
        for (const item of items)
          expect(item).toMatchObject({
            state: 'DRAFT',
            revision: 1,
            values: authorSourceValues,
            replacesClosedPaymentId: null,
            replacementPaymentId: null,
          });
      });

      describe('a creator who separately receives Confirmer', () => {
        let paymentId: string;
        beforeEach(async () => {
          paymentId = (await createAuthorSourceObservation(fixture, source))
            .paymentId;
          await expectAuthorSourceStatus(
            await fixture.grant(
              '/company-payment-confirmer-assignments',
              fixture.ready.membershipIds.owner,
            ),
            201,
          );
        });

        it('refuses self-confirmation but allows the independent native Confirmer without Recorder', async () => {
          const command = {
            action: 'CONFIRM',
            expectedRevision: 1,
            acknowledgeReviewedObservation: true,
            confirmationNote: reviewNote,
          };
          await expectAuthorSourceStatus(
            await fixture.call(`/payments/${paymentId}/commands`, {
              method: 'POST',
              body: command,
            }),
            403,
          );
          await expectAuthorSourceStatus(
            await fixture.call('/payments/sources', { identity: 'confirmer' }),
            403,
          );
          await authorSourceReceipt(
            await fixture.call(`/payments/${paymentId}/commands`, {
              method: 'POST',
              identity: 'confirmer',
              body: command,
            }),
            { action: 'CONFIRM', revision: 2 },
          );
          const detail = await authorSourceJson(
            await fixture.call(`/payments/${paymentId}`),
          );
          expect(detail).toMatchObject({
            payment: {
              state: 'CONFIRMED',
              revision: 2,
              confirmation: {
                actor: { membershipId: fixture.ready.membershipIds.confirmer },
                note: reviewNote,
              },
            },
            history: {
              items: [
                { revision: 2, action: 'CONFIRM' },
                { revision: 1, action: 'CREATE' },
              ],
            },
          });
        });
      });
    });
  },
);

withPostgres('Payment eligible Source discovery before page bounds', () => {
  let fixture: PaymentEvidenceFixture;
  let bytes: Buffer;
  let otherCompanyId: string;
  const sources: Awaited<ReturnType<typeof prepareAuthorSourceWithDraft>>[] =
    [];
  let initialCursor: string;
  let inventoryCursor: string;

  beforeAll(async () => {
    if (!databaseUrl) throw new Error('TEST_DATABASE_URL is required.');
    fixture = await createPaymentEvidenceFixture(databaseUrl);
    await fixture.reset();
    bytes = await paymentNoticePdf('Bounded Source selection');
    await expectAuthorSourceStatus(
      await fixture.grant(
        '/company-payment-recorder-assignments',
        fixture.ready.membershipIds.reader,
      ),
      201,
    );
    otherCompanyId = paymentText(
      (
        await authorSourceJson(
          await fixture.call('/companies', {
            method: 'POST',
            company: null,
            body: { displayName: 'Fictional Other Source Selection Company' },
          }),
          201,
        )
      ).id,
    );
    for (const path of [
      '/company-context-assignments',
      '/company-payment-recorder-assignments',
      '/company-director-client-assignments',
      '/company-payment-evidence-access-assignments',
      '/company-document-registrar-assignments',
      '/company-document-content-reader-assignments',
    ])
      await expectAuthorSourceStatus(
        await fixture.call(path, {
          method: 'POST',
          company: null,
          body: {
            companyId: otherCompanyId,
            workspaceMembershipId: fixture.ready.membershipIds.reader,
          },
        }),
        201,
      );
  });
  // Ordered native preparation uses existing hook budgets, with no positive SQL fixtures.
  beforeAll(async () => {
    for (let index = 0; index < 13; index++)
      sources.push(await prepareAuthorSourceWithDraft(fixture, bytes));
  });
  beforeAll(async () => {
    for (let index = 0; index < 13; index++)
      sources.push(await prepareAuthorSourceWithDraft(fixture, bytes));
  });
  beforeAll(async () => {
    // A real inventory continuation supplies the foreign cursor kind; no signing key is inspected.
    for (const source of sources)
      await createAuthorSourceObservation(fixture, source.official);
    const inventory = await authorSourceJson(
      await fixture.call('/payments', { identity: 'reader' }),
    );
    inventoryCursor = paymentText(inventory.nextCursor);
    const first = await authorSourceJson(
      await fixture.call('/payments/sources', { identity: 'reader' }),
    );
    initialCursor = paymentText(first.nextCursor);
    const other = await authorSourceJson(
      await fixture.call('/payments/sources', {
        identity: 'reader',
        company: otherCompanyId,
      }),
    );
    expect(other.items).toEqual([]);
  });
  afterAll(async () => {
    await fixture?.close();
  });

  function sourcePath(cursor: string) {
    return `/payments/sources?cursor=${encodeURIComponent(cursor)}`;
  }
  function tuple(source: PaymentSource) {
    return [
      source.documentId,
      source.documentVersionId,
      source.representationId,
    ].join('/');
  }
  function responseTuple(item: Record<string, unknown>) {
    const source = paymentRecord(item.source);
    return [
      paymentText(source.documentId),
      paymentText(source.documentVersionId),
      paymentText(source.representationId),
    ].join('/');
  }

  it('returns25 then1 eligible official tuples while excluding26 interleaved clean draft successors before the bound', async () => {
    const before = await authorSourceReadEffects(fixture);
    const first = await authorSourceJson(
      await fixture.call('/payments/sources', { identity: 'reader' }),
    );
    expect(Object.keys(first).sort()).toEqual([
      'companyId',
      'format',
      'items',
      'nextCursor',
      'readCapture',
    ]);
    expect(first.format).toBe('PAYMENT_SOURCE_PAGE/1');
    expect(first.companyId).toBe(fixture.ready.companyId);
    const cursor = paymentText(first.nextCursor);
    expect(cursor.length).toBeLessThanOrEqual(2048);
    const head = authorSourceItems(first.items);
    expect(head).toHaveLength(25);
    const second = await authorSourceJson(
      await fixture.call(sourcePath(cursor), { identity: 'reader' }),
    );
    const tail = authorSourceItems(second.items);
    expect(tail).toHaveLength(1);
    expect(second.nextCursor).toBeNull();
    const eligible = [...head, ...tail];
    expect(eligible.map(responseTuple)).toEqual(
      sources.map((source) => tuple(source.official)).sort(),
    );
    expect(new Set(eligible.map(responseTuple)).size).toBe(26);
    for (const item of eligible)
      expect(item).toMatchObject({
        versionNumber: 1,
        versionState: 'official',
        copiedContext,
      });
    const returned = new Set(eligible.map(responseTuple));
    for (const source of sources)
      expect(returned.has(tuple(source.draft))).toBe(false);
    expect(await authorSourceReadEffects(fixture)).toEqual(before);
  });

  it('binds a continuation to its actor even when another native Recorder can read the same eligible Sources', async () => {
    const control = await authorSourceJson(
      await fixture.call('/payments/sources'),
    );
    expect(authorSourceItems(control.items)).toHaveLength(25);
    await expectAuthorSourceStatus(
      await fixture.call(sourcePath(initialCursor)),
      400,
    );
  });

  it('binds a continuation to its Company despite valid native selector authority in another Company', async () => {
    const control = await authorSourceJson(
      await fixture.call('/payments/sources', {
        identity: 'reader',
        company: otherCompanyId,
      }),
    );
    expect(control.items).toEqual([]);
    await expectAuthorSourceStatus(
      await fixture.call(sourcePath(initialCursor), {
        identity: 'reader',
        company: otherCompanyId,
      }),
      400,
    );
  });

  it('rejects an authentic inventory continuation as a Source cursor and a Source continuation as an inventory cursor', async () => {
    await expectAuthorSourceStatus(
      await fixture.call(sourcePath(inventoryCursor), { identity: 'reader' }),
      400,
    );
    await expectAuthorSourceStatus(
      await fixture.call(
        `/payments?cursor=${encodeURIComponent(initialCursor)}`,
        { identity: 'reader' },
      ),
      400,
    );
  });

  it('rejects a changed signature without accepting a different Source position', async () => {
    const [payload, signature] = initialCursor.split('.');
    if (!payload || !signature)
      throw new Error('Expected an opaque native cursor.');
    const altered = `${payload}.${signature.startsWith('A') ? 'B' : 'A'}${signature.slice(1)}`;
    await expectAuthorSourceStatus(
      await fixture.call(sourcePath(altered), { identity: 'reader' }),
      400,
    );
  });

  it.each([
    { name: 'an unknown page size', query: 'limit=25' },
    { name: 'a state filter', query: 'state=official' },
    {
      name: 'an external-reference lookup',
      query: 'externalReference=FICT-PAY-1047',
    },
    { name: 'an empty cursor', query: 'cursor=' },
    {
      name: '2049 ASCII code units',
      query: `cursor=${encodeURIComponent('x'.repeat(2049))}`,
    },
    {
      name: '2049 UTF16 code units containing supplementary characters',
      query: `cursor=${encodeURIComponent('😀'.repeat(1024) + 'x')}`,
    },
  ])('rejects $name in Source discovery', async ({ query }) => {
    await expectAuthorSourceStatus(
      await fixture.call(`/payments/sources?${query}`, { identity: 'reader' }),
      400,
    );
  });

  it('refuses unknown fields beside an otherwise valid Source continuation', async () => {
    await expectAuthorSourceStatus(
      await fixture.call(`${sourcePath(initialCursor)}&limit=25`, {
        identity: 'reader',
      }),
      400,
    );
  });

  describe.each([
    { authority: 'Company context', path: '/company-context-assignments' },
    { authority: 'Recorder', path: '/company-payment-recorder-assignments' },
    {
      authority: 'Company identity and original Client',
      path: '/company-director-client-assignments',
    },
    {
      authority: 'Evidence family',
      path: '/company-payment-evidence-access-assignments',
    },
    {
      authority: 'native Document',
      path: '/company-document-registrar-assignments',
    },
    {
      authority: 'PDF content',
      path: '/company-document-content-reader-assignments',
    },
  ])('$authority capture replacement', ({ authority, path }) => {
    let before: Record<string, unknown>;
    let heldCursor: string;
    beforeEach(async () => {
      before = await authorSourceJson(
        await fixture.call('/payments/sources', { identity: 'reader' }),
      );
      heldCursor = paymentText(before.nextCursor);
    });

    it('keeps the held cursor invalid across revocation, restoration and deliberate fresh discovery', async () => {
      const member = fixture.ready.membershipIds.reader;
      await expectAuthorSourceStatus(await fixture.revoke(path, member), 200);
      try {
        await expectAuthorSourceStatus(
          await fixture.call(sourcePath(heldCursor), { identity: 'reader' }),
          authority === 'Company context' ? 400 : 403,
        );
        if (authority === 'Company context') {
          // The delivered native Director Client/Document grants retain independent
          // Company-context admission; losing one context capture still retires its cursor.
          const admitted = await authorSourceJson(
            await fixture.call('/payments/sources', { identity: 'reader' }),
          );
          expect(authorSourceItems(admitted.items)).toHaveLength(25);
          expect(admitted.readCapture).not.toBe(before.readCapture);
        }
      } finally {
        await expectAuthorSourceStatus(await fixture.grant(path, member), 201);
      }
      await expectAuthorSourceStatus(
        await fixture.call(sourcePath(heldCursor), { identity: 'reader' }),
        400,
      );
      const fresh = await authorSourceJson(
        await fixture.call('/payments/sources', { identity: 'reader' }),
      );
      expect(authorSourceItems(fresh.items)).toHaveLength(25);
      expect(paymentText(fresh.nextCursor)).not.toBe(heldCursor);
      await expectAuthorSourceStatus(
        await fixture.call(sourcePath(heldCursor), { identity: 'reader' }),
        400,
      );
      if (authority === 'Recorder')
        expect(fresh.readCapture).toBe(before.readCapture);
    });
  });
});

withPostgres('Payment terminal predecessor replacement concurrency', () => {
  let fixture: PaymentEvidenceFixture;
  let source: PaymentSource;
  let predecessorId: string;
  let before: Awaited<ReturnType<typeof authorSourceReadEffects>>;
  beforeAll(async () => {
    if (!databaseUrl) throw new Error('TEST_DATABASE_URL is required.');
    fixture = await createPaymentEvidenceFixture(databaseUrl);
  });
  beforeEach(async () => {
    await fixture.reset();
    await expectAuthorSourceStatus(
      await fixture.grant(
        '/company-payment-recorder-assignments',
        fixture.ready.membershipIds.reader,
      ),
      201,
    );
    source = (await prepareAuthorSource(fixture)).source;
    predecessorId = (await createAuthorSourceObservation(fixture, source))
      .paymentId;
    await authorSourceReceipt(
      await fixture.call(`/payments/${predecessorId}/commands`, {
        method: 'POST',
        body: {
          action: 'WITHDRAW_DRAFT',
          expectedRevision: 1,
          reason: '  Deliberately close mistaken original Ș Ю 😀  ',
        },
      }),
      { action: 'WITHDRAW_DRAFT', revision: 2 },
    );
    before = await authorSourceReadEffects(fixture);
    await fixture.pool.query(
      'CREATE FUNCTION payment_author_source_replacement_barrier() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN PERFORM pg_advisory_xact_lock(10471048); RETURN NEW; END $$',
    );
    await fixture.pool.query(
      'CREATE TRIGGER payment_author_source_replacement_barrier BEFORE INSERT ON payment_events FOR EACH ROW EXECUTE FUNCTION payment_author_source_replacement_barrier()',
    );
  });
  afterEach(async () => {
    await fixture.pool.query(
      'DROP TRIGGER IF EXISTS payment_author_source_replacement_barrier ON payment_events',
    );
    await fixture.pool.query(
      'DROP FUNCTION IF EXISTS payment_author_source_replacement_barrier()',
    );
  });
  afterAll(async () => {
    await fixture?.close();
  });

  it.each([
    { first: 'owner', second: 'reader' },
    { first: 'reader', second: 'owner' },
  ] satisfies {
    first: PaymentEvidenceIdentity;
    second: PaymentEvidenceIdentity;
  }[])(
    'lets only $first commit when $second competes after the final event barrier is reached',
    async ({ first, second }) => {
      const barrier = await fixture.pool.connect();
      const firstKey = `replacement-first-${first}`;
      const secondKey = `replacement-second-${second}`;
      const body = {
        ...authorSourceCreateBody(source),
        replacesClosedPaymentId: predecessorId,
      };
      let winnerRequest: Promise<Response> | undefined;
      let loserRequest: Promise<Response> | undefined;
      try {
        await barrier.query('BEGIN');
        const pid = await backendPid(barrier);
        await barrier.query('SELECT pg_advisory_xact_lock(10471048)');
        winnerRequest = fixture.call('/payments', {
          method: 'POST',
          identity: first,
          key: firstKey,
          body,
        });
        await waitForBlocked(fixture.pool, pid);
        loserRequest = fixture.call('/payments', {
          method: 'POST',
          identity: second,
          key: secondKey,
          body,
        });
        // The recursive wait observes the second transaction waiting behind the first.
        await waitForBlocked(fixture.pool, pid, 2);
        await barrier.query('COMMIT');
        const winner = await authorSourceReceipt(await winnerRequest, {
          action: 'CREATE',
          revision: 1,
        });
        await expectAuthorSourceStatus(await loserRequest, 409);
        const committed = await expectSingleAuthorSourceReplacementEffects(
          fixture,
          {
            before,
            winner,
            predecessorId,
            winnerKey: firstKey,
            loserKey: secondKey,
            winnerMembershipId: fixture.ready.membershipIds[first],
          },
        );
        const inventory = await authorSourceJson(
          await fixture.call('/payments', { identity: 'reader' }),
        );
        const items = authorSourceItems(inventory.items);
        expect(items).toHaveLength(2);
        expect(items).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              id: predecessorId,
              state: 'WITHDRAWN',
              revision: 2,
              replacesClosedPaymentId: null,
              replacementPaymentId: winner.paymentId,
            }),
            expect.objectContaining({
              id: winner.paymentId,
              state: 'DRAFT',
              revision: 1,
              replacesClosedPaymentId: predecessorId,
              replacementPaymentId: null,
            }),
          ]),
        );
        await expectAuthorSourceStatus(
          await fixture.call('/payments', {
            method: 'POST',
            identity: second,
            key: secondKey,
            body,
          }),
          409,
        );
        expect(await authorSourceReadEffects(fixture)).toEqual(committed);
      } finally {
        await barrier.query('ROLLBACK');
        barrier.release();
        await Promise.allSettled(
          [winnerRequest, loserRequest].filter(
            (request) => request !== undefined,
          ),
        );
      }
    },
  );
});

withPostgres(
  'Payment committed confirmation through two real API restarts',
  () => {
    let fixture: PaymentEvidenceFixture;
    let prepared: Awaited<ReturnType<typeof prepareAuthorSource>>;
    let paymentId: string;
    let createBody: ReturnType<typeof authorSourceCreateBody>;
    let initialCurrent: Record<string, unknown>;
    let initialHistory: Record<string, unknown>;
    let initialEffects: Awaited<ReturnType<typeof authorSourceReadEffects>>;
    const committed: Record<string, unknown>[] = [];
    const reopened: Awaited<ReturnType<typeof reopenCommitted>>[] = [];
    const createKey = 'restart-conserved-create';
    const correctionKey = 'restart-conserved-correction';
    const confirmationKey = 'restart-conserved-confirmation';
    const correctedValues = { ...authorSourceValues, amountMinor: '125550' };
    const correction = {
      action: 'CORRECT_DRAFT',
      expectedRevision: 1,
      values: correctedValues,
      reason: '  Preserve exact material correction Ș Ю 😀  ',
    };
    const confirmation = {
      action: 'CONFIRM',
      expectedRevision: 2,
      acknowledgeReviewedObservation: true,
      confirmationNote: reviewNote,
    };

    beforeAll(async () => {
      if (!databaseUrl) throw new Error('TEST_DATABASE_URL is required.');
      fixture = await createPaymentEvidenceFixture(databaseUrl);
      await fixture.reset();
      prepared = await prepareAuthorSource(fixture);
      createBody = authorSourceCreateBody(prepared.source);
      const created = await createAuthorSourceObservation(
        fixture,
        prepared.source,
        { key: createKey },
      );
      paymentId = created.paymentId;
      committed.push(created.body);
      committed.push(
        (
          await authorSourceReceipt(
            await fixture.call(`/payments/${paymentId}/commands`, {
              method: 'POST',
              key: correctionKey,
              body: correction,
            }),
            { action: 'CORRECT_DRAFT', revision: 2 },
          )
        ).body,
      );
      committed.push(
        (
          await authorSourceReceipt(
            await fixture.call(`/payments/${paymentId}/commands`, {
              method: 'POST',
              identity: 'confirmer',
              key: confirmationKey,
              body: confirmation,
            }),
            { action: 'CONFIRM', revision: 3 },
          )
        ).body,
      );
      initialCurrent = await authorSourceJson(
        await fixture.call(`/payments/${paymentId}`, { identity: 'reader' }),
      );
      initialHistory = await authorSourceJson(
        await fixture.call(`/payments/${paymentId}/history`, {
          identity: 'reader',
        }),
      );
      initialEffects = await authorSourceReadEffects(fixture);
    });
    beforeAll(async () => {
      await fixture.restart();
      reopened.push(await reopenCommitted());
    });
    beforeAll(async () => {
      await fixture.restart();
      reopened.push(await reopenCommitted());
    });
    afterAll(async () => {
      await fixture?.close();
    });

    async function reopenCommitted() {
      const current = await authorSourceJson(
        await fixture.call(`/payments/${paymentId}`, { identity: 'reader' }),
      );
      const history = await authorSourceJson(
        await fixture.call(`/payments/${paymentId}/history`, {
          identity: 'reader',
        }),
      );
      const replayed: Record<string, unknown>[] = [];
      for (const command of [
        {
          path: '/payments',
          key: createKey,
          identity: 'owner',
          body: createBody,
          action: 'CREATE',
          revision: 1,
        },
        {
          path: `/payments/${paymentId}/commands`,
          key: correctionKey,
          identity: 'owner',
          body: correction,
          action: 'CORRECT_DRAFT',
          revision: 2,
        },
        {
          path: `/payments/${paymentId}/commands`,
          key: confirmationKey,
          identity: 'confirmer',
          body: confirmation,
          action: 'CONFIRM',
          revision: 3,
        },
      ] satisfies {
        path: string;
        key: string;
        identity: PaymentEvidenceIdentity;
        body: unknown;
        action: PaymentAction;
        revision: number;
      }[])
        replayed.push(
          (
            await authorSourceReceipt(
              await fixture.call(command.path, {
                method: 'POST',
                identity: command.identity,
                key: command.key,
                body: command.body,
              }),
              { action: command.action, revision: command.revision },
            )
          ).body,
        );
      const pdf = await fixture.call(`/payments/${paymentId}/source`);
      await expectAuthorSourceStatus(pdf, 200);
      return {
        current,
        history,
        replayed,
        bytes: Buffer.from(await pdf.arrayBuffer()),
        effects: await authorSourceReadEffects(fixture),
      };
    }

    it('conserves exact current facts, complete history, immutable confirmation, every minimal receipt and PDF after each restart without replay effects', () => {
      expect(initialCurrent).toMatchObject({
        payment: {
          state: 'CONFIRMED',
          revision: 3,
          values: correctedValues,
          copiedContext,
          confirmation: {
            actor: {
              membershipId: fixture.ready.membershipIds.confirmer,
              displayName: 'Fictional Payment Confirmer',
            },
            note: reviewNote,
          },
        },
        history: {
          items: [
            { revision: 3, action: 'CONFIRM' },
            { revision: 2, action: 'CORRECT_DRAFT' },
            { revision: 1, action: 'CREATE' },
          ],
          nextCursor: null,
        },
      });
      expect(reopened).toHaveLength(2);
      for (const restored of reopened) {
        expect(restored.current).toEqual(initialCurrent);
        expect(restored.history).toEqual(initialHistory);
        expect(restored.replayed).toEqual(committed);
        expect(restored.bytes).toEqual(prepared.bytes);
        expect(restored.effects).toEqual(initialEffects);
      }
    });

    describe('source-free reversal after the second restart', () => {
      beforeAll(async () => {
        for (const path of [
          '/company-director-client-assignments',
          '/company-payment-evidence-access-assignments',
          '/company-document-registrar-assignments',
          '/company-document-content-reader-assignments',
        ])
          await expectAuthorSourceStatus(
            await fixture.revoke(path, fixture.ready.membershipIds.reverser),
            200,
          );
        const current = await authorSourceJson(
          await fixture.call(`/payments/${paymentId}`, {
            identity: 'reverser',
          }),
        );
        expect(current).toMatchObject({
          liveSource: { kind: 'UNAVAILABLE' },
          client: { kind: 'UNAVAILABLE' },
          capabilities: { canReverse: true, canCorrect: false },
        });
      });

      it('records and exactly replays reversal without Source authority while preserving confirmed values and attribution', async () => {
        const key = 'restart-source-free-reversal';
        const body = {
          action: 'REVERSE',
          expectedRevision: 3,
          reason: '  Reverse observation after restart; no refund Ș Ю 😀  ',
        };
        const reversed = await authorSourceReceipt(
          await fixture.call(`/payments/${paymentId}/commands`, {
            method: 'POST',
            identity: 'reverser',
            key,
            body,
          }),
          { action: 'REVERSE', revision: 4 },
        );
        const detail = await authorSourceJson(
          await fixture.call(`/payments/${paymentId}`, { identity: 'reader' }),
        );
        const originalConfirmation = paymentRecord(
          initialCurrent.payment,
        ).confirmation;
        expect(detail).toMatchObject({
          payment: {
            state: 'REVERSED',
            revision: 4,
            values: correctedValues,
            copiedContext,
            confirmation: originalConfirmation,
          },
          history: {
            items: [
              {
                revision: 4,
                action: 'REVERSE',
                before: {
                  state: 'CONFIRMED',
                  values: correctedValues,
                  confirmation: originalConfirmation,
                },
                after: {
                  state: 'REVERSED',
                  values: correctedValues,
                  confirmation: originalConfirmation,
                },
                reason: body.reason,
              },
              {
                revision: 3,
                action: 'CONFIRM',
                after: { confirmation: originalConfirmation },
              },
              { revision: 2, action: 'CORRECT_DRAFT' },
              { revision: 1, action: 'CREATE' },
            ],
            nextCursor: null,
          },
        });
        const beforeReplay = await authorSourceReadEffects(fixture);
        const replay = await authorSourceReceipt(
          await fixture.call(`/payments/${paymentId}/commands`, {
            method: 'POST',
            identity: 'reverser',
            key,
            body,
          }),
          { action: 'REVERSE', revision: 4 },
        );
        expect(replay.body).toEqual(reversed.body);
        expect(await authorSourceReadEffects(fixture)).toEqual(beforeReplay);
      });
    });
  },
);
