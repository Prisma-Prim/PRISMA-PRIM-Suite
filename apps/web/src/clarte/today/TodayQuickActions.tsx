import { ChevronRight, FileSignature, Inbox } from 'lucide-react';
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { BrowserIdentity } from '../../access-composition';
import type { ActorContext } from '../../access-types';
import { holds } from '../../access/company-grants';
import { runLatestAuthenticatedRequest } from '../../api/latest-authenticated-request';
import { useRequestLifetime } from '../../api/use-actor-requests';
import { useScopedOperation } from '../../api/use-scoped-operation';
import type { RequestCapturePresentation } from '../../commercial-intake/CommercialIntakeWorkspace';
import {
  holdsContractRead,
  holdsPricingSnapshotRead,
} from '../../contract/contract-grants';
import { ClarteButton } from '../components/ClarteButton';
import { ClarteSidePanel } from '../components/ClarteSidePanel';
import {
  ClarteEmptyState,
  ClarteErrorState,
  ClarteLoadingState,
} from '../components/ClarteState';
import { useClarteTodayCopy } from './clarte-today.copy';

/** App's existing Client Request capture, rendered alone for the quick action. */
export type TodayCapture = Readonly<{
  render: (presentation: RequestCapturePresentation) => ReactNode;
  /** Opens a recorded Request through App's existing Request navigation. */
  onOpenRequest?: (clientRequestId: string) => void;
}>;

/** The affaire a direct Contract is prepared for. */
export type DirectContractTarget = Readonly<{
  opportunityId: string;
  opportunityTitle: string;
  currentClientId: string;
}>;

/**
 * The quick action is offered where the Contract panel offers its direct
 * Contract form (Contract read and prepare, Opportunity, Client and pricing
 * Snapshot reads) and the Company's Requests can be listed to choose one.
 */
export function offersDirectContract(actor: ActorContext): boolean {
  const company = actor.activeCompany;
  return (
    holds(company, 'company_commercial_intake', 'commercial.request.read') &&
    holds(
      company,
      'company_commercial_intake',
      'commercial.opportunity.read',
    ) &&
    holdsContractRead(company) &&
    holds(
      company,
      'company_contract_preparer',
      'commercial.contract.prepare',
    ) &&
    holds(company, 'company_director_client_access', 'client.read') &&
    holdsPricingSnapshotRead(company)
  );
}

/** App's existing Contract panel, whose direct Contract form it offers. */
export type TodayDirectContract = Readonly<{
  identity: BrowserIdentity;
  companyId: string;
  workspaceMembershipId: string;
  render: (
    target: DirectContractTarget,
    reportProtectedWork: (locked: boolean) => void,
  ) => ReactNode;
}>;

/**
 * The quick action "New Client Request" (#1532, EX-053): the existing
 * capture in a side panel, with its validation, idempotent retry, access
 * recovery and Activity refresh. The panel stays open while the capture is
 * pending or uncertain, as the Requests section holds it.
 */
export function CapturePanel({
  capture,
  onHeld,
  onClose,
}: Readonly<{
  capture: TodayCapture;
  /** Reports the hold to Today, which holds App's navigation with it. */
  onHeld: (held: boolean) => void;
  onClose: () => void;
}>) {
  const copy = useClarteTodayCopy();
  const [captured, setCaptured] = useState<{
    id: string;
    opportunityTitle: string;
  }>();
  const [held, setHeld] = useState(false);
  useReportedHold(held, onHeld);
  const [form, setForm] = useState(0);
  return (
    <ClarteSidePanel
      title={copy.message('newRequest')}
      description={copy.message('newRequestLead')}
      icon={<Inbox />}
      dismissible={!held}
      onClose={onClose}
    >
      {captured ? (
        <div className="clarte-today-receipt">
          <p role="status">
            {copy.captured({ title: captured.opportunityTitle })}
          </p>
          <div className="clarte-today-receipt-actions">
            {capture.onOpenRequest && (
              <ClarteButton
                variant="primary"
                onClick={() => {
                  onClose();
                  capture.onOpenRequest?.(captured.id);
                }}
              >
                {copy.message('openCaptured')}
              </ClarteButton>
            )}
            <ClarteButton
              onClick={() => {
                setCaptured(undefined);
                setForm((current) => current + 1);
              }}
            >
              {copy.message('captureAnother')}
            </ClarteButton>
          </div>
        </div>
      ) : (
        <div key={form} className="clarte-today-capture">
          {capture.render({
            onCaptured: (request) => {
              setHeld(false);
              setCaptured(request);
            },
            onProtectedChange: setHeld,
          })}
        </div>
      )}
    </ClarteSidePanel>
  );
}

type Affaire = Readonly<{
  clientRequestId: string;
  opportunityTitle: string;
  clientDisplayName: string;
}>;
type AffairePage = Readonly<{ affaires: Affaire[]; nextCursor?: string }>;
type Choices =
  | { kind: 'loading' | 'error' | 'denied' }
  | { kind: 'ready'; affaires: Affaire[]; nextCursor?: string; older: boolean };
