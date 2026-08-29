import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const canonicalPath = 'docs/agents/typescript-discipline.md';

test('TypeScript implementation and review share one mandatory repository contract', async () => {
  const [agents, execution, discipline] = await Promise.all([
    readFile(new URL('../AGENTS.md', import.meta.url), 'utf8'),
    readFile(
      new URL('../docs/agents/issue-execution.md', import.meta.url),
      'utf8',
    ),
    readFile(
      new URL('../docs/agents/typescript-discipline.md', import.meta.url),
      'utf8',
    ),
  ]);
  const normalizedDiscipline = discipline.replaceAll(/\s+/g, ' ');

  assert.match(discipline, /^\*\*Status:\*\* Approved repository contract$/m);
  assert.match(agents, new RegExp(canonicalPath.replaceAll('/', '\\/')));
  assert.match(agents, /before (reading or editing|editing).*\.ts.*\.tsx/is);
  assert.match(agents, /mandatory.*default/is);

  assert.equal(execution.match(/\(typescript-discipline\.md\)/g)?.length, 1);
  assert.match(execution, /implementation.*TypeScript discipline/is);
  assert.match(
    execution,
    /Standards review.*material violations.*TypeScript discipline/is,
  );

  assert.match(normalizedDiscipline, /discriminated unions/i);
  assert.match(normalizedDiscipline, /illegal states.*unrepresentable/i);
  assert.match(normalizedDiscipline, /simplest total type/i);
  assert.match(normalizedDiscipline, /external boundar.*`unknown`/i);
  assert.match(normalizedDiscipline, /validate exactly once/i);
  assert.match(normalizedDiscipline, /do not use `any`/i);
  assert.match(normalizedDiscipline, /do not use.*type assertions.*`as`/i);
  assert.match(normalizedDiscipline, /complete runtime claim/i);
  assert.match(normalizedDiscipline, /exhaustive.*`never`/i);
  assert.match(normalizedDiscipline, /`satisfies`/i);
  assert.match(normalizedDiscipline, /schema-derived types/i);
  assert.match(
    normalizedDiscipline,
    /object arguments.*ordering is ambiguous/i,
  );
  assert.match(normalizedDiscipline, /test.*public seam/i);
  assert.match(normalizedDiscipline, /mock only.*system boundaries/i);

  for (const pointer of [agents, execution]) {
    assert.doesNotMatch(pointer, /discriminated unions.*illegal states/is);
    assert.doesNotMatch(pointer, /`unknown`.*validate exactly once/is);
  }
});
