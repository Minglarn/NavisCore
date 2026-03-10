# NavisCore 📡

**NavisCore** is a comprehensive, autonomous AIS (Automatic Identification System) receiver and visualization platform. It features a modern SDR receiver, a Python-powered data processing engine, and a sleek React-based dashboard.

![Screenshot](https://github.com/Minglarn/NavisCore/blob/main/screenshot.png?raw=true)

## Key Features
- **All-in-One Solution**: Frontend, backend, and database packaged in a multi-stage Docker image.
- **ITU-R M.1371-5 Standard**: Full support for international ship type codes with dynamic hazard mapping.
- **Smart Image Persistence**: Automatically fetches vessel images with a 24h retry logic for missing images and 30-day cache for real ship photos.
- **Real-time Map**: Interactive map with real-time ship positions, COG (Course Over Ground) lines, and persistence (saves your zoom/center).
- **RF Resilience**: Intelligent range limiting (200 Nm) to filter out unrealistic tropo-propogation data from statistics.
- **Mock Mode**: Development-friendly mode to generate simulated AIS traffic without an SDR device.

## Architecture
1. **SDR (rtl-ais)**: Interacts with the RTL-SDR hardware, decodes radio signals, and publishes NMEA 0183 data via UDP (Port 10110).
2. **Backend (Python/FastAPI)**: Processes AIS messages, enriches data with vessel images, and broadcasts real-time updates via WebSockets.
3. **Frontend (React/Vite)**: High-performance dashboard utilizing Leaflet for mapping and Lucide for iconography.

## Prerequisites
- **Docker & Docker Compose**
- **RTL-SDR USB Stick** (unless running in Mock Mode)

## Quick Start

The easiest way to run NavisCore is using the pre-built images from GitHub Container Registry.

1. **Create a `docker-compose.yml` file**:
```yaml
version: '3.8'

services:
  sdr:
    image: ghcr.io/minglarn/naviscore-sdr:latest
    container_name: naviscore_sdr
    restart: always
    # devices:
    #   - /dev/bus/usb:/dev/bus/usb # Required for Linux/Raspberry Pi
    volumes:
      - ./sdr/udev-rules:/etc/udev/rules.d:ro
    healthcheck:
      test: ["CMD-SHELL", "lsusb | grep -i 'Realtek' || exit 1"]
      interval: 30s
      timeout: 10s
      retries: 3
    networks:
      - navis_net

  app:
    image: ghcr.io/minglarn/naviscore-app:latest
    container_name: naviscore_app
    restart: unless-stopped
    ports:
      - "80:80"
      - "10110:10110/udp"
    environment:
      - MOCK_MODE=false
      - LOG_LEVEL=info
    volumes:
      - ./data:/app/data
    depends_on:
      - sdr
    networks:
      - navis_net

networks:
  navis_net:
    driver: bridge
```

2. **Start the application**:
```bash
docker-compose up -d
```

3. **Access the Dashboard**:
Open `http://localhost` in your browser.

## Development & Build from Source

If you want to modify NavisCore and build it yourself:

```bash
git clone https://github.com/Minglarn/NavisCore.git
cd NavisCore
docker-compose up -d --build
```

### Mock Mode
If you don't have an SDR device connected, set `MOCK_MODE=true` in the `app` service environment variables in `docker-compose.yml` to see simulated ship traffic in the Stockholm archipelago.

## Support & Contributing
Feel free to open issues or pull requests on [GitHub](https://github.com/Minglarn/NavisCore).
