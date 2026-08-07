import type {
  ComparisonFixture,
  ExtractedField,
  ExtractedFieldStatus,
} from '../../comparisonFixture';
import type { ConceptProps, DesignLabScreen } from '../../directions';
import './institutional-assurance.css';

const conceptBasePath = '/design-lab/institutional-assurance';

const dateTimeFormatter = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
  timeZone: 'Europe/Bucharest',
});

function formatDateTime(value: string) {
  return dateTimeFormatter.format(new Date(value)).replace(',', ' ·');
}

function getInitials(name: string) {
  return name
    .split(' ')
    .map((part) => part[0])
    .join('');
}

const navigation: ReadonlyArray<{
  screen: DesignLabScreen;
  label: string;
  index: string;
}> = [
  { screen: 'dashboard', label: 'Assurance register', index: '01' },
  { screen: 'client-request', label: 'Client Request', index: '02' },
  { screen: 'analysis-review', label: 'Analysis review', index: '03' },
];

function ConceptNavigation({
  fixture,
  screen,
}: {
  fixture: ComparisonFixture;
  screen: DesignLabScreen;
}) {
  return (
    <nav className="ia-navigation" aria-label="Institutional Assurance">
      <a className="ia-wordmark" href="/design-lab">
        <span className="ia-seal" aria-hidden="true">
          PP
        </span>
        <span>
          <strong>PRISMA-PRIM</strong>
          <small>Assurance office</small>
        </span>
      </a>

      <div className="ia-navigation-label">Active register</div>
      <ol>
        {navigation.map((item) => (
          <li key={item.screen}>
            <a
              aria-current={item.screen === screen ? 'page' : undefined}
              href={`${conceptBasePath}/${item.screen}`}
            >
              <span aria-hidden="true">{item.index}</span>
              {item.label}
            </a>
          </li>
        ))}
      </ol>

      <div className="ia-steward">
        <span aria-hidden="true">
          {getInitials(fixture.clientRequest.owner)}
        </span>
        <p>
          <strong>{fixture.clientRequest.owner}</strong>
          <small>Request steward</small>
        </p>
      </div>
    </nav>
  );
}

function RegisterHeader({
  eyebrow,
  title,
  fixture,
}: {
  eyebrow: string;
  title: string;
  fixture: ComparisonFixture;
}) {
  return (
    <header className="ia-register-header">
      <div>
        <p className="ia-eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
      </div>
      <dl className="ia-register-meta">
        <div>
          <dt>Dossier</dt>
          <dd>{fixture.clientRequest.id}</dd>
        </div>
        <div>
          <dt>Status</dt>
          <dd>{fixture.clientRequest.workflowStatus}</dd>
        </div>
        <div>
          <dt>Steward</dt>
          <dd>{fixture.clientRequest.owner}</dd>
        </div>
      </dl>
    </header>
  );
}

