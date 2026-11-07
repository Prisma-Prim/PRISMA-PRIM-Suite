#!/usr/bin/env bash
set -euo pipefail
# Install script of the published `PRISMA-PRIM-Suite` current Codex Cloud
# environment (#1164). The Codex settings run this file; it works without root
# and leaves no service running. See docs/agents/environment.md#current-environment.
# Private writable caches shared by existing checkouts; keep credential bindings inherited.
for prisma_cache_path in /workspace/prisma-cloud-tools /workspace/prisma-cloud-tools/cache /workspace/prisma-cloud-tools/cache/pnpm-home /workspace/prisma-cloud-tools/cache/npm /workspace/prisma-cloud-tools/cache/pnpm-store /workspace/prisma-cloud-tools/cache/pnpm-meta /workspace/prisma-cloud-tools/cache/corepack /workspace/prisma-cloud-tools/cache/xdg; do
  mkdir -p -m 700 "$prisma_cache_path"
  if [[ -L "$prisma_cache_path" ]] || [[ "$(stat -c '%a' "$prisma_cache_path")" != 700 ]] || [[ "$(stat -c '%u' "$prisma_cache_path")" != "$(id -u)" ]]; then
    echo "Cloud cache must be a task-owned private directory: $prisma_cache_path" >&2
    exit 1
  fi
done
prisma_activation_tmp="$(mktemp /tmp/prisma-cloud-activation.XXXXXX)"
cat > "$prisma_activation_tmp" <<'PRISMA_ACTIVATION_EOF'
# Source this file in each command shell; it does not change repository files.
export PATH="/workspace/prisma-cloud-tools/github-cli/2.102.0/bin:/workspace/prisma-cloud-tools/node_modules/.bin:$PATH"
export PLAYWRIGHT_BROWSERS_PATH=/workspace/prisma-cloud-tools/browsers
export PRISMA_PRIM_PNPM_HOME=/workspace/prisma-cloud-tools/cache/pnpm-home
export PNPM_HOME="$PRISMA_PRIM_PNPM_HOME"
export npm_config_cache=/workspace/prisma-cloud-tools/cache/npm
export pnpm_config_store_dir=/workspace/prisma-cloud-tools/cache/pnpm-store
export pnpm_config_cache_dir=/workspace/prisma-cloud-tools/cache/pnpm-meta
export COREPACK_HOME=/workspace/prisma-cloud-tools/cache/corepack
export XDG_CACHE_HOME=/workspace/prisma-cloud-tools/cache/xdg
unset DOCKER_CONTEXT DOCKER_TLS DOCKER_TLS_VERIFY DOCKER_CERT_PATH
export DOCKER_HOST=unix:///var/run/docker.sock
PRISMA_ACTIVATION_EOF
if [[ -e /workspace/prisma-cloud-tools/activate-prisma-cloud.sh ]] && ! cmp -s "$prisma_activation_tmp" /workspace/prisma-cloud-tools/activate-prisma-cloud.sh; then
  rm -f "$prisma_activation_tmp"
  echo 'Refusing to overwrite different existing cloud activation instructions.' >&2
  exit 1
fi
cp "$prisma_activation_tmp" /workspace/prisma-cloud-tools/activate-prisma-cloud.sh
rm -f "$prisma_activation_tmp"
source /workspace/prisma-cloud-tools/activate-prisma-cloud.sh

# GitHub CLI pinned for #609; preserve injected authentication, proxy and CA trust.
[[ "$(uname -m)" == x86_64 ]] || { echo 'Pinned GitHub CLI requires Linux x86_64.' >&2; exit 1; }
prisma_gh_root=/workspace/prisma-cloud-tools/github-cli
prisma_gh_destination="$prisma_gh_root/2.102.0"
mkdir -p "$prisma_gh_root"
prisma_gh_tmp="$(mktemp -d "$prisma_gh_root/.install-2.102.0.XXXXXX")"
trap 'rm -rf "$prisma_gh_tmp"' EXIT
curl --fail --silent --show-error --location --retry 2 --connect-timeout 20 --max-time 180 \
  https://github.com/cli/cli/releases/download/v2.102.0/gh_2.102.0_checksums.txt \
  --output "$prisma_gh_tmp/gh_2.102.0_checksums.txt"
curl --fail --silent --show-error --location --retry 2 --connect-timeout 20 --max-time 180 \
  https://github.com/cli/cli/releases/download/v2.102.0/gh_2.102.0_linux_amd64.tar.gz \
  --output "$prisma_gh_tmp/gh_2.102.0_linux_amd64.tar.gz"
(
  cd "$prisma_gh_tmp"
  echo 'afe49e9affa232faa8212aed035417166f6ade9b9470acb53d4dbd28c0504e8d  gh_2.102.0_checksums.txt' | sha256sum --check -
  echo 'bb766f710eef8ede859c18578c72c327597cd4c8a85b06001b1f3843c6019386  gh_2.102.0_linux_amd64.tar.gz' | sha256sum --check -
  awk '$2 == "gh_2.102.0_linux_amd64.tar.gz" { print; found = 1 } END { if (!found) exit 1 }' gh_2.102.0_checksums.txt | sha256sum --check -
)
tar --extract --gzip --file "$prisma_gh_tmp/gh_2.102.0_linux_amd64.tar.gz" --directory "$prisma_gh_tmp"
if [[ -e "$prisma_gh_destination" ]]; then
  cmp "$prisma_gh_tmp/gh_2.102.0_linux_amd64/bin/gh" "$prisma_gh_destination/bin/gh"
