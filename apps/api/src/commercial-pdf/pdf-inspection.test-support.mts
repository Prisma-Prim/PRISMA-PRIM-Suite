import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

/** Independent PDF.js inspection of every page, with normalization/resource fetch disabled. */
export async function inspectCommercialPdf(bytes: Uint8Array) {
  const options = {
    data: new Uint8Array(bytes),
    useSystemFonts: false,
    disableFontFace: true,
    isEvalSupported: false,
    useWorkerFetch: false,
  };
  const task = getDocument(options);
  try {
    const document = await task.promise;
    const pages: {
      text: string;
      items: {
        text: string;
        tag: string;
        x: number;
        y: number;
        width: number;
        height: number;
      }[];
    }[] = [];
    for (let n = 1; n <= document.numPages; n += 1) {
      const page = await document.getPage(n);
      try {
        const content = await page.getTextContent({
          disableNormalization: true,
          includeMarkedContent: true,
        });
        const tags: string[] = [];
        const items: {
          text: string;
          tag: string;
          x: number;
          y: number;
          width: number;
          height: number;
        }[] = [];
        for (const item of content.items) {
          if ('str' in item)
            items.push({
              text: item.str,
              tag: tags.at(-1) ?? '',
              x: item.transform[4],
              y: item.transform[5],
              width: item.width,
              height: item.height,
            });
          else if (
            item.type === 'beginMarkedContent' &&
            'tag' in item &&
            typeof item.tag === 'string'
          )
            tags.push(item.tag);
          else if (item.type === 'endMarkedContent') {
            if (!tags.pop()) throw new Error('Unbalanced PDF text markers.');
          } else throw new Error('Unknown PDF text marker.');
        }
        if (tags.length) throw new Error('Unclosed PDF text markers.');
        for (const item of items.filter((item) => item.text.trim())) {
          if (
            item.x < 42 - 0.01 ||
            item.x + item.width > 553.28 + 0.01 ||
            item.y < 32 ||
            item.y + item.height >= 841.89
          )
            throw new Error('PDF text outside qualified page geometry.');
        }
        pages.push({ text: items.map((item) => item.text).join('\n'), items });
      } finally {
        page.cleanup();
      }
    }
    return pages;
  } finally {
    await task.destroy();
  }
}
export function compactPdfText(text: string) {
  return text.replace(/\s/gu, '');
}
