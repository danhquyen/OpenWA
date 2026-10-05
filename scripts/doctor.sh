#!/usr/bin/env bash
# OpenWA - Read-only diagnostics for a Docker deployment.
# Shows which containers/volumes/data directories exist, what the databases contain,
# stale Chromium locks and recent errors. It does not change anything.
#
# Usage: ./scripts/doctor.sh > doctor.txt 2>&1

set -uo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

section() { echo ""; echo "===== $1 ====="; }

section "Project"
echo "dir: $(pwd)"
git log -1 --format='commit: %h %s (%cr)' 2>/dev/null || echo "not a git checkout"
git status --short 2>/dev/null | head -20

section ".env (non-secret values)"
if [ -f .env ]; then
    grep -E '^(NODE_ENV|DATABASE_TYPE|DATABASE_NAME|DATABASE_SYNCHRONIZE|POSTGRES_BUILTIN|REDIS_ENABLED|DASHBOARD_ENABLED|PROXY_ENABLED|DASHBOARD_PORT|API_PORT|BIND_ADDRESS|SESSION_DATA_PATH|COMPOSE_PROFILES)=' .env
else
    echo "no .env"
fi

section "Host resources"
free -m 2>/dev/null || vm_stat 2>/dev/null | head -5
df -h . 2>/dev/null | tail -1
docker system df 2>/dev/null

section "Compose projects"
docker compose ls -a 2>/dev/null

section "OpenWA containers (any project)"
for c in $(docker ps -a --format '{{.Names}}' | grep -i -E 'openwa|wa-api|whatsapp'); do
    docker inspect "$c" --format \
        '{{.Name}} | image={{.Config.Image}} | status={{.State.Status}} exit={{.State.ExitCode}} oom={{.State.OOMKilled}} restarts={{.RestartCount}} started={{.State.StartedAt}}
   project={{index .Config.Labels "com.docker.compose.project"}} dir={{index .Config.Labels "com.docker.compose.project.working_dir"}} files={{index .Config.Labels "com.docker.compose.project.config_files"}}
   shm={{.HostConfig.ShmSize}} mem_limit={{.HostConfig.Memory}}{{range .Mounts}}
   mount: {{.Type}} {{if .Name}}{{.Name}}{{else}}{{.Source}}{{end}} -> {{.Destination}}{{end}}'
    docker inspect "$c" --format '{{range .Config.Env}}{{println .}}{{end}}' \
        | grep -E '^(NODE_ENV|DATABASE_TYPE|DATABASE_NAME|DATABASE_SYNCHRONIZE|SESSION_DATA_PATH)=' | sed 's/^/   env: /'
done

section "Volumes"
docker volume ls --format '{{.Name}}' | grep -i -E 'openwa|wa' || echo "none"

section "Bind-mounted data directories"
for d in ./data "$HOME"/*/data; do
    [ -f "$d/openwa.sqlite" ] || [ -f "$d/main.sqlite" ] || continue
    echo "$d"
    ls -la "$d"
done

# Inspect a data location (volume name or absolute host path) using node + sqlite3 from the API image
API_IMAGE=$(docker inspect openwa-api --format '{{.Config.Image}}' 2>/dev/null || docker images --format '{{.Repository}}' | grep -m1 'openwa-api')
inspect_data() {
    local src="$1"
    echo ""
    echo "--- $src"
    [ -n "$API_IMAGE" ] || { echo "no OpenWA API image to inspect with"; return; }
    docker run --rm -v "$src":/d:ro --entrypoint node "$API_IMAGE" -e '
const fs = require("fs"), path = require("path"), sqlite3 = require("sqlite3");
const show = f => { const s = fs.statSync(f); console.log(`  ${path.basename(f)} ${s.size}B modified ${s.mtime.toISOString()}`); };
fs.readdirSync("/d").forEach(f => show(path.join("/d", f)));
const q = (db, sql) => new Promise(r => db.all(sql, (e, rows) => r(e ? `ERR ${e.message}` : rows)));
(async () => {
  for (const file of ["openwa.sqlite", "main.sqlite"]) {
    const p = path.join("/d", file);
    if (!fs.existsSync(p)) { console.log(`  [${file}] missing`); continue; }
    const db = new sqlite3.Database(p, sqlite3.OPEN_READONLY);
    const tables = (await q(db, "select name from sqlite_master where type=\"table\" order by name"));
    console.log(`  [${file}] tables:`, Array.isArray(tables) ? tables.map(t => t.name).join(", ") : tables);
    if (file === "openwa.sqlite") {
      console.log("    migrations:", JSON.stringify(await q(db, "select name from migrations")));
      console.log("    sessions:", JSON.stringify(await q(db, "select id, name, status, phone, updatedAt from sessions")));
      console.log("    messages:", JSON.stringify(await q(db, "select status, count(*) n from messages group by status")));
      console.log("    webhooks:", JSON.stringify(await q(db, "select id, sessionId, url, active from webhooks")));
    } else {
      console.log("    api_keys:", JSON.stringify(await q(db, "select name, role, isActive, lastUsedAt from api_keys")));
    }
    db.close();
  }
  const sdir = "/d/sessions";
  if (fs.existsSync(sdir)) {
    for (const s of fs.readdirSync(sdir)) {
      const lock = path.join(sdir, s, "SingletonLock");
      let owner = "none";
      try { owner = fs.readlinkSync(lock); } catch {}
      console.log(`  sessions/${s}  lock=${owner}`);
    }
  }
})();
' 2>&1
}

section "Data contents"
for v in $(docker volume ls --format '{{.Name}}' | grep -i -E 'openwa'); do inspect_data "$v"; done
for d in ./data; do [ -d "$d" ] && inspect_data "$(cd "$d" && pwd)"; done

section "Recent API errors (unique, last 500 lines)"
docker logs --tail 500 openwa-api 2>&1 | grep -E 'ERROR|WARN|Error:|failed' \
    | sed -E 's/[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9:.]+Z//; s/\x1b\[[0-9;]*m//g' | sort | uniq -c | sort -rn | head -30

echo ""
echo "Done. Nothing was changed."
