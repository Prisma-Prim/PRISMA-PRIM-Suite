import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  HttpException,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { and, desc, eq, inArray, lt, or } from 'drizzle-orm';
import type { ActorContext } from '../access/access.types.js';
import { requireIdempotencyKey } from '../access/access-command-validation.js';
import { OperationalRiskAccessService } from '../access/operational-risk-access.service.js';
import { AccountabilityService } from '../accountability/accountability.service.js';
import { SERVER_CLOCK, type ServerClock } from '../clock/server-clock.js';
import { DatabaseContext } from '../database/database-context.js';
import {
  operationalRisks,
  operationalRiskEntries,
  operationalRiskReceipts,
} from '../database/schema/index.js';
import {
  operationalRiskFingerprint,
  operationalRiskReplay,
  type OperationalRiskCommandKind,
} from './operational-risk.command.js';
import {
  buildOperationalRiskRecord,
  readOperationalRiskEntry,
  readOperationalRiskResult,
} from './operational-risk.persistence.js';
import type {
  OperationalRiskEntry,
  OperationalRiskPage,
  OperationalRiskRecord,
  OperationalRiskResult,
  OperationalRiskSummary,
} from './operational-risk.types.js';
import {
  equalOperationalRiskFacts,
  readOperationalRiskCorrection,
  readOperationalRiskHistoryCursor,
  readOperationalRiskIntake,
  readOperationalRiskJournal,
  readOperationalRiskListCursor,
  readOperationalRiskPagination,
  uuid,
} from './operational-risk.validation.js';

interface Command {
  actor: ActorContext;
  body: unknown;
  key: string | undefined;
}
type RiskRow = typeof operationalRisks.$inferSelect;
type EntryRow = typeof operationalRiskEntries.$inferSelect;

@Injectable()
export class OperationalRiskService {
  constructor(
    private readonly database: DatabaseContext,
    private readonly access: OperationalRiskAccessService,
    private readonly accountability: AccountabilityService,
    @Inject(SERVER_CLOCK) private readonly clock: ServerClock,
  ) {}

  record({ actor, body, key }: Command): Promise<OperationalRiskResult> {
    return this.command(async () => {
      const companyId = await this.access.requireActor({
        actor,
        record: true,
        lock: true,
      });
      const idempotencyKey = requireIdempotencyKey(key);
      const fingerprint = operationalRiskFingerprint({ body });
      const replay = await operationalRiskReplay({
        connection: this.database.connection,
        actor,
        companyId,
        kind: 'record',
        key: idempotencyKey,
        fingerprint,
      });
      if (replay) return replay;
      const facts = readOperationalRiskIntake(body);
      const recordedAt = this.now();
      const riskId = randomUUID();
      const [risk] = await this.database.connection
        .insert(operationalRisks)
        .values({
          id: riskId,
          workspaceId: actor.workspaceId,
          companyId,
          revision: 1,
          currentIntakeRevision: 1,
          createdAt: recordedAt,
        })
        .returning();
      if (!risk) throw new Error('The Risk identity was not recorded.');
      const [entry] = await this.database.connection
        .insert(operationalRiskEntries)
        .values({
          ...this.attribution({
            actor,
            companyId,
            riskId,
            revision: 1,
            recordedAt,
          }),
          kind: 'intake-recorded',
          payload: { facts },
        })
        .returning();
      if (!entry) throw new Error('The Risk intake was not recorded.');
      return this.finish({
        actor,
        companyId,
        risk,
        entry,
        kind: 'record',
        key: idempotencyKey,
        fingerprint,
        recordedAt,
      });
    });
  }

