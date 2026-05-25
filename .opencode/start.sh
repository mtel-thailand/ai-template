#!/usr/bin/env bash
set -e
DIR="$(cd "$(dirname "$0")/.." && pwd)"

# Load .env before starting opencode
if [ -f "$DIR/.env" ]; then
  set -a
  . "$DIR/.env"
  set +a
fi

# Require a single GitHub PAT (used by all gh_* MCP servers)
: "${GITHUB_PAT:?GITHUB_PAT is required}"

exec opencode "$@"
