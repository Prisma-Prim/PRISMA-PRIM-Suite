import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import type { ActorContext } from '../access-types';
import type { BrowserIdentity } from '../access-composition';
import {
  createAuthenticatedApiClient,
  conflictCode,
  type ApiResult,
} from '../api/authenticated-api-client';
import { handleAuthenticatedAccessRejection } from '../api/latest-authenticated-request';
import { formatMessage } from '../localization/messages';
import { canUseProjectTemplate } from './ProjectTemplate';
import {
  readTemplateCataloguePage,
  readTemplatePublication,
  type SelectableTemplateVersion,
} from './project-template-response';
import { useProjectTemplateVersionCopy } from './project-template-version.copy';
import './project-template-configuration.css';

type Props = {
  actor: ActorContext;
  identity: BrowserIdentity;
  onCatalogueChanged?: () => void;
  onActivityRecorded?: () => void | Promise<void>;
  onActorRevalidated?: (actor: ActorContext) => void | Promise<void>;
  onCompanyContextRejected?: (companyId: string) => void;
  onWorkspaceAccessRejected?: () => void | Promise<void>;
};
type Read =
  | { kind: 'loading' | 'error' | 'denied' }
  | { kind: 'ready'; source: SelectableTemplateVersion; drafts: string[] };
type Command = { body: string; key: string; sourceVersion: number };
type Mutation =
  | { kind: 'idle' | 'invalid' | 'stale' | 'keyConflict' }
  | { kind: 'pending' | 'uncertain'; command: Command }
  | { kind: 'confirmed'; version: number };

export function canReadProjectTemplateCatalogue(actor: ActorContext) {
  return (
    !!actor.activeCompany &&
    actor.activeCompany.projectPermissions?.includes('project.read') === true &&
    canUseProjectTemplate(actor)
  );
}
export function projectTemplateConfigurationAuthority(actor: ActorContext) {
  const company = actor.activeCompany;
  return JSON.stringify([
    actor.internalUserId,
    actor.workspaceId,
    actor.workspaceMembershipId,
    company?.id,
    company?.projectPermissions,
    company?.projectTemplatePermissions,
    company?.projectTemplatePermissionAssignmentId,
    company?.projectTemplatePermissionSetVersion,
    company?.projectTemplateConfigurationPermissions,
    company?.projectTemplateConfigurationPermissionAssignmentId,
    company?.projectTemplateConfigurationPermissionSetVersion,
  ]);
}

