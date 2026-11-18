import { useScopedOperationGroup } from '../api/use-scoped-operation';
import { useCapturedAccessRejection } from '../api/use-captured-access-rejection';
import './offer-message.css';
import { useLayoutEffect, useRef, useState } from 'react';
import { holds } from '../access/company-grants';
import type { ActorContext } from '../access-types';
import type { BrowserIdentity } from '../access-composition';
import { createAuthenticatedApiClient } from '../api/authenticated-api-client';
import {
  offerMessageReadCapture,
  readOfferMessageObservation,
  type OfferMessageObservation,
  type OfferMessageTarget,
} from './offer-message-contract';
import {
  validOfferMessageFields,
  type OfferMessageField,
  type OfferMessageFields,
} from './offer-message-grammar';
import { useOfferMessageCopy } from './offer-message.copy';
import {
  OfferMessageEditor,
  type SourceObservation,
  type CopyStatus,
  type PdfStatus,
} from './offer-message-editor';

export { supportedOfferMessageTarget } from './offer-message-contract';
export type { OfferMessageTarget } from './offer-message-contract';
export { useOfferMessageCopy } from './offer-message.copy';

type Props = {
  actor: ActorContext;
  identity: BrowserIdentity;
  target: { source: OfferMessageTarget; generation: number } | null;
  onCompanyContextRejected: (companyId: string) => void;
  onActorRevalidated: (actor: ActorContext) => void | Promise<void>;
  onWorkspaceAccessRejected: () => void | Promise<void>;
};
type Owner = {
  key: string;
  authority: string;
  identity: BrowserIdentity;
  source: OfferMessageTarget;
  capture: string | null;
  retired: boolean;
};
/** The stable RequestDetail sibling owns an in-memory lifetime, independent of editor keys. */
export function OfferMessagePreparation(props: Props) {
  const copy = useOfferMessageCopy();
  const [owner, setOwner] = useState<Owner | null>(null);
  const company = props.actor.activeCompany;
  const capture = offerMessageReadCapture(props.actor);
  const readable =
    props.actor.active &&
    props.identity.loaded &&
    props.identity.signedIn &&
    holds(company, 'company_commercial_intake', 'commercial.request.read') &&
    holds(
      company,
      'company_commercial_intake',
      'commercial.opportunity.read',
    ) &&
    (holds(company, 'company_offer_preparer', 'commercial.offer.read') ||
      holds(company, 'company_offer_approver', 'commercial.offer.read'));
  const authority = JSON.stringify([
    props.actor.internalUserId,
    props.actor.workspaceMembershipId,
    props.actor.workspaceId,
    company?.id,
    capture,
    readable,
  ]);
  const targetKey = props.target
    ? JSON.stringify([props.target.generation, props.target.source])
    : null;
  if (targetKey === null && owner !== null) setOwner(null);
  else if (targetKey !== null && owner?.key !== targetKey && props.target) {
    setOwner({
      key: targetKey,
      authority,
      identity: props.identity,
      source: props.target.source,
      capture,
      retired:
        !capture ||
        !readable ||
        props.target.source.workspaceId !== props.actor.workspaceId ||
        props.target.source.companyId !== company?.id,
    });
  } else if (
    owner &&
    !owner.retired &&
    (owner.authority !== authority || owner.identity !== props.identity)
  ) {
    setOwner({ ...owner, retired: true });
  }
  const committed = useRef(owner);
  useLayoutEffect(() => {
    committed.current = owner;
  });
  const reject = useCapturedAccessRejection({
    ...props,
    companyContextId: props.target?.source.companyId,
    scope: JSON.stringify([targetKey, authority]),
  });
  if (!owner) return null;
  if (owner.retired)
    return (
      <p className="offer-message-retired" role="status">
        {copy('retired')}
      </p>
    );
  const isCurrent = () => committed.current === owner && !owner.retired;
  const retire = () => {
    if (!isCurrent()) return;
    setOwner((current) =>
      current === owner ? { ...current, retired: true } : current,
    );
  };
  return (
    <Preparation
      key={owner.key}
      {...props}
      owner={owner}
      isCurrent={isCurrent}
      reject={reject}
      retire={retire}
    />
  );
}

