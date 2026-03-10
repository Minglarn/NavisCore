#!/bin/sh

# Start Nginx in background
nginx -g "daemon off;" &
NGINX_PID=$!

# Start Python backend
cd /app/backend
uvicorn main:app --host 0.0.0.0 --port 8080 &
UVICORN_PID=$!

# Wait for both processes
wait $NGINX_PID $UVICORN_PID
