import { useLayoutEffect, useState } from 'react';
import type { ActorContext } from '../access-types';
import type { BrowserIdentity } from '../access-composition';
import { useWorkingEvidenceAuthority } from './use-working-evidence-authority';
import { useWorkingEvidenceCopy } from './working-evidence.copy';
import {
  useEvidenceOperations,
  type EvidenceCallbacks,
} from './use-evidence-operations';
import type { EvidenceRevision } from './working-evidence-response';
export function EvidenceArtifacts(
  props: EvidenceCallbacks & {
    actor: ActorContext;
    identity: BrowserIdentity;
    revision: EvidenceRevision;
    sourceAuthority: string | null;
  },
) {
  const copy = useWorkingEvidenceCopy(),
    [pending, setPending] = useState(false),
    [unavailable, setUnavailable] = useState(false);
  const authority = useWorkingEvidenceAuthority(
    props.actor,
    props.identity,
    JSON.stringify([props.revision.caseId, props.revision.revisionId]),
  );
  const operations = useEvidenceOperations({
    ...props,
    signature: JSON.stringify([
      authority?.read,
      props.sourceAuthority,
      props.revision.revisionId,
    ]),
  });
  const [preview, setPreview] = useState<{
    html: string;
    current: () => boolean;
  } | null>(null);
  useLayoutEffect(() => {
    setPending(false);
    setUnavailable(false);
    setPreview(null);
  }, [
    props.sourceAuthority,
    authority?.read,
    props.revision.revisionId,
    props.identity,
  ]);
  const revision = props.revision,
    root = `/working-evidence-cases/${revision.caseId}/revisions/${revision.revisionId}`;
  async function download(
    path: string,
    name: string,
    media: string,
    maximum: number,
    expected?: { sizeBytes: number; sha256: string },
  ) {
    const request = operations.operation();
    setPending(true);
    setUnavailable(false);
    const saved = await operations.download(
      path,
      name,
      media,
      maximum,
      expected,
    );
    if (request.current()) {
      setPending(false);
      setUnavailable(!saved);
    }
    request.finish();
  }
  async function openStatement() {
    const request = operations.operation();
    setPending(true);
    setUnavailable(false);
    const result = await operations.statement(`${root}/statement`);
    if (request.current()) {
      setPending(false);
      setUnavailable(!result);
      setPreview(result);
    }
    request.finish();
  }
  if (!props.sourceAuthority || revision.evidence.state === 'unavailable')
    return <p>{copy('sourceUnavailable')}</p>;
  return (
    <div className="working-evidence-artifacts">
      <ul>
        {revision.evidence.supports.map((item) => (
          <li key={item.evidenceId}>
            <p>
              {item.sourceTitle} · {copy('revision')} {item.versionNumber}
            </p>
            <p>{item.locator}</p>
            <p>{item.supportNote}</p>
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                void download(
                  `${root}/evidence/${item.evidenceId}`,
                  'working-evidence-original.pdf',
                  'application/pdf',
                  5 * 1024 * 1024,
                  item,
                )
              }
            >
              {copy('open')}
            </button>
          </li>
        ))}
      </ul>
      <button
        type="button"
        disabled={pending}
        onClick={() => void openStatement()}
      >
        {copy('statementOpen')}
      </button>
      {preview && (
        <iframe
          title={copy('statementOpen')}
          sandbox="allow-same-origin allow-top-navigation-by-user-activation"
          srcDoc={preview.html}
          onLoad={(event) => {
            if (!preview.current()) return;
            const document = event.currentTarget.contentDocument;
            if (!document) return;
            for (const anchor of document.querySelectorAll('a'))
              anchor.addEventListener('click', (click) => {
                click.preventDefault();
                if (!preview.current()) return;
                const destination = new URL(
                  anchor.getAttribute('href') ?? '',
                  window.location.origin,
                );
                if (
                  destination.origin === window.location.origin &&
                  destination.pathname === '/' &&
                  /^#working-evidence\/[0-9a-f-]{36}\/[0-9a-f-]{36}\/[0-9a-f-]{36}$/u.test(
                    destination.hash,
                  )
                )
                  window.location.hash = destination.hash;
              });
          }}
        />
      )}
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          void download(
            `${root}/statement`,
            'working-evidence-statement.html',
            'text/html',
            256 * 1024,
          )
        }
      >
        {copy('statementDownload')}
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          void download(
            `${root}/annex`,
            'working-evidence-annex.zip',
            'application/zip',
            16 * 1024 * 1024,
          )
        }
      >
        {copy('annexDownload')}
      </button>
      {unavailable && <p role="alert">{copy('unavailable')}</p>}
    </div>
  );
}
