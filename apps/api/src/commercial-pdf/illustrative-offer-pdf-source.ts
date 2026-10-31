import { UnprocessableEntityException } from '@nestjs/common';
import { parse, type DefaultTreeAdapterMap } from 'parse5';
import type { PdfBlock } from './commercial-pdf-source.js';

type Node = DefaultTreeAdapterMap['childNode'];
type Element = DefaultTreeAdapterMap['element'];

/** Only the frozen OFFER_ILLUSTRATIVE v1 tree; text is captured, never regenerated. */
export function projectIllustrativeOfferPdf(html: string): PdfBlock[] {
  const document = parse(html, { onParseError: unsupported });
  const [doctype, root] = document.childNodes;
  if (
    document.childNodes.length !== 2 ||
    !doctype ||
    !('name' in doctype) ||
    doctype.name !== 'html' ||
    !('publicId' in doctype) ||
    doctype.publicId !== '' ||
    doctype.systemId !== '' ||
    !root ||
    !('tagName' in root)
  )
    unsupported();
  expectElement(root, 'html', { lang: 'en' });
  const [head, body] = children(root, ['head', 'body']);
  expectElement(head, 'head');
  expectElement(body, 'body');
  const metadata = children(head, ['meta', 'meta', 'meta', 'title', 'style']);
  const expectedAttributes: Record<string, string>[] = [
    { charset: 'utf-8' },
    { name: 'viewport', content: 'width=device-width, initial-scale=1' },
    {
      'http-equiv': 'Content-Security-Policy',
      content: "default-src 'none'; style-src 'unsafe-inline'",
    },
  ];
  for (const [index, attrs] of expectedAttributes.entries()) {
    const meta = metadata[index];
    expectElement(meta, 'meta', attrs);
    if (meta.childNodes.length) unsupported();
  }
  fixedText(metadata[3], 'title', 'Illustrative Offer');
  fixedText(metadata[4], 'style', QUALIFIED_STYLE);
  const [article] = children(body, ['article']);
  expectElement(article, 'article', { 'aria-labelledby': 'offer-title' });
  const parts = children(article, [
    'header',
    'section',
    'section',
    'section',
    'section',
    'section',
    'footer',
  ]);
  const header = parts[0];
  expectElement(header, 'header');
  const [notice, title] = children(header, ['p', 'h1']);
  expectElement(notice, 'p');
  const [strong] = children(notice, ['strong']);
  const blocks: PdfBlock[] = [
    textBlock(fixedText(strong, 'strong', NOTICE), false, true),
    textBlock(
      fixedText(title, 'h1', 'Illustrative Offer', { id: 'offer-title' }),
      true,
      true,
    ),
  ];
  function section(index: number, id: string, title: string, shape: string[]) {
    const node = parts[index];
    expectElement(node, 'section', { 'aria-labelledby': id });
    const [heading, ...content] = children(node, ['h2', ...shape]);
    blocks.push(textBlock(fixedText(heading, 'h2', title, { id }), true, true));
    return content;
  }
  const [details] = section(1, 'offer-details-title', 'Offer details', ['dl']);
  blocks.push(
    ...definitions(details, [
      'Issuing Company',
      'Illustrative Offer reference',
      'Offer Version',
      'Recipient legal name',
      'Recipient tax ID',
      'Recipient legal address',
      'Created at',
      'Valid until',
    ]),
  );
  const [table] = section(2, 'offer-lines-title', 'Services', ['table']);
  expectElement(table, 'table');
  const [thead, tbody] = children(table, ['thead', 'tbody']);
  expectElement(thead, 'thead');
  expectElement(tbody, 'tbody');
  const [headingRow] = children(thead, ['tr']);
  expectElement(headingRow, 'tr');
  const headings = children(headingRow, Array<string>(7).fill('th')).map(
    (cell, index) =>
      fixedText(cell, 'th', COLUMN_HEADINGS[index], { scope: 'col' }),
  );
  const rows = children(tbody);
  if (rows.length < 1 || rows.length > 20) unsupported();
  blocks.push({
    kind: 'table',
    rows: [
      headings,
      ...rows.map((row) => {
        expectElement(row, 'tr');
        return children(row, Array<string>(7).fill('td')).map((cell) => {
          expectElement(cell, 'td');
          return literal(cell);
        });
      }),
    ],
  });
  const [totals] = section(3, 'offer-totals-title', 'Totals', ['dl']);
  blocks.push(
    ...definitions(totals, ['Subtotal', 'Tax total', 'Total', 'Currency']),
  );
  for (const [index, id, label] of [
    [4, 'offer-scope-title', 'Scope note'],
    [5, 'offer-conditions-title', 'Commercial conditions'],
  ] satisfies [number, string, string][]) {
    const [paragraph] = section(index, id, label, ['p']);
    expectElement(paragraph, 'p');
    blocks.push(textBlock(literal(paragraph)));
  }
  const footer = parts[6];
  expectElement(footer, 'footer');
  const [footerList] = children(footer, ['dl']);
  const footerBlocks = definitions(footerList, [
    'Template Version',
    'Pricing Snapshot id',
    'Provenance',
  ]);
  if (
    footerBlocks[1]?.kind !== 'text' ||
    footerBlocks[1].text !== 'OFFER_ILLUSTRATIVE v1' ||
    footerBlocks[5]?.kind !== 'text' ||
    footerBlocks[5].text !== 'ILLUSTRATIVE'
  )
    unsupported();
  blocks.push(...footerBlocks);
  return blocks;
}