/** Dedicated configuration state cannot retire independently mounted Project or Task owners. */
export function ProjectTemplateConfiguration(props: Props) {
  return (
    <ConfigurationSection
      key={projectTemplateConfigurationAuthority(props.actor)}
      {...props}
    />
  );
}
function ConfigurationSection({
  actor,
  identity,
  onCatalogueChanged,
  onActivityRecorded,
  onActorRevalidated = () => undefined,
  onCompanyContextRejected = () => undefined,
  onWorkspaceAccessRejected = () => undefined,
}: Props) {
  const copy = useProjectTemplateVersionCopy();
  const heading = useId();
  const [read, setRead] = useState<Read>({ kind: 'loading' });
  const [mutation, setMutation] = useState<Mutation>({ kind: 'idle' });
  const readRequest = useRef<AbortController | null>(null);
  const commandRequest = useRef<AbortController | null>(null);
  const companyId = actor.activeCompany?.id;
  const canPublish =
    actor.activeCompany?.projectTemplateConfigurationPermissionSetVersion ===
      'v1' &&
    !!actor.activeCompany.projectTemplateConfigurationPermissionAssignmentId &&
    actor.activeCompany.projectTemplateConfigurationPermissions?.includes(
      'project.template.version.create',
    ) === true;
  const callbacks = useRef({
    onCatalogueChanged,
    onActivityRecorded,
    onActorRevalidated,
    onCompanyContextRejected,
    onWorkspaceAccessRejected,
  });
  callbacks.current = {
    onCatalogueChanged,
    onActivityRecorded,
    onActorRevalidated,
    onCompanyContextRejected,
    onWorkspaceAccessRejected,
  };

  async function reject(
    result: ApiResult<unknown>,
    controller: AbortController,
  ) {
    setRead({ kind: 'denied' });
    setMutation({ kind: 'idle' });
    callbacks.current.onCatalogueChanged?.();
    try {
      await handleAuthenticatedAccessRejection({
        result,
        identity,
        companyContextId: companyId,
        onActorRevalidated: callbacks.current.onActorRevalidated,
        onCompanyContextRejected: callbacks.current.onCompanyContextRejected,
        onWorkspaceAccessRejected: callbacks.current.onWorkspaceAccessRejected,
        signal: controller.signal,
      });
    } catch {
      /* The received denial remains definite even if revalidation is unavailable. */
    }
  }
  async function load(resetCommand = true) {
    readRequest.current?.abort();
    if (resetCommand) {
      commandRequest.current?.abort();
      setMutation({ kind: 'idle' });
    }
    const controller = new AbortController();
    readRequest.current = controller;
    setRead({ kind: 'loading' });
    if (!canReadProjectTemplateCatalogue(actor)) {
      setRead({ kind: 'denied' });
      return;
    }
    try {
      const api = await createAuthenticatedApiClient(identity);
      if (controller.signal.aborted) return;
      const result = await api.request<unknown>('/project-templates', {
        companyContextId: companyId,
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      if (result.status === 'unauthorized' || result.status === 'forbidden') {
        await reject(result, controller);
        return;
      }
      const catalogue =
        result.status === 'ok'
          ? readTemplateCataloguePage(result.value)
          : undefined;
      const source = catalogue?.templates.find(
        (template) => template.version === catalogue.headVersion,
      );
      if (!source) {
        setRead({ kind: 'error' });
        return;
      }
      setRead({
        kind: 'ready',
        source,
        drafts: source.stages.flatMap((stage) =>
          stage.tasks.map((task) => task.title),
        ),
      });
    } catch {
      if (!controller.signal.aborted) setRead({ kind: 'error' });
    }
  }
  useEffect(() => {
    void load();
    return () => {
      readRequest.current?.abort();
      commandRequest.current?.abort();
    };
  }, [identity]);

  async function publish(command: Command) {
    const controller = new AbortController();
    commandRequest.current?.abort();
    commandRequest.current = controller;
    setMutation({ kind: 'pending', command });
    try {
      const api = await createAuthenticatedApiClient(identity);
      if (controller.signal.aborted) return;
      const result = await api.request<unknown>(
        '/project-templates/CONSULTING_PREPARATION_ILLUSTRATIVE/versions',
        {
          method: 'POST',
          body: command.body,
          headers: {
            'content-type': 'application/json',
            'idempotency-key': command.key,
          },
          companyContextId: companyId,
          signal: controller.signal,
        },
      );
      if (controller.signal.aborted) return;
      if (result.status === 'unauthorized' || result.status === 'forbidden') {
        await reject(result, controller);
        return;
      }
      if (result.status === 'conflict') {
        setMutation({
          kind:
            conflictCode(result) === 'template_publication_key_conflict'
              ? 'keyConflict'
              : 'stale',
        });
        return;
      }
      if (result.status === 'validation') {
        setMutation({ kind: 'invalid' });
        return;
      }
      const receipt =
        result.status === 'ok'
          ? readTemplatePublication(result.value)
          : undefined;
      if (!receipt || receipt.sourceVersion !== command.sourceVersion) {
        setMutation({ kind: 'uncertain', command });
        return;
      }
      setMutation({ kind: 'confirmed', version: receipt.version });
      callbacks.current.onCatalogueChanged?.();
      // Later refresh failure cannot change an acknowledged publication into an uncertain one.
      void Promise.resolve()
        .then(() => callbacks.current.onActivityRecorded?.())
        .catch(() => undefined);
      await load(false);
    } catch {
      if (!controller.signal.aborted)
        setMutation({ kind: 'uncertain', command });
    }
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    if (read.kind !== 'ready' || !canPublish) return;
    const titles = read.drafts.map((title) => title.trim());
    if (
      titles.length !== 4 ||
      titles.some((title) => title.length < 1 || title.length > 200)
    ) {
      setMutation({ kind: 'invalid' });
      return;
    }
    const tasks = read.source.stages.flatMap((stage) => stage.tasks);
    if (!titles.some((title, index) => title !== tasks[index]?.title)) return;
    const taskTitles = Object.fromEntries(
      tasks.map((task, index) => [task.key, titles[index]]),
    );
    void publish({
      body: JSON.stringify({
        sourceVersion: read.source.version,
        expectedHeadVersion: read.source.version,
        taskTitles,
      }),
      key: crypto.randomUUID(),
      sourceVersion: read.source.version,
    });
  }
  const busy = mutation.kind === 'pending';
  const protectedCommand = busy || mutation.kind === 'uncertain';
  const blocked =
    protectedCommand ||
    mutation.kind === 'stale' ||
    mutation.kind === 'keyConflict';
  const unchanged =
    read.kind === 'ready' &&
    read.drafts.every(
      (title, index) =>
        title.trim() ===
        read.source.stages.flatMap((stage) => stage.tasks)[index]?.title,
    );
  const valid =
    read.kind === 'ready' &&
    read.drafts.every(
      (title) => title.trim().length >= 1 && title.trim().length <= 200,
    );
  return (
    <section
      className="project-template-configuration"
      aria-label={copy('region')}
    >
      <h3 id={heading}>{copy('heading')}</h3>
      <p>{copy('notice')}</p>
      {mutation.kind === 'confirmed' && (
        <p role="status">
          {formatMessage(copy('published'), { version: mutation.version })}
        </p>
      )}
      {read.kind !== 'ready' ? (
        <>
          <p role={read.kind === 'loading' ? 'status' : 'alert'}>
            {copy(read.kind)}
          </p>
          {read.kind !== 'loading' && (
            <button type="button" onClick={() => void load()}>
              {copy('reload')}
            </button>
          )}
        </>
      ) : (
        <>
          <p>
            {read.source.title} —{' '}
            {formatMessage(copy('source'), { version: read.source.version })}
          </p>
          {!canPublish ? (
            <p>{copy('readOnly')}</p>
          ) : (
            <form onSubmit={submit} aria-labelledby={heading}>
              <div className="project-template-title-fields">
                {read.drafts.map((title, index) => (
                  <label key={index}>
                    {formatMessage(copy('field'), { number: index + 1 })}
                    <input
                      value={title}
                      maxLength={200}
                      disabled={blocked}
                      onChange={(event) => {
                        const value = event.target.value;
                        setRead((current) =>
                          current.kind === 'ready'
                            ? {
                                ...current,
                                drafts: current.drafts.map((draft, position) =>
                                  position === index ? value : draft,
                                ),
                              }
                            : current,
                        );
                        setMutation({ kind: 'idle' });
                      }}
                    />
                  </label>
                ))}
              </div>
              <h4>{copy('preview')}</h4>
              <ol aria-label={copy('preview')}>
                {read.drafts.map((title, index) => (
                  <li key={index}>{title.trim()}</li>
                ))}
              </ol>
              {unchanged && <p>{copy('unchanged')}</p>}
              {!valid && <p role="alert">{copy('invalid')}</p>}
              <button type="submit" disabled={blocked || unchanged || !valid}>
                {copy('publish')}
              </button>
            </form>
          )}
        </>
      )}
      {mutation.kind === 'pending' && <p role="status">{copy('pending')}</p>}
      {mutation.kind === 'invalid' && <p role="alert">{copy('invalid')}</p>}
      {(mutation.kind === 'stale' || mutation.kind === 'keyConflict') && (
        <p role="alert">{copy(mutation.kind)}</p>
      )}
      {mutation.kind === 'uncertain' && (
        <>
          <p role="alert">{copy('uncertain')}</p>
          <button type="button" onClick={() => void publish(mutation.command)}>
            {copy('retry')}
          </button>
        </>
      )}
      {read.kind === 'ready' && (
        <button
          type="button"
          disabled={protectedCommand}
          onClick={() => void load()}
        >
          {copy('reload')}
        </button>
      )}
    </section>
  );
}
