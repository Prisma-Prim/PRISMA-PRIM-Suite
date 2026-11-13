import { PDFDocument, StandardFonts } from 'pdf-lib';

/** Exact fictional files for the Certificate revision journey; no official PDF is generated. */
export async function fictionalCertificatePdf({
  validity,
  version,
}: {
  validity: {
    validFrom: string;
    validUntil: string;
    firstSurveillanceBy: string;
  };
  version:
    | { kind: 'issued' }
    | { kind: 'revision'; revisedOn: string }
    | { kind: 'unmarked_revision' };
}) {
  let englishAddress: string;
  let revisionLines: string[];
  switch (version.kind) {
    case 'issued':
      englishAddress = '1 Example Street, Demo Ctiy';
      revisionLines = [];
      break;
    case 'unmarked_revision':
      englishAddress = '1 Example Street, Demo City';
      revisionLines = [];
      break;
    case 'revision':
      englishAddress = '1 Example Street, Demo City';
      revisionLines = ['Revision 1', `Revision date: ${version.revisedOn}`];
      break;
    default: {
      const unreachable: never = version;
      throw new Error(`Unknown fictional Certificate version: ${unreachable}`);
    }
  }

  const pdf = await PDFDocument.create();
  // Stable metadata makes the same input produce the same preserved bytes.
  const fixtureDate = new Date('2026-01-15T00:00:00.000Z');
  pdf.setCreationDate(fixtureDate);
  pdf.setModificationDate(fixtureDate);
  pdf.setCreator('PRISMA-PRIM synthetic acceptance fixture');
  pdf.setTitle('Fictional Certificate DEMO-0001');
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const common = [
    'Fictional acceptance evidence - not an official Certificate.',
    'Lactis Demo SRL',
    `Valid from: ${validity.validFrom}`,
    `Valid until: ${validity.validUntil}`,
    `First surveillance to start by: ${validity.firstSurveillanceBy}`,
    'Signed by: Decision Maker Demo',
    ...revisionLines,
  ];
  const pages = [
    [
      'Fictional Certificate DEMO-0001',
      'Romanian page (ro)',
      ...common,
      'Str. Exemplu 1, Demo City',
      'Producerea laptelui pasteurizat (exemplu)',
    ],
    [
      'Fictional Certificate DEMO-0001',
      'English page (en)',
      ...common,
      englishAddress,
      'Production of pasteurised milk (example)',
    ],
  ];
  for (const lines of pages) {
    const page = pdf.addPage([595.28, 841.89]);
    for (const [index, line] of lines.entries())
      page.drawText(line, {
        x: 48,
        y: 788 - index * 27,
        size: index === 0 ? 15 : 11,
        font,
      });
  }
  return Buffer.from(await pdf.save());
}
