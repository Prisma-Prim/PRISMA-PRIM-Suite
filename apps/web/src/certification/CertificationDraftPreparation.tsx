import { useId, useLayoutEffect, useRef, useState } from 'react';
import type { ApiResult } from '../api/authenticated-api-client';
import {
  useScopedOperation,
  type ScopedOperation,
} from '../api/use-scoped-operation';
import { useAnalysisTerms } from '../dossier-analysis/analysis-copy';
import { historyPage } from '../dossier-analysis/analysis-response';
import { useInterfaceLocale } from '../localization/interface-locale';
import { formatMessage } from '../localization/messages';
import { Select } from '../presentation/Select';
import { useCertificationCopy } from './certification.copy';
import { useDraftPreparationCopy } from './draft-preparation.copy';
import {
  draftPreparation,
  stageDraftPreparation,
  PREPARABLE_FIELDS,
  type StageDraftStep,
  unchangedDraft,
  type DraftPreparation,
  type PreparableDraft,
} from './draft-preparation-response';

type Selection =
  | { status: 'empty' }
  | {
      status: 'ready';
      value: DraftPreparation | ReturnType<typeof stageDraftPreparation>;
      chosen: string[];
    };
type Work =
  | { status: 'idle' | 'reading' | 'applying' | 'applied' }
  | { status: 'confirming'; value: string }
  | {
      status: 'error';
      reason: 'failed' | 'changed' | 'draftChanged' | 'tooLong';
    };

/** A local draft assistant; its read owner cannot cancel ordinary Case commands. */
type PreparationProps = {
  scope: string;
  caseId: string;
  projectId: string;
  revision: number;
  disabled: boolean;
  read: (
    owner: ScopedOperation,
    signal: AbortSignal,
    path: string,
  ) => Promise<ApiResult<unknown>>;
} & (
  | {
      kind?: 'application';
      draft: PreparableDraft;
      onApply: (input: {
        values: Partial<PreparableDraft>;
        expected: Partial<PreparableDraft>;
      }) => void;
    }
  | {
      kind: 'stage';
      step: StageDraftStep;
      draft: string;
      onApply: (input: { value: string; expected: string }) => void;
    }
);

