import { useInterfaceLocale } from '../localization/interface-locale';
import { formatMessage } from '../localization/messages';
import {
  useCertificationCopy,
  type CertificationMessageKey,
} from './certification.copy';
import type {
  CertificationAgreement,
  CertificationAttachment,
  CertificationDocumentRole,
  DocumentRegister,
} from './certification-response';

/** Leading characters of a SHA-256 shown before the full value is asked for. */
const DIGEST_PREVIEW = 12;

export function documentRoleLabel(
  role: CertificationDocumentRole,
): CertificationMessageKey {
  switch (role) {
    case 'questionnaire':
      return 'roleQuestionnaire';
    case 'iso22000_annex':
      return 'roleIso22000Annex';
    case 'agreement':
      return 'roleAgreement';
    case 'plan':
      return 'rolePlan';
    case 'participant_list':
      return 'roleParticipantList';
    case 'report':
      return 'roleReport';
    case 'evidence':
      return 'roleEvidence';
    case 'certificate':
      return 'roleCertificate';
    case 'other':
      return 'roleOther';
  }
  return unexpected(role);
}

/** "Title — version N (file.pdf)": one attachment in a sentence or option. */
export function useAttachmentReference() {
  const copy = useCertificationCopy();
  return (attachment: CertificationAttachment) =>
    formatMessage(copy('documentReference'), {
      title: attachment.sourceTitle,
      version: attachment.versionNumber,
      file: attachment.fileName,
    });
}

/** A file size in decimal units of the interface locale. */
function useFileSize() {
  const { locale } = useInterfaceLocale();
  return (bytes: number) => {
    const { value, unit } =
      bytes < 1000
        ? { value: bytes, unit: 'byte' }
        : bytes < 1_000_000
          ? { value: bytes / 1000, unit: 'kilobyte' }
          : { value: bytes / 1_000_000, unit: 'megabyte' };
    return new Intl.NumberFormat(locale, {
      style: 'unit',
      unit,
      unitDisplay: 'short',
      maximumFractionDigits: 1,
    }).format(value);
  };
}

export type RegisterDownload = {
  /** The attachment whose PDF is being downloaded, if any. */
  pendingId: string | undefined;
  disabled: boolean;
  onDownload: (attachment: CertificationAttachment) => void;
};

/**
 * Every attachment in attachment order with its exact recorded facts. The
 * download action is offered only with the Document right to read content.
 */
export function DossierRegister({
  register,
  download,
}: {
  register: DocumentRegister;
  download: RegisterDownload | undefined;
}) {
  const copy = useCertificationCopy();
  const { formatDateTime } = useInterfaceLocale();
  const size = useFileSize();
  if (register.items.length === 0) return <p>{copy('documentsEmpty')}</p>;
  return (
    <ol className="certification-documents">
      {register.items.map((item) => {
        const title = formatMessage(copy('documentVersionOf'), {
          title: item.sourceTitle,
          version: item.versionNumber,
        });
        return (
          <li key={item.id}>
            <strong>{title}</strong>
            <dl className="certification-facts">
              <div>
                <dt>{copy('documentRole')}</dt>
                <dd>{copy(documentRoleLabel(item.role))}</dd>
              </div>
              <div>
                <dt>{copy('documentFile')}</dt>
                <dd>{item.fileName}</dd>
              </div>
              <div>
                <dt>{copy('documentSize')}</dt>
                <dd>{size(item.sizeBytes)}</dd>
              </div>
              <div>
                <dt>{copy('documentDigest')}</dt>
                <dd>
                  <details className="certification-digest">
                    <summary title={copy('documentDigestShow')}>
                      <code>{item.sha256.slice(0, DIGEST_PREVIEW)}…</code>
                    </summary>
                    <code>{item.sha256}</code>
                  </details>
                </dd>
              </div>
              <div>
                <dt>{copy('documentAttachedBy')}</dt>
                <dd>{item.attachedBy.displayName}</dd>
              </div>
              <div>
                <dt>{copy('documentAttachedAt')}</dt>
                <dd>
                  <time dateTime={item.attachedAt}>
                    {formatDateTime(item.attachedAt)}
                  </time>
                </dd>
              </div>
              {item.note !== null && (
                <div>
                  <dt>{copy('note')}</dt>
                  <dd>{item.note}</dd>
                </div>
              )}
            </dl>
            {download && (
              <div className="certification-actions">
                <button
                  type="button"
                  disabled={
                    download.disabled || download.pendingId !== undefined
                  }
                  onClick={() => download.onDownload(item)}
                >
                  {formatMessage(copy('documentDownload'), {
                    title: item.sourceTitle,
                    version: item.versionNumber,
                  })}
                </button>
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}

/** The signature date and the attached signed original it refers to. */
export function AgreementView({
  agreement,
  register,
}: {
  agreement: CertificationAgreement;
  register: DocumentRegister;
}) {
  const copy = useCertificationCopy();
  const { formatDate } = useInterfaceLocale();
  const reference = useAttachmentReference();
  const attached = register.items.find(
    (item) => item.id === agreement.attachmentId,
  );
  return (
    <dl className="certification-facts">
      <div>
        <dt>{copy('agreementSignedOn')}</dt>
        <dd>
          <time dateTime={agreement.signedOn}>
            {formatDate(agreement.signedOn)}
          </time>
        </dd>
      </div>
      <div>
        <dt>{copy('agreementDocument')}</dt>
        {/* The read checks that the register holds every agreement's original. */}
        <dd>{attached ? reference(attached) : agreement.attachmentId}</dd>
      </div>
    </dl>
  );
}

function unexpected(value: never): never {
  throw new Error(`Unexpected Certification document role: ${String(value)}`);
}
