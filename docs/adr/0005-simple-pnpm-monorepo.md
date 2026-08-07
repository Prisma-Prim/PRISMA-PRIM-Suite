# Use a simple pnpm monorepo

The web application and business API share one pnpm workspace without Nx or Turborepo. The current product size does not justify another orchestration layer; one may be added only after measured build or dependency-management friction appears.
