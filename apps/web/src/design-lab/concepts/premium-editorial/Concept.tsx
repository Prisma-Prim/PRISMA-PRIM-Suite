import type { ConceptProps, DesignLabScreen } from '../../directions';
import type {
  ComparisonFixture,
  ExtractedField,
  ExtractedFieldStatus,
} from '../../comparisonFixture';
import './premium-editorial.css';

const chapters: ReadonlyArray<{
  screen: DesignLabScreen;
  number: string;
  label: string;
}> = [
  { screen: 'dashboard', number: '01', label: 'Dashboard' },
  { screen: 'client-request', number: '02', label: 'Client Request' },
  { screen: 'analysis-review', number: '03', label: 'Analysis Review' },
];

function EditorialNavigation({ screen }: { screen: DesignLabScreen }) {
  return (
    <aside className="pe-contents">
      <a className="pe-wordmark" href="/design-lab">
        <span>PRISMA</span>
        <strong>Working papers</strong>
      </a>
      <p className="pe-edition">Food assurance · 2026 / 08</p>
      <nav aria-label="Dossier chapters">
        <p className="pe-kicker">Contents</p>
        <ol>
          {chapters.map((chapter) => (
            <li key={chapter.screen}>
              <a
                aria-current={chapter.screen === screen ? 'page' : undefined}
                href={`/design-lab/premium-editorial/${chapter.screen}`}
              >
                <span>{chapter.number}</span>
                {chapter.label}
              </a>
            </li>
          ))}
        </ol>
      </nav>
      <p className="pe-confidential">
        Internal working dossier · Synthetic data
      </p>
    </aside>
  );
}

