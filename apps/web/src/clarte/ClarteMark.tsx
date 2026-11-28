import { useId } from 'react';

/** The Clarté product mark: a faceted prism in the spectrum colours. */
export function ClarteMark() {
  const gradient = useId();
  return (
    <svg className="clarte-mark" viewBox="0 0 32 32" aria-hidden="true">
      <defs>
        <linearGradient id={gradient} x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="#7c5cff" />
          <stop offset="0.55" stopColor="#e851ae" />
          <stop offset="1" stopColor="#f2b035" />
        </linearGradient>
      </defs>
      <path d="M16 3 30 28H2Z" fill={`url(#${gradient})`} />
      <path d="M16 3v25H2Z" fill="#fff" fillOpacity="0.3" />
      <path d="m16 13 6 11H10Z" fill="#fff" fillOpacity="0.55" />
    </svg>
  );
}
