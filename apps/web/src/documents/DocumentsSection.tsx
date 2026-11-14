import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import { SectionVisibility } from '../production-shell/section-visibility';
import { ApplicationPresentation } from '../production-shell/application-presentation';
import { DocumentWorkspace, type RequestedDocument } from './DocumentWorkspace';
import { paymentEvidenceAuthority } from '../payment-evidence/payment-evidence-authority';
import {
  PaymentEvidenceSourcePanel,
  type PaymentEvidenceSelection,
  type PaymentEvidenceTarget,
} from '../payment-evidence/PaymentEvidenceSourcePanel';
import { usePaymentEvidenceCopy } from '../payment-evidence/payment-evidence.copy';

type Pane =
  | { kind: 'native' }
  | { kind: 'native-opening' }
  | { kind: 'payment-evidence'; selection: PaymentEvidenceSelection };
type NativeClientFilter = NonNullable<
  Parameters<typeof DocumentWorkspace>[0]['clientFilter']
> & { requestId: number };
type NativeIntent =
  | { kind: 'document'; request: RequestedDocument }
  | { kind: 'client'; filter: NativeClientFilter };
type Props = Omit<
  Parameters<typeof DocumentWorkspace>[0],
  | 'onSelectPaymentEvidence'
  | 'onProtectedWorkChange'
  | 'onProtectedReceivedAddendumWorkChange'
  | 'clientFilter'
> & {
  clientKey: string;
  requestedPaymentEvidence?: RequestedDocument & {
    paymentEvidenceVersionId?: string;
  };
  clientFilter?: NativeClientFilter;
  onProtectedSourceWorkChange?: (protectedWork: boolean) => void;
};

function currentNativeIntent(
  intent: NativeIntent,
  props: Pick<Props, 'requestedDocument' | 'clientFilter'>,
) {
  if (intent.kind === 'client')
    return (
      intent.filter.requestId === props.clientFilter?.requestId &&
      intent.filter.clientDossierId === props.clientFilter.clientDossierId &&
      intent.filter.displayName === props.clientFilter.displayName
    );
  const request = props.requestedDocument;
  return (
    request?.requestId === intent.request.requestId &&
    request.documentId === intent.request.documentId &&
    request.focus === intent.request.focus &&
    request.sourceSignal === intent.request.sourceSignal &&
    !intent.request.sourceSignal?.aborted
  );
}

