import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  createAuthenticatedApiClient,
  type ApiResult,
} from '../api/authenticated-api-client';
import { useContractAccessRecovery } from './use-contract-access-recovery';
import { useScopedOperation } from '../api/use-scoped-operation';
import { useScopedOperationGroup } from '../api/use-scoped-operation';
import { useRequestLifetime } from '../api/use-actor-requests';
import {
  readModelOffer,
  type ModelOfferView,
} from '../offer/model-offer-response';
import { text } from '../contract-model/contract-model-content';
import {
  readSelectedContractModel,
  type SelectedContractModel,
} from './model-contract-source-response';
import {
  readModelContract,
  readPreparedModelContract,
  readModelContractCase,
  readModelContractHistory,
  type ModelContractView,
} from './model-contract-response';
import {
  readModelContractDecision,
  readModelContractQuality,
  type ModelContractQuality,
} from './model-contract-quality-response';
import type { ContractPanelProps } from './IllustrativeContractPanel';
import { grantOf, holds } from '../access/company-grants';
import { holdsOfferRead } from './contract-grants';

export type ModelContractDraft = {
  documentDate: string;
  clientDetails: string;
  termStartsOn: string;
  termEndsOn: string;
  specialConditions: string;
  sourceConcordanceDeclaration: boolean;
  sourceConcordanceBasis: string;
  offerVersionId: string;
  modelVersionId: string;
};
const blank = (): ModelContractDraft => ({
  documentDate: '',
  clientDetails: '',
  termStartsOn: '',
  termEndsOn: '',
  specialConditions: '',
  sourceConcordanceDeclaration: false,
  sourceConcordanceBasis: '',
  offerVersionId: '',
  modelVersionId: '',
});
type Sources = {
  offer: ModelOfferView | null;
  model: SelectedContractModel | null;
};
type CommandKind = 'prepare' | 'successor' | 'quality' | 'approve' | 'reject';
type Preparation = {
  source: { offer: ModelOfferView; model: SelectedContractModel };
  caseDetails: ReturnType<typeof readModelContractCase>;
};
type Attempt = { key: string; path: string; body: string } & (
  | ({ kind: 'prepare'; target: null } & Preparation)
  | ({ kind: 'successor'; target: ModelContractView } & Preparation)
  | { kind: 'quality'; target: ModelContractView }
  | {
      kind: 'approve';
      target: ModelContractView;
      reviewBasis: string;
      warningCodes: string[];
    }
  | { kind: 'reject'; target: ModelContractView; reason: string }
);
type Feedback =
  'invalid' | 'unavailable' | 'conflict' | 'uncertain' | 'denied' | null;
type ReadState = 'idle' | 'loading' | 'error';
type ReadStatus = { scope: string; state: Exclude<ReadState, 'idle'> } | null;
export type ModelContractJourneyProps = ContractPanelProps & {
  initialContract: ModelContractView | null;
  initialOffer?: unknown;
};

