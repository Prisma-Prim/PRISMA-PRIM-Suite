import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { DEMONSTRATION_SCENARIO } from './demonstration-scenario.js';

const PRODUCT_DOCS = '../../docs/product';
const REGISTER = `${PRODUCT_DOCS}/first-tenant-substitution-register.csv`;
const COVERAGE = `${PRODUCT_DOCS}/iurie-business-answer-coverage.md`;
const COLUMNS = [
  'id',
  'area',
  'item',
  'mvp_stand_in',
  'owner_link',
  'where_visible',
  'seed_key',
  'real_input_needed',
  'request_ro',
  'format',
  'evidence_refs',
  'substitution_path',
  'blocks_real_use',
  'decision',
  'decision_ref',
];
const REGISTER_IDS = [
  'SUB-CO-01',
  'SUB-CO-02',
  'SUB-RO-01',
  'SUB-RO-02',
  'SUB-RO-03',
  'SUB-PR-01',
  'SUB-PR-02',
  'SUB-PR-03',
  'SUB-PR-04',
  'SUB-PR-05',
  'SUB-PR-06',
  'SUB-PR-07',
  'SUB-OF-01',
  'SUB-OF-02',
  'SUB-OF-03',
  'SUB-OF-04',
  'SUB-OF-05',
  'SUB-OF-06',
  'SUB-OF-07',
  'SUB-CT-01',
  'SUB-CT-02',
  'SUB-CT-03',
  'SUB-CT-04',
  'SUB-CT-05',
  'SUB-CT-06',
  'SUB-CT-07',
  'SUB-CL-01',
  'SUB-CL-02',
  'SUB-OP-01',
  'SUB-OP-02',
  'SUB-PJ-01',
  'SUB-PJ-02',
  'SUB-TA-01',
  'SUB-DO-01',
  'SUB-DO-02',
  'SUB-HO-01',
  'SUB-HO-02',
  'SUB-UX-01',
  'SUB-EN-01',
];
// AC-UNIVERSAL-03 (Sarcina row M01-AC13, candidate): « acceptat, acceptat
// cu corectări, respins sau amânat », plus the empty undecided state.
const DECISIONS = new Set([
  '',
  'ACCEPTED',
  'ACCEPTED_WITH_CORRECTIONS',
  'REJECTED',
  'POSTPONED',
]);
const ISSUE_LINK =
  /^https:\/\/github\.com\/Prisma-Prim\/PRISMA-PRIM-Suite\/issues\/\d+$/u;
const QUESTION_ID = /S\d{2}-Q\d{2}/gu;

/** RFC 4180 fields: quoted fields may hold commas, quotes and line breaks. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') quoted = false;
      else field += character;
    } else if (character === '"' && field === '') quoted = true;
    else if (character === ',') {
      row.push(field);
      field = '';
    } else if (character === '\n' || character === '\r') {
      if (character === '\r' && text[index + 1] === '\n') index += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += character;
  }
  if (quoted) throw new Error('The register has an unterminated field.');
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

async function registerRows(): Promise<Record<string, string>[]> {
  const [header, ...rows] = parseCsv(await readFile(REGISTER, 'utf8'));
  expect(header).toEqual(COLUMNS);
  return rows.map((cells) => {
    expect(cells).toHaveLength(COLUMNS.length);
    return Object.fromEntries(
      COLUMNS.map((column, index) => [column, cells[index] ?? '']),
    );
  });
}

async function coverageStates(): Promise<Map<string, string>> {
  const states = new Map<string, string>();
  for (const line of (await readFile(COVERAGE, 'utf8')).split(/\r?\n/u)) {
    const cells = line.split('|').map((cell) => cell.trim());
    const id = cells[1];
    const state = cells[6];
    if (id && /^S\d{2}-Q\d{2}$/u.test(id) && state && !states.has(id))
      states.set(id, state);
  }
  return states;
}

function column(row: Record<string, string>, name: string): string {
  const value = row[name];
  if (value === undefined) throw new Error(`Missing register column ${name}.`);
  return value;
}

describe('first-tenant substitution register', () => {
  it('commits the 39 rows with the agreed columns and decision vocabulary', async () => {
    const rows = await registerRows();
    expect(rows.map((row) => column(row, 'id'))).toEqual(REGISTER_IDS);
    for (const row of rows) {
      for (const required of [
        'area',
        'item',
        'mvp_stand_in',
        'owner_link',
        'where_visible',
        'real_input_needed',
        'format',
        'evidence_refs',
        'substitution_path',
        'blocks_real_use',
      ])
        expect(column(row, required).trim(), `${row.id} ${required}`).not.toBe(
          '',
        );
      expect(DECISIONS.has(column(row, 'decision'))).toBe(true);
      expect(column(row, 'decision_ref') === '').toBe(
        column(row, 'decision') === '',
      );
      expect(column(row, 'blocks_real_use')).toMatch(/^(?:Yes|No): /u);
    }
  });

  it('links each row to its owning PRD section, or to the issue while that section is unmerged', async () => {
    for (const row of await registerRows()) {
      for (const link of column(row, 'owner_link')
        .split(';')
        .map((value) => value.trim())) {
        if (ISSUE_LINK.test(link)) continue;
        const [path = '', anchor] = link.split('#');
        expect(path, `${row.id} owner link`).toMatch(/^[a-z0-9-]+\.md$/u);
        expect(anchor, `${row.id} owner section`).toBeTruthy();
        expect(existsSync(`${PRODUCT_DOCS}/${path}`), link).toBe(true);
      }
    }
  });

  it('keeps coverage states as they are and condenses only the linked question-bank items', async () => {
    const states = await coverageStates();
    for (const row of await registerRows()) {
      const evidence = column(row, 'evidence_refs');
      const cited = [...evidence.matchAll(/(S\d{2}-Q\d{2}) \(([^)]+)\)/gu)];
      expect([...evidence.matchAll(QUESTION_ID)]).toHaveLength(cited.length);
      for (const [, id = '', state] of cited)
        expect(state, `${row.id} ${id}`).toBe(states.get(id));
      const requested = [...column(row, 'request_ro').matchAll(QUESTION_ID)]
        .map(([id]) => id)
        .sort();
      expect(requested, `${row.id} request_ro`).toEqual(
        cited.map(([, id]) => id).sort(),
      );
    }
  });

  it('links every scenario stand-in step to its register row and back', async () => {
    const rows = await registerRows();
    const ids = new Set(rows.map((row) => column(row, 'id')));
    const steps = new Map(
      DEMONSTRATION_SCENARIO.steps.map((step) => [step.key, step]),
    );
    const standIns = DEMONSTRATION_SCENARIO.steps.filter(
      (step) =>
        step.kind === 'company.register' ||
        step.kind === 'persona.provision' ||
        step.kind === 'grant' ||
        step.kind === 'catalogue.definition' ||
        step.kind === 'catalogue.offering' ||
        step.kind === 'pricing.rule',
    );
    for (const step of standIns)
      expect(step.register, `${step.key} register`).toBeDefined();
    const seeded = new Map<string, string>();
    for (const row of rows) {
      const keys = column(row, 'seed_key');
      if (!keys) continue;
      for (const key of keys.split(';')) {
        expect(steps.has(key), `${row.id} seed key ${key}`).toBe(true);
        expect(steps.get(key)?.register).toBe(row.id);
        seeded.set(key, column(row, 'id'));
      }
    }
    for (const step of DEMONSTRATION_SCENARIO.steps) {
      if (!step.register) continue;
      expect(ids.has(step.register), step.key).toBe(true);
      expect(seeded.get(step.key), step.key).toBe(step.register);
    }
  });
});
