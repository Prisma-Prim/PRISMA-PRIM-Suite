import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const apiLauncher = new URL('./railway-api.mjs', import.meta.url);
const webValidator = new URL('./railway-web-config.mjs', import.meta.url);

test('API refuses missing production identity before starting', () => {
  const result = spawnSync(process.execPath, [apiLauncher.pathname, 'start'], {
    env: {
      PATH: process.env.PATH,
      DATABASE_URL: 'postgresql://example.test/db',
    },
    encoding: 'utf8',
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /CLERK_PUBLISHABLE_KEY/);
  assert.doesNotMatch(result.stderr, /ERR_MODULE_NOT_FOUND/);
});

test('migration refuses missing database configuration without local fallback', () => {
  const result = spawnSync(
    process.execPath,
    [apiLauncher.pathname, 'migrate'],
    {
      env: { PATH: process.env.PATH },
      encoding: 'utf8',
    },
  );
  assert.equal(result.status, 1);
  assert.match(result.stderr, /DATABASE_URL/);
});

test('web production build rejects missing public identity settings', () => {
  const result = spawnSync(process.execPath, [webValidator.pathname], {
    env: {
      PATH: process.env.PATH,
      VITE_API_URL: 'https://api.example.test/api',
    },
    encoding: 'utf8',
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /VITE_CLERK_PUBLISHABLE_KEY/);
});

const productionFixture = {
  PATH: process.env.PATH,
  CLERK_PUBLISHABLE_KEY: 'pk_live_Y2xlcmsuZXhhbXBsZS50ZXN0JA==',
  CLERK_SECRET_KEY: 'sk_live_sensitive_fixture',
  WEB_ORIGIN: 'https://web.example.test',
  DATABASE_URL: 'postgresql://fixture:sensitive@127.0.0.1/fixture',
};

for (const [name, value] of [
  ['ACCESS_IDENTITY_MODE', 'local-demo'],
  ['ACCESS_IDENTITY_MODE', 'test'],
  ['ACCESS_BOOTSTRAP_EXTERNAL_PROVIDER', 'local-demo'],
  ['WEB_ORIGIN', 'https://web.example.test/'],
  ['PORT', '65536'],
]) {
  test(`API rejects invalid ${name} without printing configuration values`, () => {
    const result = spawnSync(
      process.execPath,
      [apiLauncher.pathname, 'start'],
      {
        env: { ...productionFixture, [name]: value },
        encoding: 'utf8',
      },
    );
    assert.equal(result.status, 1);
    assert.match(result.stderr, new RegExp(name));
    assert.doesNotMatch(
      result.stderr,
      /sensitive|https:\/\/web|ERR_MODULE_NOT_FOUND/,
    );
  });
}

test('web accepts public production settings and rejects a development key', () => {
  const environment = {
    PATH: process.env.PATH,
    VITE_API_URL: 'https://api.example.test/api',
    VITE_CLERK_PUBLISHABLE_KEY: productionFixture.CLERK_PUBLISHABLE_KEY,
  };
  const invoke = (env) =>
    spawnSync(process.execPath, [webValidator.pathname], {
      env,
      encoding: 'utf8',
    });
  assert.equal(invoke(environment).status, 0);
  const rejected = invoke({
    ...environment,
    VITE_CLERK_PUBLISHABLE_KEY: 'pk_test_fixture',
  });
  assert.equal(rejected.status, 1);
  assert.match(rejected.stderr, /production publishable key/);
});
