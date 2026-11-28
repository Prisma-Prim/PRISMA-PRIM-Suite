import { CircleAlert, CircleCheck, Clock3, Info } from 'lucide-react';

const noticeIcons = {
  info: Info,
  pending: Clock3,
  success: CircleCheck,
  danger: CircleAlert,
} as const;

/**
 * One line of feedback about a command or read of the Clients screen: a
 * polite status while work runs or after it succeeds, an alert when it
 * failed. The text states the outcome; the tone only adds colour.
 */
export function ClarteNotice({
  tone,
  role,
  id,
  children,
}: Readonly<{
  tone: keyof typeof noticeIcons;
  role?: 'status' | 'alert';
  id?: string;
  children: string;
}>) {
  const Icon = noticeIcons[tone];
  return (
    <p id={id} role={role} className={`clarte-notice clarte-notice--${tone}`}>
      <Icon aria-hidden="true" />
      <span>{children}</span>
    </p>
  );
}
