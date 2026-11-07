import { useInterfaceLocale } from '../localization/interface-locale';
import { formatMessage } from '../localization/messages';
import { useCertificationCopy } from './certification.copy';
import type { CertificationActorReference } from './certification-response';

/** A recorded version of a step or of a Finding, as attributed by the server. */
export type AttributedVersion = {
  version: number;
  reason: string | null;
  recordedBy: CertificationActorReference;
  recordedAt: string;
};

/** Who recorded a version, when, and why when it corrects an earlier one. */
export function VersionAttribution({
  version,
}: {
  version: AttributedVersion;
}) {
  const copy = useCertificationCopy();
  const { formatDateTime } = useInterfaceLocale();
  return (
    <p className="certification-attribution">
      {formatMessage(copy('version'), { version: version.version })} ·{' '}
      {copy('recordedBy')}: {version.recordedBy.displayName} ·{' '}
      {copy('recordedAt')}:{' '}
      <time dateTime={version.recordedAt}>
        {formatDateTime(version.recordedAt)}
      </time>
      {version.reason !== null && (
        <>
          <br />
          {copy('correctionReason')}: {version.reason}
        </>
      )}
    </p>
  );
}
