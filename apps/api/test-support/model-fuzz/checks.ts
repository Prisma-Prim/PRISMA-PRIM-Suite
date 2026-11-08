/**
 * Checking helpers shared by the model-based fuzz harnesses (#1156, #1211).
 * Each fuzzed module keeps its own model, commands and invariant catalogue.
 */

/**
 * A broken invariant. A module narrows `I` to its catalogue's keys with a
 * subclass, and the failure report names the invariant and its rule.
 */
export class InvariantViolation<I extends string = string> extends Error {
  readonly invariant: I;
  constructor(invariant: I, detail: string) {
    super(`${invariant}: ${detail}`);
    this.name = 'InvariantViolation';
    this.invariant = invariant;
  }
}

/** One HTTP answer: its status, its raw text and that text as JSON. */
export interface Reply {
  status: number;
  text: string;
  body: unknown;
}

export async function readReply(response: Response): Promise<Reply> {
  const text = await response.text();
  return { status: response.status, text, body: parse(text) };
}

function parse(text: string): unknown {
  try {
    const value: unknown = JSON.parse(text);
    return value;
  } catch {
    return undefined;
  }
}

/** Order-insensitive JSON, to compare a replayed receipt with the original. */
export function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) =>
    item && typeof item === 'object' && !Array.isArray(item)
      ? Object.fromEntries(
          Object.entries(item).sort(([a], [b]) => a.localeCompare(b)),
        )
      : item,
  );
}

export function short(reply: Reply) {
  return `${reply.status} ${reply.text.slice(0, 200)}`;
}

/**
 * Expects `reply` to be the denial `status` and, for a request aimed at a
 * record, its twin aimed at a missing record to be byte-identical.
 */
export async function expectDenial<I extends string>(input: {
  reply: Reply;
  status: 403 | 404 | 409;
  invariant: I;
  what: string;
  twin?: () => Promise<Reply>;
}) {
  if (input.reply.status !== input.status)
    throw new InvariantViolation(
      input.invariant,
      `${input.what}: expected ${input.status}, got ${short(input.reply)}`,
    );
  if (!input.twin) return;
  const twin = await input.twin();
  if (twin.status !== input.reply.status || twin.text !== input.reply.text)
    throw new InvariantViolation(
      'identical-denial',
      `${input.what}: the existing record got ${short(input.reply)}, a missing one got ${short(twin)}`,
    );
}
