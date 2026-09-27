import { useId, useState, type FormEvent, type Ref } from 'react';
import { Select } from '../presentation/Select';
import {
  unionFields,
  type UnionComparison,
  type UnionField,
} from './client-union-contract';
import { clientUnionCopy as copy } from './client-union.copy';
import { clientWorkspaceCopy as clientCopy } from './client-workspace.copy';

const labels: Record<UnionField, string> = {
  displayName: clientCopy.displayNameLabel,
  taxId: clientCopy.taxIdLabel,
  address: clientCopy.addressLabel,
  telephone: clientCopy.telephoneLabel,
  generalEmail: clientCopy.generalEmailLabel,
  businessActivity: clientCopy.businessActivityLabel,
};

export function ClientUnionComparison({
  comparison,
  busy,
  uncertain,
  onConfirm,
  onHeadingReady,
}: {
  comparison: UnionComparison;
  busy: boolean;
  uncertain: boolean;
  onConfirm: (value: unknown) => Promise<void>;
  onHeadingReady: Ref<HTMLHeadingElement>;
}) {
  const id = useId();
  const [canonicalClientId, setCanonical] = useState('');
  const [fields, setFields] = useState<Record<UnionField, string>>({
    displayName: '',
    taxId: '',
    address: '',
    telephone: '',
    generalEmail: '',
    businessActivity: '',
  });
  const [reason, setReason] = useState('');
  const [reviewed, setReviewed] = useState(false);
  const [companiesConfirmed, setCompaniesConfirmed] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const contactCount = comparison.clients.reduce(
    (count, client) => count + client.contacts.length,
    0,
  );
  const capacityExceeded = contactCount > 50;
  const reasonMissing = !reason.trim() || reason.length > 2000;
  const incomplete =
    !canonicalClientId ||
    reasonMissing ||
    !reviewed ||
    !companiesConfirmed ||
    unionFields.some((field) => !fields[field]);
  const errorId = attempted && incomplete ? id + '-error' : undefined;
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAttempted(true);
    if (busy || capacityExceeded || incomplete) return;
    void onConfirm({
      canonicalClientId,
      fields,
      reason,
      reviewedDifferences: reviewed,
      companyIds: comparison.companies.map((company) => company.id),
    });
  }
  return (
    <section className="client-union-review" aria-labelledby={id + '-title'}>
      <header className="client-union-review-heading">
        <p className="eyebrow">{copy.comparisonEyebrow}</p>
        <h4 id={id + '-title'} tabIndex={-1} ref={onHeadingReady}>
          {copy.compare}
        </h4>
        <p>{copy.preserved}</p>
      </header>
      <div className="client-union-dossiers">
        {comparison.clients.map((client, sourceIndex) => (
          <article
            key={client.id}
            aria-label={copy.source({
              number: sourceIndex + 1,
              name: client.displayName,
            })}
          >
            <header>
              <h5>
                {copy.source({
                  number: sourceIndex + 1,
                  name: client.displayName,
                })}
              </h5>
              <p>{clientCopy.version(client.version)}</p>
            </header>
            <dl className="client-union-values">
              {unionFields.map((field) => (
                <div key={field}>
                  <dt>{labels[field]}</dt>
                  <dd>{client[field] ?? copy.notProvided}</dd>
                </div>
              ))}
            </dl>
            <div className="client-union-contacts">
              <h5>{clientCopy.contactsLabel}</h5>
              {client.contacts.length === 0 && <p>{copy.noContacts}</p>}
              <ol>
                {client.contacts.map((contact, contactIndex) => (
                  <li key={contactIndex}>
                    <p className="client-union-source-label">
                      {copy.contactSource({
                        source: sourceIndex + 1,
                        contact: contactIndex + 1,
                      })}
                    </p>
                    <strong>{contact.name}</strong>
                    <dl>
                      <div>
                        <dt>{clientCopy.contactTelephoneLabel}</dt>
                        <dd>{contact.telephone ?? copy.notProvided}</dd>
                      </div>
                      <div>
                        <dt>{clientCopy.contactEmailLabel}</dt>
                        <dd>{contact.email ?? copy.notProvided}</dd>
                      </div>
                      <div>
                        <dt>{clientCopy.contactPositionLabel}</dt>
                        <dd>{contact.position ?? copy.notProvided}</dd>
                      </div>
                      <div>
                        <dt>{clientCopy.contactDecisionRolesLabel}</dt>
                        <dd>
                          {contact.decisionRoles?.length
                            ? contact.decisionRoles
                                .map(
                                  (role) =>
                                    clientCopy.contactDecisionRoleLabels[role],
                                )
                                .join(', ')
                            : copy.notProvided}
                        </dd>
                      </div>
                      <div>
                        <dt>
                          {clientCopy.contactCommunicationPreferencesLabel}
                        </dt>
                        <dd>
                          {contact.communicationPreferences ?? copy.notProvided}
                        </dd>
                      </div>
                    </dl>
                  </li>
                ))}
              </ol>
            </div>
          </article>
        ))}
      </div>
      <section
        className="client-union-scope"
        aria-label={copy.affectedCompanies}
      >
        <h5>{copy.affectedCompanies}</h5>
        <ul>
          {comparison.companies.map((company) => (
            <li key={company.id}>{company.displayName}</li>
          ))}
        </ul>
        <p>{copy.contactCount(contactCount)}</p>
      </section>
      {capacityExceeded && (
        <p className="client-union-notice" role="alert">
          {copy.capacity}
        </p>
      )}
      <form
        aria-label={copy.confirm}
        onSubmit={submit}
        noValidate
        className="client-union-form client-union-confirmation"
      >
        <fieldset disabled={busy || capacityExceeded}>
          <legend>{copy.decisions}</legend>
          <label htmlFor={id + '-canonical'}>
            {copy.canonical}
            <Select
              id={id + '-canonical'}
              required
              value={canonicalClientId}
              disabled={busy || capacityExceeded}
              placeholder={copy.choose}
              invalid={attempted && !canonicalClientId}
              describedBy={errorId}
              options={comparison.clients.map((client, index) => ({
                value: client.id,
                label: copy.source({
                  number: index + 1,
                  name: client.displayName,
                }),
              }))}
              onValueChange={setCanonical}
            />
          </label>
          <p className="client-union-choice-hint">{copy.chooseFields}</p>
          <div className="client-union-field-choices">
            {unionFields.map((field) => {
              const sourceIndex = comparison.clients.findIndex(
                (client) => client.id === fields[field],
              );
              const source = comparison.clients[sourceIndex];
              const valueId = source ? id + '-' + field + '-value' : undefined;
              return (
                <div key={field}>
                  <label htmlFor={id + '-' + field}>
                    {labels[field]}
                    <Select
                      id={id + '-' + field}
                      required
                      value={fields[field]}
                      disabled={busy || capacityExceeded}
                      placeholder={copy.choose}
                      options={comparison.clients.map((client, index) => ({
                        value: client.id,
                        label: copy.source({
                          number: index + 1,
                          name: client.displayName,
                        }),
                      }))}
                      onValueChange={(value) =>
                        setFields({ ...fields, [field]: value })
                      }
                      invalid={attempted && !fields[field]}
                      describedBy={
                        [valueId, errorId].filter(Boolean).join(' ') ||
                        undefined
                      }
                    />
                  </label>
                  {source && (
                    <p id={valueId} className="client-union-retained-value">
                      <span>{copy.retainedSource(sourceIndex + 1)}</span>{' '}
                      <strong>{source[field] ?? copy.notProvided}</strong>
                    </p>
                  )}
                </div>
              );
            })}
          </div>
          <label>
            {copy.reason}
            <textarea
              required
              maxLength={2000}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              aria-invalid={attempted && reasonMissing}
              aria-describedby={errorId ?? id + '-reason-hint'}
            />
          </label>
          <p id={id + '-reason-hint'} className="client-union-choice-hint">
            {copy.reasonLimit}
          </p>
          <label className="client-union-check">
            <input
              type="checkbox"
              checked={reviewed}
              onChange={(event) => setReviewed(event.target.checked)}
              required
              aria-invalid={attempted && !reviewed}
              aria-describedby={errorId}
            />
            <span>{copy.reviewed}</span>
          </label>
          <label className="client-union-check">
            <input
              type="checkbox"
              checked={companiesConfirmed}
              onChange={(event) => setCompaniesConfirmed(event.target.checked)}
              required
              aria-invalid={attempted && !companiesConfirmed}
              aria-describedby={errorId}
            />
            <span>
              {copy.confirmedCompanies}{' '}
              {comparison.companies
                .map((company) => company.displayName)
                .join(', ')}
            </span>
          </label>
        </fieldset>
        {uncertain && (
          <div role="alert">
            <p>{copy.error}</p>
            <p>{copy.uncertain}</p>
          </div>
        )}
        {errorId && (
          <p id={errorId} role="alert">
            {copy.incomplete}
          </p>
        )}
        <button type="submit" disabled={busy || capacityExceeded}>
          {busy ? copy.saving : copy.confirm}
        </button>
      </form>
    </section>
  );
}
