import { useRef, useState } from 'react';
import { invoiceRecordProjectionAuthority } from '../access/invoice-record-authority';
import { grantOf, holds } from '../access/company-grants';
import { useContractCopy } from '../contract/contract.copy';
import { holdsContractRead } from '../contract/contract-grants';
import { useInvoiceRecordCopy } from './invoice-record-copy';
import {
  accessRejected,
  useInvoiceLifetime,
  useInvoiceOwner,
  type InvoiceAccessProps,
} from './invoice-record-owner';
import { object, uuid } from './invoice-record-values';

export type InvoiceContractTarget = {
  opportunityId: string;
  contractId: string;
  contractVersionId: string;
  clientRequestId: string;
};
type Props = InvoiceAccessProps & {
  companyId: string;
  recordId: string;
  contract: Omit<InvoiceContractTarget, 'clientRequestId'>;
  editing: boolean;
  onOpenContract: (input: InvoiceContractTarget) => void;
};
function nativeReadAvailable(props: Props) {
  const company = props.actor.activeCompany;
  return (
    props.actor.active &&
    company?.id === props.companyId &&
    uuid(props.companyId) &&
    uuid(props.recordId) &&
    uuid(props.contract.opportunityId) &&
    uuid(props.contract.contractId) &&
    uuid(props.contract.contractVersionId) &&
    props.identity.loaded &&
    props.identity.signedIn &&
    holdsContractRead(company) &&
    holds(
      company,
      'company_commercial_intake',
      'commercial.opportunity.read',
    ) &&
    (uuid(grantOf(company, 'company_contract_preparer')?.assignmentId) ||
      uuid(grantOf(company, 'company_contract_approver')?.assignmentId))
  );
}
function requestIdentity(payload: unknown, props: Props): string | undefined {
  if (!object(payload) || !object(payload.contract)) return undefined;
  const contract = payload.contract;
  return contract.id === props.contract.contractId &&
    contract.companyId === props.companyId &&
    contract.opportunityId === props.contract.opportunityId &&
    contract.kind === 'CONTRACT' &&
    object(contract.version) &&
    contract.version.id === props.contract.contractVersionId &&
    uuid(contract.clientRequestId)
    ? contract.clientRequestId
    : undefined;
}
/** Financial copies supply no native navigation identity or authority. */
export function InvoiceRecordContractLink(props: Props) {
  const available = nativeReadAvailable(props);
  const scope = JSON.stringify([
    invoiceRecordProjectionAuthority(props.actor),
    props.actor.active,
    props.identity.loaded,
    props.identity.signedIn,
    props.companyId,
    props.recordId,
    props.contract.opportunityId,
    props.contract.contractId,
    props.contract.contractVersionId,
    props.editing,
    available,
  ]);
  const generation = useInvoiceLifetime(props.identity, scope);
  if (!available) return null;
  return <NativeContractLinkOwner key={generation} {...props} scope={scope} />;
}
function NativeContractLinkOwner(props: Props & { scope: string }) {
  const copy = useInvoiceRecordCopy();
  const nativeCopy = useContractCopy();
  const owner = useInvoiceOwner(props, props.companyId, props.scope);
  const latest = useRef(props);
  latest.current = props;
  const pending = useRef(false);
  const [state, setState] = useState<
    'idle' | 'loading' | 'error' | 'unavailable' | 'denied'
  >('idle');
  async function open() {
    if (pending.current || props.editing) return;
    pending.current = true;
    setState('loading');
    const result = await owner.request(
      `/contracts/opportunities/${encodeURIComponent(props.contract.opportunityId)}/versions/${encodeURIComponent(props.contract.contractVersionId)}`,
    );
    if (!owner.isLive() || result.status === 'retired') return;
    pending.current = false;
    if (accessRejected(result)) {
      setState('denied');
      return;
    }
    if (result.status === 'notFound') {
      setState('unavailable');
      return;
    }
    const clientRequestId =
      result.status === 'ok' ? requestIdentity(result.value, props) : undefined;
    if (!owner.isLive()) return;
    if (!clientRequestId) {
      setState('error');
      return;
    }
    setState('idle');
    if (owner.isLive())
      latest.current.onOpenContract({
        opportunityId: props.contract.opportunityId,
        contractId: props.contract.contractId,
        contractVersionId: props.contract.contractVersionId,
        clientRequestId,
      });
  }
  return (
    <div>
      <button
        type="button"
        disabled={props.editing || state === 'loading'}
        onClick={() => void open()}
      >
        {state === 'loading' ? nativeCopy('loading') : copy.openContract}
      </button>
      {state !== 'idle' && state !== 'loading' && (
        <p role="alert">{nativeCopy(state)}</p>
      )}
    </div>
  );
}
