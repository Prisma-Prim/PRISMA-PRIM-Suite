import { formatMessage } from '../localization/messages';
import { useInterfaceLocale } from '../localization/interface-locale';
import type {
  CompanyModelContentBase,
  CompanyModelDraftBase,
  CompanyModelKind,
} from './company-model-kind';
import type { CompanyModelVersion as Version } from './company-model-response';

/** One exact version: its attribution, decision, withdrawal and literal body. */
export function CompanyModelVersion<
  Content extends CompanyModelContentBase,
  Draft extends CompanyModelDraftBase,
>({
  kind,
  version,
}: {
  kind: CompanyModelKind<Content, Draft>;
  version: Version<Content>;
}) {
  const copy = kind.useCopy();
  const versionKind = kind.useVersionKind();
  const { formatNumber, formatDateTime } = useInterfaceLocale();
  const { content } = version;
  const attribution = (
    key: 'createdBy' | 'decidedBy' | 'withdrawnBy',
    value: { actor: { displayName: string }; recordedAt: string },
  ) =>
    formatMessage(copy(key), {
      name: value.actor.displayName,
      date: formatDateTime(value.recordedAt),
    });
  return (
    <article className="company-model-version">
      <h3 className="company-model-literal">
        {formatMessage(copy('version'), {
          number: formatNumber(version.versionNumber),
        })}
        : {content.serviceTitle}
      </h3>
      <p>{versionKind}</p>
      <p className="company-model-provenance">{copy(content.sourceKind)}</p>
      <p>{attribution('createdBy', version)}</p>
      <p>
        {copy(
          !version.decision
            ? 'pending'
            : version.decision.outcome === 'APPROVE'
              ? 'approved'
              : 'rejected',
        )}
      </p>
      {version.decision && (
        <div>
          <p>{attribution('decidedBy', version.decision)}</p>
          <h4>{copy('basis')}</h4>
          <p className="company-model-literal">{version.decision.basis}</p>
        </div>
      )}
      {version.withdrawal && (
        <div>
          <p>{copy('withdrawn')}</p>
          <p>{attribution('withdrawnBy', version.withdrawal)}</p>
          <h4>{copy('withdrawReason')}</h4>
          <p className="company-model-literal">{version.withdrawal.reason}</p>
        </div>
      )}
      <kind.Body content={content} />
    </article>
  );
}
