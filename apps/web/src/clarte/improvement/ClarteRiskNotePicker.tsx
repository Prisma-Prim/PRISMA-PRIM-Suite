import { useId, useRef, useState } from 'react';
import { useOperationalRiskCopy } from '../../operational-risk/operational-risk.copy';
import { ClarteButton } from '../components/ClarteButton';
import { ClarteField } from '../components/ClarteField';
import { useClarteComponentCopy } from '../components/clarte-components.copy';
import { useModalFocus } from '../components/use-modal-focus';
import { useClarteImprovementCopy } from './clarte-improvement.copy';

export function ClarteRiskNotePicker({
  choices,
  onClose,
  onView,
}: Readonly<{
  choices: ReadonlyMap<string, string>;
  onClose: () => void;
  onView: (root: string) => void;
}>) {
  const copy = useOperationalRiskCopy();
  const text = useClarteImprovementCopy();
  const components = useClarteComponentCopy();
  const titleId = useId();
  const dialog = useRef<HTMLFormElement>(null);
  const [selected, setSelected] = useState('');
  const canView = choices.has(selected);
  const handleKeyDown = useModalFocus({
    container: dialog,
    onDismiss: onClose,
  });

  return (
    <div className="clarte-layer clarte-layer--center">
      <form
        ref={dialog}
        className="clarte-dialog clarte-improvement-form"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={(event) => {
          event.stopPropagation();
          handleKeyDown(event);
        }}
        onSubmit={(event) => {
          event.preventDefault();
          if (canView) onView(selected);
        }}
      >
        <h2 id={titleId}>{text('pickNote')}</h2>
        <ClarteField label={text('noteChoice')}>
          {(field) => (
            <select
              {...field}
              className="clarte-input"
              value={canView ? selected : ''}
              onChange={(event) => setSelected(event.target.value)}
            >
              <option value="">{text('chooseNote')}</option>
              {Array.from(choices, ([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
          )}
        </ClarteField>
        <div className="clarte-dialog-actions">
          <ClarteButton onClick={onClose}>{components.cancel}</ClarteButton>
          <ClarteButton type="submit" variant="primary" disabled={!canView}>
            {copy('viewStatement')}
          </ClarteButton>
        </div>
      </form>
    </div>
  );
}
