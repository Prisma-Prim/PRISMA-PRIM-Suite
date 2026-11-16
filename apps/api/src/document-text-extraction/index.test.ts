import { describe, expect, it } from 'vitest';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { strToU8, zipSync } from 'fflate';
import { createHash } from 'node:crypto';
import { extractDocumentText } from './index.js';

const wordNs = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
function docx(parts: Record<string, string>) {
  const relationshipNs =
    'http://schemas.openxmlformats.org/package/2006/relationships';
  const linked = Object.keys(parts).filter((name) =>
    /^word\/(header[0-9]+|footer[0-9]+|footnotes|endnotes|comments)\.xml$/.test(
      name,
    ),
  );
  const links = linked
    .map((name, index) => {
      const target = name.slice(5);
      const type = target.replace(/[0-9]*\.xml$/, '');
      return `<Relationship Id="r${index}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/${type}" Target="${target}"/>`;
    })
    .join('');
  const types = linked
    .map((name) => {
      const type = name.slice(5).replace(/[0-9]*\.xml$/, '');
      return `<Override PartName="/${name}" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.${type}+xml"/>`;
    })
    .join('');
  const all = {
    '[Content_Types].xml': `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>${types}</Types>`,
    '_rels/.rels': `<Relationships xmlns="${relationshipNs}"><Relationship Id="root" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`,
    'word/_rels/document.xml.rels': `<Relationships xmlns="${relationshipNs}">${links}</Relationships>`,
    ...parts,
  };
  return zipSync(
    Object.fromEntries(
      Object.entries(all).map(([name, xml]) => [name, strToU8(xml)]),
    ),
  );
}
const xml = (body: string) =>
  `<?xml version="1.0"?><w:document xmlns:w="${wordNs}"><w:body>${body}</w:body></w:document>`;

describe('native document text extraction', () => {
  it('extracts each PDF page with exact stable page anchors and hashes', async () => {
    const pdf = await PDFDocument.create();
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    pdf.addPage().drawText('First page', { font });
    pdf.addPage().drawText('Second page', { font });
    const result = await extractDocumentText({
      kind: 'pdf',
      bytes: await pdf.save(),
    });
    expect(result.state).toBe('complete');
    expect(
      result.passages.map(({ locator, text, page }) => ({
        locator,
        text,
        page,
      })),
    ).toEqual([
      { locator: 'page:1', text: 'First page', page: 1 },
      { locator: 'page:2', text: 'Second page', page: 2 },
    ]);
    expect(result.passages[0]?.sha256).toBe(
      createHash('sha256').update('First page').digest('hex'),
    );
    expect(result.unitsTotal).toBe(2);
    expect(result.unitsReadable).toBe(2);
  });

  it('reports a page without text as partial rather than complete', async () => {
    const pdf = await PDFDocument.create();
    pdf.addPage().drawText('Readable');
    pdf.addPage();
    const result = await extractDocumentText({
      kind: 'pdf',
      bytes: await pdf.save(),
    });
    expect(result.state).toBe('partial');
    expect(result.issues).toContainEqual({
      code: 'no_native_text',
      locator: 'page:2',
    });
    expect(result.unitsReadable).toBe(1);
  });

  it('flags image content on a page that also has native text', async () => {
    const pdf = await PDFDocument.create();
    const image = await pdf.embedPng(
      Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/aN8AAAAASUVORK5CYII=',
        'base64',
      ),
    );
    const page = pdf.addPage();
    page.drawText('Native text');
    page.drawImage(image, { x: 50, y: 50, width: 20, height: 20 });
    const result = await extractDocumentText({
      kind: 'pdf',
      bytes: await pdf.save(),
    });
    expect(result.state).toBe('partial');
    expect(result.issues).toContainEqual({
      code: 'image_content',
      locator: 'page:1',
    });
  });

  it('reports corrupt and empty text PDFs without inventing content', async () => {
    expect(
      (
        await extractDocumentText({
          kind: 'pdf',
          bytes: new Uint8Array([1, 2, 3]),
        })
      ).state,
    ).toBe('failed');
    const pdf = await PDFDocument.create();
    pdf.addPage();
    const result = await extractDocumentText({
      kind: 'pdf',
      bytes: await pdf.save(),
    });
    expect(result.state).toBe('unreadable');
    expect(result.passages).toEqual([]);
  });

  it('reads DOCX paragraphs, tables, headers, footnotes, entities and breaks in order', async () => {
    const bytes = docx({
      'word/document.xml': xml(
        '<w:p><w:r><w:t>Bonjour &amp; café</w:t><w:tab/><w:t>școală</w:t><w:br/><w:t>Привет</w:t></w:r></w:p><w:tbl><w:tr><w:tc><w:p><w:r><w:t>&lt;script&gt;</w:t></w:r></w:p></w:tc></w:tr></w:tbl>',
      ),
      'word/header1.xml': `<w:hdr xmlns:w="${wordNs}"><w:p><w:r><w:t>Header</w:t></w:r></w:p></w:hdr>`,
      'word/footnotes.xml': `<w:footnotes xmlns:w="${wordNs}"><w:footnote w:id="1"><w:p><w:r><w:t>Note</w:t></w:r></w:p></w:footnote></w:footnotes>`,
    });
    const result = await extractDocumentText({ kind: 'docx', bytes });
    expect(result.state).toBe('complete');
    expect(result.passages.map(({ text }) => text)).toEqual([
      'Bonjour & café\tșcoală\nПривет',
      '<script>',
      'Note',
      'Header',
    ]);
    expect(result.passages.every(({ page }) => page === null)).toBe(true);
    expect(new Set(result.passages.map(({ locator }) => locator)).size).toBe(4);
  });

  it('rejects malformed and entity-bearing DOCX content without resolving external entities', async () => {
    const bytes = docx({
      'word/document.xml': `<!DOCTYPE w:document [<!ENTITY x SYSTEM "file:///etc/passwd">]>${xml('<w:p><w:r><w:t>&x;</w:t></w:r></w:p>')}`,
    });
    const result = await extractDocumentText({ kind: 'docx', bytes });
    expect(result.state).toBe('failed');
    expect(result.passages).toEqual([]);
    expect(
      (
        await extractDocumentText({
          kind: 'docx',
          bytes: new Uint8Array([1, 2, 3]),
        })
      ).state,
    ).toBe('failed');
  });
});