else
  mv "$prisma_gh_tmp/gh_2.102.0_linux_amd64" "$prisma_gh_destination"
fi
rm -rf "$prisma_gh_tmp"
trap - EXIT
export PATH="/workspace/prisma-cloud-tools/github-cli/2.102.0/bin:$PATH"
gh --version

cd /workspace/PRISMA-PRIM-Suite
node -e 'if(Number(process.versions.node.split(".")[0])!==24)throw new Error("Node 24 is required")'
if [[ ! -x /workspace/prisma-cloud-tools/node_modules/.bin/pnpm ]] || [[ "$(/workspace/prisma-cloud-tools/node_modules/.bin/pnpm --version)" != 11.20.0 ]]; then
  npm install --cache /workspace/prisma-cloud-tools/cache/npm --prefix /workspace/prisma-cloud-tools --no-audit --no-fund pnpm@11.20.0
fi
export PATH="/workspace/prisma-cloud-tools/node_modules/.bin:$PATH"
# The managed PostgreSQL migration uses Corepack with a fresh XDG cache.
# Prewarm its explicit private cache without changing global shims or activation.
corepack prepare pnpm@11.20.0
COREPACK_ENABLE_NETWORK=0 corepack pnpm --version
CI=true bash scripts/agent-pnpm.sh install --frozen-lockfile --prefer-offline
# Use only the managed local Docker daemon; preserve proxy and registry credentials.
unset DOCKER_CONTEXT DOCKER_TLS DOCKER_TLS_VERIFY DOCKER_CERT_PATH
export DOCKER_HOST=unix:///var/run/docker.sock
docker info --format '{{.ServerVersion}}'
docker pull postgres@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24
docker tag postgres@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24 postgres:17-alpine
export PLAYWRIGHT_BROWSERS_PATH=/workspace/prisma-cloud-tools/browsers
pnpm --filter @prisma-prim/web exec playwright install chromium
node scripts/agent-doctor.mjs --profile web
pnpm --filter @prisma-prim/web exec node --input-type=module -e 'import {chromium} from "@playwright/test"; const browser=await chromium.launch(); console.log("Default Playwright Chromium:",browser.version()); await browser.close();'
# No services are left running. Start databases only via the managed runner.
prisma_config_tmp="$(mktemp /tmp/prisma-aligned-config.XXXXXX)"
cat > "$prisma_config_tmp" <<'PRISMA_CONFIG_EOF'
import base from '/workspace/PRISMA-PRIM-Suite/apps/web/playwright.config.ts';
const root = '/workspace/PRISMA-PRIM-Suite/apps/web';
export default {
  ...base,
  testDir: `${root}/e2e`,
  outputDir: `${root}/test-results/aligned-browser`,
  workers: 2,
  reporter: 'list',
  webServer: { ...base.webServer, cwd: root, timeout: 180000 },
};
PRISMA_CONFIG_EOF
if [[ -e /workspace/prisma-cloud-tools/playwright-aligned.config.mjs ]] && ! cmp -s "$prisma_config_tmp" /workspace/prisma-cloud-tools/playwright-aligned.config.mjs; then
  rm -f "$prisma_config_tmp"
  echo 'Refusing to overwrite a different existing aligned Playwright configuration.' >&2
  exit 1
fi
cp "$prisma_config_tmp" /workspace/prisma-cloud-tools/playwright-aligned.config.mjs
rm -f "$prisma_config_tmp"
prisma_config_tmp="$(mktemp /tmp/prisma-aligned-config.XXXXXX)"
cat > "$prisma_config_tmp" <<'PRISMA_CONFIG_EOF'
import base from '/workspace/PRISMA-PRIM-Suite/apps/web/playwright.acceptance.config.ts';
const root = '/workspace/PRISMA-PRIM-Suite/apps/web';
export default {
  ...base,
  testDir: `${root}/e2e`,
  outputDir: `${root}/test-results/aligned-acceptance`,
  globalSetup: `${root}/e2e/operational-foundation.global-setup.mjs`,
  reporter: 'list',
  webServer: { ...base.webServer, cwd: root, timeout: 180000 },
};
PRISMA_CONFIG_EOF
if [[ -e /workspace/prisma-cloud-tools/playwright-aligned-acceptance.config.mjs ]] && ! cmp -s "$prisma_config_tmp" /workspace/prisma-cloud-tools/playwright-aligned-acceptance.config.mjs; then
  rm -f "$prisma_config_tmp"
  echo 'Refusing to overwrite a different existing aligned Playwright configuration.' >&2
  exit 1
fi
cp "$prisma_config_tmp" /workspace/prisma-cloud-tools/playwright-aligned-acceptance.config.mjs
rm -f "$prisma_config_tmp"
