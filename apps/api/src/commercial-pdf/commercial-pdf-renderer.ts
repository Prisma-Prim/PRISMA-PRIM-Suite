import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import fontkit from '@pdf-lib/fontkit';
import {
  PDFDocument,
  beginMarkedContent,
  endMarkedContent,
  type PDFFont,
  type PDFPage,
  rgb,
} from 'pdf-lib';
import {
  pdfRefusal,
  projectCommercialPdfSource,
  type CommercialPdfSource,
} from './commercial-pdf-source.js';
import {
  PDF_TEXT_SHAPING as shaping,
  pdfCheckpoint as checkpoint,
  pdfGraphemes as segmenter,
  qualifyPdfText,
  readBundledPdfFonts,
} from './bundled-pdf-fonts.js';

const maximumPdfBytes = 16 * 1024 * 1024;
export const COMMERCIAL_PDF_RENDERER = 'COMMERCIAL_MODEL_PDF';
export function commercialPdfRendererCode(
  source: Pick<CommercialPdfSource, 'provenance'>,
) {
  const codes = {
    ILLUSTRATIVE: 'COMMERCIAL_ILLUSTRATIVE_OFFER_PDF',
    COMPANY_MODEL_ESTIMATE: COMMERCIAL_PDF_RENDERER,
    COMPANY_MODEL_OFFER: COMMERCIAL_PDF_RENDERER,
  } satisfies Record<
    CommercialPdfSource['provenance'],
    typeof COMMERCIAL_PDF_RENDERER | 'COMMERCIAL_ILLUSTRATIVE_OFFER_PDF'
  >;
  return codes[source.provenance];
}

@Injectable()
export class CommercialPdfRenderer {
  async render(
    source: CommercialPdfSource,
    signal?: AbortSignal,
  ): Promise<Uint8Array> {
    try {
      return await render(source, signal);
    } catch (error) {
      signal?.throwIfAborted();
      if (error instanceof Error && 'getStatus' in error) throw error;
      throw new ServiceUnavailableException({ code: 'PDF_RENDER_UNAVAILABLE' });
    }
  }
}

