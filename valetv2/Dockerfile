# ============================================
# 2M Parking — Multi-stage Dockerfile
# Stage 1: Build Angular frontend
# Stage 2: Production (Nginx + Node.js backend)
# ============================================

# --- Stage 1: Build frontend ---
FROM node:20-alpine AS frontend-build

WORKDIR /app

# Copiar package files do frontend
COPY package.json package-lock.json ./

# Instalar dependências do frontend
RUN npm ci --legacy-peer-deps

# Copiar source do frontend
COPY src/ ./src/
COPY angular.json tsconfig.json tslint.json ./

# Build Angular com production config
ENV NODE_OPTIONS=--openssl-legacy-provider
RUN npx ng build --prod

# --- Stage 2: Production ---
FROM node:20-alpine

# Instalar Nginx e supervisor (para rodar Nginx + Node juntos)
RUN apk add --no-cache nginx supervisor

WORKDIR /app

# Copiar package files do backend
COPY functions/package.json functions/package-lock.json ./

# Instalar dependências do backend (production only)
RUN npm ci --production

# Copiar código do backend
COPY functions/index.js ./
COPY functions/.env.example ./.env.example

# Copiar frontend buildado do stage 1
COPY --from=frontend-build /app/dist/valetv2 /usr/share/nginx/html

# Copiar config do Nginx
COPY nginx.conf /etc/nginx/http.d/default.conf

# Remover config default do Nginx Alpine
RUN rm -f /etc/nginx/http.d/default.conf.bak

# Criar diretório de logs
RUN mkdir -p /app/logs /var/log/supervisor

# Copiar config do supervisor
COPY supervisord.conf /etc/supervisor/conf.d/supervisord.conf

# Expor porta 80 (Nginx)
EXPOSE 80

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

# Iniciar Nginx + Node via supervisor
CMD ["supervisord", "-c", "/etc/supervisor/conf.d/supervisord.conf"]
