#!/bin/sh

# Start Nginx in background
nginx -g "daemon off;" &

# Start Python backend
cd /app/backend
# Running uvicorn without & to keep it in foreground, 
# or use a helper to kill the script if it dies.
uvicorn main:app --host 0.0.0.0 --port 8080

# If uvicorn exits, kill the entire container (including nginx)
kill -9 $(pgrep nginx)