/** One Documents surface: Source selection outlives unrelated Client keys. */
export function DocumentsSection({
  clientKey,
  onProtectedSourceWorkChange,
  ...props
}: Props) {
  const copy = usePaymentEvidenceCopy();
  const isPrisme = useContext(ApplicationPresentation) === 'prisme';
  const sectionVisible = useContext(SectionVisibility);
  const [pane, setPane] = useState<Pane>({ kind: 'native' });
  const generation = useRef(0);
  const [protectedWork, setProtectedWork] = useState(false);
  const protectedOwner = useRef(false);
  const sourceProtection = useRef(onProtectedSourceWorkChange);
  sourceProtection.current = onProtectedSourceWorkChange;
  const [heldSelection, setHeldSelection] = useState<PaymentEvidenceTarget>();
  const [heldNative, setHeldNative] = useState<NativeIntent>();
  const observedNativeRequest = useRef(
    Math.max(
      props.requestedDocument?.requestId ?? 0,
      props.clientFilter?.requestId ?? 0,
    ),
  );
  const protect = useCallback((value: boolean) => {
    protectedOwner.current = value;
    setProtectedWork(value);
  }, []);
  const protectSource = useCallback(
    (value: boolean) => {
      protect(value);
      sourceProtection.current?.(value);
    },
    [protect],
  );
  useEffect(() => () => sourceProtection.current?.(false), []);
  const selectSource = useCallback((target: PaymentEvidenceTarget) => {
    if (protectedOwner.current) {
      setHeldSelection(target);
      return;
    }
    setHeldNative(undefined);
    setHeldSelection(undefined);
    setPane({
      kind: 'payment-evidence',
      selection: { ...target, generation: ++generation.current },
    });
  }, []);
  useEffect(() => {
    const document = props.requestedDocument;
    const filter = props.clientFilter;
    const intent: NativeIntent | undefined =
      filter && filter.requestId > (document?.requestId ?? 0)
        ? { kind: 'client', filter }
        : document
          ? { kind: 'document', request: document }
          : undefined;
    const requestId =
      intent?.kind === 'document'
        ? intent.request.requestId
        : intent?.filter.requestId;
    if (intent && requestId && requestId > observedNativeRequest.current) {
      observedNativeRequest.current = requestId;
      setHeldNative(
        pane.kind === 'payment-evidence' && currentNativeIntent(intent, props)
          ? intent
          : undefined,
      );
    } else
      setHeldNative((current) =>
        current && !currentNativeIntent(current, props) ? undefined : current,
      );
  }, [props.requestedDocument, props.clientFilter, pane.kind]);
  useEffect(() => {
    if (protectedWork) return;
    if (heldNative) {
      setHeldNative(undefined);
      if (currentNativeIntent(heldNative, props)) {
        generation.current += 1;
        setHeldSelection(undefined);
        setPane({
          kind: heldNative.kind === 'document' ? 'native-opening' : 'native',
        });
        return;
      }
    }
    if (heldSelection) {
      setHeldSelection(undefined);
      selectSource(heldSelection);
    }
  }, [
    protectedWork,
    heldNative,
    heldSelection,
    selectSource,
    props.requestedDocument,
    props.clientFilter,
  ]);
  // The illustrative Client journey deliberately ignores an intent present at its initial mount. Mount
  // once without it, then deliver only this newly accepted native command.
  useEffect(() => {
    if (pane.kind === 'native-opening')
      setPane((current) =>
        current.kind === 'native-opening' ? { kind: 'native' } : current,
      );
  }, [pane.kind]);
  useEffect(() => {
    const requested = props.requestedPaymentEvidence;
    if (
      !requested ||
      requested.sourceSignal?.aborted ||
      requested.requestId <= observedNativeRequest.current
    )
      return;
    observedNativeRequest.current = requested.requestId;
    selectSource({
      kind: 'document',
      documentId: requested.documentId,
      requestedVersionId: requested.paymentEvidenceVersionId,
    });
  }, [props.requestedPaymentEvidence, selectSource]);
  const canReadSource = paymentEvidenceAuthority(props.actor) !== undefined;
  if (pane.kind !== 'payment-evidence')
    return (
      <DocumentWorkspace
        key={clientKey}
        {...props}
        requestedDocument={
          pane.kind === 'native-opening' ? undefined : props.requestedDocument
        }
        onProtectedWorkChange={protect}
        onProtectedReceivedAddendumWorkChange={onProtectedSourceWorkChange}
        onSelectPaymentEvidence={
          canReadSource
            ? (documentId) =>
                selectSource(
                  documentId
                    ? { kind: 'document', documentId }
                    : { kind: 'register' },
                )
            : undefined
        }
      />
    );
  // The shell retains sections. Leaving Documents must retire Source requests,
  // pending Blob/focus work and downloads, while frame/locale changes retain them.
  if (!sectionVisible) return <section id="documents" />;
  return (
    <section
      id="documents"
      className={isPrisme ? 'working-documents--prisme' : undefined}
      tabIndex={-1}
      aria-label={copy('title')}
    >
      <button
        type="button"
        disabled={protectedWork}
        onClick={() => {
          if (protectedOwner.current) return;
          generation.current += 1;
          setHeldSelection(undefined);
          setHeldNative(undefined);
          setPane({ kind: 'native' });
        }}
      >
        {copy('otherDocuments')}
      </button>
      <PaymentEvidenceSourcePanel
        actor={props.actor}
        identity={props.identity}
        selection={pane.selection}
        onSelect={selectSource}
        onProtectedWorkChange={protectSource}
        onActivityRecorded={props.onActivityRecorded}
        onCompanyContextRejected={props.onCompanyContextRejected}
        onActorRevalidated={props.onActorRevalidated}
        onWorkspaceAccessRejected={props.onWorkspaceAccessRejected}
      />
    </section>
  );
}
