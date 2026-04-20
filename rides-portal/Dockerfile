# Build context should be the repo root (set in docker-compose)
# so we can access ../shared/ for type aliases.

# ---- Build stage ----
FROM node:20-alpine AS build

WORKDIR /app

# Install deps for rides-portal
COPY rides-portal/package.json rides-portal/package-lock.json* ./rides-portal/
RUN cd rides-portal && npm ci

# Copy shared types and portal source
COPY shared/ ./shared/
COPY rides-portal/ ./rides-portal/

ARG VITE_API_URL=/api
ENV VITE_API_URL=$VITE_API_URL
ARG VITE_BUILD_DATE=unknown
ENV VITE_BUILD_DATE=$VITE_BUILD_DATE
ARG VITE_GIT_SHA=unknown
ENV VITE_GIT_SHA=$VITE_GIT_SHA

RUN cd rides-portal && npm run build

# ---- Serve with nginx ----
FROM nginx:alpine

RUN apk add --no-cache curl

COPY --from=build /app/rides-portal/dist /usr/share/nginx/html

# SPA fallback + API reverse proxy
RUN printf 'server {\n\
    listen 80;\n\
    root /usr/share/nginx/html;\n\
    index index.html;\n\
    client_max_body_size 100m;\n\
    add_header X-Frame-Options "DENY" always;\n\
    add_header X-Content-Type-Options "nosniff" always;\n\
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;\n\
    location /api/ {\n\
        proxy_pass http://rides-api:3000;\n\
        proxy_set_header Host $host;\n\
        proxy_set_header X-Real-IP $remote_addr;\n\
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;\n\
        proxy_set_header X-Forwarded-Proto $scheme;\n\
        proxy_connect_timeout 60s;\n\
        proxy_read_timeout 300s;\n\
        proxy_send_timeout 300s;\n\
    }\n\
    location /uploads/ {\n\
        proxy_pass http://rides-api:3000;\n\
        proxy_set_header Host $host;\n\
        proxy_set_header X-Real-IP $remote_addr;\n\
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;\n\
        proxy_set_header X-Forwarded-Proto $scheme;\n\
    }\n\
    location / {\n\
        try_files $uri $uri/ /index.html;\n\
    }\n\
}\n' > /etc/nginx/conf.d/default.conf

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD curl -f http://localhost:80/ || exit 1
