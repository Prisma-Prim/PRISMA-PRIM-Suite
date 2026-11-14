import './offer-message.css';
import { useLayoutEffect, useRef, useState } from 'react';
import type { ActorContext } from '../access-types';
import type { BrowserIdentity } from '../access-composition';
import { createAuthenticatedApiClient } from '../api/authenticated-api-client';
import { handleAuthenticatedAccessRejection } from '../api/latest-authenticated-request';
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
  const [, redraw] = useState(0);
  const company = props.actor.activeCompany;
  const capture = offerMessageReadCapture(props.actor);
  const readable =
    props.actor.active &&
    props.identity.loaded &&
    props.identity.signedIn &&
    company?.commercialIntakePermissions?.includes(
      'commercial.request.read',
    ) === true &&
    company?.commercialIntakePermissions?.includes(
      'commercial.opportunity.read',
    ) === true &&
    company.offerPermissions?.includes('commercial.offer.read') === true;
  const authority = JSON.stringify([
    props.actor.internalUserId,
    props.actor.workspaceMembershipId,
    props.actor.workspaceId,
    company?.id,
    capture,
    readable,
  ]);
  const completeActor = JSON.stringify(props.actor);
  const context = useRef<{
    owner: Owner | null;
    completeActor: string;
    actor: ActorContext;
    identity: BrowserIdentity;
    observation: number;
    mounted: boolean;
  }>({
    owner: null,
    completeActor,
    actor: props.actor,
    identity: props.identity,
    observation: 0,
    mounted: false,
  });
  if (
    context.current.actor !== props.actor ||
    context.current.completeActor !== completeActor ||
    context.current.identity !== props.identity
  ) {
    context.current.completeActor = completeActor;
    context.current.actor = props.actor;
    context.current.identity = props.identity;
    context.current.observation += 1;
  }
  const targetKey = props.target
    ? JSON.stringify([props.target.generation, props.target.source])
    : null;
  if (targetKey === null) context.current.owner = null;
  else if (context.current.owner?.key !== targetKey && props.target) {
    context.current.owner = {
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
    };
  }
  const owner = context.current.owner;
  if (
    owner &&
    (owner.authority !== authority || owner.identity !== props.identity)
  )
    owner.retired = true;
  useLayoutEffect(() => {
    context.current.mounted = true;
    return () => {
      context.current.mounted = false;
    };
  }, []);
  if (!owner) return null;
  if (owner.retired)
    return (
      <p className="offer-message-retired" role="status">
        {copy('retired')}
      </p>
    );
  const isCurrent = () =>
    context.current.mounted &&
    context.current.owner === owner &&
    !owner.retired;
  const recoveryGuard = () => {
    const observation = context.current.observation;
    return () =>
      context.current.mounted &&
      context.current.owner === owner &&
      context.current.identity === owner.identity &&
      context.current.observation === observation;
  };
  const retire = () => {
    if (!isCurrent()) return;
    owner.retired = true;
    redraw((value) => value + 1);
  };
  return (
    <Preparation
      key={owner.key}
      {...props}
      owner={owner}
      isCurrent={isCurrent}
      recoveryGuard={recoveryGuard}
      retire={retire}
    />
  );
}

function Preparation({
  owner,
  isCurrent,
  recoveryGuard,
  retire,
  ...props
}: Props & {
  owner: Owner;
  isCurrent: () => boolean;
  recoveryGuard: () => () => boolean;
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
    mounted: boolean;
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
    requests: Set<AbortController>;
    urls: Set<string>;
  }>({
    mounted: false,
    edit: 0,
    review: 0,
    copy: 0,
    pdf: 0,
    pendingCopy: null,
    pendingPdf: false,
    requests: new Set<AbortController>(),
    urls: new Set<string>(),
  });
  const fieldsRef = useRef(fields);
  fieldsRef.current = fields;
  const reviewRef = useRef(review);
  reviewRef.current = review;
  const observationRef = useRef<OfferMessageObservation | null>(null);
  const live = () => runtime.current.mounted && isCurrent();

  useLayoutEffect(() => {
    runtime.current.mounted = true;
    const lifetime = runtime.current;
    return () => {
      lifetime.mounted = false;
      lifetime.copy += 1;
      lifetime.pdf += 1;
      for (const request of lifetime.requests) request.abort();
      for (const url of lifetime.urls) URL.revokeObjectURL(url);
      lifetime.urls.clear();
    };
  }, []);

  async function observe(current: () => boolean) {
    if (!live() || !owner.capture) return null;
    const request = new AbortController();
    runtime.current.requests.add(request);
    const recoverable = recoveryGuard();
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
        retire();
        // Retirement clears the composer first. Recovery has a distinct complete-
        // Actor observation guard, so this denial can recover without reviving text.
        await handleAuthenticatedAccessRejection({
          result,
          identity: props.identity,
          companyContextId: owner.source.companyId,
          onCompanyContextRejected: props.onCompanyContextRejected,
          onActorRevalidated: props.onActorRevalidated,
          onWorkspaceAccessRejected: props.onWorkspaceAccessRejected,
          isCurrent: recoverable,
        });
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
        retire();
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
      runtime.current.requests.delete(request);
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
    const text = fieldsRef.current[field];
    const serial = ++runtime.current.copy;
    const edit = runtime.current.edit;
    const current = () =>
      live() &&
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
    runtime.current.copy += 1;
    runtime.current.pendingCopy = null;
    setCopyStatus({ kind: 'unconfirmed', field: pending.field });
  }

  async function downloadPdf() {
    if (!live() || runtime.current.pendingPdf) return;
    const serial = ++runtime.current.pdf;
    const current = () => live() && runtime.current.pdf === serial;
    runtime.current.pendingPdf = true;
    setPdfStatus('pending');
    let url: string | undefined;
    const request = new AbortController();
    runtime.current.requests.add(request);
    const recoverable = recoveryGuard();
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
        retire();
        await handleAuthenticatedAccessRejection({
          result,
          identity: props.identity,
          companyContextId: owner.source.companyId,
          onCompanyContextRejected: props.onCompanyContextRejected,
          onActorRevalidated: props.onActorRevalidated,
          onWorkspaceAccessRejected: props.onWorkspaceAccessRejected,
          isCurrent: recoverable,
        });
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
      runtime.current.requests.delete(request);
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
