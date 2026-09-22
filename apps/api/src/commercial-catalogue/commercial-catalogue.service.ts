import { createHash } from 'node:crypto';
import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, desc, eq, sql } from 'drizzle-orm';
import type { ActorContext } from '../access/access.types.js';
import { requireIdempotencyKey } from '../access/access-command-validation.js';
import { CompanyContextAuthorization } from '../access/company-context-authorization.js';
import { DatabaseContext } from '../database/database-context.js';
import {
  CATALOGUE_PROVENANCE,
  commercialCatalogueCommands,
  commercialCatalogueEvents,
  companyServiceOfferings,
  serviceDefinitions,
} from '../database/schema/index.js';
import {
  catalogueCursor,
  readCatalogueCursor,
  readCatalogueLimit,
} from './commercial-catalogue-pagination.js';
import type {
  CompanyServiceOfferingPage,
  CompanyServiceOfferingRecord,
  CreateCompanyServiceOfferingResult,
  CreateServiceDefinitionResult,
  ServiceDefinitionPage,
  ServiceDefinitionRecord,
} from './commercial-catalogue.types.js';
import {
  readCreateCompanyServiceOfferingCommand,
  readCreateServiceDefinitionCommand,
  readTargetServiceDefinitionId,
} from './commercial-catalogue.validation.js';

type ServiceDefinitionRow = typeof serviceDefinitions.$inferSelect;
type OfferingRow = typeof companyServiceOfferings.$inferSelect;
type ReceiptRow = typeof commercialCatalogueCommands.$inferSelect;
type CatalogueCommand = ReceiptRow['command'];

// Every command follows one order: revalidate live authority under a row lock,
// take the idempotency lock and read the receipt, validate the payload, then
// evaluate uniqueness and commit the record, event and receipt together.
@Injectable()
export class CommercialCatalogueService {
  constructor(
    private readonly databaseContext: DatabaseContext,
    private readonly authorization: CompanyContextAuthorization,
  ) {}

  async createServiceDefinition(
    actor: ActorContext,
    value: unknown,
    key: string | undefined,
  ): Promise<CreateServiceDefinitionResult> {
    return this.databaseContext.transaction(async () => {
      const companyId = await this.authorization.requireServiceCatalogueAccess(
        actor,
        ['service.definition.create'],
        true,
      );
      const idempotencyKey = requireIdempotencyKey(key);
      const fingerprint = commandFingerprint(companyId, value);
      // A Service Definition creation has no target record: the Workspace
      // itself is the scope, so there is no target readability to revalidate.
      await this.lockCommand(actor, companyId, idempotencyKey);
      const receipt = await this.findReceipt(actor, companyId, idempotencyKey);
      if (receipt) {
        requireSameCommand(receipt, 'service_definition.create', fingerprint);
        return {
          outcome: receipt.outcome,
          definition: definitionView(
            await this.requireDefinitionById(
              actor.workspaceId,
              receipt.resultServiceDefinitionId,
            ),
          ),
        };
      }

      const command = readCreateServiceDefinitionCommand(value);
      await this.lockCode(actor.workspaceId, command.code);
      const [existing] = await this.databaseContext.connection
        .select()
        .from(serviceDefinitions)
        .where(
          and(
            eq(serviceDefinitions.workspaceId, actor.workspaceId),
            eq(serviceDefinitions.code, command.code),
          ),
        );
      if (existing) {
        if (
          existing.name !== command.name ||
          existing.description !== command.description
        )
          throw new ConflictException({
            code: 'SERVICE_CODE_CONFLICT',
            message:
              'This Service code already exists in the Workspace with different content.',
          });
        await this.recordReceipt({
          actor,
          companyId,
          command: 'service_definition.create',
          idempotencyKey,
          fingerprint,
          outcome: 'UNCHANGED',
          resultServiceDefinitionId: existing.id,
        });
        return { outcome: 'UNCHANGED', definition: definitionView(existing) };
      }

      const [definition] = await this.databaseContext.connection
        .insert(serviceDefinitions)
        .values({
          workspaceId: actor.workspaceId,
          code: command.code,
          name: command.name,
          description: command.description,
          createdByInternalUserId: actor.internalUserId,
          createdByWorkspaceMembershipId: actor.workspaceMembershipId,
          createdInCompanyId: companyId,
        })
        .returning();
      if (!definition)
        throw new Error('The Service Definition was not recorded.');
      await this.databaseContext.connection
        .insert(commercialCatalogueEvents)
        .values({
          workspaceId: actor.workspaceId,
          companyId,
          action: 'service_definition.created',
          serviceDefinitionId: definition.id,
          actorInternalUserId: actor.internalUserId,
          actorWorkspaceMembershipId: actor.workspaceMembershipId,
          metadata: {
            serviceDefinitionId: definition.id,
            code: definition.code,
            provenance: CATALOGUE_PROVENANCE,
          },
        });
      await this.recordReceipt({
        actor,
        companyId,
        command: 'service_definition.create',
        idempotencyKey,
        fingerprint,
        outcome: 'CREATED',
        resultServiceDefinitionId: definition.id,
      });
      return { outcome: 'CREATED', definition: definitionView(definition) };
    });
  }

