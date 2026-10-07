export function required(environment, name) {
  const value = environment[name];
  if (!value?.trim()) throw new Error(`${name} is required.`);
  return value;
}

export function livePublishableKey(environment, name) {
  const value = required(environment, name);
  if (!/^pk_live_[A-Za-z0-9+/=]+$/u.test(value))
    throw new Error(`${name} must be a Clerk production publishable key.`);
  return value;
}

export function httpsUrl(environment, name) {
  const value = required(environment, name);
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} must be an HTTPS URL.`);
  }
  if (url.protocol !== 'https:' || url.username || url.password)
    throw new Error(`${name} must be an HTTPS URL without credentials.`);
  return url;
}

export function databaseUrl(environment) {
  const value = required(environment, 'DATABASE_URL');
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error('DATABASE_URL must be a PostgreSQL connection URL.');
  }
  if (!['postgres:', 'postgresql:'].includes(url.protocol))
    throw new Error('DATABASE_URL must be a PostgreSQL connection URL.');
}

export function apiEnvironment(environment) {
  livePublishableKey(environment, 'CLERK_PUBLISHABLE_KEY');
  if (!required(environment, 'CLERK_SECRET_KEY').startsWith('sk_live_'))
    throw new Error('CLERK_SECRET_KEY must be a Clerk production secret key.');
  const origin = httpsUrl(environment, 'WEB_ORIGIN');
  if (origin.origin !== environment.WEB_ORIGIN)
    throw new Error('WEB_ORIGIN must be an exact HTTPS origin.');
  databaseUrl(environment);
  if (
    environment.ACCESS_IDENTITY_MODE &&
    environment.ACCESS_IDENTITY_MODE !== 'clerk'
  )
    throw new Error('ACCESS_IDENTITY_MODE must be clerk in production.');
  if (
    environment.ACCESS_BOOTSTRAP_EXTERNAL_PROVIDER &&
    environment.ACCESS_BOOTSTRAP_EXTERNAL_PROVIDER !== 'clerk'
  )
    throw new Error(
      'ACCESS_BOOTSTRAP_EXTERNAL_PROVIDER must be clerk in production.',
    );
  const port = environment.PORT ?? '3000';
  if (!/^\d+$/u.test(port) || Number(port) < 1 || Number(port) > 65535)
    throw new Error('PORT must be an integer from 1 to 65535.');
  return { ...environment, NODE_ENV: 'production', API_PORT: port };
}
