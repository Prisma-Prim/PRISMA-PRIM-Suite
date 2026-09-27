import { Select } from '../presentation/Select';
import { useInterfaceLocaleCopy } from './interface-locale.copy';
import {
  isInterfaceLocale,
  useInterfaceLocale,
  type InterfaceLocale,
} from './interface-locale';
import './interface-locale.css';

const options: readonly Readonly<{
  value: InterfaceLocale;
  label: string;
}>[] = [
  { value: 'ro', label: 'Română' },
  { value: 'ru', label: 'Русский' },
  { value: 'fr', label: 'Français' },
  { value: 'en', label: 'English' },
];

export function InterfaceLocaleSelect() {
  const copy = useInterfaceLocaleCopy();
  const { locale, changeLocale } = useInterfaceLocale();
  return (
    <div className="interface-locale-control">
      <label htmlFor="interface-locale">{copy.label}</label>
      <Select
        id="interface-locale"
        title={options.find((option) => option.value === locale)?.label}
        value={locale}
        options={options}
        onValueChange={(value) => {
          if (isInterfaceLocale(value)) changeLocale(value);
        }}
      />
    </div>
  );
}
