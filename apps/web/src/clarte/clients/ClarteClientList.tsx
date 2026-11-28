import { ArrowRight, Plus } from 'lucide-react';
import { useClientDirectoryCopy } from '../../client/client-directory.copy';
import type { ClientAccountView } from '../../client/client-account-response';
import { ClarteBadge } from '../components/ClarteBadge';
import { ClarteButton } from '../components/ClarteButton';
import { clientInitials } from './client-initials';

/**
 * Clients as cards: initials, name and the relationship with the active
 * Company, then the one action the member may take on each: open the
 * dossier of a Company Client, or add a shared Client to the Company.
 */
export function ClarteClientList({
  clients,
  companyName,
  onOpenDossier,
  onAttach,
  attachingClientId,
}: Readonly<{
  clients: readonly ClientAccountView[];
  companyName: string;
  onOpenDossier?: (clientId: string) => void;
  onAttach?: (clientId: string) => void;
  attachingClientId: string | undefined;
}>) {
  const copy = useClientDirectoryCopy();
  return (
    <div className="clarte-clients-list">
      <ul className="clarte-clients-grid">
        {clients.map((client) => (
          <li
            key={client.id}
            className="clarte-client-card"
            data-client-card={client.id}
          >
            <div className="clarte-client-card-top">
              <span className="clarte-client-initials" aria-hidden="true">
                {clientInitials(client.displayName)}
              </span>
              <div className="clarte-client-card-name">
                <h3>{client.displayName}</h3>
                <p>{copy.clientId(client.id)}</p>
              </div>
            </div>
            <div className="clarte-client-card-foot">
              {client.relatedToActiveCompany ? (
                <ClarteBadge tone="success">
                  {copy.availableInCompany(companyName)}
                </ClarteBadge>
              ) : (
                <ClarteBadge tone={onAttach ? 'warning' : 'neutral'}>
                  {onAttach
                    ? copy.notYetLinkedToCompany(companyName)
                    : copy.notAvailableInCompany}
                </ClarteBadge>
              )}
              {client.relatedToActiveCompany
                ? onOpenDossier && (
                    <ClarteButton
                      size="small"
                      onClick={() => onOpenDossier(client.id)}
                    >
                      {copy.openDossier}
                      <ArrowRight aria-hidden="true" />
                    </ClarteButton>
                  )
                : onAttach && (
                    <ClarteButton
                      size="small"
                      disabled={attachingClientId !== undefined}
                      onClick={() => onAttach(client.id)}
                    >
                      <Plus aria-hidden="true" />
                      {attachingClientId === client.id
                        ? copy.addingToCompany(companyName)
                        : copy.addToCompany(companyName)}
                    </ClarteButton>
                  )}
            </div>
          </li>
        ))}
      </ul>
      <p className="clarte-clients-count">
        {copy.resultsShown(clients.length)}
      </p>
    </div>
  );
}
