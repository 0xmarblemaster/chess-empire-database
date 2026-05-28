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
supabase functions deploy tournaments-api
echo "✓ tournaments-api deployed"
