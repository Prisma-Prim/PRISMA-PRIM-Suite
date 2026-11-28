import { useId, type ReactNode } from 'react';

/** A white surface with a fine border; with a title it is a named region. */
export function ClarteCard({
  title,
  actions,
  children,
}: Readonly<{
  title?: string;
  actions?: ReactNode;
  children: ReactNode;
}>) {
  const titleId = useId();
  if (title === undefined)
    return (
      <div className="clarte-card">
        {actions && <div className="clarte-card-actions">{actions}</div>}
        {children}
      </div>
    );
  return (
    <section className="clarte-card" aria-labelledby={titleId}>
      <div className="clarte-card-head">
        <h2 id={titleId}>{title}</h2>
        {actions && <div className="clarte-card-actions">{actions}</div>}
      </div>
      {children}
    </section>
  );
}
