import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, desc, eq, lt, sql } from 'drizzle-orm';
import { requireIdempotencyKey } from '../access/access-command-validation.js';
import type { ActorContext } from '../access/access.types.js';
import { ProjectTemplateAccessService } from '../access/project-template-access.service.js';
import { AccountabilityService } from '../accountability/accountability.service.js';
import { DatabaseContext } from '../database/database-context.js';
import {
  projectTemplateVersionCommands,
  projectTemplateVersions,
} from '../database/schema/project-template-version.js';
import {
  CONSULTING_PREPARATION_V1,
  isCompatibleIllustrativeTemplate,
  readTemplateSnapshot,
} from './project-template.definition.js';
import {
  publicationInput,
  requireTemplateKey,
  requireTemplateVersion,
} from './project-template-version.types.js';

type VersionRow = typeof projectTemplateVersions.$inferSelect;
const PAGE_SIZE = 20;

@Injectable()
export class ProjectTemplateVersionService {
  constructor(
    private readonly database: DatabaseContext,
    private readonly access: ProjectTemplateAccessService,
    private readonly accountability: AccountabilityService,
  ) {}

  async catalogue(actor: ActorContext, before?: string) {
    const beforeVersion =
      before === undefined ? undefined : versionParameter(before);
    return this.database.transaction(
      async () => {
        const companyId = await this.access.requireActor(actor);
        const head = await this.head({ actor, companyId });
        const rows = await this.database.connection
          .select()
          .from(projectTemplateVersions)
          .where(
            and(
              eq(projectTemplateVersions.workspaceId, actor.workspaceId),
              eq(projectTemplateVersions.companyId, companyId),
              eq(
                projectTemplateVersions.templateKey,
                CONSULTING_PREPARATION_V1.templateKey,
              ),
              beforeVersion === undefined
                ? undefined
                : lt(projectTemplateVersions.version, beforeVersion),
            ),
          )
          .orderBy(desc(projectTemplateVersions.version))
          .limit(PAGE_SIZE + 1);
        const sources = rows.map(readCompatibleSuccessor);
        if (
          rows.length <= PAGE_SIZE &&
          (beforeVersion === undefined || beforeVersion > 1)
        )
          sources.push(CONSULTING_PREPARATION_V1);
        const templates = sources.slice(0, PAGE_SIZE);
        return {
          templates,
          headVersion: head.version,
          nextBeforeVersion:
            sources.length > PAGE_SIZE
              ? (templates.at(-1)?.version ?? null)
              : null,
        };
      },
      { isolationLevel: 'repeatable read', accessMode: 'read only' },
    );
  }

  async read(actor: ActorContext, templateKey: string, parameter: string) {
    requireTemplateKey(templateKey);
    const version = versionParameter(parameter);
    return this.database.transaction(
      async () => {
        const companyId = await this.access.requireActor(actor);
        const source = await this.sourceWithinTransaction({
          actor,
          companyId,
          version,
        });
        return { template: source };
      },
      { isolationLevel: 'repeatable read', accessMode: 'read only' },
    );
  }

  /** Source resolution stays in the caller's creation transaction and exact captured Version. */
  async sourceWithinTransaction({
    actor,
    companyId,
    version,
  }: {
    actor: ActorContext;
    companyId: string;
    version: number;
  }) {
    if (version === 1) return CONSULTING_PREPARATION_V1;
    const [row] = await this.database.connection
      .select()
      .from(projectTemplateVersions)
      .where(
        and(
          eq(projectTemplateVersions.workspaceId, actor.workspaceId),
          eq(projectTemplateVersions.companyId, companyId),
          eq(
            projectTemplateVersions.templateKey,
            CONSULTING_PREPARATION_V1.templateKey,
          ),
          eq(projectTemplateVersions.version, version),
        ),
      );
    if (!row) throw new NotFoundException();
    return readCompatibleSuccessor(row);
  }

