import { Building2 } from 'lucide-react';
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { ClientContactEditor } from '../../client/ClientContactEditor';
import { useClientRegistrationCopy } from '../../client/client-registration.copy';
import type {
  ClientRegistrationDraft,
  ClientWorkspaceOwner,
} from '../../client/use-client-workspace';
import { ClarteButton } from '../components/ClarteButton';
import { ClarteField } from '../components/ClarteField';
import { ClarteSidePanel } from '../components/ClarteSidePanel';

type TextField = Exclude<keyof ClientRegistrationDraft, 'contacts'>;

/**
 * Registers a Client from a side panel. The draft, its retry key and the
 * outcome belong to the directory owner, so closing the panel keeps them
 * and a command already sent continues.
 */
export function ClarteClientRegistration({
  owner,
  feedback,
  onClose,
}: Readonly<{
  owner: ClientWorkspaceOwner;
  feedback: ReactNode;
  onClose: () => void;
}>) {
  const copy = useClientRegistrationCopy();
  const nameInput = useRef<HTMLInputElement>(null);
  const formId = useId();
  const { draft, state, change, submit } = owner.registration;
  const enriched = owner.access.canCreateEnrichedClients;
  useEffect(() => {
    nameInput.current?.focus();
  }, []);
  const submitting = state.status === 'submitting';
  const nameInvalid =
    state.status === 'validation' && state.field === 'displayName';
  const textField = (
    field: TextField,
    label: string,
    type: 'text' | 'email' = 'text',
  ) => (
    <ClarteField key={field} label={label}>
      {(control) => (
        <input
          {...control}
          ref={field === 'displayName' ? nameInput : undefined}
          className="clarte-input"
          type={type}
          value={draft[field]}
          aria-invalid={
            field === 'displayName' && nameInvalid ? true : undefined
          }
          aria-describedby={
            field === 'displayName' && nameInvalid
              ? 'client-create-validation'
              : control['aria-describedby']
          }
          onChange={(event) => change(textChange(field, event.target.value))}
        />
      )}
    </ClarteField>
  );
  return (
    <ClarteSidePanel
      title={copy.registrationTitle}
      description={copy.registrationHint}
      icon={<Building2 />}
      onClose={onClose}
      footer={
        <>
          <ClarteButton onClick={onClose}>
            {copy.closeRegistration}
          </ClarteButton>
          <ClarteButton
            variant="primary"
            type="submit"
            form={formId}
            disabled={submitting}
          >
            {submitting ? copy.creating : copy.create}
          </ClarteButton>
        </>
      }
    >
      <form
        id={formId}
        className="clarte-clients-form"
        onSubmit={(event) => void submit(event)}
        noValidate
      >
        {feedback}
        {textField('displayName', copy.displayNameLabel)}
        {enriched && (
          <>
            <div className="clarte-clients-form-pair">
              {textField('taxId', copy.taxIdLabel)}
              {textField('telephone', copy.telephoneLabel)}
            </div>
            {textField('address', copy.addressLabel)}
            {textField('generalEmail', copy.generalEmailLabel, 'email')}
            {textField('businessActivity', copy.businessActivityLabel)}
            <div className="clarte-clients-contacts-editor">
              <ClientContactEditor
                contacts={draft.contacts}
                idPrefix="client-create-contact"
                invalid={
                  state.status === 'validation' && state.field === 'contacts'
                }
                errorId="client-create-validation"
                onChange={(contacts) => change({ contacts })}
              />
            </div>
          </>
        )}
      </form>
    </ClarteSidePanel>
  );
}

function textChange(
  field: TextField,
  value: string,
): Partial<ClientRegistrationDraft> {
  switch (field) {
    case 'displayName':
      return { displayName: value };
    case 'taxId':
      return { taxId: value };
    case 'address':
      return { address: value };
    case 'telephone':
      return { telephone: value };
    case 'generalEmail':
      return { generalEmail: value };
    case 'businessActivity':
      return { businessActivity: value };
    default: {
      const unhandled: never = field;
      return unhandled;
    }
  }
}