function DashboardPage({ fixture }: { fixture: ComparisonFixture }) {
  const attentionCount = fixture.extractedFields.filter(
    (field) => field.status !== 'confirmed',
  ).length;

  return (
    <>
      <RegisterHeader
        eyebrow="Governance register · current portfolio"
        fixture={fixture}
        title="Assurance register"
      />

      <section className="ia-assurance-banner" aria-label="Register status">
        <div>
          <span className="ia-signal ia-signal--blocked" aria-hidden="true" />
          <p>
            <strong>Human review required</strong>
            <span>{attentionCount} Extracted Fields need human attention</span>
          </p>
        </div>
        <a href={`${conceptBasePath}/analysis-review`}>
          Open controlled review <span aria-hidden="true">→</span>
        </a>
      </section>

      <div className="ia-dashboard-grid">
        <section className="ia-casefile" aria-labelledby="active-dossier-title">
          <div className="ia-section-heading">
            <div>
              <p className="ia-kicker">Priority dossier</p>
              <h2 id="active-dossier-title">{fixture.clientRequest.title}</h2>
            </div>
            <span className="ia-reference">{fixture.clientRequest.id}</span>
          </div>

          <dl className="ia-dossier-facts">
            <div>
              <dt>Client</dt>
              <dd>{fixture.client.legalName}</dd>
            </div>
            <div>
              <dt>Responsible</dt>
              <dd>{fixture.clientRequest.owner}</dd>
            </div>
            <div>
              <dt>Current state</dt>
              <dd>
                <span className="ia-state-marker" aria-hidden="true" />
                {fixture.clientRequest.workflowStatus}
              </dd>
            </div>
            <div>
              <dt>Decision due</dt>
              <dd>{formatDateTime(fixture.clientRequest.targetDecisionAt)}</dd>
            </div>
          </dl>

          <ol className="ia-workflow" aria-label="Client Request workflow">
            {fixture.workflow.map((step, index) => (
              <li data-status={step.status} key={step.label}>
                <span className="ia-workflow-index">{index + 1}</span>
                <div>
                  <strong>{step.label}</strong>
                  <small>{step.detail}</small>
                </div>
                <span className="ia-workflow-status">{step.status}</span>
              </li>
            ))}
          </ol>

          <footer className="ia-casefile-footer">
            <span>
              {fixture.requestSources.length} preserved Request Sources
            </span>
            <a href={`${conceptBasePath}/client-request`}>
              Inspect dossier <span aria-hidden="true">→</span>
            </a>
          </footer>
        </section>

        <aside className="ia-actions" aria-labelledby="pending-actions-title">
          <div className="ia-section-heading ia-section-heading--compact">
            <div>
              <p className="ia-kicker">Responsibility ledger</p>
              <h2 id="pending-actions-title">Pending actions</h2>
            </div>
            <span className="ia-count">{fixture.pendingActions.length}</span>
          </div>
          <ol>
            {fixture.pendingActions.map((action) => (
              <li data-priority={action.priority} key={action.id}>
                <div className="ia-action-topline">
                  <span>{action.priority}</span>
                  <small>{action.id}</small>
                </div>
                <strong>{action.label}</strong>
                <p>{action.reason}</p>
                <div className="ia-action-owner">
                  <span aria-hidden="true">{getInitials(action.owner)}</span>
                  Owned by {action.owner}
                </div>
              </li>
            ))}
          </ol>
        </aside>
      </div>
    </>
  );
}

function ClientRequestPage({ fixture }: { fixture: ComparisonFixture }) {
  return (
    <>
      <RegisterHeader
        eyebrow={`Controlled dossier · ${fixture.clientRequest.id}`}
        fixture={fixture}
        title="Client Request dossier"
      />

      <section className="ia-dossier-cover" aria-labelledby="request-title">
        <div>
          <p className="ia-kicker">Client expression of need</p>
          <h2 id="request-title">{fixture.clientRequest.title}</h2>
        </div>
        <dl>
          <div>
            <dt>State</dt>
            <dd>{fixture.clientRequest.workflowStatus}</dd>
          </div>
          <div>
            <dt>Received</dt>
            <dd>{formatDateTime(fixture.clientRequest.receivedAt)}</dd>
          </div>
          <div>
            <dt>Decision due</dt>
            <dd>{formatDateTime(fixture.clientRequest.targetDecisionAt)}</dd>
          </div>
        </dl>
      </section>

      <div className="ia-request-layout">
        <section
          className="ia-client-record"
          aria-labelledby="client-record-title"
        >
          <div className="ia-section-heading ia-section-heading--compact">
            <div>
              <p className="ia-kicker">Governed party</p>
              <h2 id="client-record-title">{fixture.client.legalName}</h2>
            </div>
            <span className="ia-record-status">Client record</span>
          </div>
          <dl className="ia-client-details">
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
                <strong>{fixture.client.primaryContact.name}</strong>
                <span>{fixture.client.primaryContact.role}</span>
                <span>{fixture.client.primaryContact.email}</span>
              </dd>
            </div>
            <div>
              <dt>Communication</dt>
              <dd>{fixture.client.primaryContact.preferredLanguage}</dd>
            </div>
          </dl>
        </section>

        <aside
          className="ia-request-brief"
          aria-labelledby="request-brief-title"
        >
          <p className="ia-kicker">Recorded scope</p>
          <h2 id="request-brief-title">Services requested</h2>
          <ul>
            {fixture.clientRequest.requestedServices.map((service) => (
              <li key={service}>{service}</li>
            ))}
          </ul>
          <div className="ia-sites">
            <strong>Operating sites named</strong>
            {fixture.client.operatingSites.map((site) => (
              <span key={site}>{site}</span>
            ))}
          </div>
        </aside>
      </div>

      <section
        className="ia-source-register"
        aria-labelledby="source-register-title"
      >
        <div className="ia-section-heading">
          <div>
            <p className="ia-kicker">Original evidence · preserved unchanged</p>
            <h2 id="source-register-title">Request Source register</h2>
          </div>
          <span className="ia-count">{fixture.requestSources.length}</span>
        </div>
        <div className="ia-source-grid">
          {fixture.requestSources.map((source, index) => (
            <article key={source.id}>
              <div className="ia-source-folio">
                <span>Evidence {String(index + 1).padStart(2, '0')}</span>
                <small>{source.id}</small>
              </div>
              <span className="ia-source-type">{source.type}</span>
              <h3>{source.title}</h3>
              <p className="ia-source-origin">
                {source.author} · {source.language}
              </p>
              <blockquote
                aria-label={`Preserved excerpt from ${source.title}`}
                tabIndex={0}
              >
                {source.excerpt}
              </blockquote>
            </article>
          ))}
        </div>
        <footer className="ia-source-footer">
          <span>
            Evidence remains attributed to its author, language and source ID.
          </span>
          <a href={`${conceptBasePath}/analysis-review`}>
            Review proposed fields against evidence{' '}
            <span aria-hidden="true">→</span>
          </a>
        </footer>
      </section>
    </>
  );
}

