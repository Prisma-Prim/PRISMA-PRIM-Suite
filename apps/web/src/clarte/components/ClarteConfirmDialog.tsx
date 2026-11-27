import { useId, useRef } from 'react';
import { ClarteButton } from './ClarteButton';
import { useClarteComponentCopy } from './clarte-components.copy';
import { useModalFocus } from './use-modal-focus';

/**
 * Asks before a consequential action. Focus starts on Cancel, Escape cancels,
 * and the confirm button states the action itself, never a bare "OK".
 */
export function ClarteConfirmDialog({
  title,
  description,
  confirmLabel,
  cancelLabel,
  tone = 'primary',
  busy = false,
  onConfirm,
  onCancel,
}: Readonly<{
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: 'primary' | 'danger';
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}>) {
  const copy = useClarteComponentCopy();
  const dialog = useRef<HTMLDivElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const handleKeyDown = useModalFocus({
    container: dialog,
    initialFocus: cancel,
    onDismiss: onCancel,
  });
  return (
    <div className="clarte-layer clarte-layer--center">
      <div
        ref={dialog}
        className="clarte-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        onKeyDown={handleKeyDown}
      >
        <h2 id={titleId}>{title}</h2>
        <p id={descriptionId}>{description}</p>
        <div className="clarte-dialog-actions">
          <ClarteButton ref={cancel} onClick={onCancel}>
            {cancelLabel ?? copy.cancel}
          </ClarteButton>
          <ClarteButton
            variant={tone}
            disabled={busy}
            aria-busy={busy || undefined}
            onClick={onConfirm}
          >
            {confirmLabel}
          </ClarteButton>
        </div>
      </div>
    </div>
  );
}
