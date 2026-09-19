import {
  type Dispatch,
  type SetStateAction,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import type { BrowserIdentity } from '../access-composition';
import type { ActorContext } from '../access-types';
import type { ApiResult } from '../api/authenticated-api-client';
import {
  handleAuthenticatedAccessRejection,
  runLatestAuthenticatedRequest,
} from '../api/latest-authenticated-request';
import type { ClientContact } from './ClientContactEditor';
import { ApplicationPresentation } from '../production-shell/application-presentation';
import { ClientDirectoryFeedback } from './ClientDirectoryFeedback';
import './client-duplicate-review.css';
import { clientWorkspaceCopy as copy } from './client-workspace.copy';

interface DossierFields {
  displayName: string;
  taxId: string | null;
  address: string | null;
  telephone: string | null;
  generalEmail: string | null;
  contacts: ClientContact[];
  businessActivity: string | null;
}

interface CandidateDossier extends DossierFields {
  id: string;
  version: number;
  relatedToActiveCompany: boolean;
  involvedCompanyDisplayNames: string[];
}

const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

type ReviewDetail =
  | {
      outcome: 'comparison';
      duplicateReviewReference: string;
      proposal: {
        kind: 'registration' | 'correction';
        fields: DossierFields;
      };
      candidate: CandidateDossier;
    }
  | {
      outcome: 'multipleCandidateRemediation';
      duplicateReviewReference: string;
    };

type ListState =
  | { status: 'loading' }
  | {
      status: 'ready';
      references: string[];
      continuation:
        | { status: 'complete' }
        | { status: 'idle' | 'loading' | 'failed'; cursor: string };
    }
  | { status: 'forbidden' | 'error' };

type DetailState =
  | { status: 'idle' | 'loading' | 'unavailable' | 'error' | 'attachmentError' }
  | { status: 'attached'; refreshFailed: boolean }
  | { status: 'ready'; detail: ReviewDetail };

export function ClientDuplicateReviewPanel({
  companyContextId,
  identity,
  canAttach,
  refreshKey,
  authorityGeneration,
  onCompanyContextRejected,
  onActorRevalidated = () => undefined,
  onWorkspaceAccessRejected = () => undefined,
  onActivityRecorded,
  onClientsChanged,
}: {
  companyContextId: string;
  identity: BrowserIdentity;
  canAttach: boolean;
  refreshKey: number;
  authorityGeneration: string;
  onCompanyContextRejected: (companyContextId: string) => void;
  onActorRevalidated?: (actor: ActorContext) => Promise<void> | void;
  onWorkspaceAccessRejected?: () => Promise<void> | void;
  onActivityRecorded: () => Promise<void>;
  onClientsChanged: () => Promise<void>;
}) {
  const isPrisme = useContext(ApplicationPresentation) === 'prisme';
  const openingTrigger = useRef<Element | null>(null);
  const receiveComparisonHeading = useCallback(
    (heading: HTMLHeadingElement | null) => {
      if (!heading) return;
      const trigger = openingTrigger.current;
      openingTrigger.current = null;
      if (
        isPrisme &&
        trigger &&
        document.activeElement === trigger &&
        !heading.closest('[hidden]')
      )
        heading.focus();
    },
    [isPrisme],
  );
  const [listState, setListState] = useState<ListState>({ status: 'loading' });
  const [detailState, setDetailState] = useState<DetailState>({
    status: 'idle',
  });
  const [attaching, setAttaching] = useState(false);
  const pendingList = useRef<AbortController | undefined>(undefined);
  const pendingDetail = useRef<AbortController | undefined>(undefined);
  const pendingAttach = useRef<AbortController | undefined>(undefined);
  const rejectCompanyContext = useRef(onCompanyContextRejected);
  rejectCompanyContext.current = onCompanyContextRejected;
  const acceptRevalidatedActor = useRef(onActorRevalidated);
  acceptRevalidatedActor.current = onActorRevalidated;
  const rejectWorkspaceAccess = useRef(onWorkspaceAccessRejected);
  rejectWorkspaceAccess.current = onWorkspaceAccessRejected;

  const handleAccessRejection = useCallback(
    async (result: ApiResult<unknown>, signal: AbortSignal) => {
      const rejection = await handleAuthenticatedAccessRejection({
        result,
        identity,
        companyContextId,
        onCompanyContextRejected: (rejectedCompanyId) =>
          rejectCompanyContext.current(rejectedCompanyId),
        onActorRevalidated: (actor) => acceptRevalidatedActor.current(actor),
        onWorkspaceAccessRejected: () => rejectWorkspaceAccess.current(),
        signal,
      });
      return signal.aborted || rejection !== undefined;
    },
    [companyContextId, identity],
  );

  const requestReviews = useCallback(
    async (cursor: string | undefined) => {
      const continuing = cursor !== undefined;
      if (continuing) {
        setListState((current) =>
          current.status === 'ready'
            ? {
                ...current,
                continuation: { status: 'loading', cursor },
              }
            : current,
        );
      } else {
        setListState({ status: 'loading' });
      }
      await runLatestAuthenticatedRequest({
        pending: pendingList,
        identity,
        execute: (api, signal) =>
          api.request<unknown>(duplicateReviewListPath(cursor), {
            companyContextId,
            signal,
          }),
        async onResult(result, signal) {
          if (await handleAccessRejection(result, signal)) {
            if (!signal.aborted) {
              pendingDetail.current?.abort();
              pendingAttach.current?.abort();
              openingTrigger.current = null;
              setDetailState({ status: 'idle' });
              setAttaching(false);
              setListState({ status: 'forbidden' });
            }
            return;
          }
          if (result.status !== 'ok') {
            setDuplicateReviewListFailure(cursor, setListState);
            return;
          }
          const page = duplicateReviewPage(result.value);
          if (!page) {
            setDuplicateReviewListFailure(cursor, setListState);
            return;
          }
          setListState((current) => {
            const references =
              continuing && current.status === 'ready'
                ? uniqueReferences([...current.references, ...page.references])
                : page.references;
            return {
              status: 'ready',
              references,
              continuation: page.nextCursor
                ? { status: 'idle', cursor: page.nextCursor }
                : { status: 'complete' },
            };
          });
        },
        onError: () => setDuplicateReviewListFailure(cursor, setListState),
      });
    },
    [companyContextId, handleAccessRejection, identity],
  );

  const loadReviews = useCallback(
    () => requestReviews(undefined),
    [requestReviews],
  );

  useEffect(() => {
    pendingList.current?.abort();
    pendingDetail.current?.abort();
    pendingAttach.current?.abort();
    setDetailState({ status: 'idle' });
    openingTrigger.current = null;
    setAttaching(false);
    void loadReviews();
    return () => {
      pendingList.current?.abort();
      pendingDetail.current?.abort();
      pendingAttach.current?.abort();
    };
  }, [
    authorityGeneration,
    canAttach,
    companyContextId,
    loadReviews,
    refreshKey,
  ]);

  async function openReview(reference: string) {
    if (pendingAttach.current && !pendingAttach.current.signal.aborted) return;
    openingTrigger.current = isPrisme ? document.activeElement : null;
    setDetailState({ status: 'loading' });
    await runLatestAuthenticatedRequest({
      pending: pendingDetail,
      identity,
      execute: (api, signal) =>
        api.request<unknown>(
          `/client-duplicate-reviews/${encodeURIComponent(reference)}`,
          { companyContextId, signal },
        ),
      async onResult(result, signal) {
        if (await handleAccessRejection(result, signal)) {
          if (!signal.aborted) setDetailState({ status: 'unavailable' });
          return;
        }
        if (result.status === 'notFound') {
          setDetailState({ status: 'unavailable' });
          await loadReviews();
          return;
        }
        if (result.status !== 'ok') {
          setDetailState({ status: 'error' });
          return;
        }
        const detail = duplicateReviewDetail(result.value);
        setDetailState(
          detail ? { status: 'ready', detail } : { status: 'error' },
        );
      },
      onError: () => setDetailState({ status: 'error' }),
    });
  }

  async function attachCandidate(candidateId: string) {
    if (pendingAttach.current && !pendingAttach.current.signal.aborted) return;
    setAttaching(true);
    await runLatestAuthenticatedRequest({
      pending: pendingAttach,
      identity,
      execute: (api, signal) =>
        api.request<unknown>(
          `/clients/${encodeURIComponent(candidateId)}/active-company-relationship`,
          { method: 'PUT', companyContextId, signal },
        ),
      async onResult(result, signal) {
        if (await handleAccessRejection(result, signal)) {
          if (!signal.aborted) setDetailState({ status: 'unavailable' });
          return;
        }
        if (result.status !== 'ok') {
          setDetailState({ status: 'attachmentError' });
          return;
        }
        setDetailState({ status: 'attached', refreshFailed: false });
        const refreshes = await Promise.allSettled([
          Promise.resolve().then(onActivityRecorded),
          Promise.resolve().then(onClientsChanged),
          Promise.resolve().then(loadReviews),
        ]);
        if (signal.aborted) return;
        if (refreshes.some((refresh) => refresh.status === 'rejected'))
          setDetailState({ status: 'attached', refreshFailed: true });
      },
      onError: () => setDetailState({ status: 'attachmentError' }),
      onSettled: () => setAttaching(false),
    });
  }

  const availableContinuation =
    listState.status === 'ready' && listState.continuation.status !== 'complete'
      ? listState.continuation
      : undefined;

  return (
    <section
      className="client-duplicate-review"
      aria-labelledby="client-duplicate-review-title"
    >
      <header className="client-review-heading">
        <h3 id="client-duplicate-review-title">{copy.duplicateReviewTitle}</h3>
        <p>{copy.duplicateReviewDescription}</p>
      </header>
      {listState.status === 'loading' && (
        <ClientDirectoryFeedback role="status" tone="pending">
          {copy.loadingDuplicateReviews}
        </ClientDirectoryFeedback>
      )}
      {listState.status === 'error' && (
        <div className="client-review-list-error">
          <ClientDirectoryFeedback role="alert" tone="error">
            {copy.duplicateReviewRetry}
          </ClientDirectoryFeedback>
          <button
            type="button"
            className="client-secondary-action"
            onClick={() => void loadReviews()}
          >
            {copy.retryDuplicateReviews}
          </button>
        </div>
      )}
      {listState.status === 'forbidden' && (
        <ClientDirectoryFeedback role="alert" tone="error">
          {copy.duplicateReviewDenied}
        </ClientDirectoryFeedback>
      )}
      {listState.status === 'ready' && listState.references.length === 0 && (
        <ClientDirectoryFeedback>
          {availableContinuation
            ? copy.emptyDuplicateReviewPage
            : copy.noDuplicateReviews}
        </ClientDirectoryFeedback>
      )}
      {listState.status === 'ready' && listState.references.length > 0 && (
        <ol className="client-review-list">
          {listState.references.map((reference, index) => (
            <li key={reference}>
              <button
                type="button"
                disabled={attaching}
                onClick={() => void openReview(reference)}
              >
                {copy.openDuplicateReview(index + 1)}
              </button>
            </li>
          ))}
        </ol>
      )}
      {availableContinuation?.status === 'failed' && (
        <ClientDirectoryFeedback role="alert" tone="error">
          {copy.duplicateReviewContinuationRetry}
        </ClientDirectoryFeedback>
      )}
      {availableContinuation && (
        <button
          className="client-review-continuation client-secondary-action"
          type="button"
          disabled={availableContinuation.status === 'loading'}
          onClick={() => void requestReviews(availableContinuation.cursor)}
        >
          {availableContinuation.status === 'loading'
            ? copy.loadingMoreDuplicateReviews
            : copy.loadMoreDuplicateReviews}
        </button>
      )}
      {detailState.status === 'attached' && (
        <>
          <ClientDirectoryFeedback role="status" tone="success">
            {copy.duplicateAttached}
          </ClientDirectoryFeedback>
          {detailState.refreshFailed && (
            <ClientDirectoryFeedback role="alert" tone="error">
              {copy.duplicateAttachmentRefreshFailed}
            </ClientDirectoryFeedback>
          )}
        </>
      )}
      {detailState.status === 'loading' && (
        <ClientDirectoryFeedback role="status" tone="pending">
          {copy.loadingDuplicateReview}
        </ClientDirectoryFeedback>
      )}
      {detailState.status === 'unavailable' && (
        <ClientDirectoryFeedback role="alert" tone="error">
          {copy.duplicateReviewUnavailable}
        </ClientDirectoryFeedback>
      )}
      {detailState.status === 'attachmentError' && (
        <ClientDirectoryFeedback role="alert" tone="error">
          {copy.duplicateAttachmentRetry}
        </ClientDirectoryFeedback>
      )}
      {detailState.status === 'error' && (
        <ClientDirectoryFeedback role="alert" tone="error">
          {copy.duplicateReviewRetry}
        </ClientDirectoryFeedback>
      )}
      {detailState.status === 'ready' &&
        detailState.detail.outcome === 'multipleCandidateRemediation' && (
          <ClientDirectoryFeedback role="alert" tone="info">
            {copy.multipleDuplicateCandidates}
          </ClientDirectoryFeedback>
        )}
      {detailState.status === 'ready' &&
        detailState.detail.outcome === 'comparison' && (
          <DuplicateComparison
            detail={detailState.detail}
            onHeadingReady={receiveComparisonHeading}
            attaching={attaching}
            canAttach={canAttach}
            onAttach={attachCandidate}
          />
        )}
    </section>
  );
}

function DuplicateComparison({
  detail,
  canAttach,
  attaching,
  onAttach,
  onHeadingReady,
}: {
  detail: Extract<ReviewDetail, { outcome: 'comparison' }>;
  canAttach: boolean;
  attaching: boolean;
  onAttach: (candidateId: string) => Promise<void>;
  onHeadingReady: (heading: HTMLHeadingElement | null) => void;
}) {
  const fields = [
    [
      copy.duplicateRecordState,
      detail.proposal.kind === 'registration'
        ? copy.duplicateRegistrationProposal
        : copy.duplicateCorrectionProposal,
      copy.version(detail.candidate.version),
    ],
    [
      copy.displayNameLabel,
      detail.proposal.fields.displayName,
      detail.candidate.displayName,
    ],
    [copy.taxIdLabel, detail.proposal.fields.taxId, detail.candidate.taxId],
    [
      copy.addressLabel,
      detail.proposal.fields.address,
      detail.candidate.address,
    ],
    [
      copy.telephoneLabel,
      detail.proposal.fields.telephone,
      detail.candidate.telephone,
    ],
    [
      copy.generalEmailLabel,
      detail.proposal.fields.generalEmail,
      detail.candidate.generalEmail,
    ],
    [
      copy.businessActivityLabel,
      detail.proposal.fields.businessActivity,
      detail.candidate.businessActivity,
    ],
  ] as const;
  return (
    <section
      className="client-review-comparison"
      aria-labelledby="client-duplicate-comparison-title"
    >
      <div className="client-review-heading">
        <h4
          id="client-duplicate-comparison-title"
          tabIndex={-1}
          ref={onHeadingReady}
        >
          {copy.duplicateComparisonTitle}
        </h4>
        <p>{copy.duplicateComparisonDescription}</p>
      </div>
      <table>
        <thead>
          <tr>
            <th scope="col">{copy.duplicateFieldColumn}</th>
            <th scope="col">{copy.duplicateProposalColumn}</th>
            <th scope="col">{copy.duplicateCandidateColumn}</th>
          </tr>
        </thead>
        <tbody>
          {fields.map(([label, proposal, candidate]) => (
            <tr key={label}>
              <th scope="row">{label}</th>
              <td data-label={copy.duplicateProposalColumn}>
                {proposal ?? copy.notProvided}
              </td>
              <td data-label={copy.duplicateCandidateColumn}>
                {candidate ?? copy.notProvided}
              </td>
            </tr>
          ))}
          <tr>
            <th scope="row">{copy.contactsLabel}</th>
            <td data-label={copy.duplicateProposalColumn}>
              <ReviewContacts
                contacts={detail.proposal.fields.contacts}
                emptyCopy={copy.noProposedContacts}
              />
            </td>
            <td data-label={copy.duplicateCandidateColumn}>
              <ReviewContacts
                contacts={detail.candidate.contacts}
                emptyCopy={copy.noContacts}
              />
            </td>
          </tr>
          <tr>
            <th scope="row">{copy.involvedCompaniesLabel}</th>
            <td data-label={copy.duplicateProposalColumn}>
              {copy.notApplicable}
            </td>
            <td data-label={copy.duplicateCandidateColumn}>
              {detail.candidate.involvedCompanyDisplayNames.join(', ') ||
                copy.notProvided}
            </td>
          </tr>
        </tbody>
      </table>
      <div className="client-review-actions">
        <p>
          {detail.candidate.relatedToActiveCompany
            ? copy.duplicateAlreadyLinked
            : copy.duplicateNotLinked}
        </p>
        {detail.proposal.kind === 'registration' &&
          !detail.candidate.relatedToActiveCompany &&
          canAttach && (
            <button
              type="button"
              disabled={attaching}
              onClick={() => void onAttach(detail.candidate.id)}
            >
              {attaching
                ? copy.attachingDuplicate
                : copy.attachExistingDuplicate}
            </button>
          )}
        {detail.proposal.kind === 'registration' &&
          !detail.candidate.relatedToActiveCompany &&
          !canAttach && <p>{copy.duplicateAttachmentUnavailable}</p>}
        {detail.proposal.kind === 'correction' && (
          <p>{copy.correctDuplicateProposal}</p>
        )}
      </div>
    </section>
  );
}

function duplicateReviewPage(
  value: unknown,
): { references: string[]; nextCursor: string | null } | undefined {
  if (
    !isRecord(value) ||
    !Array.isArray(value.items) ||
    !isNullableUuidV4(value.next_cursor)
  ) {
    return undefined;
  }
  const references: string[] = [];
  for (const item of value.items) {
    if (!isRecord(item) || !isUuidV4(item.duplicate_review_reference)) {
      return undefined;
    }
    references.push(item.duplicate_review_reference);
  }
  return {
    references: uniqueReferences(references),
    nextCursor: value.next_cursor,
  };
}

function duplicateReviewListPath(cursor: string | undefined): string {
  const query = new URLSearchParams({ page_size: '20' });
  if (cursor) query.set('cursor', cursor);
  return `/client-duplicate-reviews?${query.toString()}`;
}

function setDuplicateReviewListFailure(
  cursor: string | undefined,
  setListState: Dispatch<SetStateAction<ListState>>,
): void {
  setListState((current) =>
    cursor && current.status === 'ready'
      ? {
          ...current,
          continuation: { status: 'failed', cursor },
        }
      : { status: 'error' },
  );
}

function uniqueReferences(references: readonly string[]): string[] {
  return [...new Set(references)];
}

function isNullableUuidV4(value: unknown): value is string | null {
  return value === null || isUuidV4(value);
}

function isUuidV4(value: unknown): value is string {
  return typeof value === 'string' && UUID_V4.test(value);
}

function ReviewContacts({
  contacts,
  emptyCopy,
}: {
  contacts: readonly ClientContact[];
  emptyCopy: string;
}) {
  if (contacts.length === 0) return <p>{emptyCopy}</p>;
  return (
    <ol className="client-review-contacts">
      {contacts.map((contact, index) => (
        <li key={index}>
          <strong>{contact.name}</strong>
          <dl>
            <div>
              <dt>{copy.contactTelephoneLabel}</dt>
              <dd>{contact.telephone || copy.notProvided}</dd>
            </div>
            <div>
              <dt>{copy.contactEmailLabel}</dt>
              <dd>{contact.email || copy.notProvided}</dd>
            </div>
          </dl>
        </li>
      ))}
    </ol>
  );
}

function duplicateReviewDetail(value: unknown): ReviewDetail | undefined {
  if (
    !isRecord(value) ||
    typeof value.duplicate_review_reference !== 'string'
  ) {
    return undefined;
  }
  if (
    value.outcome === 'multiple_duplicate_candidates_require_data_remediation'
  ) {
    return {
      outcome: 'multipleCandidateRemediation',
      duplicateReviewReference: value.duplicate_review_reference,
    };
  }
  if (
    value.outcome !== 'comparison' ||
    !isRecord(value.proposal) ||
    (value.proposal.kind !== 'registration' &&
      value.proposal.kind !== 'correction')
  ) {
    return undefined;
  }
  const fields = dossierFields(value.proposal.fields);
  const candidate = candidateDossier(value.candidate);
  if (!fields || !candidate) return undefined;
  return {
    outcome: 'comparison',
    duplicateReviewReference: value.duplicate_review_reference,
    proposal: { kind: value.proposal.kind, fields },
    candidate,
  };
}

function candidateDossier(value: unknown): CandidateDossier | undefined {
  if (
    !isRecord(value) ||
    typeof value.id !== 'string' ||
    typeof value.version !== 'number' ||
    typeof value.relatedToActiveCompany !== 'boolean' ||
    !Array.isArray(value.involvedCompanyDisplayNames) ||
    !value.involvedCompanyDisplayNames.every(
      (companyName) => typeof companyName === 'string',
    )
  ) {
    return undefined;
  }
  const fields = dossierFields(value);
  if (!fields) return undefined;
  return {
    ...fields,
    id: value.id,
    version: value.version,
    relatedToActiveCompany: value.relatedToActiveCompany,
    involvedCompanyDisplayNames: value.involvedCompanyDisplayNames,
  };
}

function dossierFields(value: unknown): DossierFields | undefined {
  if (
    !isRecord(value) ||
    typeof value.displayName !== 'string' ||
    !isNullableString(value.taxId) ||
    !isNullableString(value.address) ||
    !isNullableString(value.telephone) ||
    !isNullableString(value.generalEmail) ||
    !isNullableString(value.businessActivity) ||
    !Array.isArray(value.contacts)
  ) {
    return undefined;
  }
  const contacts: ClientContact[] = [];
  for (const contact of value.contacts) {
    if (
      !isRecord(contact) ||
      typeof contact.name !== 'string' ||
      !isOptionalString(contact.telephone) ||
      !isOptionalString(contact.email)
    ) {
      return undefined;
    }
    contacts.push({
      name: contact.name,
      ...(contact.telephone ? { telephone: contact.telephone } : {}),
      ...(contact.email ? { email: contact.email } : {}),
    });
  }
  return {
    displayName: value.displayName,
    taxId: value.taxId,
    address: value.address,
    telephone: value.telephone,
    generalEmail: value.generalEmail,
    contacts,
    businessActivity: value.businessActivity,
  };
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

function isOptionalString(value: unknown): value is string | undefined {
  return value === undefined || typeof value === 'string';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
