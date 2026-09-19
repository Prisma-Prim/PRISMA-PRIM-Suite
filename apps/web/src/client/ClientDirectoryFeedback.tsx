import { CircleAlert, CircleCheck, Clock3, Info } from 'lucide-react';
import { useContext } from 'react';
import { ApplicationPresentation } from '../production-shell/application-presentation';

const feedbackIcons = {
  info: Info,
  success: CircleCheck,
  error: CircleAlert,
  pending: Clock3,
};

export function ClientDirectoryFeedback({
  children,
  tone = 'info',
  role,
  id,
}: {
  children: string;
  tone?: keyof typeof feedbackIcons;
  role?: 'alert' | 'status';
  id?: string;
}) {
  const isPrisme = useContext(ApplicationPresentation) === 'prisme';
  const Icon = feedbackIcons[tone];
  return (
    <p
      id={id}
      role={role}
      className={isPrisme ? 'client-directory-feedback' : undefined}
      data-tone={isPrisme ? tone : undefined}
    >
      {isPrisme && <Icon aria-hidden="true" />}
      {isPrisme ? <span>{children}</span> : children}
    </p>
  );
}
