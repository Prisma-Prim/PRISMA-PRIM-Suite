export interface IdentityConfiguration {
  secretKey: string;
  publishableKey: string;
  webOrigin: string;
}

const LOCAL_WEB_ORIGIN = 'http://localhost:5173';

function exactOrigin(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.origin === value && ['http:', 'https:'].includes(url.protocol)
      ? value
      : null;
  } catch {
    return null;
  }
}

export function identityConfiguration(
  environment: NodeJS.ProcessEnv = process.env,
): IdentityConfiguration {
  const secretKey = environment.CLERK_SECRET_KEY;
  const publishableKey = environment.CLERK_PUBLISHABLE_KEY;
  const webOrigin = exactOrigin(environment.WEB_ORIGIN);

  if (
    !secretKey ||
    !publishableKey ||
    (environment.NODE_ENV === 'production' && !webOrigin)
  ) {
    throw new Error('Clerk production identity configuration is incomplete.');
  }

  return {
    secretKey,
    publishableKey,
    webOrigin: webOrigin ?? LOCAL_WEB_ORIGIN,
  };
}
