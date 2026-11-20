import { useState } from 'react';
import { useAuthorityLifetime } from '../access/use-authority-lifetime';
import {
  useActorObservation,
  useRequestLifetime,
} from '../api/use-actor-requests';
import { useScopedOperationGroup } from '../api/use-scoped-operation';
import type { ActorContext } from '../access-types';
import { grantOf, holds } from '../access/company-grants';
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
    grantOf(c, 'company_director_client_access'),
    grantOf(c, 'company_project_access'),
    grantOf(c, 'company_document_registrar'),
    grantOf(c, 'company_document_content_reader'),
    grantOf(c, 'company_mission_deliverable_access'),
    grantOf(c, 'company_received_contract_access'),
  ]);
}
/** Each observed scope/identity transition retires the previous owner permanently, including A→B→A. */
export function ProjectPdfBundle(props: Props) {
  const generation = useRequestLifetime(props.identity, capture(props));
  return <BundleSession key={generation} {...props} />;
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
  const discoveryWork = useScopedOperationGroup('project-pdf-associations');
  const versionWork = useScopedOperationGroup('project-pdf-versions');
  const downloadWork = useScopedOperationGroup('project-pdf-download');
  const captureRecovery = useAuthorityLifetime(
    String(useActorObservation(actor)),
    identity,
  );
  const company = actor.activeCompany;
  const canRead =
    actor.active &&
    holds(company, 'company_project_access', 'project.read') &&
    holds(company, 'company_document_registrar', 'document.read') &&
    holds(
      company,
      'company_document_content_reader',
      'document.content.read',
    ) &&
    (actor.workspacePermissions.includes('client.manage') ||
      holds(company, 'company_director_client_access', 'client.read'));
  function retire() {
    discoveryWork.retire();
    versionWork.retire();
    downloadWork.retire();
  }
  function deny() {
    retire();
    setDiscovery({ kind: 'denied' });
    setReads(new Map());
    setSelected([]);
    setFeedback(null);
    setPending(false);
  }
  async function discover() {
    if (!canRead || downloadWork.isPending()) return;
    retire();
    setSelected([]);
    setReads(new Map());
    setFeedback(null);
    setWindowSize(10);
    setDiscovery({ kind: 'loading' });
    const request = discoveryWork.beginLatest();
    if (!request) return;
    const { signal } = request;
    const canRejectSession = captureRecovery();
    let received = false;
    try {
      const api = await createAuthenticatedApiClient(identity);
      if (signal.aborted) return;
      const result = await api.request(`/projects/${projectId}/documents`, {
        companyContextId: company?.id,
        signal,
      });
      if (signal.aborted) return;
      if (result.status === 'unauthorized') {
        deny();
        if (canRejectSession()) await identity.rejectSession();
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
      if (!signal.aborted)
        setDiscovery({ kind: received ? 'malformed' : 'error' });
    } finally {
      request.release();
    }
  }
  async function loadVersions(row: Association) {
    const request = versionWork.begin();
    if (!request) return;
    const { signal } = request;
    const canRejectSession = captureRecovery();
    setReads((current) =>
      new Map(current).set(row.document.id, { kind: 'loading' }),
    );
    let received = false;
    try {
      const api = await createAuthenticatedApiClient(identity);
      if (signal.aborted) return;
      const result = await api.request(
        `/documents/${row.document.id}/versions`,
        { companyContextId: company?.id, signal },
      );
      if (signal.aborted) return;
      if (result.status === 'unauthorized') {
        deny();
        if (canRejectSession()) await identity.rejectSession();
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
      if (!signal.aborted)
        setReads((current) =>
          new Map(current).set(row.document.id, {
            kind: received ? 'malformed' : 'error',
          }),
        );
    } finally {
      request.release();
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
    if (
      downloadWork.isPending() ||
      selected.length === 0 ||
      feedback === 'stale'
    )
      return;
    const request = downloadWork.begin();
    if (!request) return;
    const { signal } = request;
    const canRejectSession = captureRecovery();
    setPending(true);
    setFeedback(null);
    try {
      const api = await createAuthenticatedApiClient(identity);
      if (signal.aborted) return;
      const result = await api.downloadSelection(
        `/projects/${projectId}/pdf-bundle`,
        JSON.stringify({ items: selected.map((s) => s.item) }),
        { companyContextId: company?.id, signal },
      );
      if (signal.aborted) return;
      if (result.status === 'unauthorized') {
        deny();
        if (canRejectSession()) await identity.rejectSession();
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
      if (!signal.aborted) setFeedback('error');
    } finally {
      request.release();
      if (!signal.aborted) setPending(false);
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
