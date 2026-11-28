import { Lock } from 'lucide-react';
import { usePublicWelcomeCopy } from '../../welcome/public-welcome.copy';
import { ClartePage } from './ClartePage';

/**
 * The signed-out welcome: the product promise, invitation-only access and the
 * one way on, the existing sign-in route. No sign-up is offered.
 */
export function ClartePublicWelcome() {
  const copy = usePublicWelcomeCopy();
  return (
    <ClartePage>
      <h1>{copy.title}</h1>
      <p className="clarte-page-lead">{copy.description}</p>
      <div className="clarte-page-actions">
        <a className="clarte-button clarte-button--primary" href="/sign-in">
          {copy.signIn}
        </a>
      </div>
      <p className="clarte-page-note">
        <Lock aria-hidden="true" />
        {copy.invitationOnly}
      </p>
    </ClartePage>
  );
}
