import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  createMissionDocumentFixture,
  type MissionDocumentFixture,
} from '../documents/mission-document.test-support.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
const withPostgres = databaseUrl ? describe : describe.skip;

withPostgres('Working Evidence source admission authority', () => {
  let fixture: MissionDocumentFixture;
  let clientId: string;

  beforeAll(async () => {
    if (!databaseUrl) throw new Error('TEST_DATABASE_URL is required.');
    fixture = await createMissionDocumentFixture(databaseUrl);
  });
  beforeEach(async () => {
    ({ clientId } = await fixture.reset());
  });
  afterAll(async () => {
    await fixture?.close();
  });

  it('requires the independent source gate even for a native Registrar', async () => {
    const response = await fixture.call('/documents', {
      method: 'POST',
      body: {
        type: 'received-audit-source',
        clientId,
        title: 'Fictional working source',
        purpose: 'Preserve a fictional original; no certification claim',
      },
    });
    expect(response.status).toBe(403);
    const inventory = await fixture.call('/documents');
    expect(inventory.status).toBe(200);
    expect(await inventory.json()).toEqual([]);
  });
});