async function render(
  source: CommercialPdfSource,
  signal?: AbortSignal,
): Promise<Uint8Array> {
  await checkpoint(signal);
  const blocks = projectCommercialPdfSource(source);
  const illustrative = source.provenance === 'ILLUSTRATIVE';
  const rendererCode = commercialPdfRendererCode(source);
  const provenance = illustrative
    ? [
        'Exact provenance of this non-official PDF copy',
        'Kind: Offer',
        `Workspace: ${source.workspaceId}`,
        `Company: ${source.companyId}`,
        `Opportunity: ${source.opportunityId}`,
        `Document: ${source.rootId}`,
        `Internal reference: ${source.reference}; version: ${source.versionNumber}`,
        `Exact version: ${source.versionId}`,
        `Provenance: ${source.provenance}`,
        `Source language: ${source.language}; created at: ${source.createdAt}`,
        `HTML Template: ${source.sourceRendererCode} / ${source.sourceRendererVersion}`,
        `SHA-256 HTML: ${source.sourceHtmlSha256}`,
        `PDF: ${rendererCode} / 1; DejaVu Sans 2.37 Regular/Bold`,
        'Non-official copy; no official number or legal effect.',
      ]
    : [
        'Proveniența exactă a copiei PDF neoficiale',
        `Tip: ${source.kind === 'offer' ? 'Ofertă' : 'Contract'}`,
        `Workspace: ${source.workspaceId}`,
        `Companie: ${source.companyId}`,
        `Oportunitate: ${source.opportunityId}`,
        `Document: ${source.rootId}`,
        `Referință internă: ${source.reference}; versiune: ${source.versionNumber}`,
        `Versiune exactă: ${source.versionId}`,
        `Proveniență: ${source.provenance}`,
        `Limbă: ${source.language}; creat la: ${source.createdAt}`,
        `HTML: ${source.sourceRendererCode} / ${source.sourceRendererVersion}`,
        `SHA-256 HTML sursă: ${source.sourceHtmlSha256}`,
        `PDF: ${COMMERCIAL_PDF_RENDERER} / 1; DejaVu Sans 2.37 Regular/Bold`,
        'Copie neoficială; nu alocă număr oficial, nu confirmă semnarea sau efectul juridic.',
      ];
  const header = illustrative
    ? 'NON-OFFICIAL PDF COPY — no official number or legal effect'
    : 'COPIE PDF NEOFICIALĂ — fără număr oficial sau efect juridic';
  const identity = illustrative
    ? `Offer ${source.reference} / version ${source.versionNumber}`
    : `${source.kind === 'offer' ? 'Ofertă' : 'Contract'} ${source.reference} / versiunea ${source.versionNumber}`;
  const footer = `SHA-256 HTML: ${source.sourceHtmlSha256}`;
  const text = [
    header,
    identity,
    footer,
    illustrative ? 'Page 256' : 'Pagina 256',
    illustrative ? 'Row 20 — continuation' : 'Rând 18 — continuare',
    ...provenance,
    ...blocks.flatMap((block) =>
      block.kind === 'text' ? [block.text] : block.rows.flat(),
    ),
  ].join('');
  const { regular: regularBytes, bold: boldBytes } =
    await readBundledPdfFonts(signal);
  // Qualify both full document font mappings before creating any page.
  for (const bytes of [regularBytes, boldBytes])
    await qualifyPdfText(bytes, text, signal);
  await checkpoint(signal);
  const document = await PDFDocument.create();
  document.registerFontkit(fontkit);
  document.setCreationDate(new Date(source.createdAt));
  document.setModificationDate(new Date(source.createdAt));
  document.setTitle(
    `${illustrative ? 'Non-official copy' : 'Copie neoficială'} — ${identity}`,
  );
  document.setSubject(`SHA-256 HTML: ${source.sourceHtmlSha256}`);
  document.setProducer(
    `${rendererCode}/1; pdf-lib/1.17.1; fontkit/1.1.1; DejaVu Sans/2.37 Regular/Bold`,
  );
  const regular = await document.embedFont(regularBytes, {
    subset: false,
    features: shaping,
  });
  await checkpoint(signal);
  const bold = await document.embedFont(boldBytes, {
    subset: false,
    features: shaping,
  });
  await checkpoint(signal);
  const left = 42,
    right = 553.28,
    bottom = 76,
    lineHeight = 16;
  let page: PDFPage = document.addPage([595.28, 841.89]);
  let y = 0;
  let sourceTag = 'Pagination';
  function draw(
    text: string,
    x: number,
    baseline: number,
    size: number,
    font: PDFFont,
    tag = sourceTag,
  ) {
    if (
      x < left ||
      x + font.widthOfTextAtSize(text, size) > right + 0.01 ||
      baseline < 32 ||
      baseline + size > 841.89
    )
      pdfRefusal('PDF_LAYOUT_UNSUPPORTED');
    page.pushOperators(beginMarkedContent(tag));
    page.drawText(text, {
      x,
      y: baseline,
      size,
      font,
      color: rgb(0.08, 0.12, 0.2),
    });
    page.pushOperators(endMarkedContent());
  }
  function nextPage() {
    if (document.getPageCount() >= 256) pdfRefusal('PDF_CONTENT_LIMIT');
    page = document.addPage([595.28, 841.89]);
    decoratePage();
  }
  function decoratePage() {
    y = 755;
    draw(header, left, 808, 9, bold, 'Pagination');
    draw(identity, left, 792, 9, bold, 'Pagination');
    draw(footer, left, 49, 9, regular, 'Pagination');
    draw(
      `${illustrative ? 'Page' : 'Pagina'} ${document.getPageCount()}`,
      left,
      33,
      9,
      regular,
      'Pagination',
    );
  }
  function ensure(height: number) {
    if (y - height < bottom) nextPage();
  }
  function paragraph(text: string, font: PDFFont, heading = false) {
    const lines = wrapPdfText(text, font, heading ? 11 : 9.5, right - left);
    if (heading) ensure(lineHeight * (lines.length + 1) + 5);
    for (const line of lines) {
      ensure(lineHeight);
      draw(line, left, y, heading ? 11 : 9.5, font);
      y -= lineHeight;
    }
    y -= 5;
  }
  decoratePage();
  for (const [blockIndex, block] of blocks.entries()) {
    await checkpoint(signal);
    sourceTag = `SourceBlock${blockIndex}`;
    if (block.kind === 'text') {
      paragraph(block.text, block.bold ? bold : regular, block.heading);
      continue;
    }
    const widths = illustrative
      ? [120, 57, 38, 80, 70, 76, 70.28]
      : [150, 180, 181.28];
    let columnX = left;
    const xs = widths.map((width) => {
      const x = columnX;
      columnX += width;
      return x;
    });
    const headings = block.rows[0];
    if (!headings) pdfRefusal('PDF_SOURCE_UNSUPPORTED');
    const tableHeadings = headings;
    let tableHeaderCount = 0;
    function tableHead() {
      const lines = tableHeadings.map((text, c) =>
        wrapPdfText(text, bold, 9.5, widths[c] - 10),
      );
      const height =
        Math.max(...lines.map((cell) => cell.length)) * lineHeight + 10;
      ensure(height + lineHeight + 10);
      for (const [c, cell] of lines.entries())
        for (const [i, line] of cell.entries())
          draw(
            line,
            xs[c] + 5,
            y - i * lineHeight,
            9.5,
            bold,
            tableHeaderCount === 0
              ? `SourceBlock${blockIndex}Row0Cell${c}`
              : `PaginationTableHeader${blockIndex}Cell${c}`,
          );
      y -= height;
      tableHeaderCount += 1;
    }
    tableHead();
    for (const [index, row] of block.rows.slice(1).entries()) {
      await checkpoint(signal);
      const lines = row.map((text, c) =>
        wrapPdfText(text, regular, 9.5, widths[c] - 10),
      );
      const count = Math.max(...lines.map((cell) => cell.length));
      let cursor = 0;
      while (cursor < count) {
        await checkpoint(signal);
        let room = Math.floor((y - bottom - 10) / lineHeight);
        if (room < 1) {
          nextPage();
          tableHead();
          room = Math.floor((y - bottom - 10) / lineHeight);
        }
        const taken = Math.min(room, count - cursor);
        for (const [c, cell] of lines.entries()) {
          for (
            let i = cursor;
            i < Math.min(cursor + taken, cell.length);
            i += 1
          )
            draw(
              cell[i],
              xs[c] + 5,
              y - (i - cursor) * lineHeight,
              9.5,
              regular,
              `SourceBlock${blockIndex}Row${index + 1}Cell${c}`,
            );
          page.drawRectangle({
            x: xs[c],
            y: y - taken * lineHeight + 3,
            width: widths[c],
            height: taken * lineHeight + 7,
            borderWidth: 0.3,
            borderColor: rgb(0.6, 0.6, 0.6),
          });
        }
        y -= taken * lineHeight + 10;
        cursor += taken;
        if (cursor < count) {
          nextPage();
          tableHead();
          draw(
            illustrative
              ? `Row ${index + 1} — continuation`
              : `Rând ${index + 1} — continuare`,
            left,
            y,
            9,
            bold,
            'PaginationRowContinuation',
          );
          y -= lineHeight;
        }
      }
    }
  }
  sourceTag = 'PdfProvenance';
  for (const [index, text] of provenance.entries())
    paragraph(text, index === 0 ? bold : regular, index === 0);
  await checkpoint(signal);
  await document.flush();
  await checkpoint(signal);
  // Bound the serializer's allocation before save, including object/xref overhead.
  const allocation = document.context
    .enumerateIndirectObjects()
    .reduce((sum, [, object]) => sum + object.sizeInBytes() + 100, 1024);
  if (allocation > maximumPdfBytes) pdfRefusal('PDF_CONTENT_LIMIT');
  const bytes = await document.save({ useObjectStreams: false });
  await checkpoint(signal);
  if (!bytes.length || bytes.length > maximumPdfBytes)
    pdfRefusal('PDF_CONTENT_LIMIT');
  return bytes;
}

/** Exact decoded strings enter layout unchanged; only CR/LF/tab layout is projected. */
export function wrapPdfText(
  text: string,
  font: PDFFont,
  size: number,
  width: number,
): string[] {
  const lines: string[] = [];
  for (const paragraph of text.replace(/\r\n?/gu, '\n').split('\n')) {
    let line = '',
      column = 0;
    for (const { segment } of segmenter.segment(paragraph)) {
      const expanded =
        segment === '\t' ? ' '.repeat(8 - (column % 8)) : segment;
      for (const { segment: glyph } of segmenter.segment(expanded)) {
        if (font.widthOfTextAtSize(glyph, size) > width)
          pdfRefusal('PDF_LAYOUT_UNSUPPORTED');
        if (line && font.widthOfTextAtSize(line + glyph, size) > width) {
          lines.push(line);
          line = '';
        }
        line += glyph;
      }
      column += segment === '\t' ? expanded.length : 1;
    }
    lines.push(line);
  }
  return lines;
}
