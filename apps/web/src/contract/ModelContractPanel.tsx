import { useCallback, useEffect, useState } from 'react';
import { handleAuthenticatedAccessRejection } from '../api/latest-authenticated-request';
import type { ApiResult } from '../api/authenticated-api-client';
import { ContractProjectsPanel } from './ContractProjectsPanel';
import { SigningPdfDownload } from './SigningPdfDownload';
import type { SigningPdfReference } from './reported-signing-response';
import { ReportedSigningForm } from './ReportedSigningForm';
import { ReportedSigningHistory } from './ReportedSigningHistory';
import {
  reportedSigningAuthority,
  reportedSigningPdfAuthority,
} from './reported-signing-authority';
import { useReportedSigningCopy } from './reported-signing.copy';
import { ContractModelBody } from '../contract-model/ContractModelVersionContent';
import { useContractCopy } from './contract.copy';
import { useContractDecisionCopy } from './contract-decision.copy';
import { useContractVersionCopy } from './contract-version.copy';
import { useModelOfferCopy } from '../offer/model-offer.copy';
import { useModelContractCopy } from './model-contract.copy';
import { ModelContractForm } from './ModelContractForm';
import { ModelContractDetails } from './ModelContractDetails';
import { ModelContractChecks } from './ModelContractChecks';
import {
  useModelContractJourney,
  type ModelContractJourneyProps,
} from './use-model-contract-journey';