/** One owner for all new-mode reads, drafts and commands. No sibling can replace an uncertain intent. */
export function useModelContractJourney(
  props: ModelContractJourneyProps,
  siblingsProtected = false,
) {
  const company = props.actor.activeCompany,
    companyId = company?.id;
  const contractPreparer = grantOf(company, 'company_contract_preparer'),
    contractApprover = grantOf(company, 'company_contract_approver'),
    client = grantOf(company, 'company_director_client_access'),
    project = grantOf(company, 'company_project_access'),
    offerPreparer = grantOf(company, 'company_offer_preparer'),
    offerApprover = grantOf(company, 'company_offer_approver'),
    intake = grantOf(company, 'company_commercial_intake');
  const offerRead = holdsOfferRead(company);
  const preparation =
    holds(
      company,
      'company_contract_preparer',
      'commercial.contract.prepare',
    ) &&
    holds(
      company,
      'company_contract_preparer',
      'commercial.contract.model.select',
    ) &&
    holds(
      company,
      'company_contract_preparer',
      'commercial.contract.model_based.prepare',
    );
  const workspaceClientRead =
    props.actor.workspacePermissions.includes('client.manage');
  const companyClientRead = holds(
    company,
    'company_director_client_access',
    'client.read',
  );
  const mayPrepare =
    preparation && offerRead && (companyClientRead || workspaceClientRead);
  const mayApprove =
    offerRead &&
    holds(
      company,
      'company_contract_approver',
      'commercial.contract.approve',
    ) &&
    holds(
      company,
      'company_contract_approver',
      'commercial.contract.model_based.approve',
    );
  const mayCheck = offerRead && (preparation || mayApprove);
  const base = `/contracts/opportunities/${encodeURIComponent(props.opportunityId)}`;
  const projectReadAllowed =
    props.actor.active &&
    holds(company, 'company_project_access', 'project.read') &&
    (workspaceClientRead || companyClientRead);
  const projectReadAuthority = JSON.stringify([
    companyId,
    project?.assignmentId,
    project?.permissionSetVersion,
    projectReadAllowed,
    workspaceClientRead
      ? 'workspace-client-read'
      : [client?.assignmentId, client?.permissionSetVersion, companyClientRead],
  ]);
  const projectGeneration = useRequestLifetime(
    props.identity,
    JSON.stringify([
      props.actor.workspaceId,
      props.actor.internalUserId,
      props.actor.workspaceMembershipId,
      projectReadAuthority,
    ]),
  );
  const projectReadKey = JSON.stringify([
    projectReadAuthority,
    projectGeneration,
  ]);
  // Every read/result carries the Project authority captured when it began.
  // A held old response cannot requalify cached metadata under a new grant.
  const [contractSnapshot, setContractSnapshot] = useState({
    contract: props.initialContract,
    projectReadKey,
  });
  const contract = contractSnapshot.contract;
  const projectedContract =
    contract === null ||
    !contract.linkedProjects.length ||
    (projectReadAllowed && contractSnapshot.projectReadKey === projectReadKey)
      ? contract
      : { ...contract, linkedProjects: [] };
  const [draft, setDraft] = useState(blank),
    [mode, setMode] = useState<'view' | 'prepare' | 'successor'>(
      props.initialContract ? 'view' : 'prepare',
    );
  const [sources, setSources] = useState<Sources>({ offer: null, model: null }),
    [readStatus, setReadStatus] = useState<ReadStatus>(null);
  const [history, setHistory] = useState<ReturnType<
      typeof readModelContractHistory
    > | null>(null),
    [quality, setQuality] = useState<ModelContractQuality | null>(
      props.initialContract?.version.latestQualityRun ?? null,
    );
  const [feedback, setFeedback] = useState<Feedback>(null),
    [confirmed, setConfirmed] = useState<
      'created' | 'decided' | 'checked' | null
    >(null),
    [running, setRunning] = useState(false);
  const [reviewBasis, setReviewBasis] = useState(''),
    [reason, setReason] = useState(''),
    [acknowledgements, setAcknowledgements] = useState<string[]>([]);
  const attempt = useRef<Attempt | undefined>(undefined);
  const locked = running || feedback === 'uncertain' || siblingsProtected;
  const mutationAuthority = JSON.stringify([
    contractPreparer?.assignmentId,
    contractPreparer?.permissionSetVersion,
    contractApprover?.assignmentId,
    contractApprover?.permissionSetVersion,
    client?.assignmentId,
    client?.permissionSetVersion,
    offerPreparer?.assignmentId,
    offerPreparer?.permissionSetVersion,
    offerApprover?.assignmentId,
    offerApprover?.permissionSetVersion,
    intake?.assignmentId,
    intake?.permissionSetVersion,
    mayPrepare,
    mayApprove,
    mayCheck,
  ]);
  // A sibling taking revision ownership starts a new read generation: earlier
  // navigation/reload replies retire, independently requested later reads stay.
  const [ownership, setOwnership] = useState({
    siblingsProtected,
    generation: 0,
  });
  const generation =
    ownership.generation +
    (ownership.siblingsProtected !== siblingsProtected && siblingsProtected
      ? 1
      : 0);
  if (ownership.siblingsProtected !== siblingsProtected)
    setOwnership({ siblingsProtected, generation });
  const mutationLifetime = useRequestLifetime(
    props.identity,
    JSON.stringify([
      props.identity.loaded,
      props.identity.signedIn,
      props.actor.workspaceId,
      props.actor.internalUserId,
      props.actor.workspaceMembershipId,
      companyId,
      props.opportunityId,
      mutationAuthority,
    ]),
  );
  const readScope = JSON.stringify([mutationLifetime, generation]);
  // Work retires inside the commit that changes its scope, so a click on the
  // first displayed frame (Copy, or History after a sibling took ownership)
  // keeps its own command and reads.
  const reads = useScopedOperation(readScope),
    writes = useScopedOperationGroup(String(mutationLifetime));
  // A retired read scope's status reads as idle in the render that retires it.
  // The generation never repeats, but authority values can (A→B→A), so the
  // authority reset below also discards the status for good.
  const readState = readStatus?.scope === readScope ? readStatus.state : 'idle';
  const setReadState = (state: ReadState) =>
    setReadStatus(state === 'idle' ? null : { scope: readScope, state });
  useLayoutEffect(() => {
    attempt.current = undefined;
    setReadStatus(null);
    setDraft(blank());
    setSources({ offer: null, model: null });
    setReviewBasis('');
    setReason('');
    setAcknowledgements([]);
    setRunning(false);
    setFeedback(null);
  }, [mutationLifetime]);
  useEffect(() => {
    if (!props.initialContract && mayPrepare)
      void loadSources(props.initialOffer);
  }, []);

  const recover = useContractAccessRecovery(props);
  async function reject(result: ApiResult<unknown>, signal: AbortSignal) {
    const denied = await recover(result, signal);
    if (denied && !signal.aborted) {
      reads.retire();
      writes.retire();
      if (denied === 'unauthorized')
        setContractSnapshot({ contract: null, projectReadKey });
      setDraft(blank());
      setSources({ offer: null, model: null });
      setHistory(null);
      setQuality(null);
      setMode('view');
      setReviewBasis('');
      setReason('');
      setAcknowledgements([]);
      setConfirmed(null);
      setRunning(false);
      setReadState('idle');
      attempt.current = undefined;
      setFeedback('denied');
    }
    return denied;
  }
  async function read<T>(
    operation: (
      api: Awaited<ReturnType<typeof createAuthenticatedApiClient>>,
      signal: AbortSignal,
    ) => Promise<T>,
    apply: (value: T) => void,
  ) {
    if (attempt.current || !companyId) return false;
    const signal = reads.begin();
    if (!signal) return false;
    setReadState('loading');
    try {
      const api = await createAuthenticatedApiClient(props.identity);
      if (signal.aborted) return false;
      const value = await operation(api, signal);
      if (!signal.aborted) {
        apply(value);
        setReadState('idle');
        return true;
      }
    } catch {
      if (!signal.aborted) setReadState('error');
    }
    return false;
  }
  async function get(
    api: Awaited<ReturnType<typeof createAuthenticatedApiClient>>,
    path: string,
    signal: AbortSignal,
  ) {
    const result = await api.request(path, {
      companyContextId: companyId,
      signal,
    });
    if (signal.aborted) throw new Error('Retired read');
    if (
      (await reject(result, signal)) ||
      signal.aborted ||
      result.status !== 'ok'
    )
      throw new Error('Unavailable model Contract read');
    return result.value;
  }
  async function loadSources(initial?: unknown) {
    if (!mayPrepare) return;
    await read(
      async (api, signal) => {
        const [offerValue, modelValue] = await Promise.all([
          initial === undefined
            ? get(
                api,
                `/offers/opportunities/${encodeURIComponent(props.opportunityId)}`,
                signal,
              )
            : Promise.resolve(initial),
          get(api, base + '/model-selection', signal),
        ]);
        const rawOffer = record(offerValue).offer;
        const offer = rawOffer === null ? null : readModelOffer(rawOffer);
        if (
          offer &&
          (offer.companyId !== companyId ||
            offer.opportunityId !== props.opportunityId)
        )
          throw new Error('Mismatched source');
        const rawModel = record(modelValue).selection;
        return {
          offer:
            offer &&
            offer.version.decisionState === 'APPROVED' &&
            offer.version.transmissionState === 'TRANSMITTED' &&
            !offer.version.supersededByVersionId &&
            !offer.version.validityElapsed &&
            (offer.version.clientResponseState === 'PENDING' ||
              offer.version.clientResponseState === 'ACCEPTED')
              ? offer
              : null,
          model: rawModel === null ? null : readSelectedContractModel(rawModel),
        };
      },
      (next) => {
        setSources(next);
        setDraft((current) => ({
          ...current,
          offerVersionId:
            current.offerVersionId === next.offer?.version.id
              ? current.offerVersionId
              : '',
          modelVersionId:
            current.modelVersionId === next.model?.versionId
              ? current.modelVersionId
              : '',
        }));
      },
    );
  }
  function applyContract(next: ModelContractView) {
    // A confirmed sibling result supersedes every read begun before it.
    reads.retire();
    setReadState('idle');
    setContractSnapshot({ contract: next, projectReadKey });
    setQuality(next.version.latestQualityRun);
    setAcknowledgements([]);
    setReviewBasis('');
    setReason('');
    setMode('view');
  }
  function checkScope(next: ModelContractView) {
    if (
      next.companyId !== companyId ||
      next.opportunityId !== props.opportunityId ||
      (contract && next.id !== contract.id)
    )
      throw new Error('Mismatched model Contract');
    return next;
  }
  async function reload() {
    return read(
      async (api, signal) =>
        checkScope(
          readModelContract(record(await get(api, base, signal)).contract),
        ),
      applyContract,
    );
  }
  async function openVersion(versionId: string) {
    await read(async (api, signal) => {
      const next = checkScope(
        readModelContract(
          record(
            await get(
              api,
              base + '/versions/' + encodeURIComponent(versionId),
              signal,
            ),
          ).contract,
        ),
      );
      if (next.version.id !== versionId) throw new Error('Mismatched Version');
      return next;
    }, applyContract);
  }
  async function loadHistory(cursor?: string) {
    await read(
      async (api, signal) =>
        readModelContractHistory(
          await get(
            api,
            base +
              '/versions' +
              (cursor ? '?cursor=' + encodeURIComponent(cursor) : ''),
            signal,
          ),
        ),
      (page) =>
        setHistory((current) => ({
          items:
            cursor && current ? [...current.items, ...page.items] : page.items,
          nextCursor: page.nextCursor,
        })),
    );
  }
  async function startSuccessor() {
    if (attempt.current || !contract || !mayPrepare) return;
    const copied = contract.version.modelGeneration.caseDetails;
    const begin = () => {
      setDraft({
        ...copied,
        termStartsOn: copied.termStartsOn ?? '',
        termEndsOn: copied.termEndsOn ?? '',
        specialConditions: copied.specialConditions ?? '',
        sourceConcordanceDeclaration: false,
        offerVersionId: '',
        modelVersionId: '',
      });
      setMode('successor');
      setFeedback(null);
    };
    if (contract.version.supersededByVersionId) {
      let opened = false;
      await read(
        async (api, signal) =>
          checkScope(
            readModelContract(record(await get(api, base, signal)).contract),
          ),
        (next) => {
          applyContract(next);
          begin();
          opened = true;
        },
      );
      if (!opened) return;
    } else begin();
    await loadSources();
  }
  function prepareAttempt(kind: CommandKind): Attempt {
    const key = crypto.randomUUID();
    if (kind === 'prepare' || kind === 'successor') {
      if (
        !mayPrepare ||
        !sources.offer ||
        !sources.model ||
        draft.offerVersionId !== sources.offer.version.id ||
        draft.modelVersionId !== sources.model.versionId ||
        (kind === 'successor' && !contract)
      )
        throw new Error('Select exact sources');
      const caseDetails = readModelContractCase({
        documentDate: draft.documentDate,
        clientDetails: draft.clientDetails,
        termStartsOn: draft.termStartsOn || null,
        termEndsOn: draft.termEndsOn || null,
        specialConditions: draft.specialConditions || null,
        sourceConcordanceDeclaration: draft.sourceConcordanceDeclaration,
        sourceConcordanceBasis: draft.sourceConcordanceBasis,
      });
      const material = {
        key,
        path:
          base +
          (kind === 'prepare'
            ? '/from-approved-model'
            : '/versions/from-approved-model'),
        source: { offer: sources.offer, model: sources.model },
        caseDetails,
        body: JSON.stringify({
          sourceOfferVersionId: sources.offer.version.id,
          modelVersionId: sources.model.versionId,
          modelVersionNumber: sources.model.versionNumber,
          modelApprovalDecisionId: sources.model.approvalDecisionId,
          ...caseDetails,
          ...(kind === 'successor'
            ? { expectedContractRevision: contract?.revision }
            : {}),
        }),
      };
      if (kind === 'prepare') return { ...material, kind, target: null };
      if (!contract) throw new Error('Missing successor target');
      return { ...material, kind, target: contract };
    }
    if (
      !contract ||
      contract.version.supersededByVersionId ||
      (kind === 'quality' ? !mayCheck : !mayApprove)
    )
      throw new Error('Unavailable exact target');
    if (kind !== 'quality' && contract.version.decisionState !== 'PENDING')
      throw new Error('Already decided');
    if (
      kind === 'approve' &&
      (!quality ||
        quality.contractVersionId !== contract.version.id ||
        quality.results.some((r) => r.status === 'ERROR') ||
        JSON.stringify([...acknowledgements].sort()) !==
          JSON.stringify(
            quality.results
              .filter((r) => r.status === 'WARNING')
              .map((r) => r.code)
              .sort(),
          ))
    )
      throw new Error('Review all current warnings');
    const material = {
      key,
      path:
        base +
        '/versions/' +
        encodeURIComponent(contract.version.id) +
        '/' +
        (kind === 'quality' ? 'quality-checks' : kind),
      target: contract,
    };
    if (kind === 'quality') return { ...material, kind, body: '{}' };
    if (kind === 'approve') {
      const basis = text(reviewBasis, 2000),
        warningCodes = [...acknowledgements].sort();
      return {
        ...material,
        kind,
        reviewBasis: basis,
        warningCodes,
        body: JSON.stringify({
          expectedContractRevision: contract.revision,
          acknowledgedWarningCodes: warningCodes,
          reviewBasis: basis,
        }),
      };
    }
    const rejectionReason = text(reason, 500);
    return {
      ...material,
      kind,
      reason: rejectionReason,
      body: JSON.stringify({
        expectedContractRevision: contract.revision,
        reason: rejectionReason,
      }),
    };
  }
  async function write(kind: CommandKind) {
    if (
      siblingsProtected ||
      writes.isPending() ||
      (attempt.current && attempt.current.kind !== kind) ||
      !companyId
    )
      return;
    let command: Attempt;
    try {
      command = attempt.current ?? prepareAttempt(kind);
    } catch {
      setFeedback('invalid');
      return;
    }
    const request = writes.begin();
    if (!request) return;
    const { signal } = request;
    attempt.current = command;
    reads.retire();
    setReadState('idle');
    setRunning(true);
    setFeedback(null);
    try {
      const api = await createAuthenticatedApiClient(props.identity);
      if (signal.aborted) return;
      const result = await api.request(command.path, {
        method: 'POST',
        companyContextId: companyId,
        signal,
        headers: {
          'content-type': 'application/json',
          'idempotency-key': command.key,
        },
        body: command.body,
      });
      if (signal.aborted) return;
      if (await reject(result, signal)) return;
      if (signal.aborted) return;
      if (result.status === 'ok') {
        if (command.kind === 'prepare' || command.kind === 'successor') {
          const next = readPreparedModelContract(result.value, {
            companyId,
            workspaceId: props.actor.workspaceId,
            opportunityId: props.opportunityId,
            membershipId: props.actor.workspaceMembershipId,
            prior: command.target,
            offer: command.source.offer,
            model: command.source.model,
            caseDetails: command.caseDetails,
          });
          applyContract(next);
          setDraft(blank());
          setHistory(null);
          setConfirmed('created');
        } else if (command.kind === 'quality') {
          const run = readModelContractQuality(
            result.value,
            command.target.version.id,
          );
          if (
            run.actorWorkspaceMembershipId !== props.actor.workspaceMembershipId
          )
            throw new Error('Mismatched check command actor');
          setQuality(run);
          setAcknowledgements([]);
          setConfirmed('checked');
        } else {
          const decision = readModelContractDecision(result.value, {
            versionId: command.target.version.id,
            createdRevision: command.target.version.createdContractRevision,
            checksum: command.target.version.representation.sha256,
          });
          if (
            decision.kind !==
              (command.kind === 'approve' ? 'APPROVE' : 'REJECT') ||
            decision.revision !== command.target.revision + 1 ||
            decision.actorWorkspaceMembershipId !==
              props.actor.workspaceMembershipId ||
            (command.kind === 'approve' &&
              (decision.kind !== 'APPROVE' ||
                decision.reviewBasis !== command.reviewBasis ||
                JSON.stringify(decision.acknowledgedWarningCodes) !==
                  JSON.stringify(command.warningCodes))) ||
            (command.kind === 'reject' &&
              (decision.kind !== 'REJECT' ||
                decision.reason !== command.reason))
          )
            throw new Error('Malformed committed decision response');
          const next = {
            ...command.target,
            revision: decision.revision,
            version: {
              ...command.target.version,
              decision,
              decisionState:
                decision.kind === 'APPROVE'
                  ? ('APPROVED' as const)
                  : ('REJECTED' as const),
              latestQualityRun:
                decision.kind === 'APPROVE'
                  ? decision.qualityRun
                  : command.target.version.latestQualityRun,
            },
          };
          applyContract(next);
          setConfirmed('decided');
        }
        attempt.current = undefined;
        setFeedback(null);
      } else if (
        result.status === 'validation' ||
        result.status === 'conflict' ||
        result.status === 'notFound'
      ) {
        attempt.current = undefined;
        setFeedback(
          result.status === 'validation'
            ? 'invalid'
            : result.status === 'conflict'
              ? 'conflict'
              : 'unavailable',
        );
      } else setFeedback('uncertain');
    } catch {
      if (!signal.aborted) setFeedback('uncertain');
    } finally {
      request.release();
      if (!signal.aborted) {
        setRunning(false);
      }
    }
  }
  return {
    contract: projectedContract,
    applyContract,
    ownProtected: running || feedback === 'uncertain',
    draft,
    setDraft,
    mode,
    sources,
    readState,
    history,
    quality,
    feedback,
    confirmed,
    running,
    locked,
    mayPrepare,
    mayApprove,
    mayCheck,
    reviewBasis,
    setReviewBasis,
    reason,
    setReason,
    acknowledgements,
    setAcknowledgements,
    prepare: () => write(mode === 'successor' ? 'successor' : 'prepare'),
    check: () => write('quality'),
    approve: () => write('approve'),
    reject: () => write('reject'),
    retry: () => {
      if (attempt.current) void write(attempt.current.kind);
    },
    reload,
    openVersion,
    loadHistory,
    loadSources: () => loadSources(),
    startSuccessor,
  };
}
function record(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new Error('Invalid response.');
  return Object.fromEntries(Object.entries(value));
}
