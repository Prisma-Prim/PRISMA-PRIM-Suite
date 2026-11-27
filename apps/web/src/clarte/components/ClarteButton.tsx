import type { ComponentProps } from 'react';

export type ClarteButtonVariant = 'primary' | 'secondary' | 'quiet' | 'danger';

/**
 * A Clarté button. `primary` carries the one accent colour and is kept for
 * the main action of a screen or dialog.
 */
export function ClarteButton({
  variant = 'secondary',
  size = 'regular',
  className,
  type = 'button',
  ...props
}: ComponentProps<'button'> &
  Readonly<{
    variant?: ClarteButtonVariant;
    size?: 'regular' | 'small';
  }>) {
  return (
    <button
      type={type}
      className={[
        'clarte-button',
        `clarte-button--${variant}`,
        size === 'small' ? 'clarte-button--small' : undefined,
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      {...props}
    />
  );
}
