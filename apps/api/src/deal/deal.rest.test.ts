import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { prepareReportedSigning } from '../contract/reported-contract-signing.test-support.js';
import { openDocumentScannerFixture } from '../documents/document-scanner.test-support.js';
import {
  backendPid,
  waitForBlocked,
} from '../offer/offer-concurrency.test-support.js';
import {
  ESTIMATE_OFFER_OWNER,
  ESTIMATE_OFFER_PREPARER,
  ESTIMATE_OFFER_READER,
  estimateOfferIntent,
  openEstimateOfferFixture,
  responseRecord,
  responseString,
} from '../offer/offer-estimate-preparation.test-support.js';

const withPostgres = process.env.TEST_DATABASE_URL ? describe : describe.skip;

// Synthetic identities, Companies, Clients and prices only.
withPostgres('Deal reads REST', () => {
  let fixture: Awaited<ReturnType<typeof openEstimateOfferFixture>>;
  let scanner: Awaited<ReturnType<typeof openDocumentScannerFixture>>;

  beforeAll(async () => {
    scanner = await openDocumentScannerFixture();
    fixture = await openEstimateOfferFixture({
      scannerEnvironment: scanner.environment,
    });
  });
  beforeEach(async () => {
    await fixture.reset();
    scanner.reset();
  });
  afterAll(async () => {
    await fixture?.close();
    await scanner?.close();
  });

  /**
   * One Opportunity with its Request, an approved Profitability Estimate and a
   * pricing snapshot (Costing), a pending Offer and a pending direct Contract.
   * The preparer reads every commercial owner but no Project, Certification
   * or follow-up owner; the reader holds Commercial Intake and Offer reads only.
   */
  async function dealAtContract() {
    const source = await fixture.prepare();
    await fixture.command({
      path: `/offers/opportunities/${source.opportunityId}/from-approved-estimate`,
      companyId: source.companyId,
      headers: ESTIMATE_OFFER_PREPARER,
      body: estimateOfferIntent(source),
    });
    await fixture.grant({
      path: '/company-contract-preparer-assignments',
      companyId: source.companyId,
      membershipId: source.preparerMembershipId,
    });
    const snapshot = await fixture.illustrativeSnapshot(source);
    const contract = responseRecord(
      await fixture.command({
        path: `/contracts/opportunities/${source.opportunityId}/direct`,
        companyId: source.companyId,
        headers: ESTIMATE_OFFER_PREPARER,
        body: {
          pricingSnapshotId: responseString(snapshot, 'id'),
          recipient: { kind: 'PRIMARY' },
          directReason: 'Synthetic direct agreement',
          scopeNote: 'Synthetic literal scope',
        },
      }),
    );
    return {
      ...source,
      contractId: responseString(contract, 'id'),
      contractVersionId: responseString(responseRecord(contract.version), 'id'),
    };
  }

  async function captureRequest(companyId: string, title: string) {
    const request = responseRecord(
      await fixture.command({
        path: '/commercial-intake/requests',
        companyId,
        headers: ESTIMATE_OFFER_PREPARER,
        body: {
          originalText: 'Synthetic Request with no real customer facts.',
          subject: `Synthetic ${title}`,
          opportunity: { title, nextAction: 'Call the synthetic Client' },
        },
      }),
    );
    return {
      clientRequestId: responseString(request, 'id'),
      opportunityId: responseString(
        responseRecord(request.initialOpportunity),
        'id',
      ),
    };
  }

  async function detail(
    opportunityId: string,
    companyId: string,
    headers = ESTIMATE_OFFER_PREPARER,
  ) {
    return responseRecord(
      await fixture.read({
        path: `/deals/${opportunityId}`,
        companyId,
        headers,
      }),
    );
  }

  function markers(deal: Record<string, unknown>) {
    const stages = deal.stages;
    if (!Array.isArray(stages)) throw new Error('Expected stages.');
    return Object.fromEntries(
      stages.map((stage: unknown) => {
        const view = responseRecord(stage);
        return [responseString(view, 'stage'), responseString(view, 'marker')];
      }),
    );
  }

  it('returns the stage facts and current stage of a deal with a Request, an Offer and a Contract', async () => {
    const source = await dealAtContract();

    const deal = await detail(source.opportunityId, source.companyId);

    expect(deal).toMatchObject({
      opportunityId: source.opportunityId,
      title: 'Synthetic internal Offer',
      subject: 'Synthetic approved-price handoff',
      client: { displayName: 'Synthetic internal Offer Client' },
      status: 'OPEN',
      owner: { workspaceMembershipId: source.preparerMembershipId },
      nextAction: 'Prepare an internal Offer from an approved estimate',
      followUpOn: { readable: false },
      opportunityVersion: 1,
      thread: { kind: 'in_progress', currentStage: 'contract' },
    });
    expect(deal.stages).toEqual([
      expect.objectContaining({ stage: 'request', marker: 'done' }),
      expect.objectContaining({
        stage: 'costing',
        marker: 'done',
        pricingSnapshot: {
          readable: true,
          value: expect.objectContaining({ currency: 'EUR' }),
        },
        profitabilityEstimate: {
          readable: true,
          value: { versionNumber: 1, decision: 'APPROVE' },
        },
      }),
      {
        stage: 'offer',
        marker: 'done',
        offer: expect.objectContaining({
          versionNumber: 1,
          decisionState: 'PENDING',
          transmissionState: 'NOT_TRANSMITTED',
          clientResponseState: 'NONE',
        }),
      },
      {
        stage: 'contract',
        marker: 'current',
        agreements: [
          {
            id: source.contractId,
            kind: 'CONTRACT',
            versionNumber: 1,
            decisionState: 'PENDING',
            executionState: 'NOT_EXECUTED',
          },
        ],
      },
      { stage: 'delivery', marker: 'not_available' },
      { stage: 'closure', marker: 'not_available' },
      { stage: 'collection', marker: 'not_applicable', link: 'not_linked' },
    ]);
  });

  it('marks a stage the actor cannot read as not available whether or not records exist', async () => {
    const source = await dealAtContract();

    const deal = await detail(
      source.opportunityId,
      source.companyId,
      ESTIMATE_OFFER_READER,
    );

    // The reader holds Commercial Intake and Offer reads only: the Costing and
    // Contract records exist but are not available, so the Offer is current.
    expect(deal.thread).toEqual({
      kind: 'in_progress',
      currentStage: 'offer',
    });
    expect(markers(deal)).toEqual({
      request: 'done',
      costing: 'not_available',
      offer: 'current',
      contract: 'not_available',
      delivery: 'not_available',
      closure: 'not_available',
      collection: 'not_applicable',
    });
    const serialized = JSON.stringify(deal);
    expect(serialized).not.toContain(source.contractId);
    expect(serialized).not.toContain('APPROVE"');
  });

  it('answers hidden and missing deals with one identical denial', async () => {
    const source = await dealAtContract();
    const foreign = await fixture.prepare({
      companyDisplayName: 'Synthetic foreign Company',
      clientDisplayName: 'Synthetic foreign Client',
      clientTaxId: 'SYNTHETIC-FOREIGN',
    });
    const bodies = [];
    for (const opportunityId of [
      foreign.opportunityId,
      randomUUID(),
      'not-an-opportunity',
    ]) {
      const response = await fixture.request({
        path: `/deals/${opportunityId}`,
        companyId: source.companyId,
        headers: ESTIMATE_OFFER_PREPARER,
      });
      expect(response.status).toBe(404);
      bodies.push(await response.json());
    }
    expect(bodies[0]).toEqual(bodies[1]);
    expect(bodies[0]).toEqual(bodies[2]);
    expect(JSON.stringify(bodies)).not.toContain('foreign');

    // Without the Commercial Intake read, existing and missing deals get the
    // same refusal before any lookup.
    const refusals = [];
    for (const opportunityId of [source.opportunityId, randomUUID()]) {
      const response = await fixture.request({
        path: `/deals/${opportunityId}`,
        companyId: source.companyId,
        headers: ESTIMATE_OFFER_OWNER,
      });
      refusals.push({ status: response.status, body: await response.json() });
    }
    expect(refusals[0]?.status).toBe(403);
    expect(refusals[0]).toEqual(refusals[1]);
  });

  it("lists the current stage of each deal of the actor's Company only, page by page", async () => {
    const source = await dealAtContract();
    const fresh = await captureRequest(
      source.companyId,
      'Synthetic fresh deal',
    );
    const foreign = await fixture.prepare({
      companyDisplayName: 'Synthetic foreign Company',
      clientDisplayName: 'Synthetic foreign Client',
      clientTaxId: 'SYNTHETIC-FOREIGN',
    });

    const page = responseRecord(
      await fixture.read({
        path: '/deals',
        companyId: source.companyId,
        headers: ESTIMATE_OFFER_PREPARER,
      }),
    );

    expect(page.nextCursor).toBeUndefined();
    expect(page.items).toEqual([
      expect.objectContaining({
        opportunityId: fresh.opportunityId,
        clientRequestId: fresh.clientRequestId,
        title: 'Synthetic fresh deal',
        client: null,
        owner: expect.objectContaining({
          workspaceMembershipId: source.preparerMembershipId,
        }),
        nextAction: 'Call the synthetic Client',
        followUpOn: { readable: false },
        thread: { kind: 'in_progress', currentStage: 'request' },
      }),
      expect.objectContaining({
        opportunityId: source.opportunityId,
        client: expect.objectContaining({
          displayName: 'Synthetic internal Offer Client',
        }),
        thread: { kind: 'in_progress', currentStage: 'contract' },
      }),
    ]);
    expect(JSON.stringify(page)).not.toContain(foreign.opportunityId);

    // The list and the detail apply the same rule to the same readable facts.
    for (const headers of [ESTIMATE_OFFER_PREPARER, ESTIMATE_OFFER_READER]) {
      const rows = responseRecord(
        await fixture.read({
          path: '/deals?limit=1',
          companyId: source.companyId,
          headers,
        }),
      );
      const older = responseRecord(
        await fixture.read({
          path: `/deals?limit=1&cursor=${encodeURIComponent(responseString(rows, 'nextCursor'))}`,
          companyId: source.companyId,
          headers,
        }),
      );
      expect(older.nextCursor).toBeUndefined();
      const [row] = Array.isArray(older.items) ? older.items : [];
      const listed = responseRecord(row);
      const shown = await detail(
        source.opportunityId,
        source.companyId,
        headers,
      );
      expect(listed.opportunityId).toBe(source.opportunityId);
      expect(listed.thread).toEqual(shown.thread);
      expect(listed.lastChangedAt).toBe(shown.lastChangedAt);
    }

    // My open dossiers keep Commercial Intake's view: the reader owns none.
    const mine = responseRecord(
      await fixture.read({
        path: '/deals?view=mine_open',
        companyId: source.companyId,
        headers: ESTIMATE_OFFER_READER,
      }),
    );
    expect(mine.items).toEqual([]);
  });

  it('reads Delivery, Closure and the follow-up date through their own owners', async () => {
    const source = await dealAtContract();
    const path = `/contracts/opportunities/${source.opportunityId}`;
    const versionId = source.contractVersionId;
    for (const grant of [
      '/company-contract-approver-assignments',
      '/company-project-assignments',
    ])
      await fixture.grant({
        path: grant,
        companyId: source.companyId,
        membershipId: source.preparerMembershipId,
      });
    const invoke = (commandPath: string, body: unknown) =>
      fixture.command({
        path: commandPath,
        companyId: source.companyId,
        headers: ESTIMATE_OFFER_PREPARER,
        body,
      });
    await invoke(`${path}/versions/${versionId}/approve`, {
      expectedContractRevision: 1,
      acknowledgedWarningCodes: ['DIRECT_ORIGIN_REVIEWED'],
    });
    await invoke(`${path}/versions/${versionId}/signature`, {
      expectedContractRevision: 2,
      providerSignatoryLabel: 'Synthetic provider',
      clientSignatoryLabel: 'Synthetic Client',
      providerSignedOn: '2026-10-24',
      clientSignedOn: '2026-10-24',
      note: null,
      acknowledgedWarningCodes: [],
    });
    const project = responseRecord(
      await invoke(`${path}/projects/create`, {
        title: 'Synthetic delivery mission',
        expectedContractRevision: 3,
        acknowledgedCandidateProjectIds: [],
      }),
    );
    const projectId = responseString(
      responseRecord(project.project ?? project),
      'id',
    );

    const delivering = await detail(source.opportunityId, source.companyId);
    expect(delivering.thread).toEqual({
      kind: 'in_progress',
      currentStage: 'delivery',
    });
    expect(delivering.stages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          stage: 'contract',
          marker: 'done',
          agreements: [
            expect.objectContaining({
              kind: 'CONTRACT',
              decisionState: 'APPROVED',
              executionState: 'EXECUTED',
            }),
          ],
        }),
        {
          stage: 'delivery',
          marker: 'current',
          projects: [
            {
              id: projectId,
              title: 'Synthetic delivery mission',
              status: 'preparatory',
            },
          ],
        },
        { stage: 'closure', marker: 'not_available' },
      ]),
    );

    for (const grant of [
      '/company-certification-reader-assignments',
      '/company-opportunity-follow-up-coordinator-assignments',
    ])
      await fixture.grant({
        path: grant,
        companyId: source.companyId,
        membershipId: source.preparerMembershipId,
      });
    const readable = await detail(source.opportunityId, source.companyId);
    expect(readable.followUpOn).toEqual({ readable: true, value: null });
    expect(markers(readable)).toMatchObject({
      delivery: 'current',
      closure: 'upcoming',
    });
    const page = responseRecord(
      await fixture.read({
        path: '/deals',
        companyId: source.companyId,
        headers: ESTIMATE_OFFER_PREPARER,
      }),
    );
    expect(page.items).toEqual([
      expect.objectContaining({
        opportunityId: source.opportunityId,
        followUpOn: { readable: true, value: null },
        thread: { kind: 'in_progress', currentStage: 'delivery' },
        lastChangedAt: readable.lastChangedAt,
      }),
    ]);
  });

  it('closes the thread with the Opportunity status instead of a current stage', async () => {
    const source = await fixture.prepare();
    await fixture.grant({
      path: '/company-opportunity-manager-assignments',
      companyId: source.companyId,
      membershipId: source.preparerMembershipId,
    });
    const lost = await fixture.post({
      path: `/commercial-intake/opportunities/${source.opportunityId}/outcome`,
      companyId: source.companyId,
      headers: ESTIMATE_OFFER_PREPARER,
      body: {
        expectedVersion: 1,
        status: 'LOST',
        lossReasonCode: 'COMPETITOR',
        note: 'Synthetic loss',
      },
    });
    expect(lost.status).toBe(200);

    const deal = await detail(source.opportunityId, source.companyId);

    expect(deal.status).toBe('LOST');
    expect(deal.thread).toEqual({ kind: 'closed', status: 'LOST' });
    // Records are done, readable stages without one are not applicable, and
    // the Contract owner still refuses this actor.
    expect(markers(deal)).toEqual({
      request: 'done',
      costing: 'done',
      offer: 'not_applicable',
      contract: 'not_available',
      delivery: 'not_available',
      closure: 'not_available',
      collection: 'not_applicable',
    });
  });

  async function listedRow(
    opportunityId: string,
    companyId: string,
    headers: Readonly<Record<string, string>>,
  ) {
    const page = responseRecord(
      await fixture.read({ path: '/deals', companyId, headers }),
    );
    const rows = Array.isArray(page.items)
      ? page.items.map(responseRecord)
      : [];
    const row = rows.find((item) => item.opportunityId === opportunityId);
    if (!row) throw new Error('Expected the listed deal.');
    return row;
  }

  it("holds each stage owner's grant through the list's presence reads, so a revocation waits for the list", async () => {
    const source = await dealAtContract();
    const barrier = await fixture.pool.connect();
    const pending: Promise<unknown>[] = [];
    try {
      await barrier.query('BEGIN');
      const pid = await backendPid(barrier);
      // Pins the list at its Contract presence query, after its readability
      // checks and before it reads whether a Contract exists.
      await barrier.query(
        'LOCK TABLE contract_versions IN ACCESS EXCLUSIVE MODE',
      );
      const listing = fixture.request({
        path: '/deals',
        companyId: source.companyId,
        headers: ESTIMATE_OFFER_PREPARER,
      });
      pending.push(listing);
      await waitForBlocked(fixture.pool, pid);
      // Another session revokes the actor's only Contract read meanwhile.
      const revocation = fixture.pool.query(
        "UPDATE company_role_assignments SET revoked_at=now() WHERE company_id=$1 AND workspace_membership_id=$2 AND bundle='company_contract_preparer' AND revoked_at IS NULL",
        [source.companyId, source.preparerMembershipId],
      );
      pending.push(revocation);
      const queued = waitForBlocked(fixture.pool, pid, 2);
      pending.push(queued);
      const order = await Promise.race([
        revocation.then(() => 'revoked during the list'),
        queued.then(() => 'revocation waits for the list'),
      ]);
      await barrier.query('COMMIT');
      const response = await listing;
      expect(response.status).toBe(200);
      const page = responseRecord(await response.json());
      const [row] = Array.isArray(page.items) ? page.items : [];

      // The list read the Contract under a grant it held to the end, so the
      // revocation is ordered after it.
      expect({ order, thread: responseRecord(row).thread }).toEqual({
        order: 'revocation waits for the list',
        thread: { kind: 'in_progress', currentStage: 'contract' },
      });
      await revocation;
      const revoked = await listedRow(
        source.opportunityId,
        source.companyId,
        ESTIMATE_OFFER_PREPARER,
      );
      expect(revoked.thread).toEqual({
        kind: 'in_progress',
        currentStage: 'offer',
      });
    } finally {
      await barrier.query('ROLLBACK').catch(() => undefined);
      barrier.release();
      await Promise.allSettled(pending);
    }
  }, 30_000);

  it('counts an executed Company-model Contract only for an actor who also reads Clients', async () => {
    const signing = await prepareReportedSigning(fixture);
    await fixture.command({
      ...signing.target,
      path: signing.path,
      body: signing.body,
    });
    const source = signing.f.ready.source;
    // The reader now holds the Contract read but no Client read, which the
    // Contract owner also requires for an executed Company-model Contract.
    await fixture.grant({
      path: '/company-contract-preparer-assignments',
      companyId: source.companyId,
      membershipId: source.readerMembershipId,
    });

    const preparer = await detail(source.opportunityId, source.companyId);
    expect(markers(preparer).contract).toBe('current');
    const reader = await detail(
      source.opportunityId,
      source.companyId,
      ESTIMATE_OFFER_READER,
    );
    expect(markers(reader)).toMatchObject({
      offer: 'current',
      contract: 'not_available',
    });
    expect(JSON.stringify(reader)).not.toContain(signing.f.contractId);

    // The list counts that Contract only where its owner shows it, so the
    // reader's row is the one of a deal without a readable Contract.
    const sameAsDetail = async (
      headers: Readonly<Record<string, string>>,
      shown: Record<string, unknown>,
    ) => {
      const row = await listedRow(
        source.opportunityId,
        source.companyId,
        headers,
      );
      expect({
        thread: row.thread,
        lastChangedAt: row.lastChangedAt,
      }).toEqual({
        thread: shown.thread,
        lastChangedAt: shown.lastChangedAt,
      });
    };
    await sameAsDetail(ESTIMATE_OFFER_PREPARER, preparer);
    await sameAsDetail(ESTIMATE_OFFER_READER, reader);

    // With Client read but its reference Client no longer readable, the
    // Contract owner refuses the Contract with 404: the stage is not
    // available and the rest of the deal is still read.
    await fixture.pool.query(
      "UPDATE client_company_relationships SET status='archived' WHERE company_id=$1 AND client_account_id=$2",
      [source.companyId, source.clientId],
    );
    const archived = await detail(source.opportunityId, source.companyId);
    expect(archived.thread).toEqual({
      kind: 'in_progress',
      currentStage: 'offer',
    });
    expect(markers(archived).contract).toBe('not_available');
    await sameAsDetail(ESTIMATE_OFFER_PREPARER, archived);
  }, 60_000);
});
