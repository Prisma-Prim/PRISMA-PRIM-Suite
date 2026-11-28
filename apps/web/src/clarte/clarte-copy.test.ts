import { expect, it } from 'vitest';
import { assertEveryLocalizedCatalogCovered } from '../test/localized-catalog-coverage';

// Every Clarté catalogue, found by file name like the release coverage check.
const clarteCopyModules = import.meta.glob('./**/*.copy.ts', { eager: true });

it('has every Clarté frame and component text in the four interface languages', () => {
  expect(assertEveryLocalizedCatalogCovered(clarteCopyModules)).toEqual([
    'affaires/affaires.copy.ts#affaireMessages',
    'clarte-frame.copy.ts#clarteFrameMessages',
    'components/clarte-components.copy.ts#clarteComponentMessages',
    'documents/clarte-documents.copy.ts#clarteDocumentsMessages',
  ]);
});
