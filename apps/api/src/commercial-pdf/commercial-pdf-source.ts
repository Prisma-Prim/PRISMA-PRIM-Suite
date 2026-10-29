import { UnprocessableEntityException } from '@nestjs/common';
import { parse, type DefaultTreeAdapterMap } from 'parse5';

type CommercialPdfIdentity = {
  workspaceId: string;
  companyId: string;
  opportunityId: string;
  rootId: string;
  reference: number;
  versionId: string;
  versionNumber: number;
  language: 'ro';
  createdAt: string;
  sourceRendererVersion: 1;
  sourceHtmlSha256: string;
  html: string;
};
export type CommercialPdfSource = CommercialPdfIdentity &
  (
    | {
        kind: 'offer';
        provenance: 'COMPANY_MODEL_ESTIMATE';
        sourceRendererCode: 'OFFER_COMPANY_CONSULTING_RO';
      }
    | {
        kind: 'contract';
        provenance: 'COMPANY_MODEL_OFFER';
        sourceRendererCode: 'COMPANY_CONSULTING_CONTRACT_RO';
      }
  );
export type PdfBlock =
  | { kind: 'text'; text: string; heading: boolean; bold: boolean }
  | { kind: 'table'; rows: readonly (readonly string[])[] };
type Node = DefaultTreeAdapterMap['childNode'];
type Element = DefaultTreeAdapterMap['element'];

export function pdfRefusal(
  code:
    | 'PDF_SOURCE_UNSUPPORTED'
    | 'PDF_TEXT_UNSUPPORTED'
    | 'PDF_LAYOUT_UNSUPPORTED'
    | 'PDF_CONTENT_LIMIT',
): never {
  throw new UnprocessableEntityException({ code });
}

