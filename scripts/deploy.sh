#!/bin/sh
# Deploy completo — carga .env, inyecta secretos y verifica landing.
set -eu
cd /opt/citas
chmod +x deploy.sh scripts/check-env.sh 2>/dev/null || true
./deploy.sh
docker service update --force citas_web >/dev/null 2>&1 || true
sleep 12
if curl -fsS https://citas.renace.tech/healthz >/dev/null; then
  echo "healthz: OK"
else
  echo "healthz: FALLO" >&2
  exit 1
fi
if curl -fsS https://citas.renace.tech/ | grep -q 'modules-section'; then
  echo "landing: OK (módulos activos)"
else
  echo "landing: ADVERTENCIA — sección módulos no detectada" >&2
fi
sh scripts/check-env.sh || true
echo "Deploy completo: $(git rev-parse --short HEAD)"