  append({
    actor,
    riskId: submittedId,
    body,
    key,
  }: Command & { riskId: string }): Promise<OperationalRiskResult> {
    return this.command(async () => {
      const companyId = await this.access.requireActor({
        actor,
        record: true,
        lock: true,
      });
      const riskId = uuid(submittedId);
      const idempotencyKey = requireIdempotencyKey(key);
      const fingerprint = operationalRiskFingerprint({
        riskId: submittedId,
        body,
      });
      const replay = await operationalRiskReplay({
        connection: this.database.connection,
        actor,
        companyId,
        kind: 'journal',
        key: idempotencyKey,
        fingerprint,
        riskId,
      });
      if (replay) return replay;
      const input = readOperationalRiskJournal(body);
      const risk = await this.findRisk({
        actor,
        companyId,
        riskId,
        lock: true,
      });
      const next = this.nextRevision(risk, input.expectedRevision);
      const recordedAt = this.now();
      const [entry] = await this.database.connection
        .insert(operationalRiskEntries)
        .values({
          ...this.attribution({
            actor,
            companyId,
            riskId,
            revision: next,
            recordedAt,
          }),
          kind: input.kind,
          payload: { narrative: input.narrative, occurredOn: input.occurredOn },
        })
        .returning();
      if (!entry) throw new Error('The Risk follow-up was not recorded.');
      const updated = await this.advance({
        risk,
        next,
        currentIntakeRevision: risk.currentIntakeRevision,
      });
      return this.finish({
        actor,
        companyId,
        risk: updated,
        entry,
        kind: 'journal',
        key: idempotencyKey,
        fingerprint,
        recordedAt,
      });
    });
  }

  correct({
    actor,
    riskId: submittedId,
    body,
    key,
  }: Command & { riskId: string }): Promise<OperationalRiskResult> {
    return this.command(async () => {
      const companyId = await this.access.requireActor({
        actor,
        record: true,
        lock: true,
      });
      const riskId = uuid(submittedId);
      const idempotencyKey = requireIdempotencyKey(key);
      const fingerprint = operationalRiskFingerprint({
        riskId: submittedId,
        body,
      });
      const replay = await operationalRiskReplay({
        connection: this.database.connection,
        actor,
        companyId,
        kind: 'correct',
        key: idempotencyKey,
        fingerprint,
        riskId,
      });
      if (replay) return replay;
      const input = readOperationalRiskCorrection(body);
      const risk = await this.findRisk({
        actor,
        companyId,
        riskId,
        lock: true,
      });
      const next = this.nextRevision(risk, input.expectedRevision);
      const current = await this.readRecord(risk);
      if (input.predecessorId !== current.currentIntake.id) this.stale();
      if (equalOperationalRiskFacts(current.currentIntake.facts, input.facts))
        throw new BadRequestException({
          code: 'UNCHANGED_RISK_FACTS',
          message: 'A correction must change an intake fact.',
        });
      const recordedAt = this.now();
      const [entry] = await this.database.connection
        .insert(operationalRiskEntries)
        .values({
          ...this.attribution({
            actor,
            companyId,
            riskId,
            revision: next,
            recordedAt,
          }),
          kind: 'intake-corrected',
          predecessorId: current.currentIntake.id,
          predecessorRevision: risk.currentIntakeRevision,
          payload: { facts: input.facts, reason: input.reason },
        })
        .returning();
      if (!entry) throw new Error('The Risk correction was not recorded.');
      const updated = await this.advance({
        risk,
        next,
        currentIntakeRevision: next,
      });
      return this.finish({
        actor,
        companyId,
        risk: updated,
        entry,
        kind: 'correct',
        key: idempotencyKey,
        fingerprint,
        recordedAt,
      });
    });
  }

  list({
    actor,
    query,
  }: {
    actor: ActorContext;
    query: unknown;
  }): Promise<OperationalRiskPage<OperationalRiskSummary>> {
    return this.read(async () => {
      const companyId = await this.access.requireActor({ actor });
      const page = readOperationalRiskPagination(query);
      const cursor = readOperationalRiskListCursor(page.cursor);
      const rows = await this.database.connection
        .select({ risk: operationalRisks, entry: operationalRiskEntries })
        .from(operationalRisks)
        .innerJoin(
          operationalRiskEntries,
          and(
            eq(
              operationalRiskEntries.workspaceId,
              operationalRisks.workspaceId,
            ),
            eq(operationalRiskEntries.companyId, operationalRisks.companyId),
            eq(operationalRiskEntries.riskId, operationalRisks.id),
            eq(
              operationalRiskEntries.revision,
              operationalRisks.currentIntakeRevision,
            ),
          ),
        )
        .where(
          and(
            eq(operationalRisks.workspaceId, actor.workspaceId),
            eq(operationalRisks.companyId, companyId),
            cursor
              ? or(
                  lt(operationalRisks.createdAt, new Date(cursor.createdAt)),
                  and(
                    eq(operationalRisks.createdAt, new Date(cursor.createdAt)),
                    lt(operationalRisks.id, cursor.id),
                  ),
                )
              : undefined,
          ),
        )
        .orderBy(desc(operationalRisks.createdAt), desc(operationalRisks.id))
        .limit(page.limit + 1);
      const items = rows.slice(0, page.limit).map(({ risk, entry }) => {
        const intake = readOperationalRiskEntry(entry);
        if (
          intake.kind !== 'intake-recorded' &&
          intake.kind !== 'intake-corrected'
        )
          throw new Error('The current Risk intake is invalid.');
        return {
          id: risk.id,
          companyId,
          revision: risk.revision,
          process: intake.facts.process,
          createdAt: risk.createdAt.toISOString(),
        };
      });
      const last = items.at(-1);
      return {
        items,
        next_cursor:
          rows.length > page.limit && last
            ? Buffer.from(
                JSON.stringify({ createdAt: last.createdAt, id: last.id }),
              ).toString('base64url')
            : null,
      };
    });
  }

