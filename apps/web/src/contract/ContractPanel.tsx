import { useContractVersionCopy } from './contract-version.copy';
import { ContractVersionPanel } from './ContractVersionPanel';
import { ContractVersionHistory } from './ContractVersionHistory';
import { ContractDecisionPanel } from './ContractDecisionPanel';
import { ContractSignaturePanel } from './ContractSignaturePanel';
import { ContractProjectsPanel } from './ContractProjectsPanel';
import { useContractSignatureCopy } from './contract-signature.copy';
import { useContractDecisionCopy } from './contract-decision.copy';
import { ContractQualityPanel } from './ContractQualityPanel';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { BrowserIdentity } from '../access-composition';
import type { ActorContext } from '../access-types';
import {
  createAuthenticatedApiClient,
  type ApiResult,
} from '../api/authenticated-api-client';
import { handleAuthenticatedAccessRejection } from '../api/latest-authenticated-request';
import { contractCopy as copy } from './contract.copy';
import {
  readAcceptedOfferSource,
  readContract,
  readContractDetail,
  type ContractView,
} from './contract-response';
import './contract.css';
import { ContractRepresentationViewer } from './ContractRepresentationViewer';
type View =
  | { kind: 'loading' }
  | { kind: 'empty'; acceptedVersionId: string | null }
  | {
      kind: 'ready';
      contract: ContractView;
      stamp: string;
      identity: BrowserIdentity;
    }
  | { kind: 'denied' | 'error' };
type Feedback =
  | 'invalid'
  | 'unavailable'
  | 'conflict'
  | 'uncertain'
  | 'success'
  | 'denied'
  | null;