type Step =
  | { kind: 'choose' }
  | { kind: 'reading'; affaire: Affaire }
  | { kind: 'failed' | 'without-client'; affaire: Affaire }
  | { kind: 'contract'; target: DirectContractTarget };

/**
 * The quick action "Direct Contract" (#1532, EX-103). A direct Contract
 * belongs to an Opportunity whose Request has a Client, so the panel first
 * lists the Company's affaires from the existing Request list read, reads
 * the chosen Request for its Opportunity and current Client, then shows the
 * existing Contract panel with its direct Contract form, validation, retry
 * and permissions. The panel stays open while that panel protects work.
 */
export function DirectContractPanel({
  directContract,
  onHeld,
  onClose,
}: Readonly<{
  directContract: TodayDirectContract;
  /** Reports the hold to Today, which holds App's navigation with it. */
  onHeld: (held: boolean) => void;
  onClose: () => void;
}>) {
  const copy = useClarteTodayCopy();
  const { identity, companyId, workspaceMembershipId } = directContract;
  const [choices, setChoices] = useState<Choices>({ kind: 'loading' });
  const [step, setStep] = useState<Step>({ kind: 'choose' });
  const [held, setHeld] = useState(false);
  useReportedHold(held, onHeld);
  const scope = String(
    useRequestLifetime(
      identity,
      JSON.stringify([companyId, workspaceMembershipId]),
    ),
  );
  const listRead = useScopedOperation(`${scope}:list`);
  const detailRead = useScopedOperation(`${scope}:detail`);

  function readAffaires(cursor?: string) {
    const requestSignal = listRead.begin();
    if (!requestSignal) return;
    setChoices((current) =>
      cursor && current.kind === 'ready'
        ? { ...current, older: true }
        : { kind: 'loading' },
    );
    void runLatestAuthenticatedRequest({
      signal: requestSignal,
      identity,
      execute: (api, signal) =>
        api.request(
          `/commercial-intake/requests?limit=25${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`,
          { companyContextId: companyId, signal },
        ),
      onResult: async (result, signal) => {
        if (result.status === 'unauthorized') {
          await identity.rejectSession();
          if (!signal.aborted) setChoices({ kind: 'denied' });
        } else if (result.status === 'forbidden')
          setChoices({ kind: 'denied' });
        else if (result.status !== 'ok') setChoices({ kind: 'error' });
        else {
          const page = readAffairePage(result.value);
          setChoices((current) => ({
            kind: 'ready',
            affaires:
              cursor && current.kind === 'ready'
                ? [...current.affaires, ...page.affaires]
                : page.affaires,
            nextCursor: page.nextCursor,
            older: false,
          }));
        }
      },
      onError: () => setChoices({ kind: 'error' }),
    });
  }
  useEffect(() => {
    readAffaires();
  }, [scope]);

  function choose(affaire: Affaire) {
    const requestSignal = detailRead.begin();
    if (!requestSignal) return;
    setStep({ kind: 'reading', affaire });
    void runLatestAuthenticatedRequest({
      signal: requestSignal,
      identity,
      execute: (api, signal) =>
        api.request(
          `/commercial-intake/requests/${encodeURIComponent(affaire.clientRequestId)}`,
          { companyContextId: companyId, signal },
        ),
      onResult: async (result, signal) => {
        if (result.status === 'unauthorized') {
          await identity.rejectSession();
          if (!signal.aborted) setStep({ kind: 'failed', affaire });
        } else if (result.status !== 'ok') setStep({ kind: 'failed', affaire });
        else {
          const target = readDirectContractTarget(result.value, {
            companyId,
            clientRequestId: affaire.clientRequestId,
          });
          setStep(
            target
              ? { kind: 'contract', target }
              : { kind: 'without-client', affaire },
          );
        }
      },
      onError: () => setStep({ kind: 'failed', affaire }),
    });
  }
  const chooseOther = (
    <ClarteButton
      variant="quiet"
      disabled={held}
      onClick={() => {
        detailRead.retire();
        setHeld(false);
        setStep({ kind: 'choose' });
      }}
    >
      {copy.message('chooseOther')}
    </ClarteButton>
  );

  let body: ReactNode;
  switch (step.kind) {
    case 'choose':
      body = (
        <AffaireChoices
          choices={choices}
          onChoose={choose}
          onRetry={() => readAffaires()}
          onOlder={(cursor) => readAffaires(cursor)}
        />
      );
      break;
    case 'reading':
      body = <ClarteLoadingState label={copy.message('affaireLoading')} />;
      break;
    case 'failed':
      body = (
        <ClarteErrorState
          title={copy.message('affaireError')}
          action={
            <div className="clarte-today-receipt-actions">
              <ClarteButton size="small" onClick={() => choose(step.affaire)}>
                {copy.message('retry')}
              </ClarteButton>
              {chooseOther}
            </div>
          }
        />
      );
      break;
    case 'without-client':
      body = (
        <ClarteEmptyState
          title={copy.message('affaireWithoutClient')}
          action={chooseOther}
        />
      );
      break;
    case 'contract':
      body = (
        <div className="clarte-today-contract">
          <p className="clarte-today-contract-affaire">
            <strong>{step.target.opportunityTitle}</strong>
            {chooseOther}
          </p>
          {directContract.render(step.target, setHeld)}
        </div>
      );
      break;
    default: {
      const exhaustive: never = step;
      return exhaustive;
    }
  }
  return (
    <ClarteSidePanel
      title={copy.message('directContract')}
      description={copy.message('directContractLead')}
      icon={<FileSignature />}
      dismissible={!held}
      onClose={onClose}
    >
      {body}
    </ClarteSidePanel>
  );
}

