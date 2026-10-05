#!/usr/bin/env bash
# OpenWA - Local development (no Docker)
# Runs the API (nest --watch, :2785) and the dashboard (Vite, :2886) directly on the host.
#
# Usage: ./scripts/dev.sh            # start API + dashboard
#        ./scripts/dev.sh --install  # force reinstall dependencies first

set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
log_info() { echo -e "${BLUE}ℹ${NC} $1"; }
log_warn() { echo -e "${YELLOW}⚠${NC} $1"; }
log_success() { echo -e "${GREEN}✓${NC} $1"; }

API_PORT=2785
DASHBOARD_PORT=2886

# Dependencies (root postinstall also installs dashboard deps)
if [ "${1:-}" = "--install" ] || [ ! -d node_modules ] || [ ! -d dashboard/node_modules ]; then
    log_info "Installing dependencies..."
    npm install
fi

# Free the ports if the Docker stack is running
if command -v docker >/dev/null 2>&1 && docker ps --format '{{.Names}}' 2>/dev/null | grep -q '^openwa-'; then
    log_warn "OpenWA Docker containers are running, stopping them to free ports $API_PORT/$DASHBOARD_PORT..."
    docker compose --profile full stop
fi

for port in $API_PORT $DASHBOARD_PORT; do
    if lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1; then
        log_warn "Port $port is already in use:"
        lsof -nP -iTCP:"$port" -sTCP:LISTEN
        exit 1
    fi
done

[ -f .env ] || { cp .env.example .env; log_info "Created .env from .env.example"; }
mkdir -p data/sessions data/media data/plugins

# Process env takes precedence over .env (ConfigModule does not override existing vars)
export NODE_ENV=development
export PORT=$API_PORT
db_type=$(sed -n 's/^DATABASE_TYPE=\([a-z]*\).*/\1/p' .env | tail -1)
if [ "${DATABASE_TYPE:-${db_type:-sqlite}}" = "sqlite" ]; then
    export DATABASE_NAME=./data/openwa.sqlite
fi
export SESSION_DATA_PATH=./data/sessions
export STORAGE_LOCAL_PATH=./data/media
export PLUGINS_DIR=./data/plugins

log_success "API:       http://localhost:$API_PORT  (docs: /api/docs)"
log_success "Dashboard: http://localhost:$DASHBOARD_PORT"
log_info "API key: dev-admin-key (on a fresh ./data). Ctrl+C to stop."
echo ""

exec npm run dev
