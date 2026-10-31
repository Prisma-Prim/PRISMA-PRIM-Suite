import { fail } from './diagnostic.mjs';

const payloadLimit = 16777216;
const containerLimit = 33556480;
const padded = (size) => Math.ceil(size / 512) * 512;

function header(name, size) {
  const bytes = Buffer.alloc(512);
  const octal = (offset, width, value) =>
    bytes.write(
      value.toString(8).padStart(width - 1, '0') + '\0',
      offset,
      width,
      'ascii',
    );
  bytes.write(name, 0, 100, 'ascii');
  octal(100, 8, 0o600);
  octal(108, 8, 0);
  octal(116, 8, 0);
  octal(124, 12, size);
  octal(136, 12, 0);
  bytes.fill(0x20, 148, 156);
  bytes.write('0', 156, 1, 'ascii');
  bytes.write('ustar\0', 257, 6, 'ascii');
  bytes.write('00', 263, 2, 'ascii');
  octal(329, 8, 0);
  octal(337, 8, 0);
  const checksum = bytes.reduce((sum, byte) => sum + byte, 0);
  bytes.write(checksum.toString(8).padStart(6, '0') + '\0 ', 148, 8, 'ascii');
  return bytes;
}

// Private fixed-output serializer: no archive input, variable names or metadata.
export function containerBytes(result, report) {
  const size = 2048 + padded(result.length) + padded(report.length);
  if (
    result.length > payloadLimit ||
    report.length > payloadLimit ||
    size > containerLimit
  )
    fail(
      'E_OUTPUT_LIMIT',
      'output',
      null,
      'Keep each complete payload within 16777216 bytes and the container within 33556480 bytes; reduce the evaluation and use a fresh path.',
    );
  const bytes = Buffer.alloc(size);
  let offset = 0;
  for (const [name, payload] of [
    ['result.json', result],
    ['report.md', report],
  ]) {
    header(name, payload.length).copy(bytes, offset);
    payload.copy(bytes, offset + 512);
    offset += 512 + padded(payload.length);
  }
  return bytes;
}
