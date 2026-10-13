import type { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { ServerClock } from '../clock/server-clock.js';
import {
  createIsolatedPostgresTestDatabase,
  type IsolatedPostgresTestDatabase,
} from '../database/isolated-postgres-test-database.js';
import {
  createPostgresRestTestHarness,
  type PostgresRestTestHarness,
} from '../database/postgres-rest-test-harness.js';

// Synthetic data only. Every Contract here is illustrative and provisional.
const databaseUrl = process.env.TEST_DATABASE_URL;
const withPostgres = databaseUrl ? describe : describe.skip;
const WORKSPACE_ID = '00000000-0000-4000-8000-000000000593';

const OWNER = headersFor('workspace-owner', 'Workspace Owner');
const READER = headersFor('contract-activity-reader', 'Contract Reader');

const CONTEXT = '/company-context-assignments';
const DIRECTOR_CLIENT = '/company-director-client-assignments';
const INTAKE = '/company-commercial-intake-assignments';
const ACTIVITY_READER = '/company-commercial-activity-reader-assignments';
const CONTRACT_PREPARER = '/company-contract-preparer-assignments';
const CONTRACT_APPROVER = '/company-contract-approver-assignments';
const PROJECT = '/company-project-assignments';
const OWNER_ASSIGNMENTS = [
  DIRECTOR_CLIENT,
  '/company-service-catalogue-assignments',
  '/company-pricing-configuration-assignments',
  INTAKE,
  '/company-pricing-user-assignments',
  '/company-offer-preparer-assignments',
  '/company-offer-approver-assignments',
  CONTRACT_PREPARER,
  CONTRACT_APPROVER,
  PROJECT,
  ACTIVITY_READER,
] as const;
/** A complete Contract and linked Project reader. */
const READER_ASSIGNMENTS = [
  CONTEXT,
  DIRECTOR_CLIENT,
  INTAKE,
  ACTIVITY_READER,
  CONTRACT_APPROVER,
  PROJECT,
] as const;

const CONTRACT_ACTIONS = new Set([
  'contract.created',
  'contract_version.created',
  'contract_version.approved',
  'contract_version.rejected',
  'contract_version.signature_recorded',
  'contract_project.linked',
]);

let instant = new Date('2026-09-27T09:00:00.000Z');
const serverClock: ServerClock = { now: () => new Date(instant.getTime()) };

withPostgres('Contract events in the commercial Activity Log REST', () => {
  let database: IsolatedPostgresTestDatabase;
  let harness: PostgresRestTestHarness;
  let origin: string;
  let pool: Pool;

  beforeAll(async () => {
    if (!databaseUrl) throw new Error('TEST_DATABASE_URL is required.');
    database = await createIsolatedPostgresTestDatabase({
      baseDatabaseUrl: databaseUrl,
      namePrefix: 'contract_activity',
    });
    harness = await createPostgresRestTestHarness({
      databaseUrl: database.targetUrl,
      serverClock,
      environment: {
        NODE_ENV: 'test',
        ACCESS_IDENTITY_MODE: 'test',
        ACCESS_BOOTSTRAP_EXTERNAL_PROVIDER: 'deterministic-test',
        ACCESS_BOOTSTRAP_EXTERNAL_SUBJECT: 'workspace-owner',
        ACCESS_BOOTSTRAP_WORKSPACE_ID: WORKSPACE_ID,
        ACCESS_BOOTSTRAP_WORKSPACE_NAME: 'Contract Activity Workspace',
        ACCESS_ACCEPTED_INVITATIONS_JSON: JSON.stringify([
          {
            provider: 'deterministic-test',
            subject: 'contract-activity-reader',
            workspaceId: WORKSPACE_ID,
          },
        ]),
      },
    });
    ({ origin, pool } = harness);
  });

  beforeEach(async () => {
    instant = new Date('2026-09-27T09:00:00.000Z');
    await pool.query(
      'TRUNCATE activity_log_events, workspace_memberships, internal_users, workspaces CASCADE',
    );
  });

  afterAll(async () => {
    await harness?.close();
    await database?.close();
  });

  it('projects a recorded Contract sequence to an authorized reader and nothing to a reader without Contract read', async () => {
    const setup = await preparedCompany();
    const contract = await createdContract(setup, 'sequence');
    const { opportunityId } = contract;
    const v1 = contract.v1;
    const approved1 = tick();
    await approve(setup, contract, v1.id, 1);
    const created2 = tick();
    const v2 = await revise(setup, contract, 2, 'Revised synthetic condition');
    const rejected2 = tick();
    await command(
      OWNER,
      `${contract.base}/versions/${v2.id}/reject`,
      { expectedContractRevision: 3, reason: 'Internal refusal reason' },
      'reject-2',
      setup.companyId,
    );
    const created3 = tick();
    const v3 = await revise(setup, contract, 4, 'Final synthetic condition');
    const approved3 = tick();
    await approve(setup, contract, v3.id, 5);
    const signed3 = tick();
    await sign(setup, contract, v3.id, 6);
    const existing = await project(setup, 'Synthetic existing Project');
    const linked = tick();
    await command(
      OWNER,
      `${contract.base}/projects`,
      { projectId: existing, expectedContractRevision: 7 },
      'link-existing',
      setup.companyId,
    );
    const createdProject = tick();
    const created = record(
      await command(
        OWNER,
        `${contract.base}/projects/create`,
        {
          title: 'Synthetic Contract Project',
          acknowledgedCandidateProjectIds: [existing],
          expectedContractRevision: 8,
        },
        'create-project',
        setup.companyId,
      ),
    );
    const createdProjectId = stringField(record(created.project), 'id');
    const addendumAt = tick();
    const addendum = record(
      await command(
        OWNER,
        `${contract.base}/agreements/${contract.contractId}/addenda`,
        {
          expectedContractRevision: 9,
          changeSummary: 'Hidden synthetic change summary',
          termEndsOn: '2026-12-31',
        },
        'addendum',
        setup.companyId,
      ),
    );
    const owner = await currentActor(OWNER, setup.companyId);

    const page = await activityLog(OWNER, setup.companyId);
    const events = contractEvents(page);
    const target = (
      version: { id: string; versionNumber: number },
      agreement: {
        contractId: string;
        kind: string;
        illustrativeReference: number;
      } = {
        contractId: contract.contractId,
        kind: 'CONTRACT',
        illustrativeReference: contract.illustrativeReference,
      },
    ) => ({
      type: 'contract_version',
      ...agreement,
      contractVersionId: version.id,
      versionNumber: version.versionNumber,
      opportunityId,
      clientRequestId: contract.requestId,
      companyId: setup.companyId,
    });
    const projected = (
      action: string,
      occurredAt: Date,
      projectedTarget: ReturnType<typeof target>,
      metadata: Record<string, unknown> = {},
    ) => ({
      id: expect.any(String),
      action,
      occurredAt: occurredAt.toISOString(),
      actor: {
        internalUserId: owner.internalUserId,
        displayName: 'Workspace Owner',
      },
      target: projectedTarget,
      metadata,
    });
    const addendumTarget = target(
      { id: stringField(record(addendum.version), 'id'), versionNumber: 1 },
      {
        contractId: stringField(addendum, 'id'),
        kind: 'ADDENDUM',
        illustrativeReference: numberField(addendum, 'illustrativeReference'),
      },
    );
    // Newest first inside the existing dated page. A creation records its two
    // events at one server time; they are compared as a set.
    expect(events.slice(2, 11)).toEqual([
      projected('contract_project.linked', createdProject, target(v3), {
        created: true,
        project: {
          projectId: createdProjectId,
          projectTitle: 'Synthetic Contract Project',
        },
      }),
      projected('contract_project.linked', linked, target(v3), {
        created: false,
        project: {
          projectId: existing,
          projectTitle: 'Synthetic existing Project',
        },
      }),
      projected('contract_version.signature_recorded', signed3, target(v3), {
        evidenceKind: 'SIMULATED',
      }),
      projected('contract_version.approved', approved3, target(v3)),
      projected('contract_version.created', created3, target(v3)),
      projected('contract_version.rejected', rejected2, target(v2)),
      projected('contract_version.created', created2, target(v2)),
      projected('contract_version.approved', approved1, target(v1)),
      events[10],
    ]);
    expect(events.slice(0, 2)).toEqual(
      expect.arrayContaining([
        projected('contract.created', addendumAt, addendumTarget),
        projected('contract_version.created', addendumAt, addendumTarget),
      ]),
    );
    // The creation of the main Contract opens its version 1, superseded since.
    expect(events.slice(10)).toHaveLength(2);
    expect(events.slice(10)).toEqual(
      expect.arrayContaining([
        projected('contract.created', contract.createdAt, target(v1)),
        projected('contract_version.created', contract.createdAt, target(v1)),
      ]),
    );
    // project.created stays with the Project owner and is not added here.
    expect(
      page.events.filter((event) => event.action === 'project.created'),
    ).toHaveLength(2);
    const dated = page.events.flatMap((event) =>
      typeof event.occurredAt === 'string' ? [event.occurredAt] : [],
    );
    expect(dated).toEqual([...dated].sort().reverse());
    const serialized = JSON.stringify(events);
    for (const confidential of [
      'Revised synthetic condition',
      'Final synthetic condition',
      'Internal refusal reason',
      'Hidden synthetic change summary',
      'Synthetic provider',
      'Synthetic Client signatory',
      'Synthetic Recipient',
      'SYNTHETIC-593',
      '2026-12-31',
      'pricingSnapshotId',
      'offerVersionId',
      'parentContractId',
      'addendumOrdinal',
      'origin',
      'ruleSetVersion',
      'acknowledgedWarningCodes',
      'predecessorVersionNumber',
      'ILLUSTRATIVE',
      contract.snapshotId,
      contract.acceptedOfferVersionId,
    ])
      expect(serialized).not.toContain(confidential);

    // Every Contract-unrelated bundle, but no Contract read.
    const reader = await preparedReader(
      setup.companyId,
      READER_ASSIGNMENTS.filter((path) => path !== CONTRACT_APPROVER),
    );
    expect(reader.activeCompany.contractPermissions).toBeUndefined();
    const withoutContractRead = await activityLog(READER, setup.companyId);
    expect(contractEvents(withoutContractRead)).toEqual([]);
    expect(withoutContractRead.events.map((event) => event.action)).toEqual(
      expect.arrayContaining([
        'client_request.created',
        'opportunity.created',
        'project.created',
      ]),
    );
    expectUndisclosed(withoutContractRead, contract);
  });

  it('denies every reader lacking part of the Contract or linked Project authority', async () => {
    const setup = await preparedCompany();
    const contract = await linkedContract(setup, 'matrix');
    const reader = await preparedReader(setup.companyId, READER_ASSIGNMENTS);
    expect(reader.activeCompany.contractPermissions).toContain(
      'commercial.contract.read',
    );
    const readerActions = async () =>
      contractEvents(await activityLog(READER, setup.companyId)).map(
        (event) => event.action,
      );
    const complete = [
      'contract_project.linked',
      'contract_version.signature_recorded',
      'contract_version.approved',
      expect.stringMatching(/^contract(_version)?\.created$/u),
      expect.stringMatching(/^contract(_version)?\.created$/u),
    ];
    const withoutLink = complete.slice(1);
    expect(await readerActions()).toEqual(complete);

    // A Contract reader without Project read keeps every other Contract event.
    await revoke(PROJECT, reader.workspaceMembershipId, setup.companyId);
    expect(await readerActions()).toEqual(withoutLink);
    expect(
      JSON.stringify(await activityLog(READER, setup.companyId)),
    ).not.toContain(contract.projectId);
    await grant(PROJECT, reader.workspaceMembershipId, setup.companyId);
    expect(await readerActions()).toEqual(complete);

    // Project read without the Client read of the Project's boundary.
    await revoke(
      DIRECTOR_CLIENT,
      reader.workspaceMembershipId,
      setup.companyId,
    );
    expect(await readerActions()).toEqual(withoutLink);
    expect(
      JSON.stringify(await activityLog(READER, setup.companyId)),
    ).not.toContain(contract.projectId);
    await grant(DIRECTOR_CLIENT, reader.workspaceMembershipId, setup.companyId);
    expect(await readerActions()).toEqual(complete);

    // The Project's original Client no longer related to this Company.
    await pool.query(
      "UPDATE client_company_relationships SET status = 'archived' WHERE client_account_id = $1 AND company_id = $2",
      [setup.clientId, setup.companyId],
    );
    expect(await readerActions()).toEqual(withoutLink);
    expect(
      contractEvents(await activityLog(OWNER, setup.companyId)).map(
        (event) => event.action,
      ),
    ).toEqual(withoutLink);
    await pool.query(
      "UPDATE client_company_relationships SET status = 'active' WHERE client_account_id = $1 AND company_id = $2",
      [setup.clientId, setup.companyId],
    );
    expect(await readerActions()).toEqual(complete);

    // Contract read without Opportunity read.
    await revoke(INTAKE, reader.workspaceMembershipId, setup.companyId);
    const withoutOpportunityRead = await activityLog(READER, setup.companyId);
    expect(contractEvents(withoutOpportunityRead)).toEqual([]);
    expectUndisclosed(withoutOpportunityRead, contract);
    await grant(INTAKE, reader.workspaceMembershipId, setup.companyId);
    expect(await readerActions()).toEqual(complete);

    // Contract and Opportunity read without the commercial Activity bundle.
    await revoke(
      ACTIVITY_READER,
      reader.workspaceMembershipId,
      setup.companyId,
    );
    const withoutActivityRead = await activityLog(READER, setup.companyId);
    expect(contractEvents(withoutActivityRead)).toEqual([]);
    expectUndisclosed(withoutActivityRead, contract);
    await grant(ACTIVITY_READER, reader.workspaceMembershipId, setup.companyId);
    expect(await readerActions()).toEqual(complete);

    // Every bundle in another Company never reaches this Company's Contracts.
    const other = entity(
      await command(
        OWNER,
        '/companies',
        { displayName: 'Other Contract Company' },
        'other-company',
      ),
    );
    for (const path of READER_ASSIGNMENTS)
      await grant(path, reader.workspaceMembershipId, other.id);
    const otherCompany = await activityLog(READER, other.id);
    expect(contractEvents(otherCompany)).toEqual([]);
    expectUndisclosed(otherCompany, contract);
    const withoutCompany = await activityLog(READER);
    expect(contractEvents(withoutCompany)).toEqual([]);
    expectUndisclosed(withoutCompany, contract);

    // A suspended membership reads no history at all.
    await pool.query(
      "UPDATE workspace_memberships SET status = 'inactive' WHERE id = $1",
      [reader.workspaceMembershipId],
    );
    expect(
      (await request('/activity-log', setup.companyId, { headers: READER }))
        .status,
    ).toBe(403);
    await pool.query(
      "UPDATE workspace_memberships SET status = 'active' WHERE id = $1",
      [reader.workspaceMembershipId],
    );
    expect(await readerActions()).toEqual(complete);

    // Revoking the only Contract bundle withdraws the history immediately.
    await revoke(
      CONTRACT_APPROVER,
      reader.workspaceMembershipId,
      setup.companyId,
    );
    const afterRevocation = await activityLog(READER, setup.companyId);
    expect(contractEvents(afterRevocation)).toEqual([]);
    expectUndisclosed(afterRevocation, contract);

    expect((await fetch(`${origin}/api/activity-log`)).status).toBe(401);
  });

  it('omits every event whose Contract, version, owning Opportunity or linked Project cannot be resolved and keeps a resolvable sibling', async () => {
    const setup = await preparedCompany();
    const lostOpportunity = await createdContract(setup, 'lost-opportunity');
    const lostContract = await createdContract(setup, 'lost-contract');
    const lostVersion = await createdContract(setup, 'lost-version');
    await approve(setup, lostVersion, lostVersion.v1.id, 1);
    const keptVersion = await revise(setup, lostVersion, 2, null);
    const sibling = await linkedContract(setup, 'sibling');
    tick();
    const kept = record(
      await command(
        OWNER,
        `${sibling.base}/projects/create`,
        {
          title: 'Synthetic kept Project',
          acknowledgedCandidateProjectIds: [sibling.projectId],
          expectedContractRevision: 4,
        },
        'create-kept-project',
        setup.companyId,
      ),
    );
    const keptProjectId = stringField(record(kept.project), 'id');
    // A complete reader without Offer read keeps every Contract event of the
    // four sequences inside one bounded page.
    await preparedReader(setup.companyId, READER_ASSIGNMENTS);
    const before = contractEvents(await activityLog(READER, setup.companyId));
    expect(before).toHaveLength(2 + 2 + 4 + 6);

    // Integrity forbids these states. The disposable fixture bypasses its
    // triggers and foreign keys to prove the read fails closed regardless.
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET LOCAL session_replication_role = replica');
      await client.query('DELETE FROM opportunities WHERE id = $1', [
        lostOpportunity.opportunityId,
      ]);
      await client.query('DELETE FROM contracts WHERE id = $1', [
        lostContract.contractId,
      ]);
      await client.query('DELETE FROM contract_versions WHERE id = $1', [
        lostVersion.v1.id,
      ]);
      await client.query('DELETE FROM projects WHERE id = $1', [
        sibling.projectId,
      ]);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

    const after = contractEvents(await activityLog(READER, setup.companyId));
    expect(after).toEqual(
      before.filter((event) => {
        const eventTarget = record(event.target);
        if (eventTarget.contractId === sibling.contractId)
          return (
            event.action !== 'contract_project.linked' ||
            record(record(event.metadata).project).projectId === keptProjectId
          );
        return eventTarget.contractVersionId === keptVersion.id;
      }),
    );
    expect(after.map((event) => event.action)).toEqual([
      'contract_project.linked',
      'contract_version.signature_recorded',
      'contract_version.approved',
      expect.stringMatching(/^contract(_version)?\.created$/u),
      expect.stringMatching(/^contract(_version)?\.created$/u),
      'contract_version.created',
    ]);
    const serialized = JSON.stringify(after);
    for (const missing of [lostOpportunity, lostContract])
      for (const identifier of [
        missing.contractId,
        missing.opportunityId,
        missing.requestId,
        missing.v1.id,
      ])
        expect(serialized).not.toContain(identifier);
    expect(serialized).not.toContain(lostVersion.v1.id);
    expect(serialized).not.toContain(sibling.projectId);
  });

  interface PreparedCompany {
    companyId: string;
    clientId: string;
    ruleVersionNumber: number;
    offeringId: string;
    tariffVersionNumber: number;
  }

  interface RecordedContract {
    contractId: string;
    base: string;
    requestId: string;
    opportunityId: string;
    snapshotId: string;
    acceptedOfferVersionId: string;
    illustrativeReference: number;
    createdAt: Date;
    v1: { id: string; versionNumber: number };
  }

  async function preparedCompany(): Promise<PreparedCompany> {
    const company = entity(
      await command(
        OWNER,
        '/companies',
        { displayName: 'Contract Activity Company' },
        `company-${crypto.randomUUID()}`,
      ),
    );
    const owner = await currentActor(OWNER, company.id);
    for (const path of OWNER_ASSIGNMENTS)
      await grant(path, owner.workspaceMembershipId, company.id);
    const client = entity(
      await command(
        OWNER,
        '/clients',
        {
          displayName: 'Synthetic Recipient 593',
          taxId: 'SYNTHETIC-593',
          address: '593 Example Street',
        },
        `client-${crypto.randomUUID()}`,
        company.id,
      ),
    );
    const rule = published(
      await command(
        OWNER,
        '/pricing-configuration/rule-versions',
        {
          label: 'Illustrative rule',
          effectiveFrom: instant.toISOString(),
          expectedActiveVersionNumber: null,
        },
        `rule-${crypto.randomUUID()}`,
        company.id,
      ),
    );
    const definition = entity(
      record(
        await command(
          OWNER,
          '/commercial-catalogue/service-definitions',
          {
            code: 'CONTRACT-593',
            name: 'Synthetic illustrative service',
            description: null,
          },
          `definition-${crypto.randomUUID()}`,
          company.id,
        ),
      ).definition,
    );
    const offering = entity(
      record(
        await command(
          OWNER,
          '/commercial-catalogue/offerings',
          { serviceDefinitionId: definition.id, commercialLabel: null },
          `offering-${crypto.randomUUID()}`,
          company.id,
        ),
      ).offering,
    );
    const tariff = published(
      await command(
        OWNER,
        `/pricing-configuration/offerings/${offering.id}/tariff-versions`,
        {
          unit: 'illustrative-unit',
          unitAmount: '300.0000',
          currency: 'EUR',
          taxRatePercent: '15.00',
          taxLabel: 'Illustrative tax',
          effectiveFrom: instant.toISOString(),
          expectedActiveVersionNumber: null,
        },
        `tariff-${crypto.randomUUID()}`,
        company.id,
      ),
    );
    return {
      companyId: company.id,
      clientId: client.id,
      ruleVersionNumber: rule.versionNumber,
      offeringId: offering.id,
      tariffVersionNumber: tariff.versionNumber,
    };
  }

  /** One Request, its accepted Offer and version 1 of its Contract. */
  async function createdContract(
    setup: PreparedCompany,
    key: string,
  ): Promise<RecordedContract> {
    const intake = record(
      await command(
        OWNER,
        '/commercial-intake/requests',
        {
          originalText: `Synthetic Request for the ${key} Contract history.`,
          sourceLabel: 'Synthetic REST proof',
          subject: `Contract history ${key}`,
          clientAccountId: setup.clientId,
          opportunity: {
            title: `Agree the ${key} Contract`,
            scope: 'Synthetic scope only',
            nextAction: 'Prepare the Contract',
          },
        },
        `request-${key}`,
        setup.companyId,
      ),
    );
    const opportunityId = stringField(record(intake.initialOpportunity), 'id');
    const snapshot = entity(
      await command(
        OWNER,
        `/pricing/opportunities/${opportunityId}/snapshots`,
        {
          pricingRuleVersionNumber: setup.ruleVersionNumber,
          lines: [
            {
              offeringId: setup.offeringId,
              tariffVersionNumber: setup.tariffVersionNumber,
              quantity: '1',
            },
          ],
        },
        `snapshot-${key}`,
        setup.companyId,
      ),
    );
    const offer = record(
      await command(
        OWNER,
        `/offers/opportunities/${opportunityId}`,
        {
          pricingSnapshotId: snapshot.id,
          recipient: { kind: 'PRIMARY' },
          scopeNote: 'Accepted scope',
          commercialConditions: 'Accepted conditions',
        },
        `offer-${key}`,
        setup.companyId,
      ),
    );
    const acceptedOfferVersionId = stringField(record(offer.version), 'id');
    const offerPath = `/offers/opportunities/${opportunityId}/versions/${acceptedOfferVersionId}`;
    await command(
      OWNER,
      `${offerPath}/approve`,
      { expectedOfferRevision: 1, acknowledgedWarningCodes: [] },
      `offer-approve-${key}`,
      setup.companyId,
    );
    await command(
      OWNER,
      `${offerPath}/transmission`,
      { expectedOfferRevision: 2, acknowledgedWarningCodes: [] },
      `offer-transmit-${key}`,
      setup.companyId,
    );
    await command(
      OWNER,
      `${offerPath}/client-response`,
      {
        expectedOfferRevision: 3,
        outcome: 'ACCEPTED',
        receivedAt: instant.toISOString(),
      },
      `offer-accept-${key}`,
      setup.companyId,
    );
    const createdAt = tick();
    const base = `/contracts/opportunities/${opportunityId}`;
    const contract = record(
      await command(
        OWNER,
        base,
        { acceptedOfferVersionId },
        `contract-${key}`,
        setup.companyId,
      ),
    );
    return {
      contractId: stringField(contract, 'id'),
      base,
      requestId: stringField(intake, 'id'),
      opportunityId,
      snapshotId: snapshot.id,
      acceptedOfferVersionId,
      illustrativeReference: numberField(contract, 'illustrativeReference'),
      createdAt,
      v1: { id: stringField(record(contract.version), 'id'), versionNumber: 1 },
    };
  }

  /** Version 1 approved and signed, then linked to an existing Project. */
  async function linkedContract(setup: PreparedCompany, key: string) {
    const contract = await createdContract(setup, key);
    tick();
    await approve(setup, contract, contract.v1.id, 1);
    tick();
    await sign(setup, contract, contract.v1.id, 2);
    const projectId = await project(setup, `Synthetic ${key} Project`);
    tick();
    await command(
      OWNER,
      `${contract.base}/projects`,
      { projectId, expectedContractRevision: 3 },
      `link-${key}`,
      setup.companyId,
    );
    return { ...contract, projectId };
  }

  /** Approves with exactly the current warnings acknowledged. */
  async function approve(
    setup: PreparedCompany,
    contract: RecordedContract,
    versionId: string,
    expectedContractRevision: number,
  ) {
    const path = `${contract.base}/versions/${versionId}`;
    const run = record(
      await command(
        OWNER,
        `${path}/quality-checks`,
        {},
        `check-${versionId}`,
        setup.companyId,
      ),
    );
    const results = run.results;
    if (!Array.isArray(results)) throw new Error('Expected check results.');
    await command(
      OWNER,
      `${path}/approve`,
      {
        expectedContractRevision,
        acknowledgedWarningCodes: results
          .map((result) => record(result))
          .filter((result) => result.status === 'WARNING')
          .map((result) => stringField(result, 'code'))
          .sort(),
      },
      `approve-${versionId}`,
      setup.companyId,
    );
  }

  async function sign(
    setup: PreparedCompany,
    contract: RecordedContract,
    versionId: string,
    expectedContractRevision: number,
  ) {
    await command(
      OWNER,
      `${contract.base}/versions/${versionId}/signature`,
      {
        expectedContractRevision,
        providerSignatoryLabel: 'Synthetic provider',
        clientSignatoryLabel: 'Synthetic Client signatory',
        providerSignedOn: '2026-09-27',
        clientSignedOn: '2026-09-27',
        note: null,
        acknowledgedWarningCodes: [],
      },
      `sign-${versionId}`,
      setup.companyId,
    );
  }

  /** A successor Contract Version; returns its identity from the reread head. */
  async function revise(
    setup: PreparedCompany,
    contract: RecordedContract,
    expectedContractRevision: number,
    specialConditions: string | null,
  ) {
    const result = record(
      await command(
        OWNER,
        `${contract.base}/versions`,
        {
          expectedContractRevision,
          termEndsOn: '2026-12-31',
          specialConditions,
        },
        `revise-${contract.contractId}-${expectedContractRevision}`,
        setup.companyId,
      ),
    );
    const head = record(
      record(await json(await request(contract.base, setup.companyId)))
        .contract,
    );
    const version = record(head.version);
    const versionNumber = numberField(result, 'versionNumber');
    expect(numberField(version, 'versionNumber')).toBe(versionNumber);
    return { id: stringField(version, 'id'), versionNumber };
  }

  async function project(setup: PreparedCompany, title: string) {
    return stringField(
      record(
        await command(
          OWNER,
          '/projects',
          { title, clientAccountId: setup.clientId },
          `project-${crypto.randomUUID()}`,
          setup.companyId,
        ),
      ),
      'id',
    );
  }

  /** A second member holding exactly the given bundles in the Company. */
  async function preparedReader(companyId: string, paths: readonly string[]) {
    const member = await currentActor(READER);
    for (const path of paths)
      await grant(path, member.workspaceMembershipId, companyId);
    const selected = record(
      await json(
        await request('/access/current-actor', companyId, { headers: READER }),
      ),
    );
    return {
      workspaceMembershipId: member.workspaceMembershipId,
      activeCompany: record(selected.activeCompany),
    };
  }

  function tick(): Date {
    instant = new Date(instant.getTime() + 60_000);
    return new Date(instant.getTime());
  }

  async function activityLog(
    headers: Record<string, string>,
    companyId?: string,
  ): Promise<{ events: ProjectedEvent[] }> {
    const response = await request('/activity-log', companyId, { headers });
    expect(response.status).toBe(200);
    return activityPage(await json(response));
  }

  async function currentActor(
    headers: Record<string, string>,
    companyId?: string,
  ) {
    const actor = record(
      await json(
        await request('/access/current-actor', companyId, { headers }),
      ),
    );
    return {
      internalUserId: stringField(actor, 'internalUserId'),
      workspaceMembershipId: stringField(actor, 'workspaceMembershipId'),
    };
  }

  async function grant(
    path: string,
    workspaceMembershipId: string,
    companyId: string,
  ) {
    await command(
      OWNER,
      path,
      { workspaceMembershipId, companyId },
      `grant-${path}-${crypto.randomUUID()}`,
    );
  }

  async function revoke(
    path: string,
    workspaceMembershipId: string,
    companyId: string,
  ) {
    const response = await request(
      `${path}/${workspaceMembershipId}/${companyId}`,
      undefined,
      {
        method: 'DELETE',
        headers: { 'idempotency-key': `revoke-${crypto.randomUUID()}` },
      },
    );
    expect(response.status).toBe(200);
  }

  function request(path: string, companyId?: string, init: RequestInit = {}) {
    return fetch(`${origin}/api${path}`, {
      ...init,
      headers: {
        ...OWNER,
        ...(companyId ? { 'x-company-context-id': companyId } : {}),
        ...Object.fromEntries(new Headers(init.headers).entries()),
      },
    });
  }

  async function command(
    headers: Record<string, string>,
    path: string,
    body: unknown,
    key: string,
    companyId?: string,
  ): Promise<unknown> {
    const response = await request(path, companyId, {
      method: 'POST',
      headers: {
        ...headers,
        'content-type': 'application/json',
        'idempotency-key': key,
      },
      body: JSON.stringify(body),
    });
    const value = await json(response);
    expect(response.status, JSON.stringify({ path, value })).toBe(201);
    return value;
  }
});

interface ProjectedEvent {
  action: string;
  occurredAt?: unknown;
  target?: unknown;
  metadata?: unknown;
  [field: string]: unknown;
}

function activityPage(value: unknown): { events: ProjectedEvent[] } {
  const events = record(value).events;
  if (!Array.isArray(events)) throw new Error('Activity page is missing.');
  return {
    events: events.map((event) => {
      const projected = record(event);
      return { ...projected, action: stringField(projected, 'action') };
    }),
  };
}

function contractEvents(page: { events: ProjectedEvent[] }): ProjectedEvent[] {
  return page.events.filter((event) => CONTRACT_ACTIONS.has(event.action));
}

/** No identifier of the Contract, its versions, Request or Opportunity leaks. */
function expectUndisclosed(
  page: { events: ProjectedEvent[] },
  contract: { contractId: string; v1: { id: string } },
) {
  const serialized = JSON.stringify(page);
  expect(serialized).not.toContain(contract.contractId);
  expect(serialized).not.toContain(contract.v1.id);
  expect(serialized).not.toContain('contract_version');
  expect(serialized).not.toContain('illustrativeReference');
}

function published(value: unknown): { versionNumber: number } {
  const result = record(value);
  expect(result.outcome).toBe('PUBLISHED');
  return {
    versionNumber: numberField(record(result.version), 'versionNumber'),
  };
}

function entity(value: unknown): { id: string } {
  return { id: stringField(record(value), 'id') };
}

async function json(response: Response): Promise<unknown> {
  const body: unknown = await response.json();
  return body;
}

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new Error('Expected an object.');
  return Object.fromEntries(Object.entries(value));
}

function stringField(value: Record<string, unknown>, field: string): string {
  const result = value[field];
  if (typeof result !== 'string') throw new Error(`Expected ${field}.`);
  return result;
}

function numberField(value: Record<string, unknown>, field: string): number {
  const result = value[field];
  if (typeof result !== 'number') throw new Error(`Expected ${field}.`);
  return result;
}

function headersFor(subject: string, displayName: string) {
  return {
    'x-test-external-provider': 'deterministic-test',
    'x-test-external-subject': subject,
    'x-test-display-name': displayName,
    'x-test-email': `${subject}@example.test`,
  };
}
