import type { DocumentVersion } from '../documents/document-response';
import type {
  Association,
  Discovery,
  VersionRead,
  Selected,
  Feedback,
} from './project-pdf-bundle-read';
import type { useProjectPdfBundleCopy } from './project-pdf-bundle.copy';
type Props = {
  copy: ReturnType<typeof useProjectPdfBundleCopy>;
  canRead: boolean;
  discovery: Discovery;
  reads: ReadonlyMap<string, VersionRead>;
  selected: Selected[];
  pending: boolean;
  feedback: Feedback;
  windowSize: number;
  discover: () => Promise<void>;
  loadVersions: (row: Association) => Promise<void>;
  select: (row: Association, version: DocumentVersion) => void;
  download: () => Promise<void>;
  remove: (entry: Selected) => void;
  clear: () => void;
  showMore: () => void;
};
/** Feature-local rendering; all identity, authorization and asynchronous lifetime belongs to its session. */
export function ProjectPdfBundleView({
  copy,
  canRead,
  discovery,
  reads,
  selected,
  pending,
  feedback,
  windowSize,
  discover,
  loadVersions,
  select,
  download,
  remove,
  clear,
  showMore,
}: Props) {
  const blocked = pending || feedback === 'stale';
  return (
    <section className="project-pdf-bundle" aria-label={copy('title')}>
      <h4>{copy('title')}</h4>
      <p>{copy('warning')}</p>
      <p>{copy('limits')}</p>
      {!canRead || discovery.kind === 'denied' ? (
        <p role="alert">{copy('denied')}</p>
      ) : (
        <>
          <button
            type="button"
            disabled={pending || discovery.kind === 'loading'}
            onClick={() => void discover()}
          >
            {copy(discovery.kind === 'idle' ? 'choose' : 'reload')}
          </button>
          {discovery.kind === 'loading' && (
            <p role="status">{copy('loading')}</p>
          )}
          {discovery.kind === 'error' && (
            <p role="alert">{copy('readError')}</p>
          )}
          {discovery.kind === 'malformed' && (
            <p role="alert">{copy('malformed')}</p>
          )}
          {discovery.kind === 'ready' && (
            <>
              {discovery.documents.length === 0 && <p>{copy('empty')}</p>}
              <ul className="project-pdf-choices">
                {discovery.documents.slice(0, windowSize).map((row) => {
                  const read = reads.get(row.document.id);
                  return (
                    <li key={row.document.id}>
                      <h5>{row.document.title}</h5>
                      <button
                        type="button"
                        disabled={blocked || read?.kind === 'loading'}
                        onClick={() => void loadVersions(row)}
                      >
                        {copy('loadVersions')} — {row.document.title}
                      </button>
                      {read?.kind === 'loading' && (
                        <p role="status">{copy('loading')}</p>
                      )}
                      {read?.kind === 'error' && (
                        <p role="alert">{copy('readError')}</p>
                      )}
                      {read?.kind === 'malformed' && (
                        <p role="alert">{copy('malformed')}</p>
                      )}
                      {read?.kind === 'ready' && (
                        <>
                          {!read.versions.some(
                            (v) => v.pdfContent.state === 'stored',
                          ) && <p>{copy('absent')}</p>}
                          <ul>
                            {read.versions.map((version) => {
                              const pdf = version.pdfContent;
                              return (
                                <li key={version.id}>
                                  <p>
                                    {copy('version')} {version.number} ·{' '}
                                    {copy(version.status)}
                                  </p>
                                  {pdf.state === 'stored' &&
                                    (pdf.access === 'denied' ? (
                                      <p>{copy('denied')}</p>
                                    ) : (
                                      <>
                                        <p>{pdf.fileName}</p>
                                        <button
                                          type="button"
                                          disabled={
                                            blocked ||
                                            selected.some(
                                              (s) =>
                                                s.item.documentId ===
                                                  row.document.id &&
                                                s.item.versionId === version.id,
                                            )
                                          }
                                          onClick={() => select(row, version)}
                                        >
                                          {copy('select')} {row.document.title}{' '}
                                          — {copy('version')} {version.number} —{' '}
                                          {pdf.fileName}
                                        </button>
                                      </>
                                    ))}
                                </li>
                              );
                            })}
                          </ul>
                        </>
                      )}
                    </li>
                  );
                })}
              </ul>
              {windowSize < discovery.documents.length && (
                <button type="button" onClick={showMore}>
                  {copy('more')}
                </button>
              )}
            </>
          )}
          <h5>
            {copy('selected')} ({selected.length}/20)
          </h5>
          <ol>
            {selected.map((s) => (
              <li key={`${s.item.documentId}:${s.item.versionId}`}>
                <p>
                  {s.title} · {copy('version')} {s.number} · {copy(s.status)} ·{' '}
                  {s.fileName}
                </p>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => remove(s)}
                >
                  {copy('remove')} {s.fileName} — {copy('version')} {s.number}
                </button>
              </li>
            ))}
          </ol>
          <div className="project-pdf-actions">
            <button
              type="button"
              disabled={pending || selected.length === 0}
              onClick={clear}
            >
              {copy('clear')}
            </button>
            <button
              type="button"
              disabled={blocked || selected.length === 0}
              onClick={() => void download()}
            >
              {copy('download')}
            </button>
          </div>
          {pending && <p role="status">{copy('pending')}</p>}
          {feedback && <p role="alert">{copy(feedback)}</p>}
        </>
      )}
    </section>
  );
}
