#!/usr/bin/env bash

set -euo pipefail

export PATH="$HOME/.local/share/mise/shims:$PATH"
hash -r

pnpm install --frozen-lockfile
node scripts/agent-doctor.mjs --profile web
