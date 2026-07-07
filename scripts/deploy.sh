#!/bin/sh
set -eu

cd /opt/citas

git fetch origin main
git reset --hard origin/main

HEAD_SHA="$(git rev-parse --short HEAD)"
echo "Desplegando commit ${HEAD_SHA}..."

docker compose build --pull
docker stack deploy -c docker-compose.yml citas

# Swarm no siempre recrea el contenedor con tag :latest — forzar reinicio
docker service update --force citas_web

echo "Esperando arranque..."
sleep 12

if curl -fsS https://citas.renace.tech/healthz >/dev/null; then
  echo "healthz: OK"
else
  echo "healthz: FALLO" >&2
  exit 1
fi

if curl -fsS https://citas.renace.tech/ | grep -q 'landing-icon'; then
  echo "landing: OK (versión nueva activa)"
else
  echo "landing: ADVERTENCIA — HTML aún parece versión anterior" >&2
  exit 1
fi

echo "Deploy completo: ${HEAD_SHA}"
