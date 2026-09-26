import {
  type CSSProperties,
  type KeyboardEvent,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { selectCopy as copy } from './select.copy';
import './select.css';

export type SelectOption = Readonly<{
  value: string;
  label: string;
  disabled?: boolean;
}>;

type SelectProps = Readonly<{
  id: string;
  value: string;
  options: readonly SelectOption[];
  onValueChange: (value: string) => void;
  placeholder?: string;
  emptyMessage?: string;
  unavailableMessage?: string;
  disabled?: boolean;
  required?: boolean;
  invalid?: boolean;
  describedBy?: string;
  name?: string;
  form?: string;
  resetValue?: string;
  title?: string;
  className?: string;
}>;

type MenuPosition = Readonly<{
  left: number;
  width: number;
  maxHeight: number;
}> &
  (
    | Readonly<{ placement: 'below'; top: number }>
    | Readonly<{ placement: 'above'; bottom: number }>
  );

const menuGap = 6;
const viewportGap = 8;
const preferredMenuHeight = 320;
const minimumMenuHeight = 112;
const typeaheadDelay = 700;

function accessibleLabel(
  trigger: HTMLButtonElement,
  title: string | undefined,
  fallback: string,
): string {
  const label = trigger.labels.item(0);
  if (label) {
    const copy = label.cloneNode(true) as HTMLLabelElement;
    copy.querySelector('.shared-select')?.remove();
    const text = copy.textContent?.trim();
    if (text) return text;
  }
  return title ?? fallback;
}

export function Select({
  id,
  value,
  options,
  onValueChange,
  placeholder,
  emptyMessage = copy.empty,
  unavailableMessage = copy.unavailable,
  disabled = false,
  required = false,
  invalid = false,
  describedBy,
  name,
  form,
  resetValue,
  title,
  className,
}: SelectProps) {
  const generatedId = useId();
  const listboxId = `${id}-${generatedId}-listbox`;
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const initialValueRef = useRef(value);
  const typeaheadRef = useRef('');
  const typeaheadTimeoutRef = useRef<number | undefined>(undefined);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState<number>();
  const [position, setPosition] = useState<MenuPosition>();
  const [menuTypography, setMenuTypography] =
    useState<Pick<CSSProperties, 'fontFamily' | 'fontSize'>>();
  const [prismePortal, setPrismePortal] = useState(false);
  const [listboxLabel, setListboxLabel] = useState('');

  const menuOptions = useMemo(
    () =>
      placeholder === undefined
        ? options
        : [{ value: '', label: placeholder }, ...options],
    [options, placeholder],
  );
  const selectedIndex = menuOptions.findIndex(
    (option) => option.value === value,
  );
  const selectedOption =
    selectedIndex >= 0 ? menuOptions[selectedIndex] : undefined;
  const selectedIsUnavailable =
    value !== '' &&
    (selectedOption === undefined || selectedOption.disabled === true);
  const displayValue = selectedIsUnavailable
    ? `${unavailableMessage}${selectedOption ? `: ${selectedOption.label}` : ''}`
    : (selectedOption?.label ?? placeholder ?? copy.fallback);
  const submittedValue = selectedIsUnavailable ? '' : value;
  const enabledIndexes = useMemo(
    () =>
      menuOptions.flatMap((option, index) =>
        option.disabled === true ? [] : [index],
      ),
    [menuOptions],
  );
  const optionsSignature = menuOptions
    .map(
      (option) =>
        `${option.value}\u0000${option.label}\u0000${option.disabled === true}`,
    )
    .join('\u0001');
  const previousOptionsSignature = useRef(optionsSignature);
  const previousValue = useRef(value);
  const menuOpen =
    open &&
    !disabled &&
    previousOptionsSignature.current === optionsSignature &&
    previousValue.current === value;
  const activeOptionId =
    activeIndex === undefined
      ? undefined
      : `${listboxId}-option-${activeIndex}`;

  function firstActiveIndex(): number | undefined {
    if (selectedIndex >= 0 && selectedOption?.disabled !== true)
      return selectedIndex;
    return enabledIndexes[0];
  }

  function updatePosition() {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const bounds = trigger.getBoundingClientRect();
    const triggerStyle = getComputedStyle(trigger);
    setMenuTypography({
      fontFamily: triggerStyle.fontFamily,
      fontSize: triggerStyle.fontSize,
    });
    setPrismePortal(trigger.closest('.prisme-shell') !== null);
    setListboxLabel(accessibleLabel(trigger, title, displayValue));
    const viewportWidth = document.documentElement.clientWidth;
    const viewportHeight = document.documentElement.clientHeight;
    const availableBelow =
      viewportHeight - bounds.bottom - menuGap - viewportGap;
    const availableAbove = bounds.top - menuGap - viewportGap;
    const placement =
      availableBelow < minimumMenuHeight && availableAbove > availableBelow
        ? 'above'
        : 'below';
    const availableHeight = Math.max(
      0,
      placement === 'below' ? availableBelow : availableAbove,
    );
    const width = Math.max(
      0,
      Math.min(bounds.width, viewportWidth - viewportGap * 2),
    );
    const left = Math.min(
      Math.max(viewportGap, bounds.left),
      Math.max(viewportGap, viewportWidth - width - viewportGap),
    );
    const maxHeight = Math.min(preferredMenuHeight, availableHeight);

    setPosition(
      placement === 'below'
        ? { placement, top: bounds.bottom + menuGap, left, width, maxHeight }
        : {
            placement,
            bottom: viewportHeight - bounds.top + menuGap,
            left,
            width,
            maxHeight,
          },
    );
  }

  function openMenu(preferredIndex = firstActiveIndex()) {
    if (disabled) return;
    setActiveIndex(preferredIndex);
    updatePosition();
    setOpen(true);
  }

  function closeMenu({ restoreFocus = false } = {}) {
    setOpen(false);
    setActiveIndex(undefined);
    typeaheadRef.current = '';
    if (restoreFocus) triggerRef.current?.focus();
  }

  function choose(index: number) {
    const option = menuOptions[index];
    if (!option || option.disabled === true) return;
    onValueChange(option.value);
    closeMenu({ restoreFocus: true });
  }

  function moveActive(direction: 1 | -1) {
    if (enabledIndexes.length === 0) return;
    const currentPosition =
      activeIndex === undefined ? -1 : enabledIndexes.indexOf(activeIndex);
    const nextPosition =
      currentPosition < 0
        ? direction === 1
          ? 0
          : enabledIndexes.length - 1
        : (currentPosition + direction + enabledIndexes.length) %
          enabledIndexes.length;
    setActiveIndex(enabledIndexes[nextPosition]);
  }

  function findTypeaheadMatch(search: string): number | undefined {
    if (enabledIndexes.length === 0) return undefined;
    const start =
      activeIndex === undefined
        ? 0
        : Math.max(0, enabledIndexes.indexOf(activeIndex) + 1);
    const orderedIndexes = [
      ...enabledIndexes.slice(start),
      ...enabledIndexes.slice(0, start),
    ];
    const normalizedSearch = search.toLocaleLowerCase();
    return orderedIndexes.find((index) =>
      menuOptions[index]?.label
        .toLocaleLowerCase()
        .startsWith(normalizedSearch),
    );
  }

  function handleTypeahead(character: string) {
    if (typeaheadTimeoutRef.current !== undefined)
      window.clearTimeout(typeaheadTimeoutRef.current);
    const repeatedCharacter =
      typeaheadRef.current.length > 0 &&
      [...typeaheadRef.current].every(
        (valueCharacter) =>
          valueCharacter.toLocaleLowerCase() === character.toLocaleLowerCase(),
      );
    typeaheadRef.current = repeatedCharacter
      ? character
      : typeaheadRef.current + character;
    const match = findTypeaheadMatch(typeaheadRef.current);
    if (match !== undefined) {
      if (!open) openMenu(match);
      else setActiveIndex(match);
    }
    typeaheadTimeoutRef.current = window.setTimeout(() => {
      typeaheadRef.current = '';
    }, typeaheadDelay);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (disabled) return;
    if (
      event.key.length === 1 &&
      event.key !== ' ' &&
      !event.altKey &&
      !event.ctrlKey &&
      !event.metaKey
    ) {
      event.preventDefault();
      handleTypeahead(event.key);
      return;
    }
    switch (event.key) {
      case 'Enter':
      case ' ':
        event.preventDefault();
        if (open && activeIndex !== undefined) choose(activeIndex);
        else openMenu();
        break;
      case 'ArrowDown':
        event.preventDefault();
        if (!open) openMenu();
        else moveActive(1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        if (!open) openMenu(enabledIndexes.at(-1));
        else moveActive(-1);
        break;
      case 'Home':
        event.preventDefault();
        if (!open) openMenu(enabledIndexes[0]);
        else setActiveIndex(enabledIndexes[0]);
        break;
      case 'End':
        event.preventDefault();
        if (!open) openMenu(enabledIndexes.at(-1));
        else setActiveIndex(enabledIndexes.at(-1));
        break;
      case 'Escape':
        if (open) {
          event.preventDefault();
          event.stopPropagation();
          closeMenu({ restoreFocus: true });
        }
        break;
      case 'Tab':
        if (open) closeMenu();
        break;
    }
  }

  useEffect(() => {
    if (!open) return;
    const dismissOutside = (event: PointerEvent) => {
      if (!(event.target instanceof Node)) return;
      if (
        triggerRef.current?.contains(event.target) !== true &&
        popupRef.current?.contains(event.target) !== true
      )
        closeMenu();
    };
    const reposition = () => updatePosition();
    document.addEventListener('pointerdown', dismissOutside);
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);
    return () => {
      document.removeEventListener('pointerdown', dismissOutside);
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open || !activeOptionId) return;
    const activeOption = document.getElementById(activeOptionId);
    if (activeOption && typeof activeOption.scrollIntoView === 'function')
      activeOption.scrollIntoView({ block: 'nearest' });
  }, [activeOptionId, open]);

  useEffect(() => {
    if (previousOptionsSignature.current !== optionsSignature) {
      previousOptionsSignature.current = optionsSignature;
      if (open) closeMenu();
    }
  }, [open, optionsSignature]);

  useEffect(() => {
    if (previousValue.current !== value) {
      previousValue.current = value;
      if (open) closeMenu();
    }
  }, [open, value]);

  useEffect(() => {
    if (!disabled || !open) return;
    closeMenu();
  }, [disabled, open]);

  useEffect(() => {
    const owner = triggerRef.current?.form;
    if (!owner) return;
    const restoreInitialValue = () =>
      onValueChange(resetValue ?? initialValueRef.current);
    owner.addEventListener('reset', restoreInitialValue);
    return () => owner.removeEventListener('reset', restoreInitialValue);
  }, [onValueChange, resetValue]);

  useEffect(
    () => () => {
      if (typeaheadTimeoutRef.current !== undefined)
        window.clearTimeout(typeaheadTimeoutRef.current);
    },
    [],
  );

  const menuStyle: CSSProperties | undefined = position
    ? position.placement === 'below'
      ? {
          top: position.top,
          left: position.left,
          width: position.width,
          maxHeight: position.maxHeight,
        }
      : {
          bottom: position.bottom,
          left: position.left,
          width: position.width,
          maxHeight: position.maxHeight,
        }
    : undefined;
  const classes = ['shared-select', className].filter(Boolean).join(' ');
  return (
    <span className={classes} data-open={menuOpen || undefined}>
      <button
        ref={triggerRef}
        id={id}
        type="button"
        value={submittedValue}
        role="combobox"
        className="shared-select__trigger"
        title={title}
        form={form}
        disabled={disabled}
        aria-controls={listboxId}
        aria-expanded={menuOpen}
        aria-haspopup="listbox"
        aria-activedescendant={menuOpen ? activeOptionId : undefined}
        aria-describedby={describedBy}
        aria-invalid={invalid || selectedIsUnavailable || undefined}
        aria-required={required || undefined}
        data-value={submittedValue}
        data-placeholder={!selectedOption || selectedIsUnavailable || undefined}
        onClick={() => (open ? closeMenu() : openMenu())}
        onKeyDown={handleKeyDown}
      >
        <span className="shared-select__value">{displayValue}</span>
        <svg
          className="shared-select__chevron"
          viewBox="0 0 20 20"
          aria-hidden="true"
        >
          <path d="m6 8 4 4 4-4" />
        </svg>
      </button>
      {(name !== undefined || required) && (
        <input
          className="shared-select__form-control"
          tabIndex={-1}
          aria-hidden="true"
          name={name}
          form={form}
          disabled={disabled}
          required={required}
          value={submittedValue}
          onChange={() => undefined}
          // Keep native validation order: canceling invalid skips this field.
          onInvalid={() => triggerRef.current?.focus()}
          onFocus={() => triggerRef.current?.focus()}
        />
      )}
      {menuOpen &&
        position &&
        createPortal(
          <div
            ref={popupRef}
            className={`shared-select__portal${prismePortal ? ' shared-select__portal--prisme' : ''}`}
            style={{ ...menuStyle, ...menuTypography }}
            data-placement={position.placement}
          >
            <div
              id={listboxId}
              role="listbox"
              aria-label={listboxLabel}
              className="shared-select__listbox"
            >
              {menuOptions.length === 0 ? (
                <p className="shared-select__empty">{emptyMessage}</p>
              ) : (
                menuOptions.map((option, index) => {
                  const isSelected = option.value === value;
                  const isActive = index === activeIndex;
                  return (
                    <button
                      id={`${listboxId}-option-${index}`}
                      key={`${option.value}-${index}`}
                      type="button"
                      role="option"
                      tabIndex={-1}
                      className="shared-select__option"
                      disabled={option.disabled}
                      aria-selected={isActive}
                      data-value={option.value}
                      data-active={isActive || undefined}
                      data-selected={isSelected || undefined}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => choose(index)}
                    >
                      <span>{option.label}</span>
                      {isSelected && !selectedIsUnavailable && (
                        <svg viewBox="0 0 20 20" aria-hidden="true">
                          <path d="m4 10 4 4 8-8" />
                        </svg>
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </div>,
          document.body,
        )}
    </span>
  );
}
