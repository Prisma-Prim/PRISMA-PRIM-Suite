import { holds } from '../access/company-grants';
import {
  canReadReceivedAddendumRelation,
  receivedAddendumSourceAuthority,
} from './received-addendum-access';
import {
  readReceivedAddendumMetadata,
  readReceivedAddendumSources,
  type ReceivedAddendumSourcePage,
} from './received-addendum-response';
import type { SourceRegistrationAdapter } from './source-registration';
import { receivedContractSourceAuthority } from './received-contract-access';
import { externalInvoiceSourceAuthority } from './external-invoice-access';
import {
  readExternalInvoiceSources,
  type ExternalInvoiceSourcePage,
} from './external-invoice-response';
import { ExternalInvoiceParty } from './ExternalInvoiceParty';
import {
  readReceivedContractSources,
  type ReceivedContractSourcePage,
} from './received-contract-response';

export const RECEIVED_CONTRACT_SOURCE_ADAPTER: SourceRegistrationAdapter<
  ReceivedContractSourcePage['sources'][number]
> = {
  family: 'received-contract',
  endpoint: '/documents/received-contract-sources',
  authority: (actor) => receivedContractSourceAuthority(actor.activeCompany),
  // The Documents family registry owns admission for the existing Contract form.
  canRegister: () => true,
  readSources: readReceivedContractSources,
  sourceId: (source) => source.contractVersionId,
  sourceLabel: (source, copies) =>
    `${source.opportunityTitle} · ${copies.received.versionLabel(source.illustrativeReference, source.contractVersionNumber)} · ${source.clientDisplayName}`,
  copy: (copies) => copies.received,
  presentation: () => ({
    className: 'working-document-registration',
    fields: {
      selection: 'separate',
      title: 'label',
      purpose: 'separate',
      source: 'separate',
      received: 'label',
    },
    date: { kind: 'native', bounded: false },
    focusErrors: false,
  }),
  prepare: ({ source, fields, companyId }) => ({
    body: JSON.stringify({
      type: 'received-contract',
      opportunityId: source.opportunityId,
      contractId: source.contractId,
      contractVersionId: source.contractVersionId,
      ...fields,
      receivedOn: fields.receivedOn || null,
    }),
    confirms: (saved) =>
      saved.type === 'received-contract' &&
      saved.companyId === companyId &&
      saved.clientId === source.clientId &&
      saved.receivedContractRelation.access === 'granted' &&
      saved.receivedContractRelation.opportunityId === source.opportunityId &&
      saved.receivedContractRelation.contractId === source.contractId &&
      saved.receivedContractRelation.contractVersionId ===
        source.contractVersionId &&
      saved.receivedContractRelation.contractVersionNumber ===
        source.contractVersionNumber &&
      saved.receivedContractRelation.illustrativeReference ===
        source.illustrativeReference &&
      saved.receivedContractRelation.sourceDescription ===
        fields.sourceDescription.trim() &&
      saved.receivedContractRelation.receivedOn === (fields.receivedOn || null),
  }),
};

export const EXTERNAL_INVOICE_SOURCE_ADAPTER: SourceRegistrationAdapter<
  ExternalInvoiceSourcePage['sources'][number]
> = {
  family: 'external-invoice',
  endpoint: '/documents/external-invoice-sources',
  authority: (actor) =>
    externalInvoiceSourceAuthority(
      actor.activeCompany,
      actor.workspacePermissions.includes('client.manage'),
    ),
  // The Documents family registry owns admission for the existing Invoice form.
  canRegister: () => true,
  readSources: readExternalInvoiceSources,
  sourceId: (source) => source.contractVersionId,
  sourceLabel: (source, copies) =>
    `${source.opportunityTitle} · ${copies.invoice.versionLabel(source.illustrativeReference, source.contractVersionNumber)} · ${source.recordedRecipient.legalName} · ${copies.invoice.t(source.recordedRecipient.kind === 'PRIMARY' ? 'primary' : 'additional')}`,
  copy: (copies) => copies.invoice,
  presentation: () => ({
    className:
      'working-document-registration working-document-registration--external-invoice',
    fields: {
      selection: 'grouped',
      title: 'grouped',
      purpose: 'grouped',
      source: 'grouped',
      received: 'grouped',
    },
    date: { kind: 'native', bounded: true },
    focusErrors: false,
  }),
  details: {
    placement: 'before-picker',
    render: (source) => (
      <ExternalInvoiceParty party={source.recordedRecipient} />
    ),
  },
  prepare: ({ source, fields, companyId }) => ({
    body: JSON.stringify({
      type: 'external-invoice',
      opportunityId: source.opportunityId,
      contractId: source.contractId,
      contractVersionId: source.contractVersionId,
      ...fields,
      receivedOn: fields.receivedOn || null,
    }),
    confirms: (saved) =>
      saved.type === 'external-invoice' &&
      saved.companyId === companyId &&
      saved.clientId === source.clientId &&
      saved.externalInvoiceRelation.access === 'granted' &&
      saved.externalInvoiceRelation.opportunityId === source.opportunityId &&
      saved.externalInvoiceRelation.contractId === source.contractId &&
      saved.externalInvoiceRelation.contractVersionId ===
        source.contractVersionId &&
      saved.externalInvoiceRelation.contractVersionNumber ===
        source.contractVersionNumber &&
      saved.externalInvoiceRelation.illustrativeReference ===
        source.illustrativeReference &&
      saved.externalInvoiceRelation.sourceDescription ===
        fields.sourceDescription.trim() &&
      saved.externalInvoiceRelation.receivedOn ===
        (fields.receivedOn || null) &&
      JSON.stringify(saved.externalInvoiceRelation.recordedRecipient) ===
        JSON.stringify(source.recordedRecipient),
  }),
};