describe('extraction bounds', () => {
  it('reports a page limit without silently omitting remaining pages', async () => {
    const pdf = await PDFDocument.create();
    for (let i = 0; i < 201; i++) pdf.addPage();
    const result = await extractDocumentText({
      kind: 'pdf',
      bytes: await pdf.save(),
    });
    expect(result.unitsTotal).toBe(201);
    expect(result.issues).toContainEqual({ code: 'page_limit', locator: null });
  }, 20000);
  it('reports a text limit even when the first paragraph exceeds it', async () => {
    const bytes = docx({
      'word/document.xml': xml(
        `<w:p><w:r><w:t>${'a'.repeat(2 * 1024 * 1024 + 1)}</w:t></w:r></w:p>`,
      ),
    });
    const result = await extractDocumentText({ kind: 'docx', bytes });
    expect(result.state).toBe('partial');
    expect(result.issues).toContainEqual({
      code: 'text_limit',
      locator: 'word/document.xml#paragraph:1',
    });
  }, 20000);
  it('rejects oversized sources and compressed XML beyond the limit', async () => {
    expect(
      (
        await extractDocumentText({
          kind: 'pdf',
          bytes: new Uint8Array(5 * 1024 * 1024 + 1),
        })
      ).issues[0]?.code,
    ).toBe('source_size_limit');
    const bytes = docx({
      'word/document.xml': xml(
        `<w:p><w:r><w:t>${'a'.repeat(8 * 1024 * 1024)}</w:t></w:r></w:p>`,
      ),
    });
    expect((await extractDocumentText({ kind: 'docx', bytes })).state).toBe(
      'failed',
    );
  }, 20000);
});

describe('hostile OOXML packages', () => {
  function centralEntry(bytes: Uint8Array, name: string) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    for (let offset = 0; offset + 46 < bytes.length; offset++) {
      if (view.getUint32(offset, true) !== 0x02014b50) continue;
      const length = view.getUint16(offset + 28, true);
      if (
        new TextDecoder().decode(
          bytes.subarray(offset + 46, offset + 46 + length),
        ) === name
      )
        return offset;
    }
    throw new Error('Fixture central entry missing');
  }
  const document = xml('<w:p><w:r><w:t>123456789</w:t></w:r></w:p>');
  it('refuses forged checksums and declared lengths', async () => {
    for (const field of [16, 24]) {
      const bytes = docx({ 'word/document.xml': document });
      const entry = centralEntry(bytes, 'word/document.xml');
      const view = new DataView(
        bytes.buffer,
        bytes.byteOffset,
        bytes.byteLength,
      );
      view.setUint32(
        entry + field,
        view.getUint32(entry + field, true) - 1,
        true,
      );
      expect((await extractDocumentText({ kind: 'docx', bytes })).state).toBe(
        'failed',
      );
    }
  });
  it('refuses duplicate and traversal entry names', async () => {
    const duplicate = docx({ 'word/document.xml': document, aa: 'a', bb: 'b' });
    const second = centralEntry(duplicate, 'bb');
    duplicate.set(strToU8('aa'), second + 46);
    expect(
      (await extractDocumentText({ kind: 'docx', bytes: duplicate })).state,
    ).toBe('failed');
    const traversal = docx({ 'word/document.xml': document, '../bad': 'a' });
    expect(
      (await extractDocumentText({ kind: 'docx', bytes: traversal })).state,
    ).toBe('failed');
  });
  it('refuses missing package relationships and flags external relationships', async () => {
    const missing = docx({
      'word/document.xml': document,
      '_rels/.rels':
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>',
    });
    expect(
      (await extractDocumentText({ kind: 'docx', bytes: missing })).state,
    ).toBe('failed');
    const external = docx({
      'word/document.xml': document,
      'word/_rels/document.xml.rels':
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="r" Type="https://example.com/ref" Target="https://example.com" TargetMode="External"/></Relationships>',
    });
    const result = await extractDocumentText({ kind: 'docx', bytes: external });
    expect(result.state).toBe('partial');
    expect(result.issues).toContainEqual({
      code: 'external_relationship',
      locator: null,
    });
  });
});

