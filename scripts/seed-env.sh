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

set_var SMTP_HOST
set_var SMTP_PORT
set_var SMTP_USER
set_var SMTP_PASS
set_var SMTP_FROM_NAME
set_var SMTP_REPLY_TO
set_var PUBLIC_SITE_URL
set_var ADMIN_EMAIL
set_var SESSION_SECRET
set_var REMINDER_SECRET
set_var GEMINI_API_KEY
set_var GEMINI_MODEL
set_var GOOGLE_CLIENT_ID
set_var GOOGLE_CLIENT_SECRET
set_var SUPER_ADMIN_EMAILS
set_var ADMIN_PASSWORD
set_var EVOLUTION_API_URL
set_var EVOLUTION_API_KEY
set_var EVOLUTION_INSTANCE

# Cargar .evolution.local si existe
if [ -f "$PROJECT_DIR/.evolution.local" ]; then
  while IFS= read -r line || [ -n "$line" ]; do
    line="${line%%#*}"
    line="$(echo "$line" | tr -d '\r')"
    [ -z "$line" ] && continue
    key="${line%%=*}"
    val="${line#*=}"
    case "$key" in
      EVOLUTION_API_URL|EVOLUTION_API_KEY|EVOLUTION_INSTANCE)
        export "$key=$val"
        set_var "$key"
        ;;
    esac
  done < "$PROJECT_DIR/.evolution.local"
fi

echo "seed-env: listo ($(wc -l < "$ENV_FILE" | tr -d ' ') líneas en .env)"
