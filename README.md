# FDR Analysis System

**Flight Data Recorder Visualization — Web-Based Analysis Interface**

A client-side web application for visualizing Flight Data Recorder (FDR) data from Excel exports. Built for military/defence flight operations analysis with a clean, operational dark-theme UI.

![License](https://img.shields.io/badge/license-MIT-green)
![Platform](https://img.shields.io/badge/platform-browser-blue)
![No Server](https://img.shields.io/badge/server-none%20required-brightgreen)

---

## Features

- **Excel Upload** — Drag & drop or browse to load `.xlsx` / `.xls` FDR data files
- **Time-Series Graph** — Interactive Plotly.js chart plotting all flight parameters against relative time codes
- **Progressive Playback** — Play/Pause/Rewind with real-time graph build-up and a sweeping cursor line
- **Sliding Time Window** — Auto-scrolling 2-minute view centered on the playback head during playback
- **Parameter Toggle** — Show/hide individual parameters (Ground Speed, Wind Speed, Altitude, Temperature, etc.)
- **Scaling Controls** — Auto, Normalized (0–1), or Manual Y-axis range; Line/Marker chart modes
- **Live Readout Panel** — Real-time parameter values at the current playback position
- **Chart Export** — Save the visible chart as a high-resolution PNG image
- **Keyboard Shortcuts** — Space (play/pause), Arrow keys (seek), Home/End (jump)

## Supported Data Format

The application parses FDR Excel exports with the following structure:

| Row | Content |
|-----|---------|
| 1 | Metadata (filename, timestamp) |
| 2 | Parameter abbreviations |
| 3 | Parameter full names |
| 4 | Units |
| 5+ | Time-coded data (HH:MM:SS + parameter values) |

**Detected parameters:** Ground Speed (kt), Wind Speed (kt), Wind Direction (deg), Drift Angle (deg), Impact Temp (°C), Static Temp (°C), Selected Course (deg), Desired Track (deg), Radar Altitude (m)

## Quick Start

1. **Download** or clone this repository
2. **Open** `index.html` in any modern browser (Chrome, Edge, Firefox)
3. **Upload** an FDR Excel file via drag & drop or the file picker
4. **Press Play** to watch the flight data build up in real-time

```
No server, no installation, no dependencies to install.
Everything runs locally in the browser.
```

> **Note:** An internet connection is required on first load to pull Plotly.js and SheetJS from CDN.

## Project Structure

```
├── index.html          # Main application page
├── css/
│   └── styles.css      # Military-grade dark theme UI
├── js/
│   └── app.js          # Application logic (parsing, charting, playback)
├── .gitignore
└── README.md
```

## Playback Controls

| Control | Action |
|---------|--------|
| ▶ Play | Start progressive playback — graph builds up from left to right |
| ⏸ Pause | Freeze at current position |
| ⏪ Rewind | Jump back ~2% of the timeline |
| ⏩ Forward | Jump forward ~2% of the timeline |
| ⏮ Start | Jump to beginning |
| ⏭ End | Jump to end and show full chart |
| VIEW ALL | Show the complete timeline at any time |
| Speed | 0.25x to 16x playback speed |

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Space` | Play / Pause |
| `←` | Rewind |
| `→` | Fast Forward |
| `Home` | Go to Start |
| `End` | Go to End |

## Technologies

- [Plotly.js](https://plotly.com/javascript/) — Interactive charting
- [SheetJS (xlsx)](https://sheetjs.com/) — Excel file parsing
- Vanilla HTML/CSS/JavaScript — No frameworks, no build step

## License

MIT
