import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useId } from 'react';
import { sectionsOwningFocusTarget } from '../../production-shell/application-section';
import type {
  ClarteEntryViews,
  ClarteScreen,
  ClarteView,
} from '../clarte-entries';
import {
  settingsGroups,
  settingsSections,
  type SettingsSection,
} from './settings-registry';
import { useSettingsConsoleCopy } from './settings-console.copy';
import './settings.css';

type OfferedSection = Readonly<{
  view: ClarteView;
  section: SettingsSection;
}>;

/** The offered views that are registered console sections, in view order. */
function offeredSections(views: readonly ClarteView[]): OfferedSection[] {
  return views.flatMap((view) => {
    const section = settingsSections.find(
      (candidate) => candidate.destination === view.id,
    );
    return section ? [{ view, section }] : [];
  });
}

/** The frame leaves these sections' focus destination to the screen. */
function ownsFocusTarget(id: ClarteScreen['id']): boolean {
  return [...sectionsOwningFocusTarget].some((owner) => owner === id);
}

/**
 * The Settings console (#1546): the sections the actor may open, grouped, on
 * the left; the chosen section beside them. On phone the console's home is
 * the list, and a section fills the screen with a way back to the list.
 * It shows what App composed; it owns no data, request or permission.
 */
export function SettingsConsole({
  screen,
  entry,
}: Readonly<{ screen: ClarteScreen; entry: ClarteEntryViews }>) {
  const copy = useSettingsConsoleCopy();
  const titleId = useId();
  const sections = offeredSections(entry.views);
  const home = entry.views.find((view) => view.id === 'settings');
  const current = settingsSections.find(
    (section) => section.destination === screen.id,
  );
  return (
    <div className="clarte-settings">
      <nav className="clarte-settings-nav" aria-label={copy.sections}>
        <SectionList
          sections={sections}
          currentId={screen.id}
          onNavigate={entry.onNavigate}
        />
      </nav>
      <div className="clarte-settings-content">
        {screen.id === 'settings' ? (
          <section aria-labelledby={titleId}>
            <div className="clarte-settings-head">
              <h2 id={titleId}>{screen.label}</h2>
              <p>{screen.description}</p>
            </div>
            <SettingsHome sections={sections} onNavigate={entry.onNavigate} />
          </section>
        ) : (
          <>
            {home && (
              <a
                className="clarte-settings-back"
                href={home.href}
                onClick={entry.onNavigate}
              >
                <ChevronLeft aria-hidden="true" />
                {copy.back}
              </a>
            )}
            {current?.screen === 'current' ? (
              screen.content
            ) : (
              <section
                aria-labelledby={titleId}
                // The section's own focus destination, when the frame leaves it to the screen.
                id={ownsFocusTarget(screen.id) ? screen.id : undefined}
                tabIndex={ownsFocusTarget(screen.id) ? -1 : undefined}
                className="clarte-settings-section"
              >
                <div className="clarte-settings-head">
                  <h2 id={titleId}>{screen.label}</h2>
                  <p>{screen.description}</p>
                </div>
                {screen.clarteContent}
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function SectionList({
  sections,
  currentId,
  onNavigate,
}: Readonly<{
  sections: readonly OfferedSection[];
  currentId: ClarteScreen['id'];
  onNavigate: ClarteEntryViews['onNavigate'];
}>) {
  const copy = useSettingsConsoleCopy();
  const listId = useId();
  return settingsGroups.map((group) => {
    const members = sections.filter(({ section }) => section.group === group);
    if (members.length === 0) return null;
    return (
      <div className="clarte-settings-group" key={group}>
        <p className="clarte-settings-group-title" id={`${listId}-${group}`}>
          {copy.group(group)}
        </p>
        <ul aria-labelledby={`${listId}-${group}`}>
          {members.map(({ view, section }) => {
            const Icon = section.icon;
            return (
              <li key={view.id}>
                <a
                  href={view.href}
                  aria-current={view.id === currentId ? 'page' : undefined}
                  onClick={onNavigate}
                >
                  <Icon aria-hidden="true" />
                  <span>{view.label}</span>
                </a>
              </li>
            );
          })}
        </ul>
      </div>
    );
  });
}

/** The console's home: every offered section with what it is for. */
function SettingsHome({
  sections,
  onNavigate,
}: Readonly<{
  sections: readonly OfferedSection[];
  onNavigate: ClarteEntryViews['onNavigate'];
}>) {
  const copy = useSettingsConsoleCopy();
  const listId = useId();
  return (
    <div className="clarte-settings-home">
      {settingsGroups.map((group) => {
        const members = sections.filter(
          ({ section }) => section.group === group,
        );
        if (members.length === 0) return null;
        return (
          <div className="clarte-card clarte-settings-home-group" key={group}>
            <h3 id={`${listId}-${group}`}>{copy.group(group)}</h3>
            <ul aria-labelledby={`${listId}-${group}`}>
              {members.map(({ view, section }) => {
                const Icon = section.icon;
                return (
                  <li key={view.id}>
                    <a href={view.href} onClick={onNavigate}>
                      <Icon aria-hidden="true" />
                      <span>
                        <strong>{view.label}</strong>
                        <small>{view.description}</small>
                      </span>
                      <ChevronRight aria-hidden="true" />
                    </a>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
