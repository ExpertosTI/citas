#!/bin/sh
# Verifica .env y el servicio Docker sin imprimir secretos.
# Uso: cd /opt/citas && sh scripts/check-env.sh
set -eu

PROJECT_DIR="${PROJECT_DIR:-/opt/citas}"
ENV_FILE="${ENV_FILE:-$PROJECT_DIR/.env}"
SERVICE_NAME="${SERVICE_NAME:-citas_web}"

cd "$PROJECT_DIR"

env_val() {
  grep -m1 "^$1=" "$ENV_FILE" 2>/dev/null | cut -d= -f2- | sed 's/^["'\'']//;s/["'\'']$//' | tr -d '\r' | sed 's/^[[:space:]]*//;s/[[:space:]]*$//' || true
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

runtime_env_len() {
  docker service inspect "$SERVICE_NAME" --format '{{range .Spec.TaskTemplate.ContainerSpec.Env}}{{.}}{{"\n"}}{{end}}' 2>/dev/null \
    | grep "^$1=" | tail -1 | cut -d= -f2- | tr -d '\r\n' | wc -c | tr -d ' '
}

key_type_label() {
  case "$1" in
    AIza*) echo "standard" ;;
    AQ.*) echo "auth" ;;
    *) echo "custom" ;;
  esac
}

echo "── Citas · check-env ──"
echo "   .env:    $ENV_FILE"
echo "   service: $SERVICE_NAME"
echo ""

fail=0
gemini_fail=0

SMTP_HOST="$(env_val SMTP_HOST)"; [ -n "$SMTP_HOST" ] || SMTP_HOST="smtp.hostinger.com"
SMTP_PORT="$(env_val SMTP_PORT)"; [ -n "$SMTP_PORT" ] || SMTP_PORT="465"
SMTP_USER="$(env_val SMTP_USER)"; [ -n "$SMTP_USER" ] || SMTP_USER="info@renace.tech"
SMTP_PASS="$(env_val SMTP_PASS)"
SMTP_FROM_NAME="$(env_val SMTP_FROM_NAME)"; [ -n "$SMTP_FROM_NAME" ] || SMTP_FROM_NAME="Citas · Renace"
SMTP_REPLY_TO="$(env_val SMTP_REPLY_TO)"; [ -n "$SMTP_REPLY_TO" ] || SMTP_REPLY_TO="info@renace.tech"
SESSION_SECRET="$(env_val SESSION_SECRET)"
REMINDER_SECRET="$(env_val REMINDER_SECRET)"
GEMINI_API_KEY="$(env_val GEMINI_API_KEY)"
GEMINI_MODEL="$(env_val GEMINI_MODEL)"; [ -n "$GEMINI_MODEL" ] || GEMINI_MODEL="gemini-3-flash-preview"
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
  kt="$(key_type_label "$GEMINI_API_KEY")"
  if [ "$kt" = "custom" ] && [ "${#GEMINI_API_KEY}" -lt 20 ]; then
    status_fail GEMINI_API_KEY "valor demasiado corto"
    fail=1
  else
    status_ok GEMINI_API_KEY "${#GEMINI_API_KEY} chars · $kt"
  fi
  status_ok GEMINI_MODEL "$GEMINI_MODEL"
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
    rlen="$(runtime_env_len "$key")"
    if [ "$key" = "GEMINI_API_KEY" ] || [ "$key" = "GOOGLE_CLIENT_SECRET" ] || [ "$key" = "SMTP_PASS" ] || [ "$key" = "SESSION_SECRET" ] || [ "$key" = "REMINDER_SECRET" ]; then
      if [ "${rlen:-0}" -gt 0 ]; then
        status_ok "$key (runtime)" "${rlen} chars"
        if [ "$key" = "GEMINI_API_KEY" ] && [ -n "$GEMINI_API_KEY" ] && [ "$rlen" != "${#GEMINI_API_KEY}" ]; then
          status_fail "$key (runtime)" "longitud distinta a .env (${#GEMINI_API_KEY} vs ${rlen})"
          fail=1
        fi
      else
        status_fail "$key (runtime)" "vacío en contenedor"
        fail=1
      fi
    else
      status_ok "$key (runtime)"
    fi
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
  if echo "$CFG" | grep -q '"geminiLive":true'; then
    status_ok api/health/config "gemini live"
  elif echo "$CFG" | grep -q '"geminiLive":false'; then
    GEM_ERR="$(printf '%s' "$CFG" | sed -n 's/.*"geminiError":"\([^"]*\)".*/\1/p' | head -1)"
    if [ -n "$GEM_ERR" ]; then
      status_fail api/health/config "gemini 401 — proyecto Google Cloud (API + service account)"
      printf '    · detalle: %s\n' "$GEM_ERR"
    else
      status_fail api/health/config "gemini no responde"
    fi
    gemini_fail=1
  elif echo "$CFG" | grep -q '"ok":true'; then
    status_ok api/health/config "runtime"
  elif [ -n "$CFG" ]; then
    status_fail api/health/config "revisar checks en runtime"
    fail=1
  else
    printf '  · %-22s pendiente redeploy\n' api/health/config
  fi
fi

echo ""
if [ "$fail" -eq 0 ] && [ "$gemini_fail" -eq 0 ]; then
  echo "✅ Todas las variables críticas están configuradas y Gemini responde."
  exit 0
fi
if [ "$fail" -eq 0 ] && [ "$gemini_fail" -eq 1 ]; then
  echo "✅ Variables y deploy correctos."
  echo "⚠️  Gemini API rechaza la clave auth (AQ.*). En Google AI Studio / Cloud Console:"
  echo "    · Verifica que la clave no esté «Blocked»"
  echo "    · Habilita «Generative Language API» en el proyecto de la clave"
  echo "    · Confirma que el service account vinculado esté activo"
  exit 1
fi
echo "⚠️  Faltan variables en .env o no llegaron al contenedor."
exit 1
