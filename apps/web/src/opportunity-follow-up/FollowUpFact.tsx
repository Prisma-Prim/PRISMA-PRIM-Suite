import { useInterfaceLocale } from '../localization/interface-locale';
import type { FollowUpHead } from './follow-up-contract';
import { useFollowUpCopy } from './follow-up.copy';

export function FollowUpFact({ fact }: { fact: FollowUpHead }) {
  const copy = useFollowUpCopy();
  const { formatDate, formatDateTime } = useInterfaceLocale();
  if (fact.state === 'UNRECORDED') return <p>{copy('noEntry')}</p>;
  return (
    <div className="opportunity-follow-up-fact">
      <p>
        {fact.followUpOn === null ? (
          copy('undated')
        ) : (
          <time dateTime={fact.followUpOn}>{formatDate(fact.followUpOn)}</time>
        )}
      </p>
      <p className="opportunity-follow-up-literal">
        {fact.recordedBy.displayLabel}
      </p>
      <time dateTime={fact.recordedAt}>{formatDateTime(fact.recordedAt)}</time>
    </div>
  );
}
