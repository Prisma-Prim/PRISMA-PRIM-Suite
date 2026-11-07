import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { setImmediate } from 'node:timers/promises';
import fontkit from '@pdf-lib/fontkit';
import { pdfRefusal } from './commercial-pdf-source.js';

/** Unmodified DejaVu Sans 2.37, qualified by exact digest before every render. */
const FONT_ASSETS = {
  regular: {
    name: 'DejaVuSans.ttf',
    sha256: '57f73e11f51999432bf7ab22ce55b6f945d5eca1bf824404cfa9ec2e3718c84e',
  },
  bold: {
    name: 'DejaVuSans-Bold.ttf',
    sha256: 'a4c5bc453ca281d90ea079e596da7ae0dfeb5777497c29ec254e76d97ff6f890',
  },
} as const;

/** No ligature may merge or reorder the exact characters drawn. */
export const PDF_TEXT_SHAPING = { liga: false, clig: false };
export const pdfGraphemes = new Intl.Segmenter('ro', {
  granularity: 'grapheme',
});

export interface BundledPdfFonts {
  regular: Uint8Array;
  bold: Uint8Array;
}

/** Yields to the event loop between bounded units of rendering work. */
export async function pdfCheckpoint(signal?: AbortSignal) {
  await setImmediate(undefined, { signal });
  signal?.throwIfAborted();
}

/**
 * The licensed bundled fonts. A missing or altered asset or licence is an
 * Error, which renderers answer as an unavailable render, never a fallback.
 */
export async function readBundledPdfFonts(
  signal?: AbortSignal,
): Promise<BundledPdfFonts> {
  const license = await readFile(
    join(__dirname, 'assets', 'font-license.txt'),
    { encoding: 'utf8', signal },
  );
  if (
    !license.includes('Bitstream Vera is a trademark') ||
    !license.includes('DejaVu changes are in public domain.')
  )
    throw new Error('Invalid bundled font license.');
  async function verified(asset: { name: string; sha256: string }) {
    const bytes = await readFile(join(__dirname, 'assets', asset.name), {
      signal,
    });
    await pdfCheckpoint(signal);
    if (createHash('sha256').update(bytes).digest('hex') !== asset.sha256)
      throw new Error('Invalid bundled font.');
    return bytes;
  }
  const [regular, bold] = await Promise.all([
    verified(FONT_ASSETS.regular),
    verified(FONT_ASSETS.bold),
  ]);
  return { regular, bold };
}

/**
 * Refuses, with PDF_TEXT_UNSUPPORTED, text the font cannot draw exactly as
 * given: control or format characters, scripts other than Latin and Cyrillic,
 * missing glyphs, unsupported clusters or any shaping that changes the text.
 */
export async function qualifyPdfText(
  fontBytes: Uint8Array,
  text: string,
  signal?: AbortSignal,
): Promise<void> {
  // A fresh font per qualification: fontkit's cached glyph codepoints can
  // conflict across runs (e.g. sun and sun+VS16).
  const font = fontkit.create(fontBytes);
  let checked = 0;
  for (const character of text) {
    if (++checked % 4096 === 0) await pdfCheckpoint(signal);
    if (/[\t\r\n]/u.test(character)) continue;
    const point = character.codePointAt(0);
    if (
      point === undefined ||
      /[\p{Cc}\p{Cf}\p{Cs}]/u.test(character) ||
      !/[\p{Script=Latin}\p{Script=Cyrillic}\p{Script=Common}\p{Script=Inherited}]/u.test(
        character,
      ) ||
      !font.hasGlyphForCodePoint(point)
    )
      pdfRefusal('PDF_TEXT_UNSUPPORTED');
  }
  for (const { segment } of pdfGraphemes.segment(text)) {
    const points = [...segment];
    if (points.length > 2 || (/^\p{M}/u.test(segment) && segment !== '\r\n'))
      pdfRefusal('PDF_TEXT_UNSUPPORTED');
  }
  await pdfCheckpoint(signal);
  const plain = text.replace(/[\t\r\n]/gu, '');
  const mapped = font
    .layout(plain, PDF_TEXT_SHAPING)
    .glyphs.map((glyph) =>
      glyph.codePoints.map((point) => String.fromCodePoint(point)).join(''),
    )
    .join('');
  if (mapped !== plain) pdfRefusal('PDF_TEXT_UNSUPPORTED');
}
