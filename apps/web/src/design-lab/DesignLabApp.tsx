import { comparisonFixture } from './comparisonFixture';
import {
  designLabScreens,
  directionSlots,
  type DesignLabScreen,
  type DirectionSlot,
} from './directions';
import './design-lab.css';

interface DesignLabAppProps {
  pathname: string;
}

interface ConceptRoute {
  direction: DirectionSlot;
  screen: DesignLabScreen;
}

function resolveConceptRoute(pathname: string): ConceptRoute | undefined {
  const routeParts = pathname.split('/').filter(Boolean);

  if (routeParts.length !== 3 || routeParts[0] !== 'design-lab') {
    return undefined;
  }

  const direction = directionSlots.find((slot) => slot.id === routeParts[1]);
  const screen = designLabScreens.find(
    (candidate) => candidate === routeParts[2],
  );

  if (!direction || !screen) {
    return undefined;
  }

  return { direction, screen };
}

function DesignLabIndex() {
  return (
    <main className="design-lab-index">
      <header className="design-lab-header">
        <p>PRISMA-PRIM Suite · isolated prototype area</p>
        <h1>Design direction lab</h1>
        <p>
          Six independent directions share comparison data and viewports, not a
          visual shell.
        </p>
      </header>

      <ol className="direction-grid">
        {directionSlots.map((direction, index) => (
          <li data-testid="direction-slot" key={direction.id}>
            <span>Direction {index + 1}</span>
            <h2>{direction.title}</h2>
            <p>{direction.prompt}</p>
            <a href={`/design-lab/${direction.id}/dashboard`}>
              {direction.Concept ? 'Open concept' : 'Open placeholder'}
            </a>
          </li>
        ))}
      </ol>
    </main>
  );
}

function DirectionPlaceholder({ route }: { route: ConceptRoute }) {
  return (
    <main className="direction-placeholder">
      <a href="/design-lab">Back to all directions</a>
      <p>Direction slot reserved</p>
      <h1>{route.direction.title}</h1>
      <p>{route.direction.prompt}</p>
      <p>
        Requested screen: <strong>{route.screen}</strong>. A future direction
        issue will replace this lab-owned placeholder with an independent
        concept.
      </p>
      <nav aria-label="Representative screens">
        {designLabScreens.map((screen) => (
          <a
            aria-current={screen === route.screen ? 'page' : undefined}
            href={`/design-lab/${route.direction.id}/${screen}`}
            key={screen}
          >
            {screen}
          </a>
        ))}
      </nav>
    </main>
  );
}

export function DesignLabApp({ pathname }: DesignLabAppProps) {
  if (pathname === '/design-lab' || pathname === '/design-lab/') {
    return <DesignLabIndex />;
  }

  const route = resolveConceptRoute(pathname);

  if (!route) {
    return (
      <main className="direction-placeholder">
        <h1>Design lab route not found</h1>
        <a href="/design-lab">Back to all directions</a>
      </main>
    );
  }

  if (route.direction.Concept) {
    const Concept = route.direction.Concept;
    return <Concept fixture={comparisonFixture} screen={route.screen} />;
  }

  return <DirectionPlaceholder route={route} />;
}
