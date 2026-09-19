import { ArrowRight } from 'lucide-react';
import { clientWorkspaceCopy as copy } from './client-workspace.copy';

export interface ClientAccountView {
  id: string;
  displayName: string;
  relatedToActiveCompany: boolean;
}

export function ClientDirectory({
  clients,
  companyName,
  onOpenDossier,
  onAttach,
  attachingClientId,
}: {
  clients: readonly ClientAccountView[];
  companyName: string;
  onOpenDossier?: (clientId: string) => void;
  onAttach?: (clientId: string) => void;
  attachingClientId: string | undefined;
}) {
  const hasActions = clients.some((client) =>
    client.relatedToActiveCompany
      ? onOpenDossier !== undefined
      : onAttach !== undefined,
  );
  return (
    <div className="client-directory" data-actions={hasActions}>
      <div className="client-directory-columns" aria-hidden="true">
        <span>{copy.directoryClient}</span>
        <span>{copy.directoryRelationship}</span>
        {hasActions && <span>{copy.directoryActions}</span>}
      </div>
      <ol className="client-directory-rows">
        {clients.map((client) => (
          <li key={client.id}>
            <div className="client-directory-identity">
              <span className="client-directory-initials" aria-hidden="true">
                {client.displayName
                  .trim()
                  .split(/\s+/u)
                  .slice(0, 2)
                  .map((part) => Array.from(part)[0])
                  .join('')
                  .toLocaleUpperCase()}
              </span>
              <div>
                <h3>{client.displayName}</h3>
                <p>{copy.clientId(client.id)}</p>
              </div>
            </div>
            <p className="client-directory-relationship">
              {client.relatedToActiveCompany
                ? copy.availableInCompany(companyName)
                : onAttach
                  ? copy.notYetLinkedToCompany(companyName)
                  : copy.notAvailableInCompany}
            </p>
            {hasActions && (
              <div className="client-directory-action">
                {client.relatedToActiveCompany ? (
                  onOpenDossier && (
                    <button
                      type="button"
                      onClick={() => onOpenDossier(client.id)}
                    >
                      {copy.openDossier}
                      <ArrowRight aria-hidden="true" />
                    </button>
                  )
                ) : onAttach ? (
                  <button
                    type="button"
                    disabled={attachingClientId !== undefined}
                    onClick={() => onAttach(client.id)}
                  >
                    {attachingClientId === client.id
                      ? copy.addingToCompany(companyName)
                      : copy.addToCompany(companyName)}
                  </button>
                ) : null}
              </div>
            )}
          </li>
        ))}
      </ol>
      <p className="client-directory-summary">
        {copy.resultsShown(clients.length)}
      </p>
    </div>
  );
}
