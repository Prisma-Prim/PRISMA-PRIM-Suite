import assert from 'node:assert/strict';
import test from 'node:test';
import { createRailwayContext, project } from 'railway/iac';
import definition from './railway.ts';

test('SDK renders root builds, CI gating, private database reference and migration', async () => {
  const graph = await definition(
    createRailwayContext({ environment: 'production', command: 'test' }),
    project,
  );
  const resources = graph.resources;
  assert.ok(resources);
  assert.deepEqual(resources.map((resource) => resource.name).sort(), [
    'api',
    'postgres',
    'web',
  ]);
  const api = resources.find((resource) => resource.name === 'api');
  const web = resources.find((resource) => resource.name === 'web');
  assert.ok(api && web);
  for (const service of [api, web]) {
    assert.equal(service.source.rootDirectory, '/');
    assert.equal(service.source.checkSuites, true);
    assert.equal(service.deploy.restartPolicyType, 'ON_FAILURE');
    assert.equal(service.deploy.restartPolicyMaxRetries, 3);
  }
  assert.deepEqual(api.deploy.preDeployCommand, [
    'node scripts/railway-api.mjs migrate',
  ]);
  assert.equal(api.deploy.healthcheckPath, '/api/health');
  assert.equal(web.deploy.healthcheckPath, '/health');
  assert.deepEqual(api.variables.DATABASE_URL, {
    type: 'reference',
    resource: 'database.postgres',
    output: 'DATABASE_URL',
  });
  assert.deepEqual(api.variables.CLERK_SECRET_KEY, {
    type: 'sharedReference',
    name: 'CLERK_SECRET_KEY',
  });
  assert.equal(web.variables.CLERK_SECRET_KEY, undefined);
});
