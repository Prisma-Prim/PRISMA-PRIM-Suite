import { BadRequestException } from '@nestjs/common';
import { PDFDocument } from 'pdf-lib';

/** Inspect PDF structure through the parser; never rewrite the preserved bytes. */
export async function requireQuestionnairePdfStructure(
  bytes: Buffer,
): Promise<void> {
  try {
    const document = await PDFDocument.load(bytes, {
      ignoreEncryption: false,
      throwOnInvalidObject: true,
      updateMetadata: false,
    });
    // Loading alone can defer invalid catalog/page-tree errors. Traverse the
    // public page API and its inherited media boxes before publishing content.
    const pages = document.getPages();
    if (document.catalog.Pages().Count().asNumber() !== pages.length)
      throw new Error('The PDF page tree contains unresolved page identities.');
    for (const page of pages) page.getMediaBox();
  } catch {
    throw new BadRequestException({
      code: 'document_pdf_invalid',
      message: 'The questionnaire is not a readable PDF document.',
    });
  }
}
