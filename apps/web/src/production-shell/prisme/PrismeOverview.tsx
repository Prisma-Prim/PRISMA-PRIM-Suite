import type { MouseEventHandler, ReactNode } from 'react';
import { FiberMotion } from '../fiber/FiberMotion';
import {
  FolderKanban,
  Activity,
  ArrowRight,
  BookOpen,
  Building2,
  ClipboardList,
  LayoutGrid,
  ListTodo,
  Mail,
  ShieldCheck,
  SlidersHorizontal,
  Users,
} from 'lucide-react';
import type { ApplicationSection, FrameContext } from '../ApplicationShell';
import { usePrismeCopy } from './prisme.copy';

export function PrismeMark() {
  return (
    <svg viewBox="0 0 35 38" aria-hidden="true">
      <path d="M17.5 2 33 30 17.5 37 2 30Z" fill="#7355da" />
      <path d="m17.5 2 0 23L2 30Z" fill="#c4b1fd" />
      <path d="m17.5 25 0 12L33 30Z" fill="#9a77e9" />
      <path d="m9 27 8.5-16L26 27Z" fill="#fff" fillOpacity=".8" />
    </svg>
  );
}

export function SectionIcon({
  id,
}: {
  id: ApplicationSection['id'] | 'overview';
}) {
  const icons = {
    overview: LayoutGrid,
    projects: FolderKanban,
    'my-tasks': ListTodo,
    clients: Users,
    access: ShieldCheck,
    companies: Building2,
    documents: Mail,
    requests: ClipboardList,
    complaints: ClipboardList,
    catalogue: BookOpen,
    pricing: SlidersHorizontal,
    activity: Activity,
    invitations: Mail,
  };
  const Icon = icons[id];
  return <Icon aria-hidden="true" />;
}

export function PrismeOverview({
  context,
  sections,
  summary,
  onNavigate,
}: {
  context: FrameContext;
  sections: readonly ApplicationSection[];
  /** The Company summary region App composes for the active Company, if any. */
  summary?: ReactNode;
  onNavigate: MouseEventHandler<HTMLAnchorElement>;
}) {
  const copy = usePrismeCopy();
  return (
    <div className="prisme-overview">
      <section className="prisme-hero" aria-labelledby="prisme-hero-title">
        <FiberMotion />
        <div className="prisme-hero-copy">
          <p className="prisme-eyebrow">{copy.heroEyebrow}</p>
          <h2 id="prisme-hero-title">{copy.heroTitle}</h2>
          <p>{copy.heroDescription}</p>
          {sections.some((section) => section.id === 'clients') && (
            <a href="#clients" onClick={onNavigate}>
              {copy.sections.clients.label}
              <ArrowRight aria-hidden="true" />
            </a>
          )}
        </div>
      </section>
      {summary}
      <div className="prisme-overview-grid">
        <section
          className="prisme-capabilities"
          aria-labelledby="prisme-capabilities-title"
        >
          <h2 id="prisme-capabilities-title">{copy.capabilities}</h2>
          <p>{copy.capabilitiesDescription}</p>
          <ul>
            {sections.map((section) => (
              <li key={section.id}>
                <a href={`#${section.id}`} onClick={onNavigate}>
                  <span className="prisme-capability-icon">
                    <SectionIcon id={section.id} />
                  </span>
                  <span>
                    <strong>{section.label}</strong>
                    <small>{section.description}</small>
                  </span>
                  <ArrowRight aria-hidden="true" />
                </a>
              </li>
            ))}
          </ul>
        </section>
        <section
          className="prisme-context-card"
          aria-labelledby="prisme-context-card-title"
        >
          <p className="prisme-eyebrow">{copy.contextTitle}</p>
          <h2 id="prisme-context-card-title">{context.workspaceName}</h2>
          <dl>
            <div>
              <dt>{copy.company}</dt>
              <dd>{context.companyName ?? copy.noCompany}</dd>
            </div>
          </dl>
          <p>{copy.contextDescription}</p>
        </section>
      </div>
    </div>
  );
}
