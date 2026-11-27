import { CornerDownLeft, Search } from 'lucide-react';
import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import type { ClarteDestinationId } from './clarte-entries';

/** One authorized destination the jump list can open; never record data. */
export type ClarteJumpDestination = Readonly<{
  id: ClarteDestinationId;
  label: string;
  entryLabel: string;
}>;

type ClarteJumpListProps = Readonly<{
  destinations: readonly ClarteJumpDestination[];
  onChoose: (destination: ClarteDestinationId) => void;
  onDismiss: () => void;
  copy: Readonly<{
    title: string;
    placeholder: string;
    inputLabel: string;
    empty: string;
    hint: string;
  }>;
}>;

function searchable(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase();
}

/** Destinations whose entry and tab labels contain every typed word. */
function matchingDestinations(
  destinations: readonly ClarteJumpDestination[],
  query: string,
): ClarteJumpDestination[] {
  const words = searchable(query).split(/\s+/u).filter(Boolean);
  return destinations.filter((destination) => {
    const text = searchable(`${destination.entryLabel} ${destination.label}`);
    return words.every((word) => text.includes(word));
  });
}

/**
 * The Ctrl K / Cmd K jump list: a modal combobox over the authorized
 * destinations the frame passes in. It searches labels only.
 */
export function ClarteJumpList({
  destinations,
  onChoose,
  onDismiss,
  copy,
}: ClarteJumpListProps) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const ids = useId();
  const matches = matchingDestinations(destinations, query);
  const activeIndex = Math.min(active, matches.length - 1);
  const activeMatch = matches[activeIndex];

  useEffect(() => {
    input.current?.focus();
  }, []);

  function handleKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (matches.length === 0) return;
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setActive((activeIndex + step + matches.length) % matches.length);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (activeMatch) onChoose(activeMatch.id);
    } else if (event.key === 'Tab') {
      // The field is the dialog's only focus stop; options follow the arrows.
      event.preventDefault();
    }
  }

  return (
    <div
      className="clarte-jump-layer"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onDismiss();
      }}
    >
      <div
        className="clarte-jump"
        role="dialog"
        aria-modal="true"
        aria-label={copy.title}
      >
        <div className="clarte-jump-field">
          <Search aria-hidden="true" />
          <label className="clarte-visually-hidden" htmlFor={`${ids}-input`}>
            {copy.inputLabel}
          </label>
          <input
            ref={input}
            id={`${ids}-input`}
            type="text"
            role="combobox"
            autoComplete="off"
            spellCheck={false}
            placeholder={copy.placeholder}
            value={query}
            aria-expanded="true"
            aria-controls={`${ids}-list`}
            aria-autocomplete="list"
            aria-activedescendant={
              activeMatch ? `${ids}-${activeMatch.id}` : undefined
            }
            onChange={(event) => {
              setQuery(event.target.value);
              setActive(0);
            }}
            onKeyDown={handleKeyDown}
          />
        </div>
        <div
          id={`${ids}-list`}
          className="clarte-jump-list"
          role="listbox"
          aria-label={copy.title}
        >
          {matches.map((destination, index) => (
            <div
              key={destination.id}
              id={`${ids}-${destination.id}`}
              className="clarte-jump-option"
              role="option"
              aria-selected={index === activeIndex}
              onPointerMove={() => setActive(index)}
              onClick={() => onChoose(destination.id)}
            >
              <span>{destination.label}</span>
              {destination.label !== destination.entryLabel && (
                <small>{destination.entryLabel}</small>
              )}
              {index === activeIndex && <CornerDownLeft aria-hidden="true" />}
            </div>
          ))}
        </div>
        {matches.length === 0 && (
          <p className="clarte-jump-empty" role="status">
            {copy.empty}
          </p>
        )}
        <p className="clarte-jump-hint">{copy.hint}</p>
      </div>
    </div>
  );
}
