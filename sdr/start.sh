#!/bin/sh

# Default values if not set in docker-compose.yml
PPM=${SDR_PPM:-0}
GAIN=${SDR_GAIN:-auto}

# Build the command based on whether AGC (auto) or a manual gain is set
CMD="/usr/local/bin/rtl_ais -n -h app -P 10110 -p $PPM"

if [ "$GAIN" = "auto" ] || [ "$GAIN" = "AGC" ] || [ -z "$GAIN" ]; then
    CMD="$CMD -a"
else
    CMD="$CMD -g $GAIN"
fi

echo "Starting SDR with command: $CMD"
exec $CMD
