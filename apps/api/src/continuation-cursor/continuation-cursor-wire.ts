import { createHmac, timingSafeEqual } from 'node:crypto';

/** Internal wire codec; all public profiles own their bounds and envelopes. */
export function signCursorPayload(key: string, value: unknown): string {
  const payload = Buffer.from(JSON.stringify(value)).toString('base64url');
  return (
    payload +
    '.' +
    createHmac('sha256', key).update(payload).digest('base64url')
  );
}

export function readCursorPayload(key: string, value: string): unknown {
  if (!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/u.test(value)) throw new Error();
  const [payload, signature] = value.split('.');
  if (!payload || !signature) throw new Error();
  const expected = createHmac('sha256', key).update(payload).digest();
  const supplied = Buffer.from(signature, 'base64url');
  if (
    supplied.length !== expected.length ||
    supplied.toString('base64url') !== signature ||
    Buffer.from(payload, 'base64url').toString('base64url') !== payload ||
    !timingSafeEqual(expected, supplied)
  )
    throw new Error();
  const parsed: unknown = JSON.parse(
    Buffer.from(payload, 'base64url').toString('utf8'),
  );
  return parsed;
}
