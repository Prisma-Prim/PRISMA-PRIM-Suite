import { unexpected } from './certification-command';
import { useState, type FormEvent, type ReactNode } from 'react';
import type { BrowserIdentity } from '../access-composition';
import {
  createAuthenticatedApiClient,
  type ApiResult,
} from '../api/authenticated-api-client';
import {
  useScopedOperation,
  type ScopedOperation,
} from '../api/use-scoped-operation';
import { receivedAuditSourceNativeAuthority } from '../documents/received-audit-source-access';
import { type InterfaceLocale } from '../localization/interface-locale';
import {
  attachFromDraft,
  emptyAttachDraft,
} from './certification-documents-draft';
import {
  CERTIFICATION_LIMITS,
  parseEligibleDocuments,
  sourceKey,
  type CaseDetail,
  type CertificationAttachment,
  type DocumentRegister,
  type EligibleDocuments,
} from './certification-response';
import { AttachForm, type EligibleView } from './CertificationDocumentForms';
import {
  DossierRegister,
  RegisterPdfAction,
  type RegisterDownload,
  type RegisterPdfDownload,
} from './CertificationDocumentViews';

import {
  IDLE,
  retryUncertainCommand,
  reuse,
  blockedUntilReload,
  clearReloadedFeedback,
  describedFeedbackId,
  refusedWith,
  type Intent,
  type Feedback,
} from './certification-command';

import type { CertificationCaseView as CaseView } from './certification-command';

import type {
  CertificationWorkflowContext,
  CertificationQuery,
  CertificationAccess,
} from './certification-command';
import { refusal } from './certification-case-view';
/** The eligible PDFs of one Case, read under the Document rights captured. */
type Eligible = {
  caseId: string;
  rights: string;
  view: EligibleView;
};
/** The download of one attachment, under the Document rights it began with. */
type Download =
  | { status: 'idle' }
  | {
      status: 'pending' | 'failed' | 'denied' | 'unavailable';
      attachmentId: string;
      rights: string;
    };
