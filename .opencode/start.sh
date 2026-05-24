#!/usr/bin/env bash
set -e
DIR="$(cd "$(dirname "$0")/.." && pwd)"

# Load .env before starting opencode
if [ -f "$DIR/.env" ]; then
  set -a
  . "$DIR/.env"
  set +a
fi

# Export required PAT vars (fail early if any are missing)
: "${GH_PAT_PM:?GH_PAT_PM is required}"
: "${GH_PAT_DESIGN:?GH_PAT_DESIGN is required}"
: "${GH_PAT_TL:?GH_PAT_TL is required}"
: "${GH_PAT_DEV:?GH_PAT_DEV is required}"
: "${GH_PAT_REVIEW:?GH_PAT_REVIEW is required}"
: "${GH_PAT_QA:?GH_PAT_QA is required}"
: "${GH_PAT_SEC:?GH_PAT_SEC is required}"
: "${GH_PAT_SRE:?GH_PAT_SRE is required}"
: "${GH_PAT_DEVOPS:?GH_PAT_DEVOPS is required}"
: "${GH_PAT_AI:?GH_PAT_AI is required}"

exec opencode "$@"
