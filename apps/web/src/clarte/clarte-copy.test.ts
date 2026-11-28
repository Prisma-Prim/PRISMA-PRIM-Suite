import { expect, it } from 'vitest';
import { assertEveryLocalizedCatalogCovered } from '../test/localized-catalog-coverage';

// Every Clarté catalogue, found by file name like the release coverage check.
const clarteCopyModules = import.meta.glob('./**/*.copy.ts', { eager: true });

it('has every Clarté frame and component text in the four interface languages', () => {
  expect(assertEveryLocalizedCatalogCovered(clarteCopyModules)).toEqual([
    'clarte-frame.copy.ts#clarteFrameMessages',
    'components/clarte-components.copy.ts#clarteComponentMessages',
    'documents/clarte-documents.copy.ts#clarteDocumentsMessages',
    'entry/clarte-entry.copy.ts#clarteEntryMessages',
    'finance/clarte-finance.copy.ts#clarteFinanceMessages',
    'improvement/clarte-improvement.copy.ts#clarteImprovementMessages',
    'settings/settings-access.copy.ts#settingsAccessMessages',
    'settings/settings-console.copy.ts#settingsConsoleMessages',
  ]);
});
