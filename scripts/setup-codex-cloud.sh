#!/usr/bin/env bash

set -euo pipefail

mise use --global node@24

mise_path_line='export PATH="$HOME/.local/share/mise/shims:$PATH"'
if ! grep -Fqx "$mise_path_line" "$HOME/.bashrc"; then
  printf '\n%s\n' "$mise_path_line" >> "$HOME/.bashrc"
fi

export PATH="$HOME/.local/share/mise/shims:$PATH"
hash -r

node --version
npm --version
npm install --global pnpm@11.20.0
pnpm --version

pnpm install --frozen-lockfile
pnpm --filter @prisma-prim/web exec playwright install --with-deps chromium
node scripts/agent-doctor.mjs --profile web
