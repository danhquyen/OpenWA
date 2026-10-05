#!/usr/bin/env bash
# OpenWA - Build & deploy with Docker (server)
# Builds the images, (re)starts the stack with the profiles enabled in .env and waits for the API to be healthy.
#
# Usage: ./deploy.sh              # build + up
#        ./deploy.sh --pull       # git pull --ff-only first
#        ./deploy.sh --no-cache   # rebuild images from scratch

set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
log_info() { echo -e "${BLUE}ℹ${NC} $1"; }
log_warn() { echo -e "${YELLOW}⚠${NC} $1"; }
log_error() { echo -e "${RED}✗${NC} $1"; }
log_success() { echo -e "${GREEN}✓${NC} $1"; }

GIT_PULL=false
BUILD_ARGS=()
for arg in "$@"; do
    case "$arg" in
        --pull) GIT_PULL=true ;;
        --no-cache) BUILD_ARGS+=(--no-cache) ;;
        -h|--help) sed -n '2,8p' "$0"; exit 0 ;;
        *) log_error "Unknown option: $arg"; exit 1 ;;
    esac
done

command -v docker >/dev/null 2>&1 || { log_error "Docker is not installed"; exit 1; }
docker compose version >/dev/null 2>&1 || { log_error "Docker Compose v2 is required"; exit 1; }

if [ "$GIT_PULL" = true ]; then
    log_info "Pulling latest code..."
    git pull --ff-only
fi

[ -f .env ] || { cp .env.example .env; log_warn "Created .env from .env.example, review it before going live"; }
set -a
# shellcheck disable=SC1091
source .env
set +a

# Values that must be correct inside the container, whatever .env says (shell env wins over .env in compose)
export NODE_ENV="${DEPLOY_NODE_ENV:-production}"
if [ "${DATABASE_TYPE:-sqlite}" = "sqlite" ] && [[ "${DATABASE_NAME:-}" != /app/data/* ]]; then
    # Keep the SQLite file inside the openwa-data volume so it survives rebuilds
    export DATABASE_NAME=/app/data/openwa.sqlite
fi

# Profiles from .env flags
profiles=()
[ "${DASHBOARD_ENABLED:-true}" = "true" ] && profiles+=(with-dashboard)
[ "${PROXY_ENABLED:-true}" = "true" ] && profiles+=(with-proxy)
[ "${DATABASE_TYPE:-sqlite}" = "postgres" ] && [ "${POSTGRES_BUILTIN:-false}" = "true" ] && profiles+=(postgres)
[ "${REDIS_ENABLED:-false}" = "true" ] && [ "${REDIS_BUILTIN:-false}" = "true" ] && profiles+=(redis)
[ "${STORAGE_TYPE:-local}" = "s3" ] && [ "${MINIO_BUILTIN:-false}" = "true" ] && profiles+=(minio)
COMPOSE_PROFILES=$(IFS=,; echo "${profiles[*]:-}")
export COMPOSE_PROFILES

log_info "NODE_ENV=$NODE_ENV | DB=${DATABASE_TYPE:-sqlite} | profiles: ${COMPOSE_PROFILES:-none}"

log_info "Building images..."
docker compose build "${BUILD_ARGS[@]+"${BUILD_ARGS[@]}"}"

log_info "Starting containers..."
docker compose up -d --remove-orphans

log_info "Waiting for API to become healthy..."
for _ in $(seq 1 60); do
    status=$(docker inspect -f '{{.State.Health.Status}}' openwa-api 2>/dev/null || echo "missing")
    [ "$status" = "healthy" ] && break
    if [ "$status" = "missing" ] || [ "$(docker inspect -f '{{.State.Running}}' openwa-api)" != "true" ]; then
        log_error "openwa-api is not running. Last logs:"
        docker logs --tail 50 openwa-api 2>&1 || true
        exit 1
    fi
    sleep 3
done
if [ "$status" != "healthy" ]; then
    log_error "openwa-api did not become healthy in time (status: $status). Last logs:"
    docker logs --tail 50 openwa-api 2>&1
    exit 1
fi

docker image prune -f >/dev/null

echo ""
docker compose ps --format "table {{.Name}}\t{{.Status}}\t{{.Ports}}"
echo ""
log_success "Deployed!"
[ "${PROXY_ENABLED:-true}" = "true" ] && log_success "Dashboard: http://localhost:${DASHBOARD_PORT:-2886}"
log_success "API:       http://localhost:${API_PORT:-2785}/api/docs"
key=$(docker logs openwa-api 2>&1 | grep -A1 'API Key' | tail -1 | sed -E 's/.*"message":" *([^"]*)".*/\1/')
[ -n "$key" ] && log_success "API key:   $key"