const fieldStatePresentation: Record<
  ExtractedFieldStatus,
  { label: string; symbol: string; instruction: string }
> = {
  confirmed: {
    label: 'Confirmed',
    symbol: '✓',
    instruction: 'Accepted evidence',
  },
  inferred: {
    label: 'Inferred',
    symbol: '~',
    instruction: 'Human confirmation required',
  },
  missing: {
    label: 'Missing',
    symbol: '—',
    instruction: 'No supported value',
  },
  contradictory: {
    label: 'Contradictory',
    symbol: '!',
    instruction: 'Sources disagree',
  },
};

function FieldRecord({
  field,
  fixture,
}: {
  field: ExtractedField;
  fixture: ComparisonFixture;
}) {
  const presentation = fieldStatePresentation[field.status];
  const displayValue =
    field.value ??
    (field.status === 'contradictory'
      ? 'Incompatible source values'
      : 'No supported value available');

  return (
    <article
      aria-label={`${field.label} — ${presentation.label}`}
      className="ia-field-record"
      data-field-status={field.status}
    >
      <div className="ia-field-heading">
        <div>
          <span className="ia-field-state">
            <span aria-hidden="true">{presentation.symbol}</span>
            {presentation.label}
          </span>
          <small>{presentation.instruction}</small>
        </div>
        <span className="ia-field-id">{field.id}</span>
      </div>

      <div className="ia-field-value">
        <div>
          <h3>{field.label}</h3>
          <strong>{displayValue}</strong>
        </div>
        {field.critical ? <span>Critical Field</span> : null}
      </div>

      <p className="ia-field-rationale">{field.rationale}</p>

      {field.correction ? (
        <div className="ia-correction-record">
          <strong>Human correction recorded</strong>
          <span>Originally proposed: {field.correction.originalValue}</span>
          <span>
            {field.correction.correctedBy} ·{' '}
            {formatDateTime(field.correction.correctedAt)} ·{' '}
            {field.correction.reason}
          </span>
        </div>
      ) : null}

      {field.exception ? (
        <p className="ia-field-exception">
          <span aria-hidden="true">!</span> {field.exception}
        </p>
      ) : null}

      <details className="ia-provenance">
        <summary>
          Inspect provenance · {field.provenance.length}{' '}
          {field.provenance.length === 1 ? 'source' : 'sources'}
        </summary>
        <ul>
          {field.provenance.map((provenance) => {
            const source = fixture.requestSources.find(
              (candidate) => candidate.id === provenance.requestSourceId,
            );

            return (
              <li key={`${field.id}-${provenance.requestSourceId}`}>
                <strong>
                  {source?.title} · {provenance.locator}
                </strong>
                <q>{provenance.quote}</q>
              </li>
            );
          })}
        </ul>
      </details>
    </article>
  );
}

