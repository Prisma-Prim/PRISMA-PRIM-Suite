import { parse, type DefaultTreeAdapterMap } from 'parse5';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CommercialPdfRenderer } from './commercial-pdf-renderer.js';
import {
  projectCommercialPdfSource,
  type CommercialPdfSource,
} from './commercial-pdf-source.js';
import {
  illustrativePdfInput,
  illustrativePdfSource,
} from './illustrative-offer-pdf.test-fixture.js';
import {
  compactPdfText,
  inspectCommercialPdf,
} from './pdf-inspection.test-support.mjs';

const renderer = new CommercialPdfRenderer();
describe('Closed illustrative Offer v1 PDF', () => {
  it('keeps literal double spaces, eight-column tabs and blank-line vertical spacing in the actual PDF', async () => {
    const source = illustrativePdfSource(
      illustrativePdfInput({ scopeNote: 'A  B\tC\r\n\nD' }),
    );
    const blocks = projectCommercialPdfSource(source);
    const index = blocks.findIndex(
      (block) => block.kind === 'text' && block.text === 'A  B\tC\n\nD',
    );
    expect(index).toBeGreaterThanOrEqual(0);
    const pages = await inspectCommercialPdf(await renderer.render(source));
    const lines = pages
      .flatMap((page) => page.items)
      .filter((item) => item.tag === `SourceBlock${index}` && item.text.trim());
    // PDF.js exposes the separated glyph runs. The qualified Regular font has
    // a 651/2048-em space, independently observed in the frozen font asset.
    expect(lines.map((line) => line.text)).toEqual(['A', 'B', 'C', 'D']);
    expect(lines[1].x - lines[0].x - lines[0].width).toBeCloseTo(
      6.03955078125,
      5,
    );
    expect(lines[2].x - lines[1].x - lines[1].width).toBeCloseTo(
      12.0791015625,
      5,
    );
    expect(lines[0].y).toBe(lines[1].y);
    expect(lines[0].y).toBe(lines[2].y);
    expect(lines[0].y - lines[3].y).toBe(32);
  }, 30_000);
  it('preserves the exact seven-column source, decoded literals and explicit whitespace', async () => {
    const source = illustrativePdfSource();
    const blocks = projectCommercialPdfSource(source);
    expect(blocks).toContainEqual({
      kind: 'text',
      text: 'Scope  with\ttab\n\nexplicit lines',
      heading: false,
      bold: false,
    });
    expect(blocks).toContainEqual({
      kind: 'text',
      text: '<script>literal &amp; once</script>',
      heading: false,
      bold: false,
    });
    expect(blocks.filter((block) => block.kind === 'table')).toEqual([
      {
        kind: 'table',
        rows: [
          [
            'Service name',
            'Quantity',
            'Unit',
            'Unit amount',
            'Line net',
            'Tax label',
            'Line tax',
          ],
          [
            'SERVICE-1 <literal> & once',
            '2.0000',
            'day',
            '100.00 EUR',
            '200.00 EUR',
            'TVA "standard"',
            '40.00 EUR',
          ],
        ],
      },
    ]);
    await assertComplete(source);
  }, 30_000);
  it.each([
    {
      label: '20 rows and maximum notes',
      rows: 20,
      scopeNote: 'S'.repeat(2000),
      commercialConditions: 'C'.repeat(4000),
    },
    {
      label: 'one multi-page row and maximum line breaks',
      rows: 1,
      extremeLineBreaks: true,
      scopeNote: 'S' + '\n'.repeat(1998) + 'E',
      commercialConditions: 'C' + '\n'.repeat(3998) + 'E',
    },
    {
      label: '20 rows and maximum interior line breaks',
      rows: 20,
      extremeLineBreaks: true,
      scopeNote: 'S' + '\n'.repeat(1998) + 'E',
      commercialConditions: 'C' + '\n'.repeat(3998) + 'E',
    },
  ])(
    'conserves all pages/cells for $label',
    async (options) => {
      const input = illustrativePdfInput(options);
      const source = illustrativePdfSource(input);
      const blocks = projectCommercialPdfSource(source);
      const table = blocks.find((block) => block.kind === 'table');
      expect(table?.rows.slice(1)).toEqual(
        input.lines.map((line) => [
          line.serviceName,
          '2.0000',
          line.unit,
          '100.00 EUR',
          '200.00 EUR',
          line.taxLabel,
          '40.00 EUR',
        ]),
      );
      for (const text of [input.scopeNote, input.commercialConditions])
        expect(blocks).toContainEqual({
          kind: 'text',
          text,
          heading: false,
          bold: false,
        });
      const before = structuredClone(source);
      await assertComplete(source);
      expect(source).toEqual(before);
    },
    60_000,
  );
  it.each([
    (html: string) =>
      html.replace('Illustrative Offer</title>', 'Unknown</title>'),
    (html: string) => html.replace('color:#172033}', 'color:#172034}'),
    (html: string) => html.replace('<body>', '<body data-extra="unknown">'),
    (html: string) => html.replace('<header>', '<header>unexpected'),
    (html: string) => html.replace('<header>', '<header>\u00a0'),
    (html: string) =>
      html.replace('Offer details</h2>', 'Unexpected details</h2>'),
    (html: string) => html.replace('<dt>Currency</dt>', '<dt>Unknown</dt>'),
    (html: string) => html.replace('<td>', '<td class="literal">'),
    (html: string) => html.replace('<th scope="col">Line tax</th>', ''),
    (html: string) =>
      html.replace('</tbody>', '<tr><td>extra</td></tr></tbody>'),
    (html: string) => html.replace('<footer>', '<aside>hidden</aside><footer>'),
    (html: string) =>
      html.replace('OFFER_ILLUSTRATIVE v1', 'OFFER_ILLUSTRATIVE v2'),
    (html: string) => html.replace('</html>', '</html><!-- unknown -->'),
  ])(
    'refuses unknown meaningful fixed-source content rather than omitting it',
    (change) => {
      const source = illustrativePdfSource();
      expect(() =>
        projectCommercialPdfSource({ ...source, html: change(source.html) }),
      ).toThrow(
        expect.objectContaining({
          response: { code: 'PDF_SOURCE_UNSUPPORTED' },
        }),
      );
    },
  );
  it.each([
    '中',
    '\u0001',
    '\u202Ereversed',
    'مرحبا',
    'A☀B☀️C',
    'A\u200Bhidden',
  ])('refuses unsupported complete Unicode %j', async (value) => {
    const source = illustrativePdfSource(
      illustrativePdfInput({ scopeNote: value }),
    );
    await expect(renderer.render(source)).rejects.toMatchObject({
      response: { code: 'PDF_TEXT_UNSUPPORTED' },
    });
  });
  it('refuses complete source/page bounds without shortened output', async () => {
    const source = illustrativePdfSource();
    await expect(
      renderer.render({ ...source, html: 'x'.repeat(1024 * 1024 + 1) }),
    ).rejects.toMatchObject({ response: { code: 'PDF_CONTENT_LIMIT' } });
    await expect(
      renderer.render(
        illustrativePdfSource(
          illustrativePdfInput({ scopeNote: 'S' + '\n'.repeat(12_000) + 'E' }),
        ),
      ),
    ).rejects.toMatchObject({ response: { code: 'PDF_CONTENT_LIMIT' } });
  }, 30_000);
});

