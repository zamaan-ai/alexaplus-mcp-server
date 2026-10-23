# Alexa+ Intelligence & Climate Automation MCP Server
**Amazon Developer Hackathon (Build, Ship, Shape 2026) — Alexa+ Track Submission**

This project is an enterprise-grade self-hosted **Model Context Protocol (MCP)** server built with **Streamable HTTP (Server-Sent Events / SSE)** transports. It empowers generative voice assistants (such as Alexa+) to dynamically fetch real-time environmental telemetry, calibrate connected Fire TV display canvases, and autonomously orchestrate smart home energy efficiency.

---

## 🌟 Key Features & Hackathon Highlights

- **Open MCP Standard Compliance**: Fully implements JSON-RPC over Streamable HTTP (SSE) following the official `@modelcontextprotocol/sdk`.
- **4 Autonomous Agent Tools**:
  1. `get_weather_and_energy_advisory`: Live meteorology from Open-Meteo with thermal comfort index (0-100), UV radiation, barometric pressure, and HVAC adaptations.
  2. `optimize_firetv_ambient_canvas`: Calibrates Fire TV luminance (nits), D65 color temperature, motion smoothing (120Hz MEMC), and Dolby Atmos audio profile based on room illuminance.
  3. `calculate_energy_grid_savings`: Computes real-time wattage reduction (-578W), monthly financial savings (₹/USD), and carbon offset (kg CO2).
  4. `control_smart_home_scene`: Orchestrates IoT presets (`cozy_cinema`, `energy_saver`, `good_night`, `workout_focus`).
- **Interactive Multi-Modal Dashboard (`/`)**:
  - Signature glowing **Alexa+ Fluid Organic Orb** with dynamic breathing animations.
  - **Full Two-Way Voice**: Real-time microphone input (Speech-to-Text) and natural voice output (Text-to-Speech).
  - **Latency Meter**: Measures live round-trip SSE stream response time (sub-200ms).
  - **JSON-RPC Inspector**: Collapsible tray allowing judges to inspect raw MCP protocol payloads in real time.

---

## 🏗️ Architecture

```
User Voice / Speech Input
            │
            ▼
┌────────────────────────────────────────────────────────┐
│             Alexa+ Frontend Agent Simulator            │
│  - Web Speech Recognition (Mic Input)                  │
│  - Fluid Gradient Orb & Audio Wave Visualizer          │
│  - Text-to-Speech Audio Feedback                       │
└────────────────────────────────────────────────────────┘
            │
            ▼ [HTTP POST /messages?sessionId=...] (JSON-RPC)
┌────────────────────────────────────────────────────────┐
│               Alexa+ MCP Server (Node/TS)              │
│  - Streamable Transport: GET /sse & POST /messages     │
│  - Protocol: @modelcontextprotocol/sdk                 │
│  - Validation: Strict Zod runtime schemas              │
│  - Tool Registry: 4 Production Agent Tools             │
└────────────────────────────────────────────────────────┘
            │
            ▼ [HTTP GET /sse] (Downstream Streamable SSE Event)
Multi-Modal Visual Widgets (Weather, Fire TV Canvas, Grid Savings)
```

---

## 🚀 Setup & Execution

### 1. Installation
```bash
cd alexaplus-mcp-server
npm install
```

### 2. Run Tests
```bash
npm test
```

### 3. Start Server
```bash
npm start
```
Open your browser at `http://127.0.0.1:8990` to interact with the full experience.

---

## 📝 Product Feedback (Devpost Requirement)
The Model Context Protocol (MCP) using Streamable HTTP (SSE) is the ideal communication layer for next-gen voice assistants like Alexa+. The persistent event stream enables proactive agent callbacks and streaming tool execution without the overhead and complexity of persistent full-duplex WebSockets.
