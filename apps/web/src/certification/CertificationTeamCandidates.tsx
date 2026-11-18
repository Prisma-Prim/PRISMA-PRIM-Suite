import { useEffect, useId, useState } from 'react';
import type { ApiResult } from '../api/authenticated-api-client';
import {
  useScopedOperation,
  type ScopedOperation,
} from '../api/use-scoped-operation';
import { TEAM_LIMITS } from './certification-team';
import { useTeamCandidateCopy } from './certification-team-candidates.copy';

interface Candidate {
  workspaceMembershipId: string;
  displayLabel: string;
}
interface Page {
  items: Candidate[];
  draftLinks: Candidate[];
  nextCursor: string | null;
}
type Selection = {
  owner: ScopedOperation;
  query: string;
  items: Candidate[];
  draftLinks: Candidate[];
  page:
    | { status: 'loading' | 'error' }
    | { status: 'ready'; nextCursor: string | null; empty: boolean };
};

/** A separate read owner keeps candidate searches from cancelling Case work. */
export function useTeamCandidates(input: {
  scope: string;
  caseId: string | undefined;
  enabled: boolean;
  linkedIds: readonly string[];
  read: (
    owner: ScopedOperation,
    signal: AbortSignal,
    path: string,
  ) => Promise<ApiResult<unknown>>;
}) {
  const operation = useScopedOperation(
    JSON.stringify([input.scope, input.caseId]),
  );
  const [selection, setSelection] = useState<Selection>();
  const current = selection?.owner === operation ? selection : undefined;

  async function load(query: string, after?: string) {
    if (!input.enabled || !input.caseId) return;
    const signal = operation.begin();
    if (!signal) return;
    // A fresh search replaces stale eligibility; only same-query paging appends.
    const previous = after && current?.query === query ? current.items : [];
    setSelection({
      owner: operation,
      query,
      items: previous,
      draftLinks: [],
      page: { status: 'loading' },
    });
    try {
      const params = new URLSearchParams();
      if (query.trim()) params.set('search', query.trim());
      if (after) params.set('after', after);
      const linked = new Set(input.linkedIds.filter(isUuid));
      if (linked.size) params.set('linked', [...linked].join(','));
      const reply = await input.read(
        operation,
        signal,
        `/certification-cases/${encodeURIComponent(input.caseId)}/team-candidates?${params}`,
      );
      if (signal.aborted) return;
      if (reply.status !== 'ok') throw new Error('Candidate read unavailable.');
      const page = candidatePage(reply.value, input.caseId, linked);
      const eligibleLinks = new Set(
        page.draftLinks.map((item) => item.workspaceMembershipId),
      );
      const known = new Map(
        previous
          .filter(
            (item) =>
              !linked.has(item.workspaceMembershipId) ||
              eligibleLinks.has(item.workspaceMembershipId),
          )
          .map((item) => [item.workspaceMembershipId, item]),
      );
      for (const item of page.items)
        known.set(item.workspaceMembershipId, item);
      setSelection({
        owner: operation,
        query,
        items: [...known.values()],
        draftLinks: page.draftLinks,
        page: {
          status: 'ready',
          nextCursor: page.nextCursor,
          empty: page.items.length === 0,
        },
      });
    } catch {
      if (!signal.aborted)
        setSelection({
          owner: operation,
          query,
          items: previous,
          draftLinks: [],
          page: { status: 'error' },
        });
    }
  }

  useEffect(() => {
    void load('');
  }, [operation, input.enabled]);

  return {
    options: [
      ...(current?.items ?? []),
      ...(current?.draftLinks ?? []).filter((item) =>
        input.linkedIds.includes(item.workspaceMembershipId),
      ),
    ],
    selection: current,
    search: (query: string) => {
      void load(query);
    },
    more: () => {
      if (current?.page.status === 'ready' && current.page.nextCursor)
        void load(current.query, current.page.nextCursor);
    },
  };
}

/** Fresh searches replace discovered choices without changing the team draft. */
export function TeamCandidateSearch(props: {
  candidates: ReturnType<typeof useTeamCandidates>;
  disabled: boolean;
}) {
  const copy = useTeamCandidateCopy();
  const id = useId();
  const [query, setQuery] = useState('');
  const page = props.candidates.selection?.page;
  return (
    <fieldset className="certification-form" disabled={props.disabled}>
      <legend>{copy('title')}</legend>
      <p>{copy('help')}</p>
      <label htmlFor={id}>{copy('search')}</label>
      <input
        id={id}
        value={query}
        maxLength={100}
        onChange={(event) => setQuery(event.target.value)}
      />
      <button
        type="button"
        disabled={page?.status === 'loading'}
        onClick={() => props.candidates.search(query)}
      >
        {copy('find')}
      </button>
      {page?.status === 'loading' && <p role="status">{copy('loading')}</p>}
      {page?.status === 'error' && <p role="alert">{copy('failed')}</p>}
      {page?.status === 'ready' && page.empty && (
        <p role="status">{copy('empty')}</p>
      )}
      {page?.status === 'ready' && page.nextCursor && (
        <button type="button" onClick={props.candidates.more}>
          {copy('more')}
        </button>
      )}
    </fieldset>
  );
}

/** The HTTP boundary proves the exact Case, bounded page and safe projection. */
function candidatePage(
  value: unknown,
  caseId: string,
  linked: ReadonlySet<string>,
): Page {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid candidates.');
  const body = Object.fromEntries(Object.entries(value));
  if (body.caseId !== caseId) throw new Error('Invalid candidate Case.');
  const items = candidateRows(body.items, 25);
  const draftLinks = linked.size
    ? candidateRows(body.draftLinks, TEAM_LIMITS.members)
    : [];
  if (
    draftLinks.some((item) => !linked.has(item.workspaceMembershipId)) ||
    (body.nextCursor !== null && !isUuid(body.nextCursor)) ||
    (body.nextCursor !== null &&
      (items.length !== 25 ||
        body.nextCursor !== items.at(-1)?.workspaceMembershipId))
  )
    throw new Error('Invalid candidate continuation.');
  return { items, draftLinks, nextCursor: body.nextCursor };
}

function candidateRows(value: unknown, maximum: number): Candidate[] {
  if (!Array.isArray(value) || value.length > maximum)
    throw new Error('Invalid candidate page.');
  const rows: unknown[] = value;
  const items = rows.map((value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value))
      throw new Error('Invalid candidate.');
    const item = Object.fromEntries(Object.entries(value));
    if (
      !isUuid(item.workspaceMembershipId) ||
      typeof item.displayLabel !== 'string' ||
      !item.displayLabel.trim() ||
      item.displayLabel.length > 240
    )
      throw new Error('Invalid candidate.');
    return {
      workspaceMembershipId: item.workspaceMembershipId,
      displayLabel: item.displayLabel,
    };
  });
  if (
    new Set(items.map((item) => item.workspaceMembershipId)).size !==
    items.length
  )
    throw new Error('Duplicate candidate.');
  return items;
}

function isUuid(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/iu.test(value)
  );
}