/** Closed v1 commercial body grammar. The owning reader first proves the complete frozen binding. */
export function projectCommercialPdfSource(
  source: CommercialPdfSource,
): PdfBlock[] {
  if (Buffer.byteLength(source.html, 'utf8') > 1024 * 1024)
    pdfRefusal('PDF_CONTENT_LIMIT');
  if (/[\p{Cc}\p{Cf}\p{Cs}]/u.test(source.html.replace(/[\t\r\n]/gu, '')))
    pdfRefusal('PDF_TEXT_UNSUPPORTED');
  const document = parse(source.html, {
    onParseError: () => pdfRefusal('PDF_SOURCE_UNSUPPORTED'),
  });
  const html = document.childNodes.find((n) => n.nodeName === 'html');
  if (
    !html ||
    !('childNodes' in html) ||
    !('attrs' in html) ||
    html.attrs.length !== 1 ||
    html.attrs[0]?.name !== 'lang' ||
    html.attrs[0]?.value !== 'ro'
  )
    pdfRefusal('PDF_SOURCE_UNSUPPORTED');
  const head = html.childNodes.find((n) => n.nodeName === 'head');
  if (!head || !('childNodes' in head)) pdfRefusal('PDF_SOURCE_UNSUPPORTED');
  qualifyHead(head.childNodes, source.kind);
  const body = html.childNodes.find((n) => n.nodeName === 'body');
  if (!body || !('childNodes' in body)) pdfRefusal('PDF_SOURCE_UNSUPPORTED');
  const roots = elements(body.childNodes);
  const article = roots[0];
  if (roots.length !== 1 || article?.tagName !== 'article')
    pdfRefusal('PDF_SOURCE_UNSUPPORTED');
  qualifyArticle(article, source.kind);
  const blocks: PdfBlock[] = [];
  function visit(element: Element) {
    if (element.namespaceURI !== 'http://www.w3.org/1999/xhtml')
      pdfRefusal('PDF_SOURCE_UNSUPPORTED');
    const allowed: Record<string, readonly string[]> = {
      article: ['aria-labelledby'],
      header: [],
      section: ['aria-labelledby'],
      footer: [],
      h1: ['id', 'class'],
      h2: ['id', 'class'],
      p: ['class'],
      strong: [],
      dl: [],
      dt: [],
      dd: ['class'],
      ul: [],
      li: ['class'],
      table: [],
      thead: [],
      tbody: [],
      tr: [],
      th: ['scope'],
      td: ['class'],
    };
    const attributes = allowed[element.tagName];
    if (
      !attributes ||
      element.attrs.some(
        (a) =>
          !attributes.includes(a.name) ||
          (a.name === 'class' && a.value !== 'literal') ||
          (a.name === 'scope' && a.value !== 'col') ||
          (a.name === 'id' && !/^[a-z][A-Za-z-]*$/u.test(a.value)) ||
          (a.name === 'aria-labelledby' && !/^[a-z][A-Za-z-]*$/u.test(a.value)),
      )
    )
      pdfRefusal('PDF_SOURCE_UNSUPPORTED');
    const children = element.childNodes.filter(
      (node): node is Element => 'tagName' in node,
    );
    if (!['h1', 'h2', 'p', 'dt', 'dd', 'li'].includes(element.tagName))
      elements(element.childNodes);
    if (element.tagName === 'table') {
      const [head, rows] = children;
      if (
        children.length !== 2 ||
        head?.tagName !== 'thead' ||
        rows?.tagName !== 'tbody'
      )
        pdfRefusal('PDF_SOURCE_UNSUPPORTED');
      const headRows = elements(head.childNodes),
        bodyRows = elements(rows.childNodes);
      if (
        headRows.length !== 1 ||
        bodyRows.length !== (source.kind === 'offer' ? 18 : 13)
      )
        pdfRefusal('PDF_SOURCE_UNSUPPORTED');
      const result = [...headRows, ...bodyRows].map((row, index) => {
        if (row.tagName !== 'tr' || row.attrs.length)
          pdfRefusal('PDF_SOURCE_UNSUPPORTED');
        const cells = elements(row.childNodes);
        if (
          cells.length !== 3 ||
          cells.some((cell) => cell.tagName !== (index === 0 ? 'th' : 'td'))
        )
          pdfRefusal('PDF_SOURCE_UNSUPPORTED');
        return cells.map((cell) => {
          if (
            cell.attrs.length !== 1 ||
            cell.attrs[0]?.name !== (index === 0 ? 'scope' : 'class') ||
            cell.attrs[0]?.value !== (index === 0 ? 'col' : 'literal')
          )
            pdfRefusal('PDF_SOURCE_UNSUPPORTED');
          return literalText(cell);
        });
      });
      blocks.push({ kind: 'table', rows: result });
      return;
    }
    if (['h1', 'h2', 'p', 'dt', 'dd', 'li'].includes(element.tagName)) {
      const text =
        element.tagName === 'p' &&
        children.length === 1 &&
        children[0]?.tagName === 'strong'
          ? literalText(children[0])
          : literalText(element);
      if (
        children.length &&
        !(
          element.tagName === 'p' &&
          children.length === 1 &&
          children[0]?.tagName === 'strong' &&
          children[0].attrs.length === 0
        )
      )
        pdfRefusal('PDF_SOURCE_UNSUPPORTED');
      blocks.push({
        kind: 'text',
        text,
        heading: ['h1', 'h2'].includes(element.tagName),
        bold:
          ['h1', 'h2', 'dt'].includes(element.tagName) || children.length > 0,
      });
      return;
    }
    if (
      element.tagName === 'dl' &&
      (children.length % 2 !== 0 ||
        children.some((c, i) => c.tagName !== (i % 2 === 0 ? 'dt' : 'dd')))
    )
      pdfRefusal('PDF_SOURCE_UNSUPPORTED');
    if (
      element.tagName === 'ul' &&
      (!children.length || children.some((c) => c.tagName !== 'li'))
    )
      pdfRefusal('PDF_SOURCE_UNSUPPORTED');
    for (const child of children) visit(child);
  }
  visit(article);
  const structural = elements(article.childNodes)
    .map((element) => element.tagName)
    .join(',');
  const expected =
    source.kind === 'offer'
      ? ['header', ...Array<string>(15).fill('section'), 'footer'].join(',')
      : [
          'header',
          'dl',
          'p',
          'h2',
          'p',
          'dl',
          'p',
          'h2',
          'ul',
          ...Array<string>(10).fill('section'),
          'p',
          'p',
          'section',
          'footer',
        ].join(',');
  if (
    structural !== expected ||
    blocks.filter((b) => b.kind === 'table').length !== 1
  )
    pdfRefusal('PDF_SOURCE_UNSUPPORTED');
  return blocks;
}

