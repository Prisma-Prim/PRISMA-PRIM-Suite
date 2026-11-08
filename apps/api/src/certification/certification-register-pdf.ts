import { HttpException, ServiceUnavailableException } from '@nestjs/common';
import fontkit from '@pdf-lib/fontkit';
import { PDFDocument, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import {
  PDF_TEXT_SHAPING,
  pdfCheckpoint,
  pdfGraphemes,
  qualifyPdfText,
  readBundledPdfFonts,
} from '../commercial-pdf/bundled-pdf-fonts.js';
import { pdfRefusal } from '../commercial-pdf/commercial-pdf-source.js';
import type {
  RegisterBlock,
  RegisterDocument,
} from './certification-register.js';

export const CERTIFICATION_REGISTER_RENDERER =
  'CERTIFICATION_DOSSIER_REGISTER_PDF';

const PAGE_SIZE: [number, number] = [595.28, 841.89];
const LEFT = 42;
const RIGHT = 553.28;
const TOP = 812;
/** The lowest baseline of the content; the footer sits below it. */
const BOTTOM = 62;
const FOOTER = 36;
const BODY = 8.5;
const BODY_LINE = 11.5;
const LABEL_WIDTH = 165;
/** Role, Document, Document Version and SHA-256; identifiers are set smaller so a Version id stays on one line. */
const COLUMNS = [
  { width: 70, size: BODY },
  { width: 118, size: BODY },
  { width: 162, size: 7 },
  { width: 161.28, size: 7 },
] as const;
const MAXIMUM_PAGES = 256;
const MAXIMUM_PDF_BYTES = 16 * 1024 * 1024;
const INK = rgb(0.08, 0.12, 0.2);
const RULE = rgb(0.6, 0.6, 0.6);

/**
 * Renders the register with the bundled fonts. Unsupported text or layout is
 * a 422 refusal; any other failure is an unavailable render, never a partial
 * PDF. The same register always yields the same bytes.
 */
export async function renderCertificationRegister(
  register: RegisterDocument,
  signal?: AbortSignal,
): Promise<Uint8Array> {
  try {
    return await render(register, signal);
  } catch (error) {
    signal?.throwIfAborted();
    if (error instanceof HttpException) throw error;
    throw new ServiceUnavailableException({ code: 'PDF_RENDER_UNAVAILABLE' });
  }
}

interface Cell {
  lines: string[];
  x: number;
  font: PDFFont;
  size: number;
}

async function render(
  register: RegisterDocument,
  signal?: AbortSignal,
): Promise<Uint8Array> {
  await pdfCheckpoint(signal);
  const fonts = await readBundledPdfFonts(signal);
  const text = drawnText(register);
  for (const bytes of [fonts.regular, fonts.bold])
    await qualifyPdfText(bytes, text, signal);
  await pdfCheckpoint(signal);
  // No default metadata: every field below is fixed by the Case revision.
  const document = await PDFDocument.create({ updateMetadata: false });
  document.registerFontkit(fontkit);
  document.setTitle(register.title);
  document.setSubject(register.subject);
  document.setLanguage(register.language);
  document.setCreator('PRISMA-PRIM Suite');
  document.setProducer(
    `${CERTIFICATION_REGISTER_RENDERER}/1; pdf-lib/1.17.1; fontkit/1.1.1; DejaVu Sans/2.37 Regular/Bold`,
  );
  document.setCreationDate(register.date);
  document.setModificationDate(register.date);
  const regular = await document.embedFont(fonts.regular, {
    subset: false,
    features: PDF_TEXT_SHAPING,
  });
  await pdfCheckpoint(signal);
  const bold = await document.embedFont(fonts.bold, {
    subset: false,
    features: PDF_TEXT_SHAPING,
  });
  await pdfCheckpoint(signal);

  const notice = wrap(register.notice, bold, BODY, RIGHT - LEFT);
  /** Height available to content below the notice of a fresh page. */
  const capacity = TOP - notice.length * BODY_LINE - 14 - BOTTOM;
  let page: PDFPage = document.addPage(PAGE_SIZE);
  let y = 0;

  function draw(
    line: string,
    x: number,
    baseline: number,
    size: number,
    font: PDFFont,
  ) {
    if (!line) return;
    if (
      x < LEFT ||
      x + font.widthOfTextAtSize(line, size) > RIGHT + 0.01 ||
      baseline < 32 ||
      baseline + size > PAGE_SIZE[1]
    )
      pdfRefusal('PDF_LAYOUT_UNSUPPORTED');
    page.drawText(line, { x, y: baseline, size, font, color: INK });
  }
  function rule(baseline: number) {
    page.drawLine({
      start: { x: LEFT, y: baseline },
      end: { x: RIGHT, y: baseline },
      thickness: 0.4,
      color: RULE,
    });
  }
  /** Every page states that it is a generated register, not a form. */
  function decorate() {
    let baseline = TOP;
    for (const line of notice) {
      draw(line, LEFT, baseline, BODY, bold);
      baseline -= BODY_LINE;
    }
    rule(baseline + 5);
    draw(
      `${register.page} ${document.getPageCount()}`,
      LEFT,
      FOOTER,
      BODY,
      regular,
    );
    y = baseline - 14;
  }
  function nextPage() {
    if (document.getPageCount() >= MAXIMUM_PAGES)
      pdfRefusal('PDF_CONTENT_LIMIT');
    page = document.addPage(PAGE_SIZE);
    decorate();
  }
  function room(lineHeight: number): number {
    return y < BOTTOM ? 0 : Math.floor((y - BOTTOM) / lineHeight) + 1;
  }
  function keep(lines: number, lineHeight: number) {
    if (room(lineHeight) < lines) nextPage();
  }
  function heading(
    value: string,
    size: number,
    lineHeight: number,
    next: number,
  ) {
    const lines = wrap(value, bold, size, RIGHT - LEFT);
    keep(lines.length + next, lineHeight);
    for (const line of lines) {
      draw(line, LEFT, y, size, bold);
      y -= lineHeight;
    }
  }
  /** Cells side by side; a row taller than the page continues on the next. */
  function row(cells: Cell[], continued: () => void) {
    const count = Math.max(...cells.map((cell) => cell.lines.length));
    let cursor = 0;
    while (cursor < count) {
      let available = room(BODY_LINE);
      if (available < 1) {
        nextPage();
        continued();
        available = room(BODY_LINE);
        if (available < 1) pdfRefusal('PDF_LAYOUT_UNSUPPORTED');
      }
      const taken = Math.min(available, count - cursor);
      for (const cell of cells)
        for (const [offset, line] of cell.lines
          .slice(cursor, cursor + taken)
          .entries())
          draw(line, cell.x, y - offset * BODY_LINE, cell.size, cell.font);
      y -= taken * BODY_LINE;
      cursor += taken;
    }
  }
  function table(block: Extract<RegisterBlock, { kind: 'table' }>) {
    function cells(values: readonly string[], font: PDFFont): Cell[] {
      let x = LEFT;
      return COLUMNS.map((column, index) => {
        const size = font === bold ? BODY : column.size;
        const cell = {
          lines: wrap(values[index] ?? '', font, size, column.width - 8),
          x: x + 4,
          font,
          size,
        };
        x += column.width;
        return cell;
      });
    }
    const header = cells(block.columns, bold);
    function head() {
      row(header, () => undefined);
      rule(y + BODY_LINE - 3);
    }
    keep(4, BODY_LINE);
    head();
    for (const values of block.rows) {
      const body = cells(values, regular);
      if (
        room(BODY_LINE) <
        Math.min(4, Math.max(...body.map((c) => c.lines.length)))
      ) {
        nextPage();
        head();
      }
      row(body, head);
      rule(y + BODY_LINE - 3);
      y -= 4;
    }
  }

  decorate();
  heading(register.title, 16, 22, 2);
  y -= 6;
  for (const block of register.blocks) {
    await pdfCheckpoint(signal);
    switch (block.kind) {
      case 'section':
        y -= 8;
        heading(block.text, 12, 17, 3);
        y -= 4;
        break;
      case 'entry': {
        const fields = block.fields.map((field): Cell[] => [
          {
            lines: wrap(field.label, bold, BODY, LABEL_WIDTH - 10),
            x: LEFT,
            font: bold,
            size: BODY,
          },
          {
            lines: wrap(field.value, regular, BODY, RIGHT - LEFT - LABEL_WIDTH),
            x: LEFT + LABEL_WIDTH,
            font: regular,
            size: BODY,
          },
        ]);
        const title =
          block.title === null ? [] : wrap(block.title, bold, 10, RIGHT - LEFT);
        // An entry that fits on one page is never split across two.
        const height =
          title.length * 14 +
          fields.reduce(
            (sum, cells) =>
              sum +
              Math.max(...cells.map((cell) => cell.lines.length)) * BODY_LINE,
            0,
          );
        if (y - height + BODY_LINE < BOTTOM && height <= capacity) nextPage();
        if (block.title !== null) heading(block.title, 10, 14, 1);
        for (const cells of fields) row(cells, () => undefined);
        y -= 8;
        break;
      }
      case 'paragraph':
        row(
          [
            {
              lines: wrap(block.text, regular, BODY, RIGHT - LEFT),
              x: LEFT,
              font: regular,
              size: BODY,
            },
          ],
          () => undefined,
        );
        break;
      case 'table':
        table(block);
        break;
      default:
        unexpected(block);
    }
  }
  await pdfCheckpoint(signal);
  await document.flush();
  await pdfCheckpoint(signal);
  // Bound the serializer's allocation before save, including object/xref overhead.
  const allocation = document.context
    .enumerateIndirectObjects()
    .reduce((sum, [, object]) => sum + object.sizeInBytes() + 100, 1024);
  if (allocation > MAXIMUM_PDF_BYTES) pdfRefusal('PDF_CONTENT_LIMIT');
  const bytes = await document.save({ useObjectStreams: false });
  await pdfCheckpoint(signal);
  if (!bytes.length || bytes.length > MAXIMUM_PDF_BYTES)
    pdfRefusal('PDF_CONTENT_LIMIT');
  return bytes;
}

/** Every string the renderer may draw, qualified against both fonts first. */
function drawnText(register: RegisterDocument): string {
  const parts = [
    register.title,
    register.notice,
    `${register.page} 0123456789`,
  ];
  for (const block of register.blocks) {
    switch (block.kind) {
      case 'section':
      case 'paragraph':
        parts.push(block.text);
        break;
      case 'entry':
        if (block.title !== null) parts.push(block.title);
        for (const field of block.fields) parts.push(field.label, field.value);
        break;
      case 'table':
        parts.push(...block.columns, ...block.rows.flat());
        break;
      default:
        unexpected(block);
    }
  }
  return parts.join('\n');
}

/**
 * Greedy word wrap of text printed as entered: explicit line breaks are kept,
 * tabs become spaces and a word wider than the line breaks between graphemes.
 */
function wrap(
  text: string,
  font: PDFFont,
  size: number,
  width: number,
): string[] {
  const fits = (value: string) =>
    font.widthOfTextAtSize(value.trimEnd(), size) <= width;
  const lines: string[] = [];
  for (const paragraph of text.replace(/\r\n?/gu, '\n').split('\n')) {
    let line = '';
    for (const word of paragraph.replace(/\t/gu, ' ').split(/(?<= )/u)) {
      if (fits(line + word)) {
        line += word;
        continue;
      }
      if (line) lines.push(line.trimEnd());
      line = '';
      if (fits(word)) {
        line = word;
        continue;
      }
      for (const { segment } of pdfGraphemes.segment(word)) {
        if (!fits(segment)) pdfRefusal('PDF_LAYOUT_UNSUPPORTED');
        if (line && !fits(line + segment)) {
          lines.push(line);
          line = '';
        }
        line += segment;
      }
    }
    lines.push(line.trimEnd());
  }
  return lines;
}

function unexpected(value: never): never {
  throw new Error(`Unexpected register block ${String(value)}`);
}
