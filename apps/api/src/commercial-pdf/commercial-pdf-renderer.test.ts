import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { CommercialPdfRenderer } from './commercial-pdf-renderer.js';
import { projectCommercialPdfSource } from './commercial-pdf-source.js';
import { syntheticPdfSource } from './commercial-pdf.test-fixture.js';
import {
  inspectCommercialPdf,
  compactPdfText,
} from './pdf-inspection.test-support.mjs';
import { parse, type DefaultTreeAdapterMap } from 'parse5';

const renderer = new CommercialPdfRenderer();
describe('Bounded exact commercial PDF projection', () => {
  it('conserves every decoded visible source node, literal whitespace/codepoints and all ordered cells', async () => {
    const literal =
      ' \tȘț a\u0306 e\u0301 ☀️\n\nРусский Français English\n<script>literal &amp; once</script> ';
    const source = syntheticPdfSource(literal),
      blocks = projectCommercialPdfSource(source);
    expect(blocks).toContainEqual({
      kind: 'text',
      text: literal,
      heading: false,
      bold: false,
    });
    expect(blocks.filter((block) => block.kind === 'table')).toHaveLength(1);
    const table = blocks.find((block) => block.kind === 'table');
    expect(table?.rows).toHaveLength(19);
    expect(table?.rows.at(-1)).toEqual([
      'Etapă sintetică 18',
      'Activitate planificată 18',
      'Rezultat intenționat 18',
    ]);
    const document = parse(source.html);
    let bodyText = '';
    function visit(node: DefaultTreeAdapterMap['node'], inside: boolean) {
      const body = inside || node.nodeName === 'body';
      if (body && node.nodeName === '#text' && 'value' in node)
        bodyText += node.value;
      if ('childNodes' in node)
        for (const child of node.childNodes) visit(child, body);
    }
    visit(document, false);
    expect(
      compactPdfText(
        blocks
          .flatMap((block) =>
            block.kind === 'text' ? [block.text] : block.rows.flat(),
          )
          .join(''),
      ),
    ).toBe(compactPdfText(bodyText));
    const bytes = await renderer.render(source),
      pages = await inspectCommercialPdf(bytes);
    const extracted = pages
      .flatMap((page) =>
        page.items
          .filter((item) => item.tag.startsWith('SourceBlock'))
          .map((item) => item.text),
      )
      .join('');
    expect(compactPdfText(extracted)).toContain(compactPdfText(literal));
    expect(createHash('sha256').update(source.html).digest('hex')).toBe(
      source.sourceHtmlSha256,
    );
  }, 30_000);
  it.each([
    '中',
    '\u0001',
    '\u202Ereversed',
    'مرحبا',
    'A☀B☀️C',
    'A\u200Bhidden',
  ])(
    'refuses unsupported complete text %j without altering its HTML fallback',
    async (value) => {
      const source = syntheticPdfSource(value),
        before = structuredClone(source);
      await expect(renderer.render(source)).rejects.toMatchObject({
        response: { code: 'PDF_TEXT_UNSUPPORTED' },
        status: 422,
      });
      expect(source).toEqual(before);
    },
  );
  it.each([
    (html: string) =>
      html.replace(
        '<body>',
        '<body><img src="https://example.invalid/remote">',
      ),
    (html: string) =>
      html.replace('<p class="literal">', '<p class="literal" hidden>'),
    (html: string) =>
      html.replace(
        '<h2 id="section-introduction">',
        '<aside><h2 id="section-introduction">',
      ),
    (html: string) =>
      html.replace(
        '<meta charset="utf-8">',
        '<meta charset="utf-8"><script>alert(1)</script>',
      ),
    (html: string) =>
      html.replace(
        'Profil demonstrativ</p>',
        'Profil demonstrativ</p><p>Unexpected body</p>',
      ),
  ])(
    'refuses unexpected meaningful source tree/attributes/resources',
    (change) => {
      const source = syntheticPdfSource();
      source.html = change(source.html);
      expect(() => projectCommercialPdfSource(source)).toThrow(
        expect.objectContaining({
          response: { code: 'PDF_SOURCE_UNSUPPORTED' },
        }),
      );
    },
  );
  it('checks the 1MiB source bound before parsing or allocating pages', async () => {
    const source = syntheticPdfSource();
    source.html = 'x'.repeat(1024 * 1024 + 1);
    await expect(renderer.render(source)).rejects.toMatchObject({
      response: { code: 'PDF_CONTENT_LIMIT' },
    });
  });
  it('refuses a valid complete source whose literal blank lines exceed 256 pages', async () => {
    const source = syntheticPdfSource('S\n'.repeat(1800));
    source.html = source.html
      .replaceAll('Profil demonstrativ', 'S\n'.repeat(1800))
      .replaceAll('Domeniu demonstrativ', 'S\n'.repeat(1800))
      .replaceAll('Obiective declarate pentru exemplu', 'S\n'.repeat(1800))
      .replaceAll(
        'Date sintetice verificate de autorul exemplului',
        'S\n'.repeat(1800),
      )
      .replaceAll('Metodologie demonstrativă', 'S\n'.repeat(1800))
      .replaceAll('Rezultate planificate demonstrative', 'S\n'.repeat(1800))
      .replaceAll('Condiții demonstrative de realizare', 'S\n'.repeat(1800));
    await expect(renderer.render(source)).rejects.toMatchObject({
      response: { code: 'PDF_CONTENT_LIMIT' },
    });
  }, 30_000);
});
