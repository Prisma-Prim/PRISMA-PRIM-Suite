import { SigningPdfDownload } from './SigningPdfDownload';
import { useDocumentVersionsCopy } from '../documents/document-versions.copy';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import {
  createAuthenticatedApiClient,
  type ApiResult,
} from '../api/authenticated-api-client';
import { text } from '../contract-model/contract-model-content';
import { Select } from '../presentation/Select';
import { useContractCopy } from './contract.copy';
import { useContractQualityCopy } from './contract-quality.copy';
import { useModelContractCopy } from './model-contract.copy';
import type { ModelContractView } from './model-contract-response';
import { useReportedSigningCopy } from './reported-signing.copy';
import {
  readReportedSignatory,
  readReportedSigning,
  readSigningPdfCandidates,
  type ReportedSigningView,
} from './reported-signing-response';
import type { BrowserIdentity } from '../access-composition';

type SignatoryDraft = {
  label: string;
  signedOn: string;
  mandate: 'UNKNOWN' | 'DECLARED_UNVERIFIED';
  basis: string;
};
const blankSignatory = (): SignatoryDraft => ({
  label: '',
  signedOn: '',
  mandate: 'UNKNOWN',
  basis: '',
});
type Attempt = {
  body: string;
  key: string;
  target: ModelContractView;
  intent: {
    expectedContractRevision: number;
    documentId: string;
    documentVersionId: string;
    representationId: string;
    providerSignatory: ReturnType<typeof readReportedSignatory>;
    clientSignatory: ReturnType<typeof readReportedSignatory>;
    concordanceBasis: string;
    acceptanceBasis: string;
    acknowledgedWarningCodes: string[];
  };
};
export function ReportedSigningForm(props: {
  identity: BrowserIdentity;
  companyId: string;
  membershipId: string;
  opportunityId: string;
  contract: ModelContractView;
  protectedCommand: boolean;
  reject: (
    result: ApiResult<unknown>,
    signal: AbortSignal,
  ) => Promise<'unauthorized' | 'forbidden' | undefined>;
  onDeclared: (declaration: ReportedSigningView) => void;
  onProtectionChange: (value: boolean) => void;
  onReload: () => Promise<boolean>;
}) {
  const documentCopy = useDocumentVersionsCopy();
  const copy = useReportedSigningCopy(),
    common = useContractCopy(),
    modelCopy = useModelContractCopy(),
    qualityCopy = useContractQualityCopy(),
    id = useId();
  const [provider, setProvider] = useState(blankSignatory),
    [client, setClient] = useState(blankSignatory);
  const [concordance, setConcordance] = useState(''),
    [acceptance, setAcceptance] = useState('');
  const [page, setPage] = useState<ReturnType<
      typeof readSigningPdfCandidates
    > | null>(null),
    [selected, setSelected] = useState('');
  const [acknowledged, setAcknowledged] = useState<string[]>([]);
  const [readState, setReadState] = useState<'idle' | 'loading' | 'error'>(
    'idle',
  );
  type Mutation =
    | { kind: 'editing'; feedback: 'idle' | 'invalid' | 'unavailable' }
    | { kind: 'running' | 'uncertain'; command: Attempt }
    | { kind: 'confirmed' };
  const [mutation, setMutation] = useState<Mutation>({
    kind: 'editing',
    feedback: 'idle',
  });
  const feedback =
    mutation.kind === 'editing' ? mutation.feedback : mutation.kind;
  const read = useRef<AbortController | undefined>(undefined),
    write = useRef<AbortController | undefined>(undefined);
  const protectedSelf =
    mutation.kind === 'running' || mutation.kind === 'uncertain';
  const locked = protectedSelf || props.protectedCommand;
  const base = `/contracts/opportunities/${encodeURIComponent(props.opportunityId)}/versions/${encodeURIComponent(props.contract.version.id)}/signing-declarations`;
  useEffect(() => {
    props.onProtectionChange(protectedSelf);
  }, [protectedSelf, props.onProtectionChange]);
  useEffect(
    () => () => {
      read.current?.abort();
      write.current?.abort();
      props.onProtectionChange(false);
    },
    [],
  );
  async function load(cursor?: string) {
    if (mutation.kind !== 'editing') return;
    read.current?.abort();
    const controller = new AbortController();
    read.current = controller;
    setReadState('loading');
    try {
      const api = await createAuthenticatedApiClient(props.identity);
      if (controller.signal.aborted) return;
      const result = await api.request<unknown>(
        base +
          '/pdf-candidates' +
          (cursor ? '?cursor=' + encodeURIComponent(cursor) : ''),
        { companyContextId: props.companyId, signal: controller.signal },
      );
      if (controller.signal.aborted) return;
      const rejected = await props.reject(result, controller.signal);
      if (controller.signal.aborted) return;
      if (rejected || result.status !== 'ok')
        throw new Error('Unavailable PDF selection.');
      const next = readSigningPdfCandidates(result.value);
      if (
        JSON.stringify(next.warningCodes) !== JSON.stringify(page?.warningCodes)
      )
        setAcknowledged([]);
      setPage((current) => ({
        ...next,
        items:
          cursor && current ? [...current.items, ...next.items] : next.items,
      }));
      if (!cursor) setSelected('');
      setReadState('idle');
    } catch {
      if (!controller.signal.aborted) {
        setPage(null);
        setSelected('');
        setAcknowledged([]);
        setReadState('error');
      }
    }
  }

  function prepare(): Attempt {
    const pdf = page?.items.find((row) => row.representationId === selected);
    if (
      !pdf ||
      !page ||
      JSON.stringify([...acknowledged].sort()) !==
        JSON.stringify([...page.warningCodes].sort())
    )
      throw new Error('Complete exact sources and warnings.');
    const signatory = (draft: SignatoryDraft) =>
      readReportedSignatory({
        label: draft.label,
        signedOn: draft.signedOn || null,
        mandate:
          draft.mandate === 'UNKNOWN'
            ? { kind: 'UNKNOWN' }
            : { kind: 'DECLARED_UNVERIFIED', basis: draft.basis },
      });
    const intent = {
      expectedContractRevision: props.contract.revision,
      documentId: pdf.documentId,
      documentVersionId: pdf.documentVersionId,
      representationId: pdf.representationId,
      providerSignatory: signatory(provider),
      clientSignatory: signatory(client),
      concordanceBasis: text(concordance, 2000),
      acceptanceBasis: text(acceptance, 2000),
      acknowledgedWarningCodes: [...acknowledged].sort(),
    };
    return {
      key: crypto.randomUUID(),
      body: JSON.stringify(intent),
      target: props.contract,
      intent,
    };
  }
  async function submit(event?: FormEvent) {
    event?.preventDefault();
    if (
      write.current ||
      props.protectedCommand ||
      mutation.kind === 'running' ||
      mutation.kind === 'confirmed'
    )
      return;
    let command: Attempt;
    try {
      command = mutation.kind === 'uncertain' ? mutation.command : prepare();
    } catch {
      setMutation({ kind: 'editing', feedback: 'invalid' });
      return;
    }
    read.current?.abort();
    const controller = new AbortController();
    write.current = controller;
    setMutation({ kind: 'running', command });
    try {
      const api = await createAuthenticatedApiClient(props.identity);
      if (controller.signal.aborted) return;
      const result = await api.request<unknown>(base, {
        method: 'POST',
        companyContextId: props.companyId,
        signal: controller.signal,
        headers: {
          'content-type': 'application/json',
          'idempotency-key': command.key,
        },
        body: command.body,
      });
      if (controller.signal.aborted) return;
      const rejected = await props.reject(result, controller.signal);
      if (controller.signal.aborted) return;
      if (rejected) {
        setMutation({ kind: 'editing', feedback: 'unavailable' });
        return;
      }
      if (result.status !== 'ok') {
        if (result.status === 'error')
          setMutation({ kind: 'uncertain', command });
        else {
          setMutation({ kind: 'editing', feedback: 'unavailable' });
        }
        return;
      }
      const target = command.target,
        decision = target.version.decision;
      if (decision?.kind !== 'APPROVE')
        throw new Error('Missing exact approval.');
      const declaration = readReportedSigning(result.value, {
        contractId: target.id,
        versionId: target.version.id,
        versionNumber: target.version.versionNumber,
        createdRevision: target.version.createdContractRevision,
        checksum: target.version.representation.sha256,
        approvalDecisionId: decision.id,
      });
      const expected = command.intent;
      if (
        declaration.actorWorkspaceMembershipId !== props.membershipId ||
        declaration.revision !== expected.expectedContractRevision + 1 ||
        declaration.pdf.access !== 'granted' ||
        declaration.pdf.reference.documentId !== expected.documentId ||
        declaration.pdf.reference.documentVersionId !==
          expected.documentVersionId ||
        declaration.pdf.reference.representationId !==
          expected.representationId ||
        JSON.stringify(declaration.providerSignatory) !==
          JSON.stringify(expected.providerSignatory) ||
        JSON.stringify(declaration.clientSignatory) !==
          JSON.stringify(expected.clientSignatory) ||
        declaration.concordanceBasis !== expected.concordanceBasis ||
        declaration.acceptanceBasis !== expected.acceptanceBasis ||
        JSON.stringify(declaration.acknowledgedWarningCodes) !==
          JSON.stringify(expected.acknowledgedWarningCodes)
      )
        throw new Error('Mismatched declaration response.');
      setMutation({ kind: 'confirmed' });
      props.onDeclared(declaration);
    } catch {
      if (!controller.signal.aborted)
        setMutation({ kind: 'uncertain', command });
    } finally {
      if (write.current === controller) write.current = undefined;
    }
  }
  async function reload() {
    if (mutation.kind === 'editing' && (await props.onReload())) {
      setMutation({ kind: 'editing', feedback: 'idle' });
      setPage(null);
      setSelected('');
      setAcknowledged([]);
    }
  }
  function warningLabel(code: string) {
    switch (code) {
      case 'MODEL_WORDING_REVIEWED':
      case 'ANNEX_SCOPE_REVIEWED':
        return modelCopy(code);
      case 'PARTY_IDENTITY_MATCHES_SOURCE':
      case 'PARTY_IDENTITY_CURRENT':
      case 'ADDED_CONDITIONS_CONFIRMED':
      case 'TERM_END_NOT_PASSED':
        return qualityCopy(code);
      default:
        throw new Error('Unknown declaration warning.');
    }
  }
  function signatoryFields(
    kind: 'provider' | 'client',
    draft: SignatoryDraft,
    update: (next: SignatoryDraft) => void,
  ) {
    return (
      <fieldset>
        <legend>{copy(kind)}</legend>
        <label htmlFor={`${id}-${kind}-label`}>{copy('label')}</label>
        <textarea
          id={`${id}-${kind}-label`}
          value={draft.label}
          maxLength={200}
          onChange={(e) => update({ ...draft, label: e.target.value })}
        />
        <label htmlFor={`${id}-${kind}-date`}>{copy('signedOn')}</label>
        <input
          id={`${id}-${kind}-date`}
          type="date"
          value={draft.signedOn}
          onChange={(e) => update({ ...draft, signedOn: e.target.value })}
        />
        <label htmlFor={`${id}-${kind}-mandate`}>{copy('mandate')}</label>
        <Select
          id={`${id}-${kind}-mandate`}
          value={draft.mandate}
          options={[
            { value: 'UNKNOWN', label: copy('unknown') },
            { value: 'DECLARED_UNVERIFIED', label: copy('declaredMandate') },
          ]}
          onValueChange={(value) => {
            if (value === 'UNKNOWN' || value === 'DECLARED_UNVERIFIED')
              update({ ...draft, mandate: value });
          }}
        />
        {draft.mandate === 'DECLARED_UNVERIFIED' && (
          <>
            <label htmlFor={`${id}-${kind}-basis`}>
              {copy('mandateBasis')}
            </label>
            <textarea
              id={`${id}-${kind}-basis`}
              value={draft.basis}
              maxLength={2000}
              onChange={(e) => update({ ...draft, basis: e.target.value })}
            />
          </>
        )}
      </fieldset>
    );
  }
  if (feedback === 'confirmed') return null;
  if (
    !protectedSelf &&
    (props.contract.version.signature ||
      props.contract.version.decisionState !== 'APPROVED' ||
      props.contract.version.supersededByVersionId)
  )
    return null;
  return (
    <section aria-label={copy('title')}>
      <h5>{copy('title')}</h5>
      <p>{copy('notice')}</p>
      <p>{copy('conservation')}</p>
      <p>
        {copy('source')}: {props.contract.illustrativeReference} ·{' '}
        {props.contract.version.versionNumber} /{' '}
        {
          props.contract.version.modelGeneration.offerSource
            .illustrativeReference
        }{' '}
        ·{' '}
        {props.contract.version.modelGeneration.offerSource.offerVersionNumber}
      </p>
      <p>
        {
          props.contract.version.modelGeneration.modelSource.content.issuer
            .legalName
        }{' '}
        / {props.contract.version.recipient.legalName}
      </p>
      {readState === 'loading' && <p role="status">{common('loading')}</p>}
      {readState === 'error' && <p role="alert">{copy('unavailable')}</p>}
      {feedback !== 'idle' && (
        <p role={feedback === 'running' ? 'status' : 'alert'}>
          {feedback === 'running' ? common('running') : copy(feedback)}
        </p>
      )}
      {feedback === 'uncertain' && (
        <button
          type="button"
          onClick={() => void submit()}
          disabled={props.protectedCommand}
        >
          {copy('retry')}
        </button>
      )}
      {!props.contract.version.signature &&
        page?.items
          .filter((pdf) => pdf.representationId === selected)
          .map((pdf) => (
            <SigningPdfDownload
              key={pdf.representationId}
              identity={props.identity}
              companyId={props.companyId}
              pdf={pdf}
              reject={props.reject}
            />
          ))}
      {feedback === 'unavailable' ? (
        <button type="button" onClick={() => void reload()}>
          {copy('refresh')}
        </button>
      ) : (
        <form onSubmit={(event) => void submit(event)}>
          <fieldset disabled={locked}>
            <button
              type="button"
              disabled={readState === 'loading'}
              onClick={() => void load()}
            >
              {copy('load')}
            </button>
            {page && (
              <>
                <label htmlFor={`${id}-pdf`}>{copy('choosePdf')}</label>
                <Select
                  id={`${id}-pdf`}
                  value={selected}
                  options={[
                    { value: '', label: copy('choosePdf') },
                    ...page.items.map((row) => ({
                      value: row.representationId,
                      label: `${row.title} · ${row.documentVersionNumber} · ${documentCopy.statusLabels[row.status]} · ${row.fileName}`,
                    })),
                  ]}
                  onValueChange={setSelected}
                />
                {!page.items.length && <p>{copy('empty')}</p>}
                {page.nextCursor && (
                  <button
                    type="button"
                    disabled={readState === 'loading'}
                    onClick={() => void load(page.nextCursor ?? undefined)}
                  >
                    {copy('more')}
                  </button>
                )}
              </>
            )}
            {signatoryFields('provider', provider, setProvider)}
            {signatoryFields('client', client, setClient)}
            <label htmlFor={`${id}-concordance`}>{copy('concordance')}</label>
            <textarea
              id={`${id}-concordance`}
              value={concordance}
              maxLength={2000}
              onChange={(e) => setConcordance(e.target.value)}
            />
            <label htmlFor={`${id}-acceptance`}>{copy('acceptance')}</label>
            <textarea
              id={`${id}-acceptance`}
              value={acceptance}
              maxLength={2000}
              onChange={(e) => setAcceptance(e.target.value)}
            />
            {page && (
              <fieldset>
                <legend>{copy('warnings')}</legend>
                {page.warningCodes.map((code) => (
                  <label key={code}>
                    <input
                      type="checkbox"
                      checked={acknowledged.includes(code)}
                      onChange={(e) =>
                        setAcknowledged((current) =>
                          e.target.checked
                            ? [...current, code]
                            : current.filter((value) => value !== code),
                        )
                      }
                    />
                    {warningLabel(code)}
                  </label>
                ))}
              </fieldset>
            )}
            <button type="submit" disabled={readState === 'loading'}>
              {copy('submit')}
            </button>
          </fieldset>
        </form>
      )}
    </section>
  );
}
