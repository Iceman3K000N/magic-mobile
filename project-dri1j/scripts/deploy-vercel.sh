#!/usr/bin/env bash
# Deploy project-dri1j to Vercel production.
#
# Option A — already linked (`.vercel/project.json` exists locally, not committed):
#   export VERCEL_TOKEN="..."   # https://vercel.com/account/tokens
#   npm run deploy
#
# Option B — link by IDs (writes .vercel/project.json; folder is gitignored):
#   export VERCEL_TOKEN="..."
#   export VERCEL_ORG_ID="team_..."      # Team → Settings → General
#   export VERCEL_PROJECT_ID="prj_..."   # Project → Settings → General
#   npm run deploy
#
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ -z "${VERCEL_TOKEN:-}" ]]; then
  echo "Error: VERCEL_TOKEN is not set."
  echo "Create a token: https://vercel.com/account/tokens"
  echo "Then: export VERCEL_TOKEN=... && npm run deploy"
  exit 1
fi

if [[ -n "${VERCEL_ORG_ID:-}" && -n "${VERCEL_PROJECT_ID:-}" ]]; then
  mkdir -p .vercel
  printf '{"orgId":"%s","projectId":"%s"}\n' "$VERCEL_ORG_ID" "$VERCEL_PROJECT_ID" > .vercel/project.json
  echo "Wrote .vercel/project.json (local only, gitignored)."
fi

exec vercel deploy --prod --yes --token "$VERCEL_TOKEN"
