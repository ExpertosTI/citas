#!/bin/sh
# Verifica .env y el servicio Docker sin imprimir secretos.
# Uso: cd /opt/citas && sh scripts/check-env.sh
set -eu

PROJECT_DIR="${PROJECT_DIR:-/opt/citas}"
ENV_FILE="${ENV_FILE:-$PROJECT_DIR/.env}"
SERVICE_NAME="${SERVICE_NAME:-citas_web}"

cd "$PROJECT_DIR"

env_val() {
  grep -m1 "^$1=" "$ENV_FILE" 2>/dev/null | cut -d= -f2- | sed 's/^["'\'']//;s/["'\'']$//' || true
}

status_ok() {
  printf '  ✓ %-22s ok%s\n' "$1" "${2:+ · $2}"
}

status_fail() {
  printf '  ✗ %-22s FALTA%s\n' "$1" "${2:+ · $2}"
}

service_has_key() {
  docker service inspect "$SERVICE_NAME" --format '{{range .Spec.TaskTemplate.ContainerSpec.Env}}{{.}}{{"\n"}}{{end}}' 2>/dev/null \
    | grep -q "^$1="
}

echo "── Citas · check-env ──"
echo "   .env:    $ENV_FILE"
echo "   service: $SERVICE_NAME"
echo ""

fail=0

SMTP_HOST="$(env_val SMTP_HOST)"; [ -n "$SMTP_HOST" ] || SMTP_HOST="smtp.hostinger.com"
SMTP_PORT="$(env_val SMTP_PORT)"; [ -n "$SMTP_PORT" ] || SMTP_PORT="465"
SMTP_USER="$(env_val SMTP_USER)"; [ -n "$SMTP_USER" ] || SMTP_USER="info@renace.tech"
SMTP_PASS="$(env_val SMTP_PASS)"
SMTP_FROM_NAME="$(env_val SMTP_FROM_NAME)"; [ -n "$SMTP_FROM_NAME" ] || SMTP_FROM_NAME="Citas · Renace"
SMTP_REPLY_TO="$(env_val SMTP_REPLY_TO)"; [ -n "$SMTP_REPLY_TO" ] || SMTP_REPLY_TO="info@renace.tech"
SESSION_SECRET="$(env_val SESSION_SECRET)"
REMINDER_SECRET="$(env_val REMINDER_SECRET)"
GEMINI_API_KEY="$(env_val GEMINI_API_KEY)"
GEMINI_MODEL="$(env_val GEMINI_MODEL)"; [ -n "$GEMINI_MODEL" ] || GEMINI_MODEL="gemini-2.5-flash"
GOOGLE_CLIENT_ID="$(env_val GOOGLE_CLIENT_ID)"
GOOGLE_CLIENT_SECRET="$(env_val GOOGLE_CLIENT_SECRET)"
PUBLIC_SITE_URL="$(env_val PUBLIC_SITE_URL)"; [ -n "$PUBLIC_SITE_URL" ] || PUBLIC_SITE_URL="https://citas.renace.tech"
ADMIN_EMAIL="$(env_val ADMIN_EMAIL)"; [ -n "$ADMIN_EMAIL" ] || ADMIN_EMAIL="info@renace.tech"

echo "Archivo .env:"
status_ok SMTP_HOST "$SMTP_HOST"
status_ok SMTP_PORT "$SMTP_PORT"
status_ok SMTP_USER "$SMTP_USER"
if [ -n "$SMTP_PASS" ] && ! echo "$SMTP_PASS" | grep -qiE 'TU_APP_PASSWORD|YOUR_GOOGLE|changeme|xxx'; then
  status_ok SMTP_PASS "${#SMTP_PASS} chars"
else
  status_fail SMTP_PASS "vacío o placeholder"
  fail=1
fi
status_ok SMTP_FROM_NAME "$SMTP_FROM_NAME"
status_ok SMTP_REPLY_TO "$SMTP_REPLY_TO"

if [ -n "$SESSION_SECRET" ] && [ "${#SESSION_SECRET}" -ge 24 ] && ! echo "$SESSION_SECRET" | grep -qiE 'change-me|citas-change-me|citas-dev'; then
  status_ok SESSION_SECRET "${#SESSION_SECRET} chars"
else
  status_fail SESSION_SECRET "débil o ausente"
  fail=1
fi

if [ -n "$REMINDER_SECRET" ]; then
  status_ok REMINDER_SECRET "${#REMINDER_SECRET} chars"
else
  status_ok REMINDER_SECRET "usa SESSION_SECRET"
fi

if [ -n "$GEMINI_API_KEY" ]; then
  status_ok GEMINI_API_KEY "$GEMINI_MODEL"
else
  status_fail GEMINI_API_KEY
  fail=1
fi

if [ -n "$GOOGLE_CLIENT_ID" ] && [ -n "$GOOGLE_CLIENT_SECRET" ]; then
  status_ok GOOGLE_OAUTH "client_id + secret"
else
  status_fail GOOGLE_OAUTH "client_id o secret vacío"
  fail=1
fi

status_ok PUBLIC_SITE_URL "$PUBLIC_SITE_URL"
status_ok ADMIN_EMAIL "$ADMIN_EMAIL"

echo ""
echo "Servicio Docker (claves inyectadas):"
for key in SMTP_HOST SMTP_PORT SMTP_USER SMTP_PASS SMTP_FROM_NAME SMTP_REPLY_TO \
  PUBLIC_SITE_URL SESSION_SECRET REMINDER_SECRET GEMINI_API_KEY GEMINI_MODEL \
  GOOGLE_CLIENT_ID GOOGLE_CLIENT_SECRET ADMIN_EMAIL; do
  if service_has_key "$key"; then
    status_ok "$key (runtime)"
  else
    status_fail "$key (runtime)" "no en $SERVICE_NAME"
    fail=1
  fi
done

echo ""
if curl -fsS https://citas.renace.tech/healthz >/dev/null 2>&1; then
  status_ok healthz
else
  status_fail healthz
  fail=1
fi

HDR="${REMINDER_SECRET:-$SESSION_SECRET}"
if [ -n "$HDR" ]; then
  CFG="$(curl -fsS -H "x-reminder-secret: $HDR" https://citas.renace.tech/api/health/config 2>/dev/null || true)"
  if echo "$CFG" | grep -q '"ok":true'; then
    status_ok api/health/config "runtime"
  elif [ -n "$CFG" ]; then
    status_fail api/health/config "revisar checks en runtime"
    fail=1
  else
    printf '  · %-22s pendiente redeploy\n' api/health/config
  fi
fi

echo ""
if [ "$fail" -eq 0 ]; then
  echo "✅ Todas las variables críticas están configuradas."
  exit 0
fi
echo "⚠️  Faltan variables. Usa scripts/seed-env.sh y luego sh scripts/deploy.sh"
exit 1
