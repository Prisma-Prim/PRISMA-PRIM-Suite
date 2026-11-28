import { expect, test, type Page, type Route } from '@playwright/test';
import {
  createClarteImprovementApi,
  recordedEntryId,
  recordedIdeaId,
  recordedRiskId,
  seededIdeas,
  seededRisks,
} from '../src/clarte/improvement/clarte-improvement.test-fixture';
import { isPhoneLayout, openClarte } from './clarte.fixture';

/** Every API request is answered by the shared fictional Improvement API. */
async function serveImprovement(page: Page) {
  const api = createClarteImprovementApi();
  await page.route('**/api/**', async (route: Route) => {
    const request = route.request();
    const contentType = request.headers()['content-type'] ?? '';
    const reply = api.reply({
      method: request.method(),
      url: new URL(request.url()),
      body: contentType.startsWith('application/json')
        ? request.postDataJSON()
        : undefined,
    });
    return route.fulfill({ status: reply.status, json: reply.json });
  });
  return api;
}

async function screenshot(page: Page, name: string) {
  const width = isPhoneLayout(page) ? '390' : '1440';
  await page.screenshot({
    path: test.info().outputPath(`${name}-${width}.png`),
    fullPage: false,
  });
}

async function noHorizontalScroll(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
}

test('records and postpones an Idea, rejects another, records a risk, corrects its facts, adds a log note, corrects it and reads the history', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const api = await serveImprovement(page);
  await openClarte(page, '/#ideas');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Improvement',
  );

  // Ideas: the list, then a proposal recorded from its side panel.
  const ideas = page.getByRole('region', { name: 'Recorded Ideas' });
  await expect(
    ideas.getByRole('button', { name: 'Shared glossary for audit reports' }),
  ).toBeVisible();
  await expect(ideas.getByText('Ideas: 3')).toBeVisible();
  await noHorizontalScroll(page);
  await screenshot(page, 'clarte-improvement-ideas');

  await ideas.getByRole('button', { name: 'Propose an Idea' }).click();
  const proposal = page.getByRole('dialog', { name: 'Propose an Idea' });
  await proposal
    .getByLabel('Description')
    .fill('Fictional calendar of surveillance audits');
  await proposal.getByLabel('Origin').fill('Fictional quality meeting');
  await proposal.getByRole('button', { name: 'Record Idea' }).click();

  // Postpone it to a declared review date, without any reminder.
  const idea = page.getByRole('dialog', {
    name: 'Fictional calendar of surveillance audits',
  });
  await expect(idea.getByText(/Saved. The confirmed result/u)).toBeVisible();
  await expect(
    idea.getByText('Fictional quality meeting', { exact: true }),
  ).toBeVisible();
  await expect(idea.getByRole('radio', { name: 'Postpone' })).toBeChecked();
  await idea.getByLabel('Reason').fill('Revisit with the 2027 audit plan');
  await idea.getByLabel('Reconsideration date (optional)').fill('2027-03-15');
  await idea.getByRole('button', { name: 'Record disposition' }).click();
  const decisions = idea.getByRole('region', { name: 'Disposition history' });
  await expect(
    decisions.getByText('Revisit with the 2027 audit plan'),
  ).toBeVisible();
  await expect(
    decisions.getByText('Declared review date: Mar 15, 2027'),
  ).toBeVisible();
  await noHorizontalScroll(page);
  await screenshot(page, 'clarte-improvement-idea');
  await idea.getByRole('button', { name: 'Close' }).click();
  await expect(idea).toHaveCount(0);

  // Reject another Idea with a reason; its earlier decision stays in history.
  await ideas
    .getByRole('button', { name: seededIdeas.checklist.description })
    .click();
  const checklist = page.getByRole('dialog', {
    name: seededIdeas.checklist.description,
  });
  await checklist.getByRole('radio', { name: 'Reject' }).check();
  await checklist
    .getByLabel('Reason')
    .fill('Opening meetings already follow one bilingual plan');
  await checklist.getByRole('button', { name: 'Record disposition' }).click();
  await expect(
    checklist
      .getByRole('region', { name: 'Disposition history' })
      .getByRole('listitem'),
  ).toHaveCount(2);
  await checklist.getByRole('button', { name: 'Close' }).click();

  // Operational risks: the register, then a new risk with every fact.
  await page
    .getByRole('navigation', { name: 'Improvement views' })
    .getByRole('link', { name: 'Operational risks' })
    .click();
  const register = page.getByRole('region', { name: 'Recorded risks' });
  await expect(
    register.getByRole('button', {
      name: seededRisks.calibration.facts.process,
    }),
  ).toBeVisible();
  await noHorizontalScroll(page);
  await screenshot(page, 'clarte-improvement-risks');

  await register.getByRole('button', { name: 'Record a risk' }).click();
  const intake = page.getByRole('dialog', { name: 'Record a risk' });
  await intake
    .getByLabel(/^Process \/ activity/u)
    .fill('Fictional supplier audits');
  await intake
    .getByLabel(/^Possible cause/u)
    .fill('One supplier audit per year');
  await intake
    .getByLabel(/^Possible effect/u)
    .fill('A supplier change goes unnoticed');
  await intake
    .getByLabel('Existing measures (optional)')
    .fill('Supplier list reviewed in January');
  await intake
    .getByLabel(/^Planned measure/u)
    .fill('Add a mid-year supplier check');
  await intake.getByLabel('Planned date (optional)').fill('2027-07-01');
  await intake
    .getByLabel('Source description (optional)')
    .fill('Fictional management review');
  await noHorizontalScroll(page);
  await screenshot(page, 'clarte-improvement-record-risk');
  await intake.getByRole('button', { name: 'Record', exact: true }).click();

  const risk = page.getByRole('dialog', { name: 'Fictional supplier audits' });
  await expect(risk.getByText('Recorded.')).toBeVisible();

  // Correct its initial facts with a reason.
  await risk.getByRole('button', { name: 'Correct intake facts' }).click();
  const correction = risk.getByRole('form', { name: 'Correct intake facts' });
  await correction
    .getByLabel(/^Planned measure/u)
    .fill('Add a quarterly supplier check');
  await correction
    .getByLabel('Correction reason')
    .fill('The review asked for a quarterly check');
  await correction.getByRole('button', { name: 'Record', exact: true }).click();
  await expect(
    risk
      .getByRole('region', { name: 'Current intake facts' })
      .getByText('Add a quarterly supplier check'),
  ).toBeVisible();
  await noHorizontalScroll(page);
  await screenshot(page, 'clarte-improvement-risk');

  // Add an observation to its log, then correct that statement.
  await risk.getByRole('button', { name: 'Add a log note' }).click();
  const note = risk.getByRole('form', { name: 'Add a log note' });
  await note
    .getByLabel('Note', { exact: true })
    .fill('First supplier check booked for February');
  await note.getByLabel('Occurrence date (optional)').fill('2026-11-26');
  await note.getByRole('button', { name: 'Record', exact: true }).click();
  const history = risk.getByRole('region', { name: 'Immutable history' });
  await expect(history.getByRole('listitem')).toHaveCount(3);
  await history
    .getByRole('listitem')
    .filter({ hasText: 'First supplier check booked for February' })
    .getByRole('button', { name: 'View current statement' })
    .click();
  const statement = risk.getByRole('region', {
    name: 'Current journal statement',
  });
  await statement
    .getByRole('button', { name: 'Correct journal statement' })
    .click();
  const fix = risk.getByRole('form', { name: 'Correct journal statement' });
  await fix
    .getByLabel('Note', { exact: true })
    .fill('First supplier check booked for March');
  await fix
    .getByLabel('Correction reason')
    .fill('The supplier confirmed March');
  await fix.getByRole('button', { name: 'Record', exact: true }).click();
  await expect(
    statement.getByText('First supplier check booked for March'),
  ).toBeVisible();
  await expect(
    statement.getByText('First supplier check booked for February'),
  ).toBeVisible();
  await expect(statement.getByText('Correction author')).toBeVisible();
  await noHorizontalScroll(page);
  await screenshot(page, 'clarte-improvement-statement');

  // The immutable history keeps every revision with its author and date.
  await expect(history.getByRole('listitem')).toHaveCount(4);
  await history
    .getByRole('heading', { name: 'Immutable history' })
    .scrollIntoViewIfNeeded();
  await screenshot(page, 'clarte-improvement-history');
  await risk.getByRole('button', { name: 'Close' }).click();
  await expect(risk).toHaveCount(0);

  const newRisk = recordedRiskId(1);
  expect([...api.unhandled]).toEqual([]);
  expect(api.writes).toEqual([
    'POST /api/ideas',
    `POST /api/ideas/${recordedIdeaId(1)}/dispositions`,
    `POST /api/ideas/${seededIdeas.checklist.id}/dispositions`,
    'POST /api/operational-risks',
    `POST /api/operational-risks/${newRisk}/intake-corrections`,
    `POST /api/operational-risks/${newRisk}/journal`,
    `POST /api/operational-risks/${newRisk}/journal/${recordedEntryId(3)}/corrections`,
  ]);
});
