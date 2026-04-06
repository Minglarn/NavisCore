# NavisCore 📡

![Version](https://img.shields.io/badge/version-2026.03.29-blue)
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
- **Safety-Related Messages (AIS Type 12/14)**: Built-in support for receiving, persisting, and displaying critical maritime safety alerts in a dedicated notification system.
- **Vessel Enrichment**: Automatic vessel image fetching with intelligent caching (30-day persistence) and fallback logic.
- **Advanced Visualization**: Sleek, high-performance map featuring real-time tracking, COG lines, and persistent user settings (zoom, center, layer preferences).
- **Visual Intelligence**: Real-time animations for new vessel discovery and data updates, including a **high-precision live timer** that updates every 10 seconds for sub-minute accuracy.
- **Automated Data Maintenance**: Configurable auto-purge system that cleans up old vessel records and images to maintain peak database performance.
- **🤖 AI Intelligence (Ollama)**: Integrated local AI summaries for new vessels. NavisCore uses **Ollama** to generate natural language descriptions of ships based on real-time AIS data.
- **Global Localization**: Full English translation of backend AI prompt generation, country mappings, and UI elements.

## 🤖 AI Intelligence (Ollama)

NavisCore features a built-in AI enrichment engine that transforms raw AIS data into human-readable summaries.

### 🧠 Local LLM Integration
Experience maritime situational awareness like never before with local Large Language Models.
- **Privacy First**: All AI processing happens locally on your hardware via [Ollama](https://ollama.com).
- **Dynamic Summaries**: Get concise descriptions like *"The Swedish tanker NEPTUNE is heading to Visby. Was last seen today at 14:20."*
- **Optimized Performance**: Pre-configured to use **reasoning-off** and **minified payloads**, providing responses in under 10-15 seconds.

### 📝 Dynamic Prompt Editor
Total control over your AI's personality. Access the editor via **Settings -> AI / Ollama**.
- **Placeholders**: Use any field from the MQTT payload directly in your prompt using `{curly_brackets}`.
- **Rich Variables**: Access over 30+ variables including `{name}`, `{mmsi}`, `{sog}`, `{destination}`, `{last_seen_relative}`, and many more.
- **Live Guide**: Built-in variable guide helps you craft the perfect prompt with one-click insertion.

### 🚀 Recommended Models
For the best balance between speed and quality, we recommend:
1. **gemma4-nothink2:latest** (Fastest & most stable)
2. **gemma4-fast:latest** (Great general performance)
3. **gemma-analytisk:latest** (More detailed analysis)

### 🧪 Live AI Diagnostics
Ensure your AI models and prompts are working flawlessly without waiting for a new vessel to appear.
- **Real-Time Testing**: Click **Test AI Integration** in the settings panel to simulate a vessel event and trigger an instant test run.
- **Live Preview**: Read the exact output your model generates directly in the UI, making prompt engineering seamless and immediate.
- **Built-in Stress Testing**: A dedicated `stress_test_ollama.py` tool allows sequential bulk testing of your model's stability and speed.

## 🧭 UI Visual Indicators

Understanding what happens on the map:

### 💡 Animations & Effects
- **🟡 Yellow Pulsing Ring**: Indicates a **New Vessel**. This appears when a ship is detected for the first time in your database or after a long absence (configurable timeout).
- **🔵 Cyan Radar Ping**: Indicates a **Data Update**. This quick flash happens every time a new AIS message is received for that specific vessel.
- **🚨 Red Pulsing Glow**: Indicates an **Emergency Status**. This vessel is broadcasting an active distress signal or emergency message.

### 🧠 Smart Logic
- **SOG Status Override**: NavisCore automatically overrides misleading navigation statuses. For example, if a ship reports "At anchor" but its Speed Over Ground (SOG) exceeds 1.0 knot, the UI intelligently displays "Under way (SOG > 1kn)".
- **Detailed Metadata**: Vessel HoverCards display enhanced data including dimensions (Length x Width), AIS Channel (A/B), and calculated distance from your station.

### 🎨 Vessel Color Coding
| Color | Vessel Type |
| :--- | :--- |
| **🟢 Green** | Cargo Ships |
| **🔴 Red** | Tankers |
| **🔵 Blue** | Passenger / Ferries |
| **🟠 Orange** | Fishing Vessels |
| **🟡 Yellow** | HSC (High Speed Craft) |
| **🟣 Purple** | Pleasure Craft & Sailing |
| **🔴 Pink-Red** | S.A.R. (Search and Rescue) |
| **🔵 Cyan** | Tugs & Towing |
| **🔵 Light Blue** | Pilot Vessels |
| **⚫ Indigo** | Military & Law Enforcement |
| **⚪ White** | WIG (Wing in Ground) |
| **🟣 Magenta** | Aids to Navigation (Buoys, Lighthouses) |
| **⚪ Light Blue** | Weather / Meteo Stations (Vindstrut icon) |

### 📐 Icon Shapes
- **Triangle/Ship**: Moving vessel (oriented towards its Course Over Ground).
- **Circle**: Stationary vessel.
- **Lighthouse/Buoy**: Aid to Navigation (AtoN).
- **Wind Sock**: Weather or Meteorological station.
- **Aircraft**: Search & Rescue aircraft or helicopters.

### 📡 Signal Propagation Indicators (Tropo)

NavisCore automatically classifies signals based on reception distance to identify unusual atmospheric conditions:

- **📡 ENHANCED RANGE** (Teal Badge): Signals received from **40–80 NM** (74–148 km). This typically indicates *Tropospheric Enhancement*.
- **✨ TROPO DUCTING** (Purple Badge): Signals received from **>100 NM** (>185.2 km). This is a definitive indicator of *Tropospheric Ducting*, where signals travel far beyond the normal line-of-sight.

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
- **UDP Ingest (Remote SDR)**: NavisCore listens on port `10110/udp` for raw NMEA 0183 sentences. This allows you to use an external decoder running on a different machine (e.g., a Raspberry Pi closer to the antenna).
  - **AIS-catcher Example**: If you run `AIS-catcher` on a remote host, you can forward the data to NavisCore using:
    ```bash
    AIS-catcher -u <naviscore_ip> 10110
    ```
  - **Deployment**: In this scenario, you can simply remove or disable the `sdr` service in your `docker-compose.yml` and only run the `app` container.
- **MQTT**: 
  - **Broadcast**: Publishes real-time vessel updates to `naviscore/objects`.
    - **Objects Payload Details**:
      - `mmsi`: Unique vessel identifier (9 digits).
      - `name`: Vessel name (if available).
      - `lat` / `lon`: Current latitude and longitude.
      - `sog` / `cog` / `heading`: Speed over ground, Course over ground, and Heading.
      - `ship_type_label`: Human-readable ship category (e.g., "Cargo", "Tanker").
      - `event_type`: `"new"` for first discovery, `"update"` for positional updates.
      - `source`: Data origin (`"sdr"`, `"aisstream"`, or `"udp"`).
      - `image_url`: Filename of the vessel's image from the local cache.
      - `propagation`: Signal classification based on distance (`"tropo_ducting"`, `"enhanced_range"`, or `"normal"`).
      - `is_nav_aid`: Boolean for markers, buoys, and virtual aids.
  - **Statistics**:
    - **Hourly**: Publishes `naviscore/objects_stat_hourly` every hour with message counts, new/unique vessels, and shiptype distribution.
    - **Daily**: Publishes `naviscore/objects_stat_daily` at midnight with a summary of the full day's activity.
    - **Payload Details**:
      - `messages_received`: Total AIS messages processed during the period.
      - `new_vessels`: Number of vessels seen for the first time in the database.
      - `max_vessels`: Total unique MMSIs observed during the period.
      - `shiptypes`: Dictionary of ship type categories and their counts (e.g., `{"Cargo": 12}`).
      - `max_range_km`: The maximum reception range recorded during the period (Unit: km).
      - `max_range_nm`: The maximum reception range recorded during the period (Unit: Nautical Miles).
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
```

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
        Max Range: {{ trigger.payload_json.max_range_nm }} nm
```

## 📄 License & Contributing
Contributions are welcome! Feel free to open issues or submit pull requests.
