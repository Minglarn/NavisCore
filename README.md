# NavisCore 📡

**NavisCore** is an advanced, autonomous AIS (Automatic Identification System) receiving and visualization platform. It combines a high-performance SDR receiver with a Python-powered data engine and a premium React dashboard to provide real-time maritime situational awareness.

![Screenshot](https://github.com/Minglarn/NavisCore/blob/main/screenshot.png?raw=true)

## 🚀 Key Features

- **All-in-One Docker Solution**: Fully containerized environment with separate services for SDR decoding and data processing.
- **High Concurrency Database**: Optimized SQLite engine using **Write-Ahead Logging (WAL)** and centralized session management for lock-free performance under heavy traffic.
- **Standardized Ship Mapping**: Full support for **ITU-R M.1371-5** AIS standards, including a smart editable ship category system with predefined dropdowns.
- **Smart Data Hybridization**: Seamless integration of local SDR data (via [AIS-catcher](https://github.com/jvde-github/AIS-catcher)) and global feeds from [AisStream.io](https://aisstream.io) with intelligent deduplication.
- **Vessel Enrichment**: Automatic vessel image fetching with intelligent caching (30-day persistence) and fallback logic.
- **Advanced Visualization**: Sleek, high-performance map featuring real-time tracking, COG lines, and persistent user settings (zoom, center, layer preferences).
- **Proactive Monitoring**: Built-in support for safety alerts, emergency signals, and advanced binary message decoding.

## 🛠 Architecture

NavisCore is built with a modern, modular architecture:

1.  **SDR Layer (AIS-catcher)**: Directly interfaces with RTL-SDR hardware. Decodes NMEA 0183 sentences and streams them via UDP.
2.  **Processing Engine (FastAPI)**: A high-performance Python backend that handles NMEA parsing, database persistence, and enrichment worker queues.
3.  **Real-time Layer (WebSockets)**: Provides sub-second updates to all connected clients.
4.  **UI Layer (React/Vite)**: A premium, responsive dashboard built with modern CSS and Leaflet.

## 📦 Quick Start

The easiest way to get started is with Docker Compose.

1.  **Configure `docker-compose.yml`**:
    ```yaml
    services:
      sdr:
        image: ghcr.io/minglarn/naviscore-sdr:latest
        devices:
          - /dev/bus/usb:/dev/bus/usb
        environment:
          - SDR_INDEX=0
        networks:
          - navis_net

      app:
        image: ghcr.io/minglarn/naviscore-app:latest
        ports:
          - "80:80"
          - "10110:10110/udp"
        volumes:
          - ./data:/app/data
        networks:
          - navis_net

    networks:
      navis_net:
        driver: bridge
    ```

2.  **Launch**:
    ```bash
    docker-compose up -d
    ```

3.  **Explore**: Access the dashboard at `http://localhost`.

## 🔧 Development

Build from source to customize the experience:

```bash
git clone https://github.com/Minglarn/NavisCore.git
cd NavisCore
docker-compose up -d --build
```

### Mock Mode
No SDR? No problem. Set `MOCK_MODE=true` in the `app` environment to see simulated traffic in the Stockholm archipelago.

## 📡 External Data Sources
- **UDP Ingest**: Accepts NMEA data on port `10110/udp`.
- **MQTT**: Subscribe to remote AIS topics.
- **Hybrid Feed**: Enable `AisStream.io` in settings for global coverage.

## 📄 License & Contributing
Contributions are welcome! Feel free to open issues or submit pull requests.