export function ModelContractPanel(props: ModelContractJourneyProps) {
  const [declarationProtected, setDeclarationProtected] = useState(false),
    [projectProtected, setProjectProtected] = useState(false);
  const journey = useModelContractJourney(
      props,
      declarationProtected || projectProtected,
    ),
    copy = useModelContractCopy(),
    common = useContractCopy(),
    decision = useContractDecisionCopy(),
    versions = useContractVersionCopy(),
    financial = useModelOfferCopy(),
    signingCopy = useReportedSigningCopy();
  const company = props.actor.activeCompany;
  const declarationAuthority = reportedSigningAuthority(props.actor),
    pdfAuthority = reportedSigningPdfAuthority(props.actor);
  const reject = useCallback(
    (result: ApiResult<unknown>, signal: AbortSignal) =>
      handleAuthenticatedAccessRejection({
        result,
        identity: props.identity,
        companyContextId: company?.id,
        onCompanyContextRejected: props.onCompanyContextRejected,
        onActorRevalidated: props.onActorRevalidated ?? (() => undefined),
        onWorkspaceAccessRejected: props.onWorkspaceAccessRejected,
        signal,
      }),
    [
      props.identity,
      company?.id,
      props.onCompanyContextRejected,
      props.onActorRevalidated,
      props.onWorkspaceAccessRejected,
    ],
  );
  const projectKey = JSON.stringify([
    company?.contractPermissionAssignmentId,
    company?.contractPermissionSetVersion,
    company?.contractPermissions?.includes('commercial.contract.project.link'),
    company?.projectPermissionAssignmentId,
    company?.projectPermissionSetVersion,
    company?.projectPermissions,
    company?.clientPermissionAssignmentId,
    company?.clientPermissionSetVersion,
    props.actor.workspacePermissions.includes('client.manage'),
  ]);
  const { contract, locked } = journey;
  useEffect(() => {
    props.onProtectedWorkChange?.(locked);
    return () => props.onProtectedWorkChange?.(false);
  }, [locked, props.onProtectedWorkChange]);
  const [selectedPdf, setSelectedPdf] = useState<SigningPdfReference | null>(
    null,
  );
  useEffect(() => {
    setSelectedPdf(null);
  }, [contract?.version.id, pdfAuthority.key]);
  const signature = contract?.version.signature;
  const pdf = signature
    ? signature.pdf.access === 'granted'
      ? signature.pdf.reference
      : null
    : selectedPdf;
  const differenceLabel = (field: string) => {
    switch (field) {
      case 'documentDate':
      case 'clientDetails':
        return copy(field);
      case 'sourceConcordanceBasis':
        return copy('basis');
      case 'sourceOfferVersionId':
        return copy('chooseOffer');
      case 'modelVersionId':
      case 'modelApprovalDecisionId':
        return copy('chooseModel');
      case 'netAmount':
        return financial('net');
      case 'taxAmount':
        return financial('tax');
      case 'grossAmount':
        return financial('gross');
      case 'taxLabel':
        return financial('taxLabel');
      case 'currency':
        return copy('currency');
      case 'recipientLegalName':
      case 'recipientTaxId':
      case 'recipientLegalAddress':
      case 'termStartsOn':
      case 'termEndsOn':
      case 'specialConditions':
      case 'scopeNote':
      case 'commercialConditions':
        return versions(field);
      default:
        throw new Error('Unrecognized Contract difference');
    }
  };
  return (
    <section
      className="contract-panel model-contract-panel"
      aria-label={copy('title')}
    >
      <h4>{copy('title')}</h4>
      <p className="contract-banner">{copy('notice')}</p>
      <p>
        {contract?.version.signature
          ? signingCopy('offerSeparate')
          : copy('pendingAcceptance')}
      </p>
      {journey.confirmed && <p role="status">{copy(journey.confirmed)}</p>}
      {journey.running && <p role="status">{common('running')}</p>}
      {journey.readState === 'loading' && (
        <p role="status">{common('loading')}</p>
      )}
      {journey.readState === 'error' && (
        <p role="alert">{copy('refreshFailed')}</p>
      )}
      {journey.feedback && <p role="alert">{common(journey.feedback)}</p>}
      {journey.feedback === 'uncertain' && (
        <button
          type="button"
          disabled={journey.running}
          onClick={journey.retry}
        >
          {common('retry')}
        </button>
      )}
      {contract && (
        <>
          <p>
            {decision(
              contract.version.decisionState === 'APPROVED'
                ? 'approved'
                : contract.version.decisionState === 'REJECTED'
                  ? 'rejected'
                  : 'pending',
            )}{' '}
            ·{' '}
            {contract.version.signature
              ? signingCopy('declared')
              : common('execution')}
          </p>
          <ModelContractDetails
            key={contract.version.id}
            contract={contract}
            locked={journey.ownProtected}
          />
          <ModelContractChecks journey={journey} />
          {contract.version.signature && company && (
            <ReportedSigningHistory
              declaration={contract.version.signature}
              pdfAllowed={pdfAuthority.allowed}
            />
          )}
          {company && pdfAuthority.allowed && pdf && (
            <SigningPdfDownload
              key={JSON.stringify([
                contract.version.id,
                pdfAuthority.key,
                pdf.documentId,
                pdf.documentVersionId,
                pdf.representationId,
              ])}
              identity={props.identity}
              companyId={company.id}
              pdf={pdf}
              reject={reject}
            />
          )}
          {company &&
            (declarationAuthority.allowed ? (
              <ReportedSigningForm
                key={contract.version.id + declarationAuthority.key}
                identity={props.identity}
                companyId={company.id}
                membershipId={props.actor.workspaceMembershipId}
                opportunityId={props.opportunityId}
                contract={contract}
                protectedCommand={journey.ownProtected || projectProtected}
                reject={reject}
                onProtectionChange={setDeclarationProtected}
                onPdfSelected={setSelectedPdf}
                onReload={journey.reload}
                onDeclared={(declaration) =>
                  journey.applyContract({
                    ...contract,
                    revision: Math.max(contract.revision, declaration.revision),
                    version: {
                      ...contract.version,
                      signature: declaration,
                      executionState: 'EXECUTED',
                      latestQualityRun: declaration.qualityRun,
                    },
                  })
                }
              />
            ) : (
              <p>{signingCopy('prerequisites')}</p>
            ))}
          {company && (
            <ContractProjectsPanel
              key={contract.id + projectKey}
              missionPlan={{
                actor: props.actor,
                onActorRevalidated: props.onActorRevalidated,
                onCompanyContextRejected: props.onCompanyContextRejected,
                onWorkspaceAccessRejected: props.onWorkspaceAccessRejected,
              }}
              identity={props.identity}
              companyId={company.id}
              opportunityId={props.opportunityId}
              opportunityTitle={props.opportunityTitle ?? ''}
              contract={contract}
              mayCreate={
                company.projectPermissions?.includes('project.create') === true
              }
              mayLink={Boolean(
                company.contractPermissionAssignmentId &&
                (company.contractPermissionSetVersion === 'v1' ||
                  company.contractPermissionSetVersion === 'v2') &&
                company.contractPermissions?.includes(
                  'commercial.contract.project.link',
                ) &&
                company.projectPermissions?.includes('project.read') &&
                (company.clientPermissions?.includes('client.read') ||
                  props.actor.workspacePermissions.includes('client.manage')),
              )}
              protectedCommand={journey.ownProtected || declarationProtected}
              reject={reject}
              onProtectionChange={setProjectProtected}
              onReload={() => void journey.reload()}
              onOpenProject={props.onOpenProject}
              onLinked={(link, project) =>
                journey.applyContract({
                  ...contract,
                  revision: Math.max(contract.revision, link.revision),
                  linkedProjects: contract.linkedProjects.some(
                    (existing) => existing.link.id === link.id,
                  )
                    ? contract.linkedProjects
                    : [{ ...project, link }, ...contract.linkedProjects],
                })
              }
            />
          )}

          {journey.mayPrepare &&
            contract.version.executionState === 'NOT_EXECUTED' && (
              <button
                type="button"
                disabled={locked}
                onClick={() => void journey.startSuccessor()}
              >
                {copy('copy')}
              </button>
            )}
          <section aria-label={versions('history')}>
            <h5>{versions('history')}</h5>
            <button
              type="button"
              disabled={journey.ownProtected || journey.readState === 'loading'}
              onClick={() => void journey.loadHistory()}
            >
              {versions('history')}
            </button>
            {journey.history && (
              <>
                <ol>
                  {journey.history.items.map((item) => (
                    <li key={item.id}>
                      <button
                        type="button"
                        disabled={
                          locked ||
                          journey.readState === 'loading' ||
                          item.id === contract.version.id
                        }
                        onClick={() => void journey.openVersion(item.id)}
                      >
                        {versions('version')} {item.versionNumber}
                      </button>
                    </li>
                  ))}
                </ol>
                {journey.history.nextCursor && (
                  <button
                    type="button"
                    disabled={
                      journey.ownProtected || journey.readState === 'loading'
                    }
                    onClick={() =>
                      void journey.loadHistory(
                        journey.history?.nextCursor ?? undefined,
                      )
                    }
                  >
                    {versions('more')}
                  </button>
                )}
              </>
            )}
          </section>
          <h5>{versions('differences')}</h5>
          {contract.version.differences.length ? (
            <dl>
              {contract.version.differences.map((d) => (
                <div key={d.field}>
                  <dt>{differenceLabel(d.field)}</dt>
                  <dd>
                    {versions('before')}: {d.before ?? common('missing')}
                    <br />
                    {versions('after')}: {d.after ?? common('missing')}
                  </dd>
                </div>
              ))}
            </dl>
          ) : (
            <p>{versions('unchanged')}</p>
          )}
          <button
            type="button"
            disabled={journey.ownProtected}
            onClick={() => void journey.reload()}
          >
            {common('refresh')}
          </button>
        </>
      )}
      {journey.mode !== 'view' &&
        (journey.mayPrepare ? (
          <>
            <ModelContractForm journey={journey} />
            {journey.sources.model &&
              journey.draft.modelVersionId ===
                journey.sources.model.versionId && (
                <ContractModelBody content={journey.sources.model.content} />
              )}
          </>
        ) : (
          <p>{copy('newPermissions')}</p>
        ))}
    </section>
  );
}
