#!/usr/bin/env bash
# ── Citas · Renace Protocol deploy.sh ─────────
#  Usage on VPS:
#      cd /opt/citas && ./deploy.sh
#
#  Stack: citas  ·  Domain: citas.renace.tech  ·  Network: RenaceNet
#  Repo:  https://github.com/ExpertosTI/citas

set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/ExpertosTI/citas.git}"
PROJECT_DIR="${PROJECT_DIR:-/opt/citas}"
STACK_NAME="${STACK_NAME:-citas}"
SERVICE_NAME="${STACK_NAME}_web"
DOMAIN="${DOMAIN:-citas.renace.tech}"
DEPLOY_BRANCH="${DEPLOY_BRANCH:-main}"

cyan()  { printf "\033[36m%s\033[0m\n" "$*"; }
green() { printf "\033[32m%s\033[0m\n" "$*"; }
red()   { printf "\033[31m%s\033[0m\n" "$*" >&2; }

cyan "── 1. Sync source ($DEPLOY_BRANCH) ─────────────"
if [ -d "$PROJECT_DIR/.git" ]; then
  cd "$PROJECT_DIR"
  git fetch origin "$DEPLOY_BRANCH"
  git checkout "$DEPLOY_BRANCH" 2>/dev/null || git checkout -b "$DEPLOY_BRANCH" "origin/$DEPLOY_BRANCH"
  git reset --hard "origin/$DEPLOY_BRANCH"
else
  git clone --branch "$DEPLOY_BRANCH" "$REPO_URL" "$PROJECT_DIR"
  cd "$PROJECT_DIR"
fi