function Preparation({
  owner,
  isCurrent,
  reject,
  retire,
  ...props
}: Props & {
  owner: Owner;
  isCurrent: () => boolean;
  reject: ReturnType<typeof useCapturedAccessRejection>;
  retire: () => void;
}) {
  const [fields, setFields] = useState<OfferMessageFields>({
    recipient: '',
    subject: '',
    body: '',
  });
  const [source, setSource] = useState<SourceObservation>({ kind: 'loading' });
  const [sourceAttempt, setSourceAttempt] = useState(0);
  const [review, setReview] = useState<{ edit: number; serial: number } | null>(
    null,
  );
  const [copyStatus, setCopyStatus] = useState<CopyStatus>({ kind: 'idle' });
  const [pdfStatus, setPdfStatus] = useState<PdfStatus>('idle');
  const runtime = useRef<{
    edit: number;
    review: number;
    copy: number;
    pdf: number;
    pendingCopy: {
      serial: number;
      field: OfferMessageField;
      phase: 'observation' | 'write';
    } | null;
    pendingPdf: boolean;
    urls: Set<string>;
  }>({
    edit: 0,
    review: 0,
    copy: 0,
    pdf: 0,
    pendingCopy: null,
    pendingPdf: false,
    urls: new Set<string>(),
  });
  const fieldsRef = useRef(fields);
  useLayoutEffect(() => {
    fieldsRef.current = fields;
  });
  const reviewRef = useRef(review);
  useLayoutEffect(() => {
    reviewRef.current = review;
  });
  const observationRef = useRef<OfferMessageObservation | null>(null);
  const observations = useScopedOperationGroup('message-observations');
  const pdfs = useScopedOperationGroup('message-pdf');
  const copies = useScopedOperationGroup('message-copy');
  const protection = useRef({ retired: false });
  const live = () =>
    observations.isLive() && !protection.current.retired && isCurrent();
  function retireComposer() {
    protection.current.retired = true;
    observations.retire();
    pdfs.retire();
    copies.retire();
    retire();
  }

  useLayoutEffect(() => {
    const lifetime = runtime.current;
    return () => {
      lifetime.copy += 1;
      lifetime.pdf += 1;
      for (const url of lifetime.urls) URL.revokeObjectURL(url);
      lifetime.urls.clear();
    };
  }, []);

  async function observe(current: () => boolean) {
    if (!live() || !owner.capture) return null;
    const request = observations.begin();
    if (!request) return null;
    try {
      const api = await createAuthenticatedApiClient(props.identity);
      if (!live() || request.signal.aborted || !current()) return null;
      const result = await api.request(
        `/offers/opportunities/${encodeURIComponent(owner.source.opportunityId)}/versions/${encodeURIComponent(owner.source.versionId)}/message-preparation?sourceHtmlSha256=${owner.source.sourceHtmlSha256}`,
        {
          companyContextId: owner.source.companyId,
          signal: request.signal,
          cache: 'no-store',
        },
      );
      if (!live() || request.signal.aborted || !current()) return null;
      if (result.status === 'unauthorized' || result.status === 'forbidden') {
        retireComposer();
        // Retirement clears the composer first. Recovery has a distinct complete-
        // Actor observation guard, so this denial can recover without reviving text.
        await reject(result);
        return null;
      }
      if (!current()) return null;
      if (
        result.status === 'ok' &&
        result.value &&
        typeof result.value === 'object' &&
        'readCapture' in result.value &&
        typeof result.value.readCapture === 'string' &&
        /^offer-message-read\.v1\.[0-9a-f]{64}$/u.test(
          result.value.readCapture,
        ) &&
        result.value.readCapture !== owner.capture
      ) {
        retireComposer();
        return null;
      }
      const value =
        result.status === 'ok'
          ? readOfferMessageObservation({
              value: result.value,
              target: owner.source,
              readCapture: owner.capture,
              workspaceMembershipId: props.actor.workspaceMembershipId,
            })
          : null;
      if (
        !value ||
        (observationRef.current &&
          JSON.stringify(value.party) !==
            JSON.stringify(observationRef.current.party))
      ) {
        observationRef.current = null;
        setSource({ kind: 'failed' });
        reviewRef.current = null;
        setReview(null);
        return null;
      }
      observationRef.current = value;
      setSource({ kind: 'ready', value });
      return value;
    } catch {
      if (live() && !request.signal.aborted && current()) {
        setSource({ kind: 'failed' });
        observationRef.current = null;
        reviewRef.current = null;
        setReview(null);
      }
      return null;
    } finally {
      request.release();
    }
  }

  useLayoutEffect(() => {
    let current = true;
    void Promise.resolve().then(() => {
      if (current) void observe(() => current);
    });
    return () => {
      current = false;
    };
    // A source read belongs to this exact lifetime, never to locale/profile renders.
  }, [sourceAttempt]);

  function edit(field: OfferMessageField, value: string) {
    if (!live()) return;
    runtime.current.edit += 1;
    reviewRef.current = null;
    setReview(null);
    const pending = runtime.current.pendingCopy;
    if (pending?.phase !== 'write') {
      runtime.current.copy += 1;
      runtime.current.pendingCopy = null;
      setCopyStatus({ kind: 'idle' });
    }
    const next = { ...fieldsRef.current, [field]: value };
    fieldsRef.current = next;
    setFields(next);
  }

  function reviewMessage() {
    if (
      !live() ||
      !observationRef.current ||
      !validOfferMessageFields(fieldsRef.current)
    )
      return;
    runtime.current.review += 1;
    const next = { edit: runtime.current.edit, serial: runtime.current.review };
    reviewRef.current = next;
    setReview(next);
    if (!runtime.current.pendingCopy) setCopyStatus({ kind: 'idle' });
  }

  async function copyField(field: OfferMessageField) {
    const reviewed = reviewRef.current;
    if (
      !live() ||
      runtime.current.pendingCopy ||
      !reviewed ||
      reviewed.edit !== runtime.current.edit ||
      !validOfferMessageFields(fieldsRef.current)
    )
      return;
    const operation = copies.beginLatest();
    if (!operation) return;
    const text = fieldsRef.current[field];
    const serial = ++runtime.current.copy;
    const edit = runtime.current.edit;
    const current = () =>
      live() &&
      !operation.signal.aborted &&
      runtime.current.copy === serial &&
      runtime.current.edit === edit &&
      reviewRef.current === reviewed;
    runtime.current.pendingCopy = { serial, field, phase: 'observation' };
    setCopyStatus({ kind: 'pending', field });
    try {
      const observed = await observe(current);
      if (!observed || !current()) {
        if (live() && runtime.current.pendingCopy?.serial === serial)
          setCopyStatus({ kind: 'failed', field });
        return;
      }
      const clipboard = navigator.clipboard;
      if (!clipboard?.writeText) {
        setCopyStatus({ kind: 'failed', field });
        return;
      }
      runtime.current.pendingCopy = { serial, field, phase: 'write' };
      if (!current()) return;
      await clipboard.writeText(text);
      if (live() && runtime.current.pendingCopy?.serial === serial)
        setCopyStatus({ kind: current() ? 'accepted' : 'unconfirmed', field });
    } catch {
      if (live() && runtime.current.pendingCopy?.serial === serial)
        setCopyStatus({ kind: 'failed', field });
    } finally {
      operation.release();
      if (runtime.current.pendingCopy?.serial === serial) {
        const writing = runtime.current.pendingCopy.phase === 'write';
        runtime.current.pendingCopy = null;
        if (live() && !current() && writing)
          setCopyStatus({ kind: 'unconfirmed', field });
      }
    }
  }

  function stopWaiting() {
    const pending = runtime.current.pendingCopy;
    if (!live() || !pending) return;
    copies.retire();
    runtime.current.copy += 1;
    runtime.current.pendingCopy = null;
    setCopyStatus({ kind: 'unconfirmed', field: pending.field });
  }

  async function downloadPdf() {
    if (!live() || runtime.current.pendingPdf) return;
    const request = pdfs.beginLatest();
    if (!request) return;
    const serial = ++runtime.current.pdf;
    const current = () =>
      live() && !request.signal.aborted && runtime.current.pdf === serial;
    runtime.current.pendingPdf = true;
    setPdfStatus('pending');
    let url: string | undefined;
    try {
      if (!(await observe(current)) || !current()) return;
      const api = await createAuthenticatedApiClient(props.identity);
      if (!current()) return;
      const result = await api.downloadCommercialPdf(
        `/offers/opportunities/${encodeURIComponent(owner.source.opportunityId)}/versions/${encodeURIComponent(owner.source.versionId)}/pdf?sourceHtmlSha256=${owner.source.sourceHtmlSha256}`,
        owner.source,
        { companyContextId: owner.source.companyId, signal: request.signal },
      );
      if (!current()) return;
      if (result.status === 'unauthorized' || result.status === 'forbidden') {
        retireComposer();
        await reject(result);
        return;
      }
      if (result.status !== 'ok' || !(await observe(current)) || !current()) {
        if (current()) setPdfStatus('failed');
        return;
      }
      url = URL.createObjectURL(result.value.blob);
      runtime.current.urls.add(url);
      if (!current()) return;
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = result.value.filename;
      if (!current()) return;
      anchor.click();
      if (current()) setPdfStatus('offered');
    } catch {
      if (current()) setPdfStatus('failed');
    } finally {
      request.release();
      if (url) {
        if (runtime.current.urls.delete(url)) URL.revokeObjectURL(url);
      }
      if (current()) {
        runtime.current.pendingPdf = false;
        setPdfStatus((status) => (status === 'pending' ? 'failed' : status));
      }
    }
  }

  return (
    <OfferMessageEditor
      fields={fields}
      source={source}
      target={owner.source}
      actorDisplayName={props.actor.displayName}
      reviewed={review !== null}
      copyStatus={copyStatus}
      pdfStatus={pdfStatus}
      isCurrent={live}
      onClose={retire}
      onEdit={edit}
      onReview={reviewMessage}
      onCopy={(field) => void copyField(field)}
      onDownloadPdf={() => void downloadPdf()}
      onStopWaiting={stopWaiting}
      onRetrySource={() => {
        if (live()) {
          setSource({ kind: 'loading' });
          setSourceAttempt((value) => value + 1);
        }
      }}
    />
  );
}
