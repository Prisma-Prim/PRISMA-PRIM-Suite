import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/database/schema/index.ts',
  out: './drizzle',
  dbCredentials: {
    url:
      process.env.DATABASE_URL ??
      'postgresql://prisma_prim:prisma_prim@localhost:5432/prisma_prim',
  },
  strict: true,
  verbose: true,
});