function DashboardPage({ fixture }: { fixture: ComparisonFixture }) {
  const unresolvedCriticalFieldCount = fixture.extractedFields.filter(
    (field) => field.critical && field.status !== 'confirmed',
  ).length;

  return (
    <article className="pe-page pe-dashboard">
      <header className="pe-hero">
        <div>
          <p className="pe-kicker">Dashboard · Dossier in focus</p>
          <h1>{fixture.clientRequest.title}</h1>
          <p className="pe-standfirst">
            {fixture.client.legalName} is at{' '}
            {fixture.clientRequest.workflowStatus}.{' '}
            {unresolvedCriticalFieldCount} unresolved Critical Fields hold the
            line before governed pricing.
          </p>
        </div>
        <dl className="pe-folio-notes">
          <div>
            <dt>Request</dt>
            <dd>{fixture.clientRequest.id}</dd>
          </div>
          <div>
            <dt>Owner</dt>
            <dd>{fixture.clientRequest.owner}</dd>
          </div>
          <div>
            <dt>Decision due</dt>
            <dd>{fixture.clientRequest.targetDecisionAt.slice(0, 10)}</dd>
          </div>
        </dl>
      </header>

      <section
        className="pe-section pe-actions"
        aria-labelledby="actions-title"
      >
        <header className="pe-section-heading">
          <p className="pe-kicker">The working list</p>
          <h2 id="actions-title">Actions & exceptions</h2>
          <span>{fixture.pendingActions.length} open</span>
        </header>
        <div className="pe-table-frame">
          <table className="pe-action-table" aria-label="Open action register">
            <thead>
              <tr>
                <th scope="col">No.</th>
                <th scope="col">Priority</th>
                <th scope="col">Action</th>
                <th scope="col">Owner</th>
                <th scope="col">Reason</th>
              </tr>
            </thead>
            <tbody>
              {fixture.pendingActions.map((action, index) => (
                <tr key={action.id}>
                  <td className="pe-index">
                    {String(index + 1).padStart(2, '0')}
                  </td>
                  <td>
                    <span
                      className={`pe-priority pe-priority--${action.priority}`}
                    >
                      {action.priority === 'urgent'
                        ? 'Resolve now'
                        : 'Follow up'}
                    </span>
                  </td>
                  <th scope="row">{action.label}</th>
                  <td>{action.owner}</td>
                  <td>{action.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="pe-lead-grid" aria-labelledby="attention-title">
        <div className="pe-lead-story">
          <p className="pe-kicker">Lead briefing</p>
          <h2 id="attention-title">Attention before progress</h2>
          <p>{fixture.analysis.summary}</p>
          <a href="/design-lab/premium-editorial/analysis-review">
            Review Analysis <span aria-hidden="true">→</span>
          </a>
        </div>
        <aside className="pe-gate-note" aria-label="Pricing gate">
          <p className="pe-note-number">Margin note 01</p>
          <strong>Pricing blocked</strong>
          <p>{fixture.analysis.pricingGate.reason}</p>
          <small>
            {fixture.analysis.pricingGate.criticalFieldIds.length} Critical
            Fields require confirmation
          </small>
        </aside>
      </section>

      <section
        className="pe-section pe-progress"
        aria-labelledby="progress-title"
      >
        <header className="pe-section-heading">
          <p className="pe-kicker">Dossier chronology</p>
          <h2 id="progress-title">Workflow register</h2>
        </header>
        <ol>
          {fixture.workflow.map((step, index) => (
            <li key={step.label}>
              <span>{String(index + 1).padStart(2, '0')}</span>
              <div>
                <h3>{step.label}</h3>
                <p>{step.detail}</p>
              </div>
              <strong>{step.status.replace('-', ' ')}</strong>
            </li>
          ))}
        </ol>
      </section>
    </article>
  );
}

function ClientRequestPage({ fixture }: { fixture: ComparisonFixture }) {
  return (
    <article className="pe-page pe-request">
      <header className="pe-request-title">
        <p className="pe-kicker">Chapter 02 · The commission</p>
        <h1>{fixture.clientRequest.title}</h1>
        <div className="pe-title-rule">
          <p>
            A preserved account of what {fixture.client.legalName} asked for,
            who is involved, and which documentary exhibits support the work.
          </p>
          <span>{fixture.clientRequest.id}</span>
        </div>
      </header>

      <div className="pe-request-grid">
        <section className="pe-briefing" aria-labelledby="briefing-title">
          <p className="pe-kicker">Editorial brief</p>
          <h2 id="briefing-title">Mandate & intended work</h2>
          <p className="pe-dropcap">
            The request joins readiness, implementation support and practical
            training in one coordinated food-safety programme. Its evidence is
            preserved below as {fixture.requestSources.length} discrete Request
            Sources.
          </p>
          <h3>Requested Services</h3>
          <ul>
            {fixture.clientRequest.requestedServices.map((service) => (
              <li key={service}>{service}</li>
            ))}
          </ul>
        </section>

        <aside className="pe-client-colophon" aria-label="Client colophon">
          <p className="pe-note-number">Client colophon</p>
          <h2>{fixture.client.legalName}</h2>
          <dl>
            <div>
              <dt>Registration</dt>
              <dd>{fixture.client.registrationNumber}</dd>
            </div>
            <div>
              <dt>Headquarters</dt>
              <dd>{fixture.client.headquarters}</dd>
            </div>
            <div>
              <dt>Primary Contact</dt>
              <dd>
                {fixture.client.primaryContact.name}
                <small>{fixture.client.primaryContact.role}</small>
                <a href={`mailto:${fixture.client.primaryContact.email}`}>
                  {fixture.client.primaryContact.email}
                </a>
              </dd>
            </div>
            <div>
              <dt>Preferred language</dt>
              <dd>{fixture.client.primaryContact.preferredLanguage}</dd>
            </div>
          </dl>
        </aside>
      </div>

      <section className="pe-site-register" aria-labelledby="sites-title">
        <header>
          <p className="pe-kicker">Geography</p>
          <h2 id="sites-title">Operating site register</h2>
        </header>
        <ol>
          {fixture.client.operatingSites.map((site, index) => (
            <li key={site}>
              <span>{String(index + 1).padStart(2, '0')}</span>
              {site}
            </li>
          ))}
        </ol>
      </section>

      <section className="pe-exhibits" aria-labelledby="exhibits-title">
        <header className="pe-section-heading">
          <p className="pe-kicker">Document chapters</p>
          <h2 id="exhibits-title">Request Source exhibits</h2>
          <span>{fixture.requestSources.length} preserved originals</span>
        </header>
        <div className="pe-exhibit-list">
          {fixture.requestSources.map((source, index) => (
            <article data-testid="premium-editorial-source" key={source.id}>
              <header>
                <span className="pe-exhibit-number">
                  Exhibit {String(index + 1).padStart(2, '0')}
                </span>
                <p>
                  {source.type.replace('-', ' ')} · {source.language}
                </p>
                <h3>{source.title}</h3>
              </header>
              <blockquote>{source.excerpt}</blockquote>
              <footer>
                <span>{source.author}</span>
                <span>{source.receivedAt.slice(0, 10)}</span>
                <span>{source.id}</span>
              </footer>
            </article>
          ))}
        </div>
      </section>

      <section className="pe-request-status" aria-labelledby="status-title">
        <div>
          <p className="pe-kicker">Current position</p>
          <h2 id="status-title">{fixture.clientRequest.workflowStatus}</h2>
          <p>
            Owned by {fixture.clientRequest.owner}; target decision{' '}
            {fixture.clientRequest.targetDecisionAt.slice(0, 10)}.
          </p>
        </div>
        <ol>
          {fixture.workflow.map((step) => (
            <li key={step.label}>
              <strong>{step.label}</strong>
              <span>{step.status.replace('-', ' ')}</span>
              <p>{step.detail}</p>
            </li>
          ))}
        </ol>
      </section>
    </article>
  );
}

const fieldStatePresentation: Record<
  ExtractedFieldStatus,
  { symbol: string; label: string; explanation: string }
> = {
  confirmed: {
    symbol: '✓',
    label: 'Confirmed',
    explanation: 'Accepted by an Internal User or matched to approved data.',
  },
  inferred: {
    symbol: '≈',
    label: 'Inferred',
    explanation: 'Proposed from evidence and awaiting human confirmation.',
  },
  missing: {
    symbol: '—',
    label: 'Missing',
    explanation: 'Required support is not available in the Request Sources.',
  },
  contradictory: {
    symbol: '↯',
    label: 'Contradictory',
    explanation: 'Request Sources contain incompatible values.',
  },
};

function FieldStatus({ status }: { status: ExtractedFieldStatus }) {
  const presentation = fieldStatePresentation[status];

  return (
    <span
      className={`pe-field-status pe-field-status--${status}`}
      data-testid="premium-editorial-field-status"
    >
      {presentation.symbol} {presentation.label}
    </span>
  );
}

function EditorialField({
  field,
  fixture,
  number,
}: {
  field: ExtractedField;
  fixture: ComparisonFixture;
  number: number;
}) {
  const displayValue =
    field.value ??
    (field.status === 'missing'
      ? 'No supported value supplied'
      : 'No single supported value');

  return (
    <article
      className={`pe-field pe-field--${field.status}`}
      data-testid="premium-editorial-field"
    >
      <header className="pe-field-heading">
        <span className="pe-field-number">
          {String(number).padStart(2, '0')}
        </span>
        <FieldStatus status={field.status} />
      </header>
      <div className="pe-field-copy">
        <div className="pe-field-title">
          <p>
            {field.critical ? 'Critical Field' : 'Extracted Field'} · {field.id}
          </p>
          <h2>{field.label}</h2>
        </div>
        <p className="pe-field-value">{displayValue}</p>
        <dl className="pe-field-meta">
          <div>
            <dt>Authority</dt>
            <dd>
              {field.status === 'confirmed'
                ? 'Confirmed record'
                : 'AI proposal for review'}
            </dd>
          </div>
          <div>
            <dt>Confidence</dt>
            <dd>
              {field.confidence === undefined
                ? 'Not applicable'
                : `${Math.round(field.confidence * 100)}%`}
            </dd>
          </div>
          <div>
            <dt>Pricing relevance</dt>
            <dd>{field.critical ? 'Critical input' : 'Contextual input'}</dd>
          </div>
        </dl>

        {field.correction && (
          <aside className="pe-correction" aria-label="Recorded correction">
            <p className="pe-note-number">Human correction recorded</p>
            <strong>Original proposal: {field.correction.originalValue}</strong>
            <p>
              Corrected to {field.correction.correctedValue} by{' '}
              {field.correction.correctedBy} on{' '}
              {field.correction.correctedAt.slice(0, 10)}.
            </p>
            <small>{field.correction.reason}</small>
          </aside>
        )}

        {field.exception && (
          <p className="pe-exception">
            <strong>Editorial caution</strong>
            {field.exception}
          </p>
        )}

        <details className="pe-annotations">
          <summary>
            Open editorial notes · {field.provenance.length}{' '}
            {field.provenance.length === 1 ? 'source' : 'sources'}
          </summary>
          <div className="pe-annotation-sheet">
            <div className="pe-rationale">
              <p className="pe-note-number">Analysis rationale</p>
              <p>{field.rationale}</p>
            </div>
            <ol>
              {field.provenance.map((provenance, index) => {
                const source = fixture.requestSources.find(
                  (requestSource) =>
                    requestSource.id === provenance.requestSourceId,
                );

                return (
                  <li
                    key={`${field.id}-${provenance.requestSourceId}-${index}`}
                  >
                    <p>
                      Note {number}.{index + 1} · {source?.title}
                    </p>
                    <blockquote>“{provenance.quote}”</blockquote>
                    <span>
                      {provenance.locator} · {provenance.requestSourceId}
                    </span>
                  </li>
                );
              })}
            </ol>
          </div>
        </details>
      </div>
    </article>
  );
}

function AnalysisReviewPage({ fixture }: { fixture: ComparisonFixture }) {
  return (
    <article className="pe-page pe-analysis">
      <header className="pe-analysis-title">
        <div>
          <p className="pe-kicker">Chapter 03 · Annotated Analysis</p>
          <h1>Analysis is a proposal, not a verdict</h1>
        </div>
        <div className="pe-analysis-abstract">
          <p>{fixture.analysis.summary}</p>
          <dl>
            <div>
              <dt>Version</dt>
              <dd>{fixture.analysis.version}</dd>
            </div>
            <div>
              <dt>Proposed</dt>
              <dd>{fixture.analysis.proposedAt.slice(0, 10)}</dd>
            </div>
            <div>
              <dt>Review owner</dt>
              <dd>{fixture.analysis.reviewedBy}</dd>
            </div>
          </dl>
        </div>
      </header>

      <section className="pe-analysis-gate" aria-label="Pricing gate">
        <span>Pricing gate · blocked</span>
        <strong>{fixture.analysis.pricingGate.reason}</strong>
        <p>
          Critical references:{' '}
          {fixture.analysis.pricingGate.criticalFieldIds.join(' · ')}
        </p>
      </section>

      <section className="pe-state-key" aria-labelledby="state-key-title">
        <header>
          <p className="pe-kicker">Reading key</p>
          <h2 id="state-key-title">Four editorial states</h2>
        </header>
        <ol>
          {(
            Object.entries(fieldStatePresentation) as ReadonlyArray<
              [
                ExtractedFieldStatus,
                (typeof fieldStatePresentation)[ExtractedFieldStatus],
              ]
            >
          ).map(([status, presentation]) => (
            <li key={status}>
              <span aria-hidden="true">{presentation.symbol}</span>
              <div>
                <strong>{presentation.label}</strong>
                <p>{presentation.explanation}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="pe-field-register" aria-labelledby="register-title">
        <header className="pe-section-heading">
          <p className="pe-kicker">Annotated register</p>
          <h2 id="register-title">Extracted Fields</h2>
          <span>{fixture.extractedFields.length} proposals</span>
        </header>
        {fixture.extractedFields.map((field, index) => (
          <EditorialField
            field={field}
            fixture={fixture}
            key={field.id}
            number={index + 1}
          />
        ))}
      </section>

      <footer className="pe-review-close">
        <p className="pe-kicker">End note</p>
        <h2>Human judgement closes the dossier.</h2>
        <p>
          The {fixture.analysis.pricingGate.criticalFieldIds.length} Critical
          Fields named above remain outside pricing until an Internal User
          confirms supported values.
        </p>
        <a href="/design-lab/premium-editorial/client-request">
          Return to Request Sources <span aria-hidden="true">→</span>
        </a>
      </footer>
    </article>
  );
}

export function PremiumEditorialConcept({ fixture, screen }: ConceptProps) {
  return (
    <div className="pe-shell">
      <EditorialNavigation screen={screen} />
      <main className="pe-stage">
        <div className="pe-running-head">
          <span>
            {fixture.client.legalName} / {fixture.clientRequest.id}
          </span>
          <span>Analysis dossier · v{fixture.analysis.version}</span>
        </div>
        {screen === 'dashboard' && <DashboardPage fixture={fixture} />}
        {screen === 'client-request' && <ClientRequestPage fixture={fixture} />}
        {screen === 'analysis-review' && (
          <AnalysisReviewPage fixture={fixture} />
        )}
        <footer className="pe-footer">
          <span>PRISMA-PRIM Suite · Premium Editorial study</span>
          <span>Direction 02 / Not approved</span>
        </footer>
      </main>
    </div>
  );
}
