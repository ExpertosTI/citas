# Citas · Renace

SaaS **multitenant** de reservas para peluquerías y salones de belleza — inspirado en [Fresha](https://www.fresha.com/en-GB).

Cada salón se registra, tiene su perfil y enlace público, y gestiona citas en una **bahía visual con colores**.

- App: [https://citas.renace.tech](https://citas.renace.tech)
- Repo: [ExpertosTI/citas](https://github.com/ExpertosTI/citas)

## MVP

| Rol | Qué puede hacer |
| --- | --- |
| Salón (tenant) | Registro, login, perfil, servicios, clientes, bahía del día |
| Cliente final | Reserva en `/s/{slug}` sin cuenta |
| Sistema | Emails de confirmación y recordatorios (SMTP renace.tech) |

## Stack

- Astro 5 (SSR) + Tailwind CSS v4
- Node adapter, JSON store en volumen Docker
- Nodemailer → Hostinger SMTP (`info@renace.tech`)
- Docker Swarm + Traefik en **RenaceNet**

## Local

```bash
cp .env.example .env
# completa SMTP_PASS y SESSION_SECRET
npm install
npm run dev
```

Abre `http://localhost:4321`

1. `/registro` — crea un salón
2. `/app` — bahía de citas
3. `/s/tu-slug` — booking público

## Deploy (RenaceNet / Swarm)

En el VPS:

```bash
# Primera vez
git clone https://github.com/ExpertosTI/citas.git /opt/citas
cd /opt/citas

cat >/opt/citas/.env <<'EOF'
SESSION_SECRET=pon-un-secreto-largo-aleatorio
SMTP_HOST=smtp.hostinger.com
SMTP_PORT=465
SMTP_USER=info@renace.tech
SMTP_PASS=TU_PASSWORD_SMTP
SMTP_FROM_NAME="Citas · Renace"
SMTP_REPLY_TO=info@renace.tech
PUBLIC_SITE_URL=https://citas.renace.tech
ADMIN_EMAIL=info@renace.tech
REMINDER_SECRET=mismo-o-otro-secreto
EOF

chmod +x deploy.sh
./deploy.sh
```

- Stack: `citas` · Service: `citas_web`
- Dominio: `https://citas.renace.tech`
- Red: `RenaceNet` (overlay)
- Health: `/healthz`

```bash
docker service logs -f citas_web
```

### Recordatorios

Cron en el VPS (cada hora):

```bash
curl -X POST https://citas.renace.tech/api/reminders/run \
  -H "x-reminder-secret: $REMINDER_SECRET"
```

## Modelo multitenant

- **Tenant** = salón (email + password, slug público)
- **Services** = catálogo con color y duración
- **Clients** = agenda del salón
- **Appointments** = bloques en la bahía (colores, estados)

Datos en `data/*.json` (volumen `citas_data` en producción).
