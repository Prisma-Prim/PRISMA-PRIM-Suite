import { X } from 'lucide-react';
import { useId, useRef, type ReactNode, type Ref } from 'react';
import { useClarteComponentCopy } from './clarte-components.copy';
import { useModalFocus } from './use-modal-focus';

/**
 * A modal panel from the right edge for one record's details or a form. The
 * owner renders it while open and unmounts it on `onClose`; focus returns to
 * the element that opened it. While `dismissible` is false, for example
 * during a protected write, the panel stays open: Escape, the backdrop and
 * the close button do nothing. `titleRef` lets the owner move focus to the
 * title, which is then focusable. `icon` is a decorative mark beside it.
 */
export function ClarteSidePanel({
  title,
  description,
  footer,
  dismissible = true,
  titleRef,
  icon,
  onClose,
  children,
}: Readonly<{
  title: string;
  description?: string;
  footer?: ReactNode;
  dismissible?: boolean;
  titleRef?: Ref<HTMLHeadingElement>;
  icon?: ReactNode;
  onClose: () => void;
  children: ReactNode;
}>) {
  const copy = useClarteComponentCopy();
  const panel = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const close = () => {
    if (dismissible) onClose();
  };
  const handleKeyDown = useModalFocus({ container: panel, onDismiss: close });
  return (
    <div
      className="clarte-layer clarte-layer--side"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) close();
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
          {icon && (
            <span className="clarte-side-panel-icon" aria-hidden="true">
              {icon}
            </span>
          )}
          <div>
            <h2
              id={titleId}
              ref={titleRef}
              tabIndex={titleRef ? -1 : undefined}
            >
              {title}
            </h2>
            {description && <p>{description}</p>}
          </div>
          <button
            type="button"
            className="clarte-icon-button"
            aria-label={copy.close}
            disabled={!dismissible}
            onClick={close}
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
