import type { BrowserIdentity } from '../access-composition';
import type { ActorContext } from '../access-types';
import { useInterfaceLocale } from '../localization/interface-locale';
import { useCompanyRegistrationCopy } from './company-registration.copy';
import {
  useCompanyRegistration,
  type RegisteredCompany,
} from './use-company-registration';
import './company-registration.css';

export function CompanyRegistration(
  props: Readonly<{
    actor: ActorContext;
    identity: BrowserIdentity;
    onCompanyContextRejected: (companyContextId: string) => void;
    onActorRevalidated?: (actor: ActorContext) => Promise<void> | void;
    onWorkspaceAccessRejected?: () => Promise<void> | void;
    onCompanyRegistered: (company: RegisteredCompany) => void;
  }>,
) {
  const copy = useCompanyRegistrationCopy();
  const { formatDateTime } = useInterfaceLocale();
  const { actor } = props;
  const { allowed, displayName, setDisplayName, state, submit } =
    useCompanyRegistration(props);

  if (!allowed) {
    return (
      <section className="company-registration company-registration-denied company-registration--prisme">
        <p role="alert">{copy.permissionDenied}</p>
      </section>
    );
  }

  return (
    <section
      className="company-registration company-registration--prisme"
      aria-labelledby="company-registration-title"
    >
      <div className="company-registration-heading">
        <p className="eyebrow">{copy.eyebrow}</p>
        <h2 id="company-registration-title">{copy.title}</h2>
        <p>{copy.description}</p>
      </div>
      <form
        className="company-registration-form"
        onSubmit={(event) => void submit(event)}
        noValidate
      >
        <label htmlFor="company-display-name">{copy.displayNameLabel}</label>
        <div className="company-registration-controls">
          <input
            id="company-display-name"
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            aria-describedby={
              state.status === 'validation'
                ? 'company-registration-message'
                : undefined
            }
            aria-invalid={state.status === 'validation'}
          />
          <button
            className="company-registration-primary-action"
            type="submit"
            disabled={state.status === 'submitting'}
          >
            {state.status === 'submitting' ? copy.submitting : copy.submit}
          </button>
        </div>
      </form>
      {state.status === 'validation' && (
        <p id="company-registration-message" role="alert">
          {copy.displayNameRequired}
        </p>
      )}
      {state.status === 'forbidden' && (
        <p role="alert">{copy.permissionDenied}</p>
      )}
      {state.status === 'error' && <p role="alert">{copy.retryableError}</p>}
      {state.status === 'ready' && (
        <article
          className="company-record company-registration-result"
          aria-live="polite"
        >
          <div>
            <p className="company-status">{copy.active}</p>
            <h2>{state.company.displayName}</h2>
          </div>
          <dl>
            <div>
              <dt>{copy.workspace}</dt>
              <dd>{actor.workspaceName}</dd>
            </div>
            <div>
              <dt>{copy.created}</dt>
              <dd>{formatDateTime(state.company.createdAt)}</dd>
            </div>
          </dl>
          <p>
            {copy.registeredBy(
              state.company.createdByInternalUserId === actor.internalUserId
                ? actor.displayName
                : copy.authorizedUser,
            )}
          </p>
        </article>
      )}
    </section>
  );
}
