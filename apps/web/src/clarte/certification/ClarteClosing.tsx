import type { CertificationRegistry } from '../../certification/use-certification-registry';
import { useClarteCertificationCopy } from './clarte-certification.copy';

export function ClarteClosing({
  registry,
  busy,
  step,
}: {
  registry: CertificationRegistry;
  busy: boolean;
  step: Exclude<
    Parameters<CertificationRegistry['closing']['render']>[1],
    'all' | undefined
  >;
}) {
  const copy = useClarteCertificationCopy();
  return (
    <div className="clarte-case-close-flow">
      {registry.closing.render(busy, step, { reviewItem: copy('reviewItem') })}
    </div>
  );
}
