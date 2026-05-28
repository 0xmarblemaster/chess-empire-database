#!/usr/bin/env bash
# Deploy the tournaments-api edge function to Supabase.
# Idempotent — re-running just redeploys the latest source.
#
# Requires:
#   - supabase CLI authenticated on this VPS (`supabase login`)
#   - project linked (`supabase link --project-ref papgcizhfkngubwofjuo`)
#   - CHESS_EMPIRE_API_KEY set in the function's secrets:
#       supabase secrets set CHESS_EMPIRE_API_KEY='ce-api-2026-k8x9m2p4q7w1'

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

cd "${REPO_ROOT}"

echo "→ Deploying tournaments-api edge function from ${REPO_ROOT}"
# --no-verify-jwt: bots authenticate with x-api-key only; no Supabase JWT needed.
# Setting is also persisted in supabase/config.toml.
supabase functions deploy tournaments-api --no-verify-jwt
echo "✓ tournaments-api deployed"
