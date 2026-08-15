import { type FormEvent, useRef, useState } from 'react';
import type { BrowserIdentity } from '../access-composition';
import type { ActorContext } from '../access-types';
import { formatApplicationDateTime } from '../presentation/date-time';
import { companyRegistrationCopy as copy } from './company-registration.copy';

interface CompanyRecord {
  id: string;
  workspaceId: string;
  displayName: string;
  status: 'active';
  createdAt: string;
  createdByInternalUserId: string;
}

type RegistrationState =
  | { status: 'idle' }
  | { status: 'submitting' }
  | { status: 'ready'; company: CompanyRecord }
  | { status: 'validation'; message: string }
  | { status: 'forbidden' }
  | { status: 'error' };

export function CompanyRegistration({
  actor,
  identity,
}: {
  actor: ActorContext;
  identity: BrowserIdentity;
}) {
  const [displayName, setDisplayName] = useState('');
  const [state, setState] = useState<RegistrationState>({ status: 'idle' });
  const retryCommand = useRef<
    | {
        displayName: string;
        idempotencyKey: string;
      }
    | undefined
  >(undefined);

  if (!actor.workspacePermissions.includes('company.manage')) {
    return (
      <section className="company-registration company-registration-denied">
        <p role="alert">{copy.permissionDenied}</p>
      </section>
    );
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedName = displayName.trim();
    if (!normalizedName) {
      setState({
        status: 'validation',
        message: copy.displayNameRequired,
      });
      return;
    }

    const command =
      retryCommand.current?.displayName === normalizedName
        ? retryCommand.current
        : {
            displayName: normalizedName,
            idempotencyKey: crypto.randomUUID(),
          };
    retryCommand.current = command;
    setState({ status: 'submitting' });

    try {
      const headers = await authenticatedHeaders(identity);
      const createResponse = await fetch(
        `${import.meta.env.VITE_API_URL ?? '/api'}/companies`,
        {
          method: 'POST',
          credentials: 'include',
          headers: {
            ...headers,
            'content-type': 'application/json',
            'idempotency-key': command.idempotencyKey,
          },
          body: JSON.stringify({ displayName: command.displayName }),
        },
      );
      if (createResponse.status === 401) {
        await identity.rejectSession();
        return setState({ status: 'error' });
      }
      if (createResponse.status === 403) {
        return setState({ status: 'forbidden' });
      }
      if (createResponse.status === 400) {
        const body = (await createResponse.json()) as { message?: unknown };
        return setState({
          status: 'validation',
          message:
            typeof body.message === 'string'
              ? body.message
              : copy.displayNameRequired,
        });
      }
      if (!createResponse.ok) return setState({ status: 'error' });
      const created = (await createResponse.json()) as CompanyRecord;

      const readResponse = await fetch(
        `${import.meta.env.VITE_API_URL ?? '/api'}/companies/${created.id}`,
        { credentials: 'include', headers },
      );
      if (readResponse.status === 403) {
        return setState({ status: 'forbidden' });
      }
      if (!readResponse.ok) return setState({ status: 'error' });
      const company = (await readResponse.json()) as CompanyRecord;
      retryCommand.current = undefined;
      setState({ status: 'ready', company });
    } catch {
      setState({ status: 'error' });
    }
  }

  return (
    <section
      className="company-registration"
      aria-labelledby="company-registration-title"
    >
      <div className="company-registration-heading">
        <p className="eyebrow">{copy.eyebrow}</p>
        <h2 id="company-registration-title">{copy.title}</h2>
        <p>{copy.description}</p>
      </div>
      <form onSubmit={(event) => void submit(event)} noValidate>
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
          <button type="submit" disabled={state.status === 'submitting'}>
            {state.status === 'submitting' ? copy.submitting : copy.submit}
          </button>
        </div>
      </form>
      {state.status === 'validation' && (
        <p id="company-registration-message" role="alert">
          {state.message}
        </p>
      )}
      {state.status === 'forbidden' && (
        <p role="alert">{copy.permissionDenied}</p>
      )}
      {state.status === 'error' && <p role="alert">{copy.retryableError}</p>}
      {state.status === 'ready' && (
        <article className="company-record" aria-live="polite">
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
              <dd>{formatApplicationDateTime(state.company.createdAt)}</dd>
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

async function authenticatedHeaders(
  identity: BrowserIdentity,
): Promise<Record<string, string>> {
  if (identity.requestHeaders) return identity.requestHeaders;
  const token = await identity.getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}
