import { Worker } from 'node:worker_threads';
import { createHash } from 'node:crypto';

export interface TextPassage {
  locator: string;
  text: string;
  sha256: string;
  page: number | null;
}
export interface TextExtraction {
  state: 'complete' | 'partial' | 'unreadable' | 'failed';
  parserVersion: string;
  passages: TextPassage[];
  issues: { code: string; locator: string | null }[];
  unitsTotal: number;
  unitsReadable: number;
}
export const DOCUMENT_TEXT_PARSER_VERSION = 'native-text.v2';
const parserVersion = DOCUMENT_TEXT_PARSER_VERSION;
function failure(code: string): TextExtraction {
  return {
    state: 'failed',
    parserVersion,
    passages: [],
    issues: [{ code, locator: null }],
    unitsTotal: 0,
    unitsReadable: 0,
  };
}
/** Extract native text in a worker that is actually terminated at its deadline. */
export async function extractDocumentText(input: {
  bytes: Uint8Array;
  kind: 'pdf' | 'docx';
  timeoutMs?: number;
}): Promise<TextExtraction> {
  const timeoutMs = input.timeoutMs ?? 20_000;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 20_000)
    return failure('time_limit');
  if (!input.bytes.byteLength || input.bytes.byteLength > 5 * 1024 * 1024)
    return failure('source_size_limit');
  const worker = new Worker(workerSource, {
    eval: true,
    workerData: {
      bytes: new Uint8Array(input.bytes),
      kind: input.kind,
      parserVersion,
      pdf: require.resolve('pdfjs-dist/legacy/build/pdf.mjs'),
      fflate: require.resolve('fflate'),
      saxes: require.resolve('saxes'),
    },
    resourceLimits: {
      maxOldGenerationSizeMb: 256,
      maxYoungGenerationSizeMb: 32,
      stackSizeMb: 4,
    },
  });
  return new Promise((resolve) => {
    let settled = false;
    const finish = (result: TextExtraction) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      void worker.terminate();
      resolve(result);
    };
    const timer = setTimeout(() => finish(failure('time_limit')), timeoutMs);
    worker.once('message', (result: unknown) =>
      finish(isExtraction(result) ? result : failure('parser_error')),
    );
    worker.once('error', () => finish(failure('parser_error')));
    worker.once('exit', () => finish(failure('parser_error')));
  });
}
function isExtraction(value: unknown): value is TextExtraction {
  if (
    !value ||
    typeof value !== 'object' ||
    !('state' in value) ||
    !('parserVersion' in value) ||
    !('passages' in value) ||
    !('issues' in value) ||
    !('unitsTotal' in value) ||
    !('unitsReadable' in value)
  )
    return false;
  if (
    value.state !== 'complete' &&
    value.state !== 'partial' &&
    value.state !== 'unreadable' &&
    value.state !== 'failed'
  )
    return false;
  if (
    value.parserVersion !== parserVersion ||
    !Array.isArray(value.passages) ||
    !Array.isArray(value.issues) ||
    typeof value.unitsTotal !== 'number' ||
    !Number.isSafeInteger(value.unitsTotal) ||
    value.unitsTotal < 0 ||
    typeof value.unitsReadable !== 'number' ||
    !Number.isSafeInteger(value.unitsReadable) ||
    value.unitsReadable < 0 ||
    value.unitsReadable > value.unitsTotal
  )
    return false;
  let total = 0;
  for (const passage of value.passages) {
    if (
      !passage ||
      typeof passage !== 'object' ||
      typeof passage.locator !== 'string' ||
      passage.locator.length > 200 ||
      typeof passage.text !== 'string' ||
      typeof passage.sha256 !== 'string' ||
      (passage.page !== null &&
        (typeof passage.page !== 'number' ||
          !Number.isSafeInteger(passage.page) ||
          passage.page < 1)) ||
      createHash('sha256').update(passage.text).digest('hex') !== passage.sha256
    )
      return false;
    total += Buffer.byteLength(passage.text);
    if (total > 2 * 1024 * 1024) return false;
  }
  return value.issues.every(
    (issue: unknown) =>
      issue !== null &&
      typeof issue === 'object' &&
      'code' in issue &&
      typeof issue.code === 'string' &&
      issue.code.length <= 100 &&
      'locator' in issue &&
      (issue.locator === null ||
        (typeof issue.locator === 'string' && issue.locator.length <= 200)),
  );
}
// Self-contained worker runs identically from compiled NestJS and test runners.
const workerSource = String.raw`
const { parentPort, workerData } = require('node:worker_threads');
const { createHash } = require('node:crypto');
const { pathToFileURL } = require('node:url');
const MAX_TEXT = 2 * 1024 * 1024, MAX_XML = 8 * 1024 * 1024, MAX_ARCHIVE_XML = 16 * 1024 * 1024, MAX_ENTRIES = 500;
const result = { state: 'complete', parserVersion: workerData.parserVersion, passages: [], issues: [], unitsTotal: 0, unitsReadable: 0 };
let textBytes = 0, truncated = false;
function issue(code, locator = null) { result.issues.push({ code, locator }); }
function add(locator, text, page) {
  if (!text.trim()) return false;
  const encoded = Buffer.from(text, 'utf8');
  if (textBytes + encoded.length > MAX_TEXT) { if (!truncated) issue('text_limit', locator); truncated = true; return false; }
  textBytes += encoded.length;
  result.passages.push({ locator, text, page, sha256: createHash('sha256').update(text).digest('hex') });
  return true;
}
function finish() {
  result.state = result.passages.length === 0 && !truncated ? 'unreadable' : result.issues.length ? 'partial' : 'complete';
  parentPort.postMessage(result);
}
function pdfText(items, locator) {
  const textItems = items.filter(item => 'str' in item && item.str.length);
  if (textItems.some(item => !Array.isArray(item.transform) || item.transform.length !== 6 || ![item.width, item.height, ...item.transform].every(Number.isFinite) || Math.abs(item.transform[1]) > 0.001 || item.transform[0] <= 0 || item.transform[3] <= 0 || item.dir === 'rtl')) {
    issue('complex_layout', locator);
    return textItems.map(item => item.str + (item.hasEOL ? '\n' : '')).join('');
  }
  const rows = [];
  for (const item of [...textItems].sort((a,b) => b.transform[5] - a.transform[5] || a.transform[4] - b.transform[4])) {
    const height = Math.max(1, Math.abs(item.transform[3]), item.height);
    const row = rows[rows.length - 1];
    if (row && Math.abs(row.y - item.transform[5]) <= Math.min(row.height, height) * 0.25) row.items.push(item);
    else rows.push({ y: item.transform[5], height, items: [item] });
  }
  let overlapping = false;
  const lines = rows.map(row => {
    let text = '', right = null, valueX = null;
    for (const item of row.items.sort((a,b) => a.transform[4] - b.transform[4])) {
      const x = item.transform[4], height = Math.max(1, Math.abs(item.transform[3]), item.height);
      const gap = right === null ? 0 : x - right;
      if (gap > Math.max(12, height)) { text += '\t'; valueX ??= x; }
      else if (gap > height * 0.15 && text && !/\s$/.test(text) && !/^\s/.test(item.str)) text += ' ';
      if (right !== null && gap < -Math.max(1, height * 0.25) && item.str.trim()) overlapping = true;
      if (!item.str.trim() && item.width > Math.max(12, height)) { text += '\t'; valueX ??= x + item.width; }
      else text += item.str;
      right = Math.max(right ?? x, x + item.width);
    }
    return { text, valueX, x: row.items[0].transform[4], y: row.y, height: row.height };
  });
  if (overlapping) issue('overlapping_text', locator);
  if (lines.some((line, index) => {
    const previous = lines[index - 1];
    return previous && previous.valueX !== null && line.valueX === null && Math.abs(line.x - previous.valueX) <= Math.min(line.height, previous.height) * 0.5 && previous.y - line.y <= Math.max(line.height, previous.height) * 2.5;
  })) issue('table_continuation', locator);
  return lines.map(line => line.text).join('\n');
}
async function pdf() {
  const { getDocument, OPS } = await import(pathToFileURL(workerData.pdf).href);
  const task = getDocument({ data: new Uint8Array(workerData.bytes), useSystemFonts: false, disableFontFace: true, isEvalSupported: false, useWorkerFetch: false });
  try {
    const document = await task.promise;
    result.unitsTotal = document.numPages;
    if (document.numPages > 200) issue('page_limit');
    for (let n = 1; n <= Math.min(document.numPages, 200) && !truncated; n++) {
      const locator = 'page:' + n;
      let page;
      try {
        page = await document.getPage(n);
        const content = await page.getTextContent({ disableNormalization: true });
        const operators = await page.getOperatorList();
        if (operators.fnArray.some(op => op === OPS.paintImageXObject || op === OPS.paintInlineImageXObject || op === OPS.paintImageMaskXObject || op === OPS.paintJpegXObject)) issue('image_content', locator);
        if (operators.fnArray.some(op => op === OPS.constructPath || op === OPS.rawFillPath)) issue('vector_content', locator);
        const text = pdfText(content.items, locator);
        if (add(locator, text, n)) result.unitsReadable++;
        else if (!text.trim()) issue('no_native_text', locator);
      } catch { issue('page_unreadable', locator); }
      finally { if (page) page.cleanup(); }
    }
  } finally { await task.destroy(); }
  finish();
}
function archiveDirectory(data) {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const u16 = offset => view.getUint16(offset, true), u32 = offset => view.getUint32(offset, true);
  let end = data.length - 22;
  while (end >= Math.max(0, data.length - 65557) && u32(end) !== 0x06054b50) end--;
  if (end < 0 || end + 22 + u16(end + 20) !== data.length || u16(end + 4) || u16(end + 6) || u16(end + 8) !== u16(end + 10)) throw Error('invalid archive');
  const count = u16(end + 10), size = u32(end + 12), start = u32(end + 16);
  if (count > MAX_ENTRIES || start + size !== end) throw Error('invalid directory');
  const rows = new Map();
  let offset = start;
  const decode = new TextDecoder('utf-8', { fatal: true });
  for (let i = 0; i < count; i++) {
    if (offset + 46 > end || u32(offset) !== 0x02014b50) throw Error('invalid entry');
    const flags = u16(offset + 8), compression = u16(offset + 10), crc = u32(offset + 16), compressed = u32(offset + 20), original = u32(offset + 24);
    const nameLength = u16(offset + 28), extraLength = u16(offset + 30), commentLength = u16(offset + 32), local = u32(offset + 42);
    const next = offset + 46 + nameLength + extraLength + commentLength;
    if (next > end || flags & 1 || flags & 64 || compressed === 0xffffffff || original === 0xffffffff || local === 0xffffffff) throw Error('unsupported archive');
    const name = decode.decode(data.subarray(offset + 46, offset + 46 + nameLength));
    if (!name || name.startsWith('/') || name.includes('\\') || name.split('/').some(p => p === '..' || p === '.') || rows.has(name)) throw Error('unsafe entry');
    if (local + 30 > start || u32(local) !== 0x04034b50 || u16(local + 6) !== flags || u16(local + 8) !== compression) throw Error('invalid local entry');
    const localNameLength = u16(local + 26), localExtra = u16(local + 28);
    if (local + 30 + localNameLength + localExtra + compressed > start || decode.decode(data.subarray(local + 30, local + 30 + localNameLength)) !== name) throw Error('invalid local entry');
    rows.set(name, { crc, original });
    offset = next;
  }
  if (offset !== end) throw Error('invalid directory');
  return rows;
}
function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function docx() {
  if (crc32(Buffer.from('123456789')) !== 0xcbf43926) throw Error('CRC implementation error');
  const { unzipSync, Unzip, UnzipInflate } = require(workerData.fflate);
  const { SaxesParser } = require(workerData.saxes);
  const decoder = new TextDecoder('utf-8', { fatal: true });
  const directory = archiveDirectory(workerData.bytes);
  let count = 0, total = 0, actualTotal = 0;
  const names = new Set(), expected = new Map(), parts = Object.create(null);
  unzipSync(workerData.bytes, { filter: file => {
    if (++count > MAX_ENTRIES || names.has(file.name)) throw Error('archive limit');
    names.add(file.name);
    const selected = file.name === '[Content_Types].xml' || file.name === '_rels/.rels' || file.name === 'word/_rels/document.xml.rels' || /^word\/(document|header[0-9]+|footer[0-9]+|footnotes|endnotes|comments)\.xml$/.test(file.name);
    if (selected) {
      if (file.originalSize > MAX_XML || (total += file.originalSize) > MAX_ARCHIVE_XML) throw Error('xml limit');
      expected.set(file.name, file.originalSize);
    }
    return false;
  }});
  const completed = new Set(), seen = new Set();
  const unzip = new Unzip(file => {
    if (seen.has(file.name) || !names.has(file.name)) throw Error('archive mismatch');
    seen.add(file.name);
    if (!expected.has(file.name)) return;
    let size = 0;
    const chunks = [];
    file.ondata = (error, data, final) => {
      if (error) throw error;
      size += data.length;
      actualTotal += data.length;
      if (size > MAX_XML || actualTotal > MAX_ARCHIVE_XML || size > expected.get(file.name)) throw Error('xml limit');
      chunks.push(data);
      if (final) {
        if (size !== expected.get(file.name)) throw Error('archive size mismatch');
        const content = Buffer.concat(chunks);
        if (crc32(content) !== directory.get(file.name).crc) throw Error('archive checksum mismatch');
        parts[file.name] = content;
        completed.add(file.name);
      }
    };
    file.start();
  });
  unzip.register(UnzipInflate);
  for (let offset = 0; offset < workerData.bytes.length; offset += 16384) {
    const end = Math.min(workerData.bytes.length, offset + 16384);
    unzip.push(workerData.bytes.subarray(offset, end), end === workerData.bytes.length);
  }
  if (completed.size !== expected.size || seen.size !== names.size) throw Error('incomplete archive');
  if (!parts['word/document.xml'] || !parts['[Content_Types].xml'] || !parts['_rels/.rels']) throw Error('package missing');
  function readXml(part, rootName, rootUri, onTag) {
    let depth = 0, rootSeen = false;
    const parser = new SaxesParser({ xmlns: true });
    parser.on('doctype', () => { throw Error('doctype forbidden'); });
    parser.on('opentag', tag => {
      if (++depth > 256) throw Error('xml depth limit');
      if (depth === 1) {
        if (tag.local !== rootName || tag.uri !== rootUri) throw Error('invalid package root');
        rootSeen = true;
      } else onTag(tag);
    });
    parser.on('closetag', () => depth--);
    parser.write(decoder.decode(parts[part])).close();
    if (!rootSeen) throw Error('invalid package');
  }
  const packageNs = 'http://schemas.openxmlformats.org/package/2006/relationships';
  const typesNs = 'http://schemas.openxmlformats.org/package/2006/content-types';
  let mainType = false, mainCount = 0;
  const contentTypes = new Map();
  readXml('[Content_Types].xml', 'Types', typesNs, tag => {
    if (tag.uri !== typesNs || tag.local !== 'Override') return;
    const name = tag.attributes.PartName?.value, type = tag.attributes.ContentType?.value;
    if (!name || !type || contentTypes.has(name)) throw Error('invalid content type');
    contentTypes.set(name, type);
    if (name === '/word/document.xml' && type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml') mainType = true;
  });
  readXml('_rels/.rels', 'Relationships', packageNs, tag => {
    if (tag.uri !== packageNs || tag.local !== 'Relationship') return;
    const type = tag.attributes.Type?.value, target = tag.attributes.Target?.value;
    if (tag.attributes.TargetMode?.value === 'External') { issue('external_relationship'); return; }
    if (type?.endsWith('/officeDocument')) {
      if (tag.attributes.TargetMode?.value === 'External' || (target !== 'word/document.xml' && target !== '/word/document.xml')) throw Error('unsupported main document');
      mainCount++;
    }
  });
  if (!mainType || mainCount !== 1) throw Error('invalid main document');
  const related = new Set(), relationIds = new Set();
  if (parts['word/_rels/document.xml.rels']) readXml('word/_rels/document.xml.rels', 'Relationships', packageNs, tag => {
    if (tag.uri !== packageNs || tag.local !== 'Relationship') return;
    const type = tag.attributes.Type?.value, target = tag.attributes.Target?.value, id = tag.attributes.Id?.value;
    if (!id || relationIds.has(id)) throw Error('invalid relationship id');
    relationIds.add(id);
    if (tag.attributes.TargetMode?.value === 'External') { issue('external_relationship'); return; }
    if (!type || !target) throw Error('invalid relationship');
    if (/\/(header|footer|footnotes|endnotes|comments)$/.test(type)) {
      if (!/^(header[0-9]+|footer[0-9]+|footnotes|endnotes|comments)\.xml$/.test(target) || !parts['word/' + target]) throw Error('unsupported relationship');
      const category = /\/(header|footer|footnotes|endnotes|comments)$/.exec(type)[1];
      if (!target.startsWith(category) || contentTypes.get('/word/' + target) !== 'application/vnd.openxmlformats-officedocument.wordprocessingml.' + category + '+xml') throw Error('invalid related content type');
      related.add('word/' + target);
    } else if (!/\/(styles|stylesWithEffects|settings|webSettings|fontTable|theme|numbering|image)$/.test(type)) issue('unsupported_relationship');
  });
  for (const name of Object.keys(parts)) {
    if (/^word\/(header[0-9]+|footer[0-9]+|footnotes|endnotes|comments)\.xml$/.test(name) && !related.has(name)) issue('unreferenced_part', name);
  }
  if (related.has('word/comments.xml')) issue('comments_present', 'word/comments.xml');
  const ordered = Object.keys(parts).filter(name => name === 'word/document.xml' || related.has(name)).sort((a,b) => a === 'word/document.xml' ? -1 : b === 'word/document.xml' ? 1 : a.localeCompare(b, 'en'));
  const namespaces = new Set(['http://schemas.openxmlformats.org/wordprocessingml/2006/main','http://purl.oclc.org/ooxml/wordprocessingml/main']);
  for (const part of ordered) {
    if (truncated) break;
    const bytes = parts[part];
    if (bytes.length > MAX_XML) throw Error('xml limit');
    let paragraph = null, inText = false, index = 0, paragraphIndex = 0, paragraphBox = null, depth = 0, rootSeen = false, tableCount = 0, textBoxCount = 0;
    const tables = [];
    const paragraphStack = [], textBoxes = [];
    const paragraphLocator = () => {
      if (paragraphBox !== null) return part + '#textbox:' + paragraphBox + '/paragraph:' + paragraphIndex;
      const table = currentTable();
      return table?.row ? part + '#table:' + table.number + '/row:' + table.row.number : part + '#paragraph:' + paragraphIndex;
    };
    const currentTable = () => tables[tables.length - 1];
    const parser = new SaxesParser({ xmlns: true });
    parser.on('doctype', () => { throw Error('doctype forbidden'); });
    parser.on('opentag', tag => {
      if (++depth > 256) throw Error('xml depth limit');
      if (depth === 1) {
        const expected = part === 'word/document.xml' ? 'document' : part.includes('header') ? 'hdr' : part.includes('footer') ? 'ftr' : part.slice(5,-4);
        if (!namespaces.has(tag.uri) || tag.local !== expected) throw Error('unexpected root');
        rootSeen = true;
      }
      if (!namespaces.has(tag.uri)) return;
      if (tag.local === 'tbl') {
        if (tables.length) issue('nested_table', part + '#table:' + (tableCount + 1));
        tables.push({ number: ++tableCount, rowCount: 0, row: null });
      }
      else if (tag.local === 'tr') {
        const table = currentTable();
        if (!table || table.row) throw Error('invalid table row');
        table.row = { number: ++table.rowCount, cells: [], cell: null };
      }
      else if (tag.local === 'tc') {
        const row = currentTable()?.row;
        if (!row || row.cell) throw Error('invalid table cell');
        row.cell = [];
      }
      else if (tag.local === 'txbxContent') {
        textBoxes.push(++textBoxCount);
        if (paragraph !== null) issue('embedded_text_container', paragraphLocator());
      }
      else if (tag.local === 'p') {
        if (paragraph !== null) {
          if (!textBoxes.length || paragraphBox === textBoxes[textBoxes.length - 1]) throw Error('nested paragraphs');
          paragraphStack.push({ paragraph, inText, paragraphIndex, paragraphBox });
        }
        paragraph = ''; inText = false; paragraphIndex = ++index; paragraphBox = textBoxes[textBoxes.length - 1] ?? null;
      }
      else if (paragraph !== null && tag.local === 't') inText = true;
      else if (paragraph !== null && tag.local === 'tab') {
        const table = currentTable();
        if (table?.row) issue('table_cell_tab', part + '#table:' + table.number + '/row:' + table.row.number);
        paragraph += '\t';
      }
      else if (tag.local === 'gridSpan' || tag.local === 'vMerge' || tag.local === 'hMerge') {
        const table = currentTable();
        if (table?.row) issue('merged_table_cell', part + '#table:' + table.number + '/row:' + table.row.number);
      }
      else if (paragraph !== null && (tag.local === 'br' || tag.local === 'cr')) paragraph += '\n';
      else if (tag.local === 'altChunk' || tag.local === 'subDoc') issue('unsupported_content', part);
      else if (tag.local === 'ins' || tag.local === 'del' || tag.local === 'moveFrom' || tag.local === 'moveTo') issue('tracked_changes', part + '#paragraph:' + index);
      else if (paragraph !== null && (tag.local === 'drawing' || tag.local === 'object' || tag.local === 'pict')) issue('embedded_content', paragraphLocator());
    });
    parser.on('text', value => { if (paragraph !== null && inText) paragraph += value; });
    parser.on('cdata', value => { if (paragraph !== null && inText) paragraph += value; });
    parser.on('closetag', tag => {
      if (namespaces.has(tag.uri) && tag.local === 't') inText = false;
      if (namespaces.has(tag.uri) && tag.local === 'p' && paragraph !== null) {
        const table = currentTable();
        if (paragraphBox !== null) {
          result.unitsTotal++;
          if (add(paragraphLocator(), paragraph, null)) result.unitsReadable++;
        } else if (table) {
          if (!table.row || !table.row.cell) throw Error('paragraph outside table cell');
          table.row.cell.push(paragraph);
        } else {
          result.unitsTotal++;
          if (add(paragraphLocator(), paragraph, null)) result.unitsReadable++;
        }
        const outer = paragraphStack.pop();
        if (outer) ({ paragraph, inText, paragraphIndex, paragraphBox } = outer);
        else { paragraph = null; inText = false; paragraphIndex = 0; paragraphBox = null; }
      }
      if (namespaces.has(tag.uri) && tag.local === 'txbxContent') textBoxes.pop();
      if (namespaces.has(tag.uri) && tag.local === 'tc') {
        const row = currentTable()?.row;
        if (!row || !row.cell) throw Error('invalid table cell');
        row.cells.push(row.cell.join('\n'));
        row.cell = null;
      }
      if (namespaces.has(tag.uri) && tag.local === 'tr') {
        const table = currentTable();
        if (!table || !table.row || table.row.cell) throw Error('invalid table row');
        result.unitsTotal++;
        if (add(part + '#table:' + table.number + '/row:' + table.row.number, table.row.cells.join('\t'), null)) result.unitsReadable++;
        table.row = null;
      }
      if (namespaces.has(tag.uri) && tag.local === 'tbl') {
        const table = tables.pop();
        if (!table || table.row) throw Error('invalid table');
      }
      depth--;
    });
    parser.write(decoder.decode(bytes)).close();
    if (!rootSeen) throw Error('empty XML');
  }
  finish();
}
Promise.resolve().then(() => workerData.kind === 'pdf' ? pdf() : docx()).catch(() => {
  parentPort.postMessage({state:'failed', parserVersion:workerData.parserVersion, passages:[], issues:[{code:'parser_error',locator:null}], unitsTotal:0, unitsReadable:0});
});
`;
