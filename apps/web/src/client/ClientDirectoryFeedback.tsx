import { CircleAlert, CircleCheck, Clock3, Info } from 'lucide-react';

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
  const Icon = feedbackIcons[tone];
  return (
    <p
      id={id}
      role={role}
      className="client-directory-feedback"
      data-tone={tone}
    >
      <Icon aria-hidden="true" />
      <span>{children}</span>
    </p>
  );
}
