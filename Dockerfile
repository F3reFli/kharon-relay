# syntax=docker/dockerfile:1

# — Étape 1 : compilation du jeu (bundle statique) —
FROM node:24-alpine@sha256:06d7adf3e0ef61a13f1d28682726366f97a15aa1888c934d3ecec86c33918b53 AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund --ignore-scripts
COPY . .
RUN npm run build

# — Étape 2 : service statique nginx, utilisateur non-root, port 8080 —
FROM nginxinc/nginx-unprivileged:stable-alpine@sha256:f5116ed4606f3eb015dd4a8e28cb9b351476dc0ad4bc6e9f93b19cec130cdf03 AS runtime
LABEL org.opencontainers.image.title="kharon-relay" \
      org.opencontainers.image.description="KHARON//RELAY — clicker 3D sur une station spatiale abandonnée" \
      org.opencontainers.image.licenses="MIT"
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY deploy/security-headers.conf /etc/nginx/snippets/security-headers.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/healthz || exit 1