/** The download of the generated dossier register of the open Case. */
type RegisterPdf = { status: RegisterPdfDownload['status'] };
const NO_DOWNLOAD: Download = { status: 'idle' };
const NO_REGISTER_PDF: RegisterPdf = { status: 'idle' };
/** The register's closed language set, one per interface locale. */
const REGISTER_LANGUAGE = {
  en: 'en',
  fr: 'fr',
  ro: 'ro',
  ru: 'ru',
} as const satisfies Record<InterfaceLocale, 'en' | 'fr' | 'ro' | 'ru'>;
const PDF_SIGNATURE = '%PDF-';
interface DocumentsContext extends CertificationWorkflowContext<'attach'> {
  identity: BrowserIdentity;
  companyId: string;
  scope: string;
  locale: InterfaceLocale;
  query: CertificationQuery;
  rejectAccess: (
    operation: ScopedOperation,
    signal: AbortSignal,
    result: ApiResult<unknown>,
    access: CertificationAccess,
  ) => void;
}
/** Owns the current Case’s Document Version attachment and PDF downloads. */
export function useCertificationDocuments({
  view,
  actor,
  authority,
  prefix,
  copy,
  identity,
  companyId,
  scope,
  locale,
  query,
  rejectAccess,
  commit,
  renderFeedback,
}: DocumentsContext) {
  const registerOperation = useScopedOperation(scope);
  /**
   * The captured right to read received-source content, which reading,
   * listing and attaching the Client's PDFs need. Its change retires their
   * work without retiring the Case, which needs no Document right.
   */
  const documentRights =
    receivedAuditSourceNativeAuthority(actor)?.content ?? null;
  const documentScope = JSON.stringify([scope, documentRights]);
  const eligibleOperation = useScopedOperation(documentScope);
  const contentOperation = useScopedOperation(documentScope);
  /** The attach form is open; it reads the eligible PDFs when opened. */
  const [attaching, setAttaching] = useState(false);
  const [attachDraft, setAttachDraft] = useState(emptyAttachDraft);
  const [attachFeedback, setAttachFeedback] = useState<Feedback>(IDLE);
  const [eligible, setEligible] = useState<Eligible>();
  const [download, setDownload] = useState<Download>(NO_DOWNLOAD);
  const [registerPdf, setRegisterPdf] = useState<RegisterPdf>(NO_REGISTER_PDF);
  function resetAttachDraft() {
    eligibleOperation.retire();
    setEligible(undefined);
    setAttaching(false);
    setAttachDraft(emptyAttachDraft());
  }

  /** The Client's frozen received PDFs, read under the current Document rights. */
  async function loadEligible(caseId: string, previous?: EligibleDocuments) {
    if (!documentRights) return;
    const rights = documentRights;
    const cursor = previous?.nextCursor;
    const signal = eligibleOperation.begin();
    if (!signal) return;
    const show = (view: EligibleView) => setEligible({ caseId, rights, view });
    const failed = () =>
      show(
        previous
          ? { status: 'ready', value: previous, olderPage: 'error' }
          : { status: 'error' },
      );
    show(
      previous
        ? { status: 'ready', value: previous, olderPage: 'loading' }
        : { status: 'loading' },
    );
    const path = `/certification-cases/${encodeURIComponent(caseId)}/eligible-documents`;
    try {
      const result = await query(
        eligibleOperation,
        signal,
        cursor ? `${path}?cursor=${encodeURIComponent(cursor)}` : path,
        undefined,
        'documents',
      );
      if (signal.aborted) return;
      if (result.status !== 'ok') {
        const status = refusal(result);
        if (previous && status === 'error') failed();
        else show({ status });
        return;
      }
      const page = parseEligibleDocuments(result.value, caseId);
      if (!previous) {
        show({ status: 'ready', value: page });
        return;
      }
      if (page.nextCursor === cursor)
        throw new Error('Unchanged document cursor.');
      const seen = new Set(previous.items.map(sourceKey));
      show({
        status: 'ready',
        value: {
          ...page,
          items: [
            ...previous.items,
            ...page.items.filter((item) => !seen.has(sourceKey(item))),
          ],
        },
      });
    } catch {
      if (!signal.aborted) failed();
    }
  }

  /** The eligible read of this Case under the current rights, if any. */
  function eligibleFor(caseId: string): EligibleView | undefined {
    return eligible?.caseId === caseId && eligible.rights === documentRights
      ? eligible.view
      : undefined;
  }

  /**
   * Saves the exact attached PDF, released only once its type, size and
   * SHA-256 match the register, under the Document rights it began with.
   */
  async function downloadAttachment(
    caseId: string,
    attachment: CertificationAttachment,
  ) {
    if (!documentRights) return;
    const rights = documentRights;
    const signal = contentOperation.begin();
    if (!signal) return;
    const settle = (status: 'failed' | 'denied' | 'unavailable') =>
      setDownload({ status, attachmentId: attachment.id, rights });
    setDownload({ status: 'pending', attachmentId: attachment.id, rights });
    try {
      const api = await createAuthenticatedApiClient(identity);
      if (signal.aborted) return;
      const result = await api.download(
        `/certification-cases/${encodeURIComponent(caseId)}/documents/${encodeURIComponent(attachment.id)}/content`,
        {
          companyContextId: companyId,
          signal,
          cache: 'no-store',
          maximumBytes: CERTIFICATION_LIMITS.pdfBytes,
        },
      );
      if (signal.aborted) return;
      if (result.status !== 'ok') {
        rejectAccess(contentOperation, signal, result, 'documents');
        if (result.status === 'unauthorized') return;
        settle(
          result.status === 'forbidden'
            ? 'denied'
            : result.status === 'notFound'
              ? 'unavailable'
              : 'failed',
        );
        return;
      }
      const pdf = result.value;
      if (
        pdf.type.split(';')[0] !== 'application/pdf' ||
        pdf.size !== attachment.sizeBytes
      ) {
        settle('failed');
        return;
      }
      const bytes = await pdf.arrayBuffer();
      if (signal.aborted) return;
      const digest = await crypto.subtle.digest('SHA-256', bytes);
      if (signal.aborted) return;
      if (hexadecimal(digest) !== attachment.sha256) {
        settle('failed');
        return;
      }
      savePdf(pdf, attachment.fileName);
      setDownload(NO_DOWNLOAD);
    } catch {
      if (!signal.aborted) settle('failed');
    }
  }

  /**
   * Saves the generated register of the Case in the interface language,
   * released only once the reply is a non-empty PDF within the server's bound.
   */
  async function downloadRegisterPdf(caseId: string) {
    const signal = registerOperation.begin();
    if (!signal) return;
    setRegisterPdf({ status: 'pending' });
    try {
      const api = await createAuthenticatedApiClient(identity);
      if (signal.aborted) return;
      const result = await api.download(
        `/certification-cases/${encodeURIComponent(caseId)}/register?language=${REGISTER_LANGUAGE[locale]}`,
        {
          companyContextId: companyId,
          signal,
          cache: 'no-store',
          maximumBytes: CERTIFICATION_LIMITS.registerPdfBytes,
        },
      );
      if (signal.aborted) return;
      if (result.status !== 'ok') {
        // A refused read retires the Case like any Case read.
        rejectAccess(registerOperation, signal, result, 'certification');
        if (result.status === 'unauthorized' || result.status === 'forbidden')
          return;
        setRegisterPdf({
          status: result.status === 'notFound' ? 'unavailable' : 'failed',
        });
        return;
      }
      const pdf = result.value;
      const signature = new TextDecoder().decode(
        await pdf.slice(0, PDF_SIGNATURE.length).arrayBuffer(),
      );
      if (signal.aborted) return;
      if (
        pdf.type.split(';')[0] !== 'application/pdf' ||
        signature !== PDF_SIGNATURE
      ) {
        setRegisterPdf({ status: 'failed' });
        return;
      }
      // The server's name for the register of this Case.
      savePdf(pdf, `certification-case-register-${caseId.slice(0, 8)}.pdf`);
      setRegisterPdf(NO_REGISTER_PDF);
    } catch {
      if (!signal.aborted) setRegisterPdf({ status: 'failed' });
    }
  }

  /** The exact attachments open through the register's download, if allowed. */
  function registerDownload(
    view: CaseView,
    busy: boolean,
  ): RegisterDownload | undefined {
    return documentRights
      ? {
          pendingId:
            download.status === 'pending' && download.rights === documentRights
              ? download.attachmentId
              : undefined,
          disabled: busy,
          onDownload: (attachment) =>
            void downloadAttachment(view.caseDetail.id, attachment),
        }
      : undefined;
  }

  const feedbackId = `${prefix}-attach-feedback`;
  function execute(intent: Intent) {
    return commit({
      kind: 'attach',
      intent,
      setFeedback: setAttachFeedback,
      confirmed: resetAttachDraft,
    });
  }
  function feedbackMessage() {
    return renderFeedback({
      kind: 'attach',
      feedback: attachFeedback,
      id: feedbackId,
      retry: () => retryUncertainCommand(attachFeedback, execute),
    });
  }
  function render(
    busy: boolean,
    presentRegister: (
      props: Parameters<typeof DossierRegister>[0],
    ) => ReactNode = (props) => <DossierRegister {...props} />,
  ) {
    if (!view) return null;
    const caseView = view;
    function submitAttach(event: FormEvent) {
      event.preventDefault();
      if (
        busy ||
        !authority.manage ||
        !documentRights ||
        blockedUntilReload(attachFeedback)
      )
        return;
      const { caseDetail: current, register } = caseView;
      const listed = eligibleFor(current.id);
      const input =
        listed?.status === 'ready'
          ? attachFromDraft(attachDraft, {
              eligible: listed.value.items,
              register: register.items,
            })
          : undefined;
      if (!input) {
        setAttachFeedback(refusedWith('attachValidation'));
        return;
      }
      const body = JSON.stringify({
        expectedRevision: current.revision,
        role: input.role,
        documentId: input.documentId,
        versionId: input.versionId,
        representationId: input.representationId,
        ...(input.note === null ? {} : { note: input.note }),
      });
      void execute(
        reuse(attachFeedback, {
          path: `/certification-cases/${encodeURIComponent(current.id)}/documents`,
          body,
          caseId: current.id,
        }),
      );
    }

    function downloadMessage() {
      if (download.status === 'idle' || download.rights !== documentRights)
        return null;
      switch (download.status) {
        case 'pending':
          return <p role="status">{copy('documentDownloading')}</p>;
        case 'failed':
          return <p role="alert">{copy('documentDownloadFailed')}</p>;
        case 'denied':
          return <p role="alert">{copy('documentsDenied')}</p>;
        case 'unavailable':
          return <p role="alert">{copy('documentDownloadUnavailable')}</p>;
      }
      return unexpected(download);
    }

    /** The attach form, or the plain-language reason it is unavailable. */
    function attachStep(current: CaseDetail, register: DocumentRegister) {
      if (current.status !== 'open' && current.status !== 'certified')
        return null;
      if (!documentRights)
        return <p className="certification-note">{copy('attachNoRights')}</p>;
      const listed = eligibleFor(current.id);
      if (!attaching || !listed)
        return (
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setAttaching(true);
              if (attachFeedback.status === 'saved') setAttachFeedback(IDLE);
              void loadEligible(current.id);
            }}
          >
            {copy('attachToggle')}
          </button>
        );
      return (
        <AttachForm
          idPrefix={`${prefix}-attach`}
          eligible={listed}
          certified={current.status === 'certified'}
          register={register.items}
          draft={attachDraft}
          disabled={busy}
          submitting={attachFeedback.status === 'saving'}
          submitBlocked={blockedUntilReload(attachFeedback)}
          feedbackId={describedFeedbackId(attachFeedback, feedbackId)}
          onChange={(draft) => {
            setAttachDraft(draft);
            if (
              attachFeedback.status === 'saved' ||
              (attachFeedback.status === 'refused' && !attachFeedback.reload)
            )
              setAttachFeedback(IDLE);
          }}
          onSubmit={submitAttach}
          onCancel={() => {
            resetAttachDraft();
            setAttachFeedback(IDLE);
          }}
          onReloadEligible={() => void loadEligible(current.id)}
          onLoadOlder={(page) => void loadEligible(current.id, page)}
        />
      );
    }

    /** The agreement form, the correction entry or why it is unavailable. */
    return (
      <section aria-labelledby={`${prefix}-documents-title`}>
        <h5 id={`${prefix}-documents-title`}>{copy('documentsTitle')}</h5>
        <p>{copy('documentsHelp')}</p>
        {presentRegister({
          register: caseView.register,
          download: registerDownload(caseView, busy),
        })}
        {!documentRights && (
          <p className="certification-note">
            {copy('documentsNoContentRights')}
          </p>
        )}
        {downloadMessage()}
        {authority.manage && (
          <>
            {feedbackMessage()}
            {attachStep(caseView.caseDetail, caseView.register)}
          </>
        )}
      </section>
    );
  }
  /** The generated register's download for the read Case, if one is open. */
  function registerPdfDownload(busy: boolean): RegisterPdfDownload | undefined {
    if (!view) return undefined;
    const caseId = view.caseDetail.id;
    return {
      status: registerPdf.status,
      disabled: busy,
      onDownload: () => void downloadRegisterPdf(caseId),
    };
  }
  function renderRegister(busy: boolean) {
    const download = registerPdfDownload(busy);
    if (!download) return null;
    return (
      <section aria-labelledby={`${prefix}-register-pdf-title`}>
        <h5 id={`${prefix}-register-pdf-title`}>{copy('registerPdfTitle')}</h5>
        <RegisterPdfAction download={download} />
      </section>
    );
  }
  return {
    render,
    renderRegister,
    registerPdfDownload,
    registerDownload,
    reset: () => {
      resetAttachDraft();
      setAttachFeedback(IDLE);
      contentOperation.retire();
      setDownload(NO_DOWNLOAD);
      registerOperation.retire();
      setRegisterPdf(NO_REGISTER_PDF);
    },
    clearRefusals: () => setAttachFeedback(clearReloadedFeedback),
    retire: (except: ScopedOperation) => {
      for (const operation of [
        eligibleOperation,
        contentOperation,
        registerOperation,
      ])
        if (operation !== except) operation.retire();
    },
    saving: attachFeedback.status === 'saving',
    saved: attachFeedback.status === 'saved',
  };
}

function hexadecimal(digest: ArrayBuffer): string {
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
}

function savePdf(pdf: Blob, fileName: string) {
  const url = URL.createObjectURL(pdf);
  try {
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    anchor.click();
  } finally {
    URL.revokeObjectURL(url);
  }
}
