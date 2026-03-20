# NavisCore 📡

![Version](https://img.shields.io/badge/version-1.0.0-blue)
![License](https://img.shields.io/badge/License-MIT-yellow)
![Python](https://img.shields.io/badge/python-3.11+-blueviolet)
![Status](https://img.shields.io/badge/status-active-success)
![Docker](https://img.shields.io/badge/docker-ready-blue)

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

## 📡 Data Sources & Hybrid Feed

NavisCore is designed to be a central hub for maritime data:

- **Local SDR Layer**: Interfaces with RTL-SDR hardware to decode local traffic.
- **UDP Ingest**: Accepts NMEA data from external decoders on port `10110/udp`.
- **MQTT**: 
  - **Broadcast**: Publishes real-time vessel updates to `naviscore/objects`.
  - **Statistics**:
    - **Hourly**: Publishes `naviscore/objects_stat_hourly` every hour with message counts, new/unique vessels, and shiptype distribution.
    - **Daily**: Publishes `naviscore/objects_stat_daily` at midnight with a summary of the full day's activity.
  - **Raw Image Feed**: Publishes the raw binary data (JPEG) of a vessel's image to `naviscore/new_detected` whenever a new vessel is first identified.
- **AisStream.io (Hybrid)**: This is a powerful feature that allows you to fetch real-time global AIS data.
  - **API Key Required**: To use this, you need a free API key from [AisStream.io](https://aisstream.io).
  - **Interactive Bounding Box**: You can define the geographic area you want to monitor directly on the map. Open **Settings -> Hybrid Data** and click **"Select area on map"** to drag a selection box.
  - **Coordinate System**: The system uses decimal degrees (WGS84). A Bounding Box is defined by its South-West (min lat, min lon) and North-East (max lat, max lon) corners.
  - **Auto-Sync**: The backend automatically restarts the stream filtering as soon as you save your new coordinates.

## 🏠 Home Assistant Integration

NavisCore can easily be integrated with [Home Assistant](https://www.home-assistant.io/) using its MQTT feed. Below is an example of an automation that notifies you when a new vessel is detected.

```yaml
alias: "AIS: New Vessel Detected"
description: "Sends a notification with a ship image when a new object appears in NavisCore"
trigger:
  - platform: mqtt
    topic: "naviscore/objects"
condition:
  - condition: template
    # Only trigger for new vessels (not updates)
    value_template: "{{ trigger.payload_json.event_type == 'new' }}"
  - condition: template
    # Filter out buoys and beacons
    value_template: "{{ trigger.payload_json.is_nav_aid == false }}"
action:
  - service: notify.mobile_app_your_phone
    data:
      title: "🚢 {{ trigger.payload_json.name }}"
      message: >
        Type: {{ trigger.payload_json.ship_type_label }}
        Source: {{ trigger.payload_json.source }}
      data:
        # Includes the vessel image in the notification
        image: "{{ trigger.payload_json.image_url }}"
        # Opens NavisCore when the notification is clicked
        clickAction: "http://192.168.1.125"
        # Grouping and replacement tag
        group: "ais-vessels"
        tag: "ais-new-vessel"
mode: parallel
max: 10

```yaml
alias: "AIS: Hourly Statistics Report"
description: "Sends a summary of the last hour's activity"
trigger:
  - platform: mqtt
    topic: "naviscore/objects_stat_hourly"
action:
  - service: notify.mobile_app_your_phone
    data:
      title: "📊 NavisCore Hourly Report"
      message: >
        Messages: {{ trigger.payload_json.messages_received }}
        Unique Ships: {{ trigger.payload_json.max_vessels }}
        New Ships: {{ trigger.payload_json.new_vessels }}
```
```

## 📄 License & Contributing
Contributions are welcome! Feel free to open issues or submit pull requests.