async function assertComplete(source: CommercialPdfSource) {
  const blocks = projectCommercialPdfSource(source);
  const bytes = await renderer.render(source);
  const pages = await inspectCommercialPdf(bytes);
  const evidence = process.env.COMMERCIAL_PDF_EVIDENCE_DIRECTORY;
  if (evidence) {
    await mkdir(evidence, { recursive: true });
    const path = join(evidence, source.sourceHtmlSha256);
    await writeFile(path + '.pdf', bytes);
    await writeFile(path + '.html', source.html);
    await writeFile(
      path + '.json',
      JSON.stringify({ source, bytes: bytes.length, pages }, null, 2),
    );
  }
  expect(pages.length).toBeGreaterThan(0);
  expect(pages.length).toBeLessThanOrEqual(256);
  const expected = new Map<string, string>();
  for (const [index, block] of blocks.entries()) {
    if (block.kind === 'text') expected.set(`SourceBlock${index}`, block.text);
    else
      for (const [row, cells] of block.rows.entries())
        for (const [cell, text] of cells.entries())
          expected.set(`SourceBlock${index}Row${row}Cell${cell}`, text);
  }
  const actual = new Map<string, string>();
  const lefts = [42, 162, 219, 257, 337, 407, 483];
  const widths = [120, 57, 38, 80, 70, 76, 70.28];
  for (const [index, page] of pages.entries()) {
    expect(page.text).toContain('NON-OFFICIAL PDF COPY');
    expect(page.text).toContain(
      `Offer ${source.reference} / version ${source.versionNumber}`,
    );
    expect(page.text).toContain(`Page ${index + 1}`);
    expect(compactPdfText(page.text)).toContain(source.sourceHtmlSha256);
    for (const item of page.items) {
      if (item.text.trim()) expect(item.height).toBeGreaterThanOrEqual(9);
      if (item.tag.startsWith('SourceBlock'))
        actual.set(item.tag, (actual.get(item.tag) ?? '') + item.text);
      const match = /Cell([0-6])$/u.exec(item.tag);
      if (match && item.text.trim()) {
        const column = Number(match[1]);
        expect(item.x).toBeGreaterThanOrEqual(lefts[column] + 5 - 0.01);
        expect(item.x + item.width).toBeLessThanOrEqual(
          lefts[column] + widths[column] - 5 + 0.01,
        );
      }
    }
  }
  expect([...actual.keys()]).toEqual(
    [...expected.keys()].filter(
      (key) => compactPdfText(expected.get(key) ?? '').length > 0,
    ),
  );
  for (const [tag, text] of expected)
    expect(compactPdfText(actual.get(tag) ?? ''), tag).toBe(
      compactPdfText(text),
    );
  let visible = '';
  function visit(node: DefaultTreeAdapterMap['node'], insideBody = false) {
    const inside = insideBody || node.nodeName === 'body';
    if (inside && node.nodeName === '#text' && 'value' in node)
      visible += node.value;
    if ('childNodes' in node)
      for (const child of node.childNodes) visit(child, inside);
  }
  visit(parse(source.html));
  expect(compactPdfText([...actual.values()].join(''))).toBe(
    compactPdfText(visible),
  );
}
