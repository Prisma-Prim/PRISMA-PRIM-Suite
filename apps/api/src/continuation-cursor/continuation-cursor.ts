import { createHash } from 'node:crypto';
import {
  readCursorPayload,
  signCursorPayload,
} from './continuation-cursor-wire.js';

const protocols = {
  payment: {
    format: 'PAYMENT_CURSOR/1',
    layout: 'nested',
    maximumLength: 2048,
  },
  'invoice-record': {
    format: 'EXTERNAL_INVOICE_CURSOR/1',
    layout: 'nested',
    maximumLength: 4096,
  },
  'opportunity-follow-up': {
    format: 'opportunity-follow-up-cursor.v1',
    layout: 'flat',
    maximumLength: 2048,
  },
};
type CursorProtocol = keyof typeof protocols;
const workingEvidenceProtocol = { format: 'WEC/1', maximumLength: 256 };
const workingEvidenceKinds = { cases: 'c', history: 'h', sources: 's' };
type WorkingEvidenceCursorKind = keyof typeof workingEvidenceKinds;

export interface ContinuationCursorScope {
  workspaceId: string;
  companyId: string;
}
export interface ContinuationCursorBinding extends ContinuationCursorScope {
  actorMembershipId: string;
  readCapture: string;
}
export type ContinuationCursorKey<Kind extends string> = (input: {
  scope: ContinuationCursorScope;
  operation: 'issue' | 'read';
  kind: Kind;
}) => Promise<string>;

/** The protocol owns its bound; HTTP query readers use this same value. */
export function continuationCursorMaximumLength(
  protocol: CursorProtocol | 'working-evidence',
) {
  return protocol === 'working-evidence'
    ? workingEvidenceProtocol.maximumLength
    : protocols[protocol].maximumLength;
}

/** Features retain only their positions, persisted-key adapter and HTTP refusals. */
export function createContinuationCursor<
  Position extends { kind: string },
>(input: {
  protocol: CursorProtocol;
  key: ContinuationCursorKey<Position['kind']>;
  position: {
    encode: (position: Position) => object;
    decode: (value: unknown) => Position;
  };
  invalid: () => Error;
  wrongKind: (kind: Position['kind']) => Error;
}) {
  const protocol = protocols[input.protocol];
  const keyFor = (
    binding: ContinuationCursorBinding,
    operation: 'issue' | 'read',
    kind: Position['kind'],
  ) =>
    input.key({
      scope: { workspaceId: binding.workspaceId, companyId: binding.companyId },
      operation,
      kind,
    });

  return {
    async issue({
      binding,
      position,
    }: {
      binding: ContinuationCursorBinding;
      position: Position;
    }) {
      const key = await keyFor(binding, 'issue', position.kind);
      const encoded = input.position.encode(position);
      const envelope =
        protocol.layout === 'nested'
          ? { format: protocol.format, binding, position: encoded }
          : { format: protocol.format, ...binding, ...encoded };
      const token = signCursorPayload(key, envelope);
      if (token.length > protocol.maximumLength) throw input.invalid();
      return token;
    },
    async read<Kind extends Position['kind']>({
      value,
      binding,
      kind,
    }: {
      value: string;
      binding: ContinuationCursorBinding;
      kind: Kind;
    }): Promise<Position & { kind: Kind }> {
      if (value.length > protocol.maximumLength) throw input.invalid();
      // Adapter failures retain their feature's unavailable/missing-key response.
      const key = await keyFor(binding, 'read', kind);
      let position: Position;
      try {
        const parsed = readCursorPayload(key, value);
        const envelope = cursorObject(parsed);
        if (envelope.format !== protocol.format) throw new Error();
        let encoded: unknown;
        if (protocol.layout === 'nested') {
          exactFields(envelope, ['format', 'binding', 'position']);
          const actual = cursorObject(envelope.binding);
          exactFields(actual, [
            'workspaceId',
            'companyId',
            'actorMembershipId',
            'readCapture',
          ]);
          requireBinding(actual, binding);
          encoded = envelope.position;
        } else {
          requireBinding(envelope, binding);
          encoded = Object.fromEntries(
            Object.entries(envelope).filter(
              ([name]) =>
                ![
                  'format',
                  'workspaceId',
                  'companyId',
                  'actorMembershipId',
                  'readCapture',
                ].includes(name),
            ),
          );
        }
        position = input.position.decode(encoded);
      } catch {
        throw input.invalid();
      }
      if (!hasKind(position, kind)) throw input.wrongKind(kind);
      return position;
    },
  };
}

export interface WorkingEvidenceCursorBinding extends ContinuationCursorBinding {
  /** Feature-owned target and consumed native capture identities, in order. */
  context: readonly (string | null | undefined)[];
}

/**
 * Opening authenticates the saved capture. The feature then reauthorizes that
 * exact live grant before reading the position with its complete binding.
 */
