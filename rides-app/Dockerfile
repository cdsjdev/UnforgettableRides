# Build context should be the repo root (set in docker-compose)
# so we can access ../shared/ used by app imports.

# ---- Build stage ----
FROM node:20-alpine AS build

WORKDIR /app

# Install deps for rides-app
COPY rides-app/package.json rides-app/package-lock.json* ./rides-app/
COPY rides-app/scripts/ ./rides-app/scripts/
RUN cd rides-app && npm ci

# Copy shared types and app source
COPY shared/ ./shared/
COPY rides-app/ ./rides-app/

WORKDIR /app/rides-app

# Build-time API base used by app web bundle
ARG EXPO_PUBLIC_API_URL=/api/v1
ENV EXPO_PUBLIC_API_URL=$EXPO_PUBLIC_API_URL
ARG EXPO_PUBLIC_BUILD_DATE=unknown
ENV EXPO_PUBLIC_BUILD_DATE=$EXPO_PUBLIC_BUILD_DATE
ARG EXPO_PUBLIC_GIT_SHA=unknown
ENV EXPO_PUBLIC_GIT_SHA=$EXPO_PUBLIC_GIT_SHA

# Export static web bundle
RUN npx expo export --platform web --output-dir dist

# ---- Serve with nginx ----
FROM nginx:alpine

RUN apk add --no-cache curl

COPY --from=build /app/rides-app/dist /usr/share/nginx/html

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
    location /product-catalog/ {\n\
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
