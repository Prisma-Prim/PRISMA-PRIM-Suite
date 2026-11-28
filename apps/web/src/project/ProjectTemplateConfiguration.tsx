import { useAuthorityLifetime } from '../access/use-authority-lifetime';
import {
  useActorObservation,
  useRequestLifetime,
} from '../api/use-actor-requests';
import {
  useScopedOperation,
  useScopedOperationGroup,
} from '../api/use-scoped-operation';
import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
} from 'react';
import type { ActorContext } from '../access-types';
import { grantOf, holds } from '../access/company-grants';
import type { BrowserIdentity } from '../access-composition';
import {
  createAuthenticatedApiClient,
  conflictCode,
  type ApiResult,
} from '../api/authenticated-api-client';
import { handleAuthenticatedAccessRejection } from '../api/latest-authenticated-request';
import { formatMessage } from '../localization/messages';
import {
  canUseProjectTemplate,
  canUsePilotTemplate,
  ProjectTemplateSelector,
  projectTemplateAuthority,
} from './ProjectTemplate';
import {
  readTemplateCataloguePage,
  readTemplatePublication,
  type IllustrativeTemplateVersion,
  type TemplateSelection,
  illustrativeTemplateKey,
} from './project-template-response';
import { useProjectTemplateVersionCopy } from './project-template-version.copy';
import './project-template-configuration.css';

export type ProjectTemplateConfigurationProps = {
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
  | { kind: 'ready'; source: IllustrativeTemplateVersion; drafts: string[] };
type Command = { body: string; key: string; sourceVersion: number };
type Mutation =
  | { kind: 'idle' | 'invalid' | 'stale' | 'keyConflict' }
  | { kind: 'pending' | 'uncertain'; command: Command }
  | { kind: 'confirmed'; version: number };

export function canReadProjectTemplateCatalogue(actor: ActorContext) {
  return (
    holds(actor.activeCompany, 'company_project_access', 'project.read') &&
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
    grantOf(company, 'company_project_access')?.permissions,
    grantOf(company, 'company_project_template_user'),
    grantOf(company, 'company_project_template_configuration'),
  ]);
}

/** Dedicated configuration state cannot retire independently mounted Project or Task owners. */
export function ProjectTemplateConfiguration(
  props: ProjectTemplateConfigurationProps,
) {
  return (
    <>
      {canUsePilotTemplate(props.actor) && (
        <PilotTemplateInspector
          key={projectTemplateAuthority(props.actor)}
          actor={props.actor}
          identity={props.identity}
        />
      )}
      <ConfigurationSection
        key={projectTemplateConfigurationAuthority(props.actor)}
        {...props}
      />
    </>
  );
}
export function PilotTemplateInspector({
  actor,
  identity,
}: Pick<ProjectTemplateConfigurationProps, 'actor' | 'identity'>) {
  const [selection, setSelection] = useState<TemplateSelection | null>(null);
  useEffect(() => setSelection(null), [identity]);
  return (
    <ProjectTemplateSelector
      actor={actor}
      identity={identity}
      purpose="inspection"
      selection={selection}
      onSelection={setSelection}
      disabled={false}
    />
  );
}
/**
 * The illustrative template's next-version publication, shared by both
 * interfaces: the head version's four literal Task titles as drafts, and an
 * exact publication whose unanswered request is retried unchanged.
 */