cyan "── 2. Load secrets (.env) ─────────────────────"
load_env_file() {
  local file="$1" line key val
  [ -f "$file" ] || return 0
  while IFS= read -r line || [ -n "$line" ]; do
    line="${line%$'\r'}"
    case "$line" in
      ''|\#*) continue ;;
    esac
    key="${line%%=*}"
    val="${line#*=}"
    key="${key%"${key##*[![:space:]]}"}"
    key="${key#"${key%%[![:space:]]*}"}"
    [[ "$key" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]] || continue
    if [[ "$val" =~ ^\"(.*)\"$ ]]; then val="${BASH_REMATCH[1]}"
    elif [[ "$val" =~ ^\'(.*)\'$ ]]; then val="${BASH_REMATCH[1]}"
    fi
    export "$key=$val"
  done < "$file"
}
load_env_file "$PROJECT_DIR/.env"
export SMTP_HOST="${SMTP_HOST:-smtp.hostinger.com}"
export SMTP_PORT="${SMTP_PORT:-465}"
export SMTP_USER="${SMTP_USER:-info@renace.tech}"
export SMTP_PASS="${SMTP_PASS:-}"
export SMTP_FROM_NAME="${SMTP_FROM_NAME:-Citas · Renace}"
export SMTP_REPLY_TO="${SMTP_REPLY_TO:-info@renace.tech}"
export PUBLIC_SITE_URL="${PUBLIC_SITE_URL:-https://citas.renace.tech}"
export ADMIN_EMAIL="${ADMIN_EMAIL:-info@renace.tech}"
export ADMIN_PASSWORD="${ADMIN_PASSWORD:-}"
export SESSION_SECRET="${SESSION_SECRET:-citas-change-me}"
export REMINDER_SECRET="${REMINDER_SECRET:-$SESSION_SECRET}"

if [ -z "$SESSION_SECRET" ] || [ ${#SESSION_SECRET} -lt 24 ] || [[ "$SESSION_SECRET" =~ change-me|citas-change-me|citas-dev ]]; then
  red "ERROR: SESSION_SECRET is weak or missing in $PROJECT_DIR/.env"
  red "Add a random string (32+ chars), e.g.: openssl rand -base64 32"
  exit 1
fi
export GEMINI_API_KEY="${GEMINI_API_KEY:-}"
export GEMINI_MODEL="${GEMINI_MODEL:-gemini-3.5-flash}"
export GOOGLE_CLIENT_ID="${GOOGLE_CLIENT_ID:-}"
export GOOGLE_CLIENT_SECRET="${GOOGLE_CLIENT_SECRET:-}"

if [ -z "$SMTP_PASS" ] || [[ "$SMTP_PASS" =~ TU_APP_PASSWORD|YOUR_GOOGLE|changeme ]]; then
  red "WARNING: SMTP_PASS is missing or still a placeholder in $PROJECT_DIR/.env"
fi
if [ -n "$SMTP_PASS" ]; then
  cyan "   SMTP user: $SMTP_USER  pass: set (${#SMTP_PASS} chars)"
else
  red "   SMTP pass: NOT SET — emails will not send"
fi
if [ -n "$GEMINI_API_KEY" ]; then
  cyan "   Gemini:    configured (${#GEMINI_API_KEY} chars, model $GEMINI_MODEL)"
else
  red "   Gemini:    NOT SET — onboarding AI disabled"
fi
if [ -n "$GOOGLE_CLIENT_ID" ] && [ -n "$GOOGLE_CLIENT_SECRET" ]; then
  cyan "   Google:    Sign-In configured"
else
  red "   Google:    NOT SET — Google Sign-In disabled"
fi

cyan "── 3. Build image (low priority) ──────────────"
export DOCKER_BUILDKIT=1
nice -n 19 ionice -c 3 docker compose build --pull

cyan "── 4. Ensure RenaceNet exists ─────────────────"
if ! docker network ls --format '{{.Name}}' | grep -qx "RenaceNet"; then
  docker network create --driver overlay --attachable RenaceNet
fi

cyan "── 5. Deploy stack ($STACK_NAME → $DOMAIN) ────"
docker tag citas-web:latest citas-web:latest 2>/dev/null || true
docker stack deploy -c docker-compose.yml "$STACK_NAME"

cyan "── 6. Inject secrets into service ─────────────"
sleep 2

ENV_PAIRS=(
  "SMTP_HOST=${SMTP_HOST}"
  "SMTP_PORT=${SMTP_PORT}"
  "SMTP_USER=${SMTP_USER}"
  "SMTP_PASS=${SMTP_PASS}"
  "SMTP_FROM_NAME=${SMTP_FROM_NAME}"
  "SMTP_REPLY_TO=${SMTP_REPLY_TO}"
  "ADMIN_EMAIL=${ADMIN_EMAIL}"
  "ADMIN_PASSWORD=${ADMIN_PASSWORD}"
  "PUBLIC_SITE_URL=${PUBLIC_SITE_URL}"
  "SESSION_SECRET=${SESSION_SECRET}"
  "REMINDER_SECRET=${REMINDER_SECRET}"
  "GEMINI_API_KEY=${GEMINI_API_KEY}"
  "GEMINI_MODEL=${GEMINI_MODEL}"
  "GOOGLE_CLIENT_ID=${GOOGLE_CLIENT_ID}"
  "GOOGLE_CLIENT_SECRET=${GOOGLE_CLIENT_SECRET}"
)

UPDATE_ARGS=(--force)
for pair in "${ENV_PAIRS[@]}"; do
  key="${pair%%=*}"
  UPDATE_ARGS+=(--env-rm "$key")
done
for pair in "${ENV_PAIRS[@]}"; do
  UPDATE_ARGS+=(--env-add "$pair")
done

docker service update "${UPDATE_ARGS[@]}" "$SERVICE_NAME" >/dev/null

cyan "── 7. Cleanup dangling images ─────────────────"
docker image prune -f >/dev/null

green ""
green "✅ Citas deployed."
green "   Site:    https://$DOMAIN"
green "   Service: $SERVICE_NAME"
green "   Network: RenaceNet"
green "   Commit:  $(git rev-parse --short HEAD)"
green "   Logs:    docker service logs -f $SERVICE_NAME"
