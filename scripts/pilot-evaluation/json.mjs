import { EvaluationError, fail } from './diagnostic.mjs';

// Scan the captured JSON before the native parser can discard duplicate keys.
// Container depth is checked during scanning, so recursion is itself bounded.
export function parseJson(bytes, input) {
  let source;
  try {
    if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf)
      throw new SyntaxError();
    source = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    fail(
      'E_JSON',
      input,
      null,
      'Save a UTF-8 JSON file without a byte-order mark.',
    );
  }
  let cursor = 0;
  const whitespace = () => {
    while (/[ \n\r\t]/.test(source[cursor] ?? '\0')) cursor++;
  };
  const string = () => {
    const start = cursor++;
    while (cursor < source.length) {
      const character = source[cursor++];
      if (character === '"') return JSON.parse(source.slice(start, cursor));
      if (character === '\\') cursor++;
    }
    throw new SyntaxError();
  };
  const value = (depth) => {
    whitespace();
    const token = source[cursor];
    if (token === '{' || token === '[') {
      if (depth > 12)
        fail(
          'E_INPUT_LIMIT',
          input,
          null,
          'Keep JSON nesting within 12 containers, counting the root as depth 1.',
        );
      const closing = token === '{' ? '}' : ']';
      const keys = new Set();
      cursor++;
      whitespace();
      if (source[cursor] === closing) {
        cursor++;
        return;
      }
      while (cursor < source.length) {
        if (token === '{') {
          if (source[cursor] !== '"') throw new SyntaxError();
          const key = string();
          if (keys.has(key))
            fail(
              'E_DUPLICATE',
              input,
              null,
              'Remove duplicate JSON object keys; escaped spellings identify the same key.',
            );
          keys.add(key);
          whitespace();
          if (source[cursor++] !== ':') throw new SyntaxError();
        }
        value(depth + 1);
        whitespace();
        const separator = source[cursor++];
        if (separator === closing) return;
        if (separator !== ',') throw new SyntaxError();
        whitespace();
      }
      throw new SyntaxError();
    }
    if (token === '"') {
      string();
      return;
    }
    for (const keyword of ['true', 'false', 'null'])
      if (source.startsWith(keyword, cursor)) {
        cursor += keyword.length;
        return;
      }
    const number = /-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/y;
    number.lastIndex = cursor;
    if (!number.exec(source)) throw new SyntaxError();
    cursor = number.lastIndex;
  };
  try {
    value(1);
    whitespace();
    if (cursor !== source.length) throw new SyntaxError();
    return JSON.parse(source);
  } catch (error) {
    if (error instanceof EvaluationError) throw error;
    fail(
      'E_JSON',
      input,
      null,
      'Repair the JSON syntax without duplicate keys or unsupported values.',
    );
  }
}
