import { PencilLine } from 'lucide-react';
import { useEffect, useRef, type ReactNode } from 'react';
import { ClientContactEditor } from '../../client/ClientContactEditor';
import { useClientContactEditorCopy } from '../../client/client-contact-editor.copy';
import { useClientDossierCopy } from '../../client/client-dossier.copy';
import { useClientRegistrationCopy } from '../../client/client-registration.copy';
import type {
  ClientDossierDraft,
  ClientDossierOwner,
} from '../../client/use-client-dossier';
import { ClarteButton } from '../components/ClarteButton';
import { ClarteField } from '../components/ClarteField';
import { ClarteSidePanel } from '../components/ClarteSidePanel';
import { ClarteNotice } from './ClarteNotice';

type TextField = Exclude<keyof ClientDossierDraft, 'contacts'>;

/**
 * Corrects the shared record from a side panel. The draft keeps the version
 * it observed and its retry key in the dossier owner, so closing the panel
 * keeps both and a correction already being saved continues.
 */
export function ClarteClientCorrection({
  dossier,
  feedback,
  onClose,
}: Readonly<{
  dossier: ClientDossierOwner;
  feedback: ReactNode;
  onClose: () => void;
}>) {
  const copy = useClientDossierCopy();
  const nameInput = useRef<HTMLInputElement>(null);
  const { draft, state, change, submit } = dossier.correction;
  useEffect(() => {
    nameInput.current?.focus();
  }, []);
  const validation = state.status === 'validation' ? state : undefined;
  const pending = state.status === 'submitting';
  const fields: readonly (readonly [TextField, string])[] = [
    ['displayName', copy.displayNameLabel],
    ['taxId', copy.taxIdLabel],
    ['address', copy.addressLabel],
    ['telephone', copy.telephoneLabel],
    ['generalEmail', copy.generalEmailLabel],
    ['businessActivity', copy.businessActivityLabel],
  ];
  return (
    <ClarteSidePanel
      title={copy.correctionFormLabel}
      description={copy.correctionHint}
      icon={<PencilLine />}
      onClose={onClose}
    >
      <form
        className="clarte-clients-form"
        aria-label={copy.correctionFormLabel}
        aria-describedby={
          validation ? 'client-correction-validation' : undefined
        }
        onSubmit={(event) => void submit(event)}
        noValidate
      >
        {feedback}
        {fields.map(([field, label]) => {
          const invalid =
            validation?.field === 'displayName' && field === 'displayName';
          return (
            <ClarteField key={field} label={label}>
              {(control) => (
                <input
                  {...control}
                  ref={field === 'displayName' ? nameInput : undefined}
                  className="clarte-input"
                  type={field === 'generalEmail' ? 'email' : 'text'}
                  value={draft[field]}
                  aria-invalid={invalid ? true : undefined}
                  aria-describedby={
                    invalid
                      ? 'client-correction-validation'
                      : control['aria-describedby']
                  }
                  onChange={(event) =>
                    change(withText(draft, field, event.target.value))
                  }
                />
              )}
            </ClarteField>
          );
        })}
        <div className="clarte-clients-contacts-editor">
          <ClientContactEditor
            contacts={draft.contacts}
            idPrefix="dossier-contact"
            invalid={validation?.field === 'contacts'}
            errorId="client-correction-validation"
            onChange={(contacts) => change({ ...draft, contacts })}
          />
        </div>
        <div className="clarte-clients-form-actions">
          <ClarteButton onClick={onClose}>{copy.closeCorrection}</ClarteButton>
          <ClarteButton variant="primary" type="submit" disabled={pending}>
            {pending ? copy.savingCorrection : copy.saveCorrection}
          </ClarteButton>
        </div>
      </form>
    </ClarteSidePanel>
  );
}

function withText(
  draft: ClientDossierDraft,
  field: TextField,
  value: string,
): ClientDossierDraft {
  switch (field) {
    case 'displayName':
      return { ...draft, displayName: value };
    case 'taxId':
      return { ...draft, taxId: value };
    case 'address':
      return { ...draft, address: value };
    case 'telephone':
      return { ...draft, telephone: value };
    case 'generalEmail':
      return { ...draft, generalEmail: value };
    case 'businessActivity':
      return { ...draft, businessActivity: value };
    default: {
      const unhandled: never = field;
      return unhandled;
    }
  }
}

/** The outcome of the latest correction, shown once: in the panel while open. */
export function CorrectionFeedback({
  dossier,
}: Readonly<{ dossier: ClientDossierOwner }>) {
  const copy = useClientDossierCopy();
  const contactCopy = useClientContactEditorCopy();
  const sharedClientCopy = useClientRegistrationCopy();
  const state = dossier.correction.state;
  switch (state.status) {
    case 'idle':
      return null;
    case 'submitting':
      return (
        <ClarteNotice tone="pending" role="status">
          {copy.savingCorrection}
        </ClarteNotice>
      );
    case 'validation':
      return (
        <ClarteNotice
          id="client-correction-validation"
          tone="danger"
          role="alert"
        >
          {state.source === 'localContact'
            ? contactCopy.validation(state.issue)
            : state.source === 'sharedClient'
              ? sharedClientCopy.validation(state.issue)
              : copy[state.issue]}
        </ClarteNotice>
      );
    case 'success':
      return (
        <ClarteNotice tone="success" role="status">
          {copy.correctionSaved}
        </ClarteNotice>
      );
    case 'error':
      return (
        <ClarteNotice tone="danger" role="alert">
          {copy.correctionRetry}
        </ClarteNotice>
      );
    case 'possibleDuplicate':
      return (
        <ClarteNotice tone="danger" role="alert">
          {copy.possibleDuplicate}
        </ClarteNotice>
      );
    case 'stale':
      return (
        <div className="clarte-clients-stale">
          <ClarteNotice tone="danger" role="alert">
            {copy.staleCorrection}
          </ClarteNotice>
          <p>{copy.reloadCorrectionHint}</p>
          <ClarteButton
            size="small"
            onClick={() => {
              if (dossier.state.status === 'ready')
                void dossier.reload(dossier.state.dossier.id);
            }}
          >
            {copy.reloadDossier}
          </ClarteButton>
        </div>
      );
    default: {
      const unhandled: never = state;
      return unhandled;
    }
  }
}
