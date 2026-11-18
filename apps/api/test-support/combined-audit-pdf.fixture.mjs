import { readFile } from 'node:fs/promises';
import { URL } from 'node:url';
import { Buffer } from 'node:buffer';
import { PDFDocument } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';

/** Fictional bilingual native text plus an explicitly unreadable page. */
export async function combinedAuditPdf(taxId = 'RO12345678') {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const font = await pdf.embedFont(
    await readFile(
      new URL('../src/commercial-pdf/assets/DejaVuSans.ttf', import.meta.url),
    ),
    { subset: true },
  );
  const instant = new Date('2026-01-15T00:00:00Z');
  pdf.setCreationDate(instant);
  pdf.setModificationDate(instant);
  for (const lines of [
    [
      'DOSAR FICTIV — fără valoare oficială',
      `Cod fiscal: ${taxId}`,
      'Lactis Demo SRL',
    ],
    [
      'УЧЕБНЫЙ ДОСЬЕ — не официальный документ',
      'Организация: Lactis Demo SRL',
      `Налоговый код: ${taxId}`,
    ],
  ]) {
    const page = pdf.addPage([595, 842]);
    lines.forEach((line, index) =>
      page.drawText(line, { x: 35, y: 780 - index * 35, size: 12, font }),
    );
  }
  pdf.addPage([595, 842]);
  return Buffer.from(await pdf.save({ useObjectStreams: false }));
}

/**
 * Fictional external Certificate whose actual bytes carry the agreed facts.
 * @param {{number: string, holderName: string, address: string, scope: string,
 * validFrom: string, validUntil: string}} facts
 */
export async function combinedCertificatePdf(facts) {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const font = await pdf.embedFont(
    await readFile(
      new URL('../src/commercial-pdf/assets/DejaVuSans.ttf', import.meta.url),
    ),
    { subset: true },
  );
  const page = pdf.addPage([595.28, 841.89]);
  const lines = [
    'CERTIFICAT FICTIV — fără valoare oficială',
    `Număr: ${facts.number}`,
    facts.holderName,
    facts.address,
    facts.scope,
    `Valabil de la: ${facts.validFrom}`,
    `Valabil până la: ${facts.validUntil}`,
    'Fictional signature: Decision Maker Demo',
  ];
  lines.forEach((line, index) =>
    page.drawText(line, { x: 48, y: 780 - index * 35, size: 12, font }),
  );
  const instant = new Date('2026-01-15T00:00:00Z');
  pdf.setCreationDate(instant);
  pdf.setModificationDate(instant);
  return Buffer.from(await pdf.save({ useObjectStreams: false }));
}
