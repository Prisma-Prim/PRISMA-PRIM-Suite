import { useEffect, useRef, useState } from 'react';
import type { BrowserIdentity } from '../access-composition';
import {
  createAuthenticatedApiClient,
  type ApiRequest,
  type ApiResult,
} from '../api/authenticated-api-client';
import { useScopedOperationGroup } from '../api/use-scoped-operation';
import {
  intakeBatch,
  intakePage,
  intakeProject,
  selectIntakeFiles,
  type AdmissionFile,
  type IntakeBatch,
} from './intake-response';
import { useIntakeCopy } from './intake-copy';

export interface IntakePanelProps {
  identity: BrowserIdentity;
  companyId: string;
  projectId: string;
  scope: string;
  onDenied: (result: ApiResult<unknown>) => void;
  onImported: () => Promise<void>;
}
class ConfirmedIntakeRejection extends Error {}

/** Owns the scoped foreground protocol and raw File lifetimes; the view receives actions only. */
export function useDossierIntake(props: IntakePanelProps) {
  const c = useIntakeCopy();
  const [denied, setDenied] = useState(false);
  const base = `/projects/${encodeURIComponent(props.projectId)}/dossier-analysis/intake-batches`;
  const reads = useScopedOperationGroup(props.scope),
    writes = useScopedOperationGroup(props.scope),
    controls = useScopedOperationGroup(props.scope),
    files = useScopedOperationGroup(props.scope);
  const [project, setProject] = useState<ReturnType<
      typeof intakeProject
    > | null>(null),
    [page, setPage] = useState<ReturnType<typeof intakePage>>({
      items: [],
      nextBefore: null,
    }),
    [batch, setBatch] = useState<IntakeBatch | null>(null);
  const [selection, setSelection] = useState<
      Awaited<ReturnType<typeof selectIntakeFiles>>
    >([]),
    [language, setLanguage] = useState<'ro' | 'ru' | 'fr' | 'en'>('ro'),
    [confirmed, setConfirmed] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const current = useRef<IntakeBatch | null>(null),
    originals = useRef(new Map<string, File>()),
    running = useRef(false),
    epoch = useRef(0),
    admission = useRef<{ body: string; key: string } | null>(null),
    [uncertainAdmission, setUncertainAdmission] = useState(false);
  const cursors = useRef(new Set<string>());

  async function request(path: string, init: ApiRequest, group: typeof reads) {
    const op = group.begin();
    if (!op) return undefined;
    try {
      const client = await createAuthenticatedApiClient(props.identity);
      if (op.signal.aborted) return undefined;
      const response = await client.request(path, {
        ...init,
        signal: op.signal,
        cache: 'no-store',
        companyContextId: props.companyId,
      });
      if (op.signal.aborted || !group.isLive()) return undefined;
      if (
        response.status === 'unauthorized' ||
        response.status === 'forbidden' ||
        response.status === 'notFound'
      ) {
        reads.retire();
        writes.retire();
        controls.retire();
        files.retire();
        ++epoch.current;
        current.current = null;
        originals.current.clear();
        admission.current = null;
        setBatch(null);
        setProject(null);
        setPage({ items: [], nextBefore: null });
        setSelection([]);
        setDenied(true);
        props.onDenied(response);
        return undefined;
      }
      if (response.status === 'validation' || response.status === 'conflict')
        throw new ConfirmedIntakeRejection('Intake command refused.');
      if (response.status !== 'ok')
        throw new Error('Intake operation could not be confirmed.');
      return response.value;
    } finally {
      op.release();
    }
  }
  function checked(value: unknown) {
    return requireOwnership(intakeBatch(value));
  }
  function requireOwnership(parsed: IntakeBatch) {
    if (
      parsed.projectId !== props.projectId ||
      parsed.companyId !== props.companyId ||
      (project && parsed.clientId !== project.clientId)
    )
      throw new Error('Wrong intake ownership.');
    return parsed;
  }
  function accept(parsed: IntakeBatch) {
    const prior = current.current;
    if (prior?.id === parsed.id && prior.revision > parsed.revision)
      return prior;
    current.current = parsed;
    setBatch(parsed);
    setPage((previous) => ({
      ...previous,
      items: previous.items.map((item) =>
        item.id === parsed.id && item.revision <= parsed.revision
          ? parsed
          : item,
      ),
    }));
    return parsed;
  }
  async function detail(selected: IntakeBatch, group = reads) {
    const value = await request(`${base}/${selected.id}`, {}, group);
    if (value === undefined) return undefined;
    const parsed = checked(value);
    if (parsed.id !== selected.id) throw new Error('Wrong intake batch.');
    if (current.current?.id !== selected.id) return undefined;
    return accept(parsed);
  }
  async function refresh(before: string | null = null) {
    try {
      if (!before) {
        const value = await request(
          `/projects/${encodeURIComponent(props.projectId)}`,
          {},
          reads,
        );
        if (value === undefined) return;
        const parsed = intakeProject(value);
        if (parsed.id !== props.projectId) throw new Error('Wrong Project.');
        setProject(parsed);
      }
      const value = await request(
        base + (before ? `?before=${before}` : ''),
        {},
        reads,
      );
      if (value === undefined) return;
      const next = intakePage(value);
      next.items.forEach(requireOwnership);
      next.items = next.items.map((item) =>
        current.current?.id === item.id &&
        current.current.revision > item.revision
          ? current.current
          : item,
      );
      if (before && (cursors.current.has(before) || next.nextBefore === before))
        throw new Error('Repeated intake cursor.');
      if (before) cursors.current.add(before);
      else cursors.current.clear();
      setPage((previous) => ({
        items: before
          ? [
              ...previous.items,
              ...next.items.filter(
                (item) => !previous.items.some((p) => p.id === item.id),
              ),
            ]
          : next.items,
        nextBefore: next.nextBefore,
      }));
      if (!before && current.current) await detail(current.current);
    } catch {
      if (reads.isLive()) setError(c('error'));
    }
  }
  useEffect(() => {
    void refresh();
  }, [props.scope]);

  async function choose(selected: File[]) {
    const op = files.beginLatest();
    if (!op) return;
    setBusy(true);
    setError('');
    setConfirmed(false);
    try {
      const next = await selectIntakeFiles(
        selected,
        language,
        c('defaultPurpose'),
      );
      if (op.signal.aborted) return;
      originals.current = new Map(
        next.flatMap((item) =>
          item.file.kind === 'invalid' || !item.original
            ? []
            : [[item.file.sha256, item.original]],
        ),
      );
      setSelection(next);
    } catch {
      if (!op.signal.aborted) setError(c('error'));
    } finally {
      if (!op.signal.aborted) setBusy(false);
      op.release();
    }
  }
  function edit(
    index: number,
    change: Partial<Extract<AdmissionFile, { kind: 'pdf' | 'docx' }>>,
  ) {
    setSelection((previous) =>
      previous.map((item, i) =>
        i === index && item.file.kind !== 'invalid'
          ? { ...item, file: { ...item.file, ...change } }
          : item,
      ),
    );
    setConfirmed(false);
  }
  async function register() {
    if (
      running.current ||
      !project ||
      (!admission.current && (!confirmed || selection.length === 0))
    )
      return;
    const live = writes.capture();
    admission.current ??= {
      body: JSON.stringify({
        format: 'DOCUMENT_INTAKE/1',
        expectedClientId: project.clientId,
        items: selection.map((item) => item.file),
      }),
      key: crypto.randomUUID(),
    };
    running.current = true;
    setBusy(true);
    setError('');
    try {
      const command = admission.current;
      const value = await request(
        base,
        {
          method: 'POST',
          body: command.body,
          headers: {
            'Content-Type': 'application/json',
            'Idempotency-Key': command.key,
          },
        },
        writes,
      );
      if (value === undefined) return;
      const next = checked(value);
      accept(next);
      admission.current = null;
      setUncertainAdmission(false);
    } catch (failure) {
      if (live()) {
        if (failure instanceof ConfirmedIntakeRejection) {
          admission.current = null;
          setUncertainAdmission(false);
          setConfirmed(false);
          setError(c('admissionRefused'));
        } else {
          setUncertainAdmission(true);
          setError(c('error'));
        }
      }
    } finally {
      if (live()) {
        running.current = false;
        setBusy(false);
      }
    }
  }
  async function command(
    selected: IntakeBatch,
    suffix: string,
    body: unknown,
    group = writes,
  ) {
    const value = await request(
      `${base}/${selected.id}/${suffix}`,
      {
        method: 'POST',
        body: JSON.stringify(body),
        headers: { 'Content-Type': 'application/json' },
      },
      group,
    );
    if (value === undefined) return undefined;
    const next = checked(value);
    if (next.id !== selected.id || current.current?.id !== next.id)
      return undefined;
    return accept(next);
  }
  async function run() {
    if (running.current || !current.current) return;
    const generation = ++epoch.current,
      live = writes.capture();
    running.current = true;
    setBusy(true);
    setError('');
    try {
      let next = await detail(current.current, writes);
      if (!next || next.phase === 'completed' || generation !== epoch.current)
        return;
      next = await command(next, 'state', {
        action: 'start',
        expectedRevision: next.revision,
      });
      if (!next) return;
      const itemIds = next.items.map((item) => item.id);
      for (const itemId of itemIds) {
        if (!live() || generation !== epoch.current) break;
        // A failure is retried only once after this explicit human resume.
        try {
          for (let step = 0; step < 5; step += 1) {
            if (
              !live() ||
              generation !== epoch.current ||
              !next ||
              next.phase !== 'active'
            )
              break;
            const item = next.items.find((i) => i.id === itemId);
            if (
              !item ||
              item.kind === 'invalid' ||
              ['duplicate', 'skipped', 'complete'].includes(item.progress.stage)
            )
              break;
            if (item.progress.stage === 'linked') {
              const original = originals.current.get(item.file.sha256);
              if (!original) break;
              const value = await request(
                `${base}/${next.id}/items/${item.id}/content?expectedRevision=${next.revision}`,
                {
                  method: 'POST',
                  body: original,
                  headers: {
                    'Content-Type':
                      item.file.kind === 'pdf'
                        ? 'application/pdf'
                        : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                  },
                },
                writes,
              );
              if (value === undefined) return;
              const uploaded = checked(value);
              if (uploaded.id !== next.id)
                throw new Error('Wrong intake batch.');
              next = accept(uploaded);
            } else
              next = await command(next, `items/${item.id}/advance`, {
                expectedRevision: next.revision,
              });
          }
        } catch {
          if (!live() || generation !== epoch.current) return;
          setError(c('error'));
          if (!current.current) return;
          next = await detail(current.current, writes);
          if (!next) return;
        }
      }
      if (live()) await props.onImported();
    } catch {
      if (live()) setError(c('error'));
    } finally {
      if (live()) {
        running.current = false;
        setBusy(false);
      }
    }
  }
  async function phase(action: 'pause' | 'stop') {
    ++epoch.current;
    const selected = current.current;
    if (!selected) return;
    try {
      const next = await detail(selected, controls);
      if (next && next.phase !== 'completed')
        await command(
          next,
          'state',
          { action, expectedRevision: next.revision },
          controls,
        );
    } catch {
      if (controls.isLive()) setError(c('error'));
    }
  }
  async function skip(itemId: string) {
    if (running.current || busy || !current.current) return;
    const live = writes.capture();
    running.current = true;
    setBusy(true);
    try {
      await command(current.current, `items/${itemId}/skip`, {
        expectedRevision: current.current.revision,
      });
    } catch {
      if (writes.isLive()) setError(c('error'));
    } finally {
      if (live()) {
        running.current = false;
        setBusy(false);
      }
    }
  }
  async function reselect(itemId: string, original: File | undefined) {
    if (!original || !batch) return;
    const item = batch.items.find((i) => i.id === itemId),
      op = files.beginLatest();
    if (!op || !item || item.kind !== 'file') return;
    setBusy(true);
    originals.current.delete(item.file.sha256);
    try {
      const next = await selectIntakeFiles(
          [original],
          item.file.language,
          item.file.purpose,
        ),
        found = next[0];
      if (op.signal.aborted) return;
      if (
        !found ||
        found.file.kind === 'invalid' ||
        found.file.sha256 !== item.file.sha256 ||
        found.file.size !== item.file.size ||
        found.file.kind !== item.file.kind
      ) {
        setError(c('wrongFile'));
        return;
      }
      originals.current.set(item.file.sha256, original);
      setError('');
      setBatch((previous) => (previous ? { ...previous } : previous));
    } catch {
      if (!op.signal.aborted) setError(c('wrongFile'));
    } finally {
      if (!op.signal.aborted) setBusy(false);
      op.release();
    }
  }
  function changeLanguage(value: string) {
    if (value !== 'ro' && value !== 'ru' && value !== 'fr' && value !== 'en')
      return;
    setLanguage(value);
    setSelection((previous) =>
      previous.map((item) =>
        item.file.kind === 'invalid'
          ? item
          : { ...item, file: { ...item.file, language: value } },
      ),
    );
    setConfirmed(false);
  }
  function prepareAnother() {
    if (running.current) return;
    ++epoch.current;
    current.current = null;
    setBatch(null);
    setSelection([]);
    setConfirmed(false);
    originals.current.clear();
    void refresh();
  }
  function openBatch(item: IntakeBatch) {
    if (running.current) return;
    ++epoch.current;
    accept(item);
    void detail(item).catch(() => {
      if (reads.isLive()) setError(c('error'));
    });
  }
  async function openEarlierBatch(batchId: string) {
    if (running.current) return;
    const live = reads.capture();
    ++epoch.current;
    running.current = true;
    setBusy(true);
    try {
      const value = await request(
        `${base}/${encodeURIComponent(batchId)}`,
        {},
        reads,
      );
      if (value === undefined) return;
      const next = checked(value);
      if (next.id !== batchId) throw new Error('Wrong earlier batch.');
      accept(next);
    } catch {
      if (live()) setError(c('error'));
    } finally {
      if (live()) {
        running.current = false;
        setBusy(false);
      }
    }
  }
  return {
    denied,
    project,
    page,
    batch,
    selection,
    language,
    confirmed,
    busy,
    error,
    uncertainAdmission,
    refresh,
    choose,
    edit,
    register,
    run,
    phase,
    skip,
    reselect,
    changeLanguage,
    prepareAnother,
    openBatch,
    openEarlierBatch,
    confirmSelection: (value: boolean) => setConfirmed(value),
    hasOriginal: (sha256: string) => originals.current.has(sha256),
  };
}
