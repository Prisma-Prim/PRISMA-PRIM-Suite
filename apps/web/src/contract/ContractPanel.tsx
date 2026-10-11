import { ContractDirectEditor } from './ContractDirectEditor';
import { ContractPrecontractEditor } from './ContractPrecontractEditor';
import { useContractPrecontractCopy } from './contract-precontract.copy';
import { useContractDirectCopy } from './contract-direct.copy';
import { ContractAddendumEditor } from './ContractAddendumEditor';
import { useContractAddendumCopy } from './contract-addendum.copy';
import { contractQualityRunBinding } from './contract-response';
import { useContractRuleSetCopy } from './contract-rule-set.copy';
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
  readOpportunityContracts,
  type ContractView,
  type PrecontractSummary,
} from './contract-response';
import './contract.css';
import { ContractRepresentationViewer } from './ContractRepresentationViewer';
type View =
  | { kind: 'loading' }
  | {
      kind: 'empty';
      acceptedVersionId: string | null;
      precontract: PrecontractSummary | null;
    }
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
  currentClientId,
  onCompanyContextRejected,
  onActorRevalidated = ignoreActor,
  onWorkspaceAccessRejected = ignoreActor,
  onOpenProject,
}: {
  actor: ActorContext;
  identity: BrowserIdentity;
  opportunityId: string;
  opportunityTitle?: string;
  currentClientId?: string;
  onCompanyContextRejected: (companyId: string) => void;
  onActorRevalidated?: (actor: ActorContext) => Promise<void> | void;
  onWorkspaceAccessRejected?: () => Promise<void> | void;
  onOpenProject?: (projectId: string) => void;
}) {
  const addendumCopy = useContractAddendumCopy();
  const precontractCopy = useContractPrecontractCopy();
  const decisionCopy = useContractDecisionCopy();
  const signatureCopy = useContractSignatureCopy();
  const versionCopy = useContractVersionCopy();
  const [agreementId, setAgreementId] = useState<string | null>(null);
  const [addendumSuccessId, setAddendumSuccessId] = useState<string | null>(
    null,
  );
  const [precontractSuccessId, setPrecontractSuccessId] = useState<
    string | null
  >(null);
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
  const mayPrepareDirect = Boolean(
    mayRead &&
    context?.contractPermissionSetVersion === 'v1' &&
    context.contractPermissionAssignmentId &&
    context.contractPermissions?.includes('commercial.contract.prepare') &&
    context.clientPermissions?.includes('client.read') &&
    ((context.pricingUserPermissionSetVersion === 'v1' &&
      context.pricingUserPermissionAssignmentId &&
      context.pricingUserPermissions?.includes(
        'commercial.pricing.snapshot.read',
      )) ||
      (context.offerPermissionSetVersion === 'v1' &&
        context.offerPermissionAssignmentId &&
        context.offerPermissions?.includes(
          'commercial.pricing.snapshot.read',
        ))),
  );
  const stamp = JSON.stringify([
    currentClientId,
    opportunityId,
    agreementId,
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
    context?.pricingUserPermissionAssignmentId,
    context?.pricingUserPermissionSetVersion,
    context?.pricingUserPermissions,
    context?.offerPermissionAssignmentId,
    context?.offerPermissionSetVersion,
    context?.offerApproverAssignmentId,
    context?.offerApproverPermissionSetVersion,
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
    [addendumProtected, setAddendumProtected] = useState(false),
    [precontractProtected, setPrecontractProtected] = useState(false),
    [termStartsOn, setStart] = useState(''),
    [termEndsOn, setEnd] = useState(''),
    [specialConditions, setConditions] = useState('');
  const request = useRef<AbortController | undefined>(undefined),
    attempt = useRef<{ body: string; key: string } | undefined>(undefined);
  const locked =
    running ||
    addendumProtected ||
    precontractProtected ||
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
        `/contracts/opportunities/${encodeURIComponent(opportunityId)}${agreementId ? '/agreements/' + encodeURIComponent(agreementId) : ''}${versionId ? '/versions/' + encodeURIComponent(versionId) : ''}`,
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
      // The Opportunity read also names its Precontract; exact reads name one agreement.
      const opened =
        agreementId === null && versionId === undefined
          ? readOpportunityContracts(result.value)
          : { contract: readContractDetail(result.value), precontract: null };
      const contract = opened.contract;
      if (contract) {
        if (
          contract.companyId !== companyId ||
          contract.opportunityId !== opportunityId ||
          (agreementId !== null && contract.id !== agreementId)
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
      setView({
        kind: 'empty',
        acceptedVersionId,
        precontract: opened.precontract,
      });
    } catch {
      if (!signal.aborted) setView({ kind: 'error' });
    }
  }
  useEffect(() => {
    request.current?.abort();
    attempt.current = undefined;
    setFeedback(null);
    setRunning(false);
    setAddendumProtected(false);
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
  useEffect(() => {
    setAgreementId(null);
    setAddendumSuccessId(null);
    setPrecontractSuccessId(null);
  }, [opportunityId, companyId, actor.workspaceId, identity]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (
      running ||
      precontractProtected ||
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
  // The Precontract a ready main Contract records, or the Opportunity's listed one.
  const linkedPrecontractId =
    view.kind === 'ready'
      ? view.contract.kind === 'CONTRACT'
        ? (view.contract.precontract?.id ?? null)
        : null
      : view.kind === 'empty'
        ? (view.precontract?.id ?? null)
        : null;
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
          {view.precontract && (
            <section
              className="contract-precontract"
              aria-label={precontractCopy('section')}
            >
              <h5>{precontractCopy('section')}</h5>
              <p>
                {precontractCopy('reference')}{' '}
                {view.precontract.illustrativeReference} ·{' '}
                {versionCopy('versionLabel')} {view.precontract.versionNumber} ·{' '}
                {decisionCopy(
                  view.precontract.decisionState === 'APPROVED'
                    ? 'approved'
                    : view.precontract.decisionState === 'REJECTED'
                      ? 'rejected'
                      : 'pending',
                )}{' '}
                ·{' '}
                {view.precontract.executionState === 'EXECUTED'
                  ? signatureCopy('executed')
                  : signatureCopy('pending')}
              </p>
              <button
                type="button"
                disabled={locked}
                onClick={() => setAgreementId(linkedPrecontractId)}
              >
                {precontractCopy('open')}
              </button>
            </section>
          )}
          {!view.precontract &&
            view.acceptedVersionId &&
            mayPrepare &&
            companyId && (
              <ContractPrecontractEditor
                key={stamp + ':precontract-create'}
                identity={identity}
                companyId={companyId}
                opportunityId={opportunityId}
                acceptedVersionId={view.acceptedVersionId}
                protectedCommand={
                  running ||
                  feedback === 'uncertain' ||
                  qualityProtected ||
                  decisionProtected ||
                  signatureProtected ||
                  projectLinkProtected ||
                  addendumProtected ||
                  versionProtected
                }
                reject={reject}
                onProtectionChange={setPrecontractProtected}
                onCreated={(id) => {
                  setPrecontractSuccessId(id);
                  setAgreementId(id);
                }}
              />
            )}
          {!view.acceptedVersionId && !mayPrepareDirect && (
            <p>{copy.awaiting}</p>
          )}
          {!view.acceptedVersionId &&
            mayPrepareDirect &&
            companyId &&
            currentClientId && (
              <ContractDirectEditor
                key={stamp + ':direct-create'}
                identity={identity}
                companyId={companyId}
                opportunityId={opportunityId}
                mode={{ kind: 'create', clientId: currentClientId }}
                protectedCommand={
                  running ||
                  qualityProtected ||
                  decisionProtected ||
                  signatureProtected ||
                  projectLinkProtected ||
                  addendumProtected
                }
                reject={reject}
                onProtectionChange={setVersionProtected}
                onCreated={(contract) => {
                  if (contract)
                    setView({ kind: 'ready', contract, stamp, identity });
                }}
              />
            )}
        </>
      )}
      {view.kind === 'ready' &&
        view.stamp === stamp &&
        view.identity === identity &&
        view.contract.companyId === companyId &&
        view.contract.opportunityId === opportunityId &&
        companyId && (
          <>
            {view.contract.kind === 'ADDENDUM' && (
              <button
                type="button"
                disabled={locked}
                onClick={() => {
                  setAddendumSuccessId(null);
                  setAgreementId(
                    view.contract.parent?.kind === 'PRECONTRACT'
                      ? view.contract.parent.id
                      : null,
                  );
                }}
              >
                {addendumCopy('back')}
              </button>
            )}
            {view.contract.kind === 'PRECONTRACT' && (
              <button
                type="button"
                disabled={locked}
                onClick={() => {
                  setPrecontractSuccessId(null);
                  setAgreementId(null);
                }}
              >
                {precontractCopy('back')}
              </button>
            )}
            {addendumSuccessId === view.contract.id && (
              <p role="status">{addendumCopy('success')}</p>
            )}
            {precontractSuccessId === view.contract.id && (
              <p role="status">{precontractCopy('success')}</p>
            )}
            <ContractSummary contract={view.contract} />
            {linkedPrecontractId && (
              <button
                type="button"
                disabled={locked}
                onClick={() => setAgreementId(linkedPrecontractId)}
              >
                {precontractCopy('open')}
              </button>
            )}
            {view.contract.kind !== 'ADDENDUM' &&
              view.contract.version.executionState === 'EXECUTED' && (
                <section aria-label={addendumCopy('title')}>
                  <h5>{addendumCopy('title')}</h5>
                  <ol>
                    {view.contract.addenda.map((item) => (
                      <li key={item.id}>
                        <button
                          type="button"
                          disabled={locked}
                          onClick={() => {
                            setAddendumSuccessId(null);
                            setAgreementId(item.id);
                          }}
                        >
                          {addendumCopy('open')} {item.addendumOrdinal}
                        </button>{' '}
                        ·{' '}
                        {decisionCopy(
                          item.decisionState === 'APPROVED'
                            ? 'approved'
                            : item.decisionState === 'REJECTED'
                              ? 'rejected'
                              : 'pending',
                        )}{' '}
                        ·{' '}
                        {signatureCopy(
                          item.executionState === 'EXECUTED'
                            ? 'executed'
                            : 'pending',
                        )}
                      </li>
                    ))}
                  </ol>
                </section>
              )}
            {Boolean(
              context?.contractPermissionSetVersion === 'v1' &&
              context.contractPermissionAssignmentId &&
              context.contractPermissions?.includes(
                'commercial.contract.prepare',
              ) &&
              context.clientPermissions?.includes('client.read'),
            ) &&
              !view.contract.version.supersededByVersionId &&
              (view.contract.kind === 'ADDENDUM'
                ? view.contract.version.executionState !== 'EXECUTED'
                : view.contract.version.executionState === 'EXECUTED') && (
                <ContractAddendumEditor
                  key={
                    stamp +
                    ':addendum:' +
                    view.contract.id +
                    ':' +
                    view.contract.revision
                  }
                  identity={identity}
                  companyId={companyId}
                  opportunityId={opportunityId}
                  contract={view.contract}
                  maySelectSnapshot={Boolean(
                    (context?.pricingUserPermissionSetVersion === 'v1' &&
                      context.pricingUserPermissionAssignmentId &&
                      context.pricingUserPermissions?.includes(
                        'commercial.pricing.snapshot.read',
                      )) ||
                    (context?.offerPermissionSetVersion === 'v1' &&
                      context.offerPermissionAssignmentId &&
                      context.offerPermissions?.includes(
                        'commercial.pricing.snapshot.read',
                      )),
                  )}
                  protectedCommand={
                    versionProtected ||
                    qualityProtected ||
                    decisionProtected ||
                    signatureProtected ||
                    projectLinkProtected
                  }
                  reject={reject}
                  onProtectionChange={setAddendumProtected}
                  onCreated={(id) => {
                    setAddendumSuccessId(id);
                    if (agreementId === id) {
                      request.current?.abort();
                      const controller = new AbortController();
                      request.current = controller;
                      void load(controller.signal);
                    } else setAgreementId(id);
                  }}
                />
              )}

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
            {view.contract.origin === 'ACCEPTED_OFFER' && (
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
                  context.clientPermissions?.includes('client.read'),
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
            )}

            {view.contract.origin === 'DIRECT' &&
              mayPrepareDirect &&
              !view.contract.version.supersededByVersionId &&
              view.contract.version.executionState !== 'EXECUTED' && (
                <ContractDirectEditor
                  key={
                    stamp +
                    ':direct-revise:' +
                    view.contract.version.id +
                    ':' +
                    view.contract.revision
                  }
                  identity={identity}
                  companyId={companyId}
                  opportunityId={opportunityId}
                  mode={{ kind: 'revise', contract: view.contract }}
                  protectedCommand={
                    qualityProtected ||
                    decisionProtected ||
                    signatureProtected ||
                    projectLinkProtected ||
                    addendumProtected
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
              )}
            <ContractRepresentationViewer
              key={stamp + opportunityId + view.contract.version.id}
              identity={identity}
              companyId={companyId}
              opportunityId={opportunityId}
              contractId={view.contract.id}
              kind={view.contract.kind}
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
                addendumProtected ||
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
                addendumProtected ||
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
            {view.contract.kind !== 'ADDENDUM' && (
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
                  addendumProtected ||
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
            )}
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
              agreementId={
                view.contract.kind === 'CONTRACT' ? undefined : view.contract.id
              }
              binding={contractQualityRunBinding(view.contract)}
              initialRun={view.contract.version.latestQualityRun}
              mayRun={
                !view.contract.version.supersededByVersionId &&
                !addendumProtected &&
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
                addendumProtected ||
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
          <button type="submit" disabled={running || precontractProtected}>
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
  const directCopy = useContractDirectCopy();
  const addendumCopy = useContractAddendumCopy();
  const precontractCopy = useContractPrecontractCopy();
  const versionCopy = useContractVersionCopy();
  const decisionCopy = useContractDecisionCopy();
  const signatureCopy = useContractSignatureCopy();
  const ruleSetCopy = useContractRuleSetCopy();
  return (
    <>
      {contract.kind === 'PRECONTRACT' && <h5>{precontractCopy('title')}</h5>}
      {contract.kind === 'ADDENDUM' && (
        <>
          <h5>
            {addendumCopy('itemTitle')} {contract.addendumOrdinal}
          </h5>
          <p>
            {addendumCopy('parent')}: {contract.parent.illustrativeReference}
          </p>
          <dl>
            <dt>{addendumCopy('summary')}</dt>
            <dd>{version.changeSummary}</dd>
          </dl>
        </>
      )}
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
        <dt>
          {contract.origin === 'DIRECT'
            ? directCopy('title')
            : contract.kind === 'ADDENDUM'
              ? addendumCopy('parent')
              : copy.source}
        </dt>
        <dd>
          {contract.origin === 'DIRECT' ? (
            directCopy('origin')
          ) : (
            <>
              {copy.reference}{' '}
              {contract.sourceOffer?.illustrativeReference ??
                contract.parent?.illustrativeReference}{' '}
              · {copy.sourceVersion}{' '}
              {contract.sourceOffer?.versionNumber ??
                contract.parent?.versionNumber}
            </>
          )}
        </dd>
        {contract.origin === 'DIRECT' && (
          <>
            <dt>{directCopy('reason')}</dt>
            <dd>{contract.directReason}</dd>
          </>
        )}
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
        {contract.kind === 'CONTRACT' && (
          <>
            <dt>{precontractCopy('reference')}</dt>
            <dd>
              {contract.precontract?.illustrativeReference ?? copy.missing}
            </dd>
          </>
        )}
        {contract.kind !== 'ADDENDUM' && (
          <>
            <dt>
              {contract.origin === 'DIRECT' ? directCopy('scope') : copy.scope}
            </dt>
            <dd>{version.scopeNote ?? copy.missing}</dd>
            <dt>
              {contract.origin === 'DIRECT'
                ? directCopy('commercial')
                : copy.commercial}
            </dt>
            <dd>{version.commercialConditions ?? copy.missing}</dd>
            <dt>{copy.start}</dt>
            <dd>{version.termStartsOn ?? copy.missing}</dd>
            <dt>{copy.conditions}</dt>
            <dd>{version.specialConditions ?? copy.missing}</dd>
          </>
        )}
        {version.preliminaryWork && (
          <>
            <dt>{precontractCopy('scope')}</dt>
            <dd>{version.preliminaryWork.scope}</dd>
            <dt>{precontractCopy('financial')}</dt>
            <dd>{version.preliminaryWork.financialConditions}</dd>
            <dt>{precontractCopy('limits')}</dt>
            <dd>{version.preliminaryWork.limits}</dd>
          </>
        )}
        <dt>{contract.kind === 'ADDENDUM' ? addendumCopy('end') : copy.end}</dt>
        <dd>{version.termEndsOn ?? copy.missing}</dd>
        <dt>{ruleSetCopy('ruleSet')}</dt>
        <dd>
          {version.qualityRuleSet} v{version.qualityRuleSetVersion}
        </dd>
      </dl>
      {version.qualityRuleSetVersion === 2 && (
        <p>{ruleSetCopy('adjustedSnapshot')}</p>
      )}
      {version.pricingSnapshot ? (
        <>
          <div className="contract-price">
            <table>
              <caption>
                {contract.origin === 'DIRECT'
                  ? directCopy('snapshot')
                  : copy.price}{' '}
                ({version.pricingSnapshot.currency})
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
      ) : (
        <p>{addendumCopy('noSnapshot')}</p>
      )}
      {contract.kind === 'ADDENDUM' && contract.linkedProjects.length > 0 && (
        <section aria-label={addendumCopy('linkedProjects')}>
          <h5>{addendumCopy('linkedProjects')}</h5>
          <ul>
            {contract.linkedProjects.map((project) => (
              <li key={project.id}>{project.title}</li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