describe('DOCX table rows', () => {
  it('preserves field labels with adjacent cell values and multiple paragraphs', async () => {
    const text = xml(
      '<w:p><w:r><w:t>Introduction</w:t></w:r></w:p><w:tbl><w:tr><w:tc><w:p><w:r><w:t>Cod fiscal</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>0012345678</w:t></w:r></w:p></w:tc></w:tr><w:tr><w:tc><w:p><w:r><w:t>Address</w:t></w:r></w:p><w:p><w:r><w:t>Line two</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Paris</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>France</w:t></w:r></w:p></w:tc></w:tr></w:tbl>',
    );
    const result = await extractDocumentText({
      kind: 'docx',
      bytes: docx({ 'word/document.xml': text }),
    });
    expect(result.state).toBe('complete');
    expect(
      result.passages.map(({ locator, text }) => ({ locator, text })),
    ).toEqual([
      { locator: 'word/document.xml#paragraph:1', text: 'Introduction' },
      {
        locator: 'word/document.xml#table:1/row:1',
        text: 'Cod fiscal\t0012345678',
      },
      {
        locator: 'word/document.xml#table:1/row:2',
        text: 'Address\nLine two\tParis\tFrance',
      },
    ]);
  });
  it('marks nested tables partial while preserving their separate rows', async () => {
    const text = xml(
      '<w:tbl><w:tr><w:tc><w:p><w:r><w:t>Outer</w:t></w:r></w:p><w:tbl><w:tr><w:tc><w:p><w:r><w:t>Inner</w:t></w:r></w:p></w:tc></w:tr></w:tbl></w:tc></w:tr></w:tbl>',
    );
    const result = await extractDocumentText({
      kind: 'docx',
      bytes: docx({ 'word/document.xml': text }),
    });
    expect(result.state).toBe('partial');
    expect(result.issues).toContainEqual({
      code: 'nested_table',
      locator: 'word/document.xml#table:2',
    });
    expect(
      result.passages.map(({ locator, text }) => ({ locator, text })),
    ).toEqual([
      { locator: 'word/document.xml#table:2/row:1', text: 'Inner' },
      { locator: 'word/document.xml#table:1/row:1', text: 'Outer' },
    ]);
  });
});

describe('DOCX table ambiguity', () => {
  it('marks merged cells and literal in-cell tabs as partial', async () => {
    const text = xml(
      '<w:tbl><w:tr><w:tc><w:tcPr><w:gridSpan w:val="2"/></w:tcPr><w:p><w:r><w:t>Label</w:t><w:tab/><w:t>fragment</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Value</w:t></w:r></w:p></w:tc></w:tr></w:tbl>',
    );
    const result = await extractDocumentText({
      kind: 'docx',
      bytes: docx({ 'word/document.xml': text }),
    });
    expect(result.state).toBe('partial');
    expect(result.issues).toContainEqual({
      code: 'merged_table_cell',
      locator: 'word/document.xml#table:1/row:1',
    });
    expect(result.issues).toContainEqual({
      code: 'table_cell_tab',
      locator: 'word/document.xml#table:1/row:1',
    });
  });
});

describe('parser time budget', () => {
  it.each([0, -1, 20001, 1.5, Infinity, NaN])(
    'refuses invalid or exhausted deadline %s without starting a parser',
    async (timeoutMs) => {
      const result = await extractDocumentText({
        kind: 'pdf',
        bytes: new Uint8Array([1]),
        timeoutMs,
      });
      expect(result.state).toBe('failed');
      expect(result.issues).toEqual([{ code: 'time_limit', locator: null }]);
    },
  );
});