export function CertificationDraftPreparation(props: PreparationProps) {
  const copy = useDraftPreparationCopy(),
    label = useCertificationCopy();
  const { formatDateTime } = useInterfaceLocale();
  const term = useAnalysisTerms();
  const id = useId();
  const owner = useScopedOperation(props.scope);
  const latest = useRef(props);
  useLayoutEffect(() => {
    latest.current = props;
  });
  const [open, setOpen] = useState(false);
  const [history, setHistory] = useState<ReturnType<typeof historyPage>>({
    runs: [],
    runsNextCursor: null,
  });
  const seen = useRef(new Set<string>());
  const [runId, setRunId] = useState('');
  const [selection, setSelection] = useState<Selection>({ status: 'empty' });
  const [work, setWork] = useState<Work>({ status: 'idle' });
  const base = `/projects/${encodeURIComponent(props.projectId)}/dossier-analysis`;
  const pending =
    work.status === 'reading' ||
    work.status === 'applying' ||
    work.status === 'confirming';
  const referenceOnly =
    props.kind === 'stage' && props.step === 'stage_1_report';
  function fieldLabel(field: string) {
    const native = PREPARABLE_FIELDS.find((f) => f === field);
    return props.kind === 'stage'
      ? term(field)
      : native
        ? label(native)
        : field;
  }
  function currentValue(field: string) {
    const native = PREPARABLE_FIELDS.find((f) => f === field);
    return props.kind === 'stage'
      ? props.draft
      : native
        ? props.draft[native]
        : '';
  }
  useLayoutEffect(() => {
    if (work.status === 'confirming')
      setWork(
        props.kind === 'stage' && props.draft === work.value
          ? { status: 'applied' }
          : { status: 'error', reason: 'draftChanged' },
      );
  }, [work, props]);

  async function loadHistory(after?: string) {
    const signal = owner.begin();
    if (!signal) return;
    setOpen(true);
    setWork({ status: 'reading' });
    try {
      const reply = await props.read(
        owner,
        signal,
        `${base}${after ? `/runs?cursor=${encodeURIComponent(after)}` : ''}`,
      );
      if (signal.aborted) return;
      if (reply.status !== 'ok') throw new Error('Unavailable history.');
      const page = historyPage(reply.value);
      if (
        (page.runsNextCursor && seen.current.has(page.runsNextCursor)) ||
        (after &&
          page.runs.some((r) => history.runs.some((old) => old.id === r.id)))
      )
        throw new Error('Repeated history.');
      if (page.runsNextCursor) seen.current.add(page.runsNextCursor);
      setHistory({
        runs: after ? [...history.runs, ...page.runs] : page.runs,
        runsNextCursor: page.runsNextCursor,
      });
      setWork({ status: 'idle' });
    } catch {
      if (!signal.aborted) setWork({ status: 'error', reason: 'failed' });
    }
  }
  async function readPreview(apply: boolean) {
    const signal = owner.begin();
    if (!signal || !runId) return;
    const viewed = selection;
    const rows =
      viewed.status === 'ready'
        ? viewed.value.candidates.filter((c) =>
            viewed.chosen.includes(c.suggestionId),
          )
        : [];
    if (apply && rows.length === 0) return;
    const expected: Partial<PreparableDraft> = {};
    if (props.kind !== 'stage')
      for (const row of rows) {
        const field = PREPARABLE_FIELDS.find((f) => f === row.field);
        if (field) expected[field] = props.draft[field];
      }
    const stageDraft = props.kind === 'stage' ? props.draft : null;
    setWork({ status: apply ? 'applying' : 'reading' });
    try {
      const query = new URLSearchParams({
        caseId: props.caseId,
        expectedRevision: String(props.revision),
      });
      if (props.kind === 'stage') query.set('step', props.step);
      const reply = await props.read(
        owner,
        signal,
        `${base}/runs/${encodeURIComponent(runId)}/${props.kind === 'stage' ? 'certification-stage-draft' : 'certification-draft'}?${query}`,
      );
      if (signal.aborted) return;
      if (reply.status !== 'ok') {
        if (
          reply.status === 'forbidden' ||
          reply.status === 'notFound' ||
          reply.status === 'unauthorized'
        ) {
          setSelection({ status: 'empty' });
          setHistory({ runs: [], runsNextCursor: null });
          setRunId('');
          seen.current.clear();
        }
        throw new Error('Unavailable preparation.');
      }
      const value = (() => {
        try {
          return props.kind === 'stage'
            ? stageDraftPreparation(reply.value, { ...props, runId })
            : draftPreparation(reply.value, { ...props, runId });
        } catch (error) {
          setSelection({ status: 'empty' });
          throw error;
        }
      })();
      if (apply) {
        if (
          viewed.status !== 'ready' ||
          JSON.stringify(viewed.value) !== JSON.stringify(value)
        ) {
          setSelection({ status: 'empty' });
          setWork({ status: 'error', reason: 'changed' });
          return;
        }
        const current = latest.current;
        if (
          current.disabled ||
          (current.kind === 'stage'
            ? current.draft !== stageDraft
            : !unchangedDraft(current.draft, expected))
        ) {
          setWork({ status: 'error', reason: 'draftChanged' });
          return;
        }
        if (current.kind === 'stage') {
          if (referenceOnly || stageDraft === null) return;
          const next =
            current.step === 'stage_2_report'
              ? [
                  stageDraft,
                  copy('contextHeading') +
                    '\n' +
                    rows
                      .map(
                        (row) =>
                          `${fieldLabel(row.field)}: «${row.value}»\n${copy('reviewed')}: ${row.reviewer} · ${row.reviewedAt} · r${row.reviewRevision}\n${row.citations.map((c) => `${c.documentTitle} · ${c.fileName} · v${c.versionNumber} · ${c.documentVersionId} · ${c.locator}\n«${c.quote}»`).join('\n')}`,
                      )
                      .join('\n\n'),
                ]
                  .filter(Boolean)
                  .join('\n\n')
              : rows[0]?.value;
          if (
            !next ||
            next.length > (current.step === 'stage_2_report' ? 4000 : 2000)
          ) {
            setWork({ status: 'error', reason: 'tooLong' });
            return;
          }
          current.onApply({ value: next, expected: stageDraft });
          setSelection({ status: 'ready', value, chosen: [] });
          setWork({ status: 'confirming', value: next });
        } else {
          const values: Partial<PreparableDraft> = {};
          for (const row of rows) {
            const field = PREPARABLE_FIELDS.find((f) => f === row.field);
            if (field) values[field] = row.value;
          }
          current.onApply({ values, expected });
          setSelection({ status: 'ready', value, chosen: [] });
          setWork({ status: 'applied' });
        }
      } else {
        setSelection({ status: 'ready', value, chosen: [] });
        setWork({ status: 'idle' });
      }
    } catch {
      if (!signal.aborted) setWork({ status: 'error', reason: 'failed' });
    }
  }

  if (!open)
    return (
      <button
        type="button"
        disabled={props.disabled}
        onClick={() => {
          seen.current.clear();
          void loadHistory();
        }}
      >
        {copy('open')}
      </button>
    );
  return (
    <>
      <fieldset
        className="certification-form"
        disabled={props.disabled || pending}
      >
        <legend>{copy('open')}</legend>
        <p>
          {copy(
            props.kind !== 'stage'
              ? 'help'
              : referenceOnly
                ? 'referenceHelp'
                : props.step === 'stage_2_report'
                  ? 'contextHelp'
                  : 'scopeHelp',
          )}
        </p>
        <label htmlFor={id}>{copy('run')}</label>
        <Select
          id={id}
          disabled={props.disabled || pending}
          value={runId}
          placeholder={copy('chooseRun')}
          options={history.runs
            .filter((r) => !r.stale)
            .map((r) => ({
              value: r.id,
              label: `${formatDateTime(r.createdAt)} · ${r.id.slice(0, 8)}`,
            }))}
          onValueChange={(value) => {
            setRunId(value);
            setSelection({ status: 'empty' });
            setWork({ status: 'idle' });
          }}
        />
        {history.runsNextCursor && (
          <button
            type="button"
            onClick={() => {
              void loadHistory(history.runsNextCursor ?? undefined);
            }}
          >
            {copy('more')}
          </button>
        )}
        <button
          type="button"
          disabled={!runId}
          onClick={() => {
            void readPreview(false);
          }}
        >
          {copy('preview')}
        </button>
        {selection.status === 'ready' && (
          <>
            {selection.value.candidates.length === 0 && (
              <p role="status">{copy('empty')}</p>
            )}
            {selection.value.candidates.map((candidate) => (
              <div
                className="certification-list-entry"
                key={candidate.suggestionId}
              >
                <label className="certification-choice">
                  {!referenceOnly && (
                    <input
                      type="checkbox"
                      checked={selection.chosen.includes(
                        candidate.suggestionId,
                      )}
                      aria-label={formatMessage(copy('choose'), {
                        field: fieldLabel(candidate.field),
                        value: candidate.value,
                      })}
                      onChange={(event) =>
                        setSelection({
                          ...selection,
                          chosen: event.target.checked
                            ? [
                                ...selection.chosen.filter((id) =>
                                  selection.value.candidates.some(
                                    (other) =>
                                      other.suggestionId === id &&
                                      other.field !== candidate.field,
                                  ),
                                ),
                                candidate.suggestionId,
                              ]
                            : selection.chosen.filter(
                                (id) => id !== candidate.suggestionId,
                              ),
                        })
                      }
                    />
                  )}
                  {fieldLabel(candidate.field)}: {candidate.value}
                </label>
                <p>
                  {copy('current')}: {currentValue(candidate.field) || '—'}
                </p>
                {candidate.proposalValue !== candidate.value && (
                  <p>
                    {copy('original')}: {candidate.proposalValue}
                  </p>
                )}
                <p>
                  {copy('reviewed')}: {candidate.reviewer} ·{' '}
                  {formatDateTime(candidate.reviewedAt)}
                </p>
                {candidate.citations.map((citation, i) => (
                  <blockquote key={i}>
                    {citation.quote}
                    <footer>
                      {citation.documentTitle} · {citation.fileName} · v
                      {citation.versionNumber}
                      <br />
                      <code>{citation.locator}</code> ·{' '}
                      <code>{citation.documentVersionId}</code>
                    </footer>
                  </blockquote>
                ))}
              </div>
            ))}
            {!referenceOnly && (
              <button
                type="button"
                disabled={
                  selection.chosen.length === 0 ||
                  new Set(
                    selection.value.candidates
                      .filter((c) => selection.chosen.includes(c.suggestionId))
                      .map((c) => c.field),
                  ).size !== selection.chosen.length
                }
                onClick={() => {
                  void readPreview(true);
                }}
              >
                {copy('apply')}
              </button>
            )}
          </>
        )}
      </fieldset>
      <button
        type="button"
        disabled={props.disabled}
        onClick={() => {
          owner.retire();
          setOpen(false);
          setHistory({ runs: [], runsNextCursor: null });
          setSelection({ status: 'empty' });
          setRunId('');
          setWork({ status: 'idle' });
        }}
      >
        {copy('close')}
      </button>
      {pending && <p role="status">{copy('loading')}</p>}
      {work.status === 'error' && <p role="alert">{copy(work.reason)}</p>}
      {work.status === 'applied' && <p role="status">{copy('applied')}</p>}
    </>
  );
}
