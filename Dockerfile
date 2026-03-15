# 1. Build Frontend
FROM node:20-alpine AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN --mount=type=cache,target=/root/.npm npm install --legacy-peer-deps
COPY frontend/ ./
RUN npm run build

# 2. Setup Backend & Final Image
FROM python:3.11-alpine
# Install dependencies needed for python packages and nginx
RUN apk add --no-cache nginx gettext gcc musl-dev libffi-dev

WORKDIR /app/backend
COPY backend/requirements.txt ./
RUN --mount=type=cache,target=/root/.cache/pip pip install --no-cache-dir -r requirements.txt

COPY backend/ ./
# Backup for default image
COPY data/images/0.jpg /app/backend/static/0.jpg

# Setup Nginx
COPY nginx/nginx.conf /etc/nginx/nginx.conf
# Copy built frontend
COPY --from=frontend-builder /app/frontend/dist /usr/share/nginx/html

WORKDIR /app
COPY entrypoint.sh ./
RUN chmod +x entrypoint.sh

# Data directory for SQLite
RUN mkdir -p /app/data

EXPOSE 80 10110/udp

ENTRYPOINT ["/app/entrypoint.sh"]
