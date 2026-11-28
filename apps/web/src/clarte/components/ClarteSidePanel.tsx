import { X } from 'lucide-react';
import { useId, useRef, type ReactNode } from 'react';
import { useClarteComponentCopy } from './clarte-components.copy';
import { useModalFocus } from './use-modal-focus';

/**
 * A modal panel from the right edge for one record's details or a form. The
 * owner renders it while open and unmounts it on `onClose`; focus returns to
 * the element that opened it.
 */
export function ClarteSidePanel({
  title,
  description,
  footer,
  onClose,
  children,
}: Readonly<{
  title: string;
  description?: string;
  footer?: ReactNode;
  onClose: () => void;
  children: ReactNode;
}>) {
  const copy = useClarteComponentCopy();
  const panel = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const handleKeyDown = useModalFocus({ container: panel, onDismiss: onClose });
  return (
    <div
      className="clarte-layer clarte-layer--side"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={panel}
        className="clarte-side-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={handleKeyDown}
      >
        <header className="clarte-side-panel-head">
          <div>
            <h2 id={titleId}>{title}</h2>
            {description && <p>{description}</p>}
          </div>
          <button
            type="button"
            className="clarte-icon-button"
            aria-label={copy.close}
            onClick={onClose}
          >
            <X aria-hidden="true" />
          </button>
        </header>
        <div className="clarte-side-panel-body">{children}</div>
        {footer && <footer className="clarte-side-panel-foot">{footer}</footer>}
      </div>
    </div>
  );
}
