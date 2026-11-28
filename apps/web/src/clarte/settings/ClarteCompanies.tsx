import { Building2 } from 'lucide-react';
import type { BrowserIdentity } from '../../access-composition';
import type { ActorContext } from '../../access-types';
import { useCompanyRegistrationCopy } from '../../company/company-registration.copy';
import {
  useCompanyRegistration,
  type RegisteredCompany,
} from '../../company/use-company-registration';
import { useInterfaceLocale } from '../../localization/interface-locale';
import { ClarteBadge } from '../components/ClarteBadge';
import { ClarteButton } from '../components/ClarteButton';
import { ClarteCard } from '../components/ClarteCard';
import { ClarteField } from '../components/ClarteField';
import { ClarteErrorState } from '../components/ClarteState';

/**
 * Companies in the Settings console (EX-020): registers a provider Company in
 * the Workspace through the existing idempotent command and shows the
 * registered record as the server returned it.
 */
export function ClarteCompanies(
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
  if (!allowed) return <ClarteErrorState title={copy.permissionDenied} />;
  return (
    <>
      <ClarteCard title={copy.title}>
        <form
          className="clarte-settings-form clarte-settings-form--inline"
          onSubmit={(event) => void submit(event)}
          noValidate
        >
          <ClarteField
            label={copy.displayNameLabel}
            hint={copy.description}
            error={
              state.status === 'validation'
                ? copy.displayNameRequired
                : undefined
            }
          >
            {(control) => (
              <input
                {...control}
                className="clarte-input"
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
              />
            )}
          </ClarteField>
          <ClarteButton
            type="submit"
            variant="primary"
            disabled={state.status === 'submitting'}
          >
            {state.status === 'submitting' ? copy.submitting : copy.submit}
          </ClarteButton>
        </form>
        {state.status === 'forbidden' && (
          <p className="clarte-settings-alert" role="alert">
            {copy.permissionDenied}
          </p>
        )}
        {state.status === 'error' && (
          <p className="clarte-settings-alert" role="alert">
            {copy.retryableError}
          </p>
        )}
      </ClarteCard>
      {state.status === 'ready' && (
        <article
          className="clarte-card clarte-company-record"
          aria-live="polite"
        >
          <div className="clarte-company-record-head">
            <Building2 aria-hidden="true" />
            <h3>{state.company.displayName}</h3>
            <ClarteBadge tone="success">{copy.active}</ClarteBadge>
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
          <p className="clarte-settings-hint">
            {copy.registeredBy(
              state.company.createdByInternalUserId === actor.internalUserId
                ? actor.displayName
                : copy.authorizedUser,
            )}
          </p>
        </article>
      )}
    </>
  );
}