  async listServiceDefinitions(
    actor: ActorContext,
    cursorInput: unknown,
    limitInput: unknown,
  ): Promise<ServiceDefinitionPage> {
    await this.authorization.requireServiceCatalogueAccess(actor, [
      'service.definition.read',
    ]);
    const limit = readCatalogueLimit(limitInput);
    const cursor = readCatalogueCursor(cursorInput);
    const rows = await this.databaseContext.connection
      .select({
        definition: serviceDefinitions,
        createdAtCursor: cursorTimestamp(serviceDefinitions.createdAt),
      })
      .from(serviceDefinitions)
      .where(
        and(
          eq(serviceDefinitions.workspaceId, actor.workspaceId),
          cursor
            ? sql<boolean>`(${serviceDefinitions.createdAt}, ${serviceDefinitions.id})
                < (${cursor.createdAt}::timestamptz, ${cursor.id}::uuid)`
            : undefined,
        ),
      )
      .orderBy(desc(serviceDefinitions.createdAt), desc(serviceDefinitions.id))
      .limit(limit + 1);
    const pageRows = rows.slice(0, limit);
    const last = pageRows.at(-1);
    return {
      items: pageRows.map(({ definition }) => definitionView(definition)),
      ...(rows.length > limit && last
        ? {
            nextCursor: catalogueCursor({
              createdAt: last.createdAtCursor,
              id: last.definition.id,
            }),
          }
        : {}),
    };
  }

