import { useId, type ReactNode } from 'react';

/** The attributes a field gives its control, for inputs and the shared Select. */
export type ClarteFieldControl = Readonly<{
  id: string;
  'aria-describedby': string | undefined;
  'aria-invalid': true | undefined;
}>;

/**
 * A labelled Clarté field. It renders the label, hint and error and hands the
 * control the id and descriptions that tie them together; the control keeps
 * its own value and events. For the shared Select pass `id`, and pass
 * `aria-describedby` as `describedBy` and `aria-invalid` as `invalid`.
 */
export function ClarteField({
  label,
  labelHidden = false,
  hint,
  error,
  children,
}: Readonly<{
  label: string;
  /** A search field whose purpose its icon and placeholder show keeps its label for assistive technology only. */
  labelHidden?: boolean;
  hint?: string;
  error?: string;
  children: (control: ClarteFieldControl) => ReactNode;
}>) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;
  return (
    <div className="clarte-field" data-invalid={error ? true : undefined}>
      <label
        htmlFor={id}
        className={labelHidden ? 'clarte-visually-hidden' : undefined}
      >
        {label}
      </label>
      {children({
        id,
        'aria-describedby': describedBy,
        'aria-invalid': error ? true : undefined,
      })}
      {hint && (
        <p id={hintId} className="clarte-field-hint">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="clarte-field-error">
          {error}
        </p>
      )}
    </div>
  );
}
