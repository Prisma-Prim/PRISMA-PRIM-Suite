import { createHash, randomBytes, randomUUID } from 'node:crypto';
import {
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';
import type { ActorContext } from '../access/access.types.js';
import { requireUuid } from '../access/access-command-validation.js';
import { runClientReferenceTransaction } from '../client/client-reference-transaction.js';
import { DatabaseContext } from '../database/database-context.js';
import {
  dossierHarnessAuthorizations as auth,
  dossierHarnessConnections as connections,
} from '../database/schema/dossier-harness.js';
import { DossierRunService } from '../dossier-analysis/run.service.js';
import { CredentialVault, harnessConfiguration } from './configuration.js';
import { commandBody, commandText } from './commands.js';
import {
  ChatGptPlanClient,
  object,
  text,
  PlanFailure,
  type PlanTokens,
} from './provider.js';

interface Credentials {
  tokens: PlanTokens;
  subject: string;
  endpoints: { token: string; jwks: string; revoke: string | null };
  models: { id: string; label: string }[];
}
export const ownerKey = (actor: ActorContext, companyId: string) =>
  JSON.stringify([actor.workspaceId, companyId, actor.workspaceMembershipId]);
const hash = (s: string) => createHash('sha256').update(s).digest('hex');

@Injectable()
export class DossierHarnessConnectionService {
  constructor(
    private readonly db: DatabaseContext,
    private readonly runs: DossierRunService,
    readonly client: ChatGptPlanClient,
  ) {}

  async transaction<T>(
    actor: ActorContext,
    projectId: string,
    work: (companyId: string) => Promise<T>,
  ) {
    return runClientReferenceTransaction({
      database: this.db,
      work: async () => {
        const project = await this.runs.projectWithinTransaction(
          actor,
          requireUuid(projectId),
          true,
        );
        await this.db.connection.execute(
          sql`SELECT pg_advisory_xact_lock(hashtextextended(${ownerKey(actor, project.companyId)}, 0))`,
        );
        return work(project.companyId);
      },
    });
  }
  configuration() {
    const c = harnessConfiguration();
    if (!c)
      throw new ServiceUnavailableException({ code: 'configuration_required' });
    return c;
  }
  filter(actor: ActorContext, companyId: string) {
    return and(
      eq(connections.workspaceId, actor.workspaceId),
      eq(connections.companyId, companyId),
      eq(connections.actorId, actor.workspaceMembershipId),
    );
  }
  async row(actor: ActorContext, companyId: string) {
    const [row] = await this.db.connection
      .select()
      .from(connections)
      .where(this.filter(actor, companyId))
      .for('update');
    return row;
  }
  credentials(
    encrypted: string,
    actor: ActorContext,
    companyId: string,
  ): Credentials {
    const c = this.configuration();
    const v = object(
      new CredentialVault(c.key).open(encrypted, ownerKey(actor, companyId)),
    );
    const t = object(v.tokens),
      e = object(v.endpoints);
    if (
      typeof t.expiresAt !== 'number' ||
      !Array.isArray(t.scopes) ||
      !t.scopes.every((s: unknown) => typeof s === 'string') ||
      !Array.isArray(v.models)
    )
      throw new PlanFailure('reauth');
    return {
      tokens: {
        accessToken: text(t.accessToken),
        refreshToken: text(t.refreshToken),
        idToken: text(t.idToken),
        expiresAt: t.expiresAt,
        scopes: t.scopes,
      },
      subject: text(v.subject, 512),
      endpoints: {
        token: text(e.token),
        jwks: text(e.jwks),
        revoke: e.revoke === null ? null : text(e.revoke),
      },
      models: v.models.map((m) => {
        const x = object(m);
        return { id: text(x.id, 120), label: text(x.label, 240) };
      }),
    };
  }
  async status(actor: ActorContext, projectId: string) {
    return this.transaction(actor, projectId, async (companyId) => {
      if (!harnessConfiguration())
        return { state: 'configuration_required', account: null, models: [] };
      const row = await this.row(actor, companyId);
      if (!row?.encrypted)
        return { state: 'disconnected', account: null, models: [] };
      if (row.clientId !== this.configuration().clientId)
        return { state: 'disconnected', account: null, models: [] };
      try {
        const saved = this.credentials(row.encrypted, actor, companyId);
        return { state: 'connected', account: row.label, models: saved.models };
      } catch (error) {
        if (!(error instanceof PlanFailure)) throw error;
        return { state: 'disconnected', account: null, models: [] };
      }
    });
  }
  async start(actor: ActorContext, projectId: string) {
    const c = this.configuration();
    await this.transaction(actor, projectId, async () => undefined);
    const endpoints = await this.client.discovery();
    const state = randomBytes(32).toString('base64url'),
      verifier = randomBytes(48).toString('base64url'),
      nonce = randomBytes(32).toString('base64url');
    const stateHash = hash(state);
    await this.transaction(actor, projectId, async (companyId) => {
      let connection = await this.row(actor, companyId);
      if (!connection) {
        [connection] = await this.db.connection
          .insert(connections)
          .values({
            id: randomUUID(),
            workspaceId: actor.workspaceId,
            companyId,
            actorId: actor.workspaceMembershipId,
            clientId: c.clientId,
            identityKey: '',
            label: '',
            epoch: 1,
            authRevision: 0,
            updatedAt: new Date(),
          })
          .returning();
      }
      if (!connection) throw new PlanFailure('unavailable');
      const authRevision = connection.authRevision + 1;
      await this.db.connection
        .update(connections)
        .set({ authRevision })
        .where(eq(connections.id, connection.id));
      await this.db.connection
        .delete(auth)
        .where(
          and(
            eq(auth.workspaceId, actor.workspaceId),
            eq(auth.actorId, actor.workspaceMembershipId),
            eq(auth.companyId, companyId),
            eq(auth.projectId, projectId),
          ),
        );
      await this.db.connection.insert(auth).values({
        stateHash,
        workspaceId: actor.workspaceId,
        companyId,
        actorId: actor.workspaceMembershipId,
        projectId,
        encrypted: new CredentialVault(c.key).seal(
          {
            verifier,
            nonce,
            endpoints,
            clientId: c.clientId,
            redirectUri: c.redirectUri,
            authRevision,
          },
          ownerKey(actor, companyId),
        ),
        expiresAt: new Date(Date.now() + 10 * 60_000),
      });
    });
    const url = new URL(endpoints.authorization);
    url.search = new URLSearchParams({
      client_id: c.clientId,
      redirect_uri: c.redirectUri,
      response_type: 'code',
      scope:
        'openid profile email offline_access resource.invoke chatgpt.tokens.use.direct',
      resource: 'https://api.openai.com/v1',
      state,
      nonce,
      code_challenge_method: 'S256',
      code_challenge: createHash('sha256').update(verifier).digest('base64url'),
    }).toString();
    return { authorizationUrl: url.href, state };
  }
  async complete(actor: ActorContext, projectId: string, value: unknown) {
    const body = commandBody(value, ['state', 'code']),
      state = commandText(body.state, 100),
      code = commandText(body.code, 4096);
    const c = this.configuration();
    const pending = await this.transaction(
      actor,
      projectId,
      async (companyId) => {
        const [attempt] = await this.db.connection
          .delete(auth)
          .where(
            and(
              eq(auth.stateHash, hash(state)),
              eq(auth.workspaceId, actor.workspaceId),
              eq(auth.companyId, companyId),
              eq(auth.projectId, projectId),
              eq(auth.actorId, actor.workspaceMembershipId),
            ),
          )
          .returning();
        if (!attempt) throw new NotFoundException();
        return { companyId, attempt };
      },
    );
    if (pending.attempt.expiresAt.getTime() <= Date.now())
      throw new ConflictException({ code: 'authorization_expired' });
    const saved = object(
      new CredentialVault(c.key).open(
        pending.attempt.encrypted,
        ownerKey(actor, pending.companyId),
      ),
    );
    if (saved.clientId !== c.clientId || saved.redirectUri !== c.redirectUri)
      throw new ConflictException({ code: 'configuration_changed' });
    const endpoints = object(saved.endpoints);
    const tokens = await this.client.exchange({
      endpoint: text(endpoints.token),
      clientId: c.clientId,
      redirectUri: c.redirectUri,
      code,
      verifier: text(saved.verifier),
    });
    const account = await this.client.verify({
      idToken: tokens.idToken,
      jwks: text(endpoints.jwks),
      clientId: c.clientId,
      nonce: text(saved.nonce),
    });
    const models = await this.client.models(tokens.accessToken);
    if (!models.length) throw new PlanFailure('reauth');
    const credentials: Credentials = {
      tokens,
      subject: account.subject,
      models,
      endpoints: {
        token: text(endpoints.token),
        jwks: text(endpoints.jwks),
        revoke: endpoints.revoke === null ? null : text(endpoints.revoke),
      },
    };
    await this.transaction(actor, projectId, async (companyId) => {
      const old = await this.row(actor, companyId);
      if (!old || old.authRevision !== saved.authRevision)
        throw new ConflictException({ code: 'authorization_retired' });
      const data = {
        clientId: c.clientId,
        identityKey: hash(JSON.stringify([c.clientId, account.subject])),
        label: account.label,
        encrypted: new CredentialVault(c.key).seal(
          credentials,
          ownerKey(actor, companyId),
        ),
        epoch: (old?.epoch ?? 0) + 1,
        refreshLease: null,
        refreshUntil: null,
        updatedAt: new Date(),
      };
      if (old)
        await this.db.connection
          .update(connections)
          .set(data)
          .where(eq(connections.id, old.id));
      else
        await this.db.connection.insert(connections).values({
          ...data,
          id: randomUUID(),
          workspaceId: actor.workspaceId,
          companyId,
          actorId: actor.workspaceMembershipId,
        });
    });
    return this.status(actor, projectId);
  }
  async disconnect(actor: ActorContext, projectId: string) {
    const saved = await this.transaction(
      actor,
      projectId,
      async (companyId) => {
        const row = await this.row(actor, companyId);
        let credentials: ReturnType<
          DossierHarnessConnectionService['credentials']
        > | null = null;
        if (row?.encrypted) {
          try {
            credentials = this.credentials(row.encrypted, actor, companyId);
          } catch (error) {
            if (!(error instanceof PlanFailure)) throw error;
          }
        }
        if (row)
          await this.db.connection
            .update(connections)
            .set({
              encrypted: null,
              label: '',
              authRevision: row.authRevision + 1,
              epoch: row.epoch + 1,
              refreshLease: null,
              refreshUntil: null,
              updatedAt: new Date(),
            })
            .where(eq(connections.id, row.id));
        return row?.encrypted ? { credentials, clientId: row.clientId } : null;
      },
    );
    const remoteRevoked =
      !saved ||
      (saved.credentials !== null &&
        (await this.client.revoke(
          saved.credentials.endpoints.revoke,
          saved.clientId,
          saved.credentials.tokens.refreshToken,
        )));
    return { state: 'disconnected', remoteRevoked };
  }
  async use(
    actor: ActorContext,
    projectId: string,
    expected?: { id: string; epoch: number },
  ) {
    const lease = randomUUID();
    const captured = await this.transaction(
      actor,
      projectId,
      async (companyId) => {
        const row = await this.row(actor, companyId);
        if (
          !row?.encrypted ||
          row.clientId !== this.configuration().clientId ||
          (expected && (row.id !== expected.id || row.epoch !== expected.epoch))
        )
          throw new PlanFailure('reauth');
        const saved = this.credentials(row.encrypted, actor, companyId);
        if (row.refreshLease)
          throw new ConflictException({
            code:
              row.refreshUntil && row.refreshUntil.getTime() > Date.now()
                ? 'connection_busy'
                : 'reauthorization_required',
          });
        const refresh = saved.tokens.expiresAt <= Date.now() + 60_000;
        if (refresh)
          await this.db.connection
            .update(connections)
            .set({
              refreshLease: lease,
              refreshUntil: new Date(Date.now() + 120_000),
            })
            .where(eq(connections.id, row.id));
        return { companyId, row, saved, refresh };
      },
    );
    if (!captured.refresh)
      return { ...captured, token: captured.saved.tokens.accessToken };
    try {
      const tokens = await this.client.refresh({
        endpoint: captured.saved.endpoints.token,
        clientId: captured.row.clientId,
        current: captured.saved.tokens,
      });
      if (tokens.idToken !== captured.saved.tokens.idToken)
        await this.client.verify({
          idToken: tokens.idToken,
          jwks: captured.saved.endpoints.jwks,
          clientId: captured.row.clientId,
          subject: captured.saved.subject,
        });
      const saved = { ...captured.saved, tokens };
      await this.transaction(actor, projectId, async (companyId) => {
        const row = await this.row(actor, companyId);
        if (
          !row ||
          row.refreshLease !== lease ||
          row.epoch !== captured.row.epoch ||
          !row.encrypted
        )
          throw new PlanFailure('reauth');
        await this.db.connection
          .update(connections)
          .set({
            encrypted: new CredentialVault(this.configuration().key).seal(
              saved,
              ownerKey(actor, companyId),
            ),
            refreshLease: null,
            refreshUntil: null,
            updatedAt: new Date(),
          })
          .where(eq(connections.id, row.id));
      });
      return { ...captured, saved, token: tokens.accessToken };
    } catch (e) {
      await this.transaction(actor, projectId, async (companyId) => {
        const row = await this.row(actor, companyId);
        if (row?.refreshLease === lease)
          await this.db.connection
            .update(connections)
            .set({
              encrypted: null,
              epoch: row.epoch + 1,
              refreshLease: null,
              refreshUntil: null,
              updatedAt: new Date(),
            })
            .where(eq(connections.id, row.id));
      });
      throw e;
    }
  }
}
