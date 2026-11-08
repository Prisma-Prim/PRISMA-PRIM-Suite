import { ForbiddenException, Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { CompanyContextAuthorization } from '../access/company-context-authorization.js';
import type { ActorContext } from '../access/access.types.js';
import { ClientOperationalReferenceService } from '../client/client-operational-reference.service.js';
import { DatabaseContext } from '../database/database-context.js';
import {
  paymentEvidenceDocumentSources,
  workingDocuments,
} from '../database/schema/index.js';
import type {
  PaymentEvidenceSourceView,
  readPaymentEvidenceRegistration,
} from './payment-evidence.js';
import {
  receivedSourceAttribution,
  receivedSourceAttributionView,
} from './received-source-registration.js';

@Injectable()
export class PaymentEvidenceSourcesService {
  constructor(
    private readonly database: DatabaseContext,
    private readonly access: CompanyContextAuthorization,
    private readonly clients: ClientOperationalReferenceService,
  ) {}
  async requireRegistrationAuthority(actor: ActorContext) {
    if (
      !(await this.access.hasPaymentEvidenceAccess(actor, {
        manage: true,
        lockAssignment: true,
      }))
    )
      throw new ForbiddenException();
    await this.access.requirePaymentEvidenceNativeAccess(actor, {
      action: 'register',
      lockAssignment: true,
    });
  }
  qualify(
    actor: ActorContext,
    command: ReturnType<typeof readPaymentEvidenceRegistration>,
  ) {
    return this.clients.lockPaymentEvidencePayerWithinTransaction({
      actor,
      originalClientAccountId: command.clientId,
      payer: command.payer,
    });
  }
  async attach(input: {
    actor: ActorContext;
    document: typeof workingDocuments.$inferSelect;
    command: ReturnType<typeof readPaymentEvidenceRegistration>;
    reference: Awaited<ReturnType<PaymentEvidenceSourcesService['qualify']>>;
  }) {
    const { actor, document, command, reference } = input;
    if (!actor.activeCompany) throw new ForbiddenException();
    await this.database.connection
      .insert(paymentEvidenceDocumentSources)
      .values({
        documentId: document.id,
        workspaceId: document.workspaceId,
        companyId: document.companyId,
        originalClientAccountId: reference.originalClientAccountId,
        originalClientVersion: reference.originalClientVersion,
        payerKind: reference.party.kind,
        payerLegalEntityId:
          reference.party.kind === 'ADDITIONAL'
            ? reference.party.legalEntityId
            : null,
        payerLegalName: reference.party.legalName,
        payerTaxId: reference.party.taxId,
        payerLegalAddress: reference.party.legalAddress,
        receivingCompanyLabel: actor.activeCompany.displayName,
        initialTitle: command.title,
        initialPurpose: command.purpose,
        ...receivedSourceAttribution(actor, document, command),
      });
  }
  async read(
    actor: ActorContext,
    document: typeof workingDocuments.$inferSelect,
  ): Promise<PaymentEvidenceSourceView> {
    const [source] = await this.database.connection
      .select()
      .from(paymentEvidenceDocumentSources)
      .where(
        and(
          eq(paymentEvidenceDocumentSources.workspaceId, document.workspaceId),
          eq(paymentEvidenceDocumentSources.companyId, document.companyId),
          eq(paymentEvidenceDocumentSources.documentId, document.id),
        ),
      );
    if (!source) throw new Error('Missing conserved Payment Evidence source.');
    const common = {
      format: 'PAYMENT_EVIDENCE_SOURCE/1' as const,
      receivingCompanyLabel: source.receivingCompanyLabel,
      ...receivedSourceAttributionView(source),
    };
    if (!(await this.access.mayReadPaymentEvidencePayer(actor)))
      return { ...common, payer: { kind: 'UNAVAILABLE' } };
    const party = {
      legalName: source.payerLegalName,
      taxId: source.payerTaxId,
      legalAddress: source.payerLegalAddress,
    };
    if (source.payerKind === 'PRIMARY')
      return {
        ...common,
        payer: { kind: 'AVAILABLE', party: { kind: 'PRIMARY', ...party } },
      };
    if (source.payerKind !== 'ADDITIONAL' || !source.payerLegalEntityId)
      throw new Error('Invalid conserved Payment Evidence payer.');
    return {
      ...common,
      payer: {
        kind: 'AVAILABLE',
        party: {
          kind: 'ADDITIONAL',
          legalEntityId: source.payerLegalEntityId,
          ...party,
        },
      },
    };
  }
}
