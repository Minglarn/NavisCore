#!/bin/sh

# Default values
API_URL="http://app:80/api/settings"
PPM=0
GAIN="auto"
INDEX=${SDR_INDEX:-0}

echo "Waiting for NavisCore backend ($API_URL) to become available..."
# Wait up to 30 seconds for the backend to start
for i in $(seq 1 15); do
    if curl -s -f "$API_URL" > /dev/null; then
        echo "Backend is up!"
        break
    fi
    echo "Waiting 2 seconds..."
    sleep 2
done

# Fetch settings from API
SETTINGS=$(curl -s "$API_URL")
if [ -n "$SETTINGS" ] && echo "$SETTINGS" | jq -e . >/dev/null 2>&1; then
    # Parse values. Default to 0 and auto if the API returned null/empty
    FETCHED_PPM=$(echo "$SETTINGS" | jq -r '.sdr_ppm // "0"')
    FETCHED_GAIN=$(echo "$SETTINGS" | jq -r '.sdr_gain // "auto"')
    FETCHED_ENABLED=$(echo "$SETTINGS" | jq -r '.sdr_enabled // "true"')
    
    PPM=$FETCHED_PPM
    GAIN=$FETCHED_GAIN
    SDR_ENABLED=$FETCHED_ENABLED
    echo "Successfully fetched SDR config: PPM=$PPM, GAIN=$GAIN, ENABLED=$SDR_ENABLED"
else
    echo "Failed to fetch or parse settings from API. Using defaults (PPM=0, GAIN=auto, ENABLED=true)"
    SDR_ENABLED="true"
fi

# Check if SDR is enabled
if [ "$SDR_ENABLED" != "true" ]; then
    echo "SDR is DISABLED in settings. Entering idle sleep loop..."
    while true; do
        sleep 3600
    done
fi

# Build command
CMD="/usr/local/bin/AIS-catcher -u app 10110 -d $INDEX -p $PPM"

if [ "$GAIN" = "auto" ] || [ "$GAIN" = "AGC" ] || [ -z "$GAIN" ]; then
    CMD="$CMD -gr TUNER auto"
else
    CMD="$CMD -gr TUNER $GAIN"
fi

echo "Starting SDR (Device $INDEX) with command: $CMD"
exec $CMD
