import { useInterfaceLocale } from '../localization/interface-locale';
import {
  complaintCalendarDate,
  type ComplaintIntake,
} from './complaints-response';
import { useComplaintCopy } from './complaints.copy';

export type Draft = {
  complaintDate: string;
  complainant: string;
  subject: string;
  severityDescription: string;
  responseDueDate: string;
};
export function IntakeFields({
  value,
  onChange,
  disabled,
  invalid,
}: {
  value: Draft;
  onChange: (value: Draft) => void;
  disabled: boolean;
  invalid: boolean;
}) {
  const copy = useComplaintCopy();
  return (
    <div className="complaint-fields">
      <label htmlFor="complaint-complainant">
        {copy('complainant')}
        <input
          id="complaint-complainant"
          value={value.complainant}
          maxLength={300}
          disabled={disabled}
          required
          aria-invalid={invalid && !value.complainant.trim()}
          aria-describedby={invalid ? 'complaint-feedback' : undefined}
          onChange={(event) =>
            onChange({ ...value, complainant: event.target.value })
          }
        />
      </label>
      <div className="complaint-field">
        <label htmlFor="complaint-declared-date">{copy('complaintDate')}</label>
        <input
          id="complaint-declared-date"
          type="text"
          inputMode="numeric"
          placeholder="YYYY-MM-DD"
          value={value.complaintDate}
          maxLength={10}
          disabled={disabled}
          aria-describedby={
            invalid
              ? 'complaint-date-hint complaint-feedback'
              : 'complaint-date-hint'
          }
          aria-invalid={
            invalid &&
            value.complaintDate !== '' &&
            !complaintCalendarDate(value.complaintDate)
          }
          onChange={(event) =>
            onChange({ ...value, complaintDate: event.target.value })
          }
        />
        <span id="complaint-date-hint" className="complaint-muted">
          {copy('dateHint')}
        </span>
      </div>
      <label htmlFor="complaint-subject" className="complaint-field--wide">
        {copy('subject')}
        <textarea
          id="complaint-subject"
          value={value.subject}
          maxLength={5000}
          disabled={disabled}
          required
          aria-invalid={invalid && !value.subject.trim()}
          aria-describedby={invalid ? 'complaint-feedback' : undefined}
          onChange={(event) =>
            onChange({ ...value, subject: event.target.value })
          }
        />
      </label>
      <label htmlFor="complaint-severity">
        {copy('severity')}
        <textarea
          id="complaint-severity"
          value={value.severityDescription}
          maxLength={1000}
          disabled={disabled}
          onChange={(event) =>
            onChange({ ...value, severityDescription: event.target.value })
          }
        />
      </label>
      <div className="complaint-field">
        <label htmlFor="complaint-response-due-date">
          {copy('responseDueDate')}
        </label>
        <input
          id="complaint-response-due-date"
          type="text"
          inputMode="numeric"
          placeholder="YYYY-MM-DD"
          value={value.responseDueDate}
          maxLength={10}
          disabled={disabled}
          aria-describedby={
            invalid
              ? 'complaint-due-date-hint complaint-feedback'
              : 'complaint-due-date-hint'
          }
          aria-invalid={
            invalid &&
            value.responseDueDate !== '' &&
            !complaintCalendarDate(value.responseDueDate)
          }
          onChange={(event) =>
            onChange({ ...value, responseDueDate: event.target.value })
          }
        />
        <span id="complaint-due-date-hint" className="complaint-muted">
          {copy('dateHint')}
        </span>
      </div>
    </div>
  );
}
export function IntakeFacts({ intake }: { intake: ComplaintIntake }) {
  const copy = useComplaintCopy();
  const { formatDate } = useInterfaceLocale();
  return (
    <dl className="complaint-facts">
      <div>
        <dt>{copy('complainant')}</dt>
        <dd className="complaint-literal">{intake.complainant}</dd>
      </div>
      <div>
        <dt>{copy('complaintDate')}</dt>
        <dd>
          {intake.complaintDate === null
            ? copy('unknownDate')
            : formatDate(intake.complaintDate)}
        </dd>
      </div>
      <div className="complaint-field--wide">
        <dt>{copy('subject')}</dt>
        <dd className="complaint-literal">{intake.subject}</dd>
      </div>
      <div>
        <dt>{copy('severity')}</dt>
        <dd className="complaint-literal">
          {intake.severityDescription ?? copy('unknownValue')}
        </dd>
      </div>
      <div>
        <dt>{copy('responseDueDate')}</dt>
        <dd>
          {intake.responseDueDate === null
            ? copy('unknownDate')
            : formatDate(intake.responseDueDate)}
        </dd>
      </div>
    </dl>
  );
}
export function Pagination({
  offset,
  total,
  disabled,
  onChange,
}: {
  offset: number;
  total: number;
  disabled: boolean;
  onChange: (offset: number) => void;
}) {
  const copy = useComplaintCopy();
  const { formatNumber } = useInterfaceLocale();
  if (total <= 25 && offset === 0) return null;
  return (
    <nav className="complaint-pagination" aria-label={copy('pages')}>
      <button
        type="button"
        className="complaint-button complaint-button--secondary"
        disabled={disabled || offset === 0}
        onClick={() => onChange(Math.max(0, offset - 25))}
      >
        {copy('previous')}
      </button>
      <span>
        {formatNumber(total)} {copy('records')}
      </span>
      <button
        type="button"
        className="complaint-button complaint-button--secondary"
        disabled={disabled || offset + 25 >= total}
        onClick={() => onChange(offset + 25)}
      >
        {copy('next')}
      </button>
    </nav>
  );
}
