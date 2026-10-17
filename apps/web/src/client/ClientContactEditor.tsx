import { optionalProperty } from './client-command';
import { useClientContactEditorCopy } from './client-contact-editor.copy';
import { clientWorkspaceCopy as copy } from './client-workspace.copy';

/** Closed provisional vocabulary, in the order the server stores it. */
export const clientContactDecisionRoles = [
  'final_decision_maker',
  'influencer',
  'user',
  'financial',
  'technical',
  'blocker',
] as const;

export type ClientContactDecisionRole =
  (typeof clientContactDecisionRoles)[number];

const MAXIMUM_POSITION_LENGTH = 500;
/** Mirrors the server bound, counted in Unicode code points. */
const MAXIMUM_COMMUNICATION_PREFERENCES_CODE_POINTS = 1_000;

export interface ClientContact {
  name: string;
  telephone?: string;
  email?: string;
  position?: string;
  decisionRoles?: ClientContactDecisionRole[];
  communicationPreferences?: string;
}

/** Carries every Contact field so a correction resubmits what it loaded. */
export interface ClientContactDraft {
  name: string;
  telephone: string;
  email: string;
  position: string;
  decisionRoles: ClientContactDecisionRole[];
  communicationPreferences: string;
}

export type ClientContactValidationIssue =
  | 'contactsInvalid'
  | 'contactPositionTooLong'
  | 'contactCommunicationPreferencesTooLong';

export type ClientContactDraftResult =
  | { status: 'valid'; contacts: ClientContact[] }
  | { status: 'invalid'; message: string; issue: ClientContactValidationIssue };

export function isClientContactDecisionRole(
  value: unknown,
): value is ClientContactDecisionRole {
  return clientContactDecisionRoles.some((role) => role === value);
}

export function contactDraft(contact: ClientContact): ClientContactDraft {
  return {
    name: contact.name,
    telephone: contact.telephone ?? '',
    email: contact.email ?? '',
    position: contact.position ?? '',
    decisionRoles: contact.decisionRoles ?? [],
    communicationPreferences: contact.communicationPreferences ?? '',
  };
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
  const copy = useClientContactEditorCopy();
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
            <ContactField
              id={`${idPrefix}-${index}-position`}
              label={copy.contactPositionLabel}
              value={contact.position}
              invalid={positionTooLong(contact)}
              errorId={`${idPrefix}-${index}-position-error`}
              onChange={(value) =>
                onChange(
                  replaceContact(contacts, index, {
                    ...contact,
                    position: value,
                  }),
                )
              }
            />
            {positionTooLong(contact) && (
              <p
                id={`${idPrefix}-${index}-position-error`}
                className="client-contact-field-error"
              >
                {copy.contactPositionTooLong}
              </p>
            )}
            <fieldset className="client-contact-decision-roles">
              <legend>{copy.contactDecisionRolesLabel}</legend>
              {clientContactDecisionRoles.map((role) => (
                <label key={role}>
                  <input
                    type="checkbox"
                    checked={contact.decisionRoles.includes(role)}
                    onChange={(event) =>
                      onChange(
                        replaceContact(contacts, index, {
                          ...contact,
                          decisionRoles: clientContactDecisionRoles.filter(
                            (selected) =>
                              selected === role
                                ? event.target.checked
                                : contact.decisionRoles.includes(selected),
                          ),
                        }),
                      )
                    }
                  />
                  <span>{copy.contactDecisionRoleLabels[role]}</span>
                </label>
              ))}
            </fieldset>
            <ContactField
              id={`${idPrefix}-${index}-communication-preferences`}
              label={copy.contactCommunicationPreferencesLabel}
              value={contact.communicationPreferences}
              helpId={`${idPrefix}-${index}-communication-preferences-help`}
              invalid={communicationPreferencesTooLong(contact)}
              errorId={`${idPrefix}-${index}-communication-preferences-error`}
              onChange={(value) =>
                onChange(
                  replaceContact(contacts, index, {
                    ...contact,
                    communicationPreferences: value,
                  }),
                )
              }
            />
            <p
              id={`${idPrefix}-${index}-communication-preferences-help`}
              className="client-contact-field-help"
            >
              {copy.contactCommunicationPreferencesHelp}
            </p>
            {communicationPreferencesTooLong(contact) && (
              <p
                id={`${idPrefix}-${index}-communication-preferences-error`}
                className="client-contact-field-error"
              >
                {copy.contactCommunicationPreferencesTooLong}
              </p>
            )}
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
          onClick={() => onChange([...contacts, contactDraft({ name: '' })])}
        >
          {copy.addContact}
        </button>
      </div>
    </>
  );
}

export function normalizedContacts(
  drafts: ClientContactDraft[],
): ClientContactDraftResult {
  if (drafts.some((contact) => !contact.name.trim()))
    return {
      status: 'invalid',
      message: copy.contactsInvalid,
      issue: 'contactsInvalid',
    };
  if (drafts.some(positionTooLong))
    return {
      status: 'invalid',
      message: copy.contactPositionTooLong,
      issue: 'contactPositionTooLong',
    };
  if (drafts.some(communicationPreferencesTooLong))
    return {
      status: 'invalid',
      message: copy.contactCommunicationPreferencesTooLong,
      issue: 'contactCommunicationPreferencesTooLong',
    };
  return {
    status: 'valid',
    contacts: drafts.map((contact) => ({
      name: contact.name.trim(),
      ...optionalProperty('telephone', contact.telephone),
      ...optionalProperty('email', contact.email),
      ...optionalProperty('position', contact.position),
      ...(contact.decisionRoles.length === 0
        ? {}
        : { decisionRoles: contact.decisionRoles }),
      ...optionalProperty(
        'communicationPreferences',
        contact.communicationPreferences,
      ),
    })),
  };
}

/** Presents the optional descriptive fields below a Contact name. */
export function ClientContactDescription({
  contact,
}: {
  contact: ClientContact;
}) {
  const roles = contact.decisionRoles ?? [];
  return (
    <>
      {contact.position && <span>{contact.position}</span>}
      {roles.length > 0 && (
        <span>
          {copy.contactDecisionRolesSummary(
            roles.map((role) => copy.contactDecisionRoleLabels[role]),
          )}
        </span>
      )}
      {contact.communicationPreferences && (
        <span className="client-contact-communication-preferences">
          {copy.contactCommunicationPreferencesSummary(
            contact.communicationPreferences,
          )}
        </span>
      )}
    </>
  );
}

function positionTooLong(contact: ClientContactDraft): boolean {
  return contact.position.trim().length > MAXIMUM_POSITION_LENGTH;
}

function communicationPreferencesTooLong(contact: ClientContactDraft): boolean {
  return (
    [...contact.communicationPreferences.trim()].length >
    MAXIMUM_COMMUNICATION_PREFERENCES_CODE_POINTS
  );
}

function ContactField({
  id,
  label,
  value,
  helpId,
  invalid = false,
  errorId,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  helpId?: string;
  invalid?: boolean;
  errorId?: string;
  onChange: (value: string) => void;
}) {
  const describedBy = [helpId, invalid ? errorId : undefined]
    .filter((description) => description !== undefined)
    .join(' ');
  return (
    <>
      <label htmlFor={id}>{label}</label>
      <textarea
        id={id}
        rows={2}
        value={value}
        aria-invalid={invalid}
        aria-describedby={describedBy || undefined}
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
