import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

// The idempotency protocol every versioned command promises, as scenarios a
// REST suite registers against one command. Each scenario arranges a fresh
// target and asserts through the command's public seam and its durable
// traces only.

export interface CommandAttempt {
  readonly status: number;
  readonly body: unknown;
}

export interface VersionedCommandTarget {
  /**
   * A command that changes this target observed at `expectedVersion`. The
   * two variants differ in payload and each changes the arranged target.
   */
  payload(input: {
    readonly expectedVersion: number;
    readonly variant: 'first' | 'second';
  }): unknown;
  /** Submits the command as the actor under test with this key. */
  submit(input: {
    readonly value: unknown;
    readonly key: string;
  }): Promise<CommandAttempt>;
  /** The target's current version, as a client would observe it. */
  version(): Promise<number>;
  /**
   * Everything an accepted command durably leaves, such as the target row,
   * its receipts and its events. Compared whole before and after an attempt.
   */
  writes(): Promise<unknown>;
  /** Commits a later change to the target through another key or command. */
  changeLater(): Promise<void>;
  /** Withdraws the authority the command requires from the actor under test. */
  revokeAuthority(): Promise<void>;
}

export interface VersionedCommandProtocol {
  /** A fresh target the actor under test may change. */
  arrange(): Promise<VersionedCommandTarget>;
  /** The status of an accepted command. */
  readonly acceptedStatus: number;
  /** The recorded receipt inside an accepted response body. */
  receipt(body: unknown): unknown;
}

export interface ProtocolScenario {
  readonly name: string;
  run(): Promise<void>;
}

export function versionedCommandProtocolScenarios(
  protocol: VersionedCommandProtocol,
): readonly ProtocolScenario[] {
  // Arranges a target and commits the first variant under a fresh key.
  async function accepted() {
    const target = await protocol.arrange();
    const key = randomUUID();
    const observed = await target.version();
    const value = target.payload({
      expectedVersion: observed,
      variant: 'first',
    });
    const first = await target.submit({ value, key });
    assert.equal(first.status, protocol.acceptedStatus);
    assert.equal(await target.version(), observed + 1);
    return {
      target,
      key,
      observed,
      value,
      receipt: protocol.receipt(first.body),
    };
  }

  async function expectNoWrite(
    target: VersionedCommandTarget,
    attempt: () => Promise<CommandAttempt>,
  ): Promise<CommandAttempt> {
    const before = await target.writes();
    const result = await attempt();
    assert.deepEqual(await target.writes(), before);
    return result;
  }

  return [
    {
      name: 'replays an exact retry with its recorded receipt and no new write or event',
      run: async () => {
        const { target, key, value, receipt } = await accepted();
        const replay = await expectNoWrite(target, () =>
          target.submit({ value, key }),
        );
        assert.equal(replay.status, protocol.acceptedStatus);
        assert.deepEqual(protocol.receipt(replay.body), receipt);
      },
    },
    {
      name: 'refuses a changed payload under the same key without writing',
      run: async () => {
        const { target, key, observed } = await accepted();
        const changed = await expectNoWrite(target, () =>
          target.submit({
            value: target.payload({
              expectedVersion: observed,
              variant: 'second',
            }),
            key,
          }),
        );
        assert.equal(changed.status, 409);
        assert.equal(code(changed.body), 'IDEMPOTENCY_CONFLICT');
      },
    },
    {
      name: 'refuses a stale observed version under a new key without writing',
      run: async () => {
        const { target, observed } = await accepted();
        const stale = await expectNoWrite(target, () =>
          target.submit({
            value: target.payload({
              expectedVersion: observed,
              variant: 'second',
            }),
            key: randomUUID(),
          }),
        );
        assert.equal(stale.status, 409);
        assert.equal(code(stale.body), 'STALE_VERSION');
      },
    },
    {
      name: 'replays the recorded receipt after a later change instead of reporting staleness',
      run: async () => {
        const { target, key, observed, value, receipt } = await accepted();
        await target.changeLater();
        assert.ok((await target.version()) > observed + 1);
        const replay = await expectNoWrite(target, () =>
          target.submit({ value, key }),
        );
        assert.equal(replay.status, protocol.acceptedStatus);
        assert.deepEqual(protocol.receipt(replay.body), receipt);
      },
    },
    {
      name: 'denies even an exact replay once the authority is revoked',
      run: async () => {
        const { target, key, value } = await accepted();
        await target.revokeAuthority();
        const denied = await expectNoWrite(target, () =>
          target.submit({ value, key }),
        );
        assert.equal(denied.status, 403);
      },
    },
  ];
}

function code(body: unknown): unknown {
  return typeof body === 'object' && body !== null && 'code' in body
    ? body.code
    : undefined;
}
