# 1. Build Frontend
FROM node:20-alpine AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN --mount=type=cache,target=/root/.npm npm install --legacy-peer-deps
COPY frontend/ ./
RUN npm run build

# 2. Setup Backend & Final Image
FROM python:3.11-slim
# Install dependencies needed for python packages and nginx
RUN apt-get update && apt-get install -y nginx gettext gcc libffi-dev && rm -rf /var/lib/apt/lists/*

WORKDIR /app/backend
COPY backend/requirements.txt ./
RUN --mount=type=cache,target=/root/.cache/pip pip install --no-cache-dir -r requirements.txt
# Install Playwright and its system dependencies
RUN apt-get update && apt-get install -y \
    libnss3 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libxkbcommon0 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    libgbm1 \
    libasound2 \
    libpango-1.0-0 \
    libcairo2 \
    fonts-liberation \
    libx11-6 \
    libx11-xcb1 \
    libxcb1 \
    libxcursor1 \
    libxfixes3 \
    libxi6 \
    libxrender1 \
    libxtst6 \
    libglib2.0-0 \
    libxshmfence1 \
    libxcb-dri3-0 \
    && playwright install chromium \
    && rm -rf /var/lib/apt/lists/*

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
