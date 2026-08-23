import { optionalProperty } from './client-command';
import { clientWorkspaceCopy as copy } from './client-workspace.copy';

export interface ClientContact {
  name: string;
  telephone?: string;
  email?: string;
}

export interface ClientContactDraft {
  name: string;
  telephone: string;
  email: string;
}

export function ClientContactEditor({
  contacts,
  idPrefix,
  invalid = false,
  errorId,
  onChange,
}: {
  contacts: ClientContactDraft[];
  idPrefix: string;
  invalid?: boolean;
  errorId?: string;
  onChange: (contacts: ClientContactDraft[]) => void;
}) {
  return (
    <>
      <p className="client-contact-editor-label">{copy.contactsEditLabel}</p>
      <div className="client-contact-editor">
        {contacts.map((contact, index) => (
          <fieldset key={index}>
            <legend>{copy.contactEditorLabel(index + 1)}</legend>
            <ContactField
              id={`${idPrefix}-${index}-name`}
              label={copy.contactNameLabel}
              value={contact.name}
              invalid={invalid && !contact.name.trim()}
              errorId={errorId}
              onChange={(value) =>
                onChange(
                  replaceContact(contacts, index, { ...contact, name: value }),
                )
              }
            />
            <ContactField
              id={`${idPrefix}-${index}-telephone`}
              label={copy.contactTelephoneLabel}
              value={contact.telephone}
              onChange={(value) =>
                onChange(
                  replaceContact(contacts, index, {
                    ...contact,
                    telephone: value,
                  }),
                )
              }
            />
            <ContactField
              id={`${idPrefix}-${index}-email`}
              label={copy.contactEmailLabel}
              value={contact.email}
              onChange={(value) =>
                onChange(
                  replaceContact(contacts, index, { ...contact, email: value }),
                )
              }
            />
            <button
              type="button"
              onClick={() =>
                onChange(
                  contacts.filter((_, contactIndex) => contactIndex !== index),
                )
              }
            >
              {copy.removeContact}
            </button>
          </fieldset>
        ))}
        <button
          type="button"
          onClick={() =>
            onChange([...contacts, { name: '', telephone: '', email: '' }])
          }
        >
          {copy.addContact}
        </button>
      </div>
    </>
  );
}

export function normalizedContacts(
  drafts: ClientContactDraft[],
): ClientContact[] | undefined {
  if (drafts.some((contact) => !contact.name.trim())) return undefined;
  return drafts.map((contact) => ({
    name: contact.name.trim(),
    ...optionalProperty('telephone', contact.telephone),
    ...optionalProperty('email', contact.email),
  }));
}

function ContactField({
  id,
  label,
  value,
  invalid = false,
  errorId,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  invalid?: boolean;
  errorId?: string;
  onChange: (value: string) => void;
}) {
  return (
    <>
      <label htmlFor={id}>{label}</label>
      <textarea
        id={id}
        rows={2}
        value={value}
        aria-invalid={invalid}
        aria-describedby={invalid ? errorId : undefined}
        onChange={(event) => onChange(event.target.value)}
      />
    </>
  );
}

function replaceContact(
  contacts: ClientContactDraft[],
  index: number,
  replacement: ClientContactDraft,
): ClientContactDraft[] {
  return contacts.map((contact, contactIndex) =>
    contactIndex === index ? replacement : contact,
  );
}
