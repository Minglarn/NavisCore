# 1. Build Frontend
FROM node:20-alpine AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ ./
RUN npm run build

# 2. Setup Backend & Final Image
FROM python:3.11-alpine
# Install dependencies needed for python packages and nginx
RUN apk add --no-cache nginx gettext gcc musl-dev libffi-dev

WORKDIR /app/backend
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ ./

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