  async createCompanyServiceOffering(
    actor: ActorContext,
    value: unknown,
    key: string | undefined,
  ): Promise<CreateCompanyServiceOfferingResult> {
    return this.databaseContext.transaction(async () => {
      const companyId = await this.authorization.requireServiceCatalogueAccess(
        actor,
        ['commercial.offering.manage'],
        true,
      );
      const idempotencyKey = requireIdempotencyKey(key);
      const fingerprint = commandFingerprint(companyId, value);
      // The command's target is the Service Definition it names. Its current
      // readability in the actor's Workspace is revalidated before any replay,
      // so a receipt never discloses a target the actor may no longer read.
      const targetId = readTargetServiceDefinitionId(value);
      const definition = targetId
        ? await this.findDefinition(actor.workspaceId, targetId)
        : undefined;
      if (targetId && !definition) throw new NotFoundException();
      await this.lockCommand(actor, companyId, idempotencyKey);
      const receipt = await this.findReceipt(actor, companyId, idempotencyKey);
      if (receipt) {
        requireSameCommand(
          receipt,
          'company_service_offering.create',
          fingerprint,
        );
        return {
          outcome: receipt.outcome,
          offering: await this.requireOfferingById(
            actor.workspaceId,
            companyId,
            receipt.resultOfferingId,
          ),
        };
      }

      const command = readCreateCompanyServiceOfferingCommand(value);
      if (!definition || definition.id !== command.serviceDefinitionId)
        throw new Error('The offering target was not revalidated.');
      await this.lockOffering(actor.workspaceId, companyId, definition.id);
      const [existing] = await this.databaseContext.connection
        .select()
        .from(companyServiceOfferings)
        .where(
          and(
            eq(companyServiceOfferings.workspaceId, actor.workspaceId),
            eq(companyServiceOfferings.companyId, companyId),
            eq(companyServiceOfferings.serviceDefinitionId, definition.id),
            eq(companyServiceOfferings.provenance, CATALOGUE_PROVENANCE),
          ),
        );
      if (existing) {
        if (existing.commercialLabel !== command.commercialLabel)
          throw new ConflictException({
            code: 'OFFERING_CONFLICT',
            message:
              'This Company already offers this Service Definition with a different commercial label.',
          });
        await this.recordReceipt({
          actor,
          companyId,
          command: 'company_service_offering.create',
          idempotencyKey,
          fingerprint,
          outcome: 'UNCHANGED',
          resultOfferingId: existing.id,
        });
        return {
          outcome: 'UNCHANGED',
          offering: offeringView(existing, definition),
        };
      }

      const [offering] = await this.databaseContext.connection
        .insert(companyServiceOfferings)
        .values({
          workspaceId: actor.workspaceId,
          companyId,
          serviceDefinitionId: definition.id,
          commercialLabel: command.commercialLabel,
          createdByInternalUserId: actor.internalUserId,
          createdByWorkspaceMembershipId: actor.workspaceMembershipId,
        })
        .returning();
      if (!offering)
        throw new Error('The Company Service Offering was not recorded.');
      await this.databaseContext.connection
        .insert(commercialCatalogueEvents)
        .values({
          workspaceId: actor.workspaceId,
          companyId,
          action: 'company_service_offering.created',
          serviceDefinitionId: definition.id,
          offeringId: offering.id,
          actorInternalUserId: actor.internalUserId,
          actorWorkspaceMembershipId: actor.workspaceMembershipId,
          metadata: {
            serviceDefinitionId: definition.id,
            offeringId: offering.id,
            code: definition.code,
            provenance: CATALOGUE_PROVENANCE,
          },
        });
      await this.recordReceipt({
        actor,
        companyId,
        command: 'company_service_offering.create',
        idempotencyKey,
        fingerprint,
        outcome: 'CREATED',
        resultOfferingId: offering.id,
      });
      return {
        outcome: 'CREATED',
        offering: offeringView(offering, definition),
      };
    });
  }

  async listCompanyServiceOfferings(
    actor: ActorContext,
    cursorInput: unknown,
    limitInput: unknown,
  ): Promise<CompanyServiceOfferingPage> {
    const companyId = await this.authorization.requireServiceCatalogueAccess(
      actor,
      ['commercial.offering.read'],
    );
    const limit = readCatalogueLimit(limitInput);
    const cursor = readCatalogueCursor(cursorInput);
    const rows = await this.databaseContext.connection
      .select({
        offering: companyServiceOfferings,
        definition: serviceDefinitions,
        createdAtCursor: cursorTimestamp(companyServiceOfferings.createdAt),
      })
      .from(companyServiceOfferings)
      .innerJoin(serviceDefinitions, offeringDefinitionJoin())
      .where(
        and(
          eq(companyServiceOfferings.workspaceId, actor.workspaceId),
          eq(companyServiceOfferings.companyId, companyId),
          cursor
            ? sql<boolean>`(${companyServiceOfferings.createdAt}, ${companyServiceOfferings.id})
                < (${cursor.createdAt}::timestamptz, ${cursor.id}::uuid)`
            : undefined,
        ),
      )
      .orderBy(
        desc(companyServiceOfferings.createdAt),
        desc(companyServiceOfferings.id),
      )
      .limit(limit + 1);
    const pageRows = rows.slice(0, limit);
    const last = pageRows.at(-1);
    return {
      items: pageRows.map(({ offering, definition }) =>
        offeringView(offering, definition),
      ),
      ...(rows.length > limit && last
        ? {
            nextCursor: catalogueCursor({
              createdAt: last.createdAtCursor,
              id: last.offering.id,
            }),
          }
        : {}),
    };
  }

