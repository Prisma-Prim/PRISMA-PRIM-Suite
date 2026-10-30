import { useInterfaceLocale } from '../localization/interface-locale';
import { useProjectNextActionCopy } from './project-next-action.copy';
import type {
  NextActionAttribution,
  NextActionRecord,
} from './project-next-action-response';

export function Attribution({ value }: { value: NextActionAttribution }) {
  const { formatDateTime } = useInterfaceLocale();
  return (
    <p>
      {value.displayName} —{' '}
      <time dateTime={value.occurredAt}>
        {formatDateTime(value.occurredAt)}
      </time>
    </p>
  );
}
export function NextActionValue({ record }: { record: NextActionRecord }) {
  const copy = useProjectNextActionCopy();
  return (
    <div>
      <p className="next-action-literal">
        {record.revision === 0
          ? copy('missing')
          : (record.text ?? copy('cleared'))}
      </p>
      <p>
        {copy('revision')} {record.revision}
      </p>
      {record.lastChange && <Attribution value={record.lastChange} />}
    </div>
  );
}
