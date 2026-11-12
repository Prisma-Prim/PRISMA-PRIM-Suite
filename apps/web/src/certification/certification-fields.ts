import { isCalendarDate } from './certification-response';

/**
 * Whether a field is shown and announced invalid. It is only while its form
 * shows an alert, and only when the field's own value is wrong. Unmet
 * decision preconditions, an outdated Case or an uncertain save are states
 * of the Case that the alert explains; they mark no field whose value is
 * right.
 */
export function invalidField(
  feedbackId: string | undefined,
  wrong: boolean,
): boolean {
  return feedbackId !== undefined && wrong;
}

/** A text holding nothing but spaces. */
export function blank(value: string): boolean {
  return value.trim() === '';
}

/** The field's own trimmed text limit, including whether it is required. */
export function wrongText(
  value: string,
  maximum: number,
  required = true,
): boolean {
  return (required && blank(value)) || value.trim().length > maximum;
}

/**
 * A date its field refuses on its own: blank where required, not a real
 * calendar date, or after the latest day the field allows.
 */
export function wrongDate(
  value: string,
  { required, max }: { required: boolean; max?: string },
): boolean {
  const date = value.trim();
  if (date === '') return required;
  // ISO calendar dates compare in calendar order.
  return !isCalendarDate(date) || (max !== undefined && date > max);
}
