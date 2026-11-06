import { interfaceLocales } from '../localization/interface-locale';
import {
  assertMessageCoverage,
  type MessageCatalog,
} from '../localization/messages';

/** Module namespaces by path, as `import.meta.glob('…/*.copy.ts', { eager: true })` returns them. */
export type CopyModules = Readonly<Record<string, unknown>>;

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null;
}

function isStringArray(value: unknown): value is readonly string[] {
  return (
    Array.isArray(value) && value.every((item) => typeof item === 'string')
  );
}

/** A catalog is anything that carries the two members `defineMessages` creates. */
function isCatalogCandidate(value: unknown): boolean {
  return isRecord(value) && 'keys' in value && 'translations' in value;
}

function isMessageCatalog(value: unknown): value is MessageCatalog<string> {
  if (!isRecord(value) || !isStringArray(value.keys)) return false;
  const { translations } = value;
  return (
    isRecord(translations) &&
    interfaceLocales.every((locale) => isRecord(translations[locale]))
  );
}

/** `../client/x.copy.ts` becomes `client/x.copy.ts`. */
function displayPath(path: string): string {
  return path.replace(/^(?:\.{1,2}\/)+/u, '');
}

/**
 * Requires every key of every message catalog exported by the given `.copy.ts`
 * modules to have a value in each interface locale. Catalogs are found by
 * their shape, so nothing has to be registered. A catalog-like export whose
 * shape cannot be checked fails instead of being skipped. Returns the
 * `path#export` name of every catalog checked.
 */
export function assertEveryLocalizedCatalogCovered(
  modules: CopyModules,
): readonly string[] {
  const covered: string[] = [];
  for (const [path, copyModule] of Object.entries(modules)) {
    if (!isRecord(copyModule)) continue;
    for (const [exportName, exported] of Object.entries(copyModule)) {
      if (!isCatalogCandidate(exported)) continue;
      const name = `${displayPath(path)}#${exportName}`;
      if (!isMessageCatalog(exported))
        throw new Error(`Malformed message catalog: ${name}`);
      assertMessageCoverage(name, exported);
      covered.push(name);
    }
  }
  return covered;
}
