# Citas · Renace — Astro SSR (Node)
FROM node:22-alpine AS build

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

COPY . .
RUN npm run build

FROM node:22-alpine

LABEL org.opencontainers.image.title="citas-web" \
      org.opencontainers.image.description="Citas — SaaS multitenant de reservas para peluquerías" \
      org.opencontainers.image.url="https://citas.renace.tech" \
      org.opencontainers.image.vendor="renace.tech"

WORKDIR /app

ENV HOST=0.0.0.0
ENV PORT=4321
ENV NODE_ENV=production
ENV CITAS_DATA_DIR=/app/data

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/dist ./dist
COPY --from=build /app/public ./public

RUN mkdir -p /app/data && chown -R node:node /app

USER node

EXPOSE 4321

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:4321/healthz || exit 1

CMD ["node", "./dist/server/entry.mjs"]