  async publish({
    actor,
    templateKey,
    body,
    key,
  }: {
    actor: ActorContext;
    templateKey: string;
    body: unknown;
    key: string | undefined;
  }) {
    requireTemplateKey(templateKey);
    const input = publicationInput(body);
    const idempotencyKey = requireIdempotencyKey(key);
    return this.database.transaction(async () => {
      await this.lock([
        'project.template.version.command',
        actor.workspaceId,
        actor.workspaceMembershipId,
        idempotencyKey,
      ]);
      const companyId = await this.access.requireActor(actor, {
        publish: true,
        lock: true,
      });
      const fingerprint = JSON.stringify({ companyId, templateKey, ...input });
      const [committed] = await this.database.connection
        .select({
          command: projectTemplateVersionCommands,
          version: projectTemplateVersions,
        })
        .from(projectTemplateVersionCommands)
        .innerJoin(
          projectTemplateVersions,
          and(
            eq(
              projectTemplateVersions.workspaceId,
              projectTemplateVersionCommands.workspaceId,
            ),
            eq(
              projectTemplateVersions.companyId,
              projectTemplateVersionCommands.companyId,
            ),
            eq(
              projectTemplateVersions.id,
              projectTemplateVersionCommands.versionId,
            ),
          ),
        )
        .where(
          and(
            eq(projectTemplateVersionCommands.workspaceId, actor.workspaceId),
            eq(
              projectTemplateVersionCommands.actorMembershipId,
              actor.workspaceMembershipId,
            ),
            eq(projectTemplateVersionCommands.idempotencyKey, idempotencyKey),
          ),
        );
      if (committed) {
        if (committed.command.fingerprint !== fingerprint)
          throw new ConflictException({
            code: 'template_publication_key_conflict',
          });
        return receipt(committed.version);
      }
      // One linear succession, including the implicit code-defined baseline head.
      await this.lock([
        'project.template.version.head',
        actor.workspaceId,
        companyId,
        templateKey,
      ]);
      const source = await this.head({ actor, companyId });
      if (source.version !== input.expectedHeadVersion)
        throw new ConflictException({
          code: 'template_publication_stale_head',
        });
      if (
        source.stages.every((stage) =>
          stage.tasks.every(
            (task) => input.taskTitles[task.key] === task.title,
          ),
        )
      )
        throw new BadRequestException(
          'Change at least one required Task title.',
        );
      const snapshot = {
        ...source,
        version: source.version + 1,
        stages: source.stages.map((stage) => ({
          ...stage,
          tasks: stage.tasks.map((task) => {
            const title = input.taskTitles[task.key];
            if (title === undefined)
              throw new Error('Missing validated Task title.');
            return { ...task, title };
          }),
        })),
      };
      const version =
        await this.accountability.recordProjectTemplateVersionCreated({
          actor,
          companyId,
          snapshot,
          sourceVersion: source.version,
        });
      await this.database.connection
        .insert(projectTemplateVersionCommands)
        .values({
          workspaceId: actor.workspaceId,
          companyId,
          actorMembershipId: actor.workspaceMembershipId,
          idempotencyKey,
          fingerprint,
          versionId: version.id,
        });
      return receipt(version);
    });
  }

  private async head({
    actor,
    companyId,
  }: {
    actor: ActorContext;
    companyId: string;
  }) {
    const [row] = await this.database.connection
      .select()
      .from(projectTemplateVersions)
      .where(
        and(
          eq(projectTemplateVersions.workspaceId, actor.workspaceId),
          eq(projectTemplateVersions.companyId, companyId),
          eq(
            projectTemplateVersions.templateKey,
            CONSULTING_PREPARATION_V1.templateKey,
          ),
        ),
      )
      .orderBy(desc(projectTemplateVersions.version))
      .limit(1);
    return row ? readCompatibleSuccessor(row) : CONSULTING_PREPARATION_V1;
  }
  private async lock(identity: readonly string[]) {
    const key = JSON.stringify(identity);
    await this.database.connection.execute(
      sql`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`,
    );
  }
}
/** Validate only new successor rows; historical Project copies retain their owning decoder. */
function readCompatibleSuccessor(row: VersionRow) {
  const source = readTemplateSnapshot(row.snapshot);
  if (
    !isCompatibleIllustrativeTemplate(source) ||
    row.version < 2 ||
    row.sourceVersion !== row.version - 1 ||
    source.templateKey !== row.templateKey ||
    source.version !== row.version
  )
    throw new Error('Invalid stored compatible Project Template successor.');
  return source;
}
function versionParameter(value: string) {
  if (!/^[1-9][0-9]*$/.test(value))
    throw new BadRequestException('Select an exact Template Version.');
  return requireTemplateVersion(Number(value));
}
function receipt(row: VersionRow) {
  return {
    versionId: row.id,
    templateKey: row.templateKey,
    version: row.version,
    sourceVersion: row.sourceVersion,
  };
}
