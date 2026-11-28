import { Download, FileText } from 'lucide-react';
import type { ReactNode } from 'react';
import { useCertificationCopy } from '../../certification/certification.copy';
import {
  documentRoleLabel,
  useFileSize,
  type DossierRegister,
} from '../../certification/CertificationDocumentViews';
import type { CertificationRegistry } from '../../certification/use-certification-registry';
import { useInterfaceLocale } from '../../localization/interface-locale';
import { formatMessage } from '../../localization/messages';
import { ClarteBadge } from '../components/ClarteBadge';
import { ClarteButton } from '../components/ClarteButton';
import { ClarteEmptyState } from '../components/ClarteState';
import { ClarteCard } from '../components/ClarteCard';
import { useClarteCertificationCopy } from './clarte-certification.copy';

export function ClarteCaseDocuments({
  registry,
  busy,
  projectSources,
}: {
  registry: CertificationRegistry;
  busy: boolean;
  projectSources: ReactNode;
}) {
  const copy = useClarteCertificationCopy();
  return (
    <>
      {registry.documents.render(busy, (props) => (
        <AttachmentTable {...props} />
      ))}
      {projectSources && (
        <ClarteCard title={copy('projectSources')}>
          <div className="clarte-case-project-sources">{projectSources}</div>
        </ClarteCard>
      )}
    </>
  );
}

function AttachmentTable({
  register,
  download,
}: Parameters<typeof DossierRegister>[0]) {
  const copy = useCertificationCopy();
  const { formatDateTime } = useInterfaceLocale();
  const size = useFileSize();
  if (register.items.length === 0)
    return <ClarteEmptyState title={copy('documentsEmpty')} />;
  return (
    <div className="clarte-table-wrap">
      <table
        className="clarte-table clarte-case-attachments"
        aria-label={copy('documentsTitle')}
      >
        <thead>
          <tr>
            <th scope="col">{copy('documentFile')}</th>
            <th scope="col">{copy('documentRole')}</th>
            <th scope="col">{copy('documentAttachedAt')}</th>
            <th scope="col">{copy('documentDigest')}</th>
            {download && (
              <th scope="col">
                <Download aria-hidden="true" size={16} />
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {register.items.map((item) => (
            <tr key={item.id}>
              <th scope="row">
                <span className="clarte-case-file">
                  <FileText size={16} aria-hidden="true" />
                  {formatMessage(copy('documentVersionOf'), {
                    title: item.sourceTitle,
                    version: item.versionNumber,
                  })}
                </span>
                <small>
                  {item.fileName} · {size(item.sizeBytes)}
                </small>
                {item.note && <small>{item.note}</small>}
              </th>
              <td data-label={copy('documentRole')}>
                <ClarteBadge>{copy(documentRoleLabel(item.role))}</ClarteBadge>
              </td>
              <td data-label={copy('documentAttachedAt')}>
                <time dateTime={item.attachedAt}>
                  {formatDateTime(item.attachedAt)}
                </time>
                <small>{item.attachedBy.displayName}</small>
              </td>
              <td data-label={copy('documentDigest')}>
                <details className="certification-digest">
                  <summary title={copy('documentDigestShow')}>
                    <code>{item.sha256.slice(0, 10)}…</code>
                  </summary>
                  <code>{item.sha256}</code>
                </details>
              </td>
              {download && (
                <td className="clarte-case-download">
                  <ClarteButton
                    size="small"
                    variant="quiet"
                    aria-label={formatMessage(copy('documentDownload'), {
                      title: item.sourceTitle,
                      version: item.versionNumber,
                    })}
                    disabled={
                      download.disabled || download.pendingId !== undefined
                    }
                    onClick={() => download.onDownload(item)}
                  >
                    <Download aria-hidden="true" />
                  </ClarteButton>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
