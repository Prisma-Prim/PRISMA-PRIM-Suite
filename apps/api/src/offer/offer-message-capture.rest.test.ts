import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  ESTIMATE_OFFER_OWNER,
  ESTIMATE_OFFER_READER,
  ESTIMATE_OFFER_WORKSPACE,
  openEstimateOfferFixture,
  responseRecord,
  responseString,
} from './offer-estimate-preparation.test-support.js';
import { prepareGeneratedOfferWorkflow } from './offer-model-generation.test-fixture.js';
import {
  currentMessageCapture,
  readMessageOffer,
  revokeMessageGrant,
} from './offer-message-proof.test-support.js';
import { snapshotOfferMessageState } from './offer-message-snapshot.test-support.js';

const withPostgres = process.env.TEST_DATABASE_URL ? describe : describe.skip;
withPostgres('Consumed exact Offer message read authority public REST', () => {
  let fixture: Awaited<ReturnType<typeof openEstimateOfferFixture>>;
  beforeAll(async () => {
    // This family deliberately exercises native identity-profile synchronization.
    fixture = await openEstimateOfferFixture();
  });
  beforeEach(async () => {
    await fixture.reset();
  });
  afterAll(async () => {
    await fixture?.close();
  });

  it('ignores unrelated Client, Date/Invoice, model and economic grants and observes the current display name', async () => {
    const ready = await prepareGeneratedOfferWorkflow(fixture, 'PENDING');
    const initial = await currentMessageCapture(
      fixture,
      ready.source.companyId,
    );
    const paths = [
      '/company-director-client-assignments',
      '/company-invoice-reader-assignments',
      '/company-external-invoice-access-assignments',
      '/company-profitability-contributor-assignments',
      '/company-offer-model-editor-assignments',
    ];
    for (const path of paths) {
      await fixture.grant({
        path,
        companyId: ready.source.companyId,
        membershipId: ready.source.readerMembershipId,
      });
      expect(
        (await currentMessageCapture(fixture, ready.source.companyId)).capture,
      ).toBe(initial.capture);
    }
    const currentHeaders = {
      ...ESTIMATE_OFFER_READER,
      'x-test-display-name': 'Current literal actor 1043',
    };
    const current = await currentMessageCapture(
      fixture,
      ready.source.companyId,
      currentHeaders,
    );
    expect(current.capture).toBe(initial.capture);
    expect(current.actor.displayName).toBe('Current literal actor 1043');
    const exact = await readMessageOffer(fixture, {
      base: ready.base,
      companyId: ready.source.companyId,
    });
    // readMessageOffer's own native observation used the original profile; refresh deliberately.
    await currentMessageCapture(
      fixture,
      ready.source.companyId,
      currentHeaders,
    );
    const before = await snapshotOfferMessageState(
      fixture.pool,
      ESTIMATE_OFFER_WORKSPACE,
    );
    const response = await fixture.request({
      path: `${ready.base}/message-preparation?sourceHtmlSha256=${exact.digest}`,
      companyId: ready.source.companyId,
      headers: currentHeaders,
    });
    expect(response.status).toBe(200);
    expect(responseRecord(await response.json())).toMatchObject({
      readCapture: initial.capture,
      actor: {
        workspaceMembershipId: ready.source.readerMembershipId,
        displayName: 'Current literal actor 1043',
      },
    });
    const after = await snapshotOfferMessageState(
      fixture.pool,
      ESTIMATE_OFFER_WORKSPACE,
    );
    expect(after.business).toEqual(before.business);
    expect(after.identityProfiles.length).toBe(before.identityProfiles.length);
    for (const path of paths) {
      await revokeMessageGrant(fixture, {
        path,
        companyId: ready.source.companyId,
        membershipId: ready.source.readerMembershipId,
      });
      expect(
        (await currentMessageCapture(fixture, ready.source.companyId)).capture,
      ).toBe(initial.capture);
    }
  });

  it('consumes Preparer before Approver and changes on equal-permission replacement of only the selected reader', async () => {
    const ready = await prepareGeneratedOfferWorkflow(fixture, 'PENDING');
    const companyId = ready.source.companyId;
    const membershipId = ready.source.readerMembershipId;
    const approver = (await currentMessageCapture(fixture, companyId)).capture;
    const preparerPath = '/company-offer-preparer-assignments';
    const approverPath = '/company-offer-approver-assignments';
    await fixture.grant({ path: preparerPath, companyId, membershipId });
    const preparer = (await currentMessageCapture(fixture, companyId)).capture;
    expect(preparer).not.toBe(approver);
    await revokeMessageGrant(fixture, {
      path: approverPath,
      companyId,
      membershipId,
    });
    await fixture.grant({ path: approverPath, companyId, membershipId });
    expect((await currentMessageCapture(fixture, companyId)).capture).toBe(
      preparer,
    );
    await revokeMessageGrant(fixture, {
      path: preparerPath,
      companyId,
      membershipId,
    });
    const replacementApprover = (
      await currentMessageCapture(fixture, companyId)
    ).capture;
    expect(replacementApprover).not.toBe(approver);
    expect(replacementApprover).not.toBe(preparer);
    await fixture.grant({ path: preparerPath, companyId, membershipId });
    const replacementPreparer = (
      await currentMessageCapture(fixture, companyId)
    ).capture;
    expect(replacementPreparer).not.toBe(preparer);
    const exact = await readMessageOffer(fixture, {
      base: ready.base,
      companyId,
    });
    const response = await fixture.request({
      path: `${ready.base}/message-preparation?sourceHtmlSha256=${exact.digest}`,
      companyId,
      headers: ESTIMATE_OFFER_READER,
    });
    expect(response.status).toBe(200);
    expect(responseRecord(await response.json()).readCapture).toBe(
      replacementPreparer,
    );
  });

  it('consumes unversioned Context Access before native Project Access and excludes nonselected replacement', async () => {
    const ready = await prepareGeneratedOfferWorkflow(fixture, 'PENDING');
    const companyId = ready.source.companyId;
    const membershipId = ready.source.readerMembershipId;
    const contextPath = '/company-context-assignments';
    const projectPath = '/company-project-assignments';
    const context = (await currentMessageCapture(fixture, companyId)).capture;
    const granted = responseRecord(
      await fixture.grant({ path: projectPath, companyId, membershipId }),
    );
    expect(granted.permissionSetVersion).toBe('v2');
    expect((await currentMessageCapture(fixture, companyId)).capture).toBe(
      context,
    );
    await revokeMessageGrant(fixture, {
      path: projectPath,
      companyId,
      membershipId,
    });
    await fixture.grant({ path: projectPath, companyId, membershipId });
    expect((await currentMessageCapture(fixture, companyId)).capture).toBe(
      context,
    );
    await revokeMessageGrant(fixture, {
      path: contextPath,
      companyId,
      membershipId,
    });
    const project = (await currentMessageCapture(fixture, companyId)).capture;
    expect(project).not.toBe(context);
    const restored = responseRecord(
      await fixture.grant({ path: contextPath, companyId, membershipId }),
    );
    expect(restored.permissionSetVersion ?? null).toBeNull();
    const replacementContext = (await currentMessageCapture(fixture, companyId))
      .capture;
    expect(replacementContext).not.toBe(context);
    expect(replacementContext).not.toBe(project);
    await revokeMessageGrant(fixture, {
      path: projectPath,
      companyId,
      membershipId,
    });
    expect((await currentMessageCapture(fixture, companyId)).capture).toBe(
      replacementContext,
    );
  });

  it('prefers the live company.manage grant to replaceable Company context alternatives', async () => {
    const ready = await prepareGeneratedOfferWorkflow(fixture, 'PENDING');
    const owner = responseRecord(
      await fixture.read({ path: '/access/current-actor' }),
    );
    const membershipId = responseString(owner, 'workspaceMembershipId');
    const companyId = ready.source.companyId;
    for (const path of [
      '/company-commercial-intake-assignments',
      '/company-offer-approver-assignments',
    ])
      await fixture.grant({ path, companyId, membershipId });
    const manager = (
      await currentMessageCapture(fixture, companyId, ESTIMATE_OFFER_OWNER)
    ).capture;
    for (const path of [
      '/company-context-assignments',
      '/company-project-assignments',
    ]) {
      await fixture.grant({ path, companyId, membershipId });
      expect(
        (await currentMessageCapture(fixture, companyId, ESTIMATE_OFFER_OWNER))
          .capture,
      ).toBe(manager);
      await revokeMessageGrant(fixture, { path, companyId, membershipId });
      await fixture.grant({ path, companyId, membershipId });
      expect(
        (await currentMessageCapture(fixture, companyId, ESTIMATE_OFFER_OWNER))
          .capture,
      ).toBe(manager);
    }
  });

  it('replaces the consumed Intake capture even while all Offer permissions remain identical', async () => {
    const ready = await prepareGeneratedOfferWorkflow(fixture, 'PENDING');
    const companyId = ready.source.companyId;
    const membershipId = ready.source.readerMembershipId;
    const before = await currentMessageCapture(fixture, companyId);
    const path = '/company-commercial-intake-assignments';
    await revokeMessageGrant(fixture, { path, companyId, membershipId });
    await fixture.grant({ path, companyId, membershipId });
    const after = await currentMessageCapture(fixture, companyId);
    expect(after.capture).not.toBe(before.capture);
    expect(responseRecord(after.actor.activeCompany).offerPermissions).toEqual(
      responseRecord(before.actor.activeCompany).offerPermissions,
    );
  });
});
