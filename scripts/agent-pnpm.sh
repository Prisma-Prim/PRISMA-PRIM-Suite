#!/usr/bin/env bash
set -euo pipefail

repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${repository_root}"

if ! command -v pnpm >/dev/null 2>&1; then
  echo "pnpm is unavailable on PATH; install a pnpm launcher before using the repository wrapper." >&2
  exit 1
fi

expected_pnpm="$(node --input-type=module --eval "import packageJson from './package.json' with { type: 'json' }; process.stdout.write(packageJson.packageManager.split('@').at(-1));")"
launcher_pnpm="$(pnpm --version)"

if [[ "${launcher_pnpm}" == "${expected_pnpm}" ]]; then
  exec pnpm "$@"
fi

pnpm_home="${PRISMA_PRIM_PNPM_HOME:-${repository_root}/.pnpm-home}"
mkdir -p -m 700 "${pnpm_home}"
if ! PRISMA_PRIM_PNPM_HOME_CHECK="${pnpm_home}" node --input-type=module --eval '
  import { lstatSync } from "node:fs";
  const entry = lstatSync(process.env.PRISMA_PRIM_PNPM_HOME_CHECK);
  const privateDirectory =
    entry.isDirectory() && !entry.isSymbolicLink() && (entry.mode & 0o7777) === 0o700;
  process.exit(privateDirectory ? 0 : 1);
'; then
  echo "Repository pnpm home must be a non-symlink directory with mode 700: ${pnpm_home}" >&2
  exit 1
fi

effective_pnpm="$(
  PNPM_HOME="${pnpm_home}" pnpm --pm-on-fail=download exec node \
    --input-type=module \
    --eval 'process.stdout.write((process.env.npm_config_user_agent ?? "").split(" ").find((part) => part.startsWith("pnpm/"))?.slice(5) ?? "")'
)"

if [[ "${effective_pnpm}" != "${expected_pnpm}" ]]; then
  echo "Repository wrapper activated pnpm ${effective_pnpm:-unknown}; expected ${expected_pnpm}." >&2
  exit 1
fi

export PNPM_HOME="${pnpm_home}"
exec pnpm --pm-on-fail=download "$@"
