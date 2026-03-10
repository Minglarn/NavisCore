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
    
    PPM=$FETCHED_PPM
    GAIN=$FETCHED_GAIN
    echo "Successfully fetched SDR config: PPM=$PPM, GAIN=$GAIN"
else
    echo "Failed to fetch or parse settings from API. Using defaults (PPM=0, GAIN=auto)"
fi

# Build command
CMD="/usr/local/bin/rtl_ais -n -h app -P 10110 -d $INDEX -p $PPM"

if [ "$GAIN" = "auto" ] || [ "$GAIN" = "AGC" ] || [ -z "$GAIN" ]; then
    CMD="$CMD -a"
else
    CMD="$CMD -g $GAIN"
fi

echo "Starting SDR (Device $INDEX) with command: $CMD"
exec $CMD