/**
 * Reports a panel's hold while it changes, and its release when the panel
 * goes, in the commit that changes it: a released hold never outlives the
 * screen that shows its receipt.
 */
function useReportedHold(held: boolean, onHeld: (held: boolean) => void) {
  const report = useRef(onHeld);
  useLayoutEffect(() => {
    report.current = onHeld;
  });
  useLayoutEffect(() => {
    report.current(held);
  }, [held]);
  useLayoutEffect(() => () => report.current(false), []);
}

function AffaireChoices({
  choices,
  onChoose,
  onRetry,
  onOlder,
}: Readonly<{
  choices: Choices;
  onChoose: (affaire: Affaire) => void;
  onRetry: () => void;
  onOlder: (cursor: string) => void;
}>) {
  const copy = useClarteTodayCopy();
  switch (choices.kind) {
    case 'loading':
      return <ClarteLoadingState label={copy.message('affairesLoading')} />;
    case 'denied':
      return <ClarteEmptyState title={copy.message('affairesDenied')} />;
    case 'error':
      return (
        <ClarteErrorState
          title={copy.message('affairesError')}
          action={
            <ClarteButton size="small" onClick={onRetry}>
              {copy.message('retry')}
            </ClarteButton>
          }
        />
      );
    case 'ready': {
      const { nextCursor } = choices;
      return (
        <div className="clarte-today-affaires">
          <h3>{copy.message('chooseAffaire')}</h3>
          {choices.affaires.length === 0 ? (
            <ClarteEmptyState title={copy.message('affairesEmpty')} />
          ) : (
            <ul className="clarte-list">
              {choices.affaires.map((affaire) => (
                <li key={affaire.clientRequestId}>
                  <button
                    type="button"
                    className="clarte-today-affaire"
                    aria-label={copy.affaireChoice({
                      title: affaire.opportunityTitle,
                      client: affaire.clientDisplayName,
                    })}
                    onClick={() => onChoose(affaire)}
                  >
                    <span>
                      <strong>{affaire.opportunityTitle}</strong>
                      <small>{affaire.clientDisplayName}</small>
                    </span>
                    <ChevronRight aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          {nextCursor && (
            <ClarteButton
              size="small"
              disabled={choices.older}
              onClick={() => onOlder(nextCursor)}
            >
              {copy.message('affairesMore')}
            </ClarteButton>
          )}
        </div>
      );
    }
    default: {
      const exhaustive: never = choices;
      return exhaustive;
    }
  }
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid affaire response.');
  return Object.fromEntries(Object.entries(value));
}
function text(value: unknown): string {
  if (typeof value !== 'string' || !value.trim())
    throw new Error('Invalid affaire text.');
  return value;
}

/**
 * The fields of the existing Request list this chooser consumes. Only rows
 * whose Request shows a Client can take a direct Contract; the others stay
 * in Affaires.
 */
function readAffairePage(value: unknown): AffairePage {
  const page = record(value);
  if (!Array.isArray(page.items)) throw new Error('Invalid affaire page.');
  const nextCursor =
    page.nextCursor === undefined || page.nextCursor === null
      ? undefined
      : text(page.nextCursor);
  const affaires = page.items.flatMap((item: unknown): Affaire[] => {
    const row = record(item);
    const opportunity = record(row.initialOpportunity);
    const client = row.clientDisplayName;
    if (client === undefined) return [];
    return [
      {
        clientRequestId: text(row.id),
        opportunityTitle: text(opportunity.title),
        clientDisplayName: text(client),
      },
    ];
  });
  return { affaires, nextCursor };
}

/**
 * The chosen Request's Opportunity and current Client, or none without a
 * visible Client. Another Request's or another Company's reply fails closed.
 */
function readDirectContractTarget(
  value: unknown,
  expected: { companyId: string; clientRequestId: string },
): DirectContractTarget | undefined {
  const request = record(value);
  if (
    request.id !== expected.clientRequestId ||
    request.companyId !== expected.companyId
  )
    throw new Error('Invalid affaire Request.');
  const opportunity = record(request.initialOpportunity);
  const reference =
    request.clientReference === undefined
      ? undefined
      : record(request.clientReference);
  const currentClientId = reference?.currentClientId;
  if (currentClientId === undefined) return undefined;
  return {
    opportunityId: text(opportunity.id),
    opportunityTitle: text(opportunity.title),
    currentClientId: text(currentClientId),
  };
}