export function createWorkingEvidenceContinuationCursor<
  Position extends { kind: WorkingEvidenceCursorKind },
>(input: {
  key: ContinuationCursorKey<Position['kind']>;
  position: {
    encode: (position: Position) => readonly unknown[];
    decode: (input: {
      kind: Position['kind'];
      position: readonly unknown[];
    }) => Position;
  };
  invalid: () => Error;
  wrongKind: (kind: Position['kind']) => Error;
  unavailable: () => Error;
}) {
  return {
    async issue({
      binding,
      position,
    }: {
      binding: WorkingEvidenceCursorBinding;
      position: Position;
    }) {
      let packed: string;
      try {
        if (!/^[a-f0-9]{64}$/u.test(binding.readCapture)) throw new Error();
        packed = Buffer.from(binding.readCapture, 'hex').toString('base64url');
      } catch {
        throw input.unavailable();
      }
      const key = await input.key({
        scope: {
          workspaceId: binding.workspaceId,
          companyId: binding.companyId,
        },
        operation: 'issue',
        kind: position.kind,
      });
      const token = signCursorPayload(key, [
        workingEvidenceProtocol.format,
        workingEvidenceKinds[position.kind],
        packed,
        workingEvidenceBinding(position.kind, binding),
        ...input.position.encode(position),
      ]);
      if (token.length > workingEvidenceProtocol.maximumLength)
        throw input.unavailable();
      return token;
    },
    async open<Kind extends Position['kind']>({
      value,
      scope,
      kind,
    }: {
      value: string;
      scope: ContinuationCursorScope;
      kind: Kind;
    }) {
      if (value.length > workingEvidenceProtocol.maximumLength)
        throw input.invalid();
      const key = await input.key({
        scope: { workspaceId: scope.workspaceId, companyId: scope.companyId },
        operation: 'read',
        kind,
      });
      let captured: {
        kind: string;
        readCapture: string;
        binding: string;
        position: unknown[];
      };
      try {
        const parsed = readCursorPayload(key, value);
        if (!Array.isArray(parsed)) throw new Error();
        const fields: unknown[] = parsed;
        const [format, wireKind, packed, binding, ...position] = fields;
        if (
          format !== workingEvidenceProtocol.format ||
          typeof wireKind !== 'string' ||
          !Object.values(workingEvidenceKinds).includes(wireKind) ||
          typeof packed !== 'string' ||
          typeof binding !== 'string' ||
          !/^[A-Za-z0-9_-]{22}$/u.test(binding) ||
          position.length === 0
        )
          throw new Error();
        const bytes = Buffer.from(packed, 'base64url');
        if (bytes.length !== 32 || bytes.toString('base64url') !== packed)
          throw new Error();
        captured = {
          kind: wireKind,
          readCapture: bytes.toString('hex'),
          binding,
          position,
        };
      } catch {
        throw input.invalid();
      }
      if (captured.kind !== workingEvidenceKinds[kind])
        throw input.wrongKind(kind);
      return {
        readCapture: captured.readCapture,
        read(binding: WorkingEvidenceCursorBinding): Position & { kind: Kind } {
          let position: Position;
          try {
            if (
              binding.workspaceId !== scope.workspaceId ||
              binding.companyId !== scope.companyId ||
              binding.readCapture !== captured.readCapture ||
              workingEvidenceBinding(kind, binding) !== captured.binding
            )
              throw new Error();
            position = input.position.decode({
              kind,
              position: captured.position,
            });
          } catch {
            throw input.invalid();
          }
          if (!hasKind(position, kind)) throw input.wrongKind(kind);
          return position;
        },
      };
    },
  };
}

function workingEvidenceBinding(
  kind: WorkingEvidenceCursorKind,
  binding: WorkingEvidenceCursorBinding,
) {
  return createHash('sha256')
    .update(
      JSON.stringify([
        workingEvidenceProtocol.format,
        kind,
        binding.workspaceId,
        binding.companyId,
        binding.actorMembershipId,
        binding.readCapture,
        ...binding.context,
      ]),
    )
    .digest()
    .subarray(0, 16)
    .toString('base64url');
}

function cursorObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error();
  return Object.fromEntries(Object.entries(value));
}
function exactFields(
  value: Record<string, unknown>,
  fields: readonly string[],
) {
  if (
    Object.keys(value).length !== fields.length ||
    Object.keys(value).some((key) => !fields.includes(key))
  )
    throw new Error();
}
function requireBinding(
  value: Record<string, unknown>,
  expected: ContinuationCursorBinding,
) {
  if (
    value.workspaceId !== expected.workspaceId ||
    value.companyId !== expected.companyId ||
    value.actorMembershipId !== expected.actorMembershipId ||
    value.readCapture !== expected.readCapture
  )
    throw new Error();
}
function hasKind<
  Position extends { kind: string },
  Kind extends Position['kind'],
>(position: Position, kind: Kind): position is Position & { kind: Kind } {
  return position.kind === kind;
}
