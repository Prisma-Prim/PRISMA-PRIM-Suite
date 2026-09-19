import { publicWelcomeCopy as copy } from './public-welcome.copy';
import './public-welcome.css';

export function PublicWelcome() {
  return (
    <main className="public-welcome">
      <header className="public-welcome-brand">
        <span className="public-welcome-mark" aria-hidden="true">
          <svg viewBox="0 0 40 40" focusable="false">
            <path d="M20 2 37 12v16L20 38 3 28V12Z" />
            <path d="m20 2 4 17-21-7m34 0-13 7 13 9M3 28l21-9-4 19" />
          </svg>
        </span>
        <span>{copy.product}</span>
      </header>

      <section
        className="public-welcome-introduction"
        aria-labelledby="welcome-title"
      >
        <p className="public-welcome-eyebrow">{copy.eyebrow}</p>
        <h1 id="welcome-title">{copy.title}</h1>
        <p className="public-welcome-description">{copy.description}</p>
        <p className="public-welcome-invitation">{copy.invitationOnly}</p>
        <a className="public-welcome-action" href="/sign-in">
          {copy.signIn}
        </a>
      </section>

      <aside
        className="public-welcome-workflow"
        aria-label={copy.workflowLabel}
      >
        <div className="public-welcome-orbit" aria-hidden="true" />
        <ol>
          {copy.workflow.map((step, index) => (
            <li key={step}>
              <span aria-hidden="true">0{index + 1}</span>
              {step}
            </li>
          ))}
        </ol>
      </aside>
    </main>
  );
}