function definitions(node: Element | undefined, labels: string[]): PdfBlock[] {
  expectElement(node, 'dl');
  const entries = children(
    node,
    labels.flatMap(() => ['dt', 'dd']),
  );
  return labels.flatMap((label, index) => {
    const term = entries[index * 2],
      value = entries[index * 2 + 1];
    const name = fixedText(term, 'dt', label);
    expectElement(value, 'dd');
    return [textBlock(name, false, true), textBlock(literal(value))];
  });
}
function textBlock(text: string, heading = false, bold = false): PdfBlock {
  return { kind: 'text', text, heading, bold };
}
function expectElement(
  node: Element | undefined,
  tag: string,
  attrs: Record<string, string> = {},
): asserts node is Element {
  if (
    !node ||
    node.tagName !== tag ||
    node.namespaceURI !== 'http://www.w3.org/1999/xhtml' ||
    node.attrs.length !== Object.keys(attrs).length ||
    node.attrs.some(
      (attr) => attrs[attr.name] !== attr.value || attr.namespace !== undefined,
    )
  )
    unsupported();
}
function children(node: Element | undefined, shape?: string[]): Element[] {
  if (!node) unsupported();
  const result: Element[] = [];
  for (const child of node.childNodes) {
    if ('tagName' in child) result.push(child);
    else if (
      child.nodeName !== '#text' ||
      !('value' in child) ||
      /[^\t\r\n ]/u.test(child.value)
    )
      unsupported();
  }
  if (
    shape &&
    result.map((child) => child.tagName).join(',') !== shape.join(',')
  )
    unsupported();
  return result;
}
function literal(node: Element): string {
  return node.childNodes
    .map((child: Node) => {
      if (child.nodeName !== '#text' || !('value' in child)) unsupported();
      return child.value;
    })
    .join('');
}
function fixedText(
  node: Element | undefined,
  tag: string,
  expected: string | undefined,
  attrs: Record<string, string> = {},
): string {
  expectElement(node, tag, attrs);
  const text = literal(node);
  if (text !== expected) unsupported();
  return text;
}
function unsupported(): never {
  throw new UnprocessableEntityException({ code: 'PDF_SOURCE_UNSUPPORTED' });
}
const NOTICE =
  'Provisional illustrative document — cannot be accepted — no legal effect — no official number';
const COLUMN_HEADINGS = [
  'Service name',
  'Quantity',
  'Unit',
  'Unit amount',
  'Line net',
  'Tax label',
  'Line tax',
];
const QUALIFIED_STYLE =
  '*,*::before,*::after{box-sizing:border-box}body{margin:0;padding:1rem;font-family:system-ui,sans-serif;color:#172033}table{width:100%;border-collapse:collapse;table-layout:fixed}th,td{padding:.5rem;text-align:left;vertical-align:top;border:1px solid #cbd5e1;overflow-wrap:anywhere}dl{display:grid;grid-template-columns:minmax(8rem,1fr) 2fr;gap:.5rem 1rem}dt{font-weight:700}dd{margin:0;overflow-wrap:anywhere}@media(max-width:30rem){dl{grid-template-columns:1fr}th,td{font-size:.75rem;padding:.25rem}}';
