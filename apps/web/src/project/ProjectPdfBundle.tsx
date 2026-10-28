import { useEffect, useRef, useState } from 'react';
import type { ActorContext } from '../access-types';
import type { BrowserIdentity } from '../access-composition';
import { createAuthenticatedApiClient } from '../api/authenticated-api-client';
import type { DocumentVersion } from '../documents/document-response';
import {
  readProjectPdfAssociations,
  readProjectPdfVersions,
  type Association,
  type Discovery,
  type VersionRead,
  type Selected,
  type Feedback,
} from './project-pdf-bundle-read';
import { ProjectPdfBundleView } from './ProjectPdfBundleView';
import { useProjectPdfBundleCopy } from './project-pdf-bundle.copy';
import './project-pdf-bundle.css';
type Props = {
  actor: ActorContext;
  identity: BrowserIdentity;
  projectId: string;
  originalClientId: string;
};
function capture({ actor, projectId, originalClientId }: Props) {
  const c = actor.activeCompany;
  return JSON.stringify([
    projectId,
    originalClientId,
    actor.active,
    actor.internalUserId,
    actor.workspaceId,
    actor.workspaceMembershipId,
    actor.workspacePermissions.includes('client.manage'),
    c?.id,
    c?.clientPermissions,
    c?.clientPermissionAssignmentId,
    c?.clientPermissionSetVersion,
    c?.projectPermissions,
    c?.projectPermissionAssignmentId,
    c?.projectPermissionSetVersion,
    c?.documentPermissionAssignmentId,
    c?.documentPermissionSetVersion,
    c?.documentPermissions
      ?.filter((p) =>
        [
          'document.read',
          'document.reference.read',
          'document.content.read',
          'document.mission_deliverable.access',
          'document.received_contract.access',
        ].includes(p),
      )
      .sort(),
    c?.documentContentReaderAssignmentId,
    c?.documentContentReaderPermissionSetVersion,
    c?.missionDeliverableAccessAssignmentId,
    c?.missionDeliverableAccessPermissionSetVersion,
    c?.receivedContractAccessAssignmentId,
    c?.receivedContractAccessPermissionSetVersion,
  ]);
}
/** Each observed scope/identity transition retires the previous owner permanently, including A→B→A. */
export function ProjectPdfBundle(props: Props) {
  const key = capture(props);
  const owner = useRef({ key, identity: props.identity, generation: 0 });
  if (owner.current.key !== key || owner.current.identity !== props.identity)
    owner.current = {
      key,
      identity: props.identity,
      generation: owner.current.generation + 1,
    };
  return <BundleSession key={owner.current.generation} {...props} />;
}
function BundleSession({
  actor,
  identity,
  projectId,
  originalClientId,
}: Props) {
  const copy = useProjectPdfBundleCopy();
  const [discovery, setDiscovery] = useState<Discovery>({ kind: 'idle' });
  const [reads, setReads] = useState<ReadonlyMap<string, VersionRead>>(
    new Map(),
  );
  const [selected, setSelected] = useState<Selected[]>([]);
  const [windowSize, setWindowSize] = useState(10);
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const lifetime = useRef({
    active: true,
    requests: new Set<AbortController>(),
    download: false,
  });
  useEffect(() => {
    const owner = lifetime.current;
    owner.active = true;
    return () => {
      owner.active = false;
      for (const request of owner.requests) request.abort();
    };
  }, []);
  const company = actor.activeCompany;
  const canRead =
    actor.active &&
    company?.projectPermissions?.includes('project.read') &&
    company.documentPermissions?.includes('document.read') &&
    company.documentPermissions.includes('document.content.read') &&
    company.documentContentReaderPermissionSetVersion === 'v1' &&
    !!company.documentContentReaderAssignmentId &&
    (actor.workspacePermissions.includes('client.manage') ||
      company.clientPermissions?.includes('client.read'));
  function request() {
    const controller = new AbortController();
    lifetime.current.requests.add(controller);
    return controller;
  }
  function live(controller: AbortController) {
    return lifetime.current.active && !controller.signal.aborted;
  }
  function deny() {
    for (const controller of lifetime.current.requests) controller.abort();
    setDiscovery({ kind: 'denied' });
    setReads(new Map());
    setSelected([]);
    setFeedback(null);
    setPending(false);
  }
  async function discover() {
    if (!canRead || pending) return;
    for (const controller of lifetime.current.requests) controller.abort();
    setSelected([]);
    setReads(new Map());
    setFeedback(null);
    setWindowSize(10);
    setDiscovery({ kind: 'loading' });
    const controller = request();
    let received = false;
    try {
      const api = await createAuthenticatedApiClient(identity);
      if (!live(controller)) return;
      const result = await api.request<unknown>(
        `/projects/${projectId}/documents`,
        { companyContextId: company?.id, signal: controller.signal },
      );
      if (!live(controller)) return;
      if (result.status === 'unauthorized') {
        deny();
        await identity.rejectSession();
        return;
      }
      if (result.status === 'forbidden' || result.status === 'notFound') {
        deny();
        return;
      }
      if (result.status !== 'ok') {
        setDiscovery({ kind: 'error' });
        return;
      }
      received = true;
      const documents = readProjectPdfAssociations(result.value, {
        companyId: company?.id,
        actor,
        originalClientId,
      });
      setDiscovery({ kind: 'ready', documents });
    } catch {
      if (live(controller))
        setDiscovery({ kind: received ? 'malformed' : 'error' });
    } finally {
      lifetime.current.requests.delete(controller);
    }
  }
  async function loadVersions(row: Association) {
    const controller = request();
    setReads((current) =>
      new Map(current).set(row.document.id, { kind: 'loading' }),
    );
    let received = false;
    try {
      const api = await createAuthenticatedApiClient(identity);
      if (!live(controller)) return;
      const result = await api.request<unknown>(
        `/documents/${row.document.id}/versions`,
        { companyContextId: company?.id, signal: controller.signal },
      );
      if (!live(controller)) return;
      if (result.status === 'unauthorized') {
        deny();
        await identity.rejectSession();
        return;
      }
      if (result.status === 'forbidden' || result.status === 'notFound') {
        deny();
        return;
      }
      if (result.status !== 'ok') {
        setReads((current) =>
          new Map(current).set(row.document.id, { kind: 'error' }),
        );
        return;
      }
      received = true;
      const versions = readProjectPdfVersions(result.value, row.document.type);
      setReads((current) =>
        new Map(current).set(row.document.id, {
          kind: 'ready',
          versions,
        }),
      );
    } catch {
      if (live(controller))
        setReads((current) =>
          new Map(current).set(row.document.id, {
            kind: received ? 'malformed' : 'error',
          }),
        );
    } finally {
      lifetime.current.requests.delete(controller);
    }
  }
  function select(row: Association, version: DocumentVersion) {
    const pdf = version.pdfContent;
    if (
      pdf.state !== 'stored' ||
      pdf.access !== 'granted' ||
      pending ||
      feedback === 'stale'
    )
      return;
    if (selected.length >= 20) {
      setFeedback('limit');
      return;
    }
    if (
      selected.some(
        (s) =>
          s.item.documentId === row.document.id &&
          s.item.versionId === version.id,
      )
    )
      return;
    setFeedback(null);
    setSelected((current) => [
      ...current,
      {
        item: {
          documentId: row.document.id,
          versionId: version.id,
          representationId: pdf.representationId,
          expectedProjectRevision: row.revision,
        },
        title: row.document.title,
        number: version.number,
        status: version.status,
        fileName: pdf.fileName,
        size: pdf.size,
      },
    ]);
  }
  async function download() {
    const owner = lifetime.current;
    if (owner.download || selected.length === 0 || feedback === 'stale') return;
    owner.download = true;
    setPending(true);
    setFeedback(null);
    const controller = request();
    try {
      const api = await createAuthenticatedApiClient(identity);
      if (!live(controller)) return;
      const result = await api.downloadSelection(
        `/projects/${projectId}/pdf-bundle`,
        JSON.stringify({ items: selected.map((s) => s.item) }),
        { companyContextId: company?.id, signal: controller.signal },
      );
      if (!live(controller)) return;
      if (result.status === 'unauthorized') {
        deny();
        await identity.rejectSession();
        return;
      }
      if (result.status === 'forbidden' || result.status === 'notFound') {
        deny();
        return;
      }
      if (result.status === 'conflict') {
        setFeedback('stale');
        return;
      }
      if (result.status === 'tooLarge') {
        setFeedback('oversize');
        return;
      }
      if (result.status !== 'ok') {
        setFeedback('error');
        return;
      }
      const url = URL.createObjectURL(result.value);
      try {
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = 'selected-project-pdfs.zip';
        anchor.click();
      } finally {
        URL.revokeObjectURL(url);
      }
    } catch {
      if (live(controller)) setFeedback('error');
    } finally {
      owner.download = false;
      owner.requests.delete(controller);
      if (live(controller)) setPending(false);
    }
  }
  return (
    <ProjectPdfBundleView
      copy={copy}
      canRead={canRead === true}
      discovery={discovery}
      reads={reads}
      selected={selected}
      pending={pending}
      feedback={feedback}
      windowSize={windowSize}
      discover={discover}
      loadVersions={loadVersions}
      select={select}
      download={download}
      remove={(entry) => {
        setSelected((current) => current.filter((item) => item !== entry));
        if (feedback !== 'stale') setFeedback(null);
      }}
      clear={() => {
        setSelected([]);
        if (feedback !== 'stale') setFeedback(null);
      }}
      showMore={() => setWindowSize((n) => n + 10)}
    />
  );
}
