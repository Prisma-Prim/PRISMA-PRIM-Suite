import { randomUUID } from 'node:crypto';
import { IncomingMessage } from 'node:http';
import { Socket } from 'node:net';
import { ForbiddenException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { PoolClient } from 'pg';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest';
import { AppModule } from '../app.module.js';
import {
  AccessService,
  SYNCHRONIZE_ACCESS_IDENTITY_PROFILE,
} from '../access/access.service.js';
import type {
  ActorContext,
  ActiveCompanyContext,
} from '../access/access.types.js';
import { DATABASE } from '../database/database.constants.js';
import { revokeModelContractFixtureGrant } from '../contract/model-contract.test-fixture.js';
import {
  backendPid,
  waitForBlocked,
} from '../offer/offer-concurrency.test-support.js';
import {
  ESTIMATE_OFFER_PREPARER,
  ESTIMATE_OFFER_WORKSPACE,
  openEstimateOfferFixture,
  responseRecord,
  responseString,
} from '../offer/offer-estimate-preparation.test-support.js';
import { DocumentContentService } from './document-content.service.js';
import { DocumentsService } from './documents.service.js';
import { openDocumentScannerFixture } from './document-scanner.test-support.js';
import {
  fictionalAddendumPdf,
  prepareReceivedAddendumParent,
} from './received-addendum.test-support.js';

const withPostgres = process.env.TEST_DATABASE_URL ? describe : describe.skip;
withPostgres('Received Addendum exact captured parent authority', () => {
  let fixture: Awaited<ReturnType<typeof openEstimateOfferFixture>>;
  let scanner: Awaited<ReturnType<typeof openDocumentScannerFixture>>;
  let parent: Awaited<ReturnType<typeof prepareReceivedAddendumParent>>;
  let module: TestingModule;
  let documents: DocumentsService;
  let content: DocumentContentService;
  let access: AccessService;
  let documentId: string, versionId: string, registrationKey: string;
  let bytes: Buffer;

  beforeAll(async () => {
    scanner = await openDocumentScannerFixture();
    fixture = await openEstimateOfferFixture({
      scannerEnvironment: scanner.environment,
      synchronizeIdentityProfile: false,
    });
    // The real public owners share the fixture's isolated PostgreSQL database.
    // Direct public calls preserve the Actor captured before a native replacement;
    // a later HTTP request would instead resolve a different, fresh Actor.
    module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(DATABASE)
      .useValue(drizzle(fixture.pool))
      .overrideProvider(SYNCHRONIZE_ACCESS_IDENTITY_PROFILE)
      .useValue(false)
      .compile();
    access = module.get(AccessService);
    documents = module.get(DocumentsService);
    content = module.get(DocumentContentService);
    bytes = await fictionalAddendumPdf('Exact captured parent authority');
  });
  beforeEach(async () => {
    await fixture.reset();
    scanner.reset();
    parent = await prepareReceivedAddendumParent(fixture);
    await revoke('/company-contract-approver-assignments');
    registrationKey = randomUUID();
    const saved = await parent.register(registrationKey);
    expect(saved.status, await saved.clone().text()).toBe(201);
    const document = responseRecord(await saved.json());
    documentId = responseString(document, 'id');
    versionId = responseString(responseRecord(document.version), 'id');
    const uploaded = await parent.call(
      `/documents/${documentId}/versions/${versionId}/content?expectedRevision=1&fileName=fictional-addendum.pdf`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/pdf',
          'idempotency-key': randomUUID(),
        },
        body: new Uint8Array(bytes),
      },
    );
    expect(uploaded.status, await uploaded.clone().text()).toBe(201);
  });
  afterAll(async () => {
    await module?.close();
    await fixture?.close();
    await scanner?.close();
  });

  const actor = () =>
    access.resolveActor(
      {
        provider: responseString(
          ESTIMATE_OFFER_PREPARER,
          'x-test-external-provider',
        ),
        subject: responseString(
          ESTIMATE_OFFER_PREPARER,
          'x-test-external-subject',
        ),
        displayName: responseString(
          ESTIMATE_OFFER_PREPARER,
          'x-test-display-name',
        ),
        email: responseString(ESTIMATE_OFFER_PREPARER, 'x-test-email'),
      },
      {
        companyId: parent.target.companyId,
        workspaceId: ESTIMATE_OFFER_WORKSPACE,
      },
    );
  const revoke = (path: string) =>
    revokeModelContractFixtureGrant(
      fixture,
      path,
      parent.target.companyId,
      parent.ready.source.preparerMembershipId,
    );
  const grant = (path: string) =>
    fixture.grant({
      path,
      companyId: parent.target.companyId,
      membershipId: parent.ready.source.preparerMembershipId,
    });

  async function configureLegacyReadCapture(bundle: string, version: string) {
    // Configured synthetic legacy assignment, following Access administration's
    // owned legacy fixture convention. This is a fresh row for a real native
    // member/Company, never a rewritten grant or claimed historical command.
    const inserted = await fixture.pool.query<{ id: string }>(
      `INSERT INTO company_role_assignments
      (workspace_id,company_id,workspace_membership_id,bundle,permission_set_version)
      VALUES ($1,$2,$3,$4::company_role_bundle,$5) RETURNING id`,
      [
        ESTIMATE_OFFER_WORKSPACE,
        parent.target.companyId,
        parent.ready.source.preparerMembershipId,
        bundle,
        version,
      ],
    );
    const id = inserted.rows[0]?.id;
    if (!id)
      throw new Error('The configured legacy assignment identity is required.');
    return id;
  }

  async function facts() {
    const result: Record<string, unknown> = {};
    // Closed literal table set: conservation evidence, never grant setup.
    for (const table of [
      'working_documents',
      'received_addendum_document_relations',
      'document_versions',
      'document_pdfs',
      'document_version_commands',
      'document_correction_commands',
      'document_registration_events',
      'activity_log_events',
      'client_accounts',
      'contracts',
      'contract_versions',
      'contract_signing_declarations',
      'contract_commands',
    ]) {
      result[table] = (
        await fixture.pool.query<{ facts: unknown }>(
          `SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]'::jsonb) facts FROM ${table} t`,
        )
      ).rows[0]?.facts;
    }
    result.documentActivity = (
      await fixture.pool.query<{ facts: unknown }>(
        "SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]'::jsonb) facts FROM activity_log_events t WHERE action::text LIKE 'document.%'",
      )
    ).rows[0]?.facts;
    return result;
  }

  async function expectSourceDenied(captured: ActorContext) {
    const before = await facts();
    await expect(
      documents.receivedAddendumSources(captured, {}),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      documents.register(captured, parent.body, randomUUID()),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      documents.register(captured, parent.body, registrationKey),
    ).rejects.toBeInstanceOf(ForbiddenException);
    const metadata = await documents.detail(captured, documentId);
    expect(metadata).toMatchObject({
      id: documentId,
      title: parent.body.title,
    });
    if (metadata.type !== 'received-addendum')
      throw new Error('The native received Addendum is required.');
    expect(metadata.receivedAddendumRelation).toEqual({ access: 'denied' });
    expect(metadata).not.toHaveProperty('createdAt');
    expect(metadata).not.toHaveProperty('createdByMembershipId');
    expect(
      (await content.download(captured, { documentId, versionId })).bytes,
    ).toEqual(bytes);
    expect(
      (await content.history(captured, { documentId, versionId, query: {} }))
        .uploads,
    ).toHaveLength(1);
    expect(await facts()).toEqual(before);
  }

  describe('native equal-permission Contract replacement', () => {
    let captured: ActorContext, fresh: ActorContext;
    let choices: Awaited<
      ReturnType<DocumentsService['receivedAddendumSources']>
    >;
    beforeEach(async () => {
      captured = await actor();
      choices = await documents.receivedAddendumSources(captured, {});
      await revoke('/company-contract-preparer-assignments');
      await grant('/company-contract-preparer-assignments');
      fresh = await actor();
    });
    it('retires the old native Actor while a fresh Actor still selects the exact parent', async () => {
      expect(choices.sources).toContainEqual(
        expect.objectContaining({
          parentContractId: parent.parentContractId,
          parentContractVersionId: parent.parentContractVersionId,
        }),
      );
      expect(fresh.activeCompany?.contractPermissionAssignmentId).not.toBe(
        captured.activeCompany?.contractPermissionAssignmentId,
      );
      expect(fresh.activeCompany?.contractPermissions).toEqual(
        captured.activeCompany?.contractPermissions,
      );
      expect(
        (await documents.receivedAddendumSources(fresh, {})).sources,
      ).toEqual(choices.sources);
      await expectSourceDenied(captured);
    });
  });

  it.each(['Approver', 'Intake', 'uncaptured alternative'])(
    'denies old captured source work after native %s replacement without denying independent native content',
    async (change) => {
      if (change === 'Approver') {
        await grant('/company-contract-approver-assignments');
        await revoke('/company-contract-preparer-assignments');
      }
      const captured = await actor();
      const before = await documents.receivedAddendumSources(captured, {});
      const path =
        change === 'Intake'
          ? '/company-commercial-intake-assignments'
          : change === 'Approver'
            ? '/company-contract-approver-assignments'
            : '/company-contract-preparer-assignments';
      await revoke(path);
      await grant(
        change === 'uncaptured alternative'
          ? '/company-contract-approver-assignments'
          : path,
      );
      const fresh = await actor();
      expect(
        (await documents.receivedAddendumSources(fresh, {})).sources,
      ).toEqual(before.sources);
      await expectSourceDenied(captured);
    },
  );

  it('retains an independently captured live Contract alternative after the other exact assignment is replaced', async () => {
    await grant('/company-contract-approver-assignments');
    const captured = await actor();
    await revoke('/company-contract-preparer-assignments');
    await grant('/company-contract-preparer-assignments');
    expect(
      (await documents.receivedAddendumSources(captured, {})).sources,
    ).toContainEqual(
      expect.objectContaining({
        parentContractVersionId: parent.parentContractVersionId,
      }),
    );
    expect(
      await documents.register(captured, parent.body, registrationKey),
    ).toMatchObject({ id: documentId });
  });

  const invalidCaptures: Array<{
    label: string;
    change: (company: ActiveCompanyContext) => ActiveCompanyContext;
  }> = [
    {
      label: 'missing Contract ID',
      change: (c) => ({ ...c, contractPermissionAssignmentId: undefined }),
    },
    {
      label: 'malformed Contract ID',
      change: (c) => ({ ...c, contractPermissionAssignmentId: 'malformed' }),
    },
    {
      label: 'uncaptured Contract ID',
      change: (c) => ({ ...c, contractPermissionAssignmentId: randomUUID() }),
    },
    {
      label: 'wrong supported Contract version',
      change: (c) => ({ ...c, contractPermissionSetVersion: 'v1' }),
    },
    {
      label: 'missing Contract version',
      change: (c) => ({ ...c, contractPermissionSetVersion: undefined }),
    },
    {
      label: 'missing Intake ID',
      change: (c) => ({
        ...c,
        commercialIntakePermissionAssignmentId: undefined,
      }),
    },
    {
      label: 'malformed Intake ID',
      change: (c) => ({
        ...c,
        commercialIntakePermissionAssignmentId: 'malformed',
      }),
    },
    {
      label: 'uncaptured Intake ID',
      change: (c) => ({
        ...c,
        commercialIntakePermissionAssignmentId: randomUUID(),
      }),
    },
    ...(
      ['v1', 'v2', 'v3'] satisfies Array<
        ActiveCompanyContext['commercialIntakePermissionSetVersion']
      >
    ).map((version) => ({
      label: `wrong supported Intake ${version}`,
      change: (c: ActiveCompanyContext) => ({
        ...c,
        commercialIntakePermissionSetVersion: version,
      }),
    })),
    {
      label: 'missing Intake version',
      change: (c) => ({
        ...c,
        commercialIntakePermissionSetVersion: undefined,
      }),
    },
    {
      label: 'Contract read flag absent',
      change: (c) => ({ ...c, contractPermissions: [] }),
    },
    {
      label: 'Request read flag absent',
      change: (c) => ({
        ...c,
        commercialIntakePermissions: ['commercial.opportunity.read'],
      }),
    },
    {
      label: 'Opportunity read flag absent',
      change: (c) => ({
        ...c,
        commercialIntakePermissions: ['commercial.request.read'],
      }),
    },
  ];
  it.each(invalidCaptures)(
    'denies $label while real captures remain independently usable',
    async ({ change }) => {
      const captured = await actor();
      if (!captured.activeCompany)
        throw new Error('A native active Company is required.');
      await expectSourceDenied({
        ...captured,
        activeCompany: change(captured.activeCompany),
      });
      expect(
        (await documents.receivedAddendumSources(captured, {})).sources,
      ).toHaveLength(1);
    },
  );

  it.each(['Contract', 'Intake'])(
    'rejects null and unrecognized %s capture versions at the public native boundary',
    async (kind) => {
      for (const value of [null, 'v99']) {
        const captured = await actor();
        if (!captured.activeCompany)
          throw new Error('A native active Company is required.');
        // Deliberately malformed external values exercise runtime guards without a cast.
        Object.defineProperty(
          captured.activeCompany,
          kind === 'Contract'
            ? 'contractPermissionSetVersion'
            : 'commercialIntakePermissionSetVersion',
          { value },
        );
        await expectSourceDenied(captured);
      }
    },
  );

  it('does not turn Early Preparation into Contract read even when an untrusted Actor claims the read flag', async () => {
    await grant('/company-contract-early-preparation-assignments');
    await revoke('/company-contract-preparer-assignments');
    const captured = await actor();
    if (!captured.activeCompany)
      throw new Error('A native active Company is required.');
    expect(captured.activeCompany.contractEarlyPreparationAssignmentId).toEqual(
      expect.any(String),
    );
    expect(captured.activeCompany.contractPermissions).not.toContain(
      'commercial.contract.read',
    );
    await expectSourceDenied(captured);
    await expectSourceDenied({
      ...captured,
      activeCompany: {
        ...captured.activeCompany,
        contractPermissions: ['commercial.contract.read'],
      },
    });
  });

  const contractVersions: Array<{
    kind: 'Preparer' | 'Approver';
    version: 'v1' | 'v2';
  }> = [
    { kind: 'Preparer', version: 'v1' },
    { kind: 'Preparer', version: 'v2' },
    { kind: 'Approver', version: 'v1' },
    { kind: 'Approver', version: 'v2' },
  ];
  describe.each(
    contractVersions.flatMap((contract) =>
      ['v1', 'v2', 'v3', 'v4'].map((intake) => ({ contract, intake })),
    ),
  )(
    'configured captured Contract $contract.kind $contract.version / Intake $intake',
    ({ contract, intake }) => {
      let captured: ActorContext;
      let contractAssignmentId: string, intakeAssignmentId: string;
      beforeEach(async () => {
        const original = await actor();
        const originalIntake =
          original.activeCompany?.commercialIntakePermissionAssignmentId;
        if (!originalIntake)
          throw new Error('The native Intake assignment is required.');
        intakeAssignmentId = originalIntake;
        await revoke('/company-contract-preparer-assignments');
        const path =
          contract.kind === 'Preparer'
            ? '/company-contract-preparer-assignments'
            : '/company-contract-approver-assignments';
        if (contract.version === 'v2')
          contractAssignmentId = responseString(
            responseRecord(await grant(path)),
            'id',
          );
        else
          contractAssignmentId = await configureLegacyReadCapture(
            contract.kind === 'Preparer'
              ? 'company_contract_preparer'
              : 'company_contract_approver',
            'v1',
          );
        if (intake !== 'v4') {
          await revoke('/company-commercial-intake-assignments');
          intakeAssignmentId = await configureLegacyReadCapture(
            'company_commercial_intake',
            intake,
          );
        }
        captured = await actor();
      });
      it('reads, replays and registers using real Access-resolved exact supported captures', async () => {
        expect(
          captured.activeCompany?.commercialIntakePermissionAssignmentId,
        ).toBe(intakeAssignmentId);
        expect(
          contract.kind === 'Preparer'
            ? captured.activeCompany?.contractPermissionAssignmentId
            : captured.activeCompany?.contractApproverAssignmentId,
        ).toBe(contractAssignmentId);
        expect(
          captured.activeCompany?.commercialIntakePermissionSetVersion,
        ).toBe(intake);
        expect(
          contract.kind === 'Preparer'
            ? captured.activeCompany?.contractPermissionSetVersion
            : captured.activeCompany?.contractApproverPermissionSetVersion,
        ).toBe(contract.version);
        const before = await facts();
        expect(
          (await documents.receivedAddendumSources(captured, {})).sources,
        ).toContainEqual(
          expect.objectContaining({
            parentContractVersionId: parent.parentContractVersionId,
          }),
        );
        expect(
          await documents.register(captured, parent.body, registrationKey),
        ).toMatchObject({ id: documentId });
        expect(await documents.detail(captured, documentId)).toMatchObject({
          receivedAddendumRelation: { access: 'granted' },
        });
        expect(
          (await content.download(captured, { documentId, versionId })).bytes,
        ).toEqual(bytes);
        expect(await facts()).toEqual(before);
        const saved = await documents.register(
          captured,
          parent.body,
          randomUUID(),
        );
        expect(saved).toMatchObject({
          type: 'received-addendum',
          receivedAddendumRelation: {
            access: 'granted',
            parentContractVersionId: parent.parentContractVersionId,
          },
        });
      });
    },
  );

  describe.each(['Preparer', 'Approver', 'Intake'])(
    'deterministic %s captured-grant ordering',
    (kind) => {
      describe.each([false, true])(
        'registration acquires authority first: %s',
        (registrationFirst) => {
          type Outcome =
            | {
                kind: 'saved';
                document: Awaited<ReturnType<DocumentsService['register']>>;
              }
            | { kind: 'refused'; error: unknown };
          let captured: ActorContext;
          let barrier: PoolClient | undefined;
          let registration: Promise<Outcome> | undefined;
          let revocation: ReturnType<typeof revoke> | undefined;
          let path: string, key: string;
          let before: Awaited<ReturnType<typeof facts>>;
          let triggerCreated: boolean;
          async function register(): Promise<Outcome> {
            try {
              return {
                kind: 'saved',
                document: await documents.register(captured, parent.body, key),
              };
            } catch (error) {
              return { kind: 'refused', error };
            }
          }
          beforeEach(async () => {
            registration = undefined;
            revocation = undefined;
            triggerCreated = false;
            if (kind === 'Approver') {
              await grant('/company-contract-approver-assignments');
              await revoke('/company-contract-preparer-assignments');
            }
            captured = await actor();
            path =
              kind === 'Intake'
                ? '/company-commercial-intake-assignments'
                : kind === 'Approver'
                  ? '/company-contract-approver-assignments'
                  : '/company-contract-preparer-assignments';
            key = randomUUID();
            before = await facts();
            barrier = await fixture.pool.connect();
            const table = registrationFirst
              ? 'document_registration_events'
              : 'company_role_assignments';
            await fixture.pool.query(
              'CREATE FUNCTION pause_addendum_parent_capture() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN PERFORM pg_advisory_xact_lock(10491053); RETURN NEW; END $$',
            );
            // The closed literal table/operation pair alone selects the barrier.
            await fixture.pool.query(
              `CREATE TRIGGER pause_addendum_parent_capture BEFORE ${registrationFirst ? 'INSERT' : 'UPDATE'} ON ${table} FOR EACH ROW EXECUTE FUNCTION pause_addendum_parent_capture()`,
            );
            triggerCreated = true;
            await barrier.query('BEGIN');
            const pid = await backendPid(barrier);
            await barrier.query('SELECT pg_advisory_xact_lock(10491053)');
            if (registrationFirst) registration = register();
            else revocation = revoke(path);
            await waitForBlocked(fixture.pool, pid);
            if (registrationFirst) revocation = revoke(path);
            else registration = register();
            await waitForBlocked(fixture.pool, pid, 2);
          });
          afterEach(async () => {
            await barrier?.query('ROLLBACK').catch(() => undefined);
            barrier?.release();
            await Promise.allSettled([
              ...(registration ? [registration] : []),
              ...(revocation ? [revocation] : []),
            ]);
            if (triggerCreated) {
              await fixture.pool.query(
                `DROP TRIGGER pause_addendum_parent_capture ON ${registrationFirst ? 'document_registration_events' : 'company_role_assignments'}`,
              );
              await fixture.pool.query(
                'DROP FUNCTION pause_addendum_parent_capture()',
              );
            }
          });
          it('serializes the actual native replacement and exact captured registration without a stale effect', async () => {
            if (!barrier)
              throw new Error('The native PostgreSQL barrier is required.');
            await barrier.query('COMMIT');
            if (!registration || !revocation)
              throw new Error(
                'Both native operations must reach the PostgreSQL barrier.',
              );
            const outcome = await registration;
            await revocation;
            await grant(path);
            const fresh = await actor();
            expect(
              (await documents.receivedAddendumSources(fresh, {})).sources,
            ).toHaveLength(1);
            if (registrationFirst) {
              expect(outcome.kind).toBe('saved');
              if (outcome.kind !== 'saved') throw outcome.error;
              expect(await documents.register(fresh, parent.body, key)).toEqual(
                outcome.document,
              );
            } else {
              expect(outcome.kind).toBe('refused');
              if (outcome.kind !== 'refused')
                throw new Error(
                  'Replacement-first must not register an old capture.',
                );
              expect(outcome.error).toBeInstanceOf(ForbiddenException);
              const after = await facts();
              // Native assignment administration has its own legitimate events.
              const { activity_log_events: ignoredBefore, ...beforeBusiness } =
                before;
              const { activity_log_events: ignoredAfter, ...afterBusiness } =
                after;
              expect(ignoredBefore).toEqual(expect.any(Array));
              expect(ignoredAfter).toEqual(expect.any(Array));
              expect(afterBusiness).toEqual(beforeBusiness);
            }
            await expectSourceDenied(captured);
          });
        },
      );
    },
  );

  it('refuses an Actor whose exact Uploader was replaced before reading the upload body', async () => {
    const captured = await actor();
    await revoke('/company-document-content-uploader-assignments');
    await grant('/company-document-content-uploader-assignments');
    const fresh = await actor();
    expect(fresh.activeCompany?.documentContentUploaderAssignmentId).not.toBe(
      captured.activeCompany?.documentContentUploaderAssignmentId,
    );
    // A body that never completes: only a refusal made before the body is
    // read can settle this upload, and any read attempt is reported instead.
    const request = new IncomingMessage(new Socket());
    request.headers = { 'content-type': 'application/pdf' };
    const bodyRead = new Promise<'body read'>((resolve) => {
      request._read = () => resolve('body read');
    });
    const before = await facts();
    try {
      const outcome = await Promise.race([
        content
          .upload(captured, {
            documentId,
            versionId,
            query: {
              expectedRevision: '2',
              fileName: 'fictional-addendum.pdf',
            },
            key: randomUUID(),
            request,
          })
          .then(
            () => 'uploaded',
            (error: unknown) => error,
          ),
        bodyRead,
      ]);
      expect(outcome).toBeInstanceOf(ForbiddenException);
    } finally {
      request.destroy();
    }
    expect(await facts()).toEqual(before);
  });
});
