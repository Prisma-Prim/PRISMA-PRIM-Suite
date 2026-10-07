import { database, defineRailway, github, project, service } from 'railway/iac';

export default defineRailway((context) => {
  // Keep the repository's PostgreSQL major. Railway's postgres() default is 18.
  const postgres = database('postgres', 'postgres', {
    image: 'ghcr.io/railwayapp-templates/postgres-ssl:17',
    output: 'DATABASE_URL',
    defaultMountPath: '/var/lib/postgresql/data',
  });
  const source = github('Prisma-Prim/PRISMA-PRIM-Suite', {
    branch: 'main',
    rootDirectory: '/',
    checkSuites: true,
  });
  const api = service('api', {
    source,
    build: {
      builder: 'DOCKERFILE',
      dockerfilePath: 'deploy/railway/api.Dockerfile',
    },
    preDeploy: 'node scripts/railway-api.mjs migrate',
    healthcheck: '/api/health',
    healthcheckTimeout: 120,
    replicas: 1,
    deploy: {
      preDeployTimeoutSeconds: 300,
      restartPolicyType: 'ON_FAILURE',
      restartPolicyMaxRetries: 3,
      sleepApplication: false,
    },
    env: {
      NODE_ENV: 'production',
      ACCESS_IDENTITY_MODE: 'clerk',
      DATABASE_URL: postgres.env.DATABASE_URL,
      WEB_ORIGIN: context.shared.WEB_ORIGIN,
      CLERK_PUBLISHABLE_KEY: context.shared.CLERK_PUBLISHABLE_KEY,
      CLERK_SECRET_KEY: context.shared.CLERK_SECRET_KEY,
    },
  });
  const web = service('web', {
    source,
    build: {
      builder: 'DOCKERFILE',
      dockerfilePath: 'deploy/railway/web.Dockerfile',
    },
    healthcheck: '/health',
    healthcheckTimeout: 120,
    replicas: 1,
    deploy: {
      restartPolicyType: 'ON_FAILURE',
      restartPolicyMaxRetries: 3,
      sleepApplication: false,
    },
    env: {
      NODE_ENV: 'production',
      VITE_API_URL: context.shared.VITE_API_URL,
      VITE_CLERK_PUBLISHABLE_KEY: context.shared.CLERK_PUBLISHABLE_KEY,
    },
  });
  return project('PRISMA-PRIM-Suite', { resources: [postgres, api, web] });
});
