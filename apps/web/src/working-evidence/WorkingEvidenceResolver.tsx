import { useEffect, useState } from 'react';
import type { ActorContext } from '../access-types';
import type { BrowserIdentity } from '../access-composition';
import { useWorkingEvidenceAuthority } from './use-working-evidence-authority';
import { evidenceId } from './working-evidence-response';
import { useWorkingEvidenceCopy } from './working-evidence.copy';
import {
  useEvidenceOperations,
  type EvidenceCallbacks,
} from './use-evidence-operations';
function target(hash: string) {
  const match = /^#working-evidence\/([^/]+)\/([^/]+)\/([^/]+)$/u.exec(hash);
  if (!match) return null;
  const [, caseId, revisionId, evidence] = match;
  try {
    return {
      caseId: evidenceId(caseId),
      revisionId: evidenceId(revisionId),
      evidenceId: evidenceId(evidence),
    };
  } catch {
    return null;
  }
}
/** Frozen statements navigate here; current authentication/context headers own every byte read. */
export function WorkingEvidenceResolver(
  props: EvidenceCallbacks & { actor: ActorContext; identity: BrowserIdentity },
) {
  const [hash, setHash] = useState(window.location.hash);
  useEffect(() => {
    const changed = () => setHash(window.location.hash);
    window.addEventListener('hashchange', changed);
    window.addEventListener('popstate', changed);
    return () => {
      window.removeEventListener('hashchange', changed);
      window.removeEventListener('popstate', changed);
    };
  }, []);
  const destination = target(hash),
    authority = useWorkingEvidenceAuthority(props.actor, props.identity, hash);
  const copy = useWorkingEvidenceCopy();
  if (!hash.startsWith('#working-evidence/')) return null;
  if (
    !destination ||
    !authority?.source ||
    !props.identity.loaded ||
    !props.identity.signedIn
  )
    return <p role="alert">{copy('sourceUnavailable')}</p>;
  return (
    <ResolverOwner
      key={JSON.stringify([hash, authority.read, authority.source])}
      {...props}
      destination={destination}
      signature={JSON.stringify([authority.read, authority.source])}
    />
  );
}
function ResolverOwner(
  props: EvidenceCallbacks & {
    actor: ActorContext;
    identity: BrowserIdentity;
    signature: string;
    destination: NonNullable<ReturnType<typeof target>>;
  },
) {
  const copy = useWorkingEvidenceCopy(),
    operations = useEvidenceOperations(props),
    [state, setState] = useState<'ready' | 'pending' | 'unavailable'>('ready');
  async function open() {
    const owner = operations.operation();
    setState('pending');
    const destination = props.destination;
    const result = await operations.download(
      `/working-evidence-cases/${destination.caseId}/revisions/${destination.revisionId}/evidence/${destination.evidenceId}`,
      'working-evidence-original.pdf',
      'application/pdf',
      5 * 1024 * 1024,
    );
    if (owner.current()) setState(result ? 'ready' : 'unavailable');
    owner.finish();
  }
  return (
    <section className="working-evidence" aria-label={copy('open')}>
      <p>{copy('meaning')}</p>
      <button
        type="button"
        disabled={state === 'pending'}
        onClick={() => void open()}
      >
        {copy('open')}
      </button>
      {state === 'pending' && <p role="status">{copy('loading')}</p>}
      {state === 'unavailable' && (
        <p role="alert">{copy('sourceUnavailable')}</p>
      )}
    </section>
  );
}