export function useTemplateConfiguration({
  actor,
  identity,
  onCatalogueChanged,
  onActivityRecorded,
  onActorRevalidated = () => undefined,
  onCompanyContextRejected = () => undefined,
  onWorkspaceAccessRejected = () => undefined,
}: ProjectTemplateConfigurationProps) {
  const [read, setRead] = useState<Read>({ kind: 'loading' });
  const [mutation, setMutation] = useState<Mutation>({ kind: 'idle' });
  const ownerScope = String(
    useRequestLifetime(identity, projectTemplateConfigurationAuthority(actor)),
  );
  const reads = useScopedOperation(ownerScope);
  const writes = useScopedOperationGroup(ownerScope);
  const observation = useActorObservation(actor);
  const captureRecovery = useAuthorityLifetime(String(observation), identity);
  const companyId = actor.activeCompany?.id;
  const canPublish = holds(
    actor.activeCompany,
    'company_project_template_configuration',
    'project.template.version.create',
  );
  const callbacks = useRef({
    onCatalogueChanged,
    onActivityRecorded,
    onActorRevalidated,
    onCompanyContextRejected,
    onWorkspaceAccessRejected,
  });
  useLayoutEffect(() => {
    callbacks.current = {
      onCatalogueChanged,
      onActivityRecorded,
      onActorRevalidated,
      onCompanyContextRejected,
      onWorkspaceAccessRejected,
    };
  });

  async function reject(
    result: ApiResult<unknown>,
    signal: AbortSignal,
    recoveryCurrent: () => boolean,
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
        signal,
        isCurrent: () => !signal.aborted && recoveryCurrent(),
      });
    } catch {
      /* The received denial remains definite even if revalidation is unavailable. */
    }
  }
  async function load(resetCommand = true) {
    if (resetCommand) {
      writes.retire();
      setMutation({ kind: 'idle' });
    }
    const signal = reads.begin();
    if (!signal) return;
    const recoveryCurrent = captureRecovery();
    setRead({ kind: 'loading' });
    if (!canReadProjectTemplateCatalogue(actor)) {
      setRead({ kind: 'denied' });
      return;
    }
    try {
      const api = await createAuthenticatedApiClient(identity);
      if (signal.aborted) return;
      const result = await api.request('/project-templates', {
        companyContextId: companyId,
        signal,
      });
      if (signal.aborted) return;
      if (result.status === 'unauthorized' || result.status === 'forbidden') {
        await reject(result, signal, recoveryCurrent);
        return;
      }
      const catalogue =
        result.status === 'ok'
          ? readTemplateCataloguePage(result.value)
          : undefined;
      const source = catalogue?.templates.find(
        (template) => template.version === catalogue.headVersion,
      );
      if (!source || source.templateKey !== illustrativeTemplateKey) {
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
      if (!signal.aborted) setRead({ kind: 'error' });
    }
  }
  useEffect(() => {
    void load();
  }, [ownerScope]);

  async function publish(command: Command) {
    if (writes.isPending()) return;
    const operation = writes.begin();
    if (!operation) return;
    const { signal } = operation;
    const recoveryCurrent = captureRecovery();
    setMutation({ kind: 'pending', command });
    try {
      const api = await createAuthenticatedApiClient(identity);
      if (signal.aborted) return;
      const result = await api.request(
        '/project-templates/CONSULTING_PREPARATION_ILLUSTRATIVE/versions',
        {
          method: 'POST',
          body: command.body,
          headers: {
            'content-type': 'application/json',
            'idempotency-key': command.key,
          },
          companyContextId: companyId,
          signal,
        },
      );
      if (signal.aborted) return;
      if (result.status === 'unauthorized' || result.status === 'forbidden') {
        await reject(result, signal, recoveryCurrent);
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
      // Later refresh failure cannot change an acknowledged publication into an uncertain one.
      void Promise.allSettled([
        Promise.resolve().then(() => {
          if (!signal.aborted) callbacks.current.onCatalogueChanged?.();
        }),
        Promise.resolve().then(() => {
          if (!signal.aborted) return callbacks.current.onActivityRecorded?.();
        }),
      ]);
      await load(false);
    } catch {
      if (!signal.aborted) setMutation({ kind: 'uncertain', command });
    } finally {
      operation.release();
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
  return {
    read,
    mutation,
    canPublish,
    busy,
    protectedCommand,
    blocked,
    unchanged,
    valid,
    load,
    publish,
    submit,
    /** Edits the draft Task title at this position and clears the last outcome. */
    editTitle: (index: number, value: string) => {
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
    },
  };
}

function ConfigurationSection(props: ProjectTemplateConfigurationProps) {
  const copy = useProjectTemplateVersionCopy();
  const heading = useId();
  const {
    read,
    mutation,
    canPublish,
    protectedCommand,
    blocked,
    unchanged,
    valid,
    load,
    publish,
    submit,
    editTitle,
  } = useTemplateConfiguration(props);
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
                      onChange={(event) => editTitle(index, event.target.value)}
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
