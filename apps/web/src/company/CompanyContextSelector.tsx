import type { ActorContext } from '../access-types';
import { Select } from '../presentation/Select';
import type { CompanyContextState } from '../production-shell/useProductionShellContext';
import { companyContextCopy as copy } from './company-context.copy';

export function CompanyContextSelector({
  actor,
  state,
  onSelect,
}: {
  actor: ActorContext;
  state: CompanyContextState;
  onSelect: (companyId: string) => Promise<void>;
}) {
  return (
    <section
      className="company-context"
      aria-labelledby="company-context-title"
    >
      <div className="company-context-heading">
        <p className="eyebrow">{copy.eyebrow}</p>
        <h2 id="company-context-title">{copy.title}</h2>
      </div>
      <dl className="company-context-summary">
        <div>
          <dt>{copy.workspace}</dt>
          <dd>{actor.workspaceName}</dd>
        </div>
        <div>
          <dt>{copy.activeCompany}</dt>
          <dd>{actor.activeCompany?.displayName ?? copy.selectCompany}</dd>
        </div>
      </dl>
      {state.status === 'loading' && <p role="status">{copy.loading}</p>}
      {state.status === 'forbidden' && <p role="alert">{copy.forbidden}</p>}
      {state.status === 'error' && <p role="alert">{copy.unavailable}</p>}
      {state.status === 'ready' && state.recoveryMessage && (
        <p role="alert">
          {state.recoveryMessage === 'stale'
            ? copy.stale
            : copy.selectionFailed}
        </p>
      )}
      {state.status === 'ready' && state.companies.length === 0 && (
        <p>
          {actor.workspacePermissions.includes('company.manage')
            ? copy.noCompanies
            : copy.noAssignment}
        </p>
      )}
      {state.status === 'ready' && state.companies.length > 0 && (
        <div className="company-context-control">
          <label htmlFor="active-company-context">{copy.activeCompany}</label>
          <Select
            id="active-company-context"
            title={actor.activeCompany?.displayName ?? copy.chooseCompany}
            value={actor.activeCompany?.id ?? ''}
            disabled={state.selection.status === 'pending'}
            placeholder={copy.chooseCompany}
            options={state.companies.map((company) => ({
              value: company.id,
              label: company.displayName,
            }))}
            onValueChange={(value) => {
              if (value) void onSelect(value);
            }}
          />
        </div>
      )}
    </section>
  );
}