function elements(nodes: readonly Node[]): Element[] {
  const result: Element[] = [];
  for (const node of nodes) {
    if ('tagName' in node) result.push(node);
    else if (
      node.nodeName !== '#text' ||
      !('value' in node) ||
      /\S/u.test(node.value)
    )
      pdfRefusal('PDF_SOURCE_UNSUPPORTED');
  }
  return result;
}
function literalText(element: Element): string {
  if (element.childNodes.some((node) => node.nodeName !== '#text'))
    pdfRefusal('PDF_SOURCE_UNSUPPORTED');
  return element.childNodes
    .map((node) => ('value' in node ? node.value : ''))
    .join('');
}

function childShape(element: Element, names: string) {
  if (
    elements(element.childNodes)
      .map((node) => node.tagName)
      .join(',') !== names
  )
    pdfRefusal('PDF_SOURCE_UNSUPPORTED');
}
function qualifyArticle(article: Element, kind: CommercialPdfSource['kind']) {
  const children = elements(article.childNodes),
    header = children[0],
    footer = children.at(-1);
  if (
    !header ||
    !footer ||
    header.tagName !== 'header' ||
    footer.tagName !== 'footer'
  )
    pdfRefusal('PDF_SOURCE_UNSUPPORTED');
  childShape(header, 'p,p,h1');
  childShape(footer, kind === 'offer' ? 'h2,dl' : 'h2,dl,p');
  const pairCounts = kind === 'offer' ? [11, 2, 4, 6] : [9, 3, 8, 8];
  let pair = 0;
  function walk(element: Element) {
    if (element.tagName === 'dl') {
      const count = pairCounts[pair++];
      if (!count || elements(element.childNodes).length !== count * 2)
        pdfRefusal('PDF_SOURCE_UNSUPPORTED');
    }
    if (element.tagName === 'section') {
      const tags = elements(element.childNodes)
        .map((node) => node.tagName)
        .join(',');
      const permitted =
        kind === 'offer'
          ? ['h2,dl', 'h2,ul', 'h2,p', 'h2,p,dl', 'h2,p,table']
          : ['h2,p', 'h2,dl,p', 'h2,p,p,table,p,p'];
      if (!permitted.includes(tags)) pdfRefusal('PDF_SOURCE_UNSUPPORTED');
    }
    for (const child of element.childNodes) if ('tagName' in child) walk(child);
  }
  walk(article);
  if (pair !== pairCounts.length) pdfRefusal('PDF_SOURCE_UNSUPPORTED');
}

function qualifyHead(
  nodes: readonly Node[],
  kind: CommercialPdfSource['kind'],
) {
  const head = elements(nodes);
  if (
    head.map((node) => node.tagName).join(',') !== 'meta,meta,meta,title,style'
  )
    pdfRefusal('PDF_SOURCE_UNSUPPORTED');
  const expected = [
    [{ name: 'charset', value: 'utf-8' }],
    [
      { name: 'name', value: 'viewport' },
      { name: 'content', value: 'width=device-width, initial-scale=1' },
    ],
    [
      { name: 'http-equiv', value: 'Content-Security-Policy' },
      {
        name: 'content',
        value: "default-src 'none'; style-src 'unsafe-inline'",
      },
    ],
    [],
    [],
  ];
  if (
    head.some(
      (node, i) => JSON.stringify(node.attrs) !== JSON.stringify(expected[i]),
    )
  )
    pdfRefusal('PDF_SOURCE_UNSUPPORTED');
  const title = head[3],
    style = head[4];
  if (
    !title ||
    !style ||
    literalText(title) !==
      (kind === 'offer'
        ? 'Ofertă de consultanță'
        : 'Contract de consultanță') ||
    literalText(style) !== QUALIFIED_STYLE
  )
    pdfRefusal('PDF_SOURCE_UNSUPPORTED');
}
const QUALIFIED_STYLE =
  '*,*::before,*::after{box-sizing:border-box}body{margin:0;padding:1rem;font-family:system-ui,sans-serif;color:#172033;overflow-wrap:anywhere}.literal{white-space:pre-wrap;overflow-wrap:anywhere}table{width:100%;border-collapse:collapse;table-layout:fixed}th,td{padding:.5rem;text-align:left;vertical-align:top;border:1px solid #cbd5e1;overflow-wrap:anywhere}dl{display:grid;grid-template-columns:minmax(8rem,1fr) 2fr;gap:.5rem 1rem}dt{font-weight:700}dd{margin:0;min-width:0}@media(max-width:30rem){dl{grid-template-columns:1fr}th,td{font-size:.75rem;padding:.25rem}}@media print{body{padding:0}thead{display:table-header-group}tr{break-inside:avoid}h2{break-after:avoid}}';
