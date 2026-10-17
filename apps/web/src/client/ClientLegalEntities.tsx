import {
  type FormEvent,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react';
import type { BrowserIdentity } from '../access-composition';
import type { ActorContext } from '../access-types';
import {
  handleAuthenticatedAccessRejection,
  runLatestAuthenticatedRequest,
} from '../api/latest-authenticated-request';
import { resolveRetryCommand, type RetryCommand } from './client-command';
import { ClientDirectoryFeedback } from './ClientDirectoryFeedback';
import {
  readClientLegalEntityList,
  readClientLegalEntityMutation,
  type ClientLegalEntity,
} from './client-legal-entities-response';
import { useClientLegalEntitiesCopy } from './client-legal-entities.copy';
import './client-legal-entities.css';

const MAXIMUM_LEGAL_NAME_LENGTH = 200;
const MAXIMUM_TAX_ID_LENGTH = 500;
const MAXIMUM_LEGAL_ADDRESS_LENGTH = 2_000;

type ListState =
  | { status: 'loading' | 'error' | 'unavailable' }
  | {
      status: 'ready';
      clientVersion: number;
      legalEntities: ClientLegalEntity[];
    };

interface Draft {
  legalName: string;
  taxId: string;
  legalAddress: string;
}
type DraftField = keyof Draft;
interface Values {
  legalName: string;
  taxId: string | null;
  legalAddress: string | null;
}

/** An open form keeps the Client version it observed until it closes. */
type Editor =
  | { mode: 'closed' }
  | { mode: 'add'; observedVersion: number; draft: Draft }
  | {
      mode: 'correct';
      observedVersion: number;
      legalEntity: ClientLegalEntity;
      draft: Draft;
    };

type ValidationMessageKey =
  | 'legalNameRequired'
  | 'legalNameTooLong'
  | 'taxIdTooLong'
  | 'legalAddressTooLong'
  | 'unchanged'
  | 'invalid';

type Outcome =
  | {
      status:
        | 'idle'
        | 'submitting'
        | 'uncertain'
        | 'stale'
        | 'capacity'
        | 'recorded'
        | 'corrected';
    }
  | { status: 'invalid'; messageKey: ValidationMessageKey; field?: DraftField };

/**
 * The additional Client Legal Entities of one visible dossier. Mutations use
 * the version observed with the list; each confirmed one hands the new Client
 * version back to the dossier owner. When the owner confirms a newer dossier
 * version, a closed section refreshes once; an open form keeps its version.
 */
export function ClientLegalEntities({
  clientAccountId,
  dossierVersion,
  companyContextId,
  canUpdate,
  identity,
  onCompanyContextRejected,
  onActorRevalidated,
  onWorkspaceAccessRejected,
  onClientVersionChanged,
  onActivityRecorded,
}: {
  clientAccountId: string;
  /** The dossier version its owner last observed or confirmed. */
  dossierVersion: number;
  companyContextId: string;
  canUpdate: boolean;
  identity: BrowserIdentity;
  onCompanyContextRejected: (companyContextId: string) => void;
  onActorRevalidated: (actor: ActorContext) => Promise<void> | void;
  onWorkspaceAccessRejected: () => Promise<void> | void;
  onClientVersionChanged: (clientVersion: number) => void;
  onActivityRecorded: () => Promise<void>;
}) {
  const copy = useClientLegalEntitiesCopy();
  const titleId = useId();
  const formTitleId = useId();
  const fieldErrorId = useId();
  const [list, setList] = useState<ListState>({ status: 'loading' });
  const [editor, setEditor] = useState<Editor>({ mode: 'closed' });
  const [outcome, setOutcome] = useState<Outcome>({ status: 'idle' });
  /** The one quiet refresh started for a newer dossier version. */
  const [refresh, setRefresh] = useState<
    { dossierVersion: number; pending: boolean } | undefined
  >(undefined);
  const heading = useRef<HTMLHeadingElement>(null);
  const fields = useRef<Partial<Record<DraftField, HTMLElement | null>>>({});
  const retryCommand = useRef<RetryCommand | undefined>(undefined);
  const pendingList = useRef<AbortController | undefined>(undefined);
  const pendingMutation = useRef<AbortController | undefined>(undefined);
  const rejectCompanyContext = useRef(onCompanyContextRejected);
  rejectCompanyContext.current = onCompanyContextRejected;
  const acceptRevalidatedActor = useRef(onActorRevalidated);
  acceptRevalidatedActor.current = onActorRevalidated;
  const rejectWorkspaceAccess = useRef(onWorkspaceAccessRejected);
  rejectWorkspaceAccess.current = onWorkspaceAccessRejected;
  const publishClientVersion = useRef(onClientVersionChanged);
  publishClientVersion.current = onClientVersionChanged;

  const rejectedAccess = useCallback(
    (
      result: Parameters<
        typeof handleAuthenticatedAccessRejection
      >[0]['result'],
      signal: AbortSignal,
    ) =>
      handleAuthenticatedAccessRejection({
        result,
        identity,
        companyContextId,
        onCompanyContextRejected: (rejectedCompanyId) =>
          rejectCompanyContext.current(rejectedCompanyId),
        onActorRevalidated: (revalidatedActor) =>
          acceptRevalidatedActor.current(revalidatedActor),
        onWorkspaceAccessRejected: () => rejectWorkspaceAccess.current(),
        signal,
      }),
    [companyContextId, identity],
  );

  /** A quiet refresh keeps the current list visible until the new read. */
  const load = useCallback(
    async ({ quiet }: { quiet: boolean }): Promise<void> => {
      if (!quiet) setList({ status: 'loading' });
      await runLatestAuthenticatedRequest({
        pending: pendingList,
        identity,
        execute: (api, signal) =>
          api.request<unknown>(
            `/clients/${encodeURIComponent(clientAccountId)}/legal-entities`,
            { companyContextId, signal },
          ),
        async onResult(result, signal) {
          if (signal.aborted) return;
          const rejection = await rejectedAccess(result, signal);
          if (signal.aborted) return;
          if (rejection || result.status === 'notFound') {
            setList({ status: 'unavailable' });
            return;
          }
          if (result.status !== 'ok') {
            setList({ status: 'error' });
            return;
          }
          const observed = readClientLegalEntityList(result.value);
          setList({
            status: 'ready',
            ...observed,
          });
          publishClientVersion.current(observed.clientVersion);
        },
        onError: () => setList({ status: 'error' }),
      });
    },
    [clientAccountId, companyContextId, identity, rejectedAccess],
  );

  useEffect(() => {
    void load({ quiet: false });
    return () => {
      pendingList.current?.abort();
      pendingMutation.current?.abort();
    };
  }, [load]);

  const editorKey =
    editor.mode === 'correct' ? editor.legalEntity.id : editor.mode;
  useEffect(() => {
    if (editorKey !== 'closed') fields.current.legalName?.focus();
  }, [editorKey]);

  function open(next: Exclude<Editor, { mode: 'closed' }>) {
    retryCommand.current = undefined;
    setOutcome({ status: 'idle' });
    setEditor(next);
  }

  function close() {
    retryCommand.current = undefined;
    setEditor({ mode: 'closed' });
    setOutcome({ status: 'idle' });
    heading.current?.focus();
  }

  function reload() {
    close();
    void load({ quiet: false });
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (editor.mode === 'closed' || outcome.status === 'submitting') return;
    const checked = checkDraft(editor.draft);
    if (checked.status === 'invalid') {
      setOutcome(checked);
      fields.current[checked.field]?.focus();
      return;
    }
    const mutation = mutationFor({
      clientAccountId,
      editor,
      values: checked.values,
    });
    if (!mutation) {
      setOutcome({ status: 'invalid', messageKey: 'unchanged' });
      return;
    }
    // An uncertain outcome keeps the exact body and key, so saving the
    // unchanged form again retries the same command.
    const command = resolveRetryCommand(
      JSON.stringify(mutation.body),
      retryCommand.current,
    );
    retryCommand.current = command;
    const confirmedOutcome = editor.mode === 'add' ? 'recorded' : 'corrected';
    setOutcome({ status: 'submitting' });

    await runLatestAuthenticatedRequest({
      pending: pendingMutation,
      identity,
      execute: (api, signal) =>
        api.request<unknown>(mutation.path, {
          method: mutation.method,
          headers: {
            'content-type': 'application/json',
            'idempotency-key': command.idempotencyKey,
          },
          companyContextId,
          body: command.serializedBody,
          signal,
        }),
      async onResult(result, signal) {
        if (signal.aborted) return;
        const rejection = await rejectedAccess(result, signal);
        if (signal.aborted) return;
        if (rejection || result.status === 'notFound') {
          retryCommand.current = undefined;
          setEditor({ mode: 'closed' });
          setOutcome({ status: 'idle' });
          setList({ status: 'unavailable' });
          return;
        }
        if (result.status === 'conflict') {
          retryCommand.current = undefined;
          setOutcome({
            status:
              result.reason === 'clientLegalEntityCapacityExceeded'
                ? 'capacity'
                : 'stale',
          });
          return;
        }
        if (result.status === 'validation') {
          retryCommand.current = undefined;
          setOutcome({ status: 'invalid', messageKey: 'invalid' });
          return;
        }
        if (result.status !== 'ok') {
          setOutcome({ status: 'uncertain' });
          return;
        }
        const confirmed = readClientLegalEntityMutation(result.value);
        retryCommand.current = undefined;
        setList((current) =>
          current.status === 'ready'
            ? {
                status: 'ready',
                clientVersion: confirmed.clientVersion,
                legalEntities: withLegalEntity(
                  current.legalEntities,
                  confirmed.legalEntity,
                ),
              }
            : current,
        );
        setEditor({ mode: 'closed' });
        setOutcome({ status: confirmedOutcome });
        heading.current?.focus();
        publishClientVersion.current(confirmed.clientVersion);
        void onActivityRecorded();
      },
      onError: () => setOutcome({ status: 'uncertain' }),
    });
  }

  const ready = list.status === 'ready' ? list : undefined;
  const editing = editor.mode !== 'closed';
  const submitting = outcome.status === 'submitting';
  // The owner confirmed a newer dossier version than this list observed, for
  // example its own correction. A closed section refreshes once for it, and
  // no form opens until that refresh settles; an open form is never rebased.
  const behindDossier =
    ready !== undefined && ready.clientVersion < dossierVersion;
  const awaitingRefresh =
    behindDossier &&
    (refresh?.dossierVersion !== dossierVersion || refresh.pending);
  useEffect(() => {
    if (!behindDossier || editing || refresh?.dossierVersion === dossierVersion)
      return;
    setRefresh({ dossierVersion, pending: true });
    void load({ quiet: true }).then(() =>
      setRefresh((current) =>
        current?.dossierVersion === dossierVersion
          ? { dossierVersion, pending: false }
          : current,
      ),
    );
  }, [behindDossier, dossierVersion, editing, load, refresh]);
  return (
    <section className="client-legal-entities" aria-labelledby={titleId}>
      <div className="client-legal-entities-heading">
        <div>
          <h4 id={titleId} ref={heading} tabIndex={-1}>
            {copy.title}
          </h4>
          <p>{copy.description}</p>
        </div>
        {canUpdate && ready && (
          <button
            type="button"
            className="client-secondary-action"
            disabled={editing || awaitingRefresh}
            onClick={() =>
              open({
                mode: 'add',
                observedVersion: ready.clientVersion,
                draft: { legalName: '', taxId: '', legalAddress: '' },
              })
            }
          >
            {copy.add}
          </button>
        )}
      </div>
      {outcome.status === 'recorded' && (
        <ClientDirectoryFeedback role="status" tone="success">
          {copy.recorded}
        </ClientDirectoryFeedback>
      )}
      {outcome.status === 'corrected' && (
        <ClientDirectoryFeedback role="status" tone="success">
          {copy.corrected}
        </ClientDirectoryFeedback>
      )}
      <ListContent
        list={list}
        canUpdate={canUpdate}
        editing={editing || awaitingRefresh}
        onRetry={() => void load({ quiet: false })}
        onCorrect={(legalEntity) => {
          if (!ready) return;
          open({
            mode: 'correct',
            observedVersion: ready.clientVersion,
            legalEntity,
            draft: {
              legalName: legalEntity.legalName,
              taxId: legalEntity.taxId ?? '',
              legalAddress: legalEntity.legalAddress ?? '',
            },
          });
        }}
      />
      {canUpdate && editor.mode !== 'closed' && (
        <form
          className="client-legal-entity-form"
          aria-labelledby={formTitleId}
          onSubmit={(event) => void submit(event)}
          noValidate
        >
          <h5 id={formTitleId}>
            {editor.mode === 'add'
              ? copy.addTitle
              : copy.correctEntity(editor.legalEntity.legalName)}
          </h5>
          <Field
            id={`${formTitleId}-legal-name`}
            label={copy.legalNameLabel}
            value={editor.draft.legalName}
            required
            error={fieldError(outcome, 'legalName', copy)}
            errorId={fieldErrorId}
            register={(element) => {
              fields.current.legalName = element;
            }}
            onChange={(legalName) =>
              setEditor({ ...editor, draft: { ...editor.draft, legalName } })
            }
          />
          <Field
            id={`${formTitleId}-tax-id`}
            label={copy.taxIdLabel}
            value={editor.draft.taxId}
            error={fieldError(outcome, 'taxId', copy)}
            errorId={fieldErrorId}
            register={(element) => {
              fields.current.taxId = element;
            }}
            onChange={(taxId) =>
              setEditor({ ...editor, draft: { ...editor.draft, taxId } })
            }
          />
          <Field
            id={`${formTitleId}-legal-address`}
            label={copy.legalAddressLabel}
            value={editor.draft.legalAddress}
            multiline
            error={fieldError(outcome, 'legalAddress', copy)}
            errorId={fieldErrorId}
            register={(element) => {
              fields.current.legalAddress = element;
            }}
            onChange={(legalAddress) =>
              setEditor({ ...editor, draft: { ...editor.draft, legalAddress } })
            }
          />
          <MutationFeedback outcome={outcome} onReload={reload} />
          <div className="client-legal-entity-actions">
            <button type="submit" disabled={submitting}>
              {submitting ? copy.saving : copy.save}
            </button>
            <button
              type="button"
              className="client-secondary-action"
              disabled={submitting}
              onClick={close}
            >
              {copy.cancel}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}

function ListContent({
  list,
  canUpdate,
  editing,
  onRetry,
  onCorrect,
}: {
  list: ListState;
  canUpdate: boolean;
  editing: boolean;
  onRetry: () => void;
  onCorrect: (legalEntity: ClientLegalEntity) => void;
}) {
  const copy = useClientLegalEntitiesCopy();
  switch (list.status) {
    case 'loading':
      return (
        <ClientDirectoryFeedback role="status" tone="pending">
          {copy.loading}
        </ClientDirectoryFeedback>
      );
    case 'error':
      return (
        <div className="client-legal-entities-error">
          <ClientDirectoryFeedback role="alert" tone="error">
            {copy.error}
          </ClientDirectoryFeedback>
          <button
            type="button"
            className="client-secondary-action"
            onClick={onRetry}
          >
            {copy.retry}
          </button>
        </div>
      );
    case 'unavailable':
      return (
        <ClientDirectoryFeedback>{copy.unavailable}</ClientDirectoryFeedback>
      );
    case 'ready':
      if (list.legalEntities.length === 0)
        return <ClientDirectoryFeedback>{copy.empty}</ClientDirectoryFeedback>;
      return (
        <ul className="client-legal-entities-list" aria-label={copy.list}>
          {list.legalEntities.map((legalEntity) => (
            <li key={legalEntity.id}>
              <div className="client-legal-entity-name">
                <strong>{legalEntity.legalName}</strong>
                {canUpdate && (
                  <button
                    type="button"
                    className="client-secondary-action"
                    aria-label={copy.correctEntity(legalEntity.legalName)}
                    disabled={editing}
                    onClick={() => onCorrect(legalEntity)}
                  >
                    {copy.correct}
                  </button>
                )}
              </div>
              <dl>
                <div>
                  <dt>{copy.taxIdLabel}</dt>
                  <dd>{legalEntity.taxId ?? copy.notRecorded}</dd>
                </div>
                <div>
                  <dt>{copy.legalAddressLabel}</dt>
                  <dd>{legalEntity.legalAddress ?? copy.notRecorded}</dd>
                </div>
              </dl>
            </li>
          ))}
        </ul>
      );
    default:
      return assertNever(list);
  }
}

function MutationFeedback({
  outcome,
  onReload,
}: {
  outcome: Outcome;
  onReload: () => void;
}) {
  const copy = useClientLegalEntitiesCopy();
  switch (outcome.status) {
    case 'submitting':
      return (
        <ClientDirectoryFeedback role="status" tone="pending">
          {copy.saving}
        </ClientDirectoryFeedback>
      );
    case 'invalid':
      return outcome.field ? null : (
        <ClientDirectoryFeedback role="alert" tone="error">
          {copy[outcome.messageKey]}
        </ClientDirectoryFeedback>
      );
    case 'uncertain':
      return (
        <ClientDirectoryFeedback role="alert" tone="error">
          {copy.uncertain}
        </ClientDirectoryFeedback>
      );
    case 'capacity':
      return (
        <ClientDirectoryFeedback role="alert" tone="error">
          {copy.capacity}
        </ClientDirectoryFeedback>
      );
    case 'stale':
      return (
        <div className="client-legal-entity-stale">
          <ClientDirectoryFeedback role="alert" tone="error">
            {copy.stale}
          </ClientDirectoryFeedback>
          <button
            type="button"
            className="client-secondary-action"
            onClick={onReload}
          >
            {copy.reload}
          </button>
        </div>
      );
    case 'idle':
    case 'recorded':
    case 'corrected':
      return null;
    default:
      return assertNever(outcome);
  }
}

function Field({
  id,
  label,
  value,
  required = false,
  multiline = false,
  error,
  errorId,
  register,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  required?: boolean;
  multiline?: boolean;
  error: string | undefined;
  errorId: string;
  register: (element: HTMLElement | null) => void;
  onChange: (value: string) => void;
}) {
  const shared = {
    id,
    value,
    required,
    'aria-invalid': error !== undefined,
    'aria-describedby': error === undefined ? undefined : errorId,
  };
  return (
    <>
      <label htmlFor={id}>{label}</label>
      {multiline ? (
        <textarea
          {...shared}
          ref={register}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : (
        <input
          {...shared}
          type="text"
          ref={register}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
      {error !== undefined && (
        <p id={errorId} className="client-legal-entity-field-error">
          {error}
        </p>
      )}
    </>
  );
}

function checkDraft(
  draft: Draft,
):
  | { status: 'valid'; values: Values }
  | { status: 'invalid'; messageKey: ValidationMessageKey; field: DraftField } {
  const legalName = draft.legalName.trim();
  const taxId = draft.taxId.trim();
  const legalAddress = draft.legalAddress.trim();
  if (!legalName)
    return {
      status: 'invalid',
      messageKey: 'legalNameRequired',
      field: 'legalName',
    };
  if (legalName.length > MAXIMUM_LEGAL_NAME_LENGTH)
    return {
      status: 'invalid',
      messageKey: 'legalNameTooLong',
      field: 'legalName',
    };
  if (taxId.length > MAXIMUM_TAX_ID_LENGTH)
    return { status: 'invalid', messageKey: 'taxIdTooLong', field: 'taxId' };
  if (legalAddress.length > MAXIMUM_LEGAL_ADDRESS_LENGTH)
    return {
      status: 'invalid',
      messageKey: 'legalAddressTooLong',
      field: 'legalAddress',
    };
  return {
    status: 'valid',
    values: {
      legalName,
      taxId: taxId || null,
      legalAddress: legalAddress || null,
    },
  };
}

/** The request for an open form, or nothing when a correction changes no value. */
function mutationFor({
  clientAccountId,
  editor,
  values,
}: {
  clientAccountId: string;
  editor: Exclude<Editor, { mode: 'closed' }>;
  values: Values;
}): { method: 'POST' | 'PATCH'; path: string; body: object } | undefined {
  const entities = `/clients/${encodeURIComponent(clientAccountId)}/legal-entities`;
  if (editor.mode === 'add')
    return {
      method: 'POST',
      path: entities,
      body: { expectedClientVersion: editor.observedVersion, ...values },
    };
  const changes = changedValues(editor.legalEntity, values);
  if (Object.keys(changes).length === 0) return undefined;
  return {
    method: 'PATCH',
    path: `${entities}/${encodeURIComponent(editor.legalEntity.id)}`,
    body: { expectedClientVersion: editor.observedVersion, changes },
  };
}

function changedValues(
  current: ClientLegalEntity,
  values: Values,
): Partial<Values> {
  return {
    ...(values.legalName === current.legalName
      ? {}
      : { legalName: values.legalName }),
    ...(values.taxId === current.taxId ? {} : { taxId: values.taxId }),
    ...(values.legalAddress === current.legalAddress
      ? {}
      : { legalAddress: values.legalAddress }),
  };
}

function withLegalEntity(
  legalEntities: readonly ClientLegalEntity[],
  confirmed: ClientLegalEntity,
): ClientLegalEntity[] {
  return [
    ...legalEntities.filter((legalEntity) => legalEntity.id !== confirmed.id),
    confirmed,
  ].sort(
    (left, right) =>
      compareText(left.createdAt, right.createdAt) ||
      compareText(left.id, right.id),
  );
}

/** The server's creation-then-id order, compared by code unit. */
function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function fieldError(
  outcome: Outcome,
  field: DraftField,
  copy: Readonly<Record<ValidationMessageKey, string>>,
): string | undefined {
  return outcome.status === 'invalid' && outcome.field === field
    ? copy[outcome.messageKey]
    : undefined;
}

function assertNever(value: never): never {
  throw new Error(`Unexpected legal entity state: ${JSON.stringify(value)}`);
}
