import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { openDocumentScannerFixture } from '../documents/document-scanner.test-support.js';
import { ForbiddenException } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { ActorContext } from '../access/access.types.js';
import { CompanyContextAuthorization } from '../access/company-context-authorization.js';
import { DatabaseContext } from '../database/database-context.js';
import { DATABASE } from '../database/database.constants.js';
import {
  openEstimateOfferFixture,
  responseRecord,
  responseString,
} from '../offer/offer-estimate-preparation.test-support.js';
import { ContractDocumentReferenceModule } from './contract-document-reference.module.js';
import { ContractExternalInvoiceReferenceService } from './contract-external-invoice-reference.service.js';
import { prepareExternalInvoiceContract } from './external-invoice-reference.test-support.js';
import { revokeModelContractFixtureGrant } from './model-contract.test-fixture.js';

const withPostgres = process.env.TEST_DATABASE_URL ? describe : describe.skip;
withPostgres('External invoice exact Contract source public REST', () => {
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

  async function grantSourceAccess(source: {
    companyId: string;
    preparerMembershipId: string;
  }) {
    for (const path of [
      '/company-invoice-recorder-assignments',
      '/company-external-invoice-access-assignments',
    ])
      await fixture.grant({
        path,
        companyId: source.companyId,
        membershipId: source.preparerMembershipId,
      });
  }

  it.each(['PRIMARY', 'ADDITIONAL'] satisfies Array<'PRIMARY' | 'ADDITIONAL'>)(
    'preserves the exact %s Contract party after a public current Client or entity correction',
    async (recipient) => {
      const f = await prepareExternalInvoiceContract(fixture, { recipient });
      await grantSourceAccess(f.source);
      const input = {
        type: 'external-invoice',
        ...f.selection,
        title: 'Literal source <script> Ș Я é',
        purpose: 'Preserve the historical recorded party',
        sourceDescription: 'Fictional manual process',
        receivedOn: '0001-01-01',
      };
      const document = responseRecord(await f.invoke('/documents', input));
      const original = document.externalInvoiceRelation;
      const current = responseRecord(
        await fixture.read({
          ...f.target,
          path: `/clients/${f.source.clientId}`,
        }),
      );
      if (
        typeof current.version !== 'number' ||
        !Number.isInteger(current.version)
      )
        throw new Error('Expected the current native Client revision.');
      const party = f.recordedRecipient;
      const patch =
        party.kind === 'ADDITIONAL'
          ? {
              path: `/clients/${f.source.clientId}/legal-entities/${party.additionalLegalEntityId}`,
              body: {
                expectedClientVersion: current.version,
                changes: {
                  legalName: 'Changed current additional entity',
                  taxId: null,
                  legalAddress: null,
                },
              },
            }
          : {
              path: `/clients/${f.source.clientId}`,
              body: {
                expectedVersion: current.version,
                displayName: 'Changed current primary Client',
                taxId: 'CHANGED-FICTIONAL-1020',
                address: 'Changed current address',
              },
            };
      const corrected = await fixture.request({
        ...f.target,
        path: patch.path,
        init: {
          method: 'PATCH',
          headers: {
            'content-type': 'application/json',
            'idempotency-key': randomUUID(),
          },
          body: JSON.stringify(patch.body),
        },
      });
      expect(corrected.status).toBe(200);
      expect(
        responseRecord(
          await fixture.read({
            ...f.target,
            path: `/documents/${responseString(document, 'id')}`,
          }),
        ).externalInvoiceRelation,
      ).toEqual(original);
      const next = responseRecord(
        await f.invoke('/documents', {
          ...input,
          title: 'A distinct source after current party correction',
          receivedOn: '9999-12-31',
        }),
      );
      expect(
        responseRecord(next.externalInvoiceRelation).recordedRecipient,
      ).toEqual(party);
      const selector = responseRecord(
        await fixture.read({
          ...f.target,
          path: '/documents/external-invoice-sources',
        }),
      );
      expect(selector.sources).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            contractVersionId: f.selection.contractVersionId,
            recordedRecipient: party,
          }),
        ]),
      );
    },
  );

  it.each(['PRIMARY', 'ADDITIONAL'] satisfies Array<'PRIMARY' | 'ADDITIONAL'>)(
    'discovers only the exact declared V2 and preserves its %s recorded party',
    async (recipient) => {
      const f = await prepareExternalInvoiceContract(fixture, {
        recipient,
        declare: false,
      });
      await grantSourceAccess(f.source);
      const path = '/documents/external-invoice-sources';
      expect(await fixture.read({ ...f.target, path })).toEqual({
        sources: [],
        nextCursor: null,
      });
      await f.invoke(f.signing.path, f.signing.body);
      const listed = responseRecord(await fixture.read({ ...f.target, path }));
      expect(listed).toEqual({
        sources: [
          {
            ...f.selection,
            contractVersionNumber: 2,
            illustrativeReference: f.contract.illustrativeReference,
            clientId: f.source.clientId,
            clientDisplayName: 'Synthetic internal Offer Client',
            opportunityTitle: 'Synthetic internal Offer',
            recordedRecipient: f.recordedRecipient,
          },
        ],
        nextCursor: null,
      });
      expect(JSON.stringify(listed)).not.toContain(f.originalVersionId);
      if (recipient === 'PRIMARY')
        expect(f.recordedRecipient).not.toHaveProperty(
          'additionalLegalEntityId',
        );
      const registered = responseRecord(
        await f.invoke('/documents', {
          type: 'external-invoice',
          ...f.selection,
          title: 'Fictional source for the exact declared party',
          purpose: 'Preserve an unverified fictional external source',
          sourceDescription: 'Fictional manual process',
          receivedOn: null,
        }),
      );
      expect(registered).toMatchObject({
        type: 'external-invoice',
        clientId: f.source.clientId,
        externalInvoiceRelation: {
          access: 'granted',
          ...f.selection,
          contractVersionNumber: 2,
          recordedRecipient: f.recordedRecipient,
        },
      });
      await fixture.restart();
      expect(await fixture.read({ ...f.target, path })).toEqual(listed);
    },
  );

  it('preserves eligibility without current Offer/model grants and refuses independent Contract/Opportunity authority loss', async () => {
    const f = await prepareExternalInvoiceContract(fixture);
    await grantSourceAccess(f.source);
    const path = '/documents/external-invoice-sources';
    const original = await fixture.read({ ...f.target, path });
    for (const route of [
      '/company-offer-preparer-assignments',
      '/company-offer-model-editor-assignments',
      '/company-contract-model-editor-assignments',
      '/company-contract-model-approver-assignments',
    ])
      await revokeModelContractFixtureGrant(
        fixture,
        route,
        f.source.companyId,
        f.source.preparerMembershipId,
      );
    expect(await fixture.read({ ...f.target, path })).toEqual(original);
    for (const route of [
      '/company-contract-preparer-assignments',
      '/company-contract-approver-assignments',
    ])
      await revokeModelContractFixtureGrant(
        fixture,
        route,
        f.source.companyId,
        f.source.preparerMembershipId,
      );
    expect((await fixture.request({ ...f.target, path })).status).toBe(403);
    await fixture.grant({
      path: '/company-contract-preparer-assignments',
      companyId: f.source.companyId,
      membershipId: f.source.preparerMembershipId,
    });
    expect(await fixture.read({ ...f.target, path })).toEqual(original);
    await revokeModelContractFixtureGrant(
      fixture,
      '/company-commercial-intake-assignments',
      f.source.companyId,
      f.source.preparerMembershipId,
    );
    expect((await fixture.request({ ...f.target, path })).status).toBe(403);
  });

  it('rejects a held source Actor after equal-permission Contract, Opportunity or Client replacement while fresh native captures recover', async () => {
    const f = await prepareExternalInvoiceContract(fixture);
    await grantSourceAccess(f.source);
    const module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
        ContractDocumentReferenceModule,
      ],
    })
      .overrideProvider(DATABASE)
      .useValue(drizzle({ client: fixture.pool }))
      .compile();
    try {
      const authorization = module.get(CompanyContextAuthorization);
      const database = module.get(DatabaseContext);
      const references = module.get(ContractExternalInvoiceReferenceService);
      const currentActor = async (): Promise<ActorContext> => {
        const value = responseRecord(
          await fixture.read({
            ...f.target,
            path: '/access/current-actor',
          }),
        );
        expect(value.workspacePermissions).toEqual([]);
        expect(value.active).toBe(true);
        const base: ActorContext = {
          internalUserId: responseString(value, 'internalUserId'),
          workspaceMembershipId: responseString(value, 'workspaceMembershipId'),
          workspaceId: responseString(value, 'workspaceId'),
          workspaceName: responseString(value, 'workspaceName'),
          displayName: responseString(value, 'displayName'),
          email: responseString(value, 'email'),
          active: true,
          workspacePermissions: [],
        };
        const activeCompany =
          await authorization.resolveAuthorizedActiveCompany(
            base,
            f.source.companyId,
          );
        if (!activeCompany)
          throw new Error('Expected native selected Company.');
        return { ...base, activeCompany };
      };
      const qualify = (actor: ActorContext) =>
        database.transaction(() =>
          references.qualifyNewRelationWithinTransaction({
            actor,
            selection: f.selection,
          }),
        );
      for (const replacement of [
        {
          grant: '/company-contract-preparer-assignments',
          revoke: [
            '/company-contract-preparer-assignments',
            '/company-contract-approver-assignments',
          ],
        },
        {
          grant: '/company-commercial-intake-assignments',
          revoke: ['/company-commercial-intake-assignments'],
        },
        {
          grant: '/company-director-client-assignments',
          revoke: ['/company-director-client-assignments'],
        },
      ]) {
        const captured = await currentActor();
        await expect(qualify(captured)).resolves.toMatchObject({
          originalClientAccountId: f.source.clientId,
          recordedRecipient: f.recordedRecipient,
        });
        for (const route of replacement.revoke)
          await revokeModelContractFixtureGrant(
            fixture,
            route,
            f.source.companyId,
            f.source.preparerMembershipId,
          );
        await fixture.grant({
          path: replacement.grant,
          companyId: f.source.companyId,
          membershipId: f.source.preparerMembershipId,
        });
        await expect(qualify(captured)).rejects.toBeInstanceOf(
          ForbiddenException,
        );
        await expect(qualify(await currentActor())).resolves.toMatchObject({
          originalClientAccountId: f.source.clientId,
          recordedRecipient: f.recordedRecipient,
        });
      }
    } finally {
      await module.close();
    }
  });
});