function AnalysisReviewPage({ fixture }: { fixture: ComparisonFixture }) {
  const extractedFieldsById = new Map(
    fixture.extractedFields.map((field) => [field.id, field]),
  );
  const pricingGateCriticalFields =
    fixture.analysis.pricingGate.criticalFieldIds.map((fieldId) => {
      const field = extractedFieldsById.get(fieldId);

      if (!field) {
        throw new Error(`Pricing gate Critical Field not found: ${fieldId}`);
      }

      return field;
    });

  return (
    <>
      <RegisterHeader
        eyebrow={`Controlled Analysis · version ${fixture.analysis.version}`}
        fixture={fixture}
        title="Analysis decision record"
      />

      <section className="ia-analysis-notice" aria-label="Analysis authority">
        <div>
          <span className="ia-ai-mark" aria-hidden="true">
            AI
          </span>
          <p>
            <strong>AI proposal · not a decision</strong>
            <span>{fixture.analysis.summary}</span>
          </p>
        </div>
        <dl>
          <div>
            <dt>Proposed</dt>
            <dd>{formatDateTime(fixture.analysis.proposedAt)}</dd>
          </div>
          <div>
            <dt>Review steward</dt>
            <dd>{fixture.analysis.reviewedBy}</dd>
          </div>
        </dl>
      </section>

      <div className="ia-analysis-layout">
        <section
          className="ia-field-register"
          aria-labelledby="field-register-title"
        >
          <div className="ia-section-heading">
            <div>
              <p className="ia-kicker">Evidence-led review ledger</p>
              <h2 id="field-register-title">Extracted Field register</h2>
            </div>
            <span className="ia-reference">
              {fixture.extractedFields.length} fields · v
              {fixture.analysis.version}
            </span>
          </div>
          <ul
            className="ia-mobile-state-strip"
            aria-label="Field states in use"
          >
            {Object.entries(fieldStatePresentation).map(
              ([status, statePresentation]) => (
                <li data-state={status} key={status}>
                  <span aria-hidden="true">{statePresentation.symbol}</span>
                  {statePresentation.label}
                </li>
              ),
            )}
          </ul>
          <div className="ia-field-grid">
            {fixture.extractedFields.map((field) => (
              <FieldRecord field={field} fixture={fixture} key={field.id} />
            ))}
          </div>
        </section>

        <aside className="ia-review-rail" aria-label="Review controls">
          <section
            className="ia-pricing-gate"
            aria-labelledby="pricing-gate-title"
          >
            <p className="ia-kicker">Deterministic control</p>
            <h2 id="pricing-gate-title">Pricing gate blocked</h2>
            <p>{fixture.analysis.pricingGate.reason}</p>
            <ul>
              {pricingGateCriticalFields.map((field) => (
                <li key={field.id}>
                  <span aria-hidden="true">×</span>
                  <div>
                    <strong>{field.label}</strong>
                    <small>{fieldStatePresentation[field.status].label}</small>
                  </div>
                </li>
              ))}
            </ul>
            <button disabled type="button">
              Begin pricing
            </button>
            <small>
              Available only when all {pricingGateCriticalFields.length}{' '}
              Critical Fields are Confirmed.
            </small>
          </section>

          <section className="ia-state-key" aria-labelledby="state-key-title">
            <p className="ia-kicker">Decision key</p>
            <h2 id="state-key-title">Field assurance states</h2>
            <ul>
              {Object.entries(fieldStatePresentation).map(
                ([status, presentation]) => (
                  <li data-state={status} key={status}>
                    <span aria-hidden="true">{presentation.symbol}</span>
                    <div>
                      <strong>{presentation.label}</strong>
                      <small>{presentation.instruction}</small>
                    </div>
                  </li>
                ),
              )}
            </ul>
          </section>

          <p className="ia-approval-boundary">
            <strong>Approval boundary</strong>
            An Internal User must inspect evidence and record every important
            decision. Analysis may propose; it cannot approve.
          </p>
        </aside>
      </div>
    </>
  );
}

export function InstitutionalAssuranceConcept({
  fixture,
  screen,
}: ConceptProps) {
  return (
    <div className="ia-concept">
      <ConceptNavigation fixture={fixture} screen={screen} />
      <main className="ia-main">
        {screen === 'dashboard' ? (
          <DashboardPage fixture={fixture} />
        ) : screen === 'client-request' ? (
          <ClientRequestPage fixture={fixture} />
        ) : (
          <AnalysisReviewPage fixture={fixture} />
        )}
      </main>
    </div>
  );
}
