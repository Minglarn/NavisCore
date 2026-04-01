# Changelog - NavisCore

All notable changes to the NavisCore project will be documented in this file.

## [2026.04.01] - 2026-04-01

### Added
- **System Backup & Migration**:
  - Full ZIP backup support: Downloads active `naviscore.db` and all vessel images from `data/images/`.
  - Full System Restore: Upload a previously saved ZIP backup to completely restore the system state.
- **Remote Lifecycle Management**:
  - **Restart Backend**: Trigger a safe backend service restart directly from the UI settings.
  - **Reconnecting Overlay**: High-fidelity full-screen overlay with blur and pulse animations during restarts.
  - Automatic reconnection polling to gracefully bring the UI back once the backend is ready.

### Fixed
- **Startup & Dependency Management**:
  - Resolved `NameError: CORSMiddleware` and `NameError: StaticFiles` in `backend/main.py` due to missing imports.
  - Fixed `entrypoint.sh` logic to ensure the entire container restarts when the Python process exits.
- **MQTT Reliability**:
  - Fixed `UnboundLocalError: local variable 'pub_payload' where it is not associated with a value` in the MQTT publishing queue.
  - Improved MQTT per-vessel filtering and deduplication logic.

### Changed
- **UI & UX**:
  - Updated "Database & Images" settings tab to "Database & System".
  - Cleaned up AIS Message Type names and corrected ship type list for better readability and word-wrap.

## [2026.03.27] - 2026-03-27

### Added
- **Safety Messaging (AIS Type 12/14)**:
  - Persistent storage for Safety Related Messages.
  - Notification system with:
    - Bell icon badge for unread alerts.
    - Safety Alert slide-out panel for message history.
    - Real-time "Toast" notifications for incoming safety broadcasts.

### Changed
- **Vessel UI Enhancements**:
  - Added vessel dimensions (Length x Width) to Map HoverCards.
  - Implemented high-precision "LiveTimeAgo" timer updates (every 10s) in the sidebar.

## [2026.03.22] - 2026-03-22

### Added
- **Stats & Reporting**:
  - Enhanced Statistics tab with monthly selection and salary period navigation.
  - Hourly transmission of statistics over MQTT.

### Fixed
- **Map Interaction**:
  - Refined vessel marker click behavior to prevent accidental popup openings.
  - Corrected SAR Aircraft classification for maritime vessels using improved heuristics.