  async getCompanyServiceOffering(
    actor: ActorContext,
    offeringId: string,
  ): Promise<CompanyServiceOfferingRecord> {
    const companyId = await this.authorization.requireServiceCatalogueAccess(
      actor,
      ['commercial.offering.read'],
    );
    const offering = await this.findOffering(
      actor.workspaceId,
      companyId,
      offeringId,
    );
    if (!offering) throw new NotFoundException();
    return offering;
  }

  private async findDefinition(
    workspaceId: string,
    definitionId: string,
  ): Promise<ServiceDefinitionRow | undefined> {
    const [definition] = await this.databaseContext.connection
      .select()
      .from(serviceDefinitions)
      .where(
        and(
          eq(serviceDefinitions.workspaceId, workspaceId),
          eq(serviceDefinitions.id, definitionId),
        ),
      );
    return definition;
  }

  private async requireDefinitionById(
    workspaceId: string,
    definitionId: string | null,
  ): Promise<ServiceDefinitionRow> {
    if (!definitionId) throw new Error('The catalogue receipt is incomplete.');
    const definition = await this.findDefinition(workspaceId, definitionId);
    if (!definition)
      throw new Error('The recorded Service Definition is unavailable.');
    return definition;
  }

  private async requireOfferingById(
    workspaceId: string,
    companyId: string,
    offeringId: string | null,
  ): Promise<CompanyServiceOfferingRecord> {
    if (!offeringId) throw new Error('The catalogue receipt is incomplete.');
    const offering = await this.findOffering(
      workspaceId,
      companyId,
      offeringId,
    );
    if (!offering)
      throw new Error('The recorded Company Service Offering is unavailable.');
    return offering;
  }

  private async findOffering(
    workspaceId: string,
    companyId: string,
    offeringId: string,
  ): Promise<CompanyServiceOfferingRecord | undefined> {
    const [row] = await this.databaseContext.connection
      .select({
        offering: companyServiceOfferings,
        definition: serviceDefinitions,
      })
      .from(companyServiceOfferings)
      .innerJoin(serviceDefinitions, offeringDefinitionJoin())
      .where(
        and(
          eq(companyServiceOfferings.workspaceId, workspaceId),
          eq(companyServiceOfferings.companyId, companyId),
          eq(companyServiceOfferings.id, offeringId),
        ),
      );
    return row ? offeringView(row.offering, row.definition) : undefined;
  }

  private async lockCommand(
    actor: ActorContext,
    companyId: string,
    idempotencyKey: string,
  ): Promise<void> {
    await this.advisoryLock([
      'commercial-catalogue.command',
      actor.workspaceId,
      companyId,
      actor.workspaceMembershipId,
      idempotencyKey,
    ]);
  }

  private async lockCode(workspaceId: string, code: string): Promise<void> {
    await this.advisoryLock(['commercial-catalogue.code', workspaceId, code]);
  }

  private async lockOffering(
    workspaceId: string,
    companyId: string,
    definitionId: string,
  ): Promise<void> {
    await this.advisoryLock([
      'commercial-catalogue.offering',
      workspaceId,
      companyId,
      definitionId,
      CATALOGUE_PROVENANCE,
    ]);
  }