  detail({
    actor,
    riskId,
  }: {
    actor: ActorContext;
    riskId: string;
  }): Promise<OperationalRiskRecord> {
    return this.read(async () => {
      const companyId = await this.access.requireActor({ actor });
      return this.readRecord(
        await this.findRisk({ actor, companyId, riskId: uuid(riskId) }),
      );
    });
  }

  history({
    actor,
    riskId,
    query,
  }: {
    actor: ActorContext;
    riskId: string;
    query: unknown;
  }): Promise<OperationalRiskPage<OperationalRiskEntry>> {
    return this.read(async () => {
      const companyId = await this.access.requireActor({ actor });
      const risk = await this.findRisk({
        actor,
        companyId,
        riskId: uuid(riskId),
      });
      const page = readOperationalRiskPagination(query);
      const cursor = readOperationalRiskHistoryCursor(page.cursor);
      const rows = await this.database.connection
        .select()
        .from(operationalRiskEntries)
        .where(
          and(
            eq(operationalRiskEntries.workspaceId, actor.workspaceId),
            eq(operationalRiskEntries.companyId, companyId),
            eq(operationalRiskEntries.riskId, risk.id),
            cursor === undefined
              ? undefined
              : lt(operationalRiskEntries.revision, cursor),
          ),
        )
        .orderBy(desc(operationalRiskEntries.revision))
        .limit(page.limit + 1);
      const items = rows.slice(0, page.limit).map(readOperationalRiskEntry);
      const last = items.at(-1);
      return {
        items,
        next_cursor:
          rows.length > page.limit && last ? String(last.revision) : null,
      };
    });
  }

  private async findRisk({
    actor,
    companyId,
    riskId,
    lock = false,
  }: {
    actor: ActorContext;
    companyId: string;
    riskId: string;
    lock?: boolean;
  }): Promise<RiskRow> {
    const query = this.database.connection
      .select()
      .from(operationalRisks)
      .where(
        and(
          eq(operationalRisks.workspaceId, actor.workspaceId),
          eq(operationalRisks.companyId, companyId),
          eq(operationalRisks.id, riskId),
        ),
      );
    const [row] = lock ? await query.for('update') : await query;
    if (!row) throw new NotFoundException();
    return row;
  }

  private async readRecord(row: RiskRow): Promise<OperationalRiskRecord> {
    const rows = await this.database.connection
      .select()
      .from(operationalRiskEntries)
      .where(
        and(
          eq(operationalRiskEntries.workspaceId, row.workspaceId),
          eq(operationalRiskEntries.companyId, row.companyId),
          eq(operationalRiskEntries.riskId, row.id),
          inArray(operationalRiskEntries.revision, [
            ...new Set([1, row.currentIntakeRevision]),
          ]),
        ),
      );
    const original = rows.find((entry) => entry.revision === 1);
    const current = rows.find(
      (entry) => entry.revision === row.currentIntakeRevision,
    );
    if (!original || !current)
      throw new Error('The Risk intake history is incomplete.');
    return buildOperationalRiskRecord({
      row,
      original: readOperationalRiskEntry(original),
      current: readOperationalRiskEntry(current),
    });
  }