const ignoreActor = () => undefined;
export function ContractPanel({
  actor,
  identity,
  opportunityId,
  opportunityTitle = '',
  onCompanyContextRejected,
  onActorRevalidated = ignoreActor,
  onWorkspaceAccessRejected = ignoreActor,
  onOpenProject,
}: {
  actor: ActorContext;
  identity: BrowserIdentity;
  opportunityId: string;
  opportunityTitle?: string;
  onCompanyContextRejected: (companyId: string) => void;
  onActorRevalidated?: (actor: ActorContext) => Promise<void> | void;
  onWorkspaceAccessRejected?: () => Promise<void> | void;
  onOpenProject?: (projectId: string) => void;
}) {
  const companyId = actor.activeCompany?.id;
  const context = actor.activeCompany;
  const mayRead = Boolean(
    ((context?.contractPermissionSetVersion === 'v1' &&
      Boolean(context.contractPermissionAssignmentId)) ||
      (context?.contractApproverPermissionSetVersion === 'v1' &&
        Boolean(context.contractApproverAssignmentId))) &&
    context.contractPermissions?.includes('commercial.contract.read') &&
    context.commercialIntakePermissions?.includes(
      'commercial.opportunity.read',
    ),
  );
  const mayPrepare = Boolean(
    mayRead &&
    context?.contractPermissions?.includes('commercial.contract.prepare') &&
    context?.offerPermissions?.includes('commercial.offer.read') &&
    context?.clientPermissions?.includes('client.read'),
  );
  const stamp = JSON.stringify([
    opportunityId,
    actor.internalUserId,
    actor.workspaceId,
    actor.workspaceMembershipId,
    companyId,
    context?.contractPermissionAssignmentId,
    context?.contractPermissionSetVersion,
    context?.contractApproverAssignmentId,
    context?.contractApproverPermissionSetVersion,
    context?.contractPermissions,
    context?.commercialIntakePermissionAssignmentId,
    context?.commercialIntakePermissionSetVersion,
    context?.commercialIntakePermissions,
    context?.clientPermissionAssignmentId,
    context?.clientPermissionSetVersion,
    context?.clientPermissions,
    context?.offerPermissionAssignmentId,
    context?.offerApproverAssignmentId,
    context?.offerPermissions,
    context?.projectPermissions,
    actor.workspacePermissions,
  ]);
  const [view, setView] = useState<View>({ kind: 'loading' }),
    [feedback, setFeedback] = useState<Feedback>(null),
    [running, setRunning] = useState(false),
    [qualityProtected, setQualityProtected] = useState(false),
    [decisionProtected, setDecisionProtected] = useState(false),
    [signatureProtected, setSignatureProtected] = useState(false),
    [projectLinkProtected, setProjectLinkProtected] = useState(false),
    [versionProtected, setVersionProtected] = useState(false),
    [termStartsOn, setStart] = useState(''),
    [termEndsOn, setEnd] = useState(''),
    [specialConditions, setConditions] = useState('');
  const request = useRef<AbortController | undefined>(undefined),
    attempt = useRef<{ body: string; key: string } | undefined>(undefined);
  const locked =
    running ||
    versionProtected ||
    decisionProtected ||
    signatureProtected ||
    projectLinkProtected ||
    feedback === 'uncertain' ||
    qualityProtected;
  async function reject(result: ApiResult<unknown>, signal: AbortSignal) {
    return handleAuthenticatedAccessRejection({
      result,
      identity,
      companyContextId: companyId,
      onCompanyContextRejected,
      onActorRevalidated,
      onWorkspaceAccessRejected,
      signal,
    });
  }
  async function load(signal: AbortSignal, versionId?: string) {
    if (!mayRead || !companyId) {
      setView({ kind: 'denied' });
      return;
    }
    setView({ kind: 'loading' });
    try {
      const api = await createAuthenticatedApiClient(identity);
      if (signal.aborted) return;
      const result = await api.request<unknown>(
        `/contracts/opportunities/${encodeURIComponent(opportunityId)}${versionId ? '/versions/' + encodeURIComponent(versionId) : ''}`,
        { companyContextId: companyId, signal },
      );
      if (signal.aborted) return;
      if (await reject(result, signal)) {
        if (!signal.aborted) setView({ kind: 'denied' });
        return;
      }
      if (signal.aborted) return;
      if (result.status !== 'ok') {
        setView({ kind: 'error' });
        return;
      }
      const contract = readContractDetail(result.value);
      if (contract) {
        if (
          contract.companyId !== companyId ||
          contract.opportunityId !== opportunityId
        )
          throw new Error('Mismatched Contract.');
        setView({ kind: 'ready', contract, stamp, identity });
        return;
      }
      let acceptedVersionId: string | null = null;
      if (mayPrepare) {
        const source = await api.request<unknown>(
          `/offers/opportunities/${encodeURIComponent(opportunityId)}`,
          { companyContextId: companyId, signal },
        );
        if (signal.aborted) return;
        if (await reject(source, signal)) {
          if (!signal.aborted) setView({ kind: 'denied' });
          return;
        }
        if (signal.aborted) return;
        if (source.status !== 'ok') {
          setView({ kind: 'error' });
          return;
        }
        acceptedVersionId = readAcceptedOfferSource(source.value);
      }
      setView({ kind: 'empty', acceptedVersionId });
    } catch {
      if (!signal.aborted) setView({ kind: 'error' });
    }
  }
  useEffect(() => {
    request.current?.abort();
    attempt.current = undefined;
    setFeedback(null);
    setRunning(false);
    setStart('');
    setEnd('');
    setConditions('');
    const controller = new AbortController();
    request.current = controller;
    void load(controller.signal);
    return () => {
      controller.abort();
      request.current?.abort();
    };
    // This authority key captures every input which can invalidate business state.
  }, [stamp, opportunityId, identity]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (
      running ||
      !mayPrepare ||
      !companyId ||
      view.kind !== 'empty' ||
      !view.acceptedVersionId
    )
      return;
    if (
      !attempt.current &&
      ((termStartsOn && termEndsOn && termEndsOn < termStartsOn) ||
        specialConditions.length > 4000)
    ) {
      setFeedback('invalid');
      return;
    }
    const command = attempt.current ?? {
      key: crypto.randomUUID(),
      body: JSON.stringify({
        acceptedOfferVersionId: view.acceptedVersionId,
        termStartsOn: termStartsOn || null,
        termEndsOn: termEndsOn || null,
        specialConditions: specialConditions || null,
      }),
    };
    attempt.current = command;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setRunning(true);
    setFeedback(null);
    try {
      const api = await createAuthenticatedApiClient(identity);
      if (controller.signal.aborted) return;
      const result = await api.request<unknown>(
        `/contracts/opportunities/${encodeURIComponent(opportunityId)}`,
        {
          method: 'POST',
          companyContextId: companyId,
          headers: {
            'content-type': 'application/json',
            'idempotency-key': command.key,
          },
          body: command.body,
          signal: controller.signal,
        },
      );
      if (controller.signal.aborted) return;
      const denied = await reject(result, controller.signal);
      if (controller.signal.aborted) return;
      if (denied) {
        attempt.current = undefined;
        setFeedback('denied');
        setView({ kind: 'denied' });
      } else if (result.status === 'ok') {
        const contract = readContract(result.value);
        if (
          contract.companyId !== companyId ||
          contract.opportunityId !== opportunityId ||
          contract.sourceOfferVersionId !== view.acceptedVersionId
        )
          throw new Error('Mismatched Contract result.');
        attempt.current = undefined;
        setView({ kind: 'ready', contract, stamp, identity });
        setFeedback('success');
      } else if (result.status === 'validation') {
        attempt.current = undefined;
        setFeedback('invalid');
      } else if (result.status === 'conflict') {
        attempt.current = undefined;
        setFeedback('conflict');
      } else if (result.status === 'notFound') {
        attempt.current = undefined;
        setFeedback('unavailable');
      } else setFeedback('uncertain');
    } catch {
      if (!controller.signal.aborted) setFeedback('uncertain');
    } finally {
      if (!controller.signal.aborted) setRunning(false);
    }
  }
  if (!mayRead) return null;
  return (
    <section className="contract-panel" aria-label={copy.title}>
      <h4>{copy.title}</h4>
      <p className="contract-banner">{copy.banner}</p>
      {view.kind === 'loading' && <p role="status">{copy.loading}</p>}
      {(view.kind === 'error' || view.kind === 'denied') && (
        <p role="alert">{copy[view.kind]}</p>
      )}
      {view.kind === 'empty' && (
        <>
          <p>{copy.empty}</p>
          {!view.acceptedVersionId && <p>{copy.awaiting}</p>}
        </>
      )}
      {view.kind === 'ready' &&
        view.stamp === stamp &&
        view.identity === identity &&
        view.contract.companyId === companyId &&
        view.contract.opportunityId === opportunityId &&
        companyId && (
          <>
            <ContractSummary contract={view.contract} />
            <ContractVersionHistory
              key={stamp + ':history'}
              identity={identity}
              companyId={companyId}
              opportunityId={opportunityId}
              contract={view.contract}
              locked={locked || qualityProtected}
              reject={reject}
              onOpen={(versionId) => {
                request.current?.abort();
                const controller = new AbortController();
                request.current = controller;
                void load(controller.signal, versionId);
              }}
            />
            <ContractVersionPanel
              key={
                stamp +
                ':revision:' +
                view.contract.version.id +
                ':' +
                view.contract.revision
              }
              identity={identity}
              companyId={companyId}
              opportunityId={opportunityId}
              contract={view.contract}
              mayRevise={Boolean(
                context?.contractPermissionSetVersion === 'v1' &&
                context.contractPermissionAssignmentId &&
                context.contractPermissions?.includes(
                  'commercial.contract.prepare',
                ) &&
                (context.clientPermissions?.includes('client.read') ||
                  actor.workspacePermissions.includes('client.manage')),
              )}
              protectedCommand={
                qualityProtected ||
                decisionProtected ||
                signatureProtected ||
                projectLinkProtected
              }
              reject={reject}
              onProtectionChange={setVersionProtected}
              onCreated={() => {
                request.current?.abort();
                const controller = new AbortController();
                request.current = controller;
                void load(controller.signal);
              }}
            />

            <ContractRepresentationViewer
              key={stamp + opportunityId + view.contract.version.id}
              identity={identity}
              companyId={companyId}
              opportunityId={opportunityId}
              contractId={view.contract.id}
              versionId={view.contract.version.id}
              onCompanyContextRejected={onCompanyContextRejected}
              onActorRevalidated={onActorRevalidated}
              onWorkspaceAccessRejected={onWorkspaceAccessRejected}
            />
            <ContractDecisionPanel
              key={stamp + ':decision:' + view.contract.version.id}
              identity={identity}
              companyId={companyId}
              opportunityId={opportunityId}
              contract={view.contract}
              mayDecide={Boolean(
                !view.contract.version.supersededByVersionId &&
                context?.contractPermissions?.includes(
                  'commercial.contract.approve',
                ),
              )}
              protectedChecks={
                versionProtected ||
                qualityProtected ||
                signatureProtected ||
                projectLinkProtected
              }
              reject={reject}
              onProtectionChange={setDecisionProtected}
              onDecision={(decision) =>
                setView((current) =>
                  current.kind === 'ready'
                    ? {
                        ...current,
                        contract: {
                          ...current.contract,
                          revision: decision.revision,
                          version: {
                            ...current.contract.version,
                            decision,
                            decisionState:
                              decision.kind === 'APPROVE'
                                ? 'APPROVED'
                                : 'REJECTED',
                            latestQualityRun:
                              decision.kind === 'APPROVE'
                                ? decision.qualityRun
                                : current.contract.version.latestQualityRun,
                          },
                        },
                      }
                    : current,
                )
              }
            />
            <ContractSignaturePanel
              key={stamp + ':signature:' + view.contract.version.id}
              identity={identity}
              companyId={companyId}
              opportunityId={opportunityId}
              contract={view.contract}
              mayRecord={Boolean(
                !view.contract.version.supersededByVersionId &&
                context?.contractApproverPermissionSetVersion === 'v1' &&
                context.contractApproverAssignmentId &&
                context.contractPermissions?.includes(
                  'commercial.contract.signature.record',
                ),
              )}
              protectedChecks={
                versionProtected ||
                qualityProtected ||
                decisionProtected ||
                projectLinkProtected
              }
              reject={reject}
              onProtectionChange={setSignatureProtected}
              onSignature={(signature) =>
                setView((current) =>
                  current.kind === 'ready'
                    ? {
                        ...current,
                        contract: {
                          ...current.contract,
                          revision: signature.revision,
                          version: {
                            ...current.contract.version,
                            executionState: 'EXECUTED',
                            signature,
                            latestQualityRun: signature.qualityRun,
                          },
                        },
                      }
                    : current,
                )
              }
            />
            <ContractProjectsPanel
              key={stamp + ':projects:' + view.contract.id}
              identity={identity}
              companyId={companyId}
              opportunityId={opportunityId}
              contract={view.contract}
              opportunityTitle={opportunityTitle}
              mayCreate={Boolean(
                context?.projectPermissions?.includes('project.create'),
              )}
              mayLink={Boolean(
                context?.contractPermissionSetVersion === 'v1' &&
                context.contractPermissionAssignmentId &&
                context.contractPermissions?.includes(
                  'commercial.contract.project.link',
                ) &&
                context.projectPermissions?.includes('project.read') &&
                (context.clientPermissions?.includes('client.read') ||
                  actor.workspacePermissions.includes('client.manage')),
              )}
              protectedCommand={
                versionProtected ||
                qualityProtected ||
                decisionProtected ||
                signatureProtected
              }
              reject={reject}
              onProtectionChange={setProjectLinkProtected}
              onOpenProject={onOpenProject}
              onReload={() => {
                const controller = new AbortController();
                request.current = controller;
                void load(controller.signal);
              }}
              onLinked={(link, project) =>
                setView((current) =>
                  current.kind === 'ready'
                    ? {
                        ...current,
                        contract: {
                          ...current.contract,
                          revision: link.revision,
                          linkedProjects: [
                            {
                              id: project.id,
                              title: project.title,
                              status: project.status,
                              createdAt: project.createdAt,
                              link,
                            },
                            ...current.contract.linkedProjects,
                          ],
                        },
                      }
                    : current,
                )
              }
            />
            <ContractQualityPanel
              key={
                stamp +
                ':' +
                opportunityId +
                ':' +
                view.contract.version.id +
                ':' +
                (view.contract.version.decision?.kind === 'APPROVE'
                  ? view.contract.version.decision.qualityRun.id
                  : 'review')
              }
              identity={identity}
              companyId={companyId}
              opportunityId={opportunityId}
              versionId={view.contract.version.id}
              termEndsOn={view.contract.version.termEndsOn}
              initialRun={view.contract.version.latestQualityRun}
              mayRun={
                !view.contract.version.supersededByVersionId &&
                !versionProtected &&
                !decisionProtected &&
                !signatureProtected &&
                !projectLinkProtected &&
                Boolean(
                  context?.contractPermissions?.includes(
                    'commercial.contract.prepare',
                  ) ||
                  context?.contractPermissions?.includes(
                    'commercial.contract.approve',
                  ),
                )
              }
              protectedDecision={
                versionProtected ||
                decisionProtected ||
                signatureProtected ||
                projectLinkProtected
              }
              onRun={(run) =>
                setView((current) =>
                  current.kind === 'ready'
                    ? {
                        ...current,
                        contract: {
                          ...current.contract,
                          version: {
                            ...current.contract.version,
                            latestQualityRun: run,
                          },
                        },
                      }
                    : current,
                )
              }
              reject={reject}
              onProtectionChange={setQualityProtected}
            />
          </>
        )}
      {view.kind === 'empty' && view.acceptedVersionId && mayPrepare && (
        <form onSubmit={(event) => void submit(event)}>
          <label>
            {copy.start}
            <input
              type="date"
              value={termStartsOn}
              disabled={locked}
              onChange={(event) => setStart(event.target.value)}
            />
          </label>
          <label>
            {copy.end}
            <input
              type="date"
              value={termEndsOn}
              disabled={locked}
              onChange={(event) => setEnd(event.target.value)}
            />
          </label>
          <label>
            {copy.conditions}
            <textarea
              maxLength={4000}
              value={specialConditions}
              disabled={locked}
              onChange={(event) => setConditions(event.target.value)}
            />
          </label>
          <button type="submit" disabled={running}>
            {running
              ? copy.running
              : feedback === 'uncertain'
                ? copy.retry
                : copy.create}
          </button>
        </form>
      )}
      {feedback && (
        <p role={feedback === 'success' ? 'status' : 'alert'}>
          {copy[feedback]}
        </p>
      )}
      <button
        type="button"
        disabled={locked || view.kind === 'loading'}
        onClick={() => {
          setFeedback(null);
          request.current?.abort();
          const controller = new AbortController();
          request.current = controller;
          void load(controller.signal);
        }}
      >
        {copy.refresh}
      </button>
    </section>
  );
}
function ContractSummary({ contract }: { contract: ContractView }) {
  const { version } = contract;
  const versionCopy = useContractVersionCopy();
  const decisionCopy = useContractDecisionCopy();
  const signatureCopy = useContractSignatureCopy();
  return (
    <>
      <p>
        {copy.reference} {contract.illustrativeReference} ·{' '}
        {versionCopy('versionLabel')} {version.versionNumber}
      </p>
      <p>
        {decisionCopy(
          version.decisionState === 'APPROVED'
            ? 'approved'
            : version.decisionState === 'REJECTED'
              ? 'rejected'
              : 'pending',
        )}{' '}
        ·{' '}
        {version.executionState === 'EXECUTED'
          ? signatureCopy('executed')
          : copy.execution}
      </p>
      <dl>
        <dt>{copy.source}</dt>
        <dd>
          {copy.reference} {contract.sourceOffer.illustrativeReference} ·{' '}
          {copy.sourceVersion} {contract.sourceOffer.versionNumber}
        </dd>
        <dt>{copy.issuer}</dt>
        <dd>{version.issuingCompanyLabel}</dd>
        <dt>{copy.party}</dt>
        <dd>
          {version.recipient.legalName}
          <br />
          {version.recipient.taxId ?? copy.missing}
          <br />
          {version.recipient.legalAddress ?? copy.missing}
        </dd>
        <dt>{copy.scope}</dt>
        <dd>{version.scopeNote ?? copy.missing}</dd>
        <dt>{copy.commercial}</dt>
        <dd>{version.commercialConditions ?? copy.missing}</dd>
        <dt>{copy.start}</dt>
        <dd>{version.termStartsOn ?? copy.missing}</dd>
        <dt>{copy.end}</dt>
        <dd>{version.termEndsOn ?? copy.missing}</dd>
        <dt>{copy.conditions}</dt>
        <dd>{version.specialConditions ?? copy.missing}</dd>
      </dl>
      <div className="contract-price">
        <table>
          <caption>
            {copy.price} ({version.pricingSnapshot.currency})
          </caption>
          <thead>
            <tr>
              <th>{copy.service}</th>
              <th>{copy.quantity}</th>
              <th>{copy.net}</th>
              <th>{copy.lineTax}</th>
            </tr>
          </thead>
          <tbody>
            {version.pricingSnapshot.lines.map((line, index) => (
              <tr key={index}>
                <td>{line.serviceName}</td>
                <td>{line.quantity}</td>
                <td>{line.lineNet}</td>
                <td>{line.lineTax}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p>
        {copy.subtotal}: {version.pricingSnapshot.subtotal} · {copy.tax}:{' '}
        {version.pricingSnapshot.taxTotal} · {copy.total}:{' '}
        {version.pricingSnapshot.total} {version.pricingSnapshot.currency}
      </p>
    </>
  );
}
