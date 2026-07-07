#!/bin/sh
# Actualiza .env sin editores — pasa variables en la misma línea de comando.
# Ejemplo (en el VPS, en tu sesión SSH):
#   GOOGLE_CLIENT_ID=xxx.apps.googleusercontent.com \
#   GOOGLE_CLIENT_SECRET=GOCSPX-xxx \
#   ./scripts/seed-env.sh
set -eu

PROJECT_DIR="${PROJECT_DIR:-/opt/citas}"
ENV_FILE="${ENV_FILE:-$PROJECT_DIR/.env}"

cd "$PROJECT_DIR"
touch "$ENV_FILE"

set_var() {
  key="$1"
  eval "val=\${$key:-}"
  [ -n "$val" ] || return 0
  if grep -q "^${key}=" "$ENV_FILE" 2>/dev/null; then
    grep -v "^${key}=" "$ENV_FILE" > "${ENV_FILE}.tmp"
    mv "${ENV_FILE}.tmp" "$ENV_FILE"
  fi
  printf '%s=%s\n' "$key" "$val" >> "$ENV_FILE"
  echo "${key}: ok"
}

set_var SESSION_SECRET
set_var REMINDER_SECRET
set_var SMTP_PASS
set_var GEMINI_API_KEY
set_var GOOGLE_CLIENT_ID
set_var GOOGLE_CLIENT_SECRET
set_var ADMIN_PASSWORD

echo "seed-env: listo ($(wc -l < "$ENV_FILE" | tr -d ' ') líneas en .env)"
