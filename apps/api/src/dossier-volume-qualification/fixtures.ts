import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { PDFDocument } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { strToU8, zipSync } from 'fflate';
import type { QualificationInput } from './index.js';

const paragraph = (text: string) => `<w:p><w:r><w:t>${text}</w:t></w:r></w:p>`;
const cell = (text: string) => `<w:tc>${paragraph(text)}</w:tc>`;
function word(body: string) {
  const parts = {
    '[Content_Types].xml':
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
    '_rels/.rels':
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="root" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
    'word/document.xml': `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}</w:body></w:document>`,
  };
  return zipSync(
    Object.fromEntries(
      Object.entries(parts).map(([name, xml]) => [name, strToU8(xml)]),
    ),
    { mtime: new Date('2020-01-01T00:00:00Z') },
  );
}

/** Fictional ground truth is written independently of extraction and engine output. */
export async function preparedInputs(): Promise<QualificationInput[]> {
  const pdf = await PDFDocument.create();
  pdf.setCreationDate(new Date('2020-01-01T00:00:00Z'));
  pdf.setModificationDate(new Date('2020-01-01T00:00:00Z'));
  pdf.registerFontkit(fontkit);
  const font = await pdf.embedFont(
    await readFile(
      join(__dirname, '..', 'commercial-pdf/assets/DejaVuSans.ttf'),
    ),
    { subset: true, customName: 'QualificationUnicode' },
  );
  const page = pdf.addPage();
  // Paint columns separately, in non-reading order. Spatial layout must recover the rows.
  page.drawText('IDNO', { x: 40, y: 700, font, size: 12 });
  page.drawText('Наименование организации', { x: 40, y: 675, font, size: 12 });
  page.drawText('0012345678901', { x: 330, y: 700, font, size: 12 });
  page.drawText('ООО Пример', { x: 330, y: 675, font, size: 12 });
  page.drawText('Domeniu: Producție', { x: 40, y: 640, font, size: 12 });
  const native = await pdf.save();
  const image = await pdf.embedPng(
    Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/aN8AAAAASUVORK5CYII=',
      'base64',
    ),
  );
  pdf.addPage().drawImage(image, { x: 40, y: 40, width: 200, height: 200 });
  const mixed = await pdf.save();
  const scan = await PDFDocument.create();
  scan.setCreationDate(new Date('2020-01-01T00:00:00Z'));
  scan.setModificationDate(new Date('2020-01-01T00:00:00Z'));
  const scanImage = await scan.embedPng(
    Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/aN8AAAAASUVORK5CYII=',
      'base64',
    ),
  );
  scan
    .addPage()
    .drawImage(scanImage, { x: 40, y: 40, width: 200, height: 200 });
  const passages = [
    'IDNO\t0012345678901\nНаименование организации\tООО Пример\nDomeniu: Producție',
  ];
  const candidates = [
    'taxId:0012345678901',
    'legalName:ООО Пример',
    'scope:Producție',
  ];
  return [
    {
      id: 'spatial-pdf',
      kind: 'pdf',
      language: 'ru',
      bytes: native,
      pdfPages: 1,
      expected: { state: 'complete', passages, candidates },
    },
    {
      id: 'mixed-scan-pdf',
      kind: 'pdf',
      language: 'ro',
      bytes: mixed,
      pdfPages: 2,
      expected: { state: 'partial', passages, candidates },
    },
    {
      id: 'image-only-pdf',
      kind: 'pdf',
      language: 'ro',
      bytes: await scan.save(),
      pdfPages: 1,
      expected: { state: 'unreadable', passages: [], candidates: [] },
    },
    {
      id: 'bilingual-word',
      kind: 'docx',
      language: 'ro',
      bytes: word(
        paragraph('Denumire juridică: Știință Fictivă') +
          `<w:tbl><w:tr>${cell('Фискальный код')}${cell('00042')}</w:tr></w:tbl>`,
      ),
      pdfPages: null,
      expected: {
        state: 'complete',
        passages: [
          'Denumire juridică: Știință Fictivă',
          'Фискальный код\t00042',
        ],
        candidates: ['legalName:Știință Fictivă', 'taxId:00042'],
      },
    },
    {
      id: 'merged-word',
      kind: 'docx',
      language: 'ru',
      bytes: word(
        `<w:tbl><w:tr><w:tc><w:tcPr><w:gridSpan w:val="2"/></w:tcPr>${paragraph('Identitate')}</w:tc></w:tr><w:tr>${cell('Адрес')}${cell('Кишинёв')}</w:tr></w:tbl>`,
      ),
      pdfPages: null,
      expected: {
        state: 'partial',
        passages: ['Identitate', 'Адрес\tКишинёв'],
        candidates: ['address:Кишинёв'],
      },
    },
    {
      id: 'nested-word',
      kind: 'docx',
      language: 'ru',
      bytes: word(
        `<w:tbl><w:tr><w:tc>${paragraph('Exterior')}<w:tbl><w:tr>${cell('Внутри')}</w:tr></w:tbl></w:tc></w:tr></w:tbl>`,
      ),
      pdfPages: null,
      expected: {
        state: 'partial',
        passages: ['Внутри', 'Exterior'],
        candidates: [],
      },
    },
  ];
}

export function repeatPrepared(
  inputs: readonly QualificationInput[],
  size: 'small' | 'medium' | 'large',
) {
  const repeats = { small: 1, medium: 4, large: 10 }[size];
  return Array.from({ length: repeats }, (_, n) =>
    inputs.map((input) => ({ ...input, id: `${input.id}-${n + 1}` })),
  ).flat();
}