  private async advance({
    risk,
    next,
    currentIntakeRevision,
  }: {
    risk: RiskRow;
    next: number;
    currentIntakeRevision: number;
  }): Promise<RiskRow> {
    const [updated] = await this.database.connection
      .update(operationalRisks)
      .set({ revision: next, currentIntakeRevision })
      .where(
        and(
          eq(operationalRisks.workspaceId, risk.workspaceId),
          eq(operationalRisks.companyId, risk.companyId),
          eq(operationalRisks.id, risk.id),
          eq(operationalRisks.revision, risk.revision),
        ),
      )
      .returning();
    if (!updated) this.stale();
    return updated;
  }

  private async finish({
    actor,
    companyId,
    risk,
    entry,
    kind,
    key,
    fingerprint,
    recordedAt,
  }: {
    actor: ActorContext;
    companyId: string;
    risk: RiskRow;
    entry: EntryRow;
    kind: OperationalRiskCommandKind;
    key: string;
    fingerprint: string;
    recordedAt: Date;
  }): Promise<OperationalRiskResult> {
    const result = readOperationalRiskResult(
      {
        risk: await this.readRecord(risk),
        entry: readOperationalRiskEntry(entry),
      },
      { companyId, riskId: risk.id },
    );
    const envelope = {
      actor,
      companyId,
      riskId: risk.id,
      entryId: entry.id,
      revision: risk.revision,
      recordedAt,
    };
    switch (result.entry.kind) {
      case 'intake-recorded':
        await this.accountability.recordOperationalRiskEvent({
          ...envelope,
          action: 'operational_risk.recorded',
        });
        break;
      case 'intake-corrected':
        await this.accountability.recordOperationalRiskEvent({
          ...envelope,
          action: 'operational_risk.intake.corrected',
        });
        break;
      case 'observation':
      case 'reassessment':
        await this.accountability.recordOperationalRiskEvent({
          ...envelope,
          action: 'operational_risk.journal.recorded',
          kind: result.entry.kind,
        });
        break;
      default:
        assertNever(result.entry);
    }
    const [receipt] = await this.database.connection
      .insert(operationalRiskReceipts)
      .values({
        workspaceId: actor.workspaceId,
        companyId,
        actorMembershipId: actor.workspaceMembershipId,
        commandKind: kind,
        idempotencyKey: key,
        fingerprint,
        riskId: risk.id,
        response: result,
        recordedAt,
      })
      .returning({ id: operationalRiskReceipts.id });
    if (!receipt) throw new Error('The Risk command receipt was not recorded.');
    return result;
  }

  private attribution({
    actor,
    companyId,
    riskId,
    revision,
    recordedAt,
  }: {
    actor: ActorContext;
    companyId: string;
    riskId: string;
    revision: number;
    recordedAt: Date;
  }) {
    return {
      id: randomUUID(),
      workspaceId: actor.workspaceId,
      companyId,
      riskId,
      revision,
      actorInternalUserId: actor.internalUserId,
      actorMembershipId: actor.workspaceMembershipId,
      actorDisplayName: actor.displayName,
      recordedAt,
    };
  }

  private now(): Date {
    const value = this.clock.now();
    if (!(value instanceof Date) || !Number.isFinite(value.getTime()))
      throw new Error('The Risk server clock is invalid.');
    return value;
  }

  private nextRevision(row: RiskRow, expected: number): number {
    if (row.revision !== expected) this.stale();
    if (row.revision === 2147483647)
      throw new ConflictException({
        code: 'RISK_REVISION_EXHAUSTED',
        message: 'This Risk cannot record another revision.',
      });
    return row.revision + 1;
  }

  private stale(): never {
    throw new ConflictException({
      code: 'STALE_RISK_REVISION',
      message: 'Reload the Risk before making a new command.',
    });
  }

  private command<Result>(work: () => Promise<Result>): Promise<Result> {
    return this.protect(() => this.database.transaction(work));
  }

  private read<Result>(work: () => Promise<Result>): Promise<Result> {
    return this.protect(() =>
      this.database.transaction(work, {
        isolationLevel: 'repeatable read',
        accessMode: 'read only',
      }),
    );
  }

  private async protect<Result>(work: () => Promise<Result>): Promise<Result> {
    try {
      return await work();
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new InternalServerErrorException({
        code: 'RISK_OUTCOME_UNCONFIRMED',
        message:
          'The Risk outcome could not be confirmed. Retry the unchanged command or reload.',
      });
    }
  }
}

function assertNever(value: never): never {
  throw new Error(`Unknown Risk history kind: ${typeof value}`);
}
