#!/usr/bin/env bash
# teardown-pds.sh — Stop PDS and optionally wipe data
#
# Usage:
#   ./scripts/teardown-pds.sh          # Stop containers, keep data
#   ./scripts/teardown-pds.sh --wipe   # Stop containers and delete volume data

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
COMPOSE_FILE="$REPO_ROOT/docker-compose.yml"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

info()  { echo -e "${CYAN}[info]${NC}  $*"; }
ok()    { echo -e "${GREEN}[ok]${NC}    $*"; }
warn()  { echo -e "${YELLOW}[warn]${NC}  $*"; }

WIPE=false
if [[ "${1:-}" == "--wipe" ]]; then
  WIPE=true
fi

info "Stopping containers..."
docker compose -f "$COMPOSE_FILE" down 2>&1

if [[ "$WIPE" == true ]]; then
  warn "Removing PDS data volume..."
  docker volume rm "$(basename "$REPO_ROOT" | tr '[:upper:]' '[:lower:]' | tr ' ' '-')_pds-data" 2>/dev/null || true
  docker volume rm "federated-realms_pds-data" 2>/dev/null || true

  if [[ -f "$REPO_ROOT/.env" ]]; then
    warn "Clearing SERVER_DID from .env (you'll need to re-bootstrap)"
    sed -i.bak 's/^SERVER_DID=.*/SERVER_DID=/' "$REPO_ROOT/.env" && rm -f "$REPO_ROOT/.env.bak"
  fi

  ok "PDS data wiped. Run ./scripts/bootstrap-pds.sh to start fresh."
else
  ok "Containers stopped. PDS data preserved in Docker volume."
  info "Use --wipe to delete PDS data and start fresh."
fi