  private async advisoryLock(parts: readonly string[]): Promise<void> {
    const lockKey = JSON.stringify(parts);
    await this.databaseContext.connection.execute(
      sql`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`,
    );
  }

  private async findReceipt(
    actor: ActorContext,
    companyId: string,
    idempotencyKey: string,
  ): Promise<ReceiptRow | undefined> {
    const [receipt] = await this.databaseContext.connection
      .select()
      .from(commercialCatalogueCommands)
      .where(
        and(
          eq(commercialCatalogueCommands.workspaceId, actor.workspaceId),
          eq(commercialCatalogueCommands.companyId, companyId),
          eq(
            commercialCatalogueCommands.actorWorkspaceMembershipId,
            actor.workspaceMembershipId,
          ),
          eq(commercialCatalogueCommands.idempotencyKey, idempotencyKey),
        ),
      );
    return receipt;
  }

  private async recordReceipt(input: {
    actor: ActorContext;
    companyId: string;
    command: CatalogueCommand;
    idempotencyKey: string;
    fingerprint: string;
    outcome: ReceiptRow['outcome'];
    resultServiceDefinitionId?: string;
    resultOfferingId?: string;
  }): Promise<void> {
    await this.databaseContext.connection
      .insert(commercialCatalogueCommands)
      .values({
        workspaceId: input.actor.workspaceId,
        companyId: input.companyId,
        actorWorkspaceMembershipId: input.actor.workspaceMembershipId,
        command: input.command,
        idempotencyKey: input.idempotencyKey,
        fingerprint: input.fingerprint,
        outcome: input.outcome,
        resultServiceDefinitionId: input.resultServiceDefinitionId ?? null,
        resultOfferingId: input.resultOfferingId ?? null,
      });
  }
}

function offeringDefinitionJoin() {
  return and(
    eq(serviceDefinitions.workspaceId, companyServiceOfferings.workspaceId),
    eq(serviceDefinitions.id, companyServiceOfferings.serviceDefinitionId),
  );
}

function cursorTimestamp(
  column:
    | typeof serviceDefinitions.createdAt
    | typeof companyServiceOfferings.createdAt,
) {
  return sql<string>`to_char(
    ${column} AT TIME ZONE 'UTC',
    'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
  )`.as('created_at_cursor');
}

function requireSameCommand(
  receipt: ReceiptRow,
  command: CatalogueCommand,
  fingerprint: string,
): void {
  if (receipt.command !== command || receipt.fingerprint !== fingerprint)
    throw new ConflictException({
      code: 'IDEMPOTENCY_CONFLICT',
      message: 'Idempotency-Key was already used for another command.',
    });
}

// The fingerprint covers the Company and the payload exactly as submitted.
// It is computed before validation so a replay is recognized without
// re-running any later step of the command.
function commandFingerprint(companyId: string, payload: unknown): string {
  return createHash('sha256')
    .update(stableJson({ companyId, payload }))
    .digest('hex');
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (typeof value === 'object' && value !== null)
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`)
      .join(',')}}`;
  return JSON.stringify(value) ?? 'null';
}

function definitionView(row: ServiceDefinitionRow): ServiceDefinitionRecord {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    description: row.description,
    provenance: row.provenance,
    provisional: true,
    createdByWorkspaceMembershipId: row.createdByWorkspaceMembershipId,
    createdAt: row.createdAt.toISOString(),
  };
}

function offeringView(
  row: OfferingRow,
  definition: ServiceDefinitionRow,
): CompanyServiceOfferingRecord {
  return {
    id: row.id,
    companyId: row.companyId,
    serviceDefinitionId: row.serviceDefinitionId,
    serviceDefinition: { code: definition.code, name: definition.name },
    commercialLabel: row.commercialLabel,
    availability: row.availability,
    provenance: row.provenance,
    provisional: true,
    createdByWorkspaceMembershipId: row.createdByWorkspaceMembershipId,
    createdAt: row.createdAt.toISOString(),
  };
}