export const RECEIVED_ADDENDUM_SOURCE_ADAPTER: SourceRegistrationAdapter<
  ReceivedAddendumSourcePage['sources'][number]
> = {
  family: 'received-addendum',
  endpoint: '/documents/received-addendum-sources',
  authority: receivedAddendumSourceAuthority,
  canRegister: (actor) =>
    canReadReceivedAddendumRelation(actor) &&
    holds(
      actor.activeCompany,
      'company_document_registrar',
      'document.register',
    ),
  readSources: readReceivedAddendumSources,
  sourceId: (source) => source.parentContractVersionId,
  sourceLabel: (source, copies) =>
    `${copies.addendum.versionLabel(source.illustrativeReference, source.contractVersionNumber)} · ${source.clientDisplayName} · ${source.recordedRecipient.legalName} · ${source.opportunityTitle}`,
  copy: (copies) => copies.addendum,
  presentation: (copies) => ({
    className: 'working-document-registration',
    style: { gridTemplateColumns: 'minmax(0, 1fr)' },
    fields: {
      selection: 'separate',
      title: 'separate',
      purpose: 'separate',
      source: 'separate',
      received: 'separate',
    },
    date: { kind: 'text', hint: copies.addendum.t('dateHint') },
    warning: copies.addendum.t('warning'),
    pendingLabel: copies.addendum.t('pending'),
    focusErrors: true,
  }),
  details: {
    placement: 'after-picker',
    render: (source, actor, copies) => (
      <dl className="working-document-party">
        <dt>{copies.addendum.t('company')}</dt>
        <dd className="working-document-literal">
          {actor.activeCompany?.displayName}
        </dd>
        <dt>{copies.addendum.t('client')}</dt>
        <dd className="working-document-literal">{source.clientDisplayName}</dd>
        <dt>{copies.addendum.t('opportunity')}</dt>
        <dd className="working-document-literal">{source.opportunityTitle}</dd>
        <dt>
          {copies.addendum.t('recipient')} ·{' '}
          {copies.addendum.t(
            source.recordedRecipient.kind === 'PRIMARY'
              ? 'primaryRecipient'
              : 'additionalRecipient',
          )}
        </dt>
        <dd className="working-document-literal">
          {source.recordedRecipient.legalName}
        </dd>
        {source.recordedRecipient.taxId !== null && (
          <>
            <dt>{copies.addendum.t('taxId')}</dt>
            <dd className="working-document-literal">
              {source.recordedRecipient.taxId}
            </dd>
          </>
        )}
        {source.recordedRecipient.legalAddress !== null && (
          <>
            <dt>{copies.addendum.t('legalAddress')}</dt>
            <dd className="working-document-literal">
              {source.recordedRecipient.legalAddress}
            </dd>
          </>
        )}
      </dl>
    ),
  },
  prepare: ({ source, fields, companyId, actor }) => {
    const metadata = readReceivedAddendumMetadata({
      ...fields,
      receivedOn: fields.receivedOn || null,
    });
    return {
      body: JSON.stringify({
        type: 'received-addendum',
        parentContractId: source.parentContractId,
        parentContractVersionId: source.parentContractVersionId,
        ...fields,
        receivedOn: fields.receivedOn || null,
      }),
      confirms: (saved) => {
        const uuid =
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
        if (
          saved.type !== 'received-addendum' ||
          !uuid.test(saved.id) ||
          !uuid.test(saved.version.id) ||
          saved.companyId !== companyId ||
          saved.clientId !== source.clientId ||
          saved.receivedAddendumRelation.access !== 'granted'
        )
          return false;
        const relation = saved.receivedAddendumRelation;
        return (
          relation.parentContractId === source.parentContractId &&
          relation.parentContractVersionId === source.parentContractVersionId &&
          relation.contractVersionNumber === source.contractVersionNumber &&
          relation.illustrativeReference === source.illustrativeReference &&
          JSON.stringify(relation.recordedRecipient) ===
            JSON.stringify(source.recordedRecipient) &&
          relation.sourceDescription === metadata.sourceDescription &&
          relation.receivedOn === metadata.receivedOn &&
          relation.registeredBy.workspaceMembershipId ===
            actor.workspaceMembershipId &&
          relation.registeredBy.internalUserId === actor.internalUserId
        );
      },
    };
  },
};
